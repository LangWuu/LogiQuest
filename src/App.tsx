import { useEffect, useRef, useState } from "react";
import {
  sessions,
  listarEstudiantes,
  guardarConsentimiento,
  guardarProgreso,
  guardarRespuestas,
  guardarReflexion,
  exportarCSV,
  guardarTaller,
  guardarBorradorRespuestas,
  eliminarEstudiante,
  exportarResumenCSV,
  exportarProgresoCSV,
  importarRegistro,
} from "./data";
import {
  apiActiva,
  enviar,
  iniciarSesion,
  consentimientoRemoto,
  registroRemoto,
  borrarRemoto,
  cerrarSesion,
  grupo,
} from "./sync";
import { TeacherRemote, ExportRemote } from "./Admin";
import { root, actions, closed, fmt, recommendation, type Goal, type Action } from "./logic.ts";

type Page = "home" | "session" | "workshop" | "surveys" | "teacher" | "export" | "help" | "consent";
function Icon({ name, size = 20, ...props }: { name: string; size?: number; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
      </>
    ),
    map: (
      <>
        <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16" />
      </>
    ),
    book: (
      <>
        <path d="M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1v15" />
      </>
    ),
    survey: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" />
      </>
    ),
    chart: (
      <>
        <path d="M4 3v17h17M8 16v-5M13 16V6M18 16V9" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 3M12 17h.01" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
    moon: <path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" />,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    reset: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7" />
      </>
    ),
    bulb: (
      <>
        <path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 8 3v6c0 6-8 11-8 11S4 17 4 11V5z" />
        <path d="m8 11 3 3 5-5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    flag: (
      <>
        <path d="M5 22V3c5-4 9 4 15 0v11c-6 4-10-4-15 0" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name] || paths.book}
    </svg>
  );
}
const nav = [
  { page: "home", icon: "map", label: "Mi aprendizaje" },
  { page: "surveys", icon: "survey", label: "Cuestionarios" },
  { page: "help", icon: "help", label: "Ayuda y recursos" },
] as const;
const susItems = [
  "Creo que me gustaría utilizar este sistema frecuentemente.",
  "Encontré el sistema innecesariamente complejo.",
  "Pensé que el sistema era fácil de usar.",
  "Creo que necesitaría el apoyo de una persona técnica para poder utilizar este sistema.",
  "Encontré que las diversas funciones de este sistema estaban bien integradas.",
  "Pensé que había demasiada inconsistencia en este sistema.",
  "Imagino que la mayoría de las personas aprenderían a utilizar este sistema muy rápidamente.",
  "Encontré el sistema muy engorroso de usar.",
  "Me sentí muy seguro/a utilizando el sistema.",
  "Necesité aprender muchas cosas antes de poder empezar a utilizar este sistema.",
];
const sampleItems: Record<string, string[]> = {
  IMI: [
    "Disfruto aprender a construir demostraciones lógicas.",
    "Esta actividad me parece interesante.",
    "Me siento capaz de resolver estos ejercicios.",
    "Creo que estoy mejorando mis habilidades de lógica.",
    "Me esfuerzo por resolver cada demostración.",
    "Dedico atención a comprender cada paso.",
    "Aprender estas reglas me resulta útil.",
    "Esta actividad es valiosa para mi formación.",
  ],
  Compromiso: [
    "Completo las actividades propuestas en cada sesión.",
    "Participo activamente durante los ejercicios.",
    "Disfruto trabajar en las demostraciones.",
    "Me siento motivado/a durante las sesiones.",
    "Intento comprender por qué funciona cada regla.",
    "Busco otra estrategia cuando no consigo resolver una prueba.",
  ],
  SUS: susItems,
};
function App() {
  const [page, setPage] = useState<Page>("home");
  const [role, setRole] = useState("Estudiante");
  const [dark, setDark] = useState(() => localStorage.getItem("lq-theme") === "dark");
  const [menu, setMenu] = useState(false);
  const [code, setCode] = useState(() => localStorage.getItem("lq-code") || "");
  const [draft, setDraft] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [returnAfterConsent, setReturnAfterConsent] = useState<Page>("session");
  const [si, setSi] = useState(0);
  const [li, setLi] = useState(0);
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState("");
  const [reflection, setReflection] = useState("");
  const student = listarEstudiantes().find((s) => s.codigo === code);
  const progress = student?.progreso || [];
  const total = sessions.reduce((n, s) => n + s.levels.length, 0);
  const done = progress.length;
  const percent = Math.round((done / total) * 100);
  const activeSession = sessions.findIndex((s, i) =>
    s.levels.some((_, j) => !progress.includes(`${i + 1}-${j + 1}`)),
  );
  const paused = student?.taller && !closed(student.taller.arbol) ? student.taller : undefined;
  const nextSi = paused ? paused.sesion - 1 : activeSession < 0 ? 6 : activeSession;
  const nextLi = paused
    ? paused.nivel - 1
    : Math.max(
        0,
        sessions[nextSi].levels.findIndex((_, j) => !progress.includes(`${nextSi + 1}-${j + 1}`)),
      );
  const [tree, setTree] = useState<Goal>(() => root(sessions[0].levels[0]));
  const [selected, setSelected] = useState(0);
  const [history, setHistory] = useState<Goal[]>([]);
  const [guided, setGuided] = useState(true);
  const [hint, setHint] = useState(false);
  const [last, setLast] = useState("Todavía no has aplicado ninguna regla.");
  const [instrument, setInstrument] = useState("IMI");
  const [moment, setMoment] = useState("inicial");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const guestDrafts = useRef<Record<string, Record<number, number>>>({});
  const [invalid, setInvalid] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [control, setControl] = useState(() => grupo() === "control");
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState(sampleItems);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("lq-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const record = listarEstudiantes().find((s) => s.codigo === code);
    const draft = record?.borradores?.find(
      (a) => a.instrumento === instrument && a.momento === moment,
    );
    const saved = record?.respuestas.find(
      (a) => a.instrumento === instrument && a.momento === moment,
    );
    setAnswers(
      draft?.valores ||
        (saved
          ? Object.fromEntries(saved.valores.map((v, i) => [i, v]))
          : !code
            ? guestDrafts.current[`${instrument}-${moment}`] || {}
            : {}),
    );
    setInvalid(false);
    setScore(
      saved && !draft
        ? instrument === "SUS"
          ? saved.valores.reduce((n, v, i) => n + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5
          : 0
        : null,
    );
  }, [instrument, moment, code]);
  useEffect(() => {
    setReflection(
      listarEstudiantes()
        .find((s) => s.codigo === code)
        ?.reflexiones.find((r) => r.sesion === si + 1)?.texto || "",
    );
  }, [si, code]);
  useEffect(() => {
    if (code && page === "workshop") {
      const borrador = {
        sesion: si + 1,
        nivel: li + 1,
        arbol: tree,
        seleccion: selected,
        historial: history,
        ultimoPaso: last,
      };
      guardarTaller(code, borrador);
      enviar("PUT", "/api/taller", { ...borrador, historial: history.slice(-30) }, 1500);
    }
  }, [code, page, si, li, tree, selected, history, last]);
  function go(p: Page, returnTo: Page = "session") {
    if (p === "consent") setReturnAfterConsent(returnTo);
    setPage(p);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function start(s: number, l: number) {
    if (!code) {
      setSi(s);
      setLi(l);
      go("consent", "workshop");
      return;
    }
    setSi(s);
    setLi(l);
    const saved = listarEstudiantes().find((r) => r.codigo === code)?.taller;
    const resume = saved && saved.sesion === s + 1 && saved.nivel === l + 1 ? saved : undefined;
    setTree(resume?.arbol || root(sessions[s].levels[l]));
    setSelected(resume?.seleccion || 0);
    setHistory(resume?.historial || []);
    setLast(resume?.ultimoPaso || "Todavía no has aplicado ninguna regla.");
    setHint(false);
    go("workshop");
  }
  function flatten(g: Goal): Goal[] {
    return [g, ...(g.children || []).flatMap(flatten)];
  }
  const nodes = flatten(tree);
  const current = nodes.find((g) => g.id === selected) || tree;
  const available = actions(current);
  const recommended = recommendation(current, available);
  const complete = closed(tree);
  const derivacion = nodes
    .map(
      (n, i) =>
        `${i + 1}. ${n.hs.map(fmt).join(", ") || "∅"} ⊢ ${fmt(n.f)} [${n.rule}${n.children?.length ? " de " + n.children.map((c) => nodes.findIndex((x) => x.id === c.id) + 1).join(", ") : ""}]`,
    )
    .join("\n");
  function apply(a: Action) {
    setHistory([...history, structuredClone(tree)]);
    const copy = structuredClone(tree);
    const g = flatten(copy).find((g) => g.id === selected)!;
    let id = Math.max(...nodes.map((n) => n.id)) + 1;
    g.rule = a.name.split(" · ")[0];
    g.children = a.goals.map((x) => ({ ...x, id: id++ }));
    setTree(copy);
    const open = flatten(copy).find((x) => !x.rule);
    if (open) setSelected(open.id);
    setLast(a.description);
    setHint(false);
    if (closed(copy)) {
      guardarProgreso(code, si + 1, li + 1);
      enviar("PUT", "/api/progreso", { sesion: si + 1, nivel: li + 1, arbol: copy });
      setRevision(revision + 1);
      setToast("Nivel completado. Tu progreso se ha guardado.");
    }
  }
  function renderGoal(g: Goal, depth = 0): React.ReactNode {
    return (
      <div className={depth ? "goal-branch" : ""} key={g.id}>
        <button
          className={`goal-card ${g.id === selected ? "selected" : ""} ${closed(g) ? "solved" : ""}`}
          aria-pressed={g.id === selected}
          onClick={() => setSelected(g.id)}
        >
          <span className="goal-top">
            <span>META {g.id + 1}</span>
            {closed(g) ? (
              <span>
                <Icon name="check" size={14} />
                {g.rule}
              </span>
            ) : g.rule ? (
              <span>{g.rule}</span>
            ) : (
              <span className="tiny-dot" />
            )}
          </span>
          <strong className="formula">{fmt(g.f)}</strong>
          <span className="goal-context">
            Hipótesis: {g.hs.length ? g.hs.map(fmt).join(", ") : "sin hipótesis"}
          </span>
        </button>
        {g.children?.map((c) => renderGoal(c, depth + 1))}
      </div>
    );
  }
  function download(csv = exportarCSV(), name = "logiquest-datos-anonimos.csv") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setToast("CSV descargado. No contiene nombres ni correos.");
  }
  const pageTitles: Record<Page, string> = {
    home: "Mi aprendizaje",
    session: "Ruta de aprendizaje",
    workshop: "Taller de pruebas",
    surveys: "Cuestionarios",
    teacher: "Panel del docente",
    export: "Exportar datos",
    help: "Ayuda y recursos",
    consent: "Consentimiento informado",
  };
  return (
    <div className="app">
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand-mark">
            L<span>∴</span>
          </span>
          <span>
            Logi<span className="brand-quest">Quest</span>
            <small>APRENDE A DEMOSTRAR</small>
          </span>
        </a>
        <div className="workspace-label">ESPACIO DE APRENDIZAJE</div>
        <nav>
          {nav.map((n) => (
            <button
              className={`nav-item ${page === n.page || (n.page === "home" && ["session", "workshop"].includes(page)) ? "active" : ""}`}
              key={n.page}
              onClick={() => go(n.page)}
            >
              <Icon name={n.icon} />
              {n.label}
              {n.page === "home" && <span className="nav-number">7</span>}
            </button>
          ))}
        </nav>
        <div className="workspace-label management">GESTIÓN ACADÉMICA</div>
        <nav>
          <button
            className={`nav-item ${page === "teacher" ? "active" : ""}`}
            onClick={() => {
              setRole("Docente");
              go("teacher");
            }}
          >
            <Icon name="chart" />
            Panel del docente
          </button>
          <button
            className={`nav-item ${page === "export" ? "active" : ""}`}
            onClick={() => {
              setRole("Investigador");
              go("export");
            }}
          >
            <Icon name="download" />
            Exportar datos
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="study-note">
            <span className="mini-icon">
              <Icon name="shield" size={18} />
            </span>
            <strong>Tu aprendizaje, primero.</strong>
            <p>
              Este espacio es para explorar.
              <br />
              Equivocarse también es aprender.
            </p>
            <button onClick={() => go("consent")}>
              Acerca del estudio <Icon name="arrow" size={14} />
            </button>
          </div>
          <div className="university">
            <span className="university-seal">UD</span>
            <div>
              Universidad Distrital<small>Francisco José de Caldas</small>
              <span>Facultad de Ingeniería</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-btn"
              aria-label="Abrir navegación"
              onClick={() => setMenu(!menu)}
            >
              <Icon name="menu" />
            </button>
            <span>LogiQuest</span>
            <Icon name="chevron" size={13} />
            <strong>{pageTitles[page]}</strong>
          </div>
          <div className="topbar-right">
            <span className="academic-term">
              Lógica proposicional <span>Periodo en curso</span>
            </span>
            <button
              className="icon-btn theme-btn"
              aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
              onClick={() => setDark(!dark)}
            >
              <Icon name={dark ? "sun" : "moon"} size={19} />
            </button>
            <div className="profile">
              <span className="avatar">{code ? code.slice(0, 2).toUpperCase() : "ES"}</span>
              <select
                aria-label="Cambiar vista de rol (prototipo)"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  go(
                    e.target.value === "Docente"
                      ? "teacher"
                      : e.target.value === "Investigador"
                        ? "export"
                        : "home",
                  );
                }}
              >
                <option>Estudiante</option>
                <option>Docente</option>
                <option>Investigador</option>
              </select>
            </div>
          </div>
        </header>
        <main>
          {page === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">TU ESPACIO PARA PENSAR MEJOR</div>
                  <h1>
                    Cada gran prueba empieza con una idea<span className="orange-dot">.</span>
                  </h1>
                  <p>
                    Explora, conecta y demuestra. Tu camino por la deducción natural empieza aquí.
                  </p>
                </div>
                <span className="course-pill">
                  <span /> Periodo académico en curso
                </span>
              </div>
              <div className="overview-grid">
                <section className="continue-card">
                  <div className="continue-content">
                    <div className="small-badge">
                      <span className="live-dot" />
                      {done || paused ? "CONTINÚA TU CAMINO" : "TU PRÓXIMO PASO"}
                    </div>
                    <h2>
                      Las buenas ideas
                      <br />
                      se construyen paso a paso.
                    </h2>
                    <p>
                      {paused
                        ? "Tu prueba está guardada. Retoma exactamente el siguiente paso."
                        : done
                          ? "Retoma tu recorrido y sigue conectando ideas."
                          : "Empieza con la conjunción: dos ideas que, juntas, hacen una nueva."}
                    </p>
                    <button
                      className="btn primary"
                      onClick={() => {
                        if (paused || done) start(nextSi, nextLi);
                        else {
                          setSi(nextSi);
                          go("session");
                        }
                      }}
                    >
                      {paused || done ? "Continuar donde quedaste" : "Comenzar mi primera sesión"}
                      <Icon name="arrow" size={17} />
                    </button>
                    <span className="hero-meta">
                      Sesión {nextSi + 1} · {sessions[nextSi].title}
                      <span>·</span>
                      {paused
                        ? `Nivel ${nextLi + 1} · intento guardado`
                        : `${sessions[nextSi].levels.length} niveles para explorar`}
                    </span>
                  </div>
                  <div className="logic-art" aria-hidden="true">
                    <div className="art-grid" />
                    <svg className="art-lines" viewBox="0 0 320 260">
                      <path d="M58 69H155V131H244M155 131v68h-51" />
                      <circle cx="155" cy="131" r="5" />
                    </svg>
                    <span className="logic-tile tile-a">A</span>
                    <span className="logic-tile tile-b">B</span>
                    <span className="logic-tile tile-and">∧</span>
                    <span className="logic-tile tile-result">
                      A ∧ B
                      <span>
                        <Icon name="check" size={13} />
                      </span>
                    </span>
                    <span className="art-caption">
                      de ideas simples,
                      <br />
                      grandes conclusiones.
                    </span>
                    <span className="art-spark">＋</span>
                  </div>
                </section>
                <section className="progress-card">
                  <div className="section-card-heading">
                    <h3>Tu recorrido</h3>
                    <Icon name="flag" size={18} />
                  </div>
                  <div
                    className="progress-ring"
                    style={{ "--progress": `${percent * 3.6}deg` } as React.CSSProperties}
                  >
                    <div>
                      <strong>
                        {percent}
                        <span>%</span>
                      </strong>
                      <small>completado</small>
                    </div>
                  </div>
                  <div className="progress-counts">
                    <div>
                      <strong>
                        {done}
                        <span> / {total}</span>
                      </strong>
                      <small>Niveles resueltos</small>
                    </div>
                    <span />
                    <div>
                      <strong>
                        {
                          sessions.filter((s, i) =>
                            s.levels.every((_, j) => progress.includes(`${i + 1}-${j + 1}`)),
                          ).length
                        }
                        <span> / 7</span>
                      </strong>
                      <small>Sesiones completas</small>
                    </div>
                  </div>
                  <div className="progress-foot">
                    <span className="tiny-dot" />
                    {done ? "Cada paso cuenta. Sigue así." : "Un pequeño paso, un gran comienzo."}
                  </div>
                </section>
              </div>
              <section className="learning-path">
                <div className="section-title">
                  <div>
                    <h2>
                      Tu ruta de aprendizaje <span>7 sesiones</span>
                    </h2>
                    <p>De lo simple a lo extraordinario. Avanza a tu ritmo.</p>
                  </div>
                  <div className="legend">
                    <span />
                    Por explorar
                    <i />
                    Completada <Icon name="check" size={13} />
                  </div>
                </div>
                <div className="session-grid">
                  {sessions.map((s, i) => {
                    const count = s.levels.filter((_, j) =>
                      progress.includes(`${i + 1}-${j + 1}`),
                    ).length;
                    return (
                      <button
                        key={s.title}
                        className={`session-card ${i === nextSi ? "current-session" : ""} ${count === s.levels.length ? "finished-session" : ""}`}
                        onClick={() => {
                          setSi(i);
                          go("session");
                        }}
                      >
                        <div className="session-card-top">
                          <span className={`session-symbol symbol-${i}`}>{s.symbol}</span>
                          <span className="week-label">SEMANA {s.week}</span>
                          {i === nextSi && (
                            <span className="current-badge">
                              {done ? "En curso" : "Empieza aquí"}
                            </span>
                          )}
                        </div>
                        <div className="session-number">
                          SESIÓN {String(i + 1).padStart(2, "0")}
                        </div>
                        <h3>
                          {s.title}
                          <Icon name="arrow" size={18} />
                        </h3>
                        <p>{s.desc}</p>
                        <div className="session-footer">
                          <div className="level-dots">
                            {s.levels.map((_, j) => (
                              <span
                                key={j}
                                className={
                                  progress.includes(`${i + 1}-${j + 1}`) ? "level-done" : ""
                                }
                              >
                                {progress.includes(`${i + 1}-${j + 1}`) ? (
                                  <Icon name="check" size={10} />
                                ) : null}
                              </span>
                            ))}
                          </div>
                          <span>
                            {count} de {s.levels.length} niveles
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  <div className="journey-card">
                    <span className="journey-symbol">∴</span>
                    <h3>
                      No se trata solo de llegar.
                      <br />
                      Se trata de entender.
                    </h3>
                    <p>
                      Cada regla que dominas es una nueva
                      <br />
                      forma de mirar un problema.
                    </p>
                    <button onClick={() => go("help")}>
                      ¿Cómo funciona LogiQuest? <Icon name="arrow" size={16} />
                    </button>
                  </div>
                </div>
              </section>
              <div className="academic-banner">
                <span className="banner-icon">
                  <Icon name="shield" size={23} />
                </span>
                <div>
                  <strong>Aprendes tú. Aprendemos todos.</strong>
                  <p>
                    LogiQuest es parte de un estudio académico. Tu participación es voluntaria y no
                    afecta tu nota.
                  </p>
                </div>
                <button onClick={() => go("consent")}>
                  Conoce el estudio <Icon name="arrow" size={16} />
                </button>
              </div>
            </>
          )}
          {page === "consent" && (
            <div className="narrow">
              <div className="eyebrow">ANTES DE EMPEZAR</div>
              <h1>Tu aprendizaje, tu decisión.</h1>
              <p className="lead">
                Te invitamos a participar en el estudio de LogiQuest de la Universidad Distrital
                Francisco José de Caldas.
              </p>
              <section className="panel consent-panel">
                <Icon name="shield" size={32} />
                <h2>Consentimiento informado</h2>
                <p>
                  Estudiamos cómo una ruta interactiva puede apoyar el aprendizaje de demostraciones
                  de deducción natural.
                </p>
                <ul className="consent-list">
                  <li>
                    Tu participación es <strong>voluntaria</strong>. Puedes retirarte cuando
                    quieras.
                  </li>
                  <li>
                    Los datos se usan <strong>solo con fines académicos</strong>.
                  </li>
                  <li>
                    Participar, no participar o retirarte <strong>no afecta tu nota</strong>.
                  </li>
                  <li>
                    Usamos un código, no tu nombre. En este prototipo los datos solo se guardan en
                    este navegador; no se envían a un servidor.
                  </li>
                  <li>
                    Se registra tu consentimiento, progreso, intentos de prueba, borradores,
                    reflexiones y respuestas a cuestionarios. Los códigos deben ser anónimos: no
                    uses tu número de documento.
                  </li>
                </ul>
                {code ? (
                  <div className="success-box">
                    Participación activa con el código <strong>{code}</strong>.
                    <button
                      className="text-btn"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "¿Retirarte del estudio? Se borrarán tus datos (progreso, respuestas y reflexiones). Esta acción no se puede deshacer.",
                          )
                        )
                          return;
                        if (apiActiva && !(await borrarRemoto())) {
                          setToast("No se pudo borrar en el servidor. Revisa tu conexión e inténtalo de nuevo.");
                          return;
                        }
                        eliminarEstudiante(code);
                        cerrarSesion();
                        guestDrafts.current = {};
                        setCode("");
                        setControl(false);
                        localStorage.removeItem("lq-code");
                        setToast("Te has retirado y tus datos fueron borrados.");
                        go("home");
                      }}
                    >
                      Retirarme y borrar mis datos
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!accepted || !draft.trim()) return;
                      let c = draft.trim();
                      if (apiActiva) {
                        const s = await iniciarSesion(c);
                        if (!s.ok) {
                          setToast(s.error);
                          return;
                        }
                        c = s.codigo;
                        setControl(s.grupo === "control");
                        if (!(await consentimientoRemoto())) {
                          setToast("No se pudo registrar el consentimiento. Inténtalo de nuevo.");
                          return;
                        }
                        const remoto = await registroRemoto();
                        if (remoto) importarRegistro(remoto);
                      }
                      guardarConsentimiento(c);
                      if (returnAfterConsent === "surveys")
                        guardarBorradorRespuestas(c, instrument, moment, answers);
                      if (returnAfterConsent === "session" && reflection.trim())
                      {
                        guardarReflexion(c, si + 1, reflection);
                        enviar("PUT", "/api/reflexion", { sesion: si + 1, texto: reflection });
                      }
                      localStorage.setItem("lq-code", c);
                      setCode(c);
                      const saved = listarEstudiantes().find((r) => r.codigo === c)?.taller;
                      const resume =
                        saved && saved.sesion === si + 1 && saved.nivel === li + 1
                          ? saved
                          : undefined;
                      setTree(resume?.arbol || root(sessions[si].levels[li]));
                      setSelected(resume?.seleccion || 0);
                      setHistory(resume?.historial || []);
                      setLast(resume?.ultimoPaso || "Todavía no has aplicado ninguna regla.");
                      go(returnAfterConsent);
                      setToast("Consentimiento guardado. ¡Bienvenido/a a LogiQuest!");
                    }}
                  >
                    <label className="field-label" htmlFor="student-code">
                      Código de estudiante
                    </label>
                    <input
                      id="student-code"
                      placeholder="Ej. LQ-024"
                      value={draft}
                      required
                      maxLength={40}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <small className="muted">Usa el código anónimo asignado para el estudio.</small>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                        required
                      />
                      He leído la información y acepto participar.
                    </label>
                    <button className="btn primary" type="submit">
                      Guardar y continuar <Icon name="arrow" size={17} />
                    </button>
                  </form>
                )}
              </section>
              <button className="text-btn" onClick={() => go("home")}>
                Volver a explorar sin participar
              </button>
            </div>
          )}
          {page === "session" && (
            <>
              <button className="back-link" onClick={() => go("home")}>
                <Icon name="back" size={16} />
                Mi ruta de aprendizaje
              </button>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    SESIÓN {si + 1} · SEMANA {sessions[si].week}
                  </div>
                  <h1>{sessions[si].title}</h1>
                  <p>{sessions[si].desc}</p>
                </div>
                <span className="large-symbol">{sessions[si].symbol}</span>
              </div>
              <div className="session-detail-grid">
                <section className="panel lesson">
                  <span className="eyebrow">ANTES DE DEMOSTRAR</span>
                  <h2>Una idea para empezar</h2>
                  <p>
                    {
                      [
                        "Una conjunción une dos ideas. Si tienes A∧B, puedes tomar A o B por separado (∧E). Para demostrar A∧B, demuestra primero A y después B (∧I).",
                        "Una implicación conecta una condición con una consecuencia. Para probar A→B, supón A y prueba B (→I). Si tienes A y A→B, puedes obtener B (→E).",
                        "Para demostrar A∨B basta demostrar una de las alternativas (∨I). Si tienes A∨B, considera ambos casos y llega a la misma conclusión (∨E).",
                        "Negar A significa que suponer A lleva a una contradicción (¬I). A y ¬A producen ⊥ (¬E); de ⊥ se puede concluir cualquier fórmula (⊥E).",
                        "Combina lo aprendido: mira la forma de la meta, elige una regla y resuelve las submetas, una a la vez. Puedes deshacer cualquier paso.",
                        "Resuelve la prueba en el taller y después copia la derivación en papel. Identifica las hipótesis que introduces y cuándo las descargas.",
                        "Elige tu propia estrategia. Inspecciona las hipótesis antes de actuar y prueba otras rutas si una no te lleva a la meta.",
                      ][si]
                    }
                  </p>
                  <div className="rule-chip">{sessions[si].rules}</div>
                  <div className="info-box">
                    <Icon name="bulb" />
                    <p>
                      No necesitas memorizarlo todo. El taller te mostrará qué reglas puedes usar y
                      por qué.
                    </p>
                  </div>
                  <h3>Al finalizar, reflexiona</h3>
                  <label htmlFor="reflection" className="muted">
                    ¿Qué estrategia te ayudó a avanzar?
                  </label>
                  <textarea
                    id="reflection"
                    placeholder="Escribe una idea que quieras recordar…"
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                  />
                  <button
                    className="btn secondary"
                    disabled={!reflection.trim()}
                    onClick={() => {
                      if (!code) {
                        go("consent");
                        return;
                      }
                      guardarReflexion(code, si + 1, reflection);
                      enviar("PUT", "/api/reflexion", { sesion: si + 1, texto: reflection });
                      setToast("Reflexión guardada.");
                    }}
                  >
                    Guardar reflexión
                  </button>
                </section>
                <section className="panel">
                  <h2>
                    Tus niveles <span className="count-badge">{sessions[si].levels.length}</span>
                  </h2>
                  <p className="muted">Empieza por el primero o elige uno para practicar.</p>
                  <div className="level-list">
                    {sessions[si].levels.map((l, j) => (
                      <button key={l} onClick={() => start(si, j)}>
                        <span
                          className={`level-number ${progress.includes(`${si + 1}-${j + 1}`) ? "done" : ""}`}
                        >
                          {progress.includes(`${si + 1}-${j + 1}`) ? (
                            <Icon name="check" size={18} />
                          ) : (
                            j + 1
                          )}
                        </span>
                        <span>
                          <small>NIVEL {j + 1}</small>
                          <strong className="formula">{l}</strong>
                        </span>
                        <Icon name="arrow" size={18} />
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn primary full"
                    onClick={() =>
                      start(
                        si,
                        Math.max(
                          0,
                          sessions[si].levels.findIndex(
                            (_, j) => !progress.includes(`${si + 1}-${j + 1}`),
                          ),
                        ),
                      )
                    }
                  >
                    Empezar <Icon name="arrow" size={17} />
                  </button>
                </section>
              </div>
            </>
          )}
          {page === "workshop" && (
            <>
              <button className="back-link" onClick={() => go("session")}>
                <Icon name="back" size={16} />
                {sessions[si].title} · Sesión {si + 1}
              </button>
              <div className="workshop-heading">
                <div>
                  <div className="eyebrow">
                    NIVEL {li + 1} DE {sessions[si].levels.length}
                  </div>
                  <h1 className="statement">{sessions[si].levels[li]}</h1>
                  <p>
                    Selecciona una meta y elige una regla para avanzar. Tu intento se guarda
                    automáticamente en este navegador.
                  </p>
                </div>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={guided}
                    onChange={(e) => setGuided(e.target.checked)}
                  />
                  <span className="toggle" />
                  Modo guiado
                </label>
              </div>
              <div className="workshop-toolbar">
                <span>
                  <span className="tiny-dot" />
                  {complete
                    ? "Prueba completada"
                    : `${nodes.filter(closed).length} de ${nodes.length} metas cerradas`}
                </span>
                <div>
                  <button
                    className="btn secondary small"
                    disabled={!history.length}
                    onClick={() => {
                      const prev = history.at(-1)!;
                      setTree(prev);
                      setHistory(history.slice(0, -1));
                      setSelected(flatten(prev).find((g) => !g.rule)?.id || 0);
                      setLast("Se ha deshecho el último paso.");
                    }}
                  >
                    <Icon name="back" size={16} />
                    Deshacer
                  </button>
                  <button
                    className="btn secondary small"
                    onClick={() => {
                      if (
                        history.length &&
                        !window.confirm(
                          "¿Reiniciar este intento? Se borrarán sus pasos, pero conservarás los niveles ya completados.",
                        )
                      )
                        return;
                      setTree(root(sessions[si].levels[li]));
                      setHistory([]);
                      setSelected(0);
                      setLast("Prueba reiniciada.");
                    }}
                  >
                    <Icon name="reset" size={16} />
                    Reiniciar
                  </button>
                  <button
                    className="btn hint small"
                    disabled={complete}
                    onClick={() => setHint(!hint)}
                  >
                    <Icon name="bulb" size={16} />
                    Pista
                  </button>
                </div>
              </div>
              <div className="workshop-grid">
                <section className="panel goal-panel">
                  <div className="panel-heading">
                    <h2>Árbol de metas</h2>
                    <span>DE LO GENERAL A LO SIMPLE</span>
                  </div>
                  {renderGoal(tree)}
                  <div className="tree-caption">
                    <Icon name="help" size={16} />
                    Cada rama es un pequeño paso hacia tu demostración.
                  </div>
                </section>
                <section className="panel action-panel">
                  <div className="panel-heading">
                    <h2>{complete ? "¡Prueba completa!" : "Tu siguiente paso"}</h2>
                    <span>META {current.id + 1}</span>
                  </div>
                  {complete ? (
                    <>
                      <div className="completion-icon">
                        <Icon name="check" size={30} />
                      </div>
                      <h3>Una idea más, demostrada.</h3>
                      <p>
                        Tu progreso está guardado. Copia esta derivación y reconstruye el
                        razonamiento en papel.
                      </p>
                      <pre className="derivation">{derivacion}</pre>
                      <button
                        className="btn secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(derivacion);
                            setToast("Derivación copiada.");
                          } catch {
                            setToast("No se pudo copiar. Selecciona el texto de la derivación.");
                          }
                        }}
                      >
                        <Icon name="copy" size={16} />
                        Copiar derivación
                      </button>
                      <button
                        className="btn primary full"
                        onClick={() =>
                          li + 1 < sessions[si].levels.length
                            ? start(si, li + 1)
                            : si < 6
                              ? (setSi(si + 1), go("session"))
                              : go("home")
                        }
                      >
                        {li + 1 < sessions[si].levels.length
                          ? "Siguiente nivel"
                          : si < 6
                            ? "Siguiente sesión"
                            : "Volver a mi recorrido"}
                        <Icon name="arrow" size={17} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="selected-formula">
                        <small>QUIERES DEMOSTRAR</small>
                        <strong className="formula">{fmt(current.f)}</strong>
                        <div className="chips">
                          {current.hs.map((h, i) => (
                            <span key={i}>{fmt(h)}</span>
                          ))}
                        </div>
                      </div>
                      {(guided || hint) && available.length > 0 && (
                        <div className="hint-box">
                          <Icon name="bulb" size={20} />
                          <p>
                            <strong>Un buen siguiente paso: {recommended?.name}</strong>
                            {recommended?.description}{" "}
                            {recommended &&
                              (recommended.goals.length === 0
                                ? "Con esto cierras esta meta."
                                : `Así queda en ${recommended.goals.length} submeta${recommended.goals.length > 1 ? "s" : ""} más sencilla${recommended.goals.length > 1 ? "s" : ""}.`)}
                          </p>
                        </div>
                      )}
                      {["Cerrar", "Sobre la meta", "Con una hipótesis"].map((group, k) => {
                        const grouped = available.filter((a) =>
                          k === 0
                            ? a.goals.length === 0
                            : k === 1
                              ? a.goals.length > 0 && /^[∧→¬∨]I/.test(a.name)
                              : a.goals.length > 0 && !/^[∧→¬∨]I/.test(a.name),
                        );
                        return (
                          grouped.length > 0 && (
                            <div className="action-group" key={group}>
                              <h3>{group}</h3>
                              {grouped.map((a, i) => (
                                <button
                                  className={`rule-button ${(guided || hint) && a === recommended ? "recommended" : ""}`}
                                  key={i}
                                  onClick={() => apply(a)}
                                >
                                  <span>
                                    <strong>{a.name}</strong>
                                    <small>{a.description}</small>
                                  </span>
                                  <Icon name="arrow" size={17} />
                                </button>
                              ))}
                            </div>
                          )
                        );
                      })}
                      {!available.length && (
                        <div className="info-box">
                          Esta meta ya tiene una regla. Selecciona una submeta abierta en el árbol.
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
              <div className="last-step">
                <Icon name="clock" size={16} />
                <strong>Último paso →</strong> {last}
              </div>
            </>
          )}
          {page === "surveys" && (
            <>
              <div className="eyebrow">TU EXPERIENCIA TAMBIÉN CUENTA</div>
              <h1>Un momento para reflexionar.</h1>
              <p className="lead">
                No hay respuestas correctas o incorrectas. Responde según tu experiencia.
              </p>
              <div className="survey-layout">
                <section className="panel survey-settings">
                  <h2>Elige tu cuestionario</h2>
                  <label className="field-label" htmlFor="instrument">
                    Instrumento
                  </label>
                  <select
                    id="instrument"
                    value={instrument}
                    onChange={(e) => {
                      setInstrument(e.target.value);
                      if (e.target.value !== "IMI") setMoment("final");
                    }}
                  >
                    <option>IMI</option>
                    <option>Compromiso</option>
                    {!control && <option>SUS</option>}
                  </select>
                  <label className="field-label" htmlFor="moment">
                    Momento
                  </label>
                  <select id="moment" value={moment} onChange={(e) => setMoment(e.target.value)}>
                    {instrument === "IMI" && <option value="inicial">Inicial</option>}
                    <option value="final">Final</option>
                  </select>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={control}
                      disabled={apiActiva}
                      onChange={(e) => {
                        setControl(e.target.checked);
                        if (instrument === "SUS") setInstrument("IMI");
                      }}
                    />
                    Pertenezco al grupo de control
                  </label>
                  <div className="info-box">
                    <Icon name="shield" />
                    <p>
                      Las respuestas se asocian solo a tu código anónimo y se guardan en este
                      dispositivo.
                    </p>
                  </div>
                  {instrument !== "SUS" && (
                    <>
                      <p className="muted">
                        Ítems de ejemplo, pendientes de la versión validada. No usar para
                        conclusiones del estudio.
                      </p>
                      <button className="text-btn" onClick={() => setEditing(!editing)}>
                        {editing ? "Terminar edición" : "Editar ítems de ejemplo"}
                      </button>
                    </>
                  )}
                </section>
                <section className="panel questionnaire">
                  <div className="section-card-heading">
                    <h2>
                      {instrument === "IMI"
                        ? "Motivación intrínseca"
                        : instrument === "SUS"
                          ? "Usabilidad del sistema"
                          : "Compromiso con el aprendizaje"}
                    </h2>
                    <span className="count-badge">
                      {Object.keys(answers).length} / {items[instrument].length}
                    </span>
                  </div>
                  <div
                    className="progress-bar"
                    role="progressbar"
                    aria-label="Ítems respondidos"
                    aria-valuemin={0}
                    aria-valuemax={items[instrument].length}
                    aria-valuenow={Object.keys(answers).length}
                  >
                    <span
                      style={{
                        width: `${(Object.keys(answers).length / items[instrument].length) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="muted" role="status">
                    {score !== null
                      ? "Respuestas guardadas recuperadas. Puedes revisarlas y volver a guardar."
                      : code
                        ? "Borrador automático en este navegador. Pulsa Guardar respuestas para incluirlo en la exportación."
                        : "Puedes responder ahora. Te pediremos consentimiento antes de guardar tus respuestas."}
                  </p>
                  <p className="muted">
                    1 = Totalmente en desacuerdo · {instrument === "IMI" ? 7 : 5} = Totalmente de
                    acuerdo
                  </p>
                  {items[instrument].map((item, i) => (
                    <fieldset
                      className={`likert-item ${invalid && !answers[i] ? "unanswered" : ""}`}
                      key={instrument + i}
                    >
                      <legend>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        {editing && instrument !== "SUS" ? (
                          <input
                            aria-label={`Editar ítem ${i + 1}`}
                            value={item}
                            onChange={(e) =>
                              setItems({
                                ...items,
                                [instrument]: items[instrument].map((v, j) =>
                                  j === i ? e.target.value : v,
                                ),
                              })
                            }
                          />
                        ) : (
                          item
                        )}
                      </legend>
                      {instrument !== "SUS" && (
                        <small className="dimension">
                          {instrument === "IMI"
                            ? ["Interés", "Competencia", "Esfuerzo", "Valor"][Math.floor(i / 2)]
                            : ["Conductual", "Emocional", "Cognitiva"][Math.floor(i / 2)]}
                        </small>
                      )}
                      <div className="likert-scale">
                        {Array.from({ length: instrument === "IMI" ? 7 : 5 }, (_, j) => (
                          <label key={j} className={answers[i] === j + 1 ? "chosen" : ""}>
                            <input
                              type="radio"
                              name={`q${i}`}
                              checked={answers[i] === j + 1}
                              value={j + 1}
                              onChange={() => {
                                const updated = { ...answers, [i]: j + 1 };
                                guestDrafts.current[`${instrument}-${moment}`] = updated;
                                setAnswers(updated);
                                if (code)
                                  guardarBorradorRespuestas(code, instrument, moment, updated);
                                setScore(null);
                              }}
                            />
                            <span>{j + 1}</span>
                          </label>
                        ))}
                      </div>
                      {invalid && !answers[i] && (
                        <small className="error">Selecciona una respuesta para este ítem.</small>
                      )}
                    </fieldset>
                  ))}
                  {score !== null && (
                    <div className="success-box">
                      Cuestionario guardado.
                      {instrument === "SUS" && <strong> Puntaje SUS: {score} / 100</strong>}
                    </div>
                  )}
                  {invalid && Object.keys(answers).length < items[instrument].length && (
                    <p className="error" role="alert">
                      Faltan ítems por responder. Revisa los campos señalados.
                    </p>
                  )}
                  <button
                    className="btn primary"
                    onClick={() => {
                      setInvalid(true);
                      if (Object.keys(answers).length !== items[instrument].length) {
                        requestAnimationFrame(() => {
                          document
                            .querySelector(".unanswered")
                            ?.scrollIntoView({ behavior: "smooth", block: "center" });
                          document
                            .querySelector<HTMLInputElement>(".unanswered input")
                            ?.focus({ preventScroll: true });
                        });
                        return;
                      }
                      if (!code) {
                        go("consent", "surveys");
                        return;
                      }
                      const values = items[instrument].map((_, i) => answers[i]);
                      guardarRespuestas(code, instrument, moment, values);
                      enviar("PUT", "/api/respuestas", { instrumento: instrument, momento: moment, valores: values });
                      setScore(
                        instrument === "SUS"
                          ? values.reduce((n, v, i) => n + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5
                          : 0,
                      );
                      setToast("Respuestas guardadas en este navegador.");
                    }}
                  >
                    Guardar respuestas <Icon name="check" size={17} />
                  </button>
                </section>
              </div>
            </>
          )}
          {page === "teacher" && (
            <>
              <div className="eyebrow">ACOMPAÑA EL PROCESO</div>
              <h1>El aprendizaje, en perspectiva.</h1>
              <p className="lead">Progreso del grupo y guía para llevar cada sesión al aula.</p>
              <div className="notice">
                <Icon name="shield" />
                <span>
                  {apiActiva
                    ? "Conectado al servidor del estudio. Los datos provienen de la base de datos, no de este navegador."
                    : "Vista de demostración sin autenticación. Solo muestra registros de este navegador, no un grupo conectado."}
                </span>
              </div>
              {apiActiva ? (
                <TeacherRemote />
              ) : (
              <section className="panel">
                <div className="section-card-heading">
                  <h2>Progreso de estudiantes</h2>
                  <span className="count-badge">{listarEstudiantes().length} estudiantes</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Sesión actual</th>
                        <th>Niveles resueltos</th>
                        <th>Último acceso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listarEstudiantes().map((r) => (
                        <tr key={r.codigo}>
                          <td>
                            <strong>{r.codigo}</strong>
                          </td>
                          <td>
                            {r.taller?.sesion ||
                              Math.min(
                                7,
                                sessions.findIndex((s, i) =>
                                  s.levels.some(
                                    (_, j) => !r.progreso.includes(`${i + 1}-${j + 1}`),
                                  ),
                                ) + 1 || 7,
                              )}
                          </td>
                          <td>
                            {r.progreso.length} / {total}
                          </td>
                          <td>{new Date(r.ultimoAcceso).toLocaleString("es-CO")}</td>
                        </tr>
                      ))}
                      {!listarEstudiantes().length && (
                        <tr>
                          <td colSpan={4} className="empty-state">
                            Aún no hay registros. Aparecerán cuando un estudiante acepte participar.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              )}
              <div className="session-detail-grid top-space">
                <section className="panel">
                  <h2>Guía de la sesión</h2>
                  <select
                    aria-label="Sesión de la guía"
                    value={si}
                    onChange={(e) => setSi(+e.target.value)}
                  >
                    {sessions.map((s, i) => (
                      <option key={i} value={i}>
                        Sesión {i + 1}: {s.title}
                      </option>
                    ))}
                  </select>
                  <h3>Objetivo</h3>
                  <p>
                    {sessions[si].desc} Aplicar {sessions[si].rules} y justificar cada paso.
                  </p>
                  <h3>Pasos sugeridos</h3>
                  <ol className="numbered-list">
                    <li>Activar conocimientos previos con un ejemplo en el tablero.</li>
                    <li>Leer la lección y modelar el primer nivel en voz alta.</li>
                    <li>
                      Resolver los niveles individualmente, primero con guía y luego sin ella.
                    </li>
                    <li>Copiar la derivación en papel y compartir una reflexión.</li>
                  </ol>
                  <h3>Qué observar</h3>
                  <p>
                    Selección de reglas, manejo de hipótesis, autonomía ante una submeta y capacidad
                    para explicar la derivación sin el taller.
                  </p>
                </section>
                <section className="panel study-reminders">
                  <Icon name="survey" size={28} />
                  <h2>Recordatorios del estudio</h2>
                  <ul className="consent-list">
                    <li>
                      Aplicar pruebas de entrada y salida <strong>en papel</strong>.
                    </li>
                    <li>IMI: inicial y final, en ambos grupos.</li>
                    <li>Compromiso: al finalizar.</li>
                    <li>SUS: solo grupo experimental, al finalizar.</li>
                    <li>
                      El grupo de control recibe la ruta <strong>al terminar el estudio</strong>.
                    </li>
                    <li>
                      Los instrumentos de ejemplo requieren validación antes de recolectar datos
                      reales.
                    </li>
                  </ul>
                </section>
              </div>
            </>
          )}
          {page === "export" && (
            <>
              <div className="eyebrow">DATOS PARA COMPRENDER</div>
              <h1>Exportación del estudio</h1>
              <p className="lead">Respuestas anónimas, listas para tu análisis.</p>
              <div className="notice">
                <Icon name="shield" />
                <span>
                  {apiActiva
                    ? "Conectado al servidor del estudio. Se exportan solo participantes con consentimiento que no se han retirado."
                    : "Prototipo local sin autenticación. La exportación incluye únicamente datos guardados en este navegador. Usa códigos no identificables."}
                </span>
              </div>
              {apiActiva ? (
                <ExportRemote />
              ) : (
              <section className="panel">
                <div className="section-card-heading">
                  <div>
                    <h2>Vista previa de respuestas</h2>
                    <p className="muted">Una fila por ítem · UTF-8 · Separador: coma</p>
                  </div>
                  <div className="workshop-toolbar">
                    <button className="btn primary" onClick={() => download()}>
                      <Icon name="download" size={18} />
                      Descargar CSV
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() => download(exportarResumenCSV(), "logiquest-resumen.csv")}
                    >
                      Resumen (SUS y subescalas)
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() => download(exportarProgresoCSV(), "logiquest-progreso.csv")}
                    >
                      Progreso
                    </button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {["codigo", "instrumento", "momento", "item", "valor"].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listarEstudiantes().flatMap((s) =>
                        s.respuestas.flatMap((a) =>
                          a.valores.map((v, i) => (
                            <tr key={`${s.codigo}-${a.instrumento}-${a.momento}-${i}`}>
                              <td>{s.codigo}</td>
                              <td>{a.instrumento}</td>
                              <td>{a.momento}</td>
                              <td>{i + 1}</td>
                              <td>{v}</td>
                            </tr>
                          )),
                        ),
                      )}
                      {!listarEstudiantes().some((s) => s.respuestas.length) && (
                        <tr>
                          <td colSpan={5} className="empty-state">
                            <Icon name="survey" size={28} />
                            <h3>Todavía no hay respuestas</h3>
                            <p>Completa un cuestionario para ver aquí los datos del estudio.</p>
                            <button className="text-btn" onClick={() => go("surveys")}>
                              Ir a cuestionarios →
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              )}
            </>
          )}
          {page === "help" && (
            <>
              <div className="eyebrow">SIEMPRE HAY UN SIGUIENTE PASO</div>
              <h1>Demostrar también se aprende.</h1>
              <p className="lead">Una guía corta para sentirte como en casa.</p>
              <div className="help-steps">
                {[
                  [
                    "Elige una sesión",
                    "Sigue la ruta de aprendizaje. Cada sesión presenta una idea y niveles para practicar.",
                  ],
                  [
                    "Mira tu meta",
                    "Lee qué debes demostrar y con qué hipótesis cuentas. Selecciona la tarjeta de la meta.",
                  ],
                  [
                    "Aplica una regla",
                    "El panel solo ofrece pasos válidos. Activa el modo guiado o pide una pista cuando lo necesites.",
                  ],
                  [
                    "Llévalo al papel",
                    "Al cerrar todas las metas, copia la derivación y explica cada paso con tus palabras.",
                  ],
                ].map(([title, desc], i) => (
                  <section className="panel" key={title}>
                    <span className="step-number">0{i + 1}</span>
                    <h2>{title}</h2>
                    <p>{desc}</p>
                  </section>
                ))}
              </div>
              <section className="panel top-space">
                <h2>Un pequeño glosario</h2>
                <div className="glossary">
                  {[
                    ["Meta", "La fórmula que quieres demostrar. Es el destino de tu razonamiento."],
                    [
                      "Hipótesis",
                      "Una fórmula que puedes usar como punto de partida. Algunas se introducen temporalmente.",
                    ],
                    [
                      "Regla",
                      "Un paso lógico válido que conecta lo que sabes con lo que quieres demostrar.",
                    ],
                    [
                      "Submeta",
                      "Una prueba más pequeña que necesitas completar para resolver una meta mayor.",
                    ],
                  ].map(([t, d]) => (
                    <div key={t}>
                      <h3>{t}</h3>
                      <p>{d}</p>
                    </div>
                  ))}
                </div>
                <button className="btn primary" onClick={() => go("home")}>
                  Volver a mi aprendizaje <Icon name="arrow" size={17} />
                </button>
              </section>
            </>
          )}
          <footer>
            <span>
              LogiQuest <span className="footer-dot">·</span> Aprender a demostrar, paso a paso.
            </span>
            <span>Hecho para pensar. Diseñado para aprender.</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
          <button className="icon-btn" aria-label="Cerrar mensaje" onClick={() => setToast("")}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {menu && (
        <button
          className="mobile-overlay"
          aria-label="Cerrar navegación"
          onClick={() => setMenu(false)}
        />
      )}
    </div>
  );
}
export default App;
