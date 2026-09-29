import {VERSION,scan,maxBid,fixtures} from './core.mjs';
const $=id=>document.getElementById(id);let cars=[],filter='shortlist',selected=null,connected=false;
const money=n=>n===null?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n);
function budget(){const v=['resale','cost','margin'].map(id=>$(id).value.trim()===''?null:Number($(id).value));$('maxbid').textContent=selected?money(maxBid(...v)):'—'}
function render(){
 for(const status of ['shortlist','review','excluded'])$('n-'+status).textContent=cars.filter(c=>c.status===status).length;
 const container=$('cars');container.replaceChildren();
 const visible=cars.filter(c=>c.status===filter);
 if(!visible.length){const p=document.createElement('div');p.className='empty';p.textContent='Nessun veicolo in questa sezione.';container.append(p)}
 for(const car of visible){const card=document.createElement('article');card.className='vehicle'+(selected===car?' selected':'');
 const meta=document.createElement('div');meta.className='meta';meta.textContent=(car.id||'ID SCONOSCIUTO')+' / '+({shortlist:'IDONEO',review:'DA VERIFICARE',excluded:'ESCLUSO'}[car.status]);
 const title=document.createElement('h3');title.textContent=car.name||'Veicolo senza nome';
 const details=document.createElement('p');details.textContent=(car.km===null||car.km===undefined?'Km sconosciuti':car.km.toLocaleString('it-IT')+' km')+' · '+(car.registered||'Immatricolazione sconosciuta');
 card.append(meta,title,details);
 if(car.reasons.length){const reason=document.createElement('p');reason.className='reason';reason.textContent=car.reasons.join(' · ');card.append(reason)}
 if(car.status==='shortlist'){const button=document.createElement('button');button.textContent=selected===car?'Selezionato':'Valuta offerta →';button.onclick=()=>{selected=car;$('selected').textContent=car.name;budget();render()};card.append(button)}
 container.append(card);
 }
}
function load(rows,source){const result=scan(rows);cars=result.cars;selected=null;$('selected').textContent='Seleziona un veicolo dalla shortlist.';budget();$('source').textContent=source;$('summary').textContent=rows.length+' record · '+cars.length+' veicoli · '+result.duplicates+' duplicati rimossi';render()}
$('demo').onclick=()=>load(fixtures,'DEMO · DATI FITTIZI');
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render()});
$('budget').onsubmit=e=>e.preventDefault();$('budget').oninput=budget;
function state(title,detail,ready=false){$('connection').textContent=title;$('detail').textContent=detail;connected=ready;$('live').disabled=!ready}
async function request(type){
 const id=$('extensionId').value.trim();if(!/^[a-p]{32}$/.test(id))throw Error('ID estensione non valido: usa le 32 lettere mostrate in chrome://extensions.');
 if(!globalThis.chrome?.runtime?.sendMessage)throw Error('Apri in Chrome desktop e installa l’estensione AutoBid.');
 return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>reject(Error('Estensione non raggiungibile (timeout).')),7000);
 chrome.runtime.sendMessage(id,{type,protocol:1,version:VERSION,requestId},response=>{clearTimeout(timer);if(chrome.runtime.lastError)return reject(Error(chrome.runtime.lastError.message));if(!response||response.requestId!==requestId||response.protocol!==1)return reject(Error('Risposta estensione non valida.'));if(response.error)return reject(Error(response.error));if(response.version!==VERSION)return reject(Error('Versione incompatibile: aggiorna PWA ed estensione a '+VERSION));resolve(response)});
 });
}
$('connect').onclick=async()=>{state('Collegamento…','Verifica versione e protocollo.');try{const r=await request('AUTOBID_HELLO');state('Collegata · '+r.version,'Apri AutoProff in una scheda Chrome, quindi avvia la scansione.',true)}catch(e){state('Connessione non riuscita',e.message)}};
$('live').onclick=async()=>{if(!connected)return;const button=$('live');button.disabled=true;try{const r=await request('AUTOBID_SCAN');if(!Array.isArray(r.rows)||r.rows.length>5000)throw Error('Risultati scanner non validi.');load(r.rows,'AUTOPROFF · LETTURA ESTENSIONE');state('Collegata · '+VERSION,r.rows.length+' record ricevuti.',true)}catch(e){state('Scansione non riuscita',e.message,false)}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
