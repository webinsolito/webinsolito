(()=>{"use strict";
const INTENTS=[
 {phrases:["vendere auto","vendere macchina","vendo auto","mettere in vendita auto","fare annuncio auto"],targets:["sell-my-car","car-value","carcost"],label:"vendere un'auto"},
 {phrases:["quanto vale auto","quanto vale la mia auto","quanto vale macchina","quanto vale la mia macchina","valore auto","valutare auto","valutare macchina"],targets:["car-value","sell-my-car","used-price"],label:"stimare il valore dell'auto"},
 {phrases:["scade revisione","scadenza revisione","fare revisione","quando revisione","revisione auto"],targets:["autobuddy","docpocket"],label:"gestire la revisione"},
 {phrases:["bollo assicurazione revisione","ricordare bollo assicurazione revisione","scadenze macchina","scadenze della macchina"],targets:["autobuddy","docpocket"],label:"ricordare le scadenze auto"},
 {phrases:["quanto costa viaggio","quanto spendo viaggio","andare a roma","costo viaggio auto","costo trasferta"],targets:["tripcost","fuel-trip"],label:"calcolare un viaggio"},
 {phrases:["parto una settimana","parto per viaggio","preparare valigia","cosa porto viaggio","cosa mettere in valigia","cosa devo mettere in valigia","lista valigia"],targets:["packr","trip-planner","travel-docs"],label:"preparare un viaggio"},
 {phrases:["dividere cena","dividere conto","dividere spese","chi deve dare soldi","spesa tra amici"],targets:["splitly"],label:"dividere una spesa"},
 {phrases:["cosa cucino","cosa cucino stasera","cosa cucinare","ho in frigo","avanzi frigo","ricetta con quello che ho"],targets:["frigochef","leftover-chef","meal-planner"],label:"decidere cosa cucinare"},
 {phrases:["costo vero auto","quanto costa auto","spese auto","costo annuale auto","costo mensile auto"],targets:["carcost","fuel-budget","autobuddy"],label:"capire il costo dell'auto"},
 {phrases:["benzina meno cara","benzina economica","distributore conveniente","prezzo carburante","dove fare benzina"],targets:["fuelgo","fuel-saver"],label:"risparmiare sul carburante"},
 {phrases:["studiare esame","preparare esame","organizzare studio","piano esame","devo studiare","devo studiare per un esame"],targets:["exam-planner","study-timer","study-notes"],label:"preparare un esame"},
 {phrases:["voglio risparmiare","devo risparmiare","risparmiare soldi","mettere soldi da parte","non riesco a mettere soldi da parte","non riesco a risparmiare","spendo troppo"],targets:["savings-goal","home-budget","price-compare"],label:"risparmiare"},
 {phrases:["organizzare documenti","devo organizzare i documenti","mettere in ordine documenti","archiviare documenti"],targets:["docpocket","checklist","warranty-pocket"],label:"organizzare i documenti"},
 {phrases:["trasloco","cambiare casa","devo cambiare casa","sto cambiando casa","organizzare trasloco"],targets:["moving-list","home-inventory","docpocket"],label:"organizzare un trasloco"},
 {phrases:["garanzia prodotto","quando scade garanzia","salvare garanzie","scontrino garanzia"],targets:["warranty-check","warranty-pocket","receipt-pocket"],label:"gestire una garanzia"},
 {phrases:["preventivo cliente","fare preventivo","scrivere preventivo","prezzo lavoro cliente"],targets:["quote-maker","client-memo","price-list"],label:"preparare un preventivo"},
 {phrases:["qr code","creare qr","fare qr","qr link"],targets:["qrpocket","qrmenu"],label:"creare un QR"},
 {phrases:["budget casa","spese di casa","organizzare spese casa","quanto spendo casa"],targets:["home-budget","home-expense"],label:"organizzare le spese di casa"},
 {phrases:["documenti auto","scadenze auto","organizzare documenti macchina"],targets:["autobuddy","docpocket"],label:"organizzare i documenti auto"}
];
const SYNONYMS=[
 ["auto","macchina","automobile","veicolo"],["benzina","carburante","diesel","gasolio"],["viaggio","trasferta","vacanza","partenza"],["spesa","costo","prezzo","soldi"],["valore","valutare","vale","stima","stimare"],["risparmiare","risparmio","accantonare"],["valigia","bagaglio","bagagli"],["casa","abitazione","appartamento"],["documento","documenti","carta","carte"],["scadenza","scade","scadere","rinnovo"],["studiare","studio","esame","ripasso"],["cucinare","cucino","ricetta","mangiare"],["vendere","vendo","vendita","annuncio"],["garanzia","warranty"],["conto","cena","rimborso","dividere"]
];
const STOP=new Set(["devo","voglio","vorrei","mi","mia","mio","mie","miei","serve","per","il","lo","la","i","gli","le","un","una","uno","di","da","a","in","con","e","o","che","come","fare","faccio","posso","quanto"]);
const strip=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
const tokens=s=>strip(s).split(" ").filter(x=>x&&!STOP.has(x));
function distance(a,b){if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const cur=[i];for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur}return prev[b.length]}
function fuzzy(a,b){if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return .82;const d=distance(a,b),m=Math.max(a.length,b.length);return m?Math.max(0,1-d/m):0}
const synonymSet=t=>{const out=new Set([t]);for(const g of SYNONYMS)if(g.includes(t)||g.some(x=>t.length>=4&&fuzzy(t,x)>=.78))g.forEach(x=>out.add(x));return out};
function intentScore(q,intent){const qt=tokens(q),ps=intent.phrases.map(strip);let best=0;for(const p of ps){if(strip(q).includes(p)||p.includes(strip(q)))best=Math.max(best,.96);const pt=tokens(p);if(!pt.length)continue;let hit=0;for(const x of qt){let bx=0;for(const y of pt){for(const sx of synonymSet(x))bx=Math.max(bx,fuzzy(sx,y))}if(bx>=.72)hit+=bx}best=Math.max(best,hit/Math.max(pt.length,qt.length))}return best}
function rankApp(app,q,intentBoost){const nq=strip(q),qt=tokens(q),name=strip(app.name),desc=strip(app.description),cat=strip(app.category),hay=name+" "+desc+" "+cat,nameTokens=name.split(" "),descTokens=desc.split(" ");let s=0;if(name===nq)s+=40;if(name.startsWith(nq)&&nq.length>1)s+=18;if(hay.includes(nq)&&nq.length>2)s+=12;for(const t of qt){const syn=synonymSet(t);let best=0;for(const x of syn){if(name.includes(x))best=Math.max(best,7);else if(desc.includes(x))best=Math.max(best,4);else if(cat.includes(x))best=Math.max(best,2);for(const nt of nameTokens)if(x.length>=4)best=Math.max(best,fuzzy(x,nt)*4.5);for(const dt of descTokens)if(x.length>=4)best=Math.max(best,fuzzy(x,dt)*3.4)}s+=best}s+=intentBoost||0;return s}
window.WebinsolitoSearch={search(q,apps,categories,limit=10){const nq=strip(q);if(!nq)return[];const boosts=new Map(),reasons=new Map();for(const intent of INTENTS){const m=intentScore(nq,intent);if(m>=.52)for(let i=0;i<intent.targets.length;i++){const id=intent.targets[i],b=42*m-(i*8);if(b>(boosts.get(id)||0)){boosts.set(id,b);reasons.set(id,intent.label)}}}const appResults=apps.map(app=>({type:"app",app,score:rankApp(app,nq,boosts.get(app.id)||0),reason:reasons.get(app.id)||""})).filter(x=>x.score>=4);const catResults=(categories||[]).map(c=>{const h=strip(c.name+" "+c.tagline),qt=tokens(nq);let score=0;for(const t of qt)for(const x of synonymSet(t)){if(h.includes(x))score=Math.max(score,6)}return{type:"category",category:c,score}}).filter(x=>x.score>0);return appResults.concat(catResults).sort((a,b)=>b.score-a.score).slice(0,limit)},normalize:strip};
})();

/* Home visual runtime polish — premium hero + category hierarchy */
(()=>{
 const style=document.createElement('style');
 style.id='webinsolito-home-runtime-polish';
 style.textContent=`
.top{position:relative;z-index:20;margin-top:4px;padding:7px 12px;border:1px solid rgba(151,180,208,.10);border-radius:18px;background:linear-gradient(180deg,rgba(14,31,49,.58),rgba(7,19,31,.38));box-shadow:inset 0 1px rgba(255,255,255,.045),0 14px 34px rgba(0,0,0,.12);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.hero{border-color:rgba(151,181,210,.24);background:radial-gradient(620px 420px at 78% 44%,rgba(76,128,184,.12),transparent 62%),linear-gradient(145deg,rgba(25,50,76,.96),rgba(7,22,36,.99) 64%);box-shadow:0 48px 130px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.085),inset 0 -1px rgba(0,0,0,.28)}
.heroEyebrow{padding:8px 12px 8px 10px;border:1px solid rgba(227,181,107,.18);border-radius:999px;background:linear-gradient(180deg,rgba(227,181,107,.08),rgba(255,255,255,.018));box-shadow:inset 0 1px rgba(255,255,255,.055)}
.hero h1{text-shadow:0 8px 34px rgba(0,0,0,.26)}
.heroLead{text-shadow:0 8px 28px rgba(0,0,0,.22)}
.searchShell{border-color:rgba(174,199,222,.46);box-shadow:0 28px 70px rgba(0,0,0,.37),inset 0 1px rgba(255,255,255,.09),inset 0 -1px rgba(0,0,0,.34)}
.heroStage:before{content:"";position:absolute;left:50%;top:55%;width:78%;height:44%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.42),transparent 68%);filter:blur(18px)}
.stageCenter{box-shadow:0 38px 82px rgba(0,0,0,.46),inset 0 1px rgba(255,255,255,.11),0 0 88px rgba(227,181,107,.075)}
.gridHead{position:relative;padding:0 2px 14px;border-bottom:1px solid rgba(255,255,255,.075)}
.gridHead:after{content:"";position:absolute;left:0;bottom:-1px;width:84px;height:1px;background:linear-gradient(90deg,#d9aa62,transparent)}
.cats{gap:18px}
.cat{border-color:rgba(143,170,197,.30);box-shadow:var(--sx) var(--sy) 54px rgba(0,0,0,.36),inset 0 1px rgba(255,255,255,.08)}
.cat strong{margin:0 -9px -7px;padding:16px 10px 10px;min-height:48px;border-top:1px solid rgba(255,255,255,.10);border-radius:0 0 22px 22px;background:linear-gradient(180deg,rgba(4,14,24,0),rgba(4,14,24,.66));backdrop-filter:blur(10px) saturate(1.08);-webkit-backdrop-filter:blur(10px) saturate(1.08)}
.cat:nth-child(1),.cat:nth-child(6){border-color:rgba(227,181,107,.20);background:linear-gradient(150deg,rgba(38,68,98,.99),rgba(8,22,36,.995) 68%);box-shadow:0 36px 84px rgba(0,0,0,.40),inset 0 1px rgba(255,255,255,.10)}
.cat:nth-child(1):before,.cat:nth-child(6):before{background:radial-gradient(circle at 72% 20%,color-mix(in srgb,var(--a) 34%,transparent),transparent 44%),radial-gradient(circle at 12% 100%,rgba(227,181,107,.08),transparent 34%),linear-gradient(180deg,rgba(255,255,255,.05),transparent 56%)}
.cat:hover .catArt{transform:translate3d(calc(-50% + var(--ix)),calc(-54% + var(--iy)),32px) scale(1.035);filter:drop-shadow(calc(var(--sx) * .35) 24px 25px rgba(0,0,0,.36))}
.cat[data-category="auto"]:hover .catArt{transform:translate3d(calc(-50% + var(--ix)),calc(-54% + var(--iy)),32px) scale(.975)}
@media(max-width:820px){.hero{padding-top:46px}.heroCopy{max-width:620px}.heroEyebrow{margin-bottom:15px}.cat:nth-child(1),.cat:nth-child(6){grid-column:span 2;min-height:244px}.cat:nth-child(1) .catArt,.cat:nth-child(6) .catArt{width:176px;height:176px;top:41%}.cat:nth-child(1) strong,.cat:nth-child(6) strong{font-size:21px}}
@media(max-width:560px){.wrap{padding-left:12px;padding-right:12px}.top{margin-top:0;padding:5px 8px;border-radius:15px}.hero{margin-top:12px;margin-bottom:30px;padding:32px 18px 26px;border-radius:30px}.heroEyebrow{padding:6px 9px 6px 8px;margin-bottom:13px}.hero h1{line-height:.91}.heroLead{margin-top:12px;line-height:1.04}.hero p{margin-top:15px;line-height:1.55}.searchBox{margin-top:23px}.searchShell{height:60px;border-radius:19px}.heroStage{margin-top:10px}.gridHead{margin-bottom:16px;padding-bottom:12px}.gridHead h2{font-size:29px;line-height:1}.cats{gap:11px}.cat,.cat:nth-child(n+7){min-height:184px}.cat:nth-child(1),.cat:nth-child(6){grid-column:span 2;min-height:224px;border-radius:25px}.catArt,.cat:nth-child(n+7) .catArt{width:118px;height:118px;top:39%}.cat:nth-child(1) .catArt,.cat:nth-child(6) .catArt{width:158px;height:158px;top:40%}.cat strong{font-size:15.5px;min-height:40px;padding:12px 8px 8px}.cat:nth-child(1) strong,.cat:nth-child(6) strong{font-size:18px;min-height:44px}}
@media(max-width:410px){.hero{padding-left:15px;padding-right:15px}.hero h1{font-size:clamp(40px,12.7vw,52px)}.heroLead{font-size:clamp(23px,7.5vw,31px)}.cats{gap:9px}.cat{padding-left:12px;padding-right:12px}.cat strong{font-size:15px}}
@media(hover:none){.cat:active{--lift:-3px;border-color:rgba(227,181,107,.32)}.searchShell:focus-within{transform:none}}
@media(prefers-reduced-motion:reduce){.cat,.catArt,.searchShell{transition:none!important}}
`;
 document.head.appendChild(style);
})();


/* Home hero depth — subtle desktop-only parallax, disabled on touch/reduced motion */
(()=>{const hero=document.querySelector('.hero'),stage=document.querySelector('.heroStage');if(!hero||!stage)return;
const fine=matchMedia('(hover:hover) and (pointer:fine)'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
const center=stage.querySelector('.stageCenter'),ring=stage.querySelector('.stageRing'),glow=stage.querySelector('.stageGlow'),orbits=[...stage.querySelectorAll('.orbit')];
function reset(){[center,ring,glow,...orbits].forEach(el=>{if(el){el.style.translate='';el.style.rotate=''}})}
function move(e){if(!fine.matches||reduced.matches)return reset();const r=hero.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
 if(center){center.style.translate=(x*7).toFixed(1)+'px '+(y*5).toFixed(1)+'px';center.style.rotate=(-y*1.2).toFixed(2)+'deg '+(x*1.2).toFixed(2)+'deg'}
 if(ring)ring.style.translate=(x*3).toFixed(1)+'px '+(y*2).toFixed(1)+'px';
 if(glow)glow.style.translate=(x*-5).toFixed(1)+'px '+(y*-4).toFixed(1)+'px';
 orbits.forEach((el,i)=>{const dir=i%2?1:-1,depth=5+i*1.3;el.style.translate=(x*depth*dir).toFixed(1)+'px '+(y*depth).toFixed(1)+'px'});
}
hero.addEventListener('pointermove',move,{passive:true});hero.addEventListener('pointerleave',reset);fine.addEventListener?.('change',reset);reduced.addEventListener?.('change',reset);
window.webinsolitoHeroDepth={reset};
})();


/* Category card touch feedback — mirrors desktop material response on coarse pointers */
(()=>{const grid=document.getElementById('categoryGrid');if(!grid)return;
 const coarse=matchMedia('(hover:none), (pointer:coarse)');
 const style=document.createElement('style');style.id='webinsolito-card-touch-feedback';style.textContent=`
 @media(hover:none),(pointer:coarse){
  .homePremiumV4 .categoryPanel .cat{transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
  .homePremiumV4 .categoryPanel .cat.is-touching{transform:scale(.982);border-color:color-mix(in srgb,var(--a) 56%,rgba(232,189,120,.32));box-shadow:0 18px 38px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.10)}
  .homePremiumV4 .categoryPanel .cat.is-touching .catArt{transform:translate3d(-50%,-47%,18px) scale(.985)!important;filter:drop-shadow(0 14px 17px rgba(0,0,0,.34))}
  .homePremiumV4 .categoryPanel .cat.is-touching strong{background:linear-gradient(180deg,rgba(8,24,39,.10),rgba(3,12,21,.88))}
 }
 @media(prefers-reduced-motion:reduce){.homePremiumV4 .categoryPanel .cat.is-touching,.homePremiumV4 .categoryPanel .cat.is-touching .catArt{transition:none!important}}
 `;document.head.appendChild(style);
 function bind(){grid.querySelectorAll('.cat:not([data-touch-bound])').forEach(card=>{card.dataset.touchBound='1';
  card.addEventListener('pointerdown',()=>{if(coarse.matches)card.classList.add('is-touching')},{passive:true});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>card.addEventListener(ev,()=>card.classList.remove('is-touching'),{passive:true}));
 })}
 bind();new MutationObserver(bind).observe(grid,{childList:true});
 window.webinsolitoCardTouchFeedback={bind};
})();


/* Premium search surface state — visually joins field + results and keeps active rows in view */
(()=>{const box=document.querySelector('.searchBox'),shell=document.querySelector('.searchShell'),results=document.getElementById('searchResults'),input=document.getElementById('globalSearch');if(!box||!shell||!results||!input)return;
 const style=document.createElement('style');style.id='webinsolito-search-surface-state';style.textContent=`
 .homePremiumV5 .searchBox.results-open .searchShell{border-color:rgba(232,189,120,.60);box-shadow:0 34px 84px rgba(0,0,0,.44),0 0 0 4px rgba(217,170,98,.055),inset 0 1px rgba(255,255,255,.12)}
 .homePremiumV5 .searchBox.results-open:after{content:"";position:absolute;z-index:91;left:30px;right:30px;top:79px;height:14px;background:linear-gradient(180deg,rgba(16,35,54,.98),rgba(8,21,35,.86));filter:blur(4px);pointer-events:none}
 .homePremiumV5 .searchBox.results-open .results{border-color:rgba(232,189,120,.21)}
 @media(max-width:640px){.homePremiumV5 .searchBox.results-open:after{left:22px;right:22px;top:64px;height:11px}}
 `;document.head.appendChild(style);
 function sync(){const open=results.classList.contains('on')&&results.children.length>0;box.classList.toggle('results-open',open);if(open){const active=results.querySelector('.res.active');active?.scrollIntoView({block:'nearest',inline:'nearest'})}}
 new MutationObserver(sync).observe(results,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
 input.addEventListener('keydown',()=>requestAnimationFrame(sync));
 input.addEventListener('input',()=>requestAnimationFrame(sync));
 document.addEventListener('click',()=>requestAnimationFrame(sync));
 sync();window.webinsolitoSearchSurface={sync};
})();


/* Delivery fallback: force the high-contrast premium Home even on older cached index markup */
(()=>{const root=document.querySelector('main.wrap');if(!root)return;root.classList.add('homePremiumV6Fallback');
 const style=document.createElement('style');style.id='webinsolitoIvoryFallback';style.textContent=`
 .homePremiumV6Fallback .searchShell{background:linear-gradient(180deg,#fff9ed,#f2e7d5)!important;border-color:rgba(79,61,35,.16)!important;box-shadow:0 28px 72px rgba(0,0,0,.36),inset 0 1px #fff!important}
 .homePremiumV6Fallback .search{color:#102538!important;font-weight:750}.homePremiumV6Fallback .search::placeholder{color:#68798a!important}
 .homePremiumV6Fallback .searchIcon{background:linear-gradient(145deg,#f8eedf,#eadbc4)!important;border-color:rgba(15,38,58,.14)!important}
 .homePremiumV6Fallback .searchIcon:before{border-color:#173653!important}.homePremiumV6Fallback .searchIcon:after{background:#b8833e!important}
 .homePremiumV6Fallback .categoryPanel{padding:42px 34px 38px!important;border:1px solid rgba(92,68,39,.16)!important;border-radius:42px!important;background:radial-gradient(760px 300px at 0% 0%,rgba(255,255,255,.82),transparent 58%),radial-gradient(620px 300px at 100% 0%,rgba(217,170,98,.16),transparent 64%),linear-gradient(180deg,#f6eddf,#eadbc5)!important;box-shadow:0 42px 120px rgba(0,0,0,.30),inset 0 1px #fff!important}
 .homePremiumV6Fallback .categoryKicker{color:#9a6b31!important}.homePremiumV6Fallback .gridHead h2{color:#11283c!important;text-shadow:none!important}.homePremiumV6Fallback .gridHead span{color:#657789!important}
 .homePremiumV6Fallback .categoryPanel .cat{border-color:rgba(117,151,181,.34)!important;background:radial-gradient(circle at 74% 16%,color-mix(in srgb,var(--a) 24%,transparent),transparent 38%),linear-gradient(158deg,#244969,#0d2a43 58%,#081b2d)!important;box-shadow:0 28px 60px rgba(25,43,59,.22),inset 0 1px rgba(255,255,255,.11)!important}
 .homePremiumV6Fallback .categoryPanel .cat strong{color:#fff8ec!important}
 @media(max-width:640px){.homePremiumV6Fallback .categoryPanel{padding:28px 12px 20px!important;border-radius:30px!important}.homePremiumV6Fallback .searchShell{height:64px!important}}
 `;document.head.appendChild(style);
})();
