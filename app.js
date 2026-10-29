(() => {
"use strict";
const IG = "https://www.instagram.com/andradeescritor/";

const CATS = [
  {id:"tudo",label:"Tudo"},
  {id:"pensamentos",label:"Pensamentos",one:"Pensamento"},
  {id:"frases",label:"Frases",one:"Frase"},
  {id:"textos",label:"Textos",one:"Texto"},
  {id:"poesias",label:"Poesias",one:"Poesia"},
  {id:"cronicas",label:"Crônicas",one:"Crônica"}
];
const CAT_IDS = CATS.slice(1).map(c=>c.id);
const BASE = [
  {slug:"ser-persistente",cat:"pensamentos",title:"Ser persistente",text:"Existem várias formas de se obter um resultado, mas apenas uma de ser extraordinário: ser persistente."},
  {slug:"vontade-indomavel",cat:"frases",title:"Vontade indomável",text:"Qualquer homem com atitude e uma vontade indomável é capaz de derrubar os seus leões diariamente, sem perder a fome de querer todos os dias conquistar."},
  {slug:"cafe-amargo",cat:"frases",title:"Café amargo",text:"A vida é uma xícara de café amargo com um frasco de adoçante em suas últimas gotas."},
  {slug:"o-tentar",cat:"pensamentos",title:"O tentar",text:"Existe uma linha tênue entre fazer e procrastinar. O que divide isso é o tentar."}
];
let POSTS = [];
const catOf = id => CATS.find(c=>c.id===id) || CATS[1];
const PAGE = 6;

const $ = s => document.querySelector(s);
const el = (tag, attrs={}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) { if (k==="class") e.className=v; else if (k==="text") e.textContent=v; else e.setAttribute(k,v); }
  kids.forEach(k=>e.append(k)); return e;
};
const icon = id => { const s=document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("aria-hidden","true"); const u=document.createElementNS("http://www.w3.org/2000/svg","use"); u.setAttribute("href","#"+id); s.append(u); return s; };
const readMin = t => Math.max(1, Math.round(t.split(/\s+/).length/200));
const pad = n => String(n).padStart(2,"0");
const roman = n => { const m=[["l",50],["xl",40],["x",10],["ix",9],["v",5],["iv",4],["i",1]]; let r=""; for(const [s,v] of m) while(n>=v){r+=s;n-=v} return r; };
let toastT;
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),2600); }
async function copy(text, ok){
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch { const ta=el("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0"; document.body.append(ta); ta.select(); let done=false; try{done=document.execCommand("copy")}catch{} ta.remove(); toast(done?ok:"Não foi possível copiar. Selecione o texto manualmente."); }
}
const store = { get(k){try{return localStorage.getItem(k)}catch{return null}}, set(k,v){try{localStorage.setItem(k,v)}catch{}} };
function clean(s, max){ s = String(s||"").normalize("NFC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g,"").replace(/[ \t]+/g," ").replace(/\n{4,}/g,"\n\n\n").trim(); return max ? s.slice(0,max) : s; }
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/[^a-z0-9-]/gi,"");
const slugify = t => t.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48) || "texto";
$("#year").textContent = new Date().getFullYear();

const S = {
  ready:false, db:null, user:null, uid:null, name:"", role:"visitante",
  postsDb:{}, drafts:[], members:[], sobre:null,
  all:[], byUser:{}, mod:{aprovados:[],ocultos:[]}, reports:[], myReports:new Set(), writable:true, lastSend:0,
  visible(c){ return this.mod.aprovados.includes(c.id) && !this.mod.ocultos.includes(c.id); },
  countFor(slug){ return this.all.filter(c=>c.post===slug && this.visible(c)).length; }
};
const isAdmin = () => S.role==="admin";

function sanitizePost(o){
  return { cat: CAT_IDS.includes(o.cat) ? o.cat : "textos",
    title: typeof o.title==="string" ? o.title.slice(0,120) : "Sem título",
    text: typeof o.text==="string" ? o.text.slice(0,5000) : "",
    em: typeof o.em==="string" ? o.em : "" };
}
function rebuildPosts(){
  const out = [];
  BASE.forEach((b,i) => { const o=S.postsDb[b.slug]; if (o && o.removido) return; const v=o?sanitizePost(o):{}; out.push({...b, ...v, text:v.text||b.text, slug:b.slug, ord:i, base:true}); });
  Object.entries(S.postsDb).filter(([k,v]) => !BASE.some(b=>b.slug===k) && !v.removido)
    .map(([k,v]) => ({...sanitizePost(v), slug:k})).filter(p=>p.text)
    .sort((a,b)=>a.em.localeCompare(b.em)).forEach((p,i)=>out.push({...p, ord:BASE.length+i}));
  out.forEach(p => p.n = String(p.ord+1).padStart(3,"0"));
  POSTS = out.sort((a,b)=>b.ord-a.ord);
  $("#stat").textContent = `${POSTS.length} publicações · 1 livro em desenvolvimento`;
  renderNavCounts();
}

/* Header */
const header = $("#top");
addEventListener("scroll", () => header.classList.toggle("scrolled", scrollY>8), {passive:true});
const navLinks = [...document.querySelectorAll("nav.main a[data-nav]")];
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) navLinks.forEach(a => a.setAttribute("aria-current", a.dataset.nav===e.target.id ? "true":"false"));
}), {rootMargin:"-45% 0px -50% 0px"});
["inicio","publicacoes","livros","projetos","sobre"].forEach(id=>{const s=document.getElementById(id); if(s) io.observe(s)});

const panel=$("#explorePanel"), exBtn=$("#exploreBtn"), burger=$("#burgerBtn");
let panelOpener=null;
function openPanel(btn){ panelOpener=btn; panel.hidden=false; requestAnimationFrame(()=>panel.classList.add("open")); [exBtn,burger].forEach(b=>b.setAttribute("aria-expanded","true")); burger.setAttribute("aria-label","Fechar menu"); const first=[...panel.querySelectorAll("a")].find(a=>a.offsetParent); setTimeout(()=>first&&first.focus(),30); }
function closePanel(restore=true){ if(panel.hidden) return; panel.classList.remove("open"); [exBtn,burger].forEach(b=>b.setAttribute("aria-expanded","false")); burger.setAttribute("aria-label","Abrir menu"); setTimeout(()=>{ if(!panel.classList.contains("open")) panel.hidden=true; },200); if(restore&&panelOpener) panelOpener.focus(); }
[exBtn,burger].forEach(b=>b.addEventListener("click", e=>{ e.stopPropagation(); panel.classList.contains("open")?closePanel():openPanel(b); }));
document.addEventListener("click", e=>{ if(!panel.contains(e.target)) closePanel(false); });
panel.addEventListener("click", e=>{ if(e.target.closest("a")) closePanel(false); });
document.addEventListener("keydown", e=>{
  if (e.key==="Escape"){ if(!$("#sheet").hidden) closeSheet(); else if(!$("#reader").hidden) closeReader(); else closePanel(); }
  if (panel.classList.contains("open") && (e.key==="ArrowDown"||e.key==="ArrowUp")){ const items=[...panel.querySelectorAll("a")].filter(a=>a.offsetParent); const i=items.indexOf(document.activeElement); if(i>-1){ e.preventDefault(); items[(i+(e.key==="ArrowDown"?1:-1)+items.length)%items.length].focus(); } }
});

/* Categorias */
let filter="tudo", shown=PAGE;
const count = id => id==="tudo" ? POSTS.length : POSTS.filter(p=>p.cat===id).length;
function renderNavCounts(){
  const chips=$("#chips"); chips.replaceChildren();
  CATS.forEach(c => { const b=el("button",{class:"chip","aria-pressed":String(c.id===filter),"data-cat":c.id}, c.label+" ", el("small",{text:pad(count(c.id))})); b.addEventListener("click",()=>go(c.id==="tudo"?"publicacoes":c.id,false)); chips.append(b); });
  const pc=$("#panelCats"); pc.replaceChildren();
  [["publicacoes","Todos os textos","tudo"],["pensamentos","Pensamentos"],["frases","Frases"],["poesias","Poesias"],["cronicas","Crônicas e reflexões"],["textos","Textos"]].forEach(([h,l,c])=>pc.append(el("li",{},el("a",{href:"#"+h}, l+" ", el("small",{text:pad(count(c||h))})))));
  const fc=$("#footCats"); fc.replaceChildren(); CATS.slice(1).forEach(c=>fc.append(el("li",{},el("a",{href:"#"+c.id,text:c.label}))));
}

/* Livro aberto */
let tomeI = 0;
function showTome(){
  if (!POSTS.length) return;
  const p = POSTS[tomeI % POSTS.length];
  $("#tomeQ").textContent = p.text.length>220 ? p.text.slice(0,217).trim()+"…" : p.text;
  $("#tomeCat").textContent = catOf(p.cat).one;
  const page = 3 + (tomeI%POSTS.length)*2;
  $("#folioL").textContent = roman(page-1); $("#folioR").textContent = roman(page);
}
$("#turnBtn").addEventListener("click", () => {
  const q=$("#tomeQ"); q.classList.add("fade");
  setTimeout(()=>{ tomeI++; showTome(); q.classList.remove("fade"); }, matchMedia("(prefers-reduced-motion: reduce)").matches?0:320);
});
$("#tomeQ").addEventListener("click", () => { const p=POSTS[tomeI%POSTS.length]; if(p) go("p-"+p.slug,false); });

/* Grade */
function renderGrid(){
  const g=$("#grid"); g.classList.add("fading");
  setTimeout(()=>{
    g.replaceChildren();
    const list = POSTS.filter(p=>filter==="tudo"||p.cat===filter);
    if (!list.length) g.append(el("div",{class:"empty"}, el("span",{class:"mono",text:catOf(filter).label}), el("p",{text:`Ainda não há ${catOf(filter).label.toLowerCase()} publicadas aqui.`}), el("a",{class:"btn",href:"#publicacoes",text:"Ver todas as publicações"})));
    list.slice(0,shown).forEach(p=>g.append(card(p)));
    $("#moreBtn").hidden = list.length<=shown;
    document.querySelectorAll(".chip").forEach(b=>b.setAttribute("aria-pressed", b.dataset.cat===filter?"true":"false"));
    g.classList.remove("fading");
  },120);
}
function card(p){
  const n=S.countFor(p.slug);
  const c=el("article",{class:"card","aria-labelledby":"t-"+p.slug},
    el("div",{class:"meta"}, el("span",{class:"mono",text:"Nº "+p.n}), el("span",{class:"mono",text:catOf(p.cat).one})),
    el("blockquote",{id:"t-"+p.slug,text:p.text.length>420?p.text.slice(0,417).trim()+"…":p.text}),
    el("div",{class:"sig",text:"— Andrade"}));
  const bC=el("button",{class:"act","aria-label":`Comentários de “${p.title}”: ${n}`}, icon("i-comment"), el("span",{class:"n",text:String(n)}));
  bC.addEventListener("click",()=>go("p-"+p.slug,false,true));
  const bCp=el("button",{class:"act","aria-label":`Copiar “${p.title}”`}, icon("i-copy"), el("span",{class:"lbl",text:"Copiar"}));
  bCp.addEventListener("click",()=>copy(`“${p.text}” — Andrade (@andradeescritor)`,"Texto copiado."));
  const bO=el("button",{class:"act open"}, el("span",{text:"Ler e comentar"}), icon("i-arrow"));
  bO.addEventListener("click",()=>go("p-"+p.slug,false));
  c.append(el("div",{class:"actions"},bC,bCp,bO)); return c;
}
$("#moreBtn").addEventListener("click",()=>{ shown+=PAGE; renderGrid(); });

/* Leitor */
let current=null, lastFocus=null, listHash="publicacoes", cShown=10;
function openReader(p,toComments){
  current=p; cShown=10; lastFocus=lastFocus||document.activeElement;
  $("#rIdx").textContent=`Nº ${p.n}`;
  $("#rCat").textContent=catOf(p.cat).one;
  $("#rTitle").textContent=p.title;
  $("#rText").textContent=p.text;
  $("#rTime").textContent=`${readMin(p.text)} min de leitura`;
  const rel=$("#rRel"); rel.replaceChildren();
  POSTS.filter(x=>x!==p).sort((a,b)=>(b.cat===p.cat)-(a.cat===p.cat)).slice(0,3).forEach(x=>rel.append(el("li",{},el("a",{href:"#p-"+x.slug,text:"“"+(x.text.length>140?x.text.slice(0,137)+"…":x.text)+"”"}))));
  renderComments();
  const r=$("#reader"); r.hidden=false; document.body.style.overflow="hidden";
  requestAnimationFrame(()=>r.classList.add("open")); r.scrollTop=0;
  setTimeout(()=>{ if(toComments) $("#cTitle").scrollIntoView({block:"start"}); $("#rClose").focus(); },60);
}
function closeReader(){
  const r=$("#reader"); if(r.hidden) return;
  r.classList.remove("open"); document.body.style.overflow="";
  setTimeout(()=>{ r.hidden=true; },200); current=null; go(listHash,false);
  if(lastFocus&&document.contains(lastFocus)) lastFocus.focus(); lastFocus=null;
}
$("#rClose").addEventListener("click",closeReader);
$("#rCopy").addEventListener("click",()=>current&&copy(`“${current.text}” — Andrade (@andradeescritor)`,"Texto copiado."));
$("#rCopyLink").addEventListener("click",()=>{ if(!current) return; copy(location.href.split("#")[0]+"#p-"+current.slug,"Link da publicação copiado."); });
function trapFocus(root){ root.addEventListener("keydown", e=>{ if(e.key!=="Tab") return; const f=[...root.querySelectorAll("a,button,input,textarea,select")].filter(x=>!x.disabled&&x.offsetParent&&x.tabIndex>=0); if(!f.length) return; const a=f[0], z=f[f.length-1]; if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()} else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()} }); }
trapFocus($("#reader")); trapFocus($("#sheet"));

/* Rotas */
let scrollNext=true, commentsNext=false;
function go(hash,scroll=true,toComments=false){ scrollNext=scroll; commentsNext=toComments; if(location.hash==="#"+hash) route(); else location.hash=hash; }
function route(){
  const h=decodeURIComponent(location.hash.slice(1)); const scroll=scrollNext; scrollNext=true; const toC=commentsNext; commentsNext=false;
  if (h.startsWith("p-")){ const p=POSTS.find(x=>x.slug===h.slice(2)); if(p){ openReader(p,toC); return; } }
  if (!$("#reader").hidden){ $("#reader").classList.remove("open"); $("#reader").hidden=true; document.body.style.overflow=""; current=null; }
  if (CAT_IDS.includes(h)||h==="publicacoes"){ const f=h==="publicacoes"?"tudo":h; if(f!==filter){ filter=f; shown=PAGE; renderGrid(); } listHash=h; if(scroll) document.getElementById("publicacoes").scrollIntoView(); return; }
  const s=h&&document.getElementById(h); if(s&&scroll) s.scrollIntoView();
}
addEventListener("hashchange",route);

/* Folha (políticas / conta) */
const SHEETS={
  privacidade:["Política de privacidade",[
    "Este site não usa cookies de publicidade nem ferramentas de rastreamento.",
    "Este site não tem cadastro, login nem formulários: nenhum dado pessoal é coletado ou guardado.",
    "As fontes são carregadas do Google Fonts. Comentários sobre os textos são feitos no Instagram @andradeescritor, seguindo a política do próprio Instagram."]],
  comentarios:["Política de comentários",[
    "Os comentários são bem-vindos quando conversam com o texto.",
    "Todo comentário passa por moderação antes de ficar público.",
    "Não são aprovados: ofensas, discriminação, ameaças, spam, propaganda, links suspeitos ou dados pessoais de terceiros.",
    "Qualquer leitor pode denunciar um comentário. Comentários denunciados são revisados e podem ser ocultados ou removidos.",
    "Limite: 600 caracteres por comentário e um envio a cada 30 segundos."]]
};
let sheetFocus=null, sheetMode="none";
function showSheet(wide, labelId){ const s=$("#sheet"); s.classList.toggle("wide",wide); s.setAttribute("aria-labelledby",labelId); if(s.hidden){ s.hidden=false; requestAnimationFrame(()=>s.classList.add("open")); } }
function openSimple(title, paras){
  sheetFocus=document.activeElement; sheetMode="simple";
  const close=btn("Fechar","btn small x",closeSheet);
  $("#sBox").replaceChildren(close, el("h2",{id:"sTitle",text:title}), ...paras.map(p=>el("p",{text:p})));
  showSheet(false,"sTitle"); close.focus();
}
function closeSheet(){ const s=$("#sheet"); s.classList.remove("open"); setTimeout(()=>{ s.hidden=true; },200); sheetMode="none"; if(sheetFocus&&document.contains(sheetFocus)) sheetFocus.focus(); }
$("#sheet").addEventListener("click",e=>{ if(e.target.id==="sheet") closeSheet(); });
document.addEventListener("click",e=>{ const t=e.target.closest("[data-sheet]"); if(!t) return; const [title,paras]=SHEETS[t.dataset.sheet]; openSimple(title,paras); });

/* Escrita: uma por documento */
const queues={};
function enqueue(key,fn){ const p=(queues[key]||Promise.resolve()).catch(()=>{}).then(fn); queues[key]=p; return p; }
const write = (path,data) => enqueue(path, () => S.db.doc(path).set(data));
const remove = path => enqueue(path, () => S.db.doc(path).delete());
function errMsg(err){
  const c = err && err.code;
  if (c==="invalid_argument") return "Seu acesso não permite esta ação.";
  if (c==="resource_exhausted") return "Muitas ações em sequência. Aguarde um pouco e tente de novo.";
  if (c==="quota_exceeded") return "O espaço de armazenamento está cheio. Exclua itens antigos e tente de novo.";
  if (c==="revoked") return "Seu acesso foi alterado. Recarregue a página.";
  return "Não foi possível salvar agora. Verifique a conexão e tente de novo.";
}
function armed(label, fn){
  const b=el("button",{class:"mini bad",type:"button",text:label}); let t;
  b.addEventListener("click", async () => {
    if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent="Confirmar exclusão"; t=setTimeout(()=>{ b.classList.remove("armed"); b.textContent=label; },4000); return; }
    clearTimeout(t); b.disabled=true; try { await fn(); } finally { b.disabled=false; b.classList.remove("armed"); b.textContent=label; }
  });
  return b;
}
function btn(t,cls,fn){ const b=el("button",{class:cls,type:"button",text:t}); b.addEventListener("click",fn); return b; }

/* Comentários */
function renderComments(){
  if (!current) return;
  const st=$("#cState"), list=$("#cList"), form=$("#cForm");
  st.replaceChildren(); list.replaceChildren();
  if (!S.ready){
    list.hidden=true; form.hidden=true; $("#cMore").hidden=true; $("#cCount").textContent="";
    st.append(el("div",{class:"notice"},"Comente esta publicação no ", el("a",{href:IG,target:"_blank",rel:"noopener noreferrer",text:"Instagram @andradeescritor"}),"."));
    return;
  }
  const items=S.all.filter(c=>c.post===current.slug&&(S.visible(c)||c.uid===S.uid||isAdmin())).sort((a,b)=>b.em.localeCompare(a.em));
  $("#cCount").textContent=pad(items.filter(c=>S.visible(c)).length);
  if (!items.length) st.append(el("p",{class:"mono",style:"margin-top:16px",text:"Seja o primeiro a comentar."}));
  list.hidden=!items.length;
  items.slice(0,cShown).forEach(c=>list.append(commentItem(c)));
  $("#cMore").hidden=items.length<=cShown;
  form.hidden=!S.writable;
  if (!S.writable) st.append(el("div",{class:"notice"},"Seu acesso permite ler, mas não comentar. Comente pelo ", el("a",{href:IG,target:"_blank",rel:"noopener noreferrer",text:"Instagram"}),"."));
  const saved=store.get("ae-nome"); if(saved&&!$("#cName").value) $("#cName").value=saved;
}
$("#cMore").addEventListener("click",()=>{ cShown+=10; renderComments(); });
function fmtDate(iso){ try{ const d=new Date(iso); if(isNaN(d)) return ""; return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); }catch{ return ""; } }
function commentItem(c, withPost=false){
  const approved=S.mod.aprovados.includes(c.id), hidden=S.mod.ocultos.includes(c.id), reported=S.reports.some(r=>r.cid===c.id);
  const li=el("li",{});
  if (withPost){ const p=POSTS.find(x=>x.slug===c.post); li.append(el("span",{class:"mono",text:"Em: "+(p?p.title:c.post)})); }
  li.append(el("div",{class:"chead"},el("b",{text:c.nome||"Leitor"}),el("time",{datetime:c.em,text:fmtDate(c.em)})), el("p",{class:"ctext",text:c.texto}));
  const foot=el("div",{class:"cfoot"});
  if (!approved&&!hidden) foot.append(el("span",{class:"tag pend",text:c.uid===S.uid?"Aguardando aprovação":"Pendente"}));
  if (hidden) foot.append(el("span",{class:"tag hid",text:"Oculto"}));
  if (isAdmin()&&reported) foot.append(el("span",{class:"tag rep",text:"Denunciado"}));
  if (isAdmin()){
    if (!approved||hidden) foot.append(btn("Aprovar","mini ok",()=>moderate(c,"aprovar")));
    if (!hidden) foot.append(btn("Ocultar","mini bad",()=>moderate(c,"ocultar")));
    foot.append(armed("Excluir",()=>removeComment(c)));
  } else if (c.uid===S.uid){ foot.append(armed("Excluir meu comentário",()=>removeComment(c))); }
  else if (approved){ const done=S.myReports.has(c.id); const b=btn(done?"Denunciado":"Denunciar","mini",()=>report(c,b)); if(done) b.disabled=true; foot.append(b); }
  li.append(foot); return li;
}
function setErr(f,e,msg){ const box=$(f); msg?box.setAttribute("data-invalid",""):box.removeAttribute("data-invalid"); $(e).textContent=msg||""; const inp=box.querySelector("input,textarea"); inp.setAttribute("aria-invalid",msg?"true":"false"); if(msg) inp.setAttribute("aria-describedby",e.slice(1)); }
$("#cText").addEventListener("input",e=>{ $("#cCounter").textContent=`${e.target.value.length} / 600`; });
let sending=false;
$("#cForm").addEventListener("submit", async e=>{
  e.preventDefault(); if(sending||!current) return;
  const msg=$("#cMsg"); msg.className="msg"; msg.textContent="";
  if ($("#cSite").value){ msg.textContent="Comentário enviado para moderação."; msg.className="msg ok"; return; }
  const nome=clean($("#cName").value).replace(/\n/g," "), texto=clean($("#cText").value);
  let bad=false;
  if (nome.length<2||nome.length>40){ setErr("#fName","#eName","Escreva um nome entre 2 e 40 caracteres."); bad=true; } else setErr("#fName","#eName","");
  const links=(texto.match(/https?:\/\/|www\./gi)||[]).length;
  if (texto.length<3){ setErr("#fText","#eText","O comentário precisa ter pelo menos 3 caracteres."); bad=true; }
  else if (texto.length>600){ setErr("#fText","#eText","Reduza o comentário para até 600 caracteres."); bad=true; }
  else if (links>1){ setErr("#fText","#eText","Use no máximo um link por comentário."); bad=true; }
  else setErr("#fText","#eText","");
  if (bad){ const f=document.querySelector("[data-invalid] input,[data-invalid] textarea"); if(f) f.focus(); return; }
  const last=Number(store.get("ae-ult")||0), wait=30000-(Date.now()-Math.max(last,S.lastSend));
  if (wait>0){ msg.textContent=`Aguarde ${Math.ceil(wait/1000)} s para enviar outro comentário.`; msg.className="msg bad"; return; }
  const mine=S.byUser[S.uid]?.itens||[];
  if (mine.some(c=>c.post===current.slug&&c.texto===texto)){ msg.textContent="Você já enviou este mesmo comentário."; msg.className="msg bad"; return; }
  if (mine.length>=60){ msg.textContent="Você atingiu o limite de comentários. Exclua algum antigo para enviar outro."; msg.className="msg bad"; return; }
  sending=true; const b=$("#cSend"); b.disabled=true; b.replaceChildren(el("span",{class:"spin","aria-hidden":"true"}),el("span",{text:"Enviando…"}));
  try{
    await write("c/"+S.uid,{nome,itens:[...mine,{id:newId(),post:current.slug,texto,em:new Date().toISOString()}]});
    S.lastSend=Date.now(); store.set("ae-ult",String(S.lastSend)); store.set("ae-nome",nome);
    $("#cText").value=""; $("#cCounter").textContent="0 / 600";
    msg.textContent=isAdmin()?"Comentário salvo. Aprove-o para torná-lo público.":"Comentário enviado. Ele aparece para todos depois da moderação."; msg.className="msg ok";
  }catch(err){ msg.className="msg bad"; msg.textContent=errMsg(err); if(err&&err.code==="invalid_argument"){ S.writable=false; renderComments(); } }
  finally{ sending=false; b.disabled=false; b.replaceChildren(el("span",{text:"Enviar comentário"})); }
});
async function removeComment(c){
  try{ const d=S.byUser[c.uid]; if(!d) return; await write("c/"+c.uid,{nome:d.nome||"",itens:d.itens.filter(x=>x.id!==c.id)}); toast("Comentário excluído."); }
  catch(err){ toast(errMsg(err)); }
}
async function moderate(c,action){
  const m={aprovados:[...S.mod.aprovados],ocultos:[...S.mod.ocultos]}; const live=new Set(S.all.map(x=>x.id));
  if (action==="aprovar"){ if(!m.aprovados.includes(c.id)) m.aprovados.push(c.id); m.ocultos=m.ocultos.filter(x=>x!==c.id); }
  else if(!m.ocultos.includes(c.id)) m.ocultos.push(c.id);
  m.aprovados=m.aprovados.filter(x=>live.has(x)); m.ocultos=m.ocultos.filter(x=>live.has(x));
  try{ await write("mod/estado",m); toast(action==="aprovar"?"Comentário aprovado.":"Comentário ocultado."); }catch(err){ toast(errMsg(err)); }
}
async function report(c,b){
  if(!S.uid) return; b.disabled=true;
  try{ const ref=S.db.doc("denuncias/"+S.uid); const snap=await ref.get(); const itens=(snap.exists&&Array.isArray(snap.data().itens))?snap.data().itens.slice(-49):[]; itens.push({cid:c.id,em:new Date().toISOString()}); await write("denuncias/"+S.uid,{itens}); S.myReports.add(c.id); b.textContent="Denunciado"; toast("Denúncia enviada para moderação."); }
  catch{ b.disabled=false; toast("Não foi possível enviar a denúncia."); }
}

/* Minha área */
const ROLE_LABEL={admin:"Autor · Administrador",membro:"Membro",leitor:"Leitor conectado",visitante:"Visitante"};
let acctTab="publicacoes", editing=null;
function openAccount(tab){
  if (tab) acctTab=tab;
  sheetFocus=document.activeElement; sheetMode="account";
  drawAccount(); showSheet(true,"aTitle");
  setTimeout(()=>{ const c=$("#aClose"); if(c) c.focus(); },30);
}
const pendingCount=()=>S.all.filter(c=>!S.mod.aprovados.includes(c.id)&&!S.mod.ocultos.includes(c.id)).length;
function drawAccount(){
  if (sheetMode!=="account") return;
  const box=$("#sBox"); const keep=box.scrollTop;
  const active=document.activeElement && box.contains(document.activeElement) ? document.activeElement.id : null;
  box.replaceChildren();
  const initial=(S.name||"A").trim().charAt(0).toUpperCase();
  const close=btn("Fechar","btn small",closeSheet); close.id="aClose";
  box.append(el("div",{class:"acct-head"},
    el("div",{class:"who"}, el("div",{class:"avatar",text:initial,"aria-hidden":"true"}),
      el("div",{}, el("span",{class:"mono",text:"Minha área"}), el("h2",{id:"aTitle",text:S.role==="visitante"?"Entrar":(S.name||"Sua conta")}), el("span",{class:"role",text:ROLE_LABEL[S.role]}))),
    close));
  if (S.role==="visitante"){ box.append(visitorPanel()); return; }
  const tabs = isAdmin()
    ? [["publicacoes","Publicações",POSTS.length],["rascunhos","Rascunhos",S.drafts.length],["comentarios","Comentários",pendingCount()],["membros","Membros",S.members.filter(m=>m.id!=="_acesso").length],["sobre","Sobre",0],["seguranca","Segurança",0]]
    : S.role==="membro" ? [["membros","Área de membros",S.members.filter(m=>m.id!=="_acesso").length],["meus","Meus comentários",0],["seguranca","Segurança",0]]
    : [["meus","Meus comentários",0],["seguranca","Segurança",0]];
  if (!tabs.some(t=>t[0]===acctTab)) acctTab=tabs[0][0];
  const bar=el("div",{class:"tabs",role:"tablist","aria-label":"Seções da conta"});
  tabs.forEach(([id,label,n])=>{ const t=el("button",{class:"tab",role:"tab","aria-selected":String(id===acctTab),id:"tab-"+id,"aria-controls":"tabpanel",tabindex:id===acctTab?"0":"-1"}, label); if(n) t.append(el("span",{class:"n",text:String(n)})); t.addEventListener("click",()=>{ acctTab=id; drawAccount(); document.getElementById("tab-"+id)?.focus(); }); bar.append(t); });
  bar.addEventListener("keydown",e=>{ if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft") return; const i=tabs.findIndex(t=>t[0]===acctTab); acctTab=tabs[(i+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length][0]; drawAccount(); document.getElementById("tab-"+acctTab)?.focus(); });
  box.append(bar);
  const pnl=el("div",{class:"tabpanel",role:"tabpanel",id:"tabpanel","aria-labelledby":"tab-"+acctTab});
  ({publicacoes:tabPosts,rascunhos:tabDrafts,comentarios:tabComments,membros:tabMembers,sobre:tabAbout,seguranca:tabSecurity,meus:tabMine})[acctTab](pnl);
  box.append(pnl); box.scrollTop=keep;
  if (active) document.getElementById(active)?.focus();
}
/* redesenhos automáticos não podem apagar o que o autor está digitando */
function safeRedraw(){ const box=$("#sBox"); const typing=box.querySelector("form input:focus,form textarea:focus,form select:focus"); if(!typing) drawAccount(); }
function visitorPanel(){
  return el("div",{class:"tabpanel"},
    el("p",{text:"O acesso é feito com a sua conta conectada. Não existe senha deste site para ser descoberta ou vazada: quem você é e o que pode fazer são conferidos pelo servidor a cada ação."}),
    el("ol",{class:"checks"},
      el("li",{},el("span",{class:"tag",text:"1"}),el("div",{},el("b",{text:"Autor"}),"Entra com a própria conta e vê o painel de administração completo.")),
      el("li",{},el("span",{class:"tag",text:"2"}),el("div",{},el("b",{text:"Membros"}),"Recebem um convite do autor. Depois de aceito, a área de membros abre automaticamente.")),
      el("li",{},el("span",{class:"tag",text:"3"}),el("div",{},el("b",{text:"Leitores"}),"Navegam livremente. Para comentar, basta estar conectado."))),
    el("div",{class:"notice"},"Não está conseguindo entrar? Abra o site conectado à sua conta. Para virar membro, peça o convite pelo ", el("a",{href:IG,target:"_blank",rel:"noopener noreferrer",text:"Instagram @andradeescritor"}),"."));
}
function editorForm(){
  const ed = editing;
  const f=el("form",{class:"aform",novalidate:""});
  const t=el("input",{id:"edTitle",maxlength:"120",required:""}); t.value=ed.title||"";
  const sel=el("select",{id:"edCat"}); CATS.slice(1).forEach(c=>{ const o=el("option",{value:c.id,text:c.one}); if(c.id===(ed.cat||"pensamentos")) o.selected=true; sel.append(o); });
  const x=el("textarea",{id:"edText",class:"long",maxlength:"5000",required:""}); x.value=ed.text||"";
  const cnt=el("span",{text:`${x.value.length} / 5000`});
  const sync=()=>{ ed.title=t.value; ed.cat=sel.value; ed.text=x.value; cnt.textContent=`${x.value.length} / 5000`; };
  [t,sel,x].forEach(i=>i.addEventListener("input",sync));
  const msg=el("div",{class:"msg",role:"status","aria-live":"polite"});
  const prev=el("div",{class:"preview"});
  f.append(
    el("div",{class:"grid2"}, el("div",{class:"field"},el("label",{for:"edTitle",text:"Título"}),t), el("div",{class:"field"},el("label",{for:"edCat",text:"Tipo de texto"}),sel)),
    el("div",{class:"field"},el("label",{for:"edText",text:"Texto (as quebras de linha são preservadas)"}),x,el("div",{class:"hint"},el("span",{text:ed.mode==="editar"?"Editando publicação":ed.mode==="rascunho"?"Rascunho em edição":"Nova publicação"}),cnt)));
  const read=()=>({title:clean(t.value,120).replace(/\n/g," "), cat:CAT_IDS.includes(sel.value)?sel.value:"textos", text:clean(x.value,5000)});
  const valid=d=>{ if(d.title.length<2){ msg.className="msg bad"; msg.textContent="Dê um título com pelo menos 2 caracteres."; t.focus(); return false; } if(d.text.length<3){ msg.className="msg bad"; msg.textContent="Escreva o texto antes de salvar."; x.focus(); return false; } return true; };
  const bPrev=btn("Pré-visualizar","btn small",()=>{ const d=read(); prev.replaceChildren(el("div",{class:"sheetpage"},el("span",{class:"cat",text:catOf(d.cat).one}),el("p",{class:"ptext",text:d.text||"…"}),el("div",{class:"by"},el("i",{}),"Andrade"))); });
  const bDraft=btn("Salvar rascunho","btn small",async()=>{ const d=read(); if(!valid(d)) return; const id=ed.mode==="rascunho"?ed.id:newId(); bDraft.disabled=true; try{ await write("rascunhos/"+id,{...d,em:new Date().toISOString()}); Object.assign(ed,{mode:"rascunho",id}); msg.className="msg ok"; msg.textContent="Rascunho salvo. Só você vê os rascunhos."; }catch(err){ msg.className="msg bad"; msg.textContent=errMsg(err); } finally{ bDraft.disabled=false; } });
  const bPub=el("button",{class:"btn small gold",type:"submit",text:ed.mode==="editar"?"Salvar alterações":"Publicar"});
  f.addEventListener("submit",async e=>{
    e.preventDefault(); const d=read(); if(!valid(d)) return; bPub.disabled=true;
    try{
      let slug=ed.mode==="editar"?ed.slug:slugify(d.title);
      if (ed.mode!=="editar"){ while(POSTS.some(p=>p.slug===slug)||S.postsDb[slug]) slug=slugify(d.title)+"-"+Math.random().toString(36).slice(2,6); }
      const em = ed.mode==="editar" ? (S.postsDb[slug]?.em || new Date().toISOString()) : new Date().toISOString();
      await write("posts/"+slug,{...d,em});
      if (ed.mode==="rascunho") await remove("rascunhos/"+ed.id);
      const wasEdit=ed.mode==="editar"; editing=null; toast(wasEdit?"Publicação atualizada.":"Publicado no site."); acctTab="publicacoes"; drawAccount();
    }catch(err){ msg.className="msg bad"; msg.textContent=errMsg(err); }
    finally{ bPub.disabled=false; }
  });
  const bCancel=btn("Cancelar","btn small",()=>{ editing=null; drawAccount(); });
  f.append(el("div",{class:"formrow"},el("div",{class:"btns"},bPrev,bDraft,bCancel),bPub),msg,prev);
  return f;
}
function tabPosts(p){
  p.append(el("div",{class:"formrow"},el("h2",{text:"Publicações",style:"margin:0"}),btn("+ Nova publicação","btn small gold",()=>{ editing={mode:"novo"}; drawAccount(); $("#edTitle")?.focus(); })));
  if (editing && editing.mode!=="rascunho") p.append(editorForm());
  const ul=el("ul",{class:"alist"});
  POSTS.forEach(post=>{
    const li=el("li",{},el("div",{class:"tx"},el("b",{text:post.title}),el("span",{text:`Nº ${post.n} · ${catOf(post.cat).one} · ${S.countFor(post.slug)} comentários`})));
    li.append(el("div",{class:"btns"},
      btn("Ver","mini",()=>{ closeSheet(); go("p-"+post.slug,false); }),
      btn("Editar","mini",()=>{ editing={mode:"editar",slug:post.slug,title:post.title,cat:post.cat,text:post.text}; drawAccount(); $("#sBox").scrollTop=0; $("#edTitle")?.focus(); }),
      armed("Excluir",async()=>{ try{ if(post.base) await write("posts/"+post.slug,{removido:true}); else await remove("posts/"+post.slug); toast("Publicação excluída."); }catch(err){ toast(errMsg(err)); } })));
    ul.append(li);
  });
  p.append(ul);
  const removedBase=BASE.filter(b=>S.postsDb[b.slug]?.removido);
  if (removedBase.length){ p.append(el("h3",{class:"mono",style:"margin:24px 0 8px",text:"Excluídas do site"})); const u2=el("ul",{class:"alist"}); removedBase.forEach(b=>u2.append(el("li",{},el("div",{class:"tx"},el("b",{text:b.title})),btn("Restaurar","mini ok",async()=>{ try{ await remove("posts/"+b.slug); toast("Publicação restaurada."); }catch(err){ toast(errMsg(err)); } })))); p.append(u2); }
}
function tabDrafts(p){
  p.append(el("h2",{text:"Rascunhos",style:"margin:0"}),el("p",{text:"Rascunhos ficam guardados no servidor e só o autor consegue lê-los."}));
  if (editing && editing.mode==="rascunho") p.append(editorForm());
  if (!S.drafts.length){ p.append(el("p",{class:"mono",text:"Nenhum rascunho salvo."})); return; }
  const ul=el("ul",{class:"alist"});
  S.drafts.forEach(d=>{ const li=el("li",{},el("div",{class:"tx"},el("b",{text:d.title||"Sem título"}),el("span",{text:`${catOf(d.cat).one} · ${fmtDate(d.em)}`})));
    li.append(el("div",{class:"btns"},btn("Continuar","mini",()=>{ editing={mode:"rascunho",id:d.id,title:d.title,cat:d.cat,text:d.text}; drawAccount(); $("#sBox").scrollTop=0; }),armed("Excluir",async()=>{ try{ await remove("rascunhos/"+d.id); toast("Rascunho excluído."); }catch(err){ toast(errMsg(err)); } }))); ul.append(li); });
  p.append(ul);
}
function tabComments(p){
  p.append(el("h2",{text:"Comentários",style:"margin:0"}),el("p",{text:"Aprove para publicar, oculte para esconder ou exclua de vez."}));
  const pend=S.all.filter(c=>!S.mod.aprovados.includes(c.id)&&!S.mod.ocultos.includes(c.id));
  const repIds=new Set(S.reports.map(r=>r.cid)); const rep=S.all.filter(c=>repIds.has(c.id)&&!S.mod.ocultos.includes(c.id));
  const recent=S.all.filter(c=>S.visible(c)).sort((a,b)=>b.em.localeCompare(a.em)).slice(0,20);
  [["Aguardando aprovação",pend],["Denunciados",rep],["Publicados recentemente",recent]].forEach(([t,arr])=>{
    p.append(el("h3",{class:"mono",style:"margin:24px 0 8px",text:`${t} · ${arr.length}`}));
    if(!arr.length){ p.append(el("p",{text:"Nada por aqui."})); return; }
    const ol=el("ol",{class:"clist"}); arr.forEach(c=>ol.append(commentItem(c,true))); p.append(ol);
  });
}
function tabMembers(p){
  const list=S.members.filter(m=>m.id!=="_acesso");
  p.append(el("h2",{text:isAdmin()?"Área de membros":"Textos para membros",style:"margin:0"}));
  if (isAdmin()){
    p.append(el("p",{text:"Para dar acesso a um membro, compartilhe este site com a pessoa como Colaborador (Contributor) no menu Compartilhar. Ela passa a ler esta área; quem só pode visualizar não consegue."}));
    const t=el("input",{id:"mTitle",maxlength:"120"}), x=el("textarea",{id:"mText",class:"long",maxlength:"5000"}), msg=el("div",{class:"msg",role:"status"});
    const f=el("form",{class:"aform",novalidate:""},
      el("div",{class:"field"},el("label",{for:"mTitle",text:"Título do texto exclusivo"}),t),
      el("div",{class:"field"},el("label",{for:"mText",text:"Texto"}),x));
    const b=el("button",{class:"btn small gold",type:"submit",text:"Publicar para membros"});
    f.append(el("div",{class:"formrow"},el("small",{text:"Só membros e o autor conseguem ler estes textos."}),b),msg);
    f.addEventListener("submit",async e=>{ e.preventDefault(); const d={title:clean(t.value,120).replace(/\n/g," "),text:clean(x.value,5000)}; if(d.title.length<2||d.text.length<3){ msg.className="msg bad"; msg.textContent="Preencha título e texto."; return; } b.disabled=true; try{ await write("membros/"+newId(),{...d,em:new Date().toISOString()}); t.value=""; x.value=""; toast("Texto publicado para membros."); }catch(err){ msg.className="msg bad"; msg.textContent=errMsg(err); } finally{ b.disabled=false; } });
    p.append(f);
  }
  if (!list.length){ p.append(el("p",{class:"mono",style:"margin-top:20px",text:"Ainda não há textos exclusivos."})); return; }
  const wrap=el("div",{class:"alist",style:"display:grid"});
  list.sort((a,b)=>String(b.em).localeCompare(String(a.em))).forEach(m=>{ const box=el("article",{class:"mtext"},el("span",{class:"mono",text:fmtDate(m.em)}),el("h4",{text:String(m.title||"").slice(0,120)}),el("p",{text:String(m.text||"").slice(0,5000)})); if(isAdmin()) box.append(el("div",{class:"cfoot",style:"margin-top:12px"},armed("Excluir",async()=>{ try{ await remove("membros/"+m.id); toast("Texto excluído."); }catch(err){ toast(errMsg(err)); } }))); wrap.append(box); });
  p.append(wrap);
}
function tabAbout(p){
  const cur=S.sobre||{big:$("#bioBig").textContent,p1:$("#bioP1").textContent,p2:$("#bioP2").textContent};
  const a=el("textarea",{id:"abBig",maxlength:"300"}); a.value=cur.big||"";
  const b=el("textarea",{id:"abP1",maxlength:"1200"}); b.value=cur.p1||"";
  const c=el("textarea",{id:"abP2",maxlength:"1200"}); c.value=cur.p2||"";
  const msg=el("div",{class:"msg",role:"status"});
  const f=el("form",{class:"aform",novalidate:""},
    el("div",{class:"field"},el("label",{for:"abBig",text:"Frase de apresentação"}),a),
    el("div",{class:"field"},el("label",{for:"abP1",text:"Primeiro parágrafo"}),b),
    el("div",{class:"field"},el("label",{for:"abP2",text:"Segundo parágrafo"}),c));
  const s=el("button",{class:"btn small gold",type:"submit",text:"Salvar biografia"});
  f.append(el("div",{class:"formrow"},el("small",{text:"Aparece na seção Sobre para todos os visitantes."}),s),msg);
  f.addEventListener("submit",async e=>{ e.preventDefault(); const d={big:clean(a.value,300),p1:clean(b.value,1200),p2:clean(c.value,1200)}; if(d.big.length<3){ msg.className="msg bad"; msg.textContent="Escreva a frase de apresentação."; return; } s.disabled=true; try{ await write("site/sobre",d); toast("Biografia salva."); }catch(err){ msg.className="msg bad"; msg.textContent=errMsg(err); } finally{ s.disabled=false; } });
  p.append(el("h2",{text:"Sobre o autor",style:"margin:0"}),f);
}
function tabMine(p){
  const mine=S.all.filter(c=>c.uid===S.uid).sort((a,b)=>b.em.localeCompare(a.em));
  p.append(el("h2",{text:"Meus comentários",style:"margin:0"}),el("p",{text:"Você pode excluir qualquer comentário seu a qualquer momento."}));
  if(!mine.length){ p.append(el("p",{class:"mono",text:"Você ainda não comentou."})); return; }
  const ol=el("ol",{class:"clist"}); mine.forEach(c=>ol.append(commentItem(c,true))); p.append(ol);
}
function tabSecurity(p){
  const rows=[
    ["Ativo","Sem senha própria no site","O login usa a sua conta conectada. Não há senha deste site para ser roubada, adivinhada ou vazada, e nenhum token fica na página, na URL ou no navegador."],
    ["Ativo","Permissões conferidas no servidor","Cada leitura e escrita passa pelas regras de acesso do servidor. Mostrar ou esconder botões é só conforto visual: quem não tem permissão é recusado mesmo alterando o código da página."],
    ["Ativo","Menor privilégio","Visitantes só leem. Leitores conectados escrevem apenas os próprios comentários. Membros leem a área de membros. Só o autor publica, edita, modera e lê rascunhos e denúncias."],
    ["Ativo","Proteção contra XSS","Tudo o que vem de leitores é exibido como texto puro, nunca como HTML. Caracteres invisíveis e de controle são removidos."],
    ["Ativo","Validação e limites","Tamanho máximo nos campos, um comentário a cada 30 s, bloqueio de repetição, no máximo 1 link por comentário e armadilha anti-robô."],
    ["Ativo","Política de segurança de conteúdo","A página só carrega scripts e fontes de origens autorizadas; o resto é bloqueado pelo navegador. Links externos abrem sem dar acesso à página."],
    ["Ativo","Exclusão em duas etapas","Apagar qualquer item pede confirmação, para evitar perdas por clique acidental."],
    ["Ativo","Sem rastreadores","Nenhum script de terceiros, cookie de publicidade ou pixel."],
    ["Recomendado","Verificação em duas etapas","Ative a verificação em duas etapas na conta (Google ou e-mail) que você usa para entrar. É a principal defesa do painel do autor."],
    ["Recomendado","Revise quem tem acesso","No menu Compartilhar, dê Editor só para quem pode administrar. Membros devem ser Colaboradores."]
  ];
  p.append(el("h2",{text:"Segurança",style:"margin:0"}),el("p",{text:"O que protege esta área hoje."}));
  const ul=el("ul",{class:"checks"}); rows.forEach(([s,t,d])=>ul.append(el("li",{},el("span",{class:"tag "+(s==="Ativo"?"ok":"pend"),text:s}),el("div",{},el("b",{text:t}),d)))); p.append(ul);
}
$("#accountBtn").addEventListener("click",()=>openAccount());
$("#memBtn").addEventListener("click",()=>openAccount(S.role==="membro"||isAdmin()?"membros":undefined));

function applyRole(){
  const b=$("#accountBtn"); b.dataset.role=S.role;
  const lbl = isAdmin()?"Painel do autor":S.role==="membro"?"Área de membros":S.role==="leitor"?"Minha área":"Entrar";
  $("#accountLbl").textContent=lbl; b.setAttribute("aria-label",lbl);
  const n=S.members.filter(m=>m.id!=="_acesso").length;
  $("#memState").textContent = isAdmin()||S.role==="membro" ? `${n} ${n===1?"texto exclusivo":"textos exclusivos"}` : "";
  $("#memLbl").textContent = isAdmin()?"Gerenciar área de membros":S.role==="membro"?"Abrir área de membros":"Entrar na área de membros";
}
function applyAbout(){
  if (!S.sobre) return;
  const v=S.sobre; if(typeof v.big==="string"&&v.big) $("#bioBig").textContent=v.big.slice(0,300);
  $("#bioP1").textContent=typeof v.p1==="string"?v.p1.slice(0,1200):""; $("#bioP2").textContent=typeof v.p2==="string"?v.p2.slice(0,1200):"";
  $("#bioP1").hidden=!$("#bioP1").textContent; $("#bioP2").hidden=!$("#bioP2").textContent; $("#bioDraft").hidden=true;
}

/* Sincronização */
let refreshT;
function refresh(){ clearTimeout(refreshT); refreshT=setTimeout(()=>{ rebuildPosts(); renderGrid(); showTome(); renderComments(); applyRole(); if(sheetMode==="account") safeRedraw(); },40); }
function ingestComments(snap){
  const all=[], byUser={};
  snap.docs.forEach(d=>{ const v=d.data()||{}; const itens=Array.isArray(v.itens)?v.itens:[]; byUser[d.id]={nome:typeof v.nome==="string"?v.nome.slice(0,40):"",itens};
    itens.forEach(x=>{ if(!x||typeof x.id!=="string"||typeof x.post!=="string"||typeof x.texto!=="string") return; all.push({id:x.id.slice(0,64),post:x.post,texto:x.texto.slice(0,600),em:String(x.em||""),uid:d.id,nome:byUser[d.id].nome}); }); });
  S.all=all; S.byUser=byUser; refresh();
}
async function init(){
  if (!window.claude||typeof window.claude.use!=="function") return;
  try{
    const [db,user]=await Promise.all([claude.use("db"),claude.use("user")]);
    if (!db) return;
    S.db=db; S.user=user;
    S.uid = user ? await user.id() : null;
    const admin = user ? await user.canEdit() : false;
    if (user){ try{ const me=await user.me(); S.name=(me&&me.name)||""; }catch{} }
    let member=false;
    try{ const acc=await db.doc("membros/_acesso").get(); member=acc.exists; }catch{}
    S.role = admin ? "admin" : member ? "membro" : S.uid ? "leitor" : "visitante";
    S.writable = !!S.uid;
    S.ready = true;
    db.collection("posts").onSnapshot(s=>{ const m={}; s.docs.forEach(d=>{ const v=d.data(); if(v&&typeof v==="object") m[d.id]=v; }); S.postsDb=m; refresh(); },()=>{});
    db.doc("site/sobre").onSnapshot(s=>{ S.sobre=s.exists?s.data():null; applyAbout(); },()=>{});
    db.collection("c").onSnapshot(ingestComments,()=>{});
    db.doc("mod/estado").onSnapshot(s=>{ const v=s.exists?s.data():{}; S.mod={aprovados:Array.isArray(v.aprovados)?v.aprovados:[],ocultos:Array.isArray(v.ocultos)?v.ocultos:[]}; refresh(); },()=>{});
    if (admin||member) db.collection("membros").onSnapshot(s=>{ S.members=s.docs.map(d=>({id:d.id,...(d.data()||{})})); refresh(); },()=>{});
    if (admin){
      db.collection("rascunhos").onSnapshot(s=>{ S.drafts=s.docs.map(d=>({id:d.id,...sanitizePost(d.data()||{})})).sort((a,b)=>b.em.localeCompare(a.em)); refresh(); },()=>{});
      db.collection("denuncias").onSnapshot(s=>{ S.reports=s.docs.flatMap(d=>Array.isArray(d.data()?.itens)?d.data().itens:[]); refresh(); },()=>{});
    }
    refresh();
  }catch{ /* sem conta nesta visualização: o site segue funcionando para leitura */ }
}

function reveal(){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const els=[...document.querySelectorAll(".reveal")].filter(e=>e.getBoundingClientRect().top>innerHeight);
  els.forEach(e=>e.classList.add("pre"));
  const ob=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.remove("pre"); ob.unobserve(e.target);} }),{rootMargin:"0px 0px -10% 0px"});
  els.forEach(e=>ob.observe(e));
}

rebuildPosts(); renderGrid(); showTome(); applyRole(); reveal(); route(); init();
})();
