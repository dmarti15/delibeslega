/* Motor común de los planes de preguntas (mates, lengua…).
   Tipos de pregunta: op (opciones), multi (marcar varias; con palabras:true, palabras de una frase) y num (teclado). */
/* =====================================================================
   Motor del juego
   ===================================================================== */
let SECS={},TEORIA={},QH={},sec=null,queue=[],cur=null,run=null,done=0,total=0,failed=[],requeued=new Set(),busy=false,answer=null;
const elapsed=()=>{if(!run||run.t0==null)return 0;const now=run.pauseAt??performance.now();return(now-run.t0-run.paused)/1000};
const pause=()=>{if(run&&run.t0!=null&&run.pauseAt==null)run.pauseAt=performance.now()};
const resume=()=>{if(run&&run.pauseAt!=null){run.paused+=performance.now()-run.pauseAt;run.pauseAt=null}};
function arm(){if(run&&run.t0==null&&viewOn("playview"))run.t0=performance.now()}

const PREGUNTAS_EXAMEN=10;
// Racha de aciertos seguidos: continúa de una partida de práctica a la siguiente mientras no se falle
let racha=0;
// Examen: 10 preguntas al azar. Las secciones con enExamen:n aportan n preguntas (p. ej. 2 problemas);
// el resto, al menos una cada una, y lo que falte se completa al azar
function crearExamen(){
  const out=[],una=k=>{const qs=SECS[k].gen(),q=qs[Math.floor(Math.random()*qs.length)];q.secNom=SECS[k].nombre;out.push(q)};
  const fijas=Object.keys(SECS).filter(k=>SECS[k].enExamen),normales=shuffle(Object.keys(SECS).filter(k=>!SECS[k].enExamen));
  fijas.forEach(k=>{for(let n=0;n<SECS[k].enExamen;n++)una(k)});
  for(let i=0;out.length<PREGUNTAS_EXAMEN;i++)una(i<normales.length?normales[i]:normales[Math.floor(Math.random()*normales.length)]);
  return shuffle(out.slice(0,PREGUNTAS_EXAMEN));
}
function start(list){
  QH.limpiar&&QH.limpiar();$("end").classList.remove("on");
  if(pendingRank&&pendingRank.p==="end")pendingRank=null;
  const examen=sec==="examen"&&!list;
  renderRecursos();
  const qs=list?list.map(q=>({...q,again:false})):examen?crearExamen():SECS[sec].gen();
  qs.forEach(q=>{q.base=q});
  queue=qs;total=qs.length;done=0;failed=[];requeued=new Set();busy=false;
  run={sec,t0:null,paused:0,pauseAt:null,fallos:0,pistas:0,streak:examen?0:racha,retry:!!list,todo:false,done:false,examen,aciertos:0,base:qs.length};
  $("qsec").textContent=examen?"📝 Examen":sec==="examen"?"Práctica de los fallos del examen":SECS[sec].nombre;$("time").textContent="0:00";
  next();arm();
}
function updHead(){
  $("prog").textContent=`${done} de ${total}`;
  $("streak").textContent=run&&!run.examen&&run.streak>=3?`🔥 ${run.streak}`:"";
}
function next(){
  cur=queue.shift();busy=false;
  if(!cur){finish();return}
  if(run.examen)$("qsec").textContent=`📝 Examen · ${cur.secNom}`;
  render(cur);updHead();
}
function render(q){
  $("qtext").classList.toggle("largo",!!q.largo);
  $("qtext").innerHTML=(q.again?`<span class="again">Otra vez</span> `:"")+q.texto;
  $("qfb").hidden=true;
  if(QH.mostrar)QH.mostrar(q);
  const box=$("qans");box.innerHTML="";answer=null;
  if(q.nota)box.insertAdjacentHTML("beforeend",`<p class="qnote">${q.nota}</p>`);
  if(q.tipo==="op"){
    const orden=q.orden?q.orden.map(t=>q.ops.indexOf(t)):q.fijo?q.ops.map((_,i)=>i):shuffle(q.ops.map((_,i)=>i));
    const one=q.one||q.ops.some(t=>t.length>22);
    box.insertAdjacentHTML("beforeend",`<div class="opts${one?" one":""}">${orden.map(i=>`<button class="opt" data-i="${i}">${q.ops[i]}</button>`).join("")}</div>`);
    box.querySelectorAll(".opt").forEach(b=>b.onclick=()=>{
      if(busy)return;const ok=+b.dataset.i===q.ok;
      if(run.examen)b.classList.add("sel");
      else{b.classList.add(ok?"ok":"bad");if(!ok)box.querySelector(`.opt[data-i="${q.ok}"]`).classList.add("ok")}
      resolve(ok);
    });
  }
  if(q.tipo==="multi"){
    const okSet=new Set(q.ok.map(String));
    const celdas=q.palabras
      ?`<div class="words">${q.items.map((x,i)=>`<button class="num word" data-v="${i}" aria-pressed="false">${x}</button>`).join("")}</div>`
      :`<div class="nums${q.criba?" criba":""}">${q.items.map((x,i)=>{
          const tach=q.tachados&&q.tachados.includes(x),txt=q.etiquetas?q.etiquetas[i]:x;
          return `<button class="num${tach?" tachado":""}" data-v="${x}" aria-pressed="false"${tach?" disabled":""}>${txt}</button>`}).join("")}</div>`;
    box.insertAdjacentHTML("beforeend",celdas+`<button class="btn main go" id="goBtn">${run.examen?"Responder":"Comprobar"}</button>`);
    box.querySelectorAll(".num:not(.tachado)").forEach(b=>b.onclick=()=>{if(busy)return;const on=!b.classList.contains("sel");b.classList.toggle("sel",on);b.setAttribute("aria-pressed",on)});
    answer=()=>{
      if(busy)return;const sel=[...box.querySelectorAll(".num.sel")].map(b=>b.dataset.v);
      const ok=sel.length===okSet.size&&sel.every(v=>okSet.has(v));
      if(!run.examen)box.querySelectorAll(".num:not(.tachado)").forEach(b=>{const s=b.classList.contains("sel"),c=okSet.has(b.dataset.v);b.classList.remove("sel");
        if(s&&c)b.classList.add("ok");else if(s&&!c)b.classList.add("bad");else if(!s&&c)b.classList.add("miss")});
      resolve(ok);
    };
    $("goBtn").onclick=answer;
  }
  if(q.tipo==="num"){
    let val="";
    box.insertAdjacentHTML("beforeend",`<div class="padout empty" id="padout">Escribe el número</div><div class="keys">${[1,2,3,4,5,6,7,8,9].map(k=>`<button class="key" data-k="${k}">${k}</button>`).join("")}<button class="key" data-k="del" aria-label="Borrar">⌫</button><button class="key" data-k="0">0</button><button class="key k-go" data-k="go">${run.examen?"Responder":"Comprobar"}</button></div>`);
    const out=$("padout");
    const upd=()=>{out.textContent=val||"Escribe el número";out.classList.toggle("empty",!val)};
    const press=k=>{if(busy)return;if(k==="go"){if(val)answer();return}if(k==="del")val=val.slice(0,-1);else if(val.length<5)val=(val+k).replace(/^0+(?=\d)/,"");upd()};
    box.querySelectorAll(".key").forEach(b=>b.onclick=()=>press(b.dataset.k));
    answer=()=>{if(busy||!val)return;const ok=+val===q.resp;if(run.examen){resolve(ok);return}out.classList.add(ok?"ok":"bad");if(!ok)out.innerHTML=`${val} <span style="color:var(--ok)">→ ${q.resp}</span>`;resolve(ok)};
    answer.press=press;
  }
  // Letras desordenadas: se tocan en orden para escribir la palabra (spelling, verbos…)
  if(q.tipo==="letras"){
    const sol=q.resp.toLowerCase();let letras=[...sol];
    for(let t=0;t<10&&letras.join("")===sol;t++)letras=shuffle(letras);
    const usados=[];
    box.insertAdjacentHTML("beforeend",`<div class="padout empty" id="padout">Toca las letras en orden</div>
      <div class="tiles">${letras.map((l,i)=>`<button class="tile-l" data-i="${i}">${l===" "?"␣":esc(l)}</button>`).join("")}</div>
      <div class="keys2"><button class="key" data-k="del" aria-label="Borrar">⌫</button><button class="key k-go" data-k="go">${run.examen?"Responder":"Comprobar"}</button></div>`);
    const out=$("padout"),tiles=[...box.querySelectorAll(".tile-l")];
    const val=()=>usados.map(i=>letras[i]).join("");
    const upd=()=>{out.textContent=val()||"Toca las letras en orden";out.classList.toggle("empty",!usados.length);tiles.forEach((b,i)=>b.disabled=usados.includes(i))};
    const press=k=>{
      if(busy)return;
      if(k==="go"){if(usados.length)answer();return}
      if(k==="del"){usados.pop();upd();return}
      if(typeof k==="number"){if(!usados.includes(k))usados.push(k);upd();return}
      const i=tiles.findIndex((b,j)=>!usados.includes(j)&&letras[j].toLowerCase()===k.toLowerCase());if(i>=0){usados.push(i);upd()}
    };
    tiles.forEach((b,i)=>b.onclick=()=>press(i));
    box.querySelectorAll(".keys2 .key").forEach(b=>b.onclick=()=>press(b.dataset.k));
    answer=()=>{if(busy||!usados.length)return;const ok=val()===sol;if(run.examen){resolve(ok);return}
      out.classList.add(ok?"ok":"bad");if(!ok)out.innerHTML=`${esc(val())} <span style="color:var(--ok)">→ ${esc(q.resp)}</span>`;resolve(ok)};
    answer.press=press;
  }
}
// Enlaces a los vídeos y juegos de la sección (si la sección los tiene y la página tiene #recursos)
function renderRecursos(){
  const r=$("recursos");if(!r)return;
  const lista=sec!=="examen"&&SECS[sec]&&SECS[sec].recursos||[];
  r.hidden=!lista.length;
  r.innerHTML=lista.length?`<span class="rtit">Del profe:</span>`+lista.map(x=>`<a href="${x.url}" target="_blank" rel="noopener">${x.tipo==="video"?"📺":"🎮"} ${esc(x.t)}</a>`).join(""):"";
}
// Teclado físico: números, letras, borrar e Intro
document.addEventListener("keydown",e=>{
  if(!viewOn("playview")||!cur||$("prof").open||$("teo").open)return;
  if(!$("qfb").hidden&&(e.key==="Enter"||e.key===" ")){e.preventDefault();$("fbNext").click();return}
  if(cur.tipo==="num"&&answer&&answer.press){
    if(/^\d$/.test(e.key))answer.press(e.key);else if(e.key==="Backspace")answer.press("del");else if(e.key==="Enter")answer.press("go");
  }else if(cur.tipo==="letras"&&answer&&answer.press){
    if(/^[\p{L}' ]$/u.test(e.key)){e.preventDefault();answer.press(e.key)}else if(e.key==="Backspace")answer.press("del");else if(e.key==="Enter")answer.press("go");
  }else if(cur.tipo==="multi"&&e.key==="Enter"&&answer)answer();
});
function resolve(ok){
  if(busy)return;busy=true;
  if(run.examen){ // sin corrección hasta el final
    if(ok)run.aciertos++;else failed.push(cur.base);
    done++;updHead();setTimeout(next,350);return;
  }
  if(ok){
    tone("ok");if(!cur.again){run.streak++;racha=run.streak;streakHit(run.streak)}
    if(!cur.again&&!run.retry&&SECS[sec]&&SECS[sec].contador)problemaResuelto();
    done++;updHead();const c=$("qcard");c.classList.remove("flash");void c.offsetWidth;c.classList.add("flash");
    setTimeout(next,600);
  }else{
    tone("bad");run.fallos++;run.streak=0;racha=0;streakReset();
    if(!failed.includes(cur.base))failed.push(cur.base);
    if(!requeued.has(cur.base)){requeued.add(cur.base);queue.splice(Math.min(queue.length,2+Math.floor(Math.random()*3)),0,{...cur.base,again:true});total++}
    updHead();pause();
    const fb=$("qfb");fb.hidden=false;
    fb.innerHTML=`<span class="t">No es correcto</span><div class="sol">${cur.sol}</div><button class="btn main" id="fbNext">Seguir</button>`;
    $("fbNext").onclick=()=>{resume();next()};
    fb.scrollIntoView({block:"nearest",behavior:"smooth"});
  }
}
function finishExamen(){
  run.done=true;QH.limpiar&&QH.limpiar();
  const secs=elapsed(),ac=run.aciertos,est=ac/2,prev=progress.examen;
  const record=!prev||ac>prev.aciertos;
  if(record){progress.examen={aciertos:ac,estrellas:est,tiempo:Math.round(secs*10)/10};saveProgress()}
  unlock("primera");if(est>=2.5)unlock("aprobado");if(est>=4.5)unlock("sobresaliente");if(ac===PREGUNTAS_EXAMEN)unlock("perfecto");
  renderLogros();
  $("endStars").innerHTML=halfStars(est);
  $("endBig").textContent=`Nota: ${nota(est)}`;
  $("endTxt").textContent=`Has acertado ${ac} de ${PREGUNTAS_EXAMEN} (${fmtEst(est)} ${est===1?"estrella":"estrellas"}).`+(record&&prev?" ¡Tu mejor examen!":"");
  const rev=failed.length?`<details class="review"><summary>Ver ${failed.length===1?"la pregunta fallada":`las ${failed.length} preguntas falladas`}</summary>${
    failed.map(q=>`<div class="rq"><div class="rq-t">${q.texto}</div><div class="rq-s">${q.sol}</div></div>`).join("")}</details>`:"";
  $("endRank").innerHTML=`<div class="rk"></div>`+rev;
  $("retry").style.display=failed.length?"":"none";$("retry").textContent="Practicar los fallos";
  $("end").classList.add("on");
  if(record&&ac>=5){tone("win");confetti()}
  sendExam("end",{examen:true,ac,secs});
}
function finish(){
  if(run.examen)return finishExamen();
  $("retry").textContent="Repasar los fallos";
  run.done=true;QH.limpiar&&QH.limpiar();
  const secs=elapsed(),r={...run,secs,primera:run.base-failed.length};
  const res=finishRun(r);
  renderEnd("end",r,res,failed.length?(failed.length===1?"Has fallado 1 pregunta; puedes repasarla.":`Has fallado ${failed.length} preguntas; puedes repasarlas.`):"");
  $("retry").style.display=failed.length?"":"none";
  $("end").classList.add("on");
  if(res.record&&!r.retry){tone("win");confetti()}
}
setInterval(()=>{if(run&&!run.done&&run.t0!=null)$("time").textContent=fmtClock(elapsed())},250);


/* =====================================================================
   Arranque: Quiz.init({secs, teoria, plan, mostrar, limpiar})
   secs: {id:{nombre, estrellas:[3★,2★], gen:()=>[preguntas]}}
   ===================================================================== */
function renderModes(){
  $("modes").innerHTML=`<button class="chip exam" data-sec="examen" aria-pressed="${sec==="examen"}">📝 Examen</button>`+
    Object.keys(SECS).map(s=>`<button class="chip" data-sec="${s}" aria-pressed="${s===sec}">${SECS[s].corto||SECS[s].nombre}</button>`).join("");
}
const Quiz={
  init(o){
    SECS=o.secs;TEORIA=o.teoria||{};QH={mostrar:o.mostrar,limpiar:o.limpiar};sec=Object.keys(SECS)[0];
    $("teoBtn").onclick=()=>{if(sec==="examen"){pop(run&&run.examen&&!run.done?"📝 Durante el examen no se puede mirar la teoría":"📝 Elige una sección para ver su teoría");return}$("teoBody").innerHTML=`<h2 class="h2" style="margin-top:0">📖 ${SECS[sec].nombre}</h2>`+TEORIA[sec];pause();$("teo").showModal()};
    $("teoClose").onclick=()=>$("teo").close();
    $("teo").addEventListener("close",()=>{if($("qfb").hidden)resume()});
    $("modes").onclick=e=>{const b=e.target.closest("[data-sec]");if(!b)return;sec=b.dataset.sec;renderModes();start()};
    $("again").onclick=()=>start();
    $("retry").onclick=()=>start(failed);
    Plan.init(Object.assign({},o.plan,{examen:true,practica:true,porAciertos:true,
      secciones:Object.fromEntries(Object.entries(SECS).map(([k,v])=>[k,{nombre:v.nombre,estrellas:v.estrellas,contador:!!v.contador}])),
      onView:v=>{if(v==="playview"){arm();if($("qfb").hidden&&!$("teo").open)resume()}else pause()},
    }));
    renderModes();start();
  },
};
