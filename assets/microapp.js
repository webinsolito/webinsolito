(function microRuntime(){
  const d=window.WI_DEF||(window.WI_DEFS||{})[document.body.dataset.tool];
  const $=s=>document.querySelector(s);
  const esc=s=>(s??'').toString().replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
  const slugs={auto:"auto",food:"food",money:"soldi",events:"eventi",docs:"documenti",home:"casa",travel:"viaggi",style:"persona",shopping:"shopping",territory:"territorio",business:"business",study:"studio"};
  if(!d){document.body.innerHTML='<main class="tool"><h1>App non disponibile</h1><a href="../">Home</a></main>';return}
  document.title=d.name+" — Webinsolito";
  $("#name").textContent=d.name;
  $("#desc").textContent=d.desc;
  $("#back").href="../"+slugs[d.category]+"/";
  $("#back").textContent="← Categoria";
  const work=$("#work");
  const key="wi.micro."+d.id+".v1";
  const load=f=>{try{const x=localStorage.getItem(key);return x?JSON.parse(x):f}catch{return f}};
  const save=v=>{try{localStorage.setItem(key,JSON.stringify(v))}catch{}};
  const field=f=>{
    const id="f_"+f[0],type=f[2]||"text";
    if(type==="textarea") return `<div class="field"><label for="${id}">${esc(f[1])}</label><textarea class="f" id="${id}"></textarea></div>`;
    return `<div class="field"><label for="${id}">${esc(f[1])}</label><input class="f" id="${id}" type="${esc(type)}"${f[3]?` step="${f[3]}"`:""}></div>`;
  };
  const val=k=>{
    const e=$("#f_"+k);
    if(!e)return"";
    return e.type==="number"?Number(e.value):e.value.trim();
  };
  const euro=n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(n)||0);
  const num=n=>Number(n).toLocaleString("it-IT",{maximumFractionDigits:2});
  const download=(name,obj)=>{
    const a=document.createElement("a"),u=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:"application/json"}));
    a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1200);
  };

  function calculate(k,v){
    const n=x=>Number(v[x])||0;
    switch(k){
      case"portion": return "Nuova quantità: "+num(n("qty")/Math.max(1,n("from"))*n("to"));
      case"pizza":{
        const total=n("people")*n("grams"),h=n("hydration")/100,fl=total/(1+h+.025),water=fl*h,salt=fl*.025;
        return `Impasto ${num(total)} g · farina ${num(fl)} g · acqua ${num(water)} g · sale ${num(salt)} g`;
      }
      case"bbq": return `Carne ${num(n("people")*n("meat")/1000)} kg · contorni ${num(n("people")*n("side")/1000)} kg · bevande ${num(n("people")*n("drink"))} L`;
      case"budget": return "Residuo: "+euro(n("budget")-n("spent"));
      case"convert":{
        const x=n("value"),f=(v.from||"").toLowerCase(),t=(v.to||"").toLowerCase(),m={g:1,kg:1000,ml:1,l:1000};
        if(!(f in m)||!(t in m))return"Usa g, kg, ml oppure l. Le conversioni g↔ml non considerano la densità.";
        return num(x*m[f]/m[t])+" "+t;
      }
      case"discount":{
        const s=n("price")*n("discount")/100;return `Prezzo finale ${euro(n("price")-s)} · risparmio ${euro(s)}`;
      }
      case"salary": return "Compenso lordo stimato: "+euro(n("hours")*n("rate"));
      case"hourvalue": return "Valore medio per ora: "+euro(n("income")/Math.max(.01,n("hours")));
      case"savings":{
        const rem=Math.max(0,n("target")-n("current")),m=Math.ceil(rem/Math.max(.01,n("monthly")));return `Mancano ${euro(rem)} · circa ${m} mesi`;
      }
      case"emergency":{
        const target=n("expense")*n("months");return `Obiettivo ${euro(target)} · da accantonare ${euro(Math.max(0,target-n("saved")))}`;
      }
      case"inflation": return "Equivalente futuro stimato: "+euro(n("amount")*Math.pow(1+n("rate")/100,n("years")));
      case"installment":{
        const P=n("amount"),m=Math.max(1,n("months")),r=n("rate")/1200,pm=r?P*r/(1-Math.pow(1+r,-m)):P/m;return `Rata stimata ${euro(pm)} · totale ${euro(pm*m)}`;
      }
      case"loancompare":{
        const P=n("amount"),m=Math.max(1,n("months")),pay=x=>{const r=x/1200;return r?P*r/(1-Math.pow(1+r,-m)):P/m},a=pay(n("rateA")),b=pay(n("rateB"));
        return `A: ${euro(a)}/mese, totale ${euro(a*m)} · B: ${euro(b)}/mese, totale ${euro(b*m)} · differenza ${euro(Math.abs(a-b)*m)}`;
      }
      case"fuel": return "Spesa mensile stimata: "+euro(n("km")/100*n("cons")*n("price"));
      case"holiday":{
        const t=n("travel")+n("stay")+n("daily")*n("days");return `Spesa prevista ${euro(t)} · residuo ${euro(n("budget")-t)}`;
      }
      case"warrantyvalue": return `Garanzia: ${num(n("warranty")/Math.max(.01,n("product"))*100)}% del valore · ${euro(n("warranty")/Math.max(1,n("months")))}/mese coperto`;
      case"paint": return "Pittura stimata: "+num(n("area")/Math.max(.1,n("coverage"))*n("coats"))+" L";
      case"tile":{
        const one=n("w")/100*n("h")/100,c=Math.ceil(n("area")/Math.max(.0001,one)*(1+n("waste")/100));return c+" piastrelle circa";
      }
      case"room": return `Pavimento ${num(n("l")*n("w"))} m² · perimetro ${num(2*(n("l")+n("w")))} m · pareti ${num(2*(n("l")+n("w"))*n("h"))} m²`;
      case"currency": return "Convertito: "+num(n("amount")*n("rate"));
      case"fueltrip": return `Carburante ${num(n("km")/100*n("cons"))} L · costo ${euro(n("km")/100*n("cons")*n("price"))}`;
      case"size":{
        const s=n("size");return `Indicativo: IT/EU ${s} · internazionale ${s<=40?"XS":s<=44?"S":s<=48?"M":s<=52?"L":"XL+"}`;
      }
      case"shoe":{
        const s=n("size");return `Indicativo: EU ${s} · UK ${num(s-34)} · US uomo ${num(s-33)}. Verifica sempre il marchio.`;
      }
      case"wear": return "Costo per utilizzo: "+euro(n("price")/Math.max(1,n("wears")));
      case"pricecompare":{
        const a=n("p1")/Math.max(.0001,n("q1")),b=n("p2")/Math.max(.0001,n("q2"));return `A ${euro(a)}/unità · B ${euro(b)}/unità · conviene ${a<b?"A":b<a?"B":"uguale"}`;
      }
      case"usedprice": return "Valore residuo stimato: "+euro(n("price")*Math.pow(1-n("dep")/100,n("years")));
      case"invoice": return `IVA ${euro(n("net")*n("vat")/100)} · totale ${euro(n("net")*(1+n("vat")/100))}`;
      case"mileage": return "Rimborso: "+euro(n("km")*n("rate"));
      case"margin":{
        const u=n("sale")-n("cost");return `Utile ${euro(u)} · margine ${num(u/Math.max(.01,n("sale"))*100)}% · ricarico ${num(u/Math.max(.01,n("cost"))*100)}%`;
      }
      case"unit":{
        let x=n("value"),f=(v.from||"").toLowerCase(),t=(v.to||"").toLowerCase();
        if(f==="c"&&t==="f")return num(x*9/5+32)+" °F";
        if(f==="f"&&t==="c")return num((x-32)*5/9)+" °C";
        const m={km:1000,m:1,cm:.01,kg:1000,g:1};
        if(!(f in m)||!(t in m))return"Conversione non supportata.";
        return num(x*m[f]/m[t])+" "+t;
      }
      case"date":{
        const a=new Date(v.from),b=new Date(v.to);if(Number.isNaN(+a)||Number.isNaN(+b))return"Inserisci due date.";return Math.round((b-a)/864e5)+" giorni";
      }
      case"time":{
        const q=s=>{const p=(s||"00:00").split(":").map(Number);return p[0]*60+p[1]},a=q(v.from),b=q(v.to),z=b>=a?b-a:b+1440-a;return Math.floor(z/60)+" h "+z%60+" min";
      }
      default:return"Calcolo completato.";
    }
  }

  function renderCalc(){
    work.innerHTML=`<div class="grid"><section class="card"><h2>Dati</h2>${d.fields.map(field).join("")}<div class="actions"><button class="btn primary" id="go">Calcola</button><button class="btn" id="reset">Reset</button></div></section><section class="card"><h2>Risultato</h2><div id="out" class="result">Inserisci i dati.</div><p class="muted">Calcolo indicativo: verifica i dati ufficiali quando la decisione è importante.</p></section></div>`;
    $("#go").onclick=()=>{const v={};d.fields.forEach(f=>v[f[0]]=val(f[0]));$("#out").textContent=calculate(d.calc,v)};
    $("#reset").onclick=()=>{d.fields.forEach(f=>$("#f_"+f[0]).value="");$("#out").textContent="Inserisci i dati."};
  }

  function renderRecords(){
    let S=load({items:[]});
    work.innerHTML=`<div class="grid"><section class="card"><h2>Aggiungi</h2>${d.fields.map(field).join("")}<div class="actions"><button class="btn primary" id="add">Salva</button><button class="btn" id="export">Esporta</button></div></section><section class="card"><h2>Salvati</h2><div id="list"></div></section></div>`;
    const draw=()=>{
      const list=$("#list");
      list.innerHTML=S.items.length?S.items.map((x,i)=>`<div class="row"><div>${d.fields.filter(f=>x[f[0]]!==""&&x[f[0]]!=null).map((f,j)=>`${j?"<span>":"<b>"}${esc(f[1]+": "+x[f[0]])}${j?"</span>":"</b>"}`).join("")}</div><button class="btn danger" data-i="${i}">Togli</button></div>`).join(""):'<p class="muted">Nessun elemento salvato.</p>';
    };
    $("#add").onclick=()=>{const x={};d.fields.forEach(f=>x[f[0]]=val(f[0]));if(!Object.values(x).some(Boolean))return;S.items.unshift(x);S.items=S.items.slice(0,250);save(S);d.fields.forEach(f=>$("#f_"+f[0]).value="");draw()};
    $("#list").onclick=e=>{const b=e.target.closest("[data-i]");if(!b)return;S.items.splice(+b.dataset.i,1);save(S);draw()};
    $("#export").onclick=()=>download(d.id+".json",S);
    draw();
  }

  function renderChecklist(){
    let S=load({items:d.items.map(t=>({t,done:false}))});
    work.innerHTML='<section class="card"><h2>Checklist</h2><div id="list"></div><div class="field"><label for="custom">Aggiungi voce</label><input class="f" id="custom"></div><div class="actions"><button class="btn primary" id="add">Aggiungi</button><button class="btn" id="reset">Ripristina</button></div></section>';
    const draw=()=>{$("#list").innerHTML=S.items.map((x,i)=>`<label class="check ${x.done?"done":""}"><input type="checkbox" data-i="${i}" ${x.done?"checked":""}><span>${esc(x.t)}</span></label>`).join("")+`<p class="muted">${S.items.filter(x=>x.done).length} / ${S.items.length} completate</p>`};
    $("#list").onchange=e=>{if(e.target.dataset.i==null)return;S.items[+e.target.dataset.i].done=e.target.checked;save(S);draw()};
    $("#add").onclick=()=>{const x=$("#custom").value.trim();if(!x)return;S.items.push({t:x,done:false});$("#custom").value="";save(S);draw()};
    $("#reset").onclick=()=>{S={items:d.items.map(t=>({t,done:false}))};save(S);draw()};
    draw();
  }

  function renderTimer(){
    let left=25*60,t=null;
    work.innerHTML='<section class="card"><h2>Timer</h2><div class="field"><label for="mins">Minuti</label><input class="f" id="mins" type="number" value="25" min="1" max="240"></div><div id="clock" style="font-size:52px;font-weight:950">25:00</div><div class="actions"><button class="btn primary" id="start">Avvia / pausa</button><button class="btn" id="reset">Reset</button></div></section>';
    const draw=()=>$("#clock").textContent=String(Math.floor(left/60)).padStart(2,"0")+":"+String(left%60).padStart(2,"0");
    $("#start").onclick=()=>{if(t){clearInterval(t);t=null;return}if(left<=0)left=(+$("#mins").value||25)*60;t=setInterval(()=>{left--;draw();if(left<=0){clearInterval(t);t=null;alert("Tempo terminato")}},1000)};
    $("#reset").onclick=()=>{if(t)clearInterval(t);t=null;left=(+$("#mins").value||25)*60;draw()};
    $("#mins").onchange=$("#reset").onclick;
  }

  function renderText(){
    work.innerHTML='<section class="card"><h2>Testo</h2><textarea class="f" id="txt" style="min-height:240px"></textarea><div id="stats" class="result"></div></section>';
    const draw=()=>{const s=$("#txt").value,w=s.trim()?s.trim().split(/\s+/).length:0;$("#stats").textContent=`${w} parole · ${s.length} caratteri · ${s?s.split(/\n/).length:0} righe · ~${Math.max(1,Math.ceil(w/200))} min lettura`};
    $("#txt").oninput=draw;draw();
  }

  function renderRandom(){
    work.innerHTML='<section class="card"><h2>Alternative</h2><textarea class="f" id="txt" style="min-height:180px" placeholder="Una voce per riga"></textarea><div class="actions"><button class="btn primary" id="go">Scegli</button></div><div id="out" class="result"></div></section>';
    $("#go").onclick=()=>{const a=$("#txt").value.split(/\n/).map(x=>x.trim()).filter(Boolean);$("#out").textContent=a.length?a[Math.floor(Math.random()*a.length)]:"Inserisci almeno una voce."};
  }

  function renderFlash(){
    let S=load({items:[]}),pos=0,showing=false;
    work.innerHTML='<div class="grid"><section class="card"><h2>Nuova carta</h2><div class="field"><label for="q">Domanda</label><input class="f" id="q"></div><div class="field"><label for="a">Risposta</label><textarea class="f" id="a"></textarea></div><button class="btn primary" id="add">Salva carta</button></section><section class="card"><h2>Ripasso</h2><div id="card" class="result">Nessuna carta.</div><div class="actions"><button class="btn primary" id="flip">Mostra risposta</button><button class="btn" id="next">Prossima</button></div></section></div>';
    const draw=()=>{$("#card").textContent=S.items.length?(showing?S.items[pos].a:S.items[pos].q):"Nessuna carta."};
    $("#add").onclick=()=>{const q=$("#q").value.trim(),a=$("#a").value.trim();if(!q||!a)return;S.items.push({q,a});save(S);$("#q").value=$("#a").value="";pos=S.items.length-1;showing=false;draw()};
    $("#flip").onclick=()=>{showing=!showing;draw()};
    $("#next").onclick=()=>{if(!S.items.length)return;pos=(pos+1)%S.items.length;showing=false;draw()};
    draw();
  }

  function renderDecision(){
    let opts=[];
    work.innerHTML='<section class="card"><h2>Confronta opzioni</h2><div class="field"><label>Opzione</label><input class="f" id="opt"></div><div class="field"><label>Punti a favore (0-10)</label><input class="f" id="pro" type="number" min="0" max="10"></div><div class="field"><label>Punti contro (0-10)</label><input class="f" id="con" type="number" min="0" max="10"></div><button class="btn primary" id="add">Aggiungi</button><div id="list"></div></section>';
    const draw=()=>{$("#list").innerHTML=opts.sort((a,b)=>b.s-a.s).map(x=>`<div class="row"><div><b>${esc(x.n)}</b><span>Punteggio ${x.s}</span></div></div>`).join("")};
    $("#add").onclick=()=>{const n=$("#opt").value.trim();if(!n)return;opts.push({n,s:(+$("#pro").value||0)-(+$("#con").value||0)});$("#opt").value=$("#pro").value=$("#con").value="";draw()};
  }

  function renderGenerator(){
    work.innerHTML=`<div class="grid"><section class="card"><h2>Dati</h2>${d.fields.map(field).join("")}<button class="btn primary" id="go">Genera</button></section><section class="card"><h2>Risultato</h2><textarea class="f" id="out" style="min-height:260px" readonly></textarea><button class="btn" id="copy">Copia</button></section></div>`;
    $("#go").onclick=()=>{
      const v={};d.fields.forEach(f=>v[f[0]]=val(f[0]));let t="";
      if(d.template==="leftover")t=`Ingredienti disponibili: ${v.items}\n\nMetodo rapido: usa prima gli alimenti più deperibili, scegli una base (pasta, riso, uova o pane), aggiungi verdure/proteine e completa con spezie o salsa. Controlla sempre stato e scadenza degli alimenti.`;
      if(d.template==="quote")t=`PREVENTIVO\nCliente: ${v.client}\n\n${v.work}\n\nImporto: ${euro(v.amount)}\nValidità: ${v.valid}`;
      if(d.template==="businesscard")t=[v.name,v.role,v.phone,v.email,v.web].filter(Boolean).join("\n");
      if(d.template==="menu")t=`${v.title}\n\n${v.items}${v.note?`\n\nNOTE / ALLERGENI\n${v.note}`:""}`;
      if(d.template==="gift")t=`Persona: ${v.person}\nAbbigliamento: ${v.clothes}\nScarpe: ${v.shoes}\nNote: ${v.notes}`;
      $("#out").value=t;
    };
    $("#copy").onclick=()=>navigator.clipboard?.writeText($("#out").value);
  }

  function renderReference(){
    work.innerHTML='<section class="card"><div class="field"><label>Cerca</label><input class="f" id="q"></div><div id="list"></div></section>';
    const draw=()=>{const z=$("#q").value.toLowerCase();$("#list").innerHTML=d.items.filter(x=>(x[0]+" "+x[1]).toLowerCase().includes(z)).map(x=>`<div class="ref"><b>${esc(x[0])}</b><div class="muted">${esc(x[1])}</div></div>`).join("")};
    $("#q").oninput=draw;draw();
  }

  function eventOk(e,m){
    const s=(e.title+" "+e.note+" "+e.cat).toLowerCase(),today=new Date(),ds=x=>new Date(x+"T12:00:00"),start=ds(e.date),end=ds(e.end_date||e.date),active=today>=start&&today<=end;
    const day=today.getDay(),toSat=(6-day+7)%7,sat=new Date(today);sat.setDate(today.getDate()+toSat);const sun=new Date(sat);sun.setDate(sat.getDate()+1),over=end>=sat&&start<=sun;
    if(m==="all")return end>=today;if(m==="today")return active;if(m==="weekend")return over;if(m==="family-weekend")return over&&/famiglia|bambin|laborator/.test(s);
    if(m==="free")return /gratuit|ingresso libero|free/.test(s)||e.price===0;if(m==="family")return /famiglia|bambin|laborator/.test(s);
    if(m==="market")return /mercat|fiera/.test(s);if(m==="music")return /musica|concerto|orchestra|festival pian/.test(s);if(m==="festival")return /festival|rassegna/.test(s);
    if(m==="museum")return /museo|mostra|galleria/.test(s);if(m==="cinema")return /cinema|film/.test(s);if(m==="outdoor")return /passegg|escursion|parco|lago|sentier/.test(s);
    if(m==="date")return /musica|mostra|teatro|lago|castello|festival/.test(s);if(m==="indoor")return /museo|mostra|teatro|cinema|palazzo|castello/.test(s);
    if(m==="village")return /sagra|festa|borgo|paese/.test(s);if(m==="sport")return /sport|gara|corsa|torneo/.test(s);return end>=today;
  }

  async function renderEvent(){
    work.innerHTML='<section class="card"><h2>Risultati</h2><p class="muted">Dati dal feed Webinsolito/BresciaGo.</p><div id="events">Caricamento…</div></section>';
    try{
      const r=await fetch("../bresciago/data/events.json",{cache:"no-store"}),j=await r.json(),a=j.events.filter(e=>eventOk(e,d.mode)).slice(0,40);
      $("#events").innerHTML=a.length?a.map(e=>`<article class="event"><h3>${esc(e.title)}</h3><p>${esc(e.date+(e.end_date&&e.end_date!==e.date?" → "+e.end_date:""))} · ${esc(e.place||"")}</p><p>${esc(e.cat||"")}</p><a href="${esc(e.url)}" target="_blank" rel="noopener">Dettagli fonte →</a></article>`).join(""):"Nessun evento corrispondente nel feed attuale.";
    }catch{$("#events").textContent="Feed eventi non disponibile in questo momento."}
  }

  if(d.kind==="calc")renderCalc();
  else if(d.kind==="records")renderRecords();
  else if(d.kind==="checklist")renderChecklist();
  else if(d.kind==="timer")renderTimer();
  else if(d.kind==="text")renderText();
  else if(d.kind==="random")renderRandom();
  else if(d.kind==="flash")renderFlash();
  else if(d.kind==="decision")renderDecision();
  else if(d.kind==="generator")renderGenerator();
  else if(d.kind==="reference")renderReference();
  else if(d.kind==="event")renderEvent();
})();