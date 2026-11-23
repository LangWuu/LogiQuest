import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { listarEstudiantes, guardarPrueba, guardarBorradorPrueba, type PruebaBorrador } from "./data";
import { formas, formaDe, calificar, tiposTexto, N_ITEMS, type Item, type Momento } from "./prueba";
import { enviar } from "./sync";

const LETRAS = "abcd";
const momentos: { m: Momento; titulo: string; cuando: string }[] = [
  { m: "inicial", titulo: "Preprueba", cuando: "Antes de la primera sesión" },
  { m: "final", titulo: "Posprueba", cuando: "Al terminar la secuencia" },
];
const vacio = (m: Momento): PruebaBorrador => ({
  momento: m,
  respuestas: Array(N_ITEMS).fill(null),
  tiempos: Array(N_ITEMS).fill(0),
  inicio: new Date().toISOString(),
  actual: 0,
});

function Enunciado({ it, conHueco = true }: { it: Item; conHueco?: boolean }) {
  return (
    <>
      {it.secuente && <div className="test-sequent formula">{it.secuente}</div>}
      {it.lineas && (
        <ol className="test-derivation">
          {it.lineas.map((l, i) => (
            <li key={i} className={l.f === "?" ? "missing" : ""}>
              <span className="line-n">{i + 1}</span>
              <span className="formula">{l.f === "?" && conHueco ? "?" : l.f}</span>
              <span className="line-just">{l.just}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export function PruebaPage({
  code,
  pedirConsentimiento,
  aviso,
}: {
  code: string;
  pedirConsentimiento: () => void;
  aviso: (m: string) => void;
}) {
  const registro = () => listarEstudiantes().find((r) => r.codigo === code);
  const [rev, setRev] = useState(0);
  const r = registro();
  const hechas = r?.pruebas || [];
  const [b, setB] = useState<PruebaBorrador | null>(() => r?.pruebaBorrador || null);
  const [revisar, setRevisar] = useState(false);
  const [imprimir, setImprimir] = useState<Momento | null>(null);
  const [, setReloj] = useState(0);
  const entrada = useRef(Date.now());

  // Reloj visible y tiempo por ítem: se acumula al cambiar de ítem o al enviar.
  useEffect(() => {
    if (!b) return;
    const t = setInterval(() => setReloj((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [!!b]);
  useEffect(() => {
    setB(registro()?.pruebaBorrador || null);
  }, [code]);
  useEffect(() => {
    if (!imprimir) return;
    const t = setTimeout(() => {
      window.print();
      setImprimir(null);
    }, 50);
    return () => clearTimeout(t);
  }, [imprimir]);

  function acumular(x: PruebaBorrador): PruebaBorrador {
    const ahora = Date.now();
    const tiempos = [...x.tiempos];
    tiempos[x.actual] += ahora - entrada.current;
    entrada.current = ahora;
    return { ...x, tiempos };
  }
  function actualizar(x: PruebaBorrador | null) {
    setB(x);
    if (code) guardarBorradorPrueba(code, x || undefined);
  }
  function ir(i: number) {
    if (!b) return;
    setRevisar(false);
    actualizar({ ...acumular(b), actual: i });
  }
  function comenzar(m: Momento) {
    if (!code) {
      pedirConsentimiento();
      return;
    }
    entrada.current = Date.now();
    setRevisar(false);
    actualizar(b && b.momento === m ? b : vacio(m));
  }
  function enviarPrueba() {
    if (!b) return;
    const x = acumular(b);
    const p = { momento: x.momento, respuestas: x.respuestas, tiempos: x.tiempos.map(Math.round), inicio: x.inicio, fin: new Date().toISOString() };
    guardarPrueba(code, p);
    enviar("PUT", "/api/prueba", p);
    setB(null);
    setRevisar(false);
    setRev(rev + 1);
    aviso("Prueba enviada. Gracias por tu esfuerzo.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const hoja = imprimir && (
    <section className="print-sheet" aria-hidden="true">
      <header>
        <strong>LogiQuest · Prueba de deducción natural · Forma {formaDe[imprimir]}</strong>
        <span>Código: ____________________ Fecha: ____________</span>
      </header>
      <p>Marca una sola opción por pregunta. No se permite usar apuntes ni el taller.</p>
      {formas[formaDe[imprimir]].map((it, i) => (
        <div className="print-item" key={i}>
          <p>
            <strong>{i + 1}.</strong> {it.enunciado}
          </p>
          <Enunciado it={it} />
          <div className="print-options">
            {it.opciones.map((o, j) => (
              <span key={j}>
                ( ) {LETRAS[j]}. <span className="formula">{o}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );

  // --- presentando la prueba ---
  if (b) {
    const items = formas[formaDe[b.momento]];
    const it = items[b.actual];
    const respondidas = b.respuestas.filter((x) => x !== null).length;
    const seg = Math.max(0, Math.floor((Date.now() - Date.parse(b.inicio)) / 1000));
    const faltan = b.respuestas.map((x, i) => (x === null ? i + 1 : 0)).filter(Boolean);
    return (
      <div className="test-shell">
        <div className="test-topbar">
          <div>
            <span className="eyebrow">
              {b.momento === "inicial" ? "PREPRUEBA" : "POSPRUEBA"} · FORMA {formaDe[b.momento]}
            </span>
            <strong>
              {revisar ? "Revisión final" : `Pregunta ${b.actual + 1} de ${items.length}`}
            </strong>
          </div>
          <span className="test-clock" aria-label="Tiempo transcurrido">
            <Icon name="clock" size={16} />
            {String(Math.floor(seg / 60)).padStart(2, "0")}:{String(seg % 60).padStart(2, "0")}
          </span>
        </div>
        <nav className="test-steps" aria-label="Preguntas">
          {items.map((_, i) => (
            <button
              key={i}
              aria-label={`Pregunta ${i + 1}${b.respuestas[i] !== null ? ", respondida" : ""}`}
              aria-current={!revisar && i === b.actual ? "step" : undefined}
              className={`${b.respuestas[i] !== null ? "answered" : ""} ${!revisar && i === b.actual ? "current" : ""}`}
              onClick={() => ir(i)}
            >
              {i + 1}
            </button>
          ))}
          <button className={`review-step ${revisar ? "current" : ""}`} onClick={() => setRevisar(true)}>
            <Icon name="check" size={14} /> Revisar
          </button>
        </nav>
        <div className="progress-bar slim" aria-hidden="true">
          <span style={{ width: `${(respondidas / items.length) * 100}%` }} />
        </div>
        {revisar ? (
          <section className="panel test-card">
            <span className="test-type">
              <Icon name="list" size={16} /> Antes de enviar
            </span>
            <h2>
              Respondiste {respondidas} de {items.length} preguntas.
            </h2>
            {faltan.length ? (
              <p className="muted">
                Sin responder: {faltan.map((n) => `pregunta ${n}`).join(", ")}. Puedes volver a ellas
                o enviar así; las que queden en blanco cuentan como incorrectas.
              </p>
            ) : (
              <p className="muted">Todo listo. Revisa lo que quieras antes de enviar.</p>
            )}
            <div className="info-box">
              <Icon name="lock" />
              <p>Solo hay un intento. Después de enviar no podrás cambiar tus respuestas.</p>
            </div>
            <div className="test-nav">
              <button className="btn secondary" onClick={() => ir(faltan.length ? faltan[0] - 1 : items.length - 1)}>
                <Icon name="back" size={16} /> Volver a las preguntas
              </button>
              <button className="btn primary" onClick={enviarPrueba}>
                Enviar prueba <Icon name="arrow" size={17} />
              </button>
            </div>
          </section>
        ) : (
          <section className="panel test-card" key={b.actual}>
            <span className="test-type">
              <Icon name="target" size={16} /> {tiposTexto[it.tipo]}
            </span>
            <h2>{it.enunciado}</h2>
            <Enunciado it={it} />
            <fieldset className="test-options">
              <legend className="sr-only">Opciones</legend>
              {it.opciones.map((o, j) => (
                <label key={j} className={b.respuestas[b.actual] === j ? "chosen" : ""}>
                  <input
                    type="radio"
                    name={`item-${b.actual}`}
                    checked={b.respuestas[b.actual] === j}
                    onChange={() => {
                      const respuestas = [...b.respuestas];
                      respuestas[b.actual] = j;
                      actualizar({ ...b, respuestas });
                    }}
                  />
                  <span className="option-letter">{LETRAS[j]}</span>
                  <span className={it.tipo === "validez" ? "" : "formula"}>{o}</span>
                </label>
              ))}
            </fieldset>
            <div className="test-nav">
              <button className="btn secondary" disabled={b.actual === 0} onClick={() => ir(b.actual - 1)}>
                <Icon name="back" size={16} /> Anterior
              </button>
              {b.actual < items.length - 1 ? (
                <button className="btn primary" onClick={() => ir(b.actual + 1)}>
                  Siguiente <Icon name="arrow" size={17} />
                </button>
              ) : (
                <button
                  className="btn primary"
                  onClick={() => {
                    actualizar(acumular(b));
                    setRevisar(true);
                  }}
                >
                  Revisar y enviar <Icon name="arrow" size={17} />
                </button>
              )}
            </div>
          </section>
        )}
        <p className="test-footnote">
          <Icon name="shield" size={15} /> Sin pistas ni retroalimentación durante la prueba. Tu avance
          se guarda en este navegador si necesitas salir.
        </p>
      </div>
    );
  }

  // --- portada ---
  return (
    <>
      {hoja}
      <div className="page-heading">
        <div>
          <div className="eyebrow">MIDE TU PUNTO DE PARTIDA Y TU AVANCE</div>
          <h1>Prueba de deducción natural.</h1>
          <p>
            Nueve preguntas cortas sobre reglas, validez y derivaciones. La presentas dos veces: al
            empezar y al terminar.
          </p>
        </div>
      </div>
      <div className="test-facts">
        {[
          ["list", "9 preguntas", "3 de cada tipo"],
          ["clock", "Unos 20 minutos", "Sin límite estricto"],
          ["lock", "Un solo intento", "No hay pistas"],
          ["shield", "No afecta tu nota", "Solo para el estudio"],
        ].map(([ic, t, s]) => (
          <div key={t}>
            <span className="mini-icon">
              <Icon name={ic} size={18} />
            </span>
            <span>
              <strong>{t}</strong>
              <small>{s}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="test-grid" data-rev={rev}>
        {momentos.map(({ m, titulo, cuando }) => {
          const hecha = hechas.find((p) => p.momento === m);
          const bloqueada = m === "final" && !hechas.some((p) => p.momento === "inicial");
          const enCurso = r?.pruebaBorrador?.momento === m;
          const cal = hecha && calificar(m, hecha.respuestas);
          return (
            <section key={m} className={`panel test-moment ${hecha ? "done" : ""} ${bloqueada ? "locked" : ""}`}>
              <div className="test-moment-top">
                <span className="session-symbol">{m === "inicial" ? "A" : "B"}</span>
                <span className="week-label">FORMA {formaDe[m]}</span>
                <span className={`status-dot ${hecha ? "ok" : enCurso ? "busy" : ""}`}>
                  {hecha ? "Enviada" : enCurso ? "En curso" : bloqueada ? "Bloqueada" : "Disponible"}
                </span>
              </div>
              <h2>{titulo}</h2>
              <p className="muted">{cuando}</p>
              {hecha ? (
                <div className="success-box">
                  <Icon name="check" size={18} />
                  <span>
                    Enviada el {new Date(hecha.fin).toLocaleDateString("es-CO")}.
                    {m === "final" && cal && (
                      <>
                        {" "}
                        Resultado: <strong>{cal.aciertos} de {cal.total}</strong> respuestas correctas.
                      </>
                    )}
                    {m === "inicial" && " Verás tu resultado al terminar la posprueba."}
                  </span>
                </div>
              ) : (
                <button className="btn primary" disabled={bloqueada} onClick={() => comenzar(m)}>
                  {bloqueada ? (
                    <>
                      <Icon name="lock" size={16} /> Primero la preprueba
                    </>
                  ) : (
                    <>
                      {enCurso ? "Continuar" : "Comenzar"} <Icon name="arrow" size={17} />
                    </>
                  )}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <section className="panel top-space test-paper">
        <div>
          <h2>¿Prefieres hacerla en papel?</h2>
          <p className="muted">
            Las mismas preguntas, listas para imprimir. Así el grupo de control puede presentarla en el
            aula en las mismas condiciones.
          </p>
        </div>
        <div className="test-nav">
          <button className="btn secondary" onClick={() => setImprimir("inicial")}>
            <Icon name="print" size={16} /> Forma A
          </button>
          <button className="btn secondary" onClick={() => setImprimir("final")}>
            <Icon name="print" size={16} /> Forma B
          </button>
        </div>
      </section>
    </>
  );
}
