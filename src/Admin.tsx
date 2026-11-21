import { useEffect, useState } from "react";
import { adminJson, descargar } from "./sync";

function useToken(clave: string) {
  const [t, setT] = useState(() => sessionStorage.getItem(clave) || "");
  const [borrador, setBorrador] = useState("");
  const [error, setError] = useState("");
  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        sessionStorage.setItem(clave, borrador.trim());
        setT(borrador.trim());
        setError("");
      }}
    >
      <label className="field-label" htmlFor={clave}>
        Token de acceso
      </label>
      <input id={clave} type="password" autoComplete="off" value={borrador} onChange={(e) => setBorrador(e.target.value)} required />
      {error && <small className="error">{error}</small>}
      <button className="btn primary top-space" type="submit">
        Entrar
      </button>
    </form>
  );
  return {
    t,
    form,
    fallo: (m: string) => {
      sessionStorage.removeItem(clave);
      setT("");
      setError(m);
    },
    salir: () => {
      sessionStorage.removeItem(clave);
      setT("");
    },
  };
}

type Fila = { codigo: string; grupo: string; consentimiento: boolean; sesionActual: number; nivelesResueltos: number; ultimoAcceso: string | null };
export function TeacherRemote() {
  const a = useToken("lq-adm-doc");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [total, setTotal] = useState(27);
  const [nuevos, setNuevos] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(5);
  const [grupo, setGrupo] = useState("experimental");
  const [msg, setMsg] = useState("");
  const cargar = () =>
    adminJson("/api/estudiantes", a.t)
      .then((j) => {
        setFilas(j.estudiantes);
        setTotal(j.total);
      })
      .catch((e) => a.fallo(e.message));
  useEffect(() => {
    if (a.t) void cargar();
  }, [a.t]);
  if (!a.t)
    return (
      <section className="panel">
        <h2>Acceso del docente</h2>
        <p className="muted">Ingresa el token que configuró el administrador del servidor.</p>
        {a.form}
      </section>
    );
  return (
    <>
      <section className="panel">
        <div className="section-card-heading">
          <h2>Progreso de estudiantes</h2>
          <span className="count-badge">{filas.length} códigos</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Grupo</th>
                <th>Consentimiento</th>
                <th>Sesión actual</th>
                <th>Niveles resueltos</th>
                <th>Último acceso</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.codigo}>
                  <td>
                    <strong>{r.codigo}</strong>
                  </td>
                  <td>{r.grupo}</td>
                  <td>{r.consentimiento ? "Sí" : "Pendiente"}</td>
                  <td>{r.sesionActual}</td>
                  <td>
                    {r.nivelesResueltos} / {total}
                  </td>
                  <td>{r.ultimoAcceso ? new Date(r.ultimoAcceso).toLocaleString("es-CO") : "—"}</td>
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    Aún no hay códigos. Genera algunos abajo y repártelos de forma anónima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel top-space">
        <h2>Generar códigos anónimos</h2>
        <p className="muted">El grupo (experimental o control) lo asigna el docente al generar el código; el estudiante no puede cambiarlo.</p>
        <div className="workshop-toolbar">
          <input aria-label="Cantidad" type="number" min={1} max={200} value={cantidad} onChange={(e) => setCantidad(+e.target.value)} />
          <select aria-label="Grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="experimental">Grupo experimental</option>
            <option value="control">Grupo de control</option>
          </select>
          <button
            className="btn primary"
            onClick={() =>
              adminJson("/api/codigos", a.t, { cantidad, grupo })
                .then((j) => {
                  setNuevos(j.codigos);
                  setMsg("");
                  void cargar();
                })
                .catch((e) => setMsg(e.message))
            }
          >
            Generar
          </button>
        </div>
        {msg && <small className="error">{msg}</small>}
        {nuevos.length > 0 && <pre className="derivation">{nuevos.join("\n")}</pre>}
        <button className="text-btn" onClick={a.salir}>
          Cerrar acceso de docente
        </button>
      </section>
    </>
  );
}

const archivos: [string, string][] = [
  ["respuestas", "Respuestas por ítem"],
  ["resumen", "Resumen (puntaje SUS y medias por subescala)"],
  ["progreso", "Progreso por nivel"],
  ["reflexiones", "Reflexiones por sesión"],
];
export function ExportRemote() {
  const a = useToken("lq-adm-inv");
  const [msg, setMsg] = useState("");
  if (!a.t)
    return (
      <section className="panel">
        <h2>Acceso del investigador</h2>
        <p className="muted">Ingresa el token de investigador del servidor.</p>
        {a.form}
      </section>
    );
  return (
    <section className="panel">
      <div className="section-card-heading">
        <div>
          <h2>Descargas del estudio</h2>
          <p className="muted">Solo incluyen participantes con consentimiento que no se han retirado. UTF-8, separador coma, con la columna de grupo.</p>
        </div>
      </div>
      {archivos.map(([k, t]) => (
        <button
          key={k}
          className="rule-button"
          onClick={() =>
            descargar(`/api/export/${k}.csv`, a.t, `logiquest-${k}.csv`)
              .then(() => setMsg(`Descargado: ${t}.`))
              .catch((e) => (e.message === "No autorizado." ? a.fallo(e.message) : setMsg(e.message)))
          }
        >
          <span>
            <strong>{t}</strong>
            <small>logiquest-{k}.csv</small>
          </span>
        </button>
      ))}
      {msg && <p className="muted" role="status">{msg}</p>}
      <button className="text-btn" onClick={a.salir}>
        Cerrar acceso de investigador
      </button>
    </section>
  );
}
