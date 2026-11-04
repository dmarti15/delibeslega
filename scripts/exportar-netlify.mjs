// Descarga todo el almacén "ranking" de Netlify Blobs a datos-netlify.json
// Uso (PowerShell):
//   $env:NETLIFY_SITE_ID="f0098fc3-..."; $env:NETLIFY_TOKEN="nfp_..."; node scripts/exportar-netlify.mjs
import { getStore } from "@netlify/blobs";
import { writeFileSync } from "node:fs";

const siteID = process.env.NETLIFY_SITE_ID, token = process.env.NETLIFY_TOKEN;
if (!siteID || !token) {
  console.error("Faltan NETLIFY_SITE_ID y NETLIFY_TOKEN (mira las instrucciones al principio del fichero).");
  process.exit(1);
}
const store = getStore({ name: "ranking", siteID, token });
const { blobs } = await store.list();
const datos = {};
let n = 0;
for (const b of blobs) {
  const v = await store.get(b.key); // texto tal cual (JSON)
  if (v !== null) datos[b.key] = v;
  if (++n % 50 === 0) console.log(`  ${n} de ${blobs.length}…`);
}
writeFileSync("datos-netlify.json", JSON.stringify(datos, null, 1));
console.log(`Exportadas ${Object.keys(datos).length} claves a datos-netlify.json`);
