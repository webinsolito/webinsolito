(()=>{"use strict";
const INTENTS=[
 {phrases:["vendere auto","vendere macchina","vendo auto","mettere in vendita auto","fare annuncio auto"],targets:["sell-my-car","car-value","carcost"],label:"vendere un'auto"},
 {phrases:["scade revisione","scadenza revisione","fare revisione","quando revisione","revisione auto"],targets:["revisione-memo","autobuddy"],label:"gestire la revisione"},
 {phrases:["quanto costa viaggio","quanto spendo viaggio","andare a roma","costo viaggio auto","costo trasferta"],targets:["tripcost","fuel-trip","road-trip"],label:"calcolare un viaggio"},
 {phrases:["parto una settimana","parto per viaggio","preparare valigia","cosa porto viaggio","lista valigia"],targets:["packr","trip-planner","travel-docs"],label:"preparare un viaggio"},
 {phrases:["dividere cena","dividere conto","dividere spese","chi deve dare soldi","spesa tra amici"],targets:["splitly","trip-share"],label:"dividere una spesa"},
 {phrases:["cosa cucino","cosa cucino stasera","cosa cucinare","ho in frigo","avanzi frigo","ricetta con quello che ho"],targets:["frigochef","leftover-chef","meal-planner"],label:"decidere cosa cucinare"},
 {phrases:["costo vero auto","quanto costa auto","spese auto","costo annuale auto","costo mensile auto"],targets:["carcost","fuel-budget","service-book"],label:"capire il costo dell'auto"},
 {phrases:["benzina meno cara","benzina economica","distributore conveniente","prezzo carburante","dove fare benzina"],targets:["fuelgo","fuel-saver"],label:"risparmiare sul carburante"},
 {phrases:["studiare esame","preparare esame","organizzare studio","piano esame","devo studiare","devo studiare per un esame"],targets:["exam-planner","study-timer","study-notes"],label:"preparare un esame"},
 {phrases:["voglio risparmiare","devo risparmiare","risparmiare soldi","mettere soldi da parte","spendo troppo"],targets:["savings-goal","budget-lite","home-budget","price-compare"],label:"risparmiare"},
 {phrases:["organizzare documenti","devo organizzare i documenti","mettere in ordine documenti","archiviare documenti"],targets:["docpocket","checklist","warranty-pocket"],label:"organizzare i documenti"},
 {phrases:["trasloco","cambiare casa","devo cambiare casa","sto cambiando casa","organizzare trasloco"],targets:["moving-list","home-inventory","docpocket"],label:"organizzare un trasloco"},
 {phrases:["garanzia prodotto","quando scade garanzia","salvare garanzie","scontrino garanzia"],targets:["warranty-check","warranty-pocket","receipt-pocket"],label:"gestire una garanzia"},
 {phrases:["preventivo cliente","fare preventivo","scrivere preventivo","prezzo lavoro cliente"],targets:["quote-maker","client-memo","price-list"],label:"preparare un preventivo"},
 {phrases:["qr code","creare qr","fare qr","qr link"],targets:["qrpocket","qrmenu"],label:"creare un QR"},
 {phrases:["budget casa","spese di casa","organizzare spese casa","quanto spendo casa"],targets:["home-budget","home-expense","budget-lite"],label:"organizzare le spese di casa"},
 {phrases:["documenti auto","scadenze auto","organizzare documenti macchina"],targets:["car-docs","autobuddy","revisione-memo"],label:"organizzare i documenti auto"}
];
const SYNONYMS=[
 ["auto","macchina","automobile","veicolo"],
 ["benzina","carburante","diesel","gasolio"],
 ["viaggio","trasferta","vacanza","partenza"],
 ["spesa","costo","prezzo","soldi"],
 ["casa","abitazione","appartamento"],
 ["documento","documenti","carta","carte"],
 ["scadenza","scade","scadere","rinnovo"],
 ["studiare","studio","esame","ripasso"],
 ["cucinare","cucino","ricetta","mangiare"],
 ["vendere","vendo","vendita","annuncio"],
 ["garanzia","warranty"],
 ["conto","cena","rimborso","dividere"]
];
const STOP=new Set(["devo","voglio","vorrei","mi","serve","per","il","lo","la","i","gli","le","un","una","uno","di","da","a","in","con","e","o","che","come","fare","faccio","posso","quanto"]);
const strip=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
const tokens=s=>strip(s).split(" ").filter(x=>x&&!STOP.has(x));
const synonymSet=t=>{const out=new Set([t]);for(const g of SYNONYMS)if(g.includes(t))g.forEach(x=>out.add(x));return out};
function distance(a,b){if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const cur=[i];for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur}return prev[b.length]}
function fuzzy(a,b){if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return .82;const d=distance(a,b),m=Math.max(a.length,b.length);return m?Math.max(0,1-d/m):0}
function intentScore(q,intent){
 const qt=tokens(q),ps=intent.phrases.map(strip);let best=0;
 for(const p of ps){
  if(strip(q).includes(p)||p.includes(strip(q)))best=Math.max(best,.96);
  const pt=tokens(p);if(!pt.length)continue;
  let hit=0;
  for(const x of qt){let bx=0;for(const y of pt){for(const sx of synonymSet(x))bx=Math.max(bx,fuzzy(sx,y))}if(bx>=.72)hit+=bx}
  best=Math.max(best,hit/Math.max(pt.length,qt.length));
 }
 return best;
}
function rankApp(app,q,intentBoost){
 const nq=strip(q),qt=tokens(q),name=strip(app.name),desc=strip(app.description),cat=strip(app.category),hay=name+" "+desc+" "+cat;
 let s=0;
 if(name===nq)s+=40;
 if(name.startsWith(nq)&&nq.length>1)s+=18;
 if(hay.includes(nq)&&nq.length>2)s+=12;
 for(const t of qt){
  const syn=synonymSet(t);let best=0;
  for(const x of syn){
   if(name.includes(x))best=Math.max(best,7);
   else if(desc.includes(x))best=Math.max(best,4);
   else if(cat.includes(x))best=Math.max(best,2);
   for(const nt of name.split(" "))if(x.length>=4)best=Math.max(best,fuzzy(x,nt)*4.5);
  }
  s+=best;
 }
 s+=intentBoost||0;
 return s;
}
window.WebinsolitoSearch={
 search(q,apps,categories,limit=10){
  const nq=strip(q);if(!nq)return[];
  const boosts=new Map(),reasons=new Map();
  for(const intent of INTENTS){
   const m=intentScore(nq,intent);
   if(m>=.52)for(let i=0;i<intent.targets.length;i++){
    const id=intent.targets[i],b=42*m-(i*8);
    if(b>(boosts.get(id)||0)){boosts.set(id,b);reasons.set(id,intent.label)}
   }
  }
  const appResults=apps.map(app=>({type:"app",app,score:rankApp(app,nq,boosts.get(app.id)||0),reason:reasons.get(app.id)||""})).filter(x=>x.score>=4);
  const catResults=(categories||[]).map(c=>{
   const h=strip(c.name+" "+c.tagline),qt=tokens(nq);let score=0;
   for(const t of qt)for(const x of synonymSet(t)){if(h.includes(x))score=Math.max(score,6)}
   return{type:"category",category:c,score};
  }).filter(x=>x.score>0);
  return appResults.concat(catResults).sort((a,b)=>b.score-a.score).slice(0,limit);
 },
 normalize:strip
};
})();