import type { Goal } from "./logic.ts";
import { calificar, formaDe, formas, type Momento } from "./prueba.ts";
export type TallerGuardado = {
  sesion: number;
  nivel: number;
  arbol: Goal;
  seleccion: number;
  historial: Goal[];
  ultimoPaso: string;
};
export type RecordData = {
  codigo: string;
  consentimiento: string;
  progreso: string[];
  respuestas: { instrumento: string; momento: string; valores: number[] }[];
  reflexiones: { sesion: number; texto: string }[];
  ultimoAcceso: string;
  taller?: TallerGuardado;
  borradores?: { instrumento: string; momento: string; valores: Record<number, number> }[];
  pruebas?: PruebaGuardada[];
  pruebaBorrador?: PruebaBorrador;
};
export type PruebaGuardada = {
  momento: Momento;
  respuestas: (number | null)[];
  tiempos: number[]; // milisegundos por ítem
  inicio: string;
  fin: string;
};
export type PruebaBorrador = { momento: Momento; respuestas: (number | null)[]; tiempos: number[]; inicio: string; actual: number };
const key = "logiquest-datos";
export function listarEstudiantes(): RecordData[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function update(codigo: string, fn: (r: RecordData) => void) {
  const all = listarEstudiantes();
  let r = all.find((r) => r.codigo === codigo);
  if (!r) {
    r = {
      codigo,
      consentimiento: "",
      progreso: [],
      respuestas: [],
      reflexiones: [],
      ultimoAcceso: new Date().toISOString(),
    };
    all.push(r);
  }
  fn(r);
  r.ultimoAcceso = new Date().toISOString();
  localStorage.setItem(key, JSON.stringify(all));
}
export function guardarConsentimiento(codigo: string) {
  update(codigo, (r) => {
    r.consentimiento = new Date().toISOString();
  });
}
export function guardarProgreso(codigo: string, sesion: number, nivel: number) {
  update(codigo, (r) => {
    if (!r.progreso.includes(`${sesion}-${nivel}`)) r.progreso.push(`${sesion}-${nivel}`);
  });
}
export function guardarRespuestas(
  codigo: string,
  instrumento: string,
  momento: string,
  valores: number[],
) {
  update(codigo, (r) => {
    r.borradores = r.borradores?.filter(
      (x) => x.instrumento !== instrumento || x.momento !== momento,
    );
    r.respuestas = r.respuestas.filter(
      (x) => x.instrumento !== instrumento || x.momento !== momento,
    );
    r.respuestas.push({ instrumento, momento, valores });
  });
}
export function guardarTaller(codigo: string, taller: TallerGuardado) {
  update(codigo, (r) => {
    r.taller = taller;
  });
}
export function guardarBorradorRespuestas(
  codigo: string,
  instrumento: string,
  momento: string,
  valores: Record<number, number>,
) {
  update(codigo, (r) => {
    r.borradores = (r.borradores || []).filter(
      (x) => x.instrumento !== instrumento || x.momento !== momento,
    );
    r.borradores.push({ instrumento, momento, valores });
  });
}
export function guardarBorradorPrueba(codigo: string, b: PruebaBorrador | undefined) {
  update(codigo, (r) => {
    r.pruebaBorrador = b;
  });
}
// Un solo intento por momento: si ya existe, no se sobrescribe.
export function guardarPrueba(codigo: string, p: PruebaGuardada) {
  update(codigo, (r) => {
    r.pruebas ||= [];
    if (!r.pruebas.some((x) => x.momento === p.momento)) r.pruebas.push(p);
    r.pruebaBorrador = undefined;
  });
}
export function exportarRendimientoCSV() {
  return toCSV(
    ["codigo", "momento", "forma", "item", "tipo", "respuesta", "correcta", "tiempo_ms"],
    listarEstudiantes().flatMap((r) =>
      (r.pruebas || []).flatMap((p) => {
        const c = calificar(p.momento, p.respuestas);
        return formas[formaDe[p.momento]].map((it, i) => [
          r.codigo, p.momento, formaDe[p.momento], i + 1, it.tipo,
          p.respuestas[i] === null ? "" : String.fromCharCode(97 + p.respuestas[i]!),
          c.correctas[i] ? 1 : 0, p.tiempos[i] || 0,
        ]);
      }),
    ),
  );
}
export function guardarReflexion(codigo: string, sesion: number, texto: string) {
  update(codigo, (r) => {
    r.reflexiones = r.reflexiones.filter((x) => x.sesion !== sesion);
    r.reflexiones.push({ sesion, texto });
  });
}
export function toCSV(header: string[], rows: (string | number)[][]) {
  const cell = (x: string | number) => (typeof x === "number" ? String(x) : `"${x.replace(/"/g, '""')}"`);
  return "\uFEFF" + header.join(",") + "\r\n" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
export function exportarCSV() {
  return toCSV(
    ["codigo", "instrumento", "momento", "item", "valor"],
    listarEstudiantes().flatMap((r) =>
      r.respuestas.flatMap((a) => a.valores.map((v, i) => [r.codigo, a.instrumento, a.momento, i + 1, v])),
    ),
  );
}
export const dimensiones: Record<string, string[]> = {
  IMI: ["Interés", "Interés", "Competencia", "Competencia", "Esfuerzo", "Esfuerzo", "Valor", "Valor"],
  Compromiso: ["Conductual", "Conductual", "Emocional", "Emocional", "Cognitiva", "Cognitiva"],
};
export const sus = (v: number[]) => v.reduce((n, x, i) => n + (i % 2 === 0 ? x - 1 : 5 - x), 0) * 2.5;
export function medidas(instrumento: string, valores: number[]): [string, number][] {
  if (instrumento === "SUS") return [["puntaje_sus", sus(valores)]];
  const d = dimensiones[instrumento];
  if (!d) return [];
  const g: Record<string, number[]> = {};
  valores.forEach((v, i) => (g[d[i]] ||= []).push(v));
  return Object.entries(g).map(([k, a]) => [
    "media_" + k.toLowerCase(),
    +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2),
  ]);
}
export function medidasPrueba(momento: Momento, respuestas: (number | null)[], tiempos: number[]): [string, number][] {
  const c = calificar(momento, respuestas);
  return [
    ["puntaje", c.puntaje],
    ["aciertos", c.aciertos],
    ["aciertos_regla", c.porTipo.regla],
    ["aciertos_validez", c.porTipo.validez],
    ["aciertos_completar", c.porTipo.completar],
    ["tiempo_total_s", Math.round(tiempos.reduce((a, b) => a + b, 0) / 1000)],
  ];
}
export function exportarResumenCSV() {
  return toCSV(
    ["codigo", "instrumento", "momento", "medida", "valor"],
    listarEstudiantes().flatMap((r) =>
      [
        ...r.respuestas.flatMap((a) => medidas(a.instrumento, a.valores).map(([m, v]) => [r.codigo, a.instrumento, a.momento, m, v])),
        ...(r.pruebas || []).flatMap((p) => medidasPrueba(p.momento, p.respuestas, p.tiempos).map(([m, v]) => [r.codigo, "Prueba", p.momento, m, v])),
      ],
    ),
  );
}
export function exportarProgresoCSV() {
  return toCSV(
    ["codigo", "sesion", "nivel"],
    listarEstudiantes().flatMap((r) => r.progreso.map((p) => [r.codigo, ...p.split("-").map(Number)])),
  );
}
export function eliminarEstudiante(codigo: string) {
  localStorage.setItem(key, JSON.stringify(listarEstudiantes().filter((r) => r.codigo !== codigo)));
}
export const sessions = [
  {
    title: "Conjunción",
    week: "5",
    symbol: "∧",
    desc: "Aprende a construir y separar ideas.",
    levels: ["A∧B ⊢ A", "A∧B ⊢ B∧A", "A, B ⊢ A∧B", "(A∧B)∧C ⊢ A∧(B∧C)"],
    rules: "∧I · ∧E",
  },
  {
    title: "Implicación",
    week: "6",
    symbol: "→",
    desc: "Conecta premisas con sus consecuencias.",
    levels: ["A, A→B ⊢ B", "A→B, B→C ⊢ A→C", "⊢ A→A", "A∧B→C ⊢ A→(B→C)"],
    rules: "→I · →E",
  },
  {
    title: "Disyunción",
    week: "7",
    symbol: "∨",
    desc: "Explora alternativas y razona por casos.",
    levels: ["A ⊢ A∨B", "A∨B ⊢ B∨A", "A∨A ⊢ A", "A∧(B∨C) ⊢ (A∧B)∨(A∧C)"],
    rules: "∨I · ∨E",
  },
  {
    title: "Negación",
    week: "8",
    symbol: "¬",
    desc: "Descubre el poder de una contradicción.",
    levels: ["A, ¬A ⊢ ⊥", "A→B ⊢ ¬B→¬A", "¬A ⊢ A→B", "A ⊢ ¬¬A"],
    rules: "¬I · ¬E · ⊥E",
  },
  {
    title: "Reglas combinadas",
    week: "9–10",
    symbol: "⋈",
    desc: "Todo lo que sabes, en una misma prueba.",
    levels: ["A→(B→C) ⊢ (A∧B)→C", "(A→C)∧(B→C) ⊢ (A∨B)→C", "¬(A∨B) ⊢ ¬A∧¬B", "¬A∨¬B ⊢ ¬(A∧B)"],
    rules: "Todas las reglas",
  },
  {
    title: "Al papel",
    week: "11",
    symbol: "↗",
    desc: "Del árbol de metas a tu propia derivación.",
    levels: ["⊢ (A∧B)→(B∧A)", "⊢ A→(B→A)", "⊢ (A→B)→(¬B→¬A)"],
    rules: "Integración",
  },
  {
    title: "Retos finales",
    week: "12",
    symbol: "✧",
    desc: "Pon a prueba tu forma de razonar.",
    levels: ["A→B ⊢ (B→C)→(A→C)", "(A∨B)∧¬A ⊢ B", "¬(A∨B) ⊢ ¬A", "A∧¬A ⊢ B"],
    rules: "Todas las reglas",
  },
];
export function importarRegistro(r: Pick<RecordData, "codigo" | "consentimiento" | "progreso" | "respuestas" | "reflexiones" | "taller" | "pruebas">) {
  const todos = listarEstudiantes().filter((x) => x.codigo !== r.codigo);
  todos.push({ ...r, borradores: [], ultimoAcceso: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(todos));
}
