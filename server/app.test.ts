import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { crearApp } from "./app.ts";
import { root, recommendation, type Goal } from "../src/logic.ts";
import { sessions } from "../src/data.ts";

const DOC = "docente-token-1234567890";
const INV = "investigador-token-1234567890";
let base = "";
let close = () => {};
before(async () => {
  const { server } = crearApp({ dbFile: ":memory:", docenteToken: DOC, investigadorToken: INV, limiteIntentos: 1000 });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(() => close());

const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: () => JSON.parse(text) };
};
function build(g: Goal): Goal {
  const a = recommendation(g)!;
  g.rule = a.name.split(" · ")[0];
  g.children = a.goals.map((x, i) => ({ ...x, id: i + 1 }));
  g.children.forEach(build);
  return g;
}
async function nuevoEstudiante(grupo: "experimental" | "control", consentir = true) {
  const { json } = await call("POST", "/api/codigos", { cantidad: 1, grupo }, DOC);
  const codigo = json().codigos[0] as string;
  const s = (await call("POST", "/api/sesion", { codigo })).json();
  if (consentir) await call("POST", "/api/consentimiento", {}, s.token);
  return { codigo, token: s.token as string };
}

test("rutas de docente e investigador exigen su token", async () => {
  assert.equal((await call("POST", "/api/codigos", { cantidad: 1, grupo: "control" })).status, 401);
  assert.equal((await call("POST", "/api/codigos", { cantidad: 1, grupo: "control" }, INV)).status, 401);
  assert.equal((await call("GET", "/api/export/respuestas.csv", undefined, DOC)).status, 401);
  assert.equal((await call("GET", "/api/estudiantes")).status, 401);
});
test("códigos desconocidos no inician sesión", async () => {
  assert.equal((await call("POST", "/api/sesion", { codigo: "LQ-NOPE-NOPE" })).status, 404);
});
test("sin consentimiento no se guarda nada", async () => {
  const e = await nuevoEstudiante("experimental", false);
  const r = await call("PUT", "/api/reflexion", { sesion: 1, texto: "hola" }, e.token);
  assert.equal(r.status, 403);
});
test("progreso solo se acepta con una prueba completa y válida del nivel correcto", async () => {
  const e = await nuevoEstudiante("experimental");
  const nivel = sessions[0].levels[1];
  const buena = build(root(nivel));
  assert.equal((await call("PUT", "/api/progreso", { sesion: 1, nivel: 2, arbol: buena }, e.token)).status, 200);
  assert.equal((await call("PUT", "/api/progreso", { sesion: 1, nivel: 3, arbol: buena }, e.token)).status, 422);
  const abierta = root(nivel);
  assert.equal((await call("PUT", "/api/progreso", { sesion: 1, nivel: 2, arbol: abierta }, e.token)).status, 422);
  const falsa = build(root(nivel));
  falsa.children![0].f = { op: "Z" };
  assert.equal((await call("PUT", "/api/progreso", { sesion: 1, nivel: 2, arbol: falsa }, e.token)).status, 422);
  assert.equal((await call("PUT", "/api/progreso", { sesion: 1, nivel: 2, arbol: { f: 1 } }, e.token)).status, 400);
  const reg = (await call("GET", "/api/mi-registro", undefined, e.token)).json();
  assert.deepEqual(reg.progreso, ["1-2"]);
});
test("respuestas: validación, SUS solo experimental, reemplazo", async () => {
  const exp = await nuevoEstudiante("experimental");
  const ctl = await nuevoEstudiante("control");
  const sus = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
  const r = await call("PUT", "/api/respuestas", { instrumento: "SUS", momento: "final", valores: sus }, exp.token);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json().medidas, [["puntaje_sus", 100]]);
  assert.equal((await call("PUT", "/api/respuestas", { instrumento: "SUS", momento: "final", valores: sus }, ctl.token)).status, 403);
  assert.equal((await call("PUT", "/api/respuestas", { instrumento: "IMI", momento: "inicial", valores: [1, 2, 3] }, ctl.token)).status, 400);
  assert.equal((await call("PUT", "/api/respuestas", { instrumento: "IMI", momento: "inicial", valores: [1, 2, 3, 4, 5, 6, 7, 8] }, ctl.token)).status, 400);
  await call("PUT", "/api/respuestas", { instrumento: "IMI", momento: "inicial", valores: [7, 7, 7, 7, 7, 7, 7, 7] }, ctl.token);
  await call("PUT", "/api/respuestas", { instrumento: "IMI", momento: "inicial", valores: [1, 1, 1, 1, 1, 1, 1, 1] }, ctl.token);
  const reg = (await call("GET", "/api/mi-registro", undefined, ctl.token)).json();
  assert.deepEqual(reg.respuestas, [{ instrumento: "IMI", momento: "inicial", valores: [1, 1, 1, 1, 1, 1, 1, 1] }]);
});
test("exportaciones del investigador incluyen grupo y respetan el retiro", async () => {
  const e = await nuevoEstudiante("control");
  await call("PUT", "/api/respuestas", { instrumento: "Compromiso", momento: "final", valores: [5, 5, 3, 3, 1, 1] }, e.token);
  await call("PUT", "/api/reflexion", { sesion: 2, texto: 'Aprendí "→I"' }, e.token);
  const resp = (await call("GET", "/api/export/respuestas.csv", undefined, INV)).text;
  assert.match(resp, /codigo,grupo,instrumento,momento,item,valor/);
  assert.ok(resp.includes(`"${e.codigo}","control","Compromiso","final",1,5`));
  assert.ok((await call("GET", "/api/export/resumen.csv", undefined, INV)).text.includes(`"${e.codigo}","control","Compromiso","final","media_conductual",5`));
  assert.ok((await call("GET", "/api/export/reflexiones.csv", undefined, INV)).text.includes('"Aprendí ""→I"""'));
  assert.equal((await call("DELETE", "/api/mi-registro", undefined, e.token)).status, 200);
  assert.ok(!(await call("GET", "/api/export/respuestas.csv", undefined, INV)).text.includes(e.codigo));
  assert.equal((await call("POST", "/api/sesion", { codigo: e.codigo })).status, 403);
  assert.equal((await call("GET", "/api/mi-registro", undefined, e.token)).status, 401);
});
test("panel docente no expone respuestas y calcula la sesión actual", async () => {
  const e = await nuevoEstudiante("experimental");
  await call("PUT", "/api/progreso", { sesion: 1, nivel: 1, arbol: build(root(sessions[0].levels[0])) }, e.token);
  const r = (await call("GET", "/api/estudiantes", undefined, DOC)).json();
  const fila = r.estudiantes.find((x: any) => x.codigo === e.codigo);
  assert.equal(fila.nivelesResueltos, 1);
  assert.equal(fila.sesionActual, 1);
  assert.equal(r.total, 27);
  assert.ok(!("respuestas" in fila));
});
test("borrador del taller se guarda y se recupera", async () => {
  const e = await nuevoEstudiante("experimental");
  const arbol = root(sessions[1].levels[0]);
  const body = { sesion: 2, nivel: 1, arbol, seleccion: 0, historial: [], ultimoPaso: "Todavía no has aplicado ninguna regla." };
  assert.equal((await call("PUT", "/api/taller", body, e.token)).status, 200);
  assert.equal((await call("GET", "/api/mi-registro", undefined, e.token)).json().taller.sesion, 2);
  assert.equal((await call("PUT", "/api/taller", { ...body, historial: "x" }, e.token)).status, 400);
});
test("límite de intentos de inicio de sesión", async () => {
  const { server } = crearApp({ dbFile: ":memory:", docenteToken: DOC, investigadorToken: INV, limiteIntentos: 3 });
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sesion`;
  let ultimo = 0;
  for (let i = 0; i < 5; i++) ultimo = (await fetch(url, { method: "POST", body: JSON.stringify({ codigo: "LQ-XXXX-XXXX" }) })).status;
  server.close();
  assert.equal(ultimo, 429);
});

test("prueba de desempeño: un intento por momento, posprueba después de la preprueba, calificada en el servidor", async () => {
  const { formas } = await import("../src/prueba.ts");
  const e = await nuevoEstudiante("control");
  const cuerpo = (momento: string, respuestas: (number | null)[]) => ({
    momento,
    respuestas,
    tiempos: Array(9).fill(1500),
    inicio: new Date(Date.now() - 60_000).toISOString(),
    fin: new Date().toISOString(),
  });
  const claveB = formas.B.map((x) => x.correcta);
  assert.equal((await call("PUT", "/api/prueba", cuerpo("final", claveB), e.token)).status, 409);
  assert.equal((await call("PUT", "/api/prueba", cuerpo("inicial", [9, ...Array(8).fill(0)]), e.token)).status, 400);
  assert.equal((await call("PUT", "/api/prueba", { ...cuerpo("inicial", Array(9).fill(0)), tiempos: [1] }, e.token)).status, 400);
  const pre = [formas.A[0].correcta, null, ...Array(7).fill(0)];
  assert.equal((await call("PUT", "/api/prueba", cuerpo("inicial", pre), e.token)).status, 200);
  assert.equal((await call("PUT", "/api/prueba", cuerpo("inicial", pre), e.token)).status, 409);
  assert.equal((await call("PUT", "/api/prueba", cuerpo("final", claveB), e.token)).status, 200);

  const reg = (await call("GET", "/api/mi-registro", undefined, e.token)).json();
  assert.equal(reg.pruebas.length, 2);
  assert.equal(reg.pruebas.find((p: any) => p.momento === "inicial").respuestas[1], null);

  const csv = (await call("GET", "/api/export/rendimiento.csv", undefined, INV)).text;
  const filas = csv.split("\r\n").filter((l) => l.includes(e.codigo));
  assert.equal(filas.length, 18);
  assert.ok(filas.some((l) => l.includes('"final","B",1,"regla"')));
  const resumen = (await call("GET", "/api/export/resumen.csv", undefined, INV)).text;
  assert.ok(resumen.includes(`"${e.codigo}","control","Prueba","final","puntaje",100`));

  const docente = (await call("GET", "/api/estudiantes", undefined, DOC)).json();
  const fila = docente.estudiantes.find((x: any) => x.codigo === e.codigo);
  assert.equal(fila.preprueba && fila.posprueba, true);

  await call("DELETE", "/api/mi-registro", undefined, e.token);
  assert.ok(!(await call("GET", "/api/export/rendimiento.csv", undefined, INV)).text.includes(e.codigo));
});
