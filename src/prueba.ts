// Prueba de desempeño en deducción natural (preprueba y posprueba).
// Es independiente del taller: no usa el árbol de metas ni las pistas, para que el grupo
// de control y el experimental la presenten en igualdad de condiciones (también en papel).
// Las formas A y B son paralelas: mismos tipos de ítem, mismo orden y dificultad, con
// otras letras y otras posiciones de la línea faltante.
import { parse, type F } from "./logic.ts";

export type Tipo = "regla" | "validez" | "completar";
export type Linea = { f: string; just: string };
export type Item = {
  tipo: Tipo;
  enunciado: string;
  // Para "regla": premisas y conclusión del paso. Para "validez": el secuente.
  secuente?: string;
  // Para "completar": la derivación; la línea con f === "?" es la que falta.
  lineas?: Linea[];
  opciones: string[];
  correcta: number;
};
export type Momento = "inicial" | "final";
export const formaDe: Record<Momento, "A" | "B"> = { inicial: "A", final: "B" };
export const tiposTexto: Record<Tipo, string> = {
  regla: "Identificar la regla",
  validez: "Evaluar la inferencia",
  completar: "Completar la derivación",
};
const VALIDEZ = ["Válida", "No válida"];

export const formas: Record<"A" | "B", Item[]> = {
  A: [
    { tipo: "regla", enunciado: "¿Qué regla permite pasar de A∧B a B?", secuente: "A∧B ⊢ B", opciones: ["∧I", "∧E", "→E", "∨I"], correcta: 1 },
    { tipo: "regla", enunciado: "¿Qué regla permite obtener B a partir de A y de A→B?", secuente: "A, A→B ⊢ B", opciones: ["→I", "¬E", "→E", "∧E"], correcta: 2 },
    { tipo: "regla", enunciado: "Se supuso A y, con ese supuesto, se demostró B. ¿Qué regla permite concluir A→B y descargar el supuesto?", secuente: "[A] … B ⊢ A→B", opciones: ["→I", "→E", "∨E", "¬I"], correcta: 0 },
    { tipo: "validez", enunciado: "¿Es válida esta inferencia?", secuente: "A→B, B ⊢ A", opciones: VALIDEZ, correcta: 1 },
    { tipo: "validez", enunciado: "¿Es válida esta inferencia?", secuente: "A∨B, ¬A ⊢ B", opciones: VALIDEZ, correcta: 0 },
    { tipo: "validez", enunciado: "¿Es válida esta inferencia?", secuente: "A→B ⊢ B→A", opciones: VALIDEZ, correcta: 1 },
    {
      tipo: "completar",
      enunciado: "¿Qué fórmula va en la línea 3?",
      lineas: [
        { f: "A∧B", just: "Premisa" },
        { f: "A", just: "∧E 1" },
        { f: "?", just: "∧E 1" },
        { f: "B∧A", just: "∧I 3, 2" },
      ],
      opciones: ["A∨B", "B", "B∧A", "A→B"],
      correcta: 1,
    },
    {
      tipo: "completar",
      enunciado: "¿Qué fórmula va en la línea 4?",
      lineas: [
        { f: "A→B", just: "Premisa" },
        { f: "B→C", just: "Premisa" },
        { f: "A", just: "Supuesto" },
        { f: "?", just: "→E 1, 3" },
        { f: "C", just: "→E 2, 4" },
        { f: "A→C", just: "→I 3–5" },
      ],
      opciones: ["C", "A∧B", "B", "¬A"],
      correcta: 2,
    },
    {
      tipo: "completar",
      enunciado: "¿Qué fórmula va en la línea 5?",
      lineas: [
        { f: "A→B", just: "Premisa" },
        { f: "¬B", just: "Premisa" },
        { f: "A", just: "Supuesto" },
        { f: "B", just: "→E 1, 3" },
        { f: "?", just: "¬E 2, 4" },
        { f: "¬A", just: "¬I 3–5" },
      ],
      opciones: ["¬A", "⊥", "B", "A∧¬A"],
      correcta: 1,
    },
  ],
  B: [
    { tipo: "regla", enunciado: "¿Qué regla permite pasar de Q∧P a Q?", secuente: "Q∧P ⊢ Q", opciones: ["∨I", "∧I", "∧E", "→E"], correcta: 2 },
    { tipo: "regla", enunciado: "¿Qué regla permite obtener Q a partir de P→Q y de P?", secuente: "P→Q, P ⊢ Q", opciones: ["→E", "∧E", "→I", "¬E"], correcta: 0 },
    { tipo: "regla", enunciado: "Se supuso P y, con ese supuesto, se demostró Q∨P. ¿Qué regla permite concluir P→(Q∨P) y descargar el supuesto?", secuente: "[P] … Q∨P ⊢ P→(Q∨P)", opciones: ["∨E", "→E", "¬I", "→I"], correcta: 3 },
    { tipo: "validez", enunciado: "¿Es válida esta inferencia?", secuente: "P→Q, ¬P ⊢ ¬Q", opciones: VALIDEZ, correcta: 1 },
    { tipo: "validez", enunciado: "¿Es válida esta inferencia?", secuente: "P∨Q, ¬Q ⊢ P", opciones: VALIDEZ, correcta: 0 },
    { tipo: "validez", enunciado: "¿Es válida esta inferencia?", secuente: "P→Q ⊢ ¬P→¬Q", opciones: VALIDEZ, correcta: 1 },
    {
      tipo: "completar",
      enunciado: "¿Qué fórmula va en la línea 3?",
      lineas: [
        { f: "P∧Q", just: "Premisa" },
        { f: "Q", just: "∧E 1" },
        { f: "?", just: "∧E 1" },
        { f: "Q∧P", just: "∧I 2, 3" },
      ],
      opciones: ["P", "Q∧P", "P∨Q", "Q→P"],
      correcta: 0,
    },
    {
      tipo: "completar",
      enunciado: "¿Qué fórmula va en la línea 5?",
      lineas: [
        { f: "P→Q", just: "Premisa" },
        { f: "Q→R", just: "Premisa" },
        { f: "P", just: "Supuesto" },
        { f: "Q", just: "→E 1, 3" },
        { f: "?", just: "→E 2, 4" },
        { f: "P→R", just: "→I 3–5" },
      ],
      opciones: ["Q", "P∧Q", "¬P", "R"],
      correcta: 3,
    },
    {
      tipo: "completar",
      enunciado: "¿Qué fórmula va en la línea 6?",
      lineas: [
        { f: "P→Q", just: "Premisa" },
        { f: "¬Q", just: "Premisa" },
        { f: "P", just: "Supuesto" },
        { f: "Q", just: "→E 1, 3" },
        { f: "⊥", just: "¬E 2, 4" },
        { f: "?", just: "¬I 3–5" },
      ],
      opciones: ["⊥", "¬Q", "¬P", "P"],
      correcta: 2,
    },
  ],
};
export const N_ITEMS = 9;

// --- calificación (la misma en el navegador y en el servidor) ---
export type Calificacion = {
  aciertos: number;
  total: number;
  puntaje: number; // 0 a 100
  porTipo: Record<Tipo, number>;
  correctas: boolean[];
};
export function calificar(momento: Momento, respuestas: (number | null)[]): Calificacion {
  const items = formas[formaDe[momento]];
  const correctas = items.map((it, i) => respuestas[i] === it.correcta);
  const porTipo = { regla: 0, validez: 0, completar: 0 } as Record<Tipo, number>;
  items.forEach((it, i) => correctas[i] && porTipo[it.tipo]++);
  const aciertos = correctas.filter(Boolean).length;
  return { aciertos, total: items.length, puntaje: Math.round((aciertos / items.length) * 1000) / 10, porTipo, correctas };
}

// --- verificación semántica, usada en las pruebas automáticas ---
function atomos(f: F, s = new Set<string>()): Set<string> {
  if (!f.a && f.op !== "⊥") s.add(f.op);
  if (f.a) atomos(f.a, s);
  if (f.b) atomos(f.b, s);
  return s;
}
function valor(f: F, v: Record<string, boolean>): boolean {
  switch (f.op) {
    case "⊥": return false;
    case "¬": return !valor(f.a!, v);
    case "∧": return valor(f.a!, v) && valor(f.b!, v);
    case "∨": return valor(f.a!, v) || valor(f.b!, v);
    case "→": return !valor(f.a!, v) || valor(f.b!, v);
    default: return v[f.op];
  }
}
export function esValido(secuente: string): boolean {
  const [izq, der] = secuente.split("⊢");
  const hs = izq.trim() ? izq.split(",").map(parse) : [];
  const c = parse(der);
  const vars = [...[...hs, c].reduce((s, f) => atomos(f, s), new Set<string>())];
  for (let m = 0; m < 1 << vars.length; m++) {
    const v = Object.fromEntries(vars.map((x, i) => [x, !!(m & (1 << i))]));
    if (hs.every((h) => valor(h, v)) && !valor(c, v)) return false;
  }
  return true;
}
