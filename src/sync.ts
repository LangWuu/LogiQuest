// Sincronización opcional con el servidor. Si VITE_API_URL no está definida, todo sigue funcionando en local.
const base = ((import.meta.env.VITE_API_URL as string | undefined) || "").replace(/\/$/, "");
export const apiActiva = !!base;
const K = { token: "lq-token", grupo: "lq-grupo", cola: "lq-cola" };
type Item = { m: string; p: string; b?: unknown };
const leerCola = (): Item[] => {
  try {
    return JSON.parse(localStorage.getItem(K.cola) || "[]");
  } catch {
    return [];
  }
};
const guardarCola = (c: Item[]) => localStorage.setItem(K.cola, JSON.stringify(c.slice(-200)));
const token = () => localStorage.getItem(K.token) || "";
export const grupo = () => localStorage.getItem(K.grupo) || "";
export function http(m: string, p: string, b?: unknown, t = token()) {
  return fetch(base + p, {
    method: m,
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
}
export async function iniciarSesion(codigo: string): Promise<{ ok: true; codigo: string; grupo: string } | { ok: false; error: string }> {
  try {
    const r = await http("POST", "/api/sesion", { codigo }, "");
    const j = await r.json();
    if (!r.ok) return { ok: false, error: j.error || "No se pudo iniciar sesión." };
    if (localStorage.getItem("lq-sesion-codigo") !== j.codigo) localStorage.removeItem(K.cola); // evita mezclar datos de otro estudiante
    localStorage.setItem("lq-sesion-codigo", j.codigo);
    localStorage.setItem(K.token, j.token);
    localStorage.setItem(K.grupo, j.grupo);
    return { ok: true, codigo: j.codigo, grupo: j.grupo };
  } catch {
    return { ok: false, error: "No hay conexión con el servidor. Inténtalo de nuevo." };
  }
}
export function cerrarSesion() {
  localStorage.removeItem(K.token);
  localStorage.removeItem(K.grupo);
  localStorage.removeItem(K.cola);
}
export async function consentimientoRemoto() {
  try {
    return (await http("POST", "/api/consentimiento", {})).ok;
  } catch {
    return false;
  }
}
export async function registroRemoto() {
  try {
    const r = await http("GET", "/api/mi-registro");
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
export async function borrarRemoto() {
  try {
    return (await http("DELETE", "/api/mi-registro")).ok;
  } catch {
    return false;
  }
}
const clave = (i: Item) => {
  const b = (i.b || {}) as Record<string, unknown>;
  return [i.m, i.p, b.instrumento, b.momento, b.sesion, i.p === "/api/progreso" ? b.nivel : ""].join("|");
};
let vaciando = false;
export async function vaciar() {
  if (vaciando || !apiActiva || !token()) return;
  vaciando = true;
  try {
    for (let c = leerCola(); c.length; c = leerCola()) {
      let r: Response;
      try {
        r = await http(c[0].m, c[0].p, c[0].b);
      } catch {
        break; // sin conexión: se reintenta luego
      }
      if (r.status >= 500) break;
      guardarCola(c.slice(1)); // 2xx hecho; 4xx no se puede reintentar con éxito
    }
  } finally {
    vaciando = false;
  }
}
const temporizadores = new Map<string, ReturnType<typeof setTimeout>>();
export function enviar(m: string, p: string, b?: unknown, esperaMs = 0) {
  if (!apiActiva || !token()) return;
  const item = { m, p, b };
  const k = clave(item);
  clearTimeout(temporizadores.get(k));
  temporizadores.set(
    k,
    setTimeout(() => {
      guardarCola([...leerCola().filter((x) => clave(x) !== k), item]);
      void vaciar();
    }, esperaMs),
  );
}
if (apiActiva) {
  window.addEventListener("online", () => void vaciar());
  void vaciar();
}
// --- vistas de docente / investigador ---
export async function adminJson(path: string, t: string, body?: unknown) {
  const r = await http(body === undefined ? "GET" : "POST", path, body, t);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Error del servidor.");
  return j;
}
export async function descargar(path: string, t: string, nombre: string) {
  const r = await http("GET", path, undefined, t);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error del servidor.");
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
