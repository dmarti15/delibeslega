-- Tabla única clave-valor (las mismas claves que usaba Netlify Blobs: u/<id>, r/..., s/..., e/..., p/..., pr/..., ld/..., feed)
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
