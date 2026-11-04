# Migración de Netlify a Cloudflare Pages + D1

Ficheros nuevos (no tocan `public/`):
- `functions/api/ranking.js` — la API, adaptada a Cloudflare (responde en `/api/ranking`, igual que antes).
- `wrangler.toml` — configuración del proyecto y enlace con la base de datos.
- `schema.sql` — tabla de la base de datos.
- `scripts/exportar-netlify.mjs` — descarga los datos de Netlify Blobs.
- `scripts/json-a-sql.mjs` — los convierte en SQL para D1.

## Pasos
1. Cuenta gratuita en dash.cloudflare.com y `npx wrangler login`.
2. `npx wrangler d1 create planes` → copia el `database_id` en `wrangler.toml`.
3. `npx wrangler d1 execute planes --remote --file=schema.sql`
4. Exportar de Netlify: token personal en app.netlify.com → User settings → Applications →
   Personal access tokens. Luego:
   `$env:NETLIFY_SITE_ID="..."; $env:NETLIFY_TOKEN="..."; node scripts/exportar-netlify.mjs`
5. `node scripts/json-a-sql.mjs` y `npx wrangler d1 execute planes --remote --file=importar.sql`
6. `git add` + `commit` + `push`.
7. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → el repositorio.
   Framework: None · Build command: vacío · Build output directory: `public`.
8. `npx wrangler pages secret put RANKING_ADMIN_KEY --project-name <nombre del proyecto>` y volver a desplegar.

## Consultas útiles
    npx wrangler d1 execute planes --remote --command "SELECT k, v FROM kv WHERE k LIKE 'u/%'"
    curl "https://<proyecto>.pages.dev/api/ranking?codigo=Nombre" -H "x-admin-key: TU_CLAVE"
