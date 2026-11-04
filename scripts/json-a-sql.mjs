// Convierte datos-netlify.json en importar.sql para cargarlo en D1:
//   node scripts/json-a-sql.mjs
//   npx wrangler d1 execute planes --remote --file=importar.sql
import { readFileSync, writeFileSync } from "node:fs";

const datos = JSON.parse(readFileSync("datos-netlify.json", "utf8"));
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lineas = Object.entries(datos).map(([k, v]) => `INSERT OR REPLACE INTO kv (k, v) VALUES (${q(k)}, ${q(v)});`);
writeFileSync("importar.sql", lineas.join("\n") + "\n");
console.log(`importar.sql listo: ${lineas.length} filas`);
