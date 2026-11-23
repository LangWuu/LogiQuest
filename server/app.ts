import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomInt, createHash, timingSafeEqual } from "node:crypto";
import { root, verifyProof, closed, fmt, type Goal } from "../src/logic.ts";
import { sessions, medidas, medidasPrueba, toCSV } from "../src/data.ts";
import { calificar, formaDe, formas, N_ITEMS, type Momento } from "../src/prueba.ts";

export type Config = {
  dbFile: string;
  docenteToken: string;
  investigadorToken: string;
  corsOrigin?: string;
  trustProxy?: boolean;
  limiteIntentos?: number;
};
type Req = http.IncomingMessage;
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const INSTRUMENTOS: Record<string, { n: number; max: number; momentos: string[]; soloExperimental?: boolean }> = {
  IMI: { n: 8, max: 7, momentos: ["inicial", "final"] },
  Compromiso: { n: 6, max: 5, momentos: ["final"] },
  SUS: { n: 10, max: 5, momentos: ["final"], soloExperimental: true },
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const igual = (a: string, b: string) => !!a && !!b && timingSafeEqual(Buffer.from(sha(a)), Buffer.from(sha(b)));
const ahora = () => new Date().toISOString();
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const bloque = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");

// --- validación estructural de lo que llega del cliente ---
function esF(f: any, d = 0): boolean {
  if (!f || typeof f !== "object" || typeof f.op !== "string" || f.op.length > 8 || d > 40) return false;
  return (f.a === undefined || esF(f.a, d + 1)) && (f.b === undefined || esF(f.b, d + 1));
}
function esGoal(g: any, budget = { n: 400 }, d = 0): boolean {
  if (!g || typeof g !== "object" || d > 60 || --budget.n < 0) return false;
  if (!esF(g.f) || !Array.isArray(g.hs) || g.hs.length > 30 || !g.hs.every((h: any) => esF(h))) return false;
  if (g.rule !== undefined && (typeof g.rule !== "string" || g.rule.length > 20)) return false;
  if (g.children !== undefined && (!Array.isArray(g.children) || g.children.length > 3)) return false;
  return (g.children || []).every((c: any) => esGoal(c, budget, d + 1));
}
const entero = (x: any, min: number, max: number) => Number.isInteger(x) && x >= min && x <= max;

export function crearApp(cfg: Config) {
  const db = new DatabaseSync(cfg.dbFile);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS codigos (codigo TEXT PRIMARY KEY, grupo TEXT NOT NULL CHECK (grupo IN ('experimental','control')), creado TEXT NOT NULL, retirado INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS estudiantes (codigo TEXT PRIMARY KEY REFERENCES codigos(codigo), consentimiento TEXT, ultimo_acceso TEXT);
    CREATE TABLE IF NOT EXISTS sesiones (token_hash TEXT PRIMARY KEY, codigo TEXT NOT NULL REFERENCES codigos(codigo), creado TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS progreso (codigo TEXT NOT NULL REFERENCES codigos(codigo), sesion INTEGER NOT NULL, nivel INTEGER NOT NULL, fecha TEXT NOT NULL, PRIMARY KEY (codigo, sesion, nivel));
    CREATE TABLE IF NOT EXISTS respuestas (codigo TEXT NOT NULL REFERENCES codigos(codigo), instrumento TEXT NOT NULL, momento TEXT NOT NULL, item INTEGER NOT NULL, valor INTEGER NOT NULL, fecha TEXT NOT NULL, PRIMARY KEY (codigo, instrumento, momento, item));
    CREATE TABLE IF NOT EXISTS reflexiones (codigo TEXT NOT NULL REFERENCES codigos(codigo), sesion INTEGER NOT NULL, texto TEXT NOT NULL, fecha TEXT NOT NULL, PRIMARY KEY (codigo, sesion));
    CREATE TABLE IF NOT EXISTS pruebas (codigo TEXT NOT NULL REFERENCES codigos(codigo), momento TEXT NOT NULL CHECK (momento IN ('inicial','final')), item INTEGER NOT NULL, respuesta INTEGER, correcta INTEGER NOT NULL, tiempo_ms INTEGER NOT NULL, inicio TEXT NOT NULL, fin TEXT NOT NULL, PRIMARY KEY (codigo, momento, item));
    CREATE TABLE IF NOT EXISTS taller (codigo TEXT PRIMARY KEY REFERENCES codigos(codigo), datos TEXT NOT NULL, fecha TEXT NOT NULL);
  `);
  const q = (sql: string) => db.prepare(sql);
  const tx = (fn: () => void) => {
    db.exec("BEGIN");
    try {
      fn();
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const intentos = new Map<string, number[]>();

  function ipDe(req: Req) {
    const xf = cfg.trustProxy ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "";
    return xf || req.socket.remoteAddress || "?";
  }
  function limitar(ip: string) {
    const t = Date.now(),
      v = (intentos.get(ip) || []).filter((x) => t - x < 60_000);
    v.push(t);
    intentos.set(ip, v);
    if (v.length > (cfg.limiteIntentos ?? 10)) throw new HttpError(429, "Demasiados intentos. Espera un minuto.");
  }
  async function cuerpo(req: Req): Promise<any> {
    const partes: Buffer[] = [];
    let n = 0;
    for await (const c of req) {
      n += c.length;
      if (n > 512 * 1024) throw new HttpError(413, "Solicitud demasiado grande.");
      partes.push(c);
    }
    if (!n) return {};
    try {
      return JSON.parse(Buffer.concat(partes).toString("utf8"));
    } catch {
      throw new HttpError(400, "JSON inválido.");
    }
  }
  const token = (req: Req) => (String(req.headers.authorization || "").startsWith("Bearer ") ? String(req.headers.authorization).slice(7) : "");
  function estudiante(req: Req, exigirConsentimiento = true) {
    const t = token(req);
    const s = t ? (q("SELECT codigo FROM sesiones WHERE token_hash=?").get(sha(t)) as any) : undefined;
    if (!s) throw new HttpError(401, "Sesión no válida.");
    const c = q("SELECT c.codigo, c.grupo, c.retirado, e.consentimiento FROM codigos c LEFT JOIN estudiantes e USING (codigo) WHERE c.codigo=?").get(s.codigo) as any;
    if (!c || c.retirado) throw new HttpError(401, "Sesión no válida.");
    if (exigirConsentimiento && !c.consentimiento) throw new HttpError(403, "Falta el consentimiento informado.");
    q("UPDATE estudiantes SET ultimo_acceso=? WHERE codigo=?").run(ahora(), c.codigo);
    return c as { codigo: string; grupo: string; consentimiento: string };
  }
  function admin(req: Req, rol: "docente" | "investigador") {
    const esperado = rol === "docente" ? cfg.docenteToken : cfg.investigadorToken;
    if (!igual(token(req), esperado)) throw new HttpError(401, "No autorizado.");
  }
  const sesionActual = (codigo: string, taller?: any) => {
    if (taller?.sesion) return taller.sesion as number;
    const hechos = new Set((q("SELECT sesion, nivel FROM progreso WHERE codigo=?").all(codigo) as any[]).map((p) => `${p.sesion}-${p.nivel}`));
    const i = sessions.findIndex((s, a) => s.levels.some((_, b) => !hechos.has(`${a + 1}-${b + 1}`)));
    return i < 0 ? 7 : i + 1;
  };
  function pruebasDe(codigo: string) {
    type P = { momento: Momento; respuestas: (number | null)[]; tiempos: number[]; inicio: string; fin: string };
    const g = new Map<string, P>();
    for (const r of q("SELECT momento, item, respuesta, tiempo_ms, inicio, fin FROM pruebas WHERE codigo=? ORDER BY momento, item").all(codigo) as any[]) {
      const p: P = g.get(r.momento) || { momento: r.momento, respuestas: [], tiempos: [], inicio: r.inicio, fin: r.fin };
      p.respuestas.push(r.respuesta);
      p.tiempos.push(r.tiempo_ms);
      g.set(r.momento, p);
    }
    return [...g.values()];
  }
  function registro(c: { codigo: string; grupo: string; consentimiento: string }) {
    const t = q("SELECT datos FROM taller WHERE codigo=?").get(c.codigo) as any;
    const resp = new Map<string, number[]>();
    for (const r of q("SELECT instrumento, momento, item, valor FROM respuestas WHERE codigo=? ORDER BY item").all(c.codigo) as any[]) {
      const k = r.instrumento + "|" + r.momento;
      resp.set(k, [...(resp.get(k) || []), r.valor]);
    }
    return {
      codigo: c.codigo,
      grupo: c.grupo,
      consentimiento: c.consentimiento,
      progreso: (q("SELECT sesion, nivel FROM progreso WHERE codigo=?").all(c.codigo) as any[]).map((p) => `${p.sesion}-${p.nivel}`),
      respuestas: [...resp].map(([k, valores]) => ({ instrumento: k.split("|")[0], momento: k.split("|")[1], valores })),
      reflexiones: q("SELECT sesion, texto FROM reflexiones WHERE codigo=?").all(c.codigo),
      taller: t ? JSON.parse(t.datos) : undefined,
      pruebas: pruebasDe(c.codigo),
    };
  }

  async function ruta(req: Req, url: URL): Promise<{ status?: number; json?: unknown; csv?: string; nombre?: string }> {
    const m = req.method || "GET",
      p = url.pathname;
    // --- estudiante ---
    if (m === "POST" && p === "/api/sesion") {
      limitar(ipDe(req));
      const b = await cuerpo(req);
      const codigo = String(b.codigo || "").trim().toUpperCase();
      const c = q("SELECT codigo, grupo, retirado FROM codigos WHERE codigo=?").get(codigo) as any;
      if (!c) throw new HttpError(404, "Código no válido.");
      if (c.retirado) throw new HttpError(403, "Este código fue retirado del estudio.");
      const t = randomBytes(24).toString("base64url");
      q("DELETE FROM sesiones WHERE creado < ?").run(new Date(Date.now() - 30 * 864e5).toISOString());
      q("INSERT INTO sesiones VALUES (?,?,?)").run(sha(t), codigo, ahora());
      q("INSERT OR IGNORE INTO estudiantes (codigo, ultimo_acceso) VALUES (?,?)").run(codigo, ahora());
      const e = q("SELECT consentimiento FROM estudiantes WHERE codigo=?").get(codigo) as any;
      return { json: { token: t, codigo, grupo: c.grupo, consentimiento: !!e?.consentimiento } };
    }
    if (m === "POST" && p === "/api/consentimiento") {
      const c = estudiante(req, false);
      q("UPDATE estudiantes SET consentimiento=COALESCE(consentimiento,?) WHERE codigo=?").run(ahora(), c.codigo);
      return { json: { ok: true } };
    }
    if (m === "GET" && p === "/api/mi-registro") return { json: registro(estudiante(req, false)) };
    if (m === "DELETE" && p === "/api/mi-registro") {
      const c = estudiante(req, false);
      tx(() => {
        for (const t of ["progreso", "respuestas", "pruebas", "reflexiones", "taller", "sesiones", "estudiantes"]) q(`DELETE FROM ${t} WHERE codigo=?`).run(c.codigo);
        q("UPDATE codigos SET retirado=1 WHERE codigo=?").run(c.codigo);
      });
      return { json: { ok: true } };
    }
    if (m === "PUT" && p === "/api/progreso") {
      const c = estudiante(req),
        b = await cuerpo(req);
      if (!entero(b.sesion, 1, sessions.length) || !entero(b.nivel, 1, sessions[b.sesion - 1].levels.length)) throw new HttpError(400, "Sesión o nivel inválidos.");
      if (!esGoal(b.arbol)) throw new HttpError(400, "Árbol de prueba inválido.");
      const esperado = root(sessions[b.sesion - 1].levels[b.nivel - 1]);
      const mismo = fmt(b.arbol.f) === fmt(esperado.f) && b.arbol.hs.length === esperado.hs.length && b.arbol.hs.every((h: any, i: number) => fmt(h) === fmt(esperado.hs[i]));
      if (!mismo) throw new HttpError(422, "La prueba no corresponde a este nivel.");
      if (!closed(b.arbol as Goal) || !verifyProof(b.arbol as Goal)) throw new HttpError(422, "La prueba no es válida o está incompleta.");
      q("INSERT OR IGNORE INTO progreso VALUES (?,?,?,?)").run(c.codigo, b.sesion, b.nivel, ahora());
      return { json: { ok: true } };
    }
    if (m === "PUT" && p === "/api/respuestas") {
      const c = estudiante(req),
        b = await cuerpo(req),
        spec = INSTRUMENTOS[b.instrumento];
      if (!spec || !spec.momentos.includes(b.momento)) throw new HttpError(400, "Instrumento o momento inválidos.");
      if (spec.soloExperimental && c.grupo !== "experimental") throw new HttpError(403, "Este cuestionario es solo para el grupo experimental.");
      if (!Array.isArray(b.valores) || b.valores.length !== spec.n || !b.valores.every((v: any) => entero(v, 1, spec.max))) throw new HttpError(400, "Valores inválidos.");
      tx(() => {
        q("DELETE FROM respuestas WHERE codigo=? AND instrumento=? AND momento=?").run(c.codigo, b.instrumento, b.momento);
        b.valores.forEach((v: number, i: number) => q("INSERT INTO respuestas VALUES (?,?,?,?,?,?)").run(c.codigo, b.instrumento, b.momento, i + 1, v, ahora()));
      });
      return { json: { ok: true, medidas: medidas(b.instrumento, b.valores) } };
    }
    if (m === "PUT" && p === "/api/prueba") {
      const c = estudiante(req),
        b = await cuerpo(req);
      const fecha = (x: any) => typeof x === "string" && x.length <= 40 && !Number.isNaN(Date.parse(x));
      if (!["inicial", "final"].includes(b.momento)) throw new HttpError(400, "Momento inválido.");
      const items = formas[formaDe[b.momento as Momento]];
      if (!Array.isArray(b.respuestas) || b.respuestas.length !== N_ITEMS || !b.respuestas.every((r: any, i: number) => r === null || entero(r, 0, items[i].opciones.length - 1)))
        throw new HttpError(400, "Respuestas inválidas.");
      if (!Array.isArray(b.tiempos) || b.tiempos.length !== N_ITEMS || !b.tiempos.every((t: any) => entero(t, 0, 4 * 3600_000)) || !fecha(b.inicio) || !fecha(b.fin))
        throw new HttpError(400, "Tiempos inválidos.");
      if (b.momento === "final" && !q("SELECT 1 FROM pruebas WHERE codigo=? AND momento='inicial'").get(c.codigo)) throw new HttpError(409, "Primero debe presentarse la preprueba.");
      if (q("SELECT 1 FROM pruebas WHERE codigo=? AND momento=?").get(c.codigo, b.momento)) throw new HttpError(409, "Esta prueba ya fue enviada.");
      const cal = calificar(b.momento, b.respuestas);
      tx(() => b.respuestas.forEach((r: number | null, i: number) => q("INSERT INTO pruebas VALUES (?,?,?,?,?,?,?,?)").run(c.codigo, b.momento, i + 1, r, cal.correctas[i] ? 1 : 0, b.tiempos[i], b.inicio, b.fin)));
      return { json: { ok: true } };
    }
    if (m === "PUT" && p === "/api/reflexion") {
      const c = estudiante(req),
        b = await cuerpo(req);
      if (!entero(b.sesion, 1, sessions.length) || typeof b.texto !== "string" || !b.texto.trim() || b.texto.length > 2000) throw new HttpError(400, "Reflexión inválida.");
      q("INSERT OR REPLACE INTO reflexiones VALUES (?,?,?,?)").run(c.codigo, b.sesion, b.texto, ahora());
      return { json: { ok: true } };
    }
    if (m === "PUT" && p === "/api/taller") {
      const c = estudiante(req),
        b = await cuerpo(req);
      if (!entero(b.sesion, 1, sessions.length) || !entero(b.nivel, 1, 4) || !esGoal(b.arbol) || !Array.isArray(b.historial) || b.historial.length > 100 || !b.historial.every((h: any) => esGoal(h)) || typeof b.ultimoPaso !== "string" || !entero(b.seleccion, 0, 10_000))
        throw new HttpError(400, "Borrador inválido.");
      const datos = JSON.stringify({ sesion: b.sesion, nivel: b.nivel, arbol: b.arbol, seleccion: b.seleccion, historial: b.historial, ultimoPaso: b.ultimoPaso.slice(0, 500) });
      q("INSERT OR REPLACE INTO taller VALUES (?,?,?)").run(c.codigo, datos, ahora());
      return { json: { ok: true } };
    }
    // --- docente ---
    if (m === "POST" && p === "/api/codigos") {
      admin(req, "docente");
      const b = await cuerpo(req);
      if (!entero(b.cantidad, 1, 200) || !["experimental", "control"].includes(b.grupo)) throw new HttpError(400, "Cantidad (1-200) y grupo requeridos.");
      const nuevos: string[] = [];
      tx(() => {
        while (nuevos.length < b.cantidad) {
          const c = `LQ-${bloque()}-${bloque()}`;
          if (q("SELECT 1 FROM codigos WHERE codigo=?").get(c)) continue;
          q("INSERT INTO codigos (codigo, grupo, creado) VALUES (?,?,?)").run(c, b.grupo, ahora());
          nuevos.push(c);
        }
      });
      return { status: 201, json: { grupo: b.grupo, codigos: nuevos } };
    }
    if (m === "GET" && p === "/api/estudiantes") {
      admin(req, "docente");
      const filas = (q("SELECT c.codigo, c.grupo, e.consentimiento, e.ultimo_acceso FROM codigos c LEFT JOIN estudiantes e USING (codigo) WHERE c.retirado=0 ORDER BY c.codigo").all() as any[]).map((r) => {
        const t = q("SELECT datos FROM taller WHERE codigo=?").get(r.codigo) as any;
        return {
          codigo: r.codigo,
          grupo: r.grupo,
          consentimiento: !!r.consentimiento,
          sesionActual: sesionActual(r.codigo, t ? JSON.parse(t.datos) : undefined),
          nivelesResueltos: (q("SELECT COUNT(*) n FROM progreso WHERE codigo=?").get(r.codigo) as any).n,
          preprueba: !!q("SELECT 1 FROM pruebas WHERE codigo=? AND momento='inicial'").get(r.codigo),
          posprueba: !!q("SELECT 1 FROM pruebas WHERE codigo=? AND momento='final'").get(r.codigo),
          ultimoAcceso: r.ultimo_acceso,
        };
      });
      return { json: { total: sessions.reduce((n, s) => n + s.levels.length, 0), estudiantes: filas } };
    }
    // --- investigador ---
    const ex = /^\/api\/export\/(respuestas|resumen|progreso|reflexiones|rendimiento)\.csv$/.exec(p);
    if (m === "GET" && ex) {
      admin(req, "investigador");
      const val = "WHERE c.retirado=0 AND e.consentimiento IS NOT NULL";
      const tabla = ex[1];
      if (tabla === "respuestas")
        return { csv: toCSV(["codigo", "grupo", "instrumento", "momento", "item", "valor"], (q(`SELECT r.codigo, c.grupo, r.instrumento, r.momento, r.item, r.valor FROM respuestas r JOIN codigos c USING (codigo) JOIN estudiantes e USING (codigo) ${val} ORDER BY 1,3,4,5`).all() as any[]).map((r) => [r.codigo, r.grupo, r.instrumento, r.momento, r.item, r.valor])), nombre: "respuestas.csv" };
      if (tabla === "resumen") {
        const filas: (string | number)[][] = [];
        const g = new Map<string, any>();
        for (const r of q(`SELECT r.codigo, c.grupo, r.instrumento, r.momento, r.valor FROM respuestas r JOIN codigos c USING (codigo) JOIN estudiantes e USING (codigo) ${val} ORDER BY r.codigo, r.instrumento, r.momento, r.item`).all() as any[]) {
          const k = [r.codigo, r.grupo, r.instrumento, r.momento].join("|");
          g.set(k, { ...(g.get(k) || { k: [r.codigo, r.grupo, r.instrumento, r.momento], v: [] }), v: [...(g.get(k)?.v || []), r.valor] });
        }
        for (const { k, v } of g.values()) for (const [medida, valor] of medidas(k[2], v)) filas.push([...k, medida, valor]);
        for (const r of q(`SELECT DISTINCT x.codigo, c.grupo FROM pruebas x JOIN codigos c USING (codigo) JOIN estudiantes e USING (codigo) ${val} ORDER BY 1`).all() as any[])
          for (const pr of pruebasDe(r.codigo)) for (const [medida, valor] of medidasPrueba(pr.momento, pr.respuestas, pr.tiempos)) filas.push([r.codigo, r.grupo, "Prueba", pr.momento, medida, valor]);
        return { csv: toCSV(["codigo", "grupo", "instrumento", "momento", "medida", "valor"], filas), nombre: "resumen.csv" };
      }
      if (tabla === "rendimiento")
        return {
          csv: toCSV(
            ["codigo", "grupo", "momento", "forma", "item", "tipo", "respuesta", "correcta", "tiempo_ms", "inicio", "fin"],
            (q(`SELECT x.*, c.grupo FROM pruebas x JOIN codigos c USING (codigo) JOIN estudiantes e USING (codigo) ${val} ORDER BY x.codigo, x.momento DESC, x.item`).all() as any[]).map((r) => [
              r.codigo, r.grupo, r.momento, formaDe[r.momento as Momento], r.item, formas[formaDe[r.momento as Momento]][r.item - 1].tipo,
              r.respuesta === null ? "" : String.fromCharCode(97 + r.respuesta), r.correcta, r.tiempo_ms, r.inicio, r.fin,
            ]),
          ),
          nombre: "rendimiento.csv",
        };
      if (tabla === "progreso")
        return { csv: toCSV(["codigo", "grupo", "sesion", "nivel", "fecha"], (q(`SELECT p.codigo, c.grupo, p.sesion, p.nivel, p.fecha FROM progreso p JOIN codigos c USING (codigo) JOIN estudiantes e USING (codigo) ${val} ORDER BY 1,3,4`).all() as any[]).map((r) => [r.codigo, r.grupo, r.sesion, r.nivel, r.fecha])), nombre: "progreso.csv" };
      return { csv: toCSV(["codigo", "grupo", "sesion", "texto"], (q(`SELECT x.codigo, c.grupo, x.sesion, x.texto FROM reflexiones x JOIN codigos c USING (codigo) JOIN estudiantes e USING (codigo) ${val} ORDER BY 1,3`).all() as any[]).map((r) => [r.codigo, r.grupo, r.sesion, r.texto])), nombre: "reflexiones.csv" };
    }
    if (m === "GET" && p === "/api/salud") return { json: { ok: true } };
    throw new HttpError(404, "No encontrado.");
  }

  const server = http.createServer(async (req, res) => {
    const origen = String(req.headers.origin || "");
    const cabeceras: Record<string, string> = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
    if (cfg.corsOrigin && origen === cfg.corsOrigin) {
      Object.assign(cabeceras, { "Access-Control-Allow-Origin": origen, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", Vary: "Origin" });
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, cabeceras).end();
      return;
    }
    try {
      const r = await ruta(req, new URL(req.url || "/", "http://x"));
      if (r.csv !== undefined) res.writeHead(200, { ...cabeceras, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${r.nombre}"` }).end(r.csv);
      else res.writeHead(r.status || 200, { ...cabeceras, "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(r.json));
    } catch (e) {
      const s = e instanceof HttpError ? e.status : 500;
      if (s === 500) console.error(e);
      res.writeHead(s, { ...cabeceras, "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: e instanceof HttpError ? e.message : "Error interno." }));
    }
  });
  return { server, db };
}
