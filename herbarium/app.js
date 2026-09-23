import { classifyNegativeEvidence } from './negative-gate.mjs';
import { classifyPixelsLocally } from './local-detector.mjs';
import { inspectImageFile, MAX_INPUT_BYTES, MAX_IMAGE_EDGE, JPEG_QUALITY } from './image-security.mjs';

const DB_NAME='herbarium.local.v1';
const STORE_NAME='observations';
const MAX_PIXELS=40_000_000;
const activeUrls=new Set();
const byId=id=>document.getElementById(id);

function openDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(new Error('IndexedDB non disponibile.'));
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Database locale non disponibile.'));
    request.onblocked=()=>reject(new Error('Database locale bloccato da un’altra scheda.'));
  });
}
async function loadObservations(){
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{
    const req=db.transaction(STORE_NAME,'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error||new Error('Lettura osservazioni fallita.'));
  });}finally{db.close();}
}
async function getObservation(id){
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{
    const req=db.transaction(STORE_NAME,'readonly').objectStore(STORE_NAME).get(id);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error||new Error('Lettura osservazione fallita.'));
  });}finally{db.close();}
}
async function saveObservation(observation){
  const db=await openDb();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite');
      tx.objectStore(STORE_NAME).add(observation);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Salvataggio locale fallito.'));
      tx.onabort=()=>reject(tx.error||new Error('Salvataggio locale annullato.'));
    });
  }finally{db.close();}
  const stored=await getObservation(observation.id);
  if(!stored||stored.id!==observation.id||!Array.isArray(stored.evidence)||stored.evidence.length!==observation.evidence.length){
    throw new Error('Verifica del salvataggio locale fallita.');
  }
  return stored;
}
async function deleteObservation(id){
  const db=await openDb();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Eliminazione fallita.'));
      tx.onabort=()=>reject(tx.error||new Error('Eliminazione annullata.'));
    });
  }finally{db.close();}
  if(await getObservation(id))throw new Error('Verifica eliminazione fallita.');
}
async function ensureStorageCapacity(bytes){
  if(!navigator.storage?.estimate)return;
  try{
    const {usage=0,quota=0}=await navigator.storage.estimate();
    if(quota&&usage+bytes>quota*.92)throw new Error('Spazio locale insufficiente per salvare le foto in sicurezza.');
  }catch(error){
    if(/Spazio locale/.test(String(error?.message)))throw error;
  }
}
function trackUrl(blob){
  if(!(blob instanceof Blob))return null;
  const url=URL.createObjectURL(blob);activeUrls.add(url);return url;
}
function cleanupUrls(){for(const url of activeUrls)URL.revokeObjectURL(url);activeUrls.clear();}
addEventListener('pagehide',cleanupUrls,{once:true});

function friendlyDate(value){
  if(!value)return'Data non disponibile';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return'Data non disponibile';
  return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
}
function statusInfo(item){
  if(item?.status==='REJECT')return{label:'Non vegetale / esclusa',className:'reject'};
  if(item?.status==='VERIFIED'&&item?.scientificName)return{label:item.scientificName,className:'verified'};
  if(item?.status==='PROPOSED'&&item?.scientificName)return{label:'Specie proposta',className:'proposed'};
  return{label:'Da verificare',className:'pending'};
}
function evidenceCount(item){return Array.isArray(item?.evidence)?item.evidence.length:0;}
function firstImageUrl(item){
  const entry=(Array.isArray(item?.evidence)?item.evidence:[]).find(x=>x&&(x.blob instanceof Blob||x.data instanceof ArrayBuffer||ArrayBuffer.isView(x.data)));
  if(!entry)return null;
  if(entry.blob instanceof Blob)return trackUrl(entry.blob);
  const payload=entry.data instanceof ArrayBuffer?entry.data:entry.data.buffer;
  return trackUrl(new Blob([payload],{type:entry.type||'image/jpeg'}));
}
function el(tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
function emptyState(title,copy,href,label){
  const box=el('div','empty-state rich-empty');
  box.append(el('span','empty-leaf','⌁'),el('strong','',title),el('span','',copy));
  if(href){const a=el('a','',label||'Continua');a.href=href;box.append(a);}
  return box;
}
async function renderStats(){
  const totalEl=byId('observationCount'),speciesEl=byId('speciesCount');
  if(!totalEl&&!speciesEl)return;
  try{
    const items=await loadObservations();
    if(totalEl)totalEl.textContent=String(items.length);
    if(speciesEl)speciesEl.textContent=String(items.filter(x=>x?.status==='VERIFIED'&&x?.scientificName).length);
  }catch{
    if(totalEl)totalEl.textContent='—';if(speciesEl)speciesEl.textContent='—';
  }
}
async function renderCollection(){
  const list=byId('collectionList');if(!list)return;
  const count=byId('collectionCount'),verified=byId('collectionVerifiedCount');
  try{
    const items=(await loadObservations()).filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    count.textContent=String(items.length);
    verified.textContent=String(items.filter(x=>x.status==='VERIFIED'&&x.scientificName).length);
    list.replaceChildren();
    if(!items.length){list.append(emptyState('La tua raccolta è ancora vuota.','La prima osservazione salvata comparirà qui.','./observe.html','Nuova osservazione'));return;}
    for(const [index,item] of items.entries()){
      const card=el('article','observation-card');
      const media=el('div','observation-media'),url=firstImageUrl(item);
      if(url){const img=el('img');img.src=url;img.alt='Foto osservazione';img.loading='lazy';media.append(img);}
      else media.append(el('div','observation-placeholder','HERBARIUM'));
      const body=el('div','observation-card-body'),top=el('div','observation-card-top');
      const info=statusInfo(item),badge=el('span',`human-status ${info.className}`,info.label);
      const number=el('span','observation-number',String(index+1).padStart(2,'0'));
      top.append(badge,number);
      const title=el('h3','',item.status==='REJECT'?'Osservazione esclusa':'Osservazione botanica');
      const meta=el('p','',`${friendlyDate(item.createdAt)} · ${evidenceCount(item)} foto/dettagli`);
      const actions=el('div','observation-actions');
      const open=el('a','observation-open','Apri risultato');open.href=`./result.html?id=${encodeURIComponent(item.id)}`;
      const del=el('button','observation-delete','Elimina');del.type='button';del.dataset.deleteId=item.id;
      del.addEventListener('click',async()=>{
        const id=item.id;if(!id||!confirm('Eliminare questa osservazione e le sue foto locali?'))return;
        del.disabled=true;
        try{await deleteObservation(id);await renderCollection();}catch{del.disabled=false;alert('Eliminazione non riuscita. I dati non sono stati modificati.');}
      });
      actions.append(open,del);body.append(top,title,meta,actions);card.append(media,body);list.append(card);
    }
  }catch{
    count.textContent='—';verified.textContent='—';list.replaceChildren(emptyState('Raccolta non disponibile.','Non riesco a leggere IndexedDB. Nessun dato è stato modificato.'));
  }
}
async function renderBook(){
  const list=byId('pendingList');if(!list)return;
  const count=byId('pendingCount'),bookCount=byId('bookCount');
  try{
    const all=(await loadObservations()).filter(Boolean);
    const plantCandidates=all.filter(x=>x.status!=='REJECT').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    const pending=plantCandidates.filter(x=>x.status!=='VERIFIED');
    count.textContent=String(pending.length);bookCount.textContent=`${plantCandidates.length} osservazioni`;list.replaceChildren();
    if(!pending.length){list.append(emptyState('Nessuna osservazione in attesa.','Le osservazioni REJECT non entrano nel libro botanico.','./observe.html','Nuova osservazione'));return;}
    for(const [index,item] of pending.entries()){
      const card=el('article','book-specimen-card'),media=el('div','book-specimen-media'),url=firstImageUrl(item);
      if(url){const img=el('img');img.src=url;img.alt='Foto dello specimen osservato';img.loading='lazy';media.append(img);}else media.append(el('div','book-specimen-placeholder','Flora Observata'));
      const body=el('div','book-specimen-body');
      body.append(el('span','book-specimen-kicker',`SPECIMEN ${String(index+1).padStart(2,'0')}`),el('h3','',item.status==='PROPOSED'?'Specie proposta da verificare':'Determinazione in attesa'),el('span','human-status pending','Da verificare'),el('p','',`${friendlyDate(item.createdAt)} · ${evidenceCount(item)} evidenze reali`));
      const open=el('a','observation-open','Apri risultato');open.href=`./result.html?id=${encodeURIComponent(item.id)}`;body.append(open);card.append(media,body);list.append(card);
    }
  }catch{count.textContent='—';bookCount.textContent='Dati locali non disponibili';list.replaceChildren(emptyState('Libro non disponibile.','Nessun dato è stato modificato.'));}
}
async function renderAtlas(){
  const root=byId('atlasRegions');if(!root)return;
  const locatedEl=byId('atlasLocatedCount'),regionEl=byId('atlasRegionCount');
  try{
    const all=await loadObservations();
    const located=all.filter(x=>x?.location&&Number.isFinite(x.location.latitude)&&Number.isFinite(x.location.longitude));
    const regions=[...new Set(all.map(x=>typeof x?.region==='string'?x.region.trim():'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
    locatedEl.textContent=String(located.length);regionEl.textContent=String(regions.length);root.replaceChildren();
    if(!located.length&&!regions.length){root.append(emptyState('Atlante vuoto.','Nessuna osservazione contiene coordinate, regione o luogo realmente salvati.'));return;}
    for(const name of regions)root.append(el('span','atlas-region-chip',name));
    for(const item of located){
      const coord=el('div','atlas-coordinate');
      coord.textContent=`${Number(item.location.latitude).toFixed(5)}, ${Number(item.location.longitude).toFixed(5)}${item.location.label?' · '+item.location.label:''}`;
      root.append(coord);
    }
  }catch{locatedEl.textContent='—';regionEl.textContent='—';root.replaceChildren(emptyState('Atlante non disponibile.','Nessun dato è stato modificato.'));}
}
async function renderAcademy(){
  const list=byId('academyList');if(!list)return;
  const count=byId('academyObservationCount'),multi=byId('academyMultiViewCount');
  try{
    const items=(await loadObservations()).filter(x=>x&&x.status!=='REJECT').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    count.textContent=String(items.length);multi.textContent=String(items.filter(x=>evidenceCount(x)>=2).length);list.replaceChildren();
    if(!items.length){list.append(emptyState('Nessuna osservazione botanica disponibile.','L’Academy resta vuota finché non esistono dati reali.'));return;}
    for(const [index,item] of items.entries()){
      const card=el('article','pending-card'),n=evidenceCount(item);
      card.append(el('strong','',`Osservazione ${String(index+1).padStart(2,'0')} · ${item.status||'UNKNOWN'}`),el('span','',n>=2?`${n} viste reali: documentazione più completa.`:`${n} vista reale: una seconda vista può documentare meglio l’esemplare.`));
      list.append(card);
    }
  }catch{count.textContent='—';multi.textContent='—';list.replaceChildren(emptyState('Academy non disponibile.','Nessun dato è stato modificato.'));}
}
function resultCopy(item){
  if(item.status==='REJECT')return{
    eyebrow:'Esito conservativo',title:'Non associata a una pianta',message:'Questa osservazione è stata esclusa in base al segnale negativo fornito. Nessuna specie è stata associata.',badge:'REJECT'
  };
  if(item.status==='VERIFIED'&&item.scientificName)return{
    eyebrow:'Determinazione validata',title:item.scientificName,message:'Questa determinazione proviene da dati validati presenti nell’osservazione.',badge:'VERIFIED'
  };
  if(item.status==='PROPOSED'&&item.scientificName)return{
    eyebrow:'Specie proposta',title:item.scientificName,message:'La proposta richiede conferma. Non viene trattata come VERIFIED.',badge:'PROPOSTA'
  };
  return{eyebrow:'Identificazione',title:'Identificazione non disponibile',message:'La foto è salvata, ma HERBARIUM non dispone ancora di un motore specie validato. L’osservazione resta da verificare.',badge:'UNKNOWN'};
}
async function renderResult(){
  const root=byId('resultPage');if(!root)return;
  const id=new URLSearchParams(location.search).get('id');
  const title=byId('resultMainTitle'),copy=byId('resultCopy'),badge=byId('resultBadge'),media=byId('resultMedia'),meta=byId('resultMeta'),deleteBtn=byId('resultDelete'),threeD=byId('result3d');
  if(!id){title.textContent='Risultato non disponibile';copy.textContent='Manca l’identificatore dell’osservazione.';badge.textContent='ERRORE';deleteBtn.hidden=true;return;}
  try{
    const item=await getObservation(id);
    if(!item){title.textContent='Osservazione non trovata';copy.textContent='Il dato potrebbe essere stato eliminato dal dispositivo.';badge.textContent='ERRORE';deleteBtn.hidden=true;return;}
    const state=resultCopy(item);title.textContent=state.title;copy.textContent=state.message;badge.textContent=state.badge;badge.dataset.state=item.status||'UNKNOWN';
    const url=firstImageUrl(item);media.replaceChildren();
    if(url){const img=el('img');img.src=url;img.alt='Foto principale dell’osservazione';media.append(img);}else media.append(el('div','observation-placeholder','Nessuna anteprima'));
    meta.textContent=`${friendlyDate(item.createdAt)} · ${evidenceCount(item)} evidenze · foto ricodificate senza metadati EXIF`;
    if(item.status==='REJECT'&&item.negativeCategory)meta.textContent+=` · segnale: ${item.negativeCategory}`;
    if(threeD){threeD.href='./species-bellis-demo.html';threeD.textContent='Apri demo 3D tecnica Bellis perennis (non collegata a questa foto)';}
    deleteBtn.addEventListener('click',async()=>{
      if(!confirm('Eliminare questa osservazione e le sue foto locali?'))return;
      deleteBtn.disabled=true;
      try{await deleteObservation(id);location.replace('./collection.html');}catch{deleteBtn.disabled=false;alert('Eliminazione non riuscita.');}
    });
  }catch{title.textContent='Errore di lettura locale';copy.textContent='Non riesco ad aprire questa osservazione. Nessun dato è stato modificato.';badge.textContent='ERRORE';deleteBtn.hidden=true;}
}
function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),image=new Image();
    const done=()=>URL.revokeObjectURL(url);
    image.onload=()=>{done();resolve(image);};
    image.onerror=()=>{done();reject(new Error('Il browser non riesce a decodificare questa immagine.'));};
    image.src=url;
  });
}
function canvasToBlob(canvas){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Compressione immagine fallita.')),'image/jpeg',JPEG_QUALITY));
}
async function prepareEvidenceImage(file){
  const inspected=await inspectImageFile(file);
  if(!inspected.ok){
    const messages={
      'too-large':'La foto supera 12 MB.',
      'signature-not-image':'Il contenuto del file non è un’immagine supportata.',
      'mime-mismatch':'Il tipo dichiarato non corrisponde al contenuto reale del file.',
      'empty-file':'Il file è vuoto.'
    };
    throw new Error(messages[inspected.reason]||'File immagine non valido.');
  }
  const image=await loadImage(file);
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('Dimensioni immagine non valide.');
  if(image.naturalWidth*image.naturalHeight>MAX_PIXELS)throw new Error('Immagine troppo grande da decodificare in sicurezza.');
  const scale=Math.min(1,MAX_IMAGE_EDGE/Math.max(image.naturalWidth,image.naturalHeight));
  const width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas non disponibile.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
  const blob=await canvasToBlob(canvas);
  const data=await blob.arrayBuffer();
  return{data,type:'image/jpeg',width,height,bytes:blob.size,originalBytes:file.size||null,sourceType:inspected.detected,exifStripped:true};
}
async function setupObserve(){
  const analyse=byId('analyse'),result=byId('result'),negativeSignal=byId('negativeSignal');
  if(!analyse||!result)return;
  const inputs=[...document.querySelectorAll('input[type=file]')];
  const selected=()=>inputs.filter(x=>x.files?.length);
  const setResult=(text,state='UNKNOWN')=>{result.textContent=text;result.dataset.state=state;};
  async function validate(){
    for(const input of selected()){
      const inspection=await inspectImageFile(input.files[0]);
      if(!inspection.ok)return inspection.reason;
    }
    return null;
  }
  async function refresh(){
    const count=selected().length,gate=classifyNegativeEvidence(negativeSignal?.value||null);
    analyse.disabled=!count;
    if(!count){setResult('Aggiungi una foto per iniziare.');return;}
    const bad=await validate();
    if(bad){analyse.disabled=true;setResult('File non valido o non supportato. Nessun dato verrà salvato.','ERROR');return;}
    setResult(gate.status==='REJECT'?'Segnale negativo impostato: nessuna specie verrà associata.':`Foto pronta: ${count} evidenza/e. Identificazione specie non disponibile: il risultato resterà UNKNOWN.`,gate.status);
  }
  inputs.forEach(input=>input.addEventListener('change',refresh));
  negativeSignal?.addEventListener('change',refresh);
  analyse.addEventListener('click',async()=>{
    const chosen=selected();if(!chosen.length)return;
    analyse.disabled=true;setResult('Validazione e salvataggio locale in corso…');
    try{
      const evidence=[];
      for(const input of chosen){
        const prepared=await prepareEvidenceImage(input.files[0]);
        evidence.push({role:input.id,...prepared});
      }
      await ensureStorageCapacity(evidence.reduce((n,x)=>n+(x.bytes||0),0));
      const gate=classifyNegativeEvidence(negativeSignal?.value||null);
      const detector=await classifyPixelsLocally({decodedEvidence:evidence.length},null);
      const status=gate.status==='REJECT'?'REJECT':detector.status;
      const id=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const observation={
        id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
        status,negativeCategory:gate.negativeCategory,
        identification:{status:'UNAVAILABLE',species:null,confidence:null},
        analysis:{localDetector:detector.reason||'runtime-unavailable',speciesEngine:'unavailable'},
        roles:evidence.map(x=>x.role),evidence,location:null,region:null,
        privacy:{localOnly:true,exifStripped:true}
      };
      await saveObservation(observation);
      if(navigator.storage?.persist)navigator.storage.persist().catch(()=>false);
      setResult(status==='REJECT'?'Salvata come REJECT. Nessuna specie associata.':'Salvata come UNKNOWN. Identificazione non disponibile.',status);
      location.assign(`./result.html?id=${encodeURIComponent(id)}`);
    }catch(error){
      console.error(error);setResult(`${error?.message||'Salvataggio non riuscito.'} Nessuna osservazione incompleta è stata registrata.`,'ERROR');
      analyse.disabled=false;
    }
  });
  refresh();
}
function setupNetwork(){
  const network=byId('network');if(!network)return;
  const update=()=>{network.textContent=navigator.onLine?'online · dati locali':'offline · dati locali';network.setAttribute('aria-label',navigator.onLine?'Connessione disponibile. Dati locali.':'Offline. Dati locali.');};
  addEventListener('online',update);addEventListener('offline',update);update();
}
function registerServiceWorker(){
  if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}),{once:true});
}
setupNetwork();
registerServiceWorker();
setupObserve();
renderStats();
renderCollection();
renderBook();
renderAtlas();
renderAcademy();
renderResult();
