import { crearApp } from "./app.ts";

const docenteToken = process.env.DOCENTE_TOKEN || "";
const investigadorToken = process.env.INVESTIGADOR_TOKEN || "";
for (const [n, v] of [["DOCENTE_TOKEN", docenteToken], ["INVESTIGADOR_TOKEN", investigadorToken]])
  if (v.length < 16) console.warn(`⚠ ${n} no definido o menor de 16 caracteres: los endpoints de ese rol quedan inaccesibles.`);
const { server } = crearApp({
  dbFile: process.env.DB_FILE || "./logiquest.db",
  docenteToken: docenteToken.length >= 16 ? docenteToken : "",
  investigadorToken: investigadorToken.length >= 16 ? investigadorToken : "",
  corsOrigin: process.env.CORS_ORIGIN,
  trustProxy: process.env.TRUST_PROXY === "1",
});
const port = Number(process.env.PORT || 3001);
server.listen(port, () => console.log(`LogiQuest API en http://localhost:${port}`));
