/* Código común a todos los planes de trabajo: perfil del dispositivo, sonido,
   avisos, confeti, logros, estrellas y ranking.
   Cada página llama a Plan.init({...}) con su configuración. */

const $ = id => document.getElementById(id);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = s => { const t = Math.round(s * 10) / 10, m = Math.floor(t / 60); return m + ":" + (t - m * 60).toFixed(1).padStart(4, "0").replace(".", ","); };
const fmtClock = s => { s = Math.floor(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const fmtMin = s => { s = Math.round(s); const m = Math.floor(s / 60); return m < 60 ? (m ? `${m} min ${s % 60} s` : `${s} s`) : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const fmtEst = n => String(n).replace(".", ",");
// Nota del examen sobre 10: cada estrella son 2 puntos (3,5 ★ = 7)
const nota = est => fmtEst(Math.round(est * 2 * 10) / 10);
// Estrellas con medias: 5 estrellas rellenas en proporción (0 a 5)
const halfStars = est => `<span class="hstars" style="--p:${est * 20}%" aria-label="${fmtEst(est)} estrellas de 5">★★★★★</span>`;
const starsHtml = n => "★".repeat(n) + `<span class="dim">${"★".repeat(3 - n)}</span>`;
const viewOn = id => { const v = $(id); return !!v && v.classList.contains("on"); };
const PEN_FALLO = 5, PEN_PISTA = 15;
const API = "/api/ranking";

/* ---------- guardado local ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem("plan:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("plan:" + k, JSON.stringify(v)); } catch (e) {} },
};
function newId() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
// Migración desde la primera versión (solo Europa, con claves "europa:")
(function migrarLocal() {
  try {
    if (localStorage.getItem("plan:profile") !== null) return;
    const old = JSON.parse(localStorage.getItem("europa:profile") || "null");
    const alias = old && old.alias ? old.alias : "";
    LS.set("profile", { id: newId(), alias, legado: alias });
    const pr = localStorage.getItem("europa:progress");
    if (pr && localStorage.getItem("plan:europa:progress") === null) localStorage.setItem("plan:europa:progress", pr);
    const snd = localStorage.getItem("europa:sound");
    if (snd !== null) localStorage.setItem("plan:sound", snd);
  } catch (e) {}
})();
let profile = LS.get("profile", null) || { id: newId(), alias: "" };
if (!profile.id) profile.id = newId();
LS.set("profile", profile);

/* ---------- estado del plan ---------- */
let CFG = { juego: null, secciones: {}, ach: [] };
let progress = { best: {}, ach: {} };
let progresoT = null;
const saveProgress = () => {
  if (!CFG.juego) return;
  LS.set(CFG.juego + ":progress", progress);
  clearTimeout(progresoT); progresoT = setTimeout(subirProgreso, 1500);
};
function subirProgreso() {
  if (!CFG.juego || !profile.alias) return;
  apiPost({ accion: "progreso", id: profile.id, juego: CFG.juego, datos: progress });
}
// Une dos copias del progreso quedándose con lo mejor de cada una
function mezclarProgreso(a, b) {
  const r = JSON.parse(JSON.stringify(a || {})); b = b || {};
  r.best = r.best || {};
  for (const s in b.best || {}) {
    const x = r.best[s], y = b.best[s];
    if (!x) r.best[s] = y;
    else if (x.aciertos != null || y.aciertos != null) {
      const g = (x.aciertos ?? -1) >= (y.aciertos ?? -1) ? x : y;
      r.best[s] = { ...g, stars: Math.max(x.stars || 0, y.stars || 0) };
    } else r.best[s] = { score: Math.min(x.score, y.score), stars: Math.max(x.stars || 0, y.stars || 0) };
  }
  r.ach = r.ach || {};
  for (const k in b.ach || {}) if (!r.ach[k] || b.ach[k] < r.ach[k]) r.ach[k] = b.ach[k];
  if (b.examen) { const x = r.examen, y = b.examen; if (!x || y.aciertos > x.aciertos) r.examen = y; }
  for (const k in b) {
    if (["best", "ach", "examen"].includes(k)) continue;
    if (Array.isArray(b[k])) r[k] = [...new Set([...(r[k] || []), ...b[k]])];
    else if (b[k] && typeof b[k] === "object") r[k] = Object.assign({}, b[k], r[k] || {});
    else if (typeof b[k] === "number") r[k] = Math.max(b[k], typeof r[k] === "number" ? r[k] : 0);
    else if (!(k in r)) r[k] = b[k];
  }
  return r;
}
// Trae el progreso guardado en el servidor para este jugador y lo une con el del dispositivo
// umbrales: {seccion:{estrellas:[3★,2★]}} para calcular las estrellas de los mejores tiempos del servidor
async function syncJuego(juego, umbrales) {
  if (!profile.alias) return null;
  try {
    const j = await apiGet(`progreso=${juego}&id=${encodeURIComponent(profile.id)}`);
    const remoto = JSON.parse(JSON.stringify(j.datos || {})), ex = j.extra || {};
    remoto.ach = Object.assign({}, ex.logros || {}, remoto.ach || {});
    if (ex.examen) remoto.examen = remoto.examen ? mezclarProgreso({ examen: remoto.examen }, { examen: ex.examen }).examen : ex.examen;
    if (ex.problemas) remoto.problemas = Math.max(remoto.problemas || 0, ex.problemas);
    remoto.best = remoto.best || {};
    for (const [s, puntos] of Object.entries(ex.mejores || {})) {
      const u = umbrales && umbrales[s] && umbrales[s].estrellas;
      const stars = u ? (puntos <= u[0] ? 3 : puntos <= u[1] ? 2 : 1) : 0;
      const b = remoto.best[s];
      remoto.best[s] = !b ? { score: puntos, stars } : { score: Math.min(b.score, puntos), stars: Math.max(b.stars || 0, stars) };
    }
    const local = LS.get(juego + ":progress", {}), mez = mezclarProgreso(local, remoto);
    LS.set(juego + ":progress", mez);
    if (JSON.stringify(mez) !== JSON.stringify(j.datos)) apiPost({ accion: "progreso", id: profile.id, juego, datos: mez });
    return mez;
  } catch (e) { return null; }
}
// Si se cambian los umbrales de estrellas, las mejores marcas ya guardadas se recalculan
// (solo se suben estrellas, nunca se quitan)
function recalcularEstrellas() {
  if (CFG.porAciertos) return false;
  let cambio = false;
  for (const s in progress.best || {}) {
    const b = progress.best[s], c = CFG.secciones[s];
    if (!c || b.score == null) continue;
    const st = b.score <= c.estrellas[0] ? 3 : b.score <= c.estrellas[1] ? 2 : 1;
    if (st > (b.stars || 0)) { b.stars = st; cambio = true; }
  }
  return cambio;
}
async function syncProgreso() {
  const mez = await syncJuego(CFG.juego, CFG.secciones);
  if (mez) { progress = Object.assign({ best: {}, ach: {} }, JSON.parse(JSON.stringify(CFG.progresoExtra || {})), mez); if (recalcularEstrellas()) saveProgress(); renderLogros(); }
}
let pendingRank = null;

/* ---------- sonido, avisos y confeti ---------- */
let sound = LS.get("sound", true), actx = null;
function tone(kind) {
  if (!sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    const seq = kind === "ok" ? [[660, 0], [880, .07]] : kind === "bad" ? [[220, 0], [175, .09]] : [[523, 0], [659, .1], [784, .2], [1047, .3]];
    seq.forEach(([f, d]) => {
      const o = actx.createOscillator(), g = actx.createGain(); o.type = kind === "bad" ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(.18, t + d + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d + .18);
      o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + .2);
    });
  } catch (e) {}
}
function pop(msg) { const p = document.createElement("div"); p.className = "pop"; p.textContent = msg; $("pops").appendChild(p); setTimeout(() => p.remove(), 3200); }
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cols = ["#F5B700", "#2E9E5B", "#E04F3F", "#1F6FB2", "#8B5A2B"];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement("i"); c.className = "confetti"; c.style.left = Math.random() * 100 + "vw"; c.style.background = cols[i % 5];
    c.style.animationDuration = (1.6 + Math.random() * 1.4) + "s"; c.style.animationDelay = Math.random() * .4 + "s";
    document.body.appendChild(c); setTimeout(() => c.remove(), 3600);
  }
}

/* ---------- logros ---------- */
// Logros comunes; cada plan añade los suyos con Plan.init({ach:[...]})
function logrosBase({ pistas = true, primero = "Primer paso", pleno = "Pleno", tiempo = true } = {}) {
  const l = [
    { id: "primera", icon: "🧭", name: primero, desc: "Termina cualquier sección." },
    pistas && { id: "sinpistas", icon: "🧠", name: "Sin pistas", desc: "Termina una sección del temario sin pedir pistas." },
    { id: "punteria", icon: "🎯", name: "Puntería", desc: "Termina una sección del temario sin ningún fallo." },
    { id: "racha10", icon: "🔥", name: "Racha de 10", desc: tiempo ? "Acierta 10 seguidos." : "Acierta 10 seguidos (la racha sigue de una partida a otra si no fallas)." },
    { id: "racha25", icon: "☄️", name: "Imparable", desc: tiempo ? "Acierta 25 seguidos." : "Acierta 25 seguidos (la racha sigue de una partida a otra si no fallas)." },
    tiempo ? { id: "velocista", icon: "⚡", name: "Velocista", desc: "Consigue 3 estrellas en una sección." }
           : { id: "velocista", icon: "⭐", name: "Tres estrellas", desc: "Consigue 3 estrellas en una sección." },
    { id: "pleno", icon: "🏆", name: pleno, desc: "Consigue 3 estrellas en todas las secciones." },
    { id: "repaso", icon: "📚", name: "Lección aprendida", desc: "Completa un repaso de fallos." },
    { id: "podio", icon: "🥇", name: "En el podio", desc: "Entra en el top 3 de un ranking." },
  ];
  return l.filter(Boolean);
}
function unlock(id) {
  const a = CFG.ach.find(x => x.id === id);
  if (!a || progress.ach[id]) return;
  progress.ach[id] = new Date().toISOString(); saveProgress();
  pop(`${a.icon} Logro: ${a.name}`); renderLogros();
  // Se anuncia en la portada; si aún no hay nombre o no hay conexión, se envía más tarde
  const cola = LS.get("logrosPend", []); cola.push({ j: CFG.juego, l: id }); LS.set("logrosPend", cola);
  enviarLogros();
}
let enviandoLogros = false;
async function enviarLogros() {
  if (enviandoLogros || !profile.alias) return;
  enviandoLogros = true;
  try {
    let cola = LS.get("logrosPend", []);
    while (cola.length) {
      const j = await apiPost({ accion: "logro", id: profile.id, juego: cola[0].j, logro: cola[0].l });
      if (j.error && (j.status === 0 || j.status === 409 || j.status >= 500)) break; // se reintenta más tarde
      cola = LS.get("logrosPend", []).slice(1); LS.set("logrosPend", cola);
    }
  } finally { enviandoLogros = false; }
}
function streakHit(n) { if (n === 10) unlock("racha10"); if (n === 25) unlock("racha25"); }

// r = {sec, secs, fallos, pistas, retry, todo}
function finishRun(r) {
  const score = Math.round((r.secs + PEN_FALLO * r.fallos + PEN_PISTA * r.pistas) * 10) / 10;
  const res = { score, stars: 0, record: false, prev: null };
  unlock("primera");
  if (r.retry) { unlock("repaso"); return res; }
  if (r.todo) { unlock("enciclopedia"); return res; }
  if (!r.pistas) unlock("sinpistas");
  if (!r.fallos) unlock("punteria");
  const prev = progress.best[r.sec]; res.prev = prev || null;
  if (CFG.porAciertos) {
    // Planes de preguntas: 3 ★ sin fallos, 2 ★ con al menos el 80 % a la primera, 1 ★ el resto
    const ac = r.primera, total = r.base;
    res.stars = ac === total ? 3 : ac >= Math.ceil(total * .8) ? 2 : 1;
    const prevAc = prev && prev.aciertos != null ? prev.aciertos : -1;
    if (ac > prevAc) { progress.best[r.sec] = { aciertos: ac, total, stars: Math.max(res.stars, prev ? prev.stars || 0 : 0) }; res.record = true; }
    else if (res.stars > (prev.stars || 0)) prev.stars = res.stars;
  } else {
    const [t3, t2] = CFG.secciones[r.sec].estrellas;
    res.stars = score <= t3 ? 3 : score <= t2 ? 2 : 1;
    if (!prev || score < prev.score) { progress.best[r.sec] = { score, stars: Math.max(res.stars, prev ? prev.stars : 0) }; res.record = true; }
    else if (res.stars > prev.stars) prev.stars = res.stars;
  }
  saveProgress();
  if (res.stars === 3) unlock("velocista");
  if (Object.keys(CFG.secciones).every(s => progress.best[s] && progress.best[s].stars === 3)) unlock("pleno");
  if (CFG.onFinish) CFG.onFinish(r, res);
  return res;
}

/* ---------- servidor ---------- */
async function apiPost(body) {
  try {
    const resp = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: (j.error || "El ranking no está disponible ahora.") + ` (HTTP ${resp.status})`, status: resp.status, ocupado: !!j.ocupado };
    return j;
  } catch (e) { return { error: "Sin conexión con el ranking.", status: 0 }; }
}
async function apiGet(q) {
  const resp = await fetch(`${API}?${q}`);
  const txt = await resp.text(); let j;
  try { j = JSON.parse(txt); } catch (e) { throw new Error(`HTTP ${resp.status}: la API no devuelve JSON${resp.status === 404 ? " (la función no está desplegada)" : ""}`); }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${j.error || "error del servidor"}`);
  return j;
}
const submit = r => apiPost({ accion: "partida", juego: CFG.juego, seccion: r.sec, modo: r.todo ? "todo" : CFG.practica ? "practica" : "temario", id: profile.id,
  alias: profile.alias, tiempo: Math.round(r.secs * 10) / 10, fallos: r.fallos, pistas: r.pistas });

function rankList(top, yoPos, val = e => fmt(e.puntos)) {
  if (!top || !top.length) return `<p class="note">Todavía no hay nadie. ¡Sé el primero!</p>`;
  const medal = ["🥇", "🥈", "🥉"];
  return `<ol class="rank">${top.map((e, i) => `<li class="${yoPos === i + 1 ? "me" : ""}"><span class="pos">${medal[i] || (i + 1) + "º"}</span><span class="al">${esc(e.alias)}</span><span class="pt">${val(e)}</span></li>`).join("")}</ol>`;
}
// Tarjeta final: p es el prefijo de los ids (p+"Stars", p+"Big", p+"Txt", p+"Rank")
function renderEnd(p, r, res, missedTxt) {
  $(p + "Stars").innerHTML = res.stars ? starsHtml(res.stars) : "";
  let t;
  if (CFG.porAciertos) {
    $(p + "Big").textContent = `${r.primera} de ${r.base}`;
    t = r.primera === r.base ? "¡Todas a la primera!" : `Has acertado ${r.primera} de ${r.base} a la primera.`;
  } else {
    $(p + "Big").textContent = fmt(res.score);
    t = `Tiempo ${fmt(r.secs)}`;
    if (r.fallos) t += `, ${plural(r.fallos, "fallo", "fallos")} (+${r.fallos * PEN_FALLO} s)`;
    if (r.pistas) t += `, ${plural(r.pistas, "pista", "pistas")} (+${r.pistas * PEN_PISTA} s)`;
    t += ".";
  }
  if (res.record && res.prev) t += " ¡Nuevo récord personal!";
  if (missedTxt) t += " " + missedTxt;
  $(p + "Txt").textContent = t;
  const rk = $(p + "Rank");
  if (r.retry) { rk.innerHTML = `<p class="note">Los repasos no cuentan para el ranking.</p>`; return; }
  if (!profile.alias) { pendingRank = { p, r }; rk.innerHTML = `<p class="note">Pon tu nombre y esta partida contará en el ranking.</p><p><button class="btn main" data-prof>Poner nombre</button></p>`; return; }
  sendRank(p, r);
}
function sendRank(p, r) {
  if (r.examen) return sendExam(p, r);
  const rk = $(p + "Rank");
  rk.innerHTML = `<p class="note">Enviando al ranking…</p>`;
  submit(r).then(j => {
    if (j.error) {
      rk.innerHTML = `<p class="note err">${esc(j.error)}</p>` + (j.status === 409 ? `<p><button class="btn main" data-prof>Cambiar nombre</button></p>` : "");
      if (j.status === 409) pendingRank = { p, r };
      return;
    }
    const st = j.stats ? ` Llevas ${fmtMin(j.stats.segundos)} jugados en ${plural(j.stats.partidas, "partida", "partidas")} en este plan.` : "";
    if (r.todo) { rk.innerHTML = `<p class="note">El modo Todo no entra en el ranking de tiempos, pero suma minutos y partidas.${st}</p>`; return; }
    if (CFG.practica) { rk.innerHTML = `<p class="note">Las prácticas no entran en el ranking, pero suman minutos y partidas.${st} Haz el 📝 Examen para entrar en el ranking.</p>`; return; }
    rk.innerHTML = `<p class="note">${j.mejora ? "" : "Tu mejor marca sigue siendo " + fmt(j.mejor) + ". "}Vas ${j.posicion}º de ${j.total}.${st}</p>` + rankList(j.top, j.posicion);
    if (j.posicion && j.posicion <= 3) unlock("podio");
  });
}

/* ---------- examen (planes de preguntas) ---------- */
// r = {examen:true, ac (aciertos de 10), secs}
function sendExam(p, r) {
  const rk = $(p + "Rank"), box = rk.querySelector(".rk") || rk;
  if (!profile.alias) { pendingRank = { p, r }; box.innerHTML = `<p class="note">Pon tu nombre y este examen contará en el ranking.</p><p><button class="btn main" data-prof>Poner nombre</button></p>`; return; }
  box.innerHTML = `<p class="note">Enviando al ranking…</p>`;
  apiPost({ accion: "examen", juego: CFG.juego, id: profile.id, alias: profile.alias, aciertos: r.ac, tiempo: Math.round(r.secs * 10) / 10 }).then(j => {
    if (j.error) {
      box.innerHTML = `<p class="note err">${esc(j.error)}</p>` + (j.status === 409 ? `<p><button class="btn main" data-prof>Cambiar nombre</button></p>` : "");
      if (j.status === 409) pendingRank = { p, r };
      return;
    }
    const st = j.stats ? ` Llevas ${fmtMin(j.stats.segundos)} jugados en ${plural(j.stats.partidas, "partida", "partidas")} en este plan.` : "";
    box.innerHTML = `<p class="note">${j.mejora ? "" : `Tu mejor examen sigue siendo un ${nota(j.mejor.estrellas)}. `}Vas ${j.posicion}º de ${j.total}.${st}</p>` + rankList(j.top, j.posicion, RK_VAL.examen);
    if (j.posicion && j.posicion <= 3) unlock("podio");
  });
}

/* ---------- problemas resueltos ---------- */
// Cada problema resuelto a la primera suma 1 en su ranking (y en los logros del plan)
function problemaResuelto() {
  progress.problemas = (progress.problemas || 0) + 1; saveProgress();
  if (progress.problemas >= 10) unlock("resolutor");
  if (progress.problemas >= 50) unlock("genio");
  if (profile.alias) apiPost({ accion: "problema", id: profile.id, juego: CFG.juego });
}

/* ---------- pestaña Ranking ---------- */
let rkSec = null;
const RK_VAL = { minutos: e => fmtMin(e.segundos), partidas: e => plural(e.partidas, "partida", "partidas"),
  examen: e => `${halfStars(e.estrellas)} <small>Nota</small> ${nota(e.estrellas)}`,
  problemas: e => plural(e.resueltos, "problema", "problemas") };
function rkTabs() {
  const t = {};
  if (CFG.examen) t.examen = "📝 Examen";
  else for (const s in CFG.secciones) t[s] = CFG.secciones[s].nombre;
  if (Object.values(CFG.secciones).some(s => s.contador)) t.problemas = "🧩 Problemas resueltos";
  t.minutos = "⏱ Minutos jugados"; t.partidas = "🎮 Partidas";
  return t;
}
function renderRkSecs() {
  const t = rkTabs();
  $("rkSecs").innerHTML = Object.keys(t).map(s => `<button class="chip" data-rk="${s}" aria-pressed="${s === rkSec}">${esc(t[s])}</button>`).join("");
}
async function loadRanking() {
  const body = $("rkBody"); if (!body) return;
  body.innerHTML = `<p class="note">Cargando…</p>`;
  try {
    const isStat = rkSec in RK_VAL, val = RK_VAL[rkSec] || (e => fmt(e.puntos));
    const j = await apiGet(`juego=${CFG.juego}&${isStat ? "tabla" : "seccion"}=${rkSec}&id=${encodeURIComponent(profile.id)}`);
    const yo = j.yo ? j.yo.posicion : 0;
    body.innerHTML = rankList(j.top, yo, val) + (j.yo && yo > j.top.length ? `<p class="note">Tú vas ${yo}º de ${j.total} con ${val(j.yo)}.</p>` : "");
  } catch (e) { body.innerHTML = `<p class="note err">No se puede cargar el ranking ahora.</p><p class="note">Detalle: ${esc(e.message)}</p>`; }
}

/* ---------- pestaña Logros ---------- */
function renderLogros() {
  if (!$("lgSecs")) return;
  const ex = progress.examen;
  const exCard = CFG.examen ? `<div class="sec"><b>📝 Examen</b><div class="stars sm">${halfStars(ex ? ex.estrellas : 0)}</div><small>${ex ? `Mejor nota: ${nota(ex.estrellas)}` : "Sin hacer"}</small><small>Cada acierto: 1 punto y media estrella</small></div>` : "";
  $("lgSecs").innerHTML = exCard + Object.keys(CFG.secciones).map(s => {
    const b = progress.best[s], c = CFG.secciones[s];
    const mejor = !b ? "Sin jugar" : CFG.porAciertos ? (b.aciertos != null ? `Mejor: ${b.aciertos} de ${b.total}` : "Jugada") : "Mejor: " + fmt(b.score);
    const regla = CFG.porAciertos ? "3 ★ sin fallos · 2 ★ con 8 de cada 10" : `3 ★ por debajo de ${fmtClock(c.estrellas[0])}`;
    return `<div class="sec"><b>${esc(c.nombre)}</b><div class="stars sm">${starsHtml(b ? b.stars || 0 : 0)}</div><small>${mejor}</small><small>${regla}</small></div>`;
  }).join("");
  const n = CFG.ach.filter(a => progress.ach[a.id]).length; $("lgCount").textContent = `${n} de ${CFG.ach.length}`;
  $("lgAch").innerHTML = CFG.ach.map(a => `<div class="a ${progress.ach[a.id] ? "" : "lock"}"><span class="ic">${a.icon}</span><span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span></div>`).join("");
}

/* ---------- nombre del dispositivo ---------- */
function updWho() { const w = $("whoTxt"); if (w) w.textContent = profile.alias || "Pon tu nombre"; }
function openProfile() {
  $("pAlias").value = profile.alias || profile.pendiente || ""; $("pErr").textContent = ""; $("pSoy").hidden = true;
  $("prof").showModal();
}
// Entrar como un jugador que ya existe: este dispositivo pasa a usar su identidad
async function entrarComo(alias) {
  const j = await apiPost({ accion: "entrar", alias });
  if (j.error) return j;
  profile = { id: j.id, alias: j.alias }; LS.set("profile", profile); updWho();
  return j;
}
async function trasCambiarJugador() {
  enviarLogros();
  if (CFG.juego) await syncProgreso();
  if (pendingRank) { const pr = pendingRank; pendingRank = null; sendRank(pr.p, pr.r); }
  if (viewOn("rankview")) loadRanking();
  if (CFG.onJugador) CFG.onJugador();
}
async function saveAlias(alias, legado) {
  const j = await apiPost({ accion: "perfil", id: profile.id, alias, legado: legado || undefined });
  if (j.error && j.status !== 0) return j;
  profile.alias = alias; delete profile.legado; delete profile.pendiente;
  if (j.error) profile.sinSync = true; else delete profile.sinSync;
  LS.set("profile", profile); updWho();
  return j;
}
function injectUi() {
  if (!$("prof")) document.body.insertAdjacentHTML("beforeend", `
<dialog id="prof"><form id="profForm">
  <h2 class="h2" style="margin-top:0">Tu nombre en el ranking</h2>
  <label for="pAlias">Nombre</label>
  <input id="pAlias" maxlength="16" autocomplete="off" enterkeyhint="done">
  <div class="hint">Un apodo, no tu nombre y apellidos. Si lo cambias, se cambia en todos los rankings.</div>
  <div class="err" id="pErr"></div>
  <div id="pSoy" class="soy" hidden>
    <button class="btn main" type="button" id="pSoyBtn"></button>
    <div class="hint">Si no eres tú, escribe otro nombre (por ejemplo, añade tu inicial).</div>
  </div>
  <div class="drow"><button class="btn" type="button" id="pCancel">Cancelar</button><button class="btn main" type="submit" id="pSave">Guardar</button></div>
</form></dialog>`);
  if (!$("pops")) document.body.insertAdjacentHTML("beforeend", `<div class="pops" id="pops" aria-live="polite"></div>`);
}

/* ---------- arranque ---------- */
const Plan = {
  init(cfg) {
    CFG = Object.assign({ juego: null, secciones: {}, ach: [] }, cfg);
    if (CFG.juego) progress = Object.assign({ best: {}, ach: {} }, JSON.parse(JSON.stringify(CFG.progresoExtra || {})), LS.get(CFG.juego + ":progress", {}));
    rkSec = CFG.examen ? "examen" : Object.keys(CFG.secciones)[0] || null;
    injectUi();

    const snd = $("snd");
    if (snd) { const upd = () => { snd.textContent = sound ? "🔊" : "🔇"; }; snd.onclick = () => { sound = !sound; LS.set("sound", sound); upd(); }; upd(); }
    if ($("who")) $("who").onclick = openProfile;
    $("pCancel").onclick = () => $("prof").close();
    document.addEventListener("click", e => { if (e.target.closest("[data-prof]")) openProfile(); });
    $("pSoyBtn").onclick = async () => {
      $("pSoyBtn").disabled = true;
      const j = await entrarComo($("pSoyBtn").dataset.alias);
      $("pSoyBtn").disabled = false;
      if (j.error) { $("pErr").textContent = j.error.replace(/ \(HTTP \d+\)$/, ""); return; }
      $("prof").close(); pop(`👋 Hola, ${profile.alias}`);
      trasCambiarJugador();
    };
    $("pAlias").addEventListener("input", () => { $("pSoy").hidden = true; $("pErr").textContent = ""; });
    $("profForm").addEventListener("submit", async e => {
      e.preventDefault();
      const a = $("pAlias").value.trim().replace(/\s+/g, " ");
      if (!/^[\p{L}\p{N} ]{2,16}$/u.test(a)) { $("pErr").textContent = "El nombre debe tener de 2 a 16 letras o números."; return; }
      $("pSave").disabled = true; $("pErr").textContent = "Guardando…"; $("pSoy").hidden = true;
      const j = await saveAlias(a);
      $("pSave").disabled = false;
      if (j.error && j.status !== 0) {
        $("pErr").textContent = j.error.replace(/ \(HTTP \d+\)$/, "");
        if (j.ocupado) { $("pSoyBtn").textContent = `Soy ${a}, entrar`; $("pSoyBtn").dataset.alias = a; $("pSoy").hidden = false; }
        return;
      }
      $("prof").close();
      trasCambiarJugador();
    });

    document.querySelectorAll(".tab[data-view]").forEach(t => t.onclick = () => {
      document.querySelectorAll(".tab[data-view]").forEach(x => x.setAttribute("aria-selected", x === t));
      document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v.id === t.dataset.view));
      if (t.dataset.view === "rankview") loadRanking();
      if (t.dataset.view === "logview") renderLogros();
      if (CFG.onView) CFG.onView(t.dataset.view);
    });
    if ($("rkSecs")) {
      renderRkSecs();
      $("rkSecs").onclick = e => { const b = e.target.closest("[data-rk]"); if (!b) return; rkSec = b.dataset.rk; renderRkSecs(); loadRanking(); };
      if ($("rkReload")) $("rkReload").onclick = () => loadRanking();
    }
    if (CFG.juego && recalcularEstrellas()) saveProgress();
    updWho(); renderLogros(); enviarLogros();
    if (CFG.juego && profile.alias) syncProgreso();

    // Sincroniza el nombre con el servidor (datos de la versión anterior, o para obtener el código)
    if (profile.alias && (profile.legado || profile.sinSync)) {
      saveAlias(profile.alias, profile.legado).then(j => {
        if (!j.error) enviarLogros();
        // El nombre ya existe con otro id: este dispositivo entra como ese jugador
        if (j.status === 409 && j.ocupado) entrarComo(profile.alias).then(r => { if (!r.error) trasCambiarJugador(); });
      });
    }
  },
};
