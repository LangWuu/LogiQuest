import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const urls = new Map();
// Transpila un módulo TS y sus imports relativos (cada uno como URL data:).
function url(path) {
  if (urls.has(path)) return urls.get(path);
  let source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText;
  const dir = path.slice(0, path.lastIndexOf("/") + 1);
  source = source.replace(/from "\.\/([\w.-]+?)(\.ts)?"/g, (_, f) => `from "${url(dir + f + ".ts")}"`);
  const u = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
  urls.set(path, u);
  return u;
}
const load = (path) => import(url(path));
const logic = await load("src/logic.ts");
const data = await load("src/data.ts");
const prueba = await load("src/prueba.ts");
const { parse, fmt, actions, root, closed } = logic;
test("Parser preserves precedence and associativity", () => {
  assert.equal(parse("A∧B→C").op, "→");
  assert.equal(parse("A→B→C").b.op, "→");
  assert.equal(fmt(parse("(A∧B)∧C")), "(A∧B)∧C");
  assert.equal(fmt(parse("¬(A∨B)")), "¬(A∨B)");
});
function solve(g, path = new Set(), depth = 0) {
  if (depth > 35) return false;
  const key = fmt(g.f) + "|" + [...new Set(g.hs.map(fmt))].sort().join(",");
  if (path.has(key)) return false;
  const next = new Set(path).add(key);
  return actions(g).some((a) => a.goals.every((c, i) => solve({ ...c, id: i }, next, depth + 1)));
}
for (const s of data.sessions)
  for (const statement of s.levels)
    test("Solvable: " + statement, () => assert.equal(solve(root(statement)), true));
test("Closed requires all descendants to be closed", () => {
  const g = root("A,B ⊢ A∧B");
  assert.equal(closed(g), false);
  g.rule = "∧I";
  g.children = [
    { id: 1, f: parse("A"), hs: g.hs, rule: "Hipótesis" },
    { id: 2, f: parse("B"), hs: g.hs },
  ];
  assert.equal(closed(g), false);
  g.children[1].rule = "Hipótesis";
  assert.equal(closed(g), true);
});
test("Separated storage API persists, deduplicates, and escapes CSV", () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  };
  data.guardarConsentimiento('LQ-"01');
  data.guardarProgreso('LQ-"01', 1, 1);
  data.guardarProgreso('LQ-"01', 1, 1);
  data.guardarRespuestas('LQ-"01', "SUS", "final", [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]);
  data.guardarReflexion('LQ-"01', 1, "Comprendí ∧I");
  const [r] = data.listarEstudiantes();
  assert.equal(r.progreso.length, 1);
  assert.equal(r.reflexiones[0].texto, "Comprendí ∧I");
  assert.equal(
    r.respuestas[0].valores.reduce((n, v, i) => n + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5,
    100,
  );
  const csv = data.exportarCSV();
  assert.match(csv, /codigo,instrumento,momento,item,valor/);
  assert.match(csv, /"LQ-""01","SUS","final",1,5/);
  assert.equal(csv.split("\r\n").length, 11);
  data.guardarRespuestas('LQ-"01', "SUS", "final", [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
  assert.equal(data.listarEstudiantes()[0].respuestas.length, 1);
});
for (const s of data.sessions)
  for (const statement of s.levels)
    test("Guided route terminates: " + statement, () => {
      let steps = 0;
      function guided(g) {
        assert.ok(++steps < 200, "Guidance must not cycle");
        const a = logic.recommendation(g);
        assert.ok(a, "Every open goal needs an action");
        for (const c of a.goals) guided({ ...c, id: 0 });
      }
      guided(root(statement));
    });
test("Draft answers stay separate from exports and are replaced by final answers", () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  };
  data.guardarConsentimiento("BORRADOR");
  data.guardarBorradorRespuestas("BORRADOR", "IMI", "inicial", { 0: 7, 1: 6 });
  data.guardarBorradorRespuestas("BORRADOR", "IMI", "final", { 0: 3 });
  data.guardarBorradorRespuestas("BORRADOR", "IMI", "inicial", { 0: 7, 1: 6, 2: 5 });
  assert.equal(data.listarEstudiantes()[0].borradores.length, 2);
  assert.equal(
    data.listarEstudiantes()[0].borradores.find((x) => x.momento === "inicial").valores[2],
    5,
  );
  assert.equal(data.exportarCSV().split("\r\n").length, 2);
  data.guardarRespuestas("BORRADOR", "IMI", "inicial", [7, 6, 5]);
  assert.equal(data.listarEstudiantes()[0].borradores.length, 1);
  assert.equal(data.listarEstudiantes()[0].borradores[0].momento, "final");
  assert.equal(data.exportarCSV().split("\r\n").length, 4);
});
test("Workshop draft restores tree, selected goal and undo history without marking completion", () => {
  const original = root("A,B ⊢ A∧B");
  const tree = structuredClone(original);
  tree.rule = "∧I";
  tree.children = [
    { id: 1, f: parse("A"), hs: tree.hs },
    { id: 2, f: parse("B"), hs: tree.hs },
  ];
  data.guardarTaller("BORRADOR", {
    sesion: 1,
    nivel: 3,
    arbol: tree,
    seleccion: 1,
    historial: [original],
    ultimoPaso: "Prueba A y B.",
  });
  const saved = data.listarEstudiantes()[0];
  assert.equal(saved.taller.seleccion, 1);
  assert.equal(saved.taller.arbol.children.length, 2);
  assert.equal(saved.taller.historial[0].rule, undefined);
  assert.equal(saved.progreso.length, 0);
  assert.equal(closed(saved.taller.arbol), false);
});
function build(g) {
  const a = logic.recommendation(g);
  g.rule = a.name.split(" · ")[0];
  g.children = a.goals.map((x, i) => ({ ...x, id: i + 1 }));
  g.children.forEach(build);
  return g;
}
for (const s of data.sessions)
  for (const statement of s.levels)
    test("Full guided proof is closed and verified: " + statement, () => {
      const tree = build(root(statement));
      assert.equal(closed(tree), true);
      assert.equal(logic.verifyProof(tree), true);
    });
test("verifyProof rejects invalid, incomplete and tampered proofs", () => {
  const bad = root("⊢ A→A");
  bad.rule = "∧I";
  bad.children = [];
  assert.equal(logic.verifyProof(bad), false);
  const open = root("A,B ⊢ A∧B");
  assert.equal(logic.verifyProof(open), false);
  const t = build(root("A,B ⊢ A∧B"));
  t.children.pop();
  assert.equal(logic.verifyProof(t), false);
  const u = build(root("A,B ⊢ A∧B"));
  u.children[0].f = parse("B");
  assert.equal(logic.verifyProof(u), false);
});
test("Summary measures: SUS score and subscale means", () => {
  assert.deepEqual(data.medidas("SUS", [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), [["puntaje_sus", 100]]);
  assert.deepEqual(data.medidas("IMI", [7, 5, 6, 6, 4, 4, 3, 5]).map((m) => m[1]), [6, 6, 4, 4]);
  assert.deepEqual(data.medidas("Compromiso", [5, 5, 3, 3, 1, 2]).map((m) => m[0]), ["media_conductual", "media_emocional", "media_cognitiva"]);
});
test("Summary/progress CSV and deletion on withdrawal", () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) };
  data.guardarConsentimiento("R1");
  data.guardarProgreso("R1", 2, 3);
  data.guardarRespuestas("R1", "SUS", "final", [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]);
  assert.match(data.exportarResumenCSV(), /"R1","SUS","final","puntaje_sus",100/);
  assert.match(data.exportarProgresoCSV(), /"R1",2,3/);
  data.eliminarEstudiante("R1");
  assert.equal(data.listarEstudiantes().length, 0);
});

test("Prueba: las formas A y B son paralelas", () => {
  const { A, B } = prueba.formas;
  assert.equal(A.length, prueba.N_ITEMS);
  assert.equal(B.length, prueba.N_ITEMS);
  A.forEach((it, i) => {
    assert.equal(it.tipo, B[i].tipo, `ítem ${i + 1}: mismo tipo`);
    assert.equal(it.opciones.length, B[i].opciones.length);
  });
  for (const it of [...A, ...B]) {
    assert.ok(it.correcta >= 0 && it.correcta < it.opciones.length);
    assert.equal(new Set(it.opciones).size, it.opciones.length, "opciones sin repetir");
  }
});
test("Prueba: la clave de los ítems de validez coincide con las tablas de verdad", () => {
  for (const it of [...prueba.formas.A, ...prueba.formas.B].filter((x) => x.tipo === "validez"))
    assert.equal(it.correcta === 0, prueba.esValido(it.secuente), it.secuente);
});
test("Prueba: en los ítems de completar, la línea faltante tiene una sola opción posible", () => {
  for (const it of [...prueba.formas.A, ...prueba.formas.B].filter((x) => x.tipo === "completar")) {
    const i = it.lineas.findIndex((l) => l.f === "?");
    assert.ok(i >= 0);
    // la respuesta correcta se sigue de las líneas anteriores
    const previas = it.lineas.slice(0, i).map((l) => l.f).filter((f) => f !== "Supuesto");
    assert.equal(prueba.esValido(previas.join(", ") + " ⊢ " + it.opciones[it.correcta]), true, it.enunciado);
  }
});
test("Prueba: calificación por tipo y en blanco", () => {
  const claves = prueba.formas.A.map((x) => x.correcta);
  const c = prueba.calificar("inicial", claves);
  assert.equal(c.aciertos, 9);
  assert.equal(c.puntaje, 100);
  assert.deepEqual(c.porTipo, { regla: 3, validez: 3, completar: 3 });
  const vacia = prueba.calificar("final", Array(9).fill(null));
  assert.equal(vacia.aciertos, 0);
  const medidas = data.medidasPrueba("inicial", claves, Array(9).fill(2000));
  assert.deepEqual(Object.fromEntries(medidas).tiempo_total_s, 18);
});
