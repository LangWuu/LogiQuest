# LogiQuest

Taller de deducción natural (lógica proposicional) para Matemáticas Discretas, Universidad Distrital Francisco José de Caldas. Incluye el front (React + Vite, generado en Figma Make y corregido) y un servidor opcional para el estudio cuasi-experimental.

## Dos modos de uso

| Modo | Cuándo | Cómo |
|---|---|---|
| **Local** | Demostración o práctica sin recolectar datos | `npm run dev`. Todo se guarda en `localStorage` del navegador. |
| **Con servidor** | Recolección real del estudio | Levantar `server/` y compilar el front con `VITE_API_URL`. |

## Correr en local

```bash
npm install            # o pnpm install
npm run dev            # front en modo local
npm test               # 104 pruebas: lógica, servidor e interfaz
npm run typecheck
```

## Correr con servidor (Node >= 22.18)

```bash
cp .env.example .env   # y completar DOCENTE_TOKEN e INVESTIGADOR_TOKEN (>= 16 caracteres)
export $(grep -v '^#' .env | xargs)
npm run server         # API en http://localhost:3001

echo "VITE_API_URL=http://localhost:3001" > .env.local
npm run dev            # el front ahora valida códigos y sincroniza
```

Flujo del estudio:
1. El **docente** entra a "Panel del docente" con su token y genera códigos anónimos, eligiendo el grupo (experimental o control). El grupo lo fija el servidor; el estudiante no puede cambiarlo.
2. El **estudiante** ingresa su código y acepta el consentimiento. Su progreso, respuestas, reflexiones y borrador del taller se sincronizan; si no hay conexión, se guardan en una cola y se envían al volver.
3. El **investigador** entra a "Exportar datos" con su token y descarga 4 CSV (respuestas, resumen con puntaje SUS y medias por subescala, progreso, reflexiones), todos con columna `grupo`.

## Qué verifica el servidor

- **Progreso:** solo se registra un nivel si llega un árbol de prueba completo, del nivel correcto, y cada paso es una aplicación válida de una regla (`verifyProof` en `src/logic.ts`, el mismo motor del front).
- **Cuestionarios:** instrumento, momento, número de ítems y rango de la escala; el SUS solo lo responde el grupo experimental.
- **Consentimiento:** sin él no se guarda nada.
- **Retiro:** `DELETE /api/mi-registro` borra todo y bloquea el código.
- **Acceso:** tokens de sesión aleatorios (se guarda solo su hash), tokens de rol comparados en tiempo constante, límite de intentos de inicio de sesión, tamaño máximo de solicitud, validación estructural de todo JSON recibido.

## API

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `POST /api/sesion` | estudiante | Valida el código y entrega un token de sesión |
| `POST /api/consentimiento` | estudiante | Registra el consentimiento |
| `GET / DELETE /api/mi-registro` | estudiante | Lee o borra todos sus datos |
| `PUT /api/progreso`, `/respuestas`, `/reflexion`, `/taller` | estudiante | Guardan datos (requieren consentimiento) |
| `POST /api/codigos` | docente | Genera códigos `LQ-XXXX-XXXX` por grupo |
| `GET /api/estudiantes` | docente | Progreso del grupo (sin respuestas) |
| `GET /api/export/{respuestas,resumen,progreso,reflexiones}.csv` | investigador | Exportaciones |

## Qué cambió respecto a la versión de Figma Make

- Se quitó el periodo fijo "2026-I": ahora dice "Periodo académico en curso".
- La derivación copiada y la mostrada ahora son idénticas.
- La pista explica la regla recomendada y su efecto, en vez de un texto genérico.
- "Retirarme" ahora borra los datos (antes los conservaba).
- Nuevos CSV: resumen con puntaje SUS y medias por subescala, y progreso.
- Nuevo `verifyProof` en la lógica, con pruebas.
- La pertenencia al grupo de control ya no es una casilla del estudiante cuando hay servidor.

## Pendiente antes de aplicar el estudio con estudiantes

1. **Ítems del IMI y de compromiso:** siguen siendo de ejemplo. Reemplazar por la versión traducida y validada, y ajustar tras el juicio de expertos.
2. **Datos personales (Ley 1581 de 2012):** definir con la universidad el aviso de privacidad, el responsable del tratamiento, la retención y el comité de ética.
3. **Despliegue:** servir todo por HTTPS, fijar `CORS_ORIGIN`, hacer copias de seguridad de `logiquest.db`.
4. **SQLite de Node:** `node:sqlite` es experimental en Node 22. Para producción a largo plazo, cambiar a `better-sqlite3` o PostgreSQL (la capa de datos está concentrada en `server/app.ts`).
5. **Tokens de docente e investigador:** son un mecanismo simple de acceso. Si habrá varios docentes, pasar a cuentas individuales.
