export type F = { op: string; a?: F; b?: F };
export function parse(raw: string): F {
  let s = raw.replace(/\s/g, "");
  while (s[0] === "(") {
    let d = 0,
      end = -1;
    for (let i = 0; i < s.length; i++) {
      d += s[i] === "(" ? 1 : s[i] === ")" ? -1 : 0;
      if (d === 0) {
        end = i;
        break;
      }
    }
    if (end !== s.length - 1) break;
    s = s.slice(1, -1);
  }
  for (const op of ["→", "∨", "∧"]) {
    let d = 0;
    for (let i = 0; i < s.length; i++) {
      d += s[i] === "(" ? 1 : s[i] === ")" ? -1 : 0;
      if (!d && s[i] === op) return { op, a: parse(s.slice(0, i)), b: parse(s.slice(i + 1)) };
    }
  }
  return s[0] === "¬" ? { op: "¬", a: parse(s.slice(1)) } : { op: s };
}
export function fmt(f: F): string {
  const sub = (x: F) => (x.b ? `(${fmt(x)})` : fmt(x));
  return f.b ? `${sub(f.a!)}${f.op}${sub(f.b)}` : f.a ? "¬" + sub(f.a) : f.op;
}
const eq = (a: F, b: F) => fmt(a) === fmt(b);
export type Goal = { id: number; f: F; hs: F[]; rule?: string; children?: Goal[] };
export const closed = (g: Goal): boolean => !!g.rule && (!g.children || g.children.every(closed));
export type Action = { name: string; description: string; goals: { f: F; hs: F[] }[] };
export function actions(g: Goal): Action[] {
  if (g.rule) return [];
  const { f, hs } = g;
  const out: Action[] = [];
  const add = (name: string, description: string, fs: F[], context = hs) =>
    out.push({ name, description, goals: fs.map((f) => ({ f, hs: context })) });
  if (hs.some((h) => eq(h, f))) add("Hipótesis", `${fmt(f)} ya está entre tus hipótesis.`, []);
  if (f.op === "∧")
    add("∧I · Introducir conjunción", `Prueba ${fmt(f.a!)} y también ${fmt(f.b!)}.`, [f.a!, f.b!]);
  if (f.op === "→")
    add(
      "→I · Introducir implicación",
      `Supón ${fmt(f.a!)} y demuestra ${fmt(f.b!)}.`,
      [f.b!],
      [...hs, f.a!],
    );
  if (f.op === "¬")
    add(
      "¬I · Introducir negación",
      `Supón ${fmt(f.a!)} y busca una contradicción.`,
      [{ op: "⊥" }],
      [...hs, f.a!],
    );
  if (f.op === "∨") {
    add("∨I izq · Elegir izquierda", `Basta con demostrar ${fmt(f.a!)}.`, [f.a!]);
    add("∨I der · Elegir derecha", `Basta con demostrar ${fmt(f.b!)}.`, [f.b!]);
  }
  for (const h of hs) {
    if (h.op === "∧") {
      for (const x of [h.a!, h.b!]) {
        if (eq(x, f)) add("∧E · Eliminar conjunción", `Obtén ${fmt(f)} de ${fmt(h)}.`, []);
        else if (!hs.some((y) => eq(y, x)))
          add("∧E · Extraer " + fmt(x), `Añade ${fmt(x)} desde ${fmt(h)}.`, [f], [...hs, x]);
      }
    }
    if (h.op === "→" && !hs.some((x) => eq(x, h.b!)))
      out.push({
        name: "→E · Usar " + fmt(h),
        description: `Prueba ${fmt(h.a!)} para obtener ${fmt(h.b!)}.`,
        goals: eq(h.b!, f)
          ? [{ f: h.a!, hs }]
          : [
              { f: h.a!, hs },
              { f, hs: [...hs, h.b!] },
            ],
      });
    if (h.op === "∨")
      out.push({
        name: "∨E · Razonar por casos",
        description: `Prueba ${fmt(f)} suponiendo ${fmt(h.a!)} y luego ${fmt(h.b!)}.`,
        goals: [h.a!, h.b!].map((x) => ({ f, hs: [...hs.filter((x) => x !== h), x] })),
      });
    if (h.op === "¬" && f.op === "⊥")
      add("¬E · Contradicción", `Prueba ${fmt(h.a!)} para contradecir ${fmt(h)}.`, [h.a!]);
  }
  if (f.op !== "⊥" && hs.some((h) => h.op === "⊥"))
    add("⊥E · Eliminar contradicción", `De ⊥ se sigue ${fmt(f)}.`, []);
  if (f.op !== "⊥" && hs.some((h) => h.op === "¬"))
    add("⊥E · Buscar contradicción", `Demuestra ⊥ para concluir ${fmt(f)}.`, [{ op: "⊥" }]);
  return out;
}
export function root(statement: string): Goal {
  const [h, f] = statement.split("⊢");
  return { id: 0, f: parse(f), hs: h.trim() ? h.split(",").map(parse) : [] };
}

// Prefer a shortest-depth proof so successive hints cannot recommend circular detours.
export function recommendation(g: Goal, options = actions(g)): Action | undefined {
  if (!options.length) return undefined;
  let budget = 50000;
  const memo = new Map<string, boolean>();
  function solvable(goal: Goal, remaining: number): boolean {
    if (remaining < 0 || --budget < 0) return false;
    const key =
      fmt(goal.f) + "|" + [...new Set(goal.hs.map(fmt))].sort().join(",") + "|" + remaining;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const result = actions(goal).some((a) =>
      a.goals.every((child) => solvable({ ...child, id: 0 }, remaining - 1)),
    );
    memo.set(key, result);
    return result;
  }
  for (let depth = 0; depth < 35 && budget > 0; depth++) {
    const choice = options.find((a) =>
      a.goals.every((child) => solvable({ ...child, id: 0 }, depth - 1)),
    );
    if (choice) return choice;
  }
  return options[0];
}

// Verifica que cada paso de un árbol de prueba sea una aplicación válida de una regla
// y que no quede ninguna meta abierta. Es la verificación que repite el servidor.
export function verifyProof(g: Goal): boolean {
  if (!g.rule) return false;
  const kids = g.children || [];
  const same = (a: F[], b: F[]) => a.length === b.length && a.every((x, i) => fmt(x) === fmt(b[i]));
  const options = actions({ id: g.id, f: g.f, hs: g.hs });
  const valid = options.some(
    (a) =>
      a.name.split(" · ")[0] === g.rule &&
      a.goals.length === kids.length &&
      a.goals.every((x, i) => fmt(x.f) === fmt(kids[i].f) && same(x.hs, kids[i].hs)),
  );
  return valid && kids.every(verifyProof);
}
