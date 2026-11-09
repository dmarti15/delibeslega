// API de rankings para todos los planes de trabajo (versión para Cloudflare Pages + D1).
//
// Cada dispositivo tiene un id oculto (u/<id> guarda su nombre visible). Cambiar de
// nombre solo actualiza u/<id>, así que el alumno no aparece dos veces.
//
// GET    /api/ranking?juego=europa&seccion=paises[&id=X]        -> top 10 de la sección (+ "yo")
// GET    /api/ranking?juego=europa&tabla=minutos|partidas[&id=X] -> top 10 del plan (+ "yo")
// GET    /api/ranking?juego=mates&tabla=examen[&id=X]            -> top 10 del examen (estrellas)
// GET    /api/ranking?juego=mates&tabla=problemas[&id=X]         -> top 10 de problemas resueltos
// POST   /api/ranking {accion:"problema", id, juego}             -> suma 1 problema resuelto
// POST   /api/ranking {accion:"perfil",  id, alias[, legado]}    -> guarda o cambia el nombre; devuelve su código
// POST   /api/ranking {accion:"entrar", alias}                   -> entra como un jugador ya existente (devuelve su id)
// GET    /api/ranking?progreso=<juego>&id=X                     -> estrellas y logros guardados del jugador
// POST   /api/ranking {accion:"progreso", id, juego, datos}       -> guarda estrellas y logros del jugador
// GET    /api/ranking?codigo=Nombre   cabecera x-admin-key        -> el profe consulta el código de un nombre
// POST   /api/ranking {accion:"logro", id, juego, logro}          -> anuncia un logro conseguido
// GET    /api/ranking?feed=1                                      -> últimos logros de todos (portada)
// GET    /api/ranking?general=racha|estrellas|logros[&id=X]        -> ranking general de todas las asignaturas
// POST   /api/ranking {accion:"racha", id, racha[, rota, juego]}  -> mejor racha; con rota:true y más de 25, aviso en la portada
// POST   /api/ranking {accion:"partida", juego, seccion, modo, id, alias, tiempo, fallos, pistas}
//          modo "temario" entra en el ranking de tiempos; "todo" y "practica" solo suman minutos y partidas
// POST   /api/ranking {accion:"examen", juego, id, alias, aciertos, tiempo}   (10 preguntas, media estrella cada una)
// DELETE /api/ranking?juego=europa[&seccion=paises|stats]  | ?todo=1   cabecera x-admin-key
//
// Claves (tabla kv de D1):  u/<id>   r/<juego>/<seccion>/<id>   s/<juego>/<id>   e/<juego>/<id>
//                   feed (últimos logros)   ld/<juego>/<logro>/<id> (para no repetir un logro)
//                   p/<juego>/<id> (estrellas y logros, para no perderlos si se borra el navegador)
//                   pr/<juego>/<id> (problemas resueltos)   g/<id> (mejor racha)

// ---------------------------------------------------------------------------------------
// Almacén sobre Cloudflare D1. Imita la API de Netlify Blobs que usaba la versión anterior
// (get, setJSON, delete, list) sobre una tabla clave-valor:  kv(k TEXT PRIMARY KEY, v TEXT)
// ---------------------------------------------------------------------------------------
const FIN = "\uffff"; // las claves de un prefijo p están entre p y p + FIN
function almacen(db) {
  return {
    async get(k, o) {
      const r = await db.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first();
      if (!r) return null;
      return o && o.type === "json" ? JSON.parse(r.v) : r.v;
    },
    async setJSON(k, v) {
      await db.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, JSON.stringify(v)).run();
    },
    async delete(k) {
      await db.prepare("DELETE FROM kv WHERE k = ?").bind(k).run();
    },
    async list(o = {}) {
      const p = o.prefix || "";
      const { results } = await db.prepare("SELECT k FROM kv WHERE k >= ? AND k < ?").bind(p, p + FIN).all();
      return { blobs: results.map((r) => ({ key: r.k })) };
    },
    // Lee claves y valores de un prefijo en una sola consulta
    async listValues(p) {
      const { results } = await db.prepare("SELECT k, v FROM kv WHERE k >= ? AND k < ?").bind(p, p + FIN).all();
      return results;
    },
  };
}


// Tiempo mínimo creíble (s) para terminar cada sección
const JUEGOS = {
  europa: { paises: 20, rios: 5, mares: 5, montanas: 5, capitales: 30 },
  mates: { conceptos: 10, multiplos: 15, divisores: 15, divisibilidad: 15, mcd: 20, mcm: 20,
           poliedros_partes: 10, poliedros_tipos: 10, problemas: 25, primos: 10, redondos: 10 },
  lengua: { det_encontrar: 15, det_clasificar: 10, vocales: 8, diptongo: 8, letra_v: 8, polisemicas: 10, homofonas: 10 },
  tablas: { t2: 8, t3: 8, t4: 8, t5: 8, t6: 8, t7: 8, t8: 8, t9: 8, t10: 8, mezcla: 8 },
  ingles: { vocab: 8, spelling: 10, tobe: 8, regulares: 10, irregulares: 10, frases: 10, ordenador: 8, repaso1: 8 },
};
// Planes con examen y tiempo mínimo creíble (s) para hacerlo
const EXAMENES = { mates: 20, lengua: 20, tablas: 15, ingles: 20 };
const PREGUNTAS_EXAMEN = 10;
// Planes con ranking de problemas y tiempo mínimo entre dos problemas resueltos (ms)
const PROBLEMAS = { mates: 8000 };
const PEN_FALLO = 5;
const PEN_PISTA = 15;
const TOP = 10;
const FEED_MAX = 60;
const PROHIBIDAS = ["puta", "puto", "mierda", "joder", "cabron", "gilipollas", "polla", "cono", "follar",
  "imbecil", "subnormal", "maricon", "zorra", "idiota", "tonto", "tonta", "caca", "culo", "nazi", "hitler",
  "fuck", "shit"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const aliasId = (a) => norm(a).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const r1 = (n) => Math.round(n * 10) / 10;
const idOk = (id) => typeof id === "string" && /^[A-Za-z0-9-]{16,64}$/.test(id);
const limpiar = (a) => String(a || "").trim().replace(/\s+/g, " ");

function errorNombre(alias) {
  if (!/^[\p{L}\p{N} ]{2,16}$/u.test(alias)) return "El nombre debe tener de 2 a 16 letras o números";
  const plano = norm(alias).replace(/[^a-z0-9]/g, "");
  if (PROHIBIDAS.some((p) => plano.includes(p))) return "Elige otro nombre";
  return null;
}

async function leerTodo(store, prefijo) {
  const filas = await store.listValues(prefijo);
  return filas.map((r) => {
    try { return { ...JSON.parse(r.v), _id: r.k.slice(prefijo.length) }; } catch { return null; }
  }).filter(Boolean);
}
async function nombres(store) {
  const map = {};
  for (const u of await leerTodo(store, "u/")) map[u._id] = u.alias;
  return map;
}

// Código de cada nombre: sirve para usarlo en otro dispositivo o recuperarlo si se borra
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const nuevoCodigo = () => Array.from({ length: 6 }, () => LETRAS[Math.floor(Math.random() * LETRAS.length)]).join("");
const limpiarCodigo = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Guarda el nombre del dispositivo comprobando que no lo use otro. Devuelve {error} o {clave}
async function guardarUsuario(store, id, alias) {
  const err = errorNombre(alias);
  if (err) return { error: err };
  const usados = await leerTodo(store, "u/");
  const k = aliasId(alias);
  if (usados.some((u) => u._id !== id && aliasId(u.alias) === k))
    return { error: "Ya hay un jugador con ese nombre.", ocupado: true };
  const yo = usados.find((u) => u._id === id);
  const clave = (yo && yo.clave) || nuevoCodigo();
  await store.setJSON(`u/${id}`, { alias, clave, fecha: new Date().toISOString() });
  return { clave };
}

// Pasa los datos de la versión anterior (claves por nombre) al id del dispositivo
async function migrarLegado(store, id, legado) {
  const viejo = aliasId(legado);
  if (!viejo) return 0;
  let n = 0;
  for (const s of Object.keys(JUEGOS.europa)) {
    const v = await store.get(`${s}/${viejo}`, { type: "json" });
    if (!v) continue;
    const nk = `r/europa/${s}/${id}`;
    if (!(await store.get(nk))) {
      await store.setJSON(nk, { puntos: v.puntos, tiempo: v.tiempo, fallos: v.fallos, pistas: v.pistas, fecha: v.fecha });
    }
    await store.delete(`${s}/${viejo}`);
    n++;
  }
  const st = await store.get(`stats/${viejo}`, { type: "json" });
  if (st) {
    if (!(await store.get(`s/europa/${id}`)))
      await store.setJSON(`s/europa/${id}`, { segundos: st.segundos, partidas: st.partidas, fecha: st.fecha });
    await store.delete(`stats/${viejo}`);
    n++;
  }
  return n;
}

const POR_PUNTOS = (a, b) => a.puntos - b.puntos || String(a.fecha).localeCompare(String(b.fecha));
const TABLAS = {
  minutos: (a, b) => b.segundos - a.segundos || b.partidas - a.partidas,
  partidas: (a, b) => b.partidas - a.partidas || b.segundos - a.segundos,
};

// ---------------------------------------------------------------------------------------
// Ranking general (todas las asignaturas): racha, estrellas y logros
// ---------------------------------------------------------------------------------------
const RACHA_AVISO = 25; // al romperse una racha de más de 25 aciertos sale un aviso en la portada
const estrellasDe = (prog) => Object.values((prog && prog.best) || {}).reduce((t, b) => t + (b.stars || 0), 0);
const GENERAL = ["racha", "estrellas", "logros"];
async function rankingGeneral(store, tipo, id) {
  const valor = {};
  if (tipo === "racha") for (const g of await leerTodo(store, "g/")) valor[g._id] = g.racha;
  if (tipo === "logros") {
    const { blobs } = await store.list({ prefix: "ld/" });
    for (const b of blobs) { const u = b.key.split("/").pop(); valor[u] = (valor[u] || 0) + 1; }
  }
  if (tipo === "estrellas") {
    for (const p of await leerTodo(store, "p/")) { const u = p._id.split("/").pop(); valor[u] = (valor[u] || 0) + estrellasDe(p); }
    for (const e of await leerTodo(store, "e/")) { const u = e._id.split("/").pop(); valor[u] = (valor[u] || 0) + (e.estrellas || 0); }
  }
  const nom = await nombres(store);
  const lista = Object.entries(valor).filter(([u, v]) => nom[u] && v > 0)
    .map(([u, v]) => ({ u, alias: nom[u], valor: v }))
    .sort((a, b) => b.valor - a.valor || a.alias.localeCompare(b.alias, "es"));
  const out = { top: lista.slice(0, TOP).map(({ alias, valor }) => ({ alias, valor })), total: lista.length };
  const i = id ? lista.findIndex((e) => e.u === id) : -1;
  if (i >= 0) out.yo = { posicion: i + 1, alias: lista[i].alias, valor: lista[i].valor };
  return out;
}

const POR_PROBLEMAS = (a, b) => b.resueltos - a.resueltos || String(a.fecha).localeCompare(String(b.fecha));
const vistaProblemas = (e) => ({ alias: e.alias, resueltos: e.resueltos });
// Examen: más aciertos primero; a igualdad, quien lo consiguió antes (el tiempo no cuenta)
const POR_EXAMEN = (a, b) => b.aciertos - a.aciertos || String(a.fecha).localeCompare(String(b.fecha));
const vistaExamen = (e) => ({ alias: e.alias, estrellas: e.estrellas, aciertos: e.aciertos, tiempo: e.tiempo });
const vistaPuntos = (e) => ({ alias: e.alias, puntos: e.puntos, tiempo: e.tiempo, fallos: e.fallos, pistas: e.pistas });
const vistaStats = (e) => ({ alias: e.alias, segundos: e.segundos, partidas: e.partidas });

async function clasificacion(store, prefijo, orden, vista, id) {
  const [filas, nom] = await Promise.all([leerTodo(store, prefijo), nombres(store)]);
  const lista = filas.map((f) => ({ ...f, alias: nom[f._id] || "?" })).sort(orden);
  const out = { top: lista.slice(0, TOP).map(vista), total: lista.length };
  const i = id ? lista.findIndex((e) => e._id === id) : -1;
  if (i >= 0) out.yo = { posicion: i + 1, ...vista(lista[i]) };
  return out;
}

// Cloudflare Pages Functions: este fichero responde en /api/ranking
export async function onRequest(context) {
  const req = context.request, env = context.env;
  const url = new URL(req.url);
  const store = almacen(env.DB);

  if (req.method === "GET" && url.searchParams.has("codigo")) {
    const admin = env.RANKING_ADMIN_KEY;
    if (!admin || req.headers.get("x-admin-key") !== admin) return json({ error: "No autorizado" }, 401);
    const k = aliasId(limpiar(url.searchParams.get("codigo")));
    const u = (await leerTodo(store, "u/")).find((x) => aliasId(x.alias) === k);
    if (!u) return json({ error: "No hay nadie con ese nombre." }, 404);
    let clave = u.clave;
    if (!clave) { clave = nuevoCodigo(); await store.setJSON(`u/${u._id}`, { alias: u.alias, clave, fecha: u.fecha }); }
    return json({ alias: u.alias, clave });
  }

  if (req.method === "GET" && url.searchParams.has("progreso")) {
    const juego = url.searchParams.get("progreso"), id = url.searchParams.get("id") || "";
    if (!(juego in JUEGOS) || !idOk(id)) return json({ error: "Datos no válidos" }, 400);
    // Además del progreso guardado, se reconstruye lo que el servidor ya sabe de este jugador
    // (logros anunciados, mejor examen, problemas resueltos y mejores tiempos), por si el
    // progreso se perdió antes de existir esta copia
    const [datos, marcas, examen, problemas, mejores] = await Promise.all([
      store.get(`p/${juego}/${id}`, { type: "json" }),
      store.list({ prefix: `ld/${juego}/` }),
      store.get(`e/${juego}/${id}`, { type: "json" }),
      store.get(`pr/${juego}/${id}`, { type: "json" }),
      Promise.all(Object.keys(JUEGOS[juego]).map(async (s) => [s, await store.get(`r/${juego}/${s}/${id}`, { type: "json" })])),
    ]);
    const logros = {};
    await Promise.all(marcas.blobs.filter((x) => x.key.endsWith(`/${id}`)).map(async (x) => {
      const m = await store.get(x.key, { type: "json" });
      logros[x.key.split("/")[2]] = (m && m.f) || new Date().toISOString();
    }));
    const extra = {
      logros,
      examen: examen ? { aciertos: examen.aciertos, estrellas: examen.estrellas, tiempo: examen.tiempo } : null,
      problemas: problemas ? problemas.resueltos : 0,
      mejores: Object.fromEntries(mejores.filter(([, v]) => v).map(([s, v]) => [s, v.puntos])),
    };
    return json({ datos: datos || null, extra });
  }

  if (req.method === "GET" && url.searchParams.has("general")) {
    const tipo = url.searchParams.get("general");
    if (!GENERAL.includes(tipo)) return json({ error: "Ranking no válido" }, 400);
    return json(await rankingGeneral(store, tipo, url.searchParams.get("id") || ""));
  }

  if (req.method === "GET" && url.searchParams.has("feed")) {
    const [feed, nom] = await Promise.all([store.get("feed", { type: "json" }), nombres(store)]);
    const lista = (feed || []).filter((e) => nom[e.u]).slice(0, 30)
      .map((e) => e.k ? { alias: nom[e.u], hito: e.k, n: e.n, juego: e.j, fecha: e.f } : { alias: nom[e.u], juego: e.j, logro: e.l, fecha: e.f });
    return json({ logros: lista });
  }

  if (req.method === "GET") {
    const juego = url.searchParams.get("juego") || "";
    const id = url.searchParams.get("id") || "";
    if (!(juego in JUEGOS)) return json({ error: "Plan no válido" }, 400);
    const tabla = url.searchParams.get("tabla");
    if (tabla === "problemas") {
      if (!(juego in PROBLEMAS)) return json({ error: "Este plan no tiene problemas" }, 400);
      return json(await clasificacion(store, `pr/${juego}/`, POR_PROBLEMAS, vistaProblemas, id));
    }
    if (tabla === "examen") {
      if (!(juego in EXAMENES)) return json({ error: "Este plan no tiene examen" }, 400);
      return json(await clasificacion(store, `e/${juego}/`, POR_EXAMEN, vistaExamen, id));
    }
    if (tabla) {
      if (!(tabla in TABLAS)) return json({ error: "Tabla no válida" }, 400);
      return json(await clasificacion(store, `s/${juego}/`, TABLAS[tabla], vistaStats, id));
    }
    const seccion = url.searchParams.get("seccion") || "";
    if (!(seccion in JUEGOS[juego])) return json({ error: "Sección no válida" }, 400);
    return json(await clasificacion(store, `r/${juego}/${seccion}/`, POR_PUNTOS, vistaPuntos, id));
  }

  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "Datos no válidos" }, 400); }
    // Entrar como un jugador que ya existe (otro dispositivo, o se borraron los datos del navegador)
    if (b.accion === "entrar") {
      const k = aliasId(limpiar(b.alias));
      const u = (await leerTodo(store, "u/")).find((x) => aliasId(x.alias) === k);
      if (!u) return json({ error: "No hay nadie con ese nombre." }, 404);
      return json({ ok: true, id: u._id, alias: u.alias });
    }
    const id = String(b.id || "");
    if (!idOk(id)) return json({ error: "Identificador no válido" }, 400);
    const alias = limpiar(b.alias);

    if (b.accion === "perfil") {
      const g = await guardarUsuario(store, id, alias);
      if (g.error) return json({ error: g.error, ocupado: !!g.ocupado }, 409);
      const migrados = b.legado ? await migrarLegado(store, id, limpiar(b.legado)) : 0;
      return json({ ok: true, alias, clave: g.clave, migrados });
    }

    // Suma minutos y partidas del plan (todas las partidas completas, sin penalizaciones)
    async function sumarStats(juego, tiempo) {
      const sk = `s/${juego}/${id}`;
      const st = (await store.get(sk, { type: "json" })) || { segundos: 0, partidas: 0 };
      const stats = { segundos: r1(st.segundos + tiempo), partidas: st.partidas + 1, fecha: new Date().toISOString() };
      await store.setJSON(sk, stats);
      return { segundos: stats.segundos, partidas: stats.partidas };
    }
    async function asegurarUsuario() {
      if (await store.get(`u/${id}`)) return null;
      return (await guardarUsuario(store, id, alias)).error || null;
    }

    if (b.accion === "examen") {
      const juego = String(b.juego || "");
      const aciertos = Number(b.aciertos), tiempo = Number(b.tiempo);
      if (!(juego in EXAMENES)) return json({ error: "Este plan no tiene examen" }, 400);
      if (!Number.isInteger(aciertos) || aciertos < 0 || aciertos > PREGUNTAS_EXAMEN) return json({ error: "Datos del examen no válidos" }, 400);
      if (!Number.isFinite(tiempo) || tiempo < EXAMENES[juego] || tiempo > 3600) return json({ error: "Tiempo no válido" }, 400);
      const errU = await asegurarUsuario();
      if (errU) return json({ error: errU }, 409);
      const resumen = await sumarStats(juego, tiempo);
      const key = `e/${juego}/${id}`;
      const prev = await store.get(key, { type: "json" });
      const mejora = !prev || aciertos > prev.aciertos;
      if (mejora) await store.setJSON(key, { aciertos, estrellas: aciertos / 2, tiempo: r1(tiempo), fecha: new Date().toISOString() });
      const c = await clasificacion(store, `e/${juego}/`, POR_EXAMEN, vistaExamen, id);
      const mejor = mejora ? { estrellas: aciertos / 2, tiempo: r1(tiempo) } : { estrellas: prev.estrellas, tiempo: prev.tiempo };
      return json({ top: c.top, total: c.total, posicion: c.yo ? c.yo.posicion : 0, mejora, mejor, stats: resumen });
    }

    if (b.accion === "problema") {
      const juego = String(b.juego || "");
      if (!(juego in PROBLEMAS)) return json({ error: "Este plan no tiene problemas" }, 400);
      if (!(await store.get(`u/${id}`))) return json({ error: "Pon tu nombre primero" }, 409);
      const key = `pr/${juego}/${id}`, ahora = Date.now();
      const prev = (await store.get(key, { type: "json" })) || { resueltos: 0, ultimo: 0 };
      if (ahora - prev.ultimo < PROBLEMAS[juego]) return json({ error: "Demasiado rápido" }, 429);
      const n = { resueltos: prev.resueltos + 1, ultimo: ahora, fecha: new Date(ahora).toISOString() };
      await store.setJSON(key, n);
      return json({ ok: true, resueltos: n.resueltos });
    }

    if (b.accion === "progreso") {
      const juego = String(b.juego || "");
      if (!(juego in JUEGOS) || !b.datos || typeof b.datos !== "object") return json({ error: "Datos no válidos" }, 400);
      if (JSON.stringify(b.datos).length > 30000) return json({ error: "Demasiados datos" }, 413);
      if (!(await store.get(`u/${id}`))) return json({ error: "Pon tu nombre primero" }, 409);
      await store.setJSON(`p/${juego}/${id}`, b.datos);
      return json({ ok: true });
    }

    if (b.accion === "racha") {
      const r = Number(b.racha);
      if (!Number.isInteger(r) || r < 1 || r > 100000) return json({ error: "Racha no válida" }, 400);
      if (!(await store.get(`u/${id}`))) return json({ error: "Pon tu nombre primero" }, 409);
      const prev = (await store.get(`g/${id}`, { type: "json" })) || { racha: 0, ultimoAviso: 0 };
      const g = { ...prev };
      if (r > prev.racha) { g.racha = r; g.fecha = new Date().toISOString(); }
      // Racha rota de más de 25: aviso en la portada (puede salir muchas veces).
      // Se ignoran avisos del mismo jugador con menos de 20 s de diferencia por si llegan duplicados.
      const juego = String(b.juego || ""), ahora = Date.now();
      if (b.rota && r > RACHA_AVISO && juego in JUEGOS && ahora - (prev.ultimoAviso || 0) > 20000) {
        g.ultimoAviso = ahora;
        const feed = (await store.get("feed", { type: "json" })) || [];
        feed.unshift({ u: id, k: "racha", n: r, j: juego, f: new Date(ahora).toISOString() });
        await store.setJSON("feed", feed.slice(0, FEED_MAX));
      }
      if (JSON.stringify(g) !== JSON.stringify(prev)) await store.setJSON(`g/${id}`, g);
      return json({ ok: true, racha: g.racha });
    }

    if (b.accion === "logro") {
      const juego = String(b.juego || ""), logro = String(b.logro || "");
      if (!(juego in JUEGOS) || !/^[a-z0-9]{2,24}$/.test(logro)) return json({ error: "Logro no válido" }, 400);
      if (!(await store.get(`u/${id}`))) return json({ error: "Pon tu nombre primero" }, 409);
      const marca = `ld/${juego}/${logro}/${id}`;
      if (await store.get(marca)) return json({ ok: true, repetido: true });
      const fecha = new Date().toISOString();
      await store.setJSON(marca, { f: fecha });
      const feed = (await store.get("feed", { type: "json" })) || [];
      feed.unshift({ u: id, j: juego, l: logro, f: fecha });
      await store.setJSON("feed", feed.slice(0, FEED_MAX));
      return json({ ok: true });
    }

    if (b.accion !== "partida") return json({ error: "Acción no válida" }, 400);
    const juego = String(b.juego || "");
    const seccion = String(b.seccion || "");
    const modo = ["todo", "practica"].includes(b.modo) ? b.modo : "temario";
    const tiempo = Number(b.tiempo), fallos = Number(b.fallos), pistas = Number(b.pistas);
    if (!(juego in JUEGOS) || !(seccion in JUEGOS[juego])) return json({ error: "Sección no válida" }, 400);
    if (![fallos, pistas].every((n) => Number.isInteger(n) && n >= 0 && n <= 500))
      return json({ error: "Datos de partida no válidos" }, 400);
    // Las partidas que no entran en el ranking de tiempos solo necesitan un tiempo razonable
    const minimo = modo === "temario" ? JUEGOS[juego][seccion] : 3;
    if (!Number.isFinite(tiempo) || tiempo < minimo || tiempo > 3600)
      return json({ error: "Tiempo no válido" }, 400);

    // Si el dispositivo aún no tiene nombre en el servidor, se registra ahora
    const errU = await asegurarUsuario();
    if (errU) return json({ error: errU }, 409);
    const resumen = await sumarStats(juego, tiempo);
    if (modo !== "temario") return json({ stats: resumen });

    const puntos = r1(tiempo + PEN_FALLO * fallos + PEN_PISTA * pistas);
    const key = `r/${juego}/${seccion}/${id}`;
    const prev = await store.get(key, { type: "json" });
    const mejora = !prev || puntos < prev.puntos;
    if (mejora) await store.setJSON(key, { puntos, tiempo: r1(tiempo), fallos, pistas, fecha: new Date().toISOString() });
    const c = await clasificacion(store, `r/${juego}/${seccion}/`, POR_PUNTOS, vistaPuntos, id);
    return json({ top: c.top, total: c.total, posicion: c.yo ? c.yo.posicion : 0, mejora,
      mejor: mejora ? puntos : prev.puntos, stats: resumen });
  }

  if (req.method === "DELETE") {
    const admin = env.RANKING_ADMIN_KEY;
    if (!admin || req.headers.get("x-admin-key") !== admin) return json({ error: "No autorizado" }, 401);
    let prefijos;
    if (url.searchParams.get("todo") === "1") {
      const { blobs } = await store.list();
      const borrar = blobs.filter((x) => !x.key.startsWith("u/"));
      await Promise.all(borrar.map((x) => store.delete(x.key)));
      return json({ ok: true, borrados: borrar.length });
    }
    const juego = url.searchParams.get("juego") || "";
    const seccion = url.searchParams.get("seccion");
    if (!(juego in JUEGOS)) return json({ error: "Plan no válido" }, 400);
    if (!seccion) prefijos = [`r/${juego}/`, `s/${juego}/`, `e/${juego}/`, `pr/${juego}/`];
    else if (seccion === "problemas") prefijos = [`pr/${juego}/`];
    else if (seccion === "stats") prefijos = [`s/${juego}/`];
    else if (seccion === "examen") prefijos = [`e/${juego}/`];
    else if (seccion in JUEGOS[juego]) prefijos = [`r/${juego}/${seccion}/`];
    else return json({ error: "Sección no válida" }, 400);
    let n = 0;
    for (const p of prefijos) {
      const { blobs } = await store.list({ prefix: p });
      await Promise.all(blobs.map((x) => store.delete(x.key)));
      n += blobs.length;
    }
    return json({ ok: true, borrados: n });
  }

  return json({ error: "Método no permitido" }, 405);
}
