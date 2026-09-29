const $ = s => document.querySelector(s);
const content = $('#content');
let currentView = 'today';
let currentVehicle = null;

const stateLabels = {
  IN_ARRIVO:'In arrivo', DA_CONTROLLARE:'Da controllare', IN_PREPARAZIONE:'In preparazione',
  DA_FOTOGRAFARE:'Da fotografare', DA_PUBBLICARE:'Da pubblicare', IN_VENDITA:'In vendita',
  PRENOTATA:'Prenotata', VENDUTA:'Venduta', DA_CONSEGNARE:'Da consegnare', CONSEGNATA:'Consegnata'
};
const priorityClass = p => p==='URGENTE'?'red':p==='IMPORTANTE'?'orange':p==='COMPLETATO'?'green':'yellow';
const money = n => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n||0));
const num = n => new Intl.NumberFormat('it-IT').format(Number(n||0));
const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const localISO = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayISO = () => localISO();

async function api(path, opts={}){
  const res = await fetch(path, opts);
  if(res.status===401){
    const next=encodeURIComponent(location.pathname+location.search);
    location.href=`/login?next=${next}`;
    throw new Error('Sessione scaduta: accesso richiesto');
  }
  if(!res.ok){ let m='Errore'; try{m=(await res.json()).detail||m}catch{} throw new Error(m); }
  const type=res.headers.get('content-type')||'';
  return type.includes('json')?res.json():res;
}
function toast(msg, bad=false){ const t=$('#toast'); t.textContent=msg; t.style.background=bad?'#8b2525':'#111c27'; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),3000); }
function modal(html){ $('#modalBody').innerHTML=html; $('#modal').classList.remove('hidden'); }
function closeModal(){ $('#modal').classList.add('hidden'); $('#modalBody').innerHTML=''; }
$('#modalClose').onclick=closeModal; $('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
function setTitle(t,s){$('#pageTitle').textContent=t;$('#pageSubtitle').textContent=s}
function setActive(view){
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  document.querySelectorAll('[data-mobile-view]').forEach(b=>b.classList.toggle('active',b.dataset.mobileView===view));
}
const isPhone = () => window.matchMedia('(max-width: 620px)').matches;
const isIOSDevice = () => /iPhone|iPad|iPod/i.test(navigator.userAgent||'') || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const isStandaloneMode = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
function iphoneInstallLink(){ return `${location.origin}/install`; }
async function copyIphoneInstallLink(){
  const url=iphoneInstallLink();
  try{ await navigator.clipboard.writeText(url); toast('Link installazione iPhone copiato'); }
  catch(_){ modal(`<h2>Link installazione iPhone</h2><div class="codebox">${esc(url)}</div><p class="muted">Invialo su WhatsApp e aprilo dall’iPhone.</p>`); }
}
function openIphoneInstallGuide(){ location.href='/install?guide=1'; }

async function route(view){ currentView=view; currentVehicle=null; setActive(view); content.innerHTML='<div class="empty">Caricamento…</div>';
  try{
    if(view==='today') await renderToday();
    if(view==='garage') await renderGarage();
    if(view==='clients') await renderClients();
    if(view==='calendar') await renderCalendar();
    if(view==='finance') await renderFinance();
    if(view==='autoscout') await renderAutoscout();
    if(view==='documents') await renderDocuments();
    if(view==='settings') await renderSettings();
  }catch(e){ content.innerHTML=`<div class="card urgent"><strong>Errore</strong><p>${esc(e.message)}</p></div>`; }
}

document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{route(b.dataset.view);$('.sidebar').classList.remove('open')});
$('#refreshBtn').onclick=()=> currentVehicle?openVehicle(currentVehicle):route(currentView);
$('#newVehicleBtn').onclick=openNewVehicle;
$('#mobileMenuBtn').onclick=()=>$('.sidebar').classList.toggle('open');
document.querySelectorAll('[data-mobile-view]').forEach(b=>b.onclick=()=>route(b.dataset.mobileView));
$('#mobileNewVehicleBtn').onclick=openNewVehicle;
$('#mobileMoreBtn').onclick=()=>$('.sidebar').classList.toggle('open');
$('#notificationBtn').onclick=openNotificationCenter;

function taskRow(t){
  const car=[t.brand,t.model,t.plate?`(${t.plate})`:null].filter(Boolean).join(' ');
  const client=[t.first_name,t.last_name].filter(Boolean).join(' ');
  return `<div class="row ${t.priority==='URGENTE'?'urgent':t.priority==='IMPORTANTE'?'important':'todo'}">
    <div class="row-main"><span class="badge ${priorityClass(t.priority)}">${esc(t.priority.replace('_',' '))}</span>
      <strong>${esc(t.title)}</strong><small>${esc(car||client||t.description||'')} ${t.due_date?`· ${esc(t.due_date)}${t.due_time?' '+esc(t.due_time):''}`:''}</small></div>
    <div class="row-actions">${t.vehicle_id?`<button onclick="openVehicle(${t.vehicle_id})">Apri auto</button>`:''}${t.source==='manuale'?`<button onclick="editTask(${t.id})">Modifica</button>`:''}<button onclick="completeTask(${t.id})">✓ Fatto</button></div>
  </div>`;
}
async function completeTask(id){try{await api(`/api/tasks/${id}/complete`,{method:'POST'});toast('Attività completata');route('today')}catch(e){toast(e.message,true)}}

async function renderToday(){
  setTitle('OGGI','Cosa devi fare, cosa manca, qual è il prossimo passo.'); const d=await api('/api/dashboard');
  const s=d.summary;
  const allNow=[...d.urgent,...d.today.filter(t=>!d.urgent.some(u=>u.id===t.id))];
  const first=allNow[0]||d.upcoming[0]||null;
  const firstOwner=first?[first.brand,first.model,first.plate?`(${first.plate})`:null].filter(Boolean).join(' ')||[first.first_name,first.last_name].filter(Boolean).join(' '):'';
  const mobileFirst=first?`<div class="mobile-focus ${first.priority==='URGENTE'?'focus-red':'focus-gold'}">
      <div><span class="mobile-eyebrow">${first.priority==='URGENTE'?'DA FARE SUBITO':'PROSSIMO PASSO'}</span><h2>${esc(first.title)}</h2><p>${esc(firstOwner||first.description||'')}</p></div>
      <div class="mobile-focus-actions">${first.vehicle_id?`<button class="primary" onclick="openVehicle(${first.vehicle_id})">Apri auto</button>`:''}<button class="ghost" onclick="completeTask(${first.id})">✓ Fatto</button></div>
    </div>`:`<div class="mobile-focus focus-green"><div><span class="mobile-eyebrow">TUTTO SOTTO CONTROLLO</span><h2>Niente di urgente</h2><p>Puoi occuparti di clienti, foto o nuove auto.</p></div></div>`;
  const installNudge=isIOSDevice()&&!isStandaloneMode()?`<div class="iphone-install-nudge"><div><strong>Metti MALÙ23 CARS sulla Home</strong><small>Una volta sola. Poi tocchi l’icona e sei subito dentro.</small></div><button onclick="openIphoneInstallGuide()">Guidami</button></div>`:'';
  const phoneHtml=`<div class="mobile-home">
    ${installNudge}
    <div class="mobile-day-head"><div><small>MALÙ23 CARS</small><h2>${s.urgent?`${s.urgent} ${s.urgent===1?'urgenza':'urgenze'} oggi`:'Oggi sei in ordine'}</h2></div><button class="mobile-refresh" onclick="route('today')">↻</button></div>
    ${mobileFirst}
    <button class="smart-capture-hero" onclick="openSmartCapture()"><span class="smart-camera">📷</span><span><small>DOCUMENT BRAIN</small><strong>Fai una foto. Al resto penso io.</strong><em>Leggo targa, telaio, importi e divido anche i PDF.</em></span><b>›</b></button>
    <div class="mobile-mini-stats">
      <button onclick="route('calendar')"><strong>${s.callbacks}</strong><span>richiami</span></button>
      <button onclick="route('calendar')"><strong>${s.deliveries}</strong><span>consegne</span></button>
      <button onclick="route('garage')"><strong>${s.works}</strong><span>lavori</span></button>
    </div>
    <div class="mobile-section-head"><div><small>AZIONI RAPIDE</small><h3>Cosa vuoi fare?</h3></div></div>
    <div class="mobile-quick-grid">
      <button class="smart-capture-quick" onclick="openSmartCapture()"><span>✨</span><strong>Scatta o carica</strong><small>Foto/PDF: MALÙ23 legge e collega da solo</small></button>
      <button onclick="mobilePickVehicle('photo')"><span>📸</span><strong>Foto auto</strong><small>Scatta e collega subito</small></button>
      <button onclick="mobilePickVehicle('expense-photo')"><span>📷</span><strong>Foto spesa</strong><small>Scontrino → costo → margine</small></button>
      <button onclick="route('finance')"><span>↗</span><strong>Guadagni</strong><small>Margini reali e previsti</small></button>
      <button onclick="openClient()"><span>👤</span><strong>Nuovo cliente</strong><small>Contatto e prossimo passo</small></button>
    </div>
    <div class="mobile-section-head"><div><small>DA FARE</small><h3>${allNow.length?'Le prossime cose':'Nessuna attività aperta'}</h3></div><button onclick="openTask()">＋</button></div>
    <div class="mobile-task-list">${allNow.slice(0,6).map(mobileTaskRow).join('')||'<div class="mobile-empty">Niente da fare adesso.</div>'}</div>
    ${d.upcoming.length?`<div class="mobile-section-head"><div><small>PROSSIMI 7 GIORNI</small><h3>Più avanti</h3></div></div><div class="mobile-task-list muted-tasks">${d.upcoming.slice(0,4).map(mobileTaskRow).join('')}</div>`:''}
  </div>`;
  const desktopHtml=`<div class="desktop-dashboard"><div class="malu-operating-strip"><div><small>MALÙ23 CARS · OPERATIVO</small><strong>La concessionaria, sotto controllo.</strong><p>Clienti, auto, consegne e scadenze in un unico posto.</p></div><div class="brand-status"><i></i> Sistema operativo</div></div>
    <div class="grid cols-4">
      <div class="card metric urgent"><small>URGENZE</small><div class="n">${s.urgent}</div></div>
      <div class="card metric"><small>CLIENTI DA RICHIAMARE</small><div class="n">${s.callbacks}</div></div>
      <div class="card metric"><small>CONSEGNE 7 GIORNI</small><div class="n">${s.deliveries}</div></div>
      <div class="card metric"><small>LAVORI APERTI</small><div class="n">${s.works}</div></div>
    </div>
    ${(s.documents_review||s.smart_actions)?`<div class="document-brain-strip"><div><span>✨ DOCUMENT BRAIN</span><strong>${s.documents_review||0} documenti da controllare · ${s.smart_actions||0} azioni pronte</strong><small>PDF/foto già letti e collegati automaticamente dove possibile.</small></div><button class="primary" onclick="route('documents')">Apri inbox</button></div>`:''}
    <div class="section-title"><h2>🔴 Urgente</h2></div><div class="list">${d.urgent.length?d.urgent.map(taskRow).join(''):'<div class="empty">Nessuna urgenza. Ottimo.</div>'}</div>
    <div class="section-title"><h2>Oggi</h2><button class="ghost" onclick="openTask()">＋ Attività</button></div><div class="list">${d.today.length?d.today.map(taskRow).join(''):'<div class="empty">Nessuna attività aperta per oggi.</div>'}</div>
    <div class="section-title"><h2>Prossimi 7 giorni</h2></div><div class="list">${d.upcoming.length?d.upcoming.map(taskRow).join(''):'<div class="empty">Nessuna scadenza nei prossimi 7 giorni.</div>'}</div>
    <div class="section-title"><h2>Auto che richiedono attenzione</h2></div>
    <div class="grid cols-2">
      ${d.stock_attention.map(x=>`<div class="card important clickable" onclick="openVehicle(${x.vehicle_id})"><strong>${esc(x.brand+' '+x.model)}</strong><p>${x.days_online} giorni online · ${money(x.current_price)}</p><span class="badge orange">AGING</span></div>`).join('')}
      ${d.work_attention.map(x=>`<div class="card todo clickable" onclick="openVehicle(${x.vehicle_id})"><strong>${esc(x.brand+' '+x.model)}</strong><p>${x.open_works} lavori ancora aperti</p><span class="badge yellow">PREPARAZIONE</span></div>`).join('')}
      ${(!d.stock_attention.length&&!d.work_attention.length)?'<div class="empty">Nessuna auto problematica rilevata.</div>':''}
    </div></div>`;
  content.innerHTML=phoneHtml+desktopHtml;
}
function mobileTaskRow(t){
  const car=[t.brand,t.model,t.plate?`(${t.plate})`:null].filter(Boolean).join(' ');
  const client=[t.first_name,t.last_name].filter(Boolean).join(' ');
  return `<div class="mobile-task ${t.priority==='URGENTE'?'is-urgent':''}"><button class="mobile-task-main" ${t.vehicle_id?`onclick="openVehicle(${t.vehicle_id})"`:''}><span class="mobile-check-dot">${t.priority==='URGENTE'?'!':'○'}</span><span><strong>${esc(t.title)}</strong><small>${esc(car||client||t.description||'')}${t.due_date?` · ${esc(t.due_date)}`:''}</small></span></button><button class="mobile-done" onclick="completeTask(${t.id})">✓</button></div>`;
}
async function mobilePickVehicle(action){
  const cars=await api('/api/vehicles');
  if(!cars.length)return toast('Prima inserisci almeno un’auto',true);
  const label={document:'Scansiona documento',photo:'Foto auto',expense:'Aggiungi spesa','expense-photo':'Fotografa una spesa'}[action]||'Scegli auto';
  modal(`<h2>${label}</h2><p class="muted">Scegli il veicolo: il dato verrà collegato direttamente alla sua unica scheda.</p><div class="mobile-pick-list">${cars.map(v=>`<button onclick="mobileVehicleAction(${v.id},'${action}')"><strong>${esc(v.brand+' '+v.model)}</strong><small>${esc(v.plate||v.vin||stateLabels[v.status]||'')}</small></button>`).join('')}</div>`);
}
function mobileVehicleAction(id,action){
  closeModal();
  if(action==='document')return openDocUpload(id);
  if(action==='photo')return openVehicle(id,'photos');
  if(action==='expense')return openExpense(id);
  if(action==='expense-photo')return openSmartCapture(id,null,true);
  openVehicle(id);
}

async function renderGarage(){
  setTitle('GARAGE','Tutto lo stock, con il prossimo passo sempre visibile.'); const cars=await api('/api/vehicles');
  const cards=cars.map(carCard).join('');
  content.innerHTML=`<div class="toolbar garage-toolbar"><input id="garageSearch" placeholder="Cerca targa, telaio, marca o modello"><select id="garageStatus"><option value="">Tutti gli stati</option>${Object.entries(stateLabels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><button class="ghost" onclick="openStockImport()">⇧ Importa stock</button><button class="primary" onclick="openNewVehicle()">＋ Nuova auto</button></div>
  <div class="mobile-garage" id="garageCards">${cards||'<div class="mobile-empty">Nessuna auto nel Garage.</div>'}</div>
  <div class="table-wrap desktop-garage-table"><table><thead><tr><th>Auto</th><th>Targa</th><th>Stato</th><th>Km</th><th>Investito</th><th>Prezzo</th><th>Margine rif.</th></tr></thead><tbody id="garageBody">${cars.map(carTr).join('')}</tbody></table></div>`;
  $('#garageSearch').oninput=filterGarage;$('#garageStatus').onchange=filterGarage;
}
function carCard(v){const margin=v.margin==null?'—':money(v.margin);return `<article class="garage-card clickable" onclick="openVehicle(${v.id})" data-search="${esc((v.brand+' '+v.model+' '+v.plate+' '+v.vin).toLowerCase())}" data-status="${v.status}"><div class="garage-card-top"><div><h3>${esc((v.brand||'Auto')+' '+(v.model||''))}</h3><p>${esc(v.plate||v.vin||'Identificativo da completare')} · ${num(v.mileage)} km</p></div><span class="badge ${v.status==='CONSEGNATA'?'green':v.status==='IN_VENDITA'?'navy':'gold'}">${esc(stateLabels[v.status]||v.status)}</span></div><div class="garage-card-metrics"><div><small>INVESTITO</small><strong>${money(v.total_invested)}</strong></div><div><small>PREZZO</small><strong>${money(v.expected_sale_price)}</strong></div><div><small>MARGINE</small><strong>${margin}</strong></div></div></article>`}
function carTr(v){return `<tr class="clickable" onclick="openVehicle(${v.id})" data-search="${esc((v.brand+' '+v.model+' '+v.plate+' '+v.vin).toLowerCase())}" data-status="${v.status}"><td><strong>${esc(v.brand+' '+v.model)}</strong><br><small>${esc(v.version)}</small></td><td>${esc(v.plate||'—')}</td><td><span class="badge navy">${esc(stateLabels[v.status]||v.status)}</span></td><td>${num(v.mileage)}</td><td>${money(v.total_invested)}</td><td>${money(v.expected_sale_price)}</td><td>${v.margin==null?'—':money(v.margin)}</td></tr>`}
function filterGarage(){const q=$('#garageSearch').value.toLowerCase(),s=$('#garageStatus').value;document.querySelectorAll('#garageBody tr,#garageCards .garage-card').forEach(r=>r.style.display=((!q||r.dataset.search.includes(q))&&(!s||r.dataset.status===s))?'':'none')}

async function downloadStockTemplate(){
  try{
    const r=await fetch('/api/vehicles/import-template');
    if(!r.ok)throw new Error('Template non disponibile');
    const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='MALU23_CARS_import_stock.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }catch(e){toast(e.message,true)}
}
function openStockImport(){
  modal(`<div class="import-wizard"><span class="eyebrow">ZERO SBATTI · PRIMO STOCK</span><h2>Importa le auto senza reinserirle una per una</h2><p class="muted">Va bene un CSV Excel con almeno <strong>marca</strong> e <strong>modello</strong>. Riconosciamo anche targa, VIN, km, prezzi, stato e link AutoScout. Le auto già presenti vengono saltate: non sovrascriviamo nulla.</p><div class="import-steps"><div><b>1</b><span><strong>Hai già un CSV?</strong><small>Usalo direttamente. Separatore ; o ,</small></span></div><div><b>2</b><span><strong>Non ce l’hai?</strong><small>Scarica il modello pronto per Excel.</small></span></div><div><b>3</b><span><strong>Carica e controlla</strong><small>Ti diciamo cosa è entrato, saltato o da correggere.</small></span></div></div><div class="form-actions"><button type="button" onclick="downloadStockTemplate()">Scarica modello CSV</button><label class="button-like primary">Scegli CSV<input id="stockCsvFile" type="file" accept=".csv,text/csv" hidden onchange="runStockImport(this.files[0])"></label></div></div>`);
}
async function runStockImport(file){
  if(!file)return;
  const fd=new FormData();fd.append('file',file);
  const body=$('#modalBody');body.innerHTML=`<div class="import-wizard"><span class="eyebrow">IMPORTAZIONE IN CORSO</span><h2>Sto controllando lo stock…</h2><p class="muted">Niente sovrascritture: verifico duplicati e dati riga per riga.</p><div class="loading-line"></div></div>`;
  try{
    const r=await api('/api/vehicles/import-csv',{method:'POST',body:fd}),s=r.summary;
    const finishButton=s.errors?`<button class="primary" onclick="openStockImport()">Correggi e riprova</button>`:`<button class="primary" onclick="closeModal();route('garage')">Perfetto</button>`;
    body.innerHTML=`<div class="import-wizard"><span class="eyebrow">IMPORT COMPLETATO</span><h2>${s.imported} auto aggiunte</h2><div class="grid cols-3 import-summary"><div class="card metric"><small>IMPORTATE</small><div class="n">${s.imported}</div></div><div class="card metric"><small>GIÀ PRESENTI</small><div class="n">${s.skipped}</div></div><div class="card metric ${s.errors?'urgent':''}"><small>DA CORREGGERE</small><div class="n">${s.errors}</div></div></div>${r.errors.length?`<div class="card important"><strong>Righe da correggere</strong><div class="mini-errors">${r.errors.slice(0,12).map(x=>`<p>Riga ${x.row}: ${esc(x.error)}</p>`).join('')}</div></div>`:''}<div class="form-actions"><button onclick="closeModal();route('garage')">Vai al Garage</button>${finishButton}</div></div>`;
  }catch(e){body.innerHTML=`<div class="card urgent"><h2>Importazione non riuscita</h2><p>${esc(e.message)}</p><button onclick="openStockImport()">Riprova</button></div>`}
}

function openNewVehicle(){
  modal(`<h2>＋ Nuova auto</h2><p class="muted">Inserisci solo i dati disponibili. Il resto può essere aggiunto dopo senza duplicare nulla.</p>
  <form id="vehicleForm"><div class="form-grid">
    ${field('acquisition_type','Come è arrivata?','select',['acquisto','permuta','importazione','asta','conto vendita','altro'])}
    ${field('status','Stato iniziale','select',Object.keys(stateLabels),null,stateLabels)}
    ${field('brand','Marca')}${field('model','Modello')}${field('version','Versione')}${field('plate','Targa')}${field('vin','Telaio')}${field('registration_date','Immatricolazione','date')}
    ${field('fuel','Alimentazione')}${field('engine_cc','Cilindrata (cc)','number')}${field('transmission','Cambio')}${field('mileage','Km','number')}${field('color','Colore')}${field('purchase_price','Prezzo acquisto','number')}${field('expected_sale_price','Prezzo vendita previsto','number')}
    ${field('notes','Note','textarea','',true)}
  </div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Crea auto</button></div></form>`);
  $('#vehicleForm').onsubmit=async e=>{e.preventDefault();const data=formJSON(e.target);data.mileage=+data.mileage||0;data.engine_cc=+data.engine_cc||0;data.purchase_price=+data.purchase_price||0;data.expected_sale_price=+data.expected_sale_price||0;try{const v=await api('/api/vehicles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});closeModal();toast('Auto creata');openVehicle(v.id)}catch(err){toast(err.message,true)}};
}
function field(name,label,type='text',options='',full=false,labels=null){if(type==='select')return `<div class="field${full?' full':''}"><label>${label}</label><select name="${name}">${options.map(o=>`<option value="${esc(o)}">${esc(labels?labels[o]:o)}</option>`).join('')}</select></div>`;if(type==='textarea')return `<div class="field${full?' full':''}"><label>${label}</label><textarea name="${name}"></textarea></div>`;return `<div class="field${full?' full':''}"><label>${label}</label><input name="${name}" type="${type}" ${type==='number'?'step="0.01"':''}></div>`}
function formJSON(f){return Object.fromEntries(new FormData(f).entries())}

async function openVehicle(id,tab='overview'){
  currentVehicle=id; const v=await api(`/api/vehicles/${id}`); setTitle(`${v.brand} ${v.model}`,v.plate||v.vin||'Scheda veicolo');
  content.innerHTML=`<div class="card"><div class="vehicle-head"><div><span class="badge gold">${esc(stateLabels[v.status]||v.status)}</span><h2>${esc(v.brand+' '+v.model+' '+v.version)}</h2><div class="sub">${esc(v.plate||'Targa non inserita')} · ${num(v.mileage)} km</div></div><div class="row-actions"><button onclick="editVehicle(${v.id})">Modifica dati</button><button onclick="editStatus(${v.id},'${v.status}')">Cambia stato</button><button class="primary" onclick="openWork(${v.id})">＋ Lavoro</button></div></div>
  <div class="next-step"><strong>Prossimo passo</strong>${esc(nextStep(v))}</div></div>
  <div class="tabs desktop-vehicle-tabs">${[['overview','Panoramica'],['works','Lavori & costi'],['photos','Foto'],['documents','Documenti'],['autoscout','AutoScout'],['delivery','Consegna'],['instagram','Instagram'],['contract','Vendita']].map(([k,l])=>`<button class="${tab===k?'active':''}" onclick="openVehicle(${id},'${k}')">${l}</button>`).join('')}</div>
  <div class="mobile-section-picker"><label>Cosa vuoi fare su questa auto?</label><select onchange="openVehicle(${id},this.value)">${[['overview','Panoramica'],['works','Lavori e spese'],['photos','Foto'],['documents','Documenti'],['delivery','Consegna'],['autoscout','AutoScout'],['instagram','Instagram'],['contract','Vendita']].map(([k,l])=>`<option value="${k}" ${tab===k?'selected':''}>${l}</option>`).join('')}</select></div>
  <div id="vehicleTab"></div>`;
  if(tab==='overview') vehicleOverview(v);
  if(tab==='works') vehicleWorks(v);
  if(tab==='photos') vehiclePhotos(v);
  if(tab==='documents') vehicleDocuments(v);
  if(tab==='autoscout') vehicleAutoscout(v);
  if(tab==='delivery') vehicleDelivery(v);
  if(tab==='instagram') vehicleInstagram(v);
  if(tab==='contract') vehicleContract(v);
}

async function editVehicle(id){
  const v=await api(`/api/vehicles/${id}`);
  modal(`<h2>Modifica dati auto</h2><p class="muted">Correggi qui i dati principali senza creare una nuova scheda.</p><form id="editVehicleForm"><div class="form-grid">
    ${fieldV('brand','Marca',v.brand)}${fieldV('model','Modello',v.model)}${fieldV('version','Versione',v.version)}${fieldV('plate','Targa',v.plate)}${fieldV('vin','Telaio',v.vin)}${fieldV('registration_date','Immatricolazione',v.registration_date,'date')}
    ${fieldV('fuel','Alimentazione',v.fuel)}${fieldV('engine_cc','Cilindrata (cc)',v.engine_cc,'number')}${fieldV('transmission','Cambio',v.transmission)}${fieldV('mileage','Km',v.mileage,'number')}${fieldV('color','Colore',v.color)}${fieldV('purchase_price','Prezzo acquisto',v.purchase_price,'number')}${fieldV('expected_sale_price','Prezzo vendita previsto',v.expected_sale_price,'number')}
    <div class="field"><label>Acquisizione</label><select name="acquisition_type">${['acquisto','permuta','importazione','asta','conto vendita','altro'].map(x=>`<option value="${x}" ${x===v.acquisition_type?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="field full"><label>Note</label><textarea name="notes">${esc(v.notes||'')}</textarea></div>
  </div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Salva modifiche</button></div></form>`);
  $('#editVehicleForm').onsubmit=async e=>{e.preventDefault();const d=formJSON(e.target);d.mileage=+d.mileage||0;d.engine_cc=+d.engine_cc||0;d.purchase_price=+d.purchase_price||0;d.expected_sale_price=+d.expected_sale_price||0;d.status=v.status;try{await api(`/api/vehicles/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});closeModal();toast('Dati auto aggiornati');openVehicle(id)}catch(err){toast(err.message,true)}};
}

function nextStep(v){ if(v.tasks?.some(x=>!x.completed&&x.due_date<=todayISO())) return v.tasks.find(x=>!x.completed&&x.due_date<=todayISO()).title; const map={IN_ARRIVO:'Confermare arrivo fisico e controllare documenti/condizioni.',DA_CONTROLLARE:'Verificare condizioni e inserire eventuali lavori.',IN_PREPARAZIONE:'Completare i lavori aperti.',DA_FOTOGRAFARE:'Completare la checklist fotografica.',DA_PUBBLICARE:'Preparare e pubblicare l’annuncio AutoScout.',IN_VENDITA:'Monitorare clienti, prezzo e aging.',PRENOTATA:'Completare vendita, saldo e documenti.',VENDUTA:'Programmare la consegna.',DA_CONSEGNARE:'Chiudere la checklist di consegna.',CONSEGNATA:'Processo completato.'};return map[v.status]||'Controllare la scheda.'}
function vehicleOverview(v){ $('#vehicleTab').innerHTML=`<div class="grid cols-2"><div class="card"><h3>Dati veicolo</h3><div class="kv"><div><small>Targa</small><strong>${esc(v.plate||'—')}</strong></div><div><small>Telaio</small><strong>${esc(v.vin||'—')}</strong></div><div><small>Immatricolazione</small><strong>${esc(v.registration_date||'—')}</strong></div><div><small>Alimentazione</small><strong>${esc(v.fuel||'—')}</strong></div><div><small>Cilindrata</small><strong>${v.engine_cc?`${num(v.engine_cc)} cc`:'—'}</strong></div><div><small>Cambio</small><strong>${esc(v.transmission||'—')}</strong></div><div><small>Acquisizione</small><strong>${esc(v.acquisition_type)}</strong></div></div></div>
  <div class="card"><h3>Economia</h3><div class="kv"><div><small>Acquisto</small><strong>${money(v.purchase_price)}</strong></div><div><small>Totale investito</small><strong>${money(v.total_invested)}</strong></div><div><small>Prezzo previsto</small><strong>${money(v.expected_sale_price)}</strong></div><div><small>Margine riferimento</small><strong>${v.margin==null?'—':money(v.margin)}</strong></div></div></div></div>
  <div class="section-title"><h2>Attività collegate</h2><button class="ghost" onclick="openTask(${v.id})">＋ Attività</button></div><div class="list">${v.tasks.filter(x=>!x.completed).length?v.tasks.filter(x=>!x.completed).map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.title)}</strong><small>${esc(x.due_date||'Senza data')}</small></div><button onclick="completeTask(${x.id})">✓</button></div>`).join(''):'<div class="empty">Nessuna attività aperta.</div>'}</div>` }

function editStatus(id,current){modal(`<h2>Cambia stato</h2><form id="statusForm"><div class="field"><label>Nuovo stato</label><select name="status">${Object.entries(stateLabels).map(([k,l])=>`<option value="${k}" ${k===current?'selected':''}>${l}</option>`).join('')}</select></div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Salva</button></div></form>`);$('#statusForm').onsubmit=async e=>{e.preventDefault();try{await api(`/api/vehicles/${id}/status/${e.target.status.value}`,{method:'POST'});closeModal();toast('Stato aggiornato');openVehicle(id)}catch(err){toast(err.message,true)}}}

function vehicleWorks(v){ const totalExpected=v.works.reduce((a,x)=>a+Number(x.expected_cost||0),0),totalActual=v.works.reduce((a,x)=>a+Number(x.actual_cost||0),0);$('#vehicleTab').innerHTML=`<div class="grid cols-3"><div class="card metric"><small>LAVORI APERTI</small><div class="n">${v.works.filter(x=>!x.completed).length}</div></div><div class="card metric"><small>PREVISTO</small><div class="n">${money(totalExpected)}</div></div><div class="card metric"><small>REALE</small><div class="n">${money(totalActual)}</div></div></div>
<div class="section-title"><h2>Lavori</h2><div><button class="ghost" onclick="openSmartCapture(${v.id})">📷 Spesa da foto/PDF</button> <button class="ghost" onclick="openExpense(${v.id})">＋ Manuale</button> <button class="primary" onclick="openWork(${v.id})">＋ Lavoro</button></div></div><div class="list">${v.works.length?v.works.map(w=>`<div class="row ${w.completed?'done':'todo'}"><div class="row-main"><span class="badge ${w.completed?'green':'yellow'}">${esc(w.category)}</span><strong>${esc(w.title)}</strong><small>${w.due_date?`Scadenza ${w.due_date} · `:''}${money(w.expected_cost)} prev. · ${money(w.actual_cost)} reale</small></div>${w.completed?'<span>✓</span>':`<button onclick="completeWork(${w.id},${v.id})">Completa</button>`}</div>`).join(''):'<div class="empty">Nessun lavoro inserito.</div>'}</div>
<div class="section-title"><h2>Altre spese</h2></div><div class="list">${v.expenses.length?v.expenses.map(e=>`<div class="row"><div class="row-main"><strong>${esc(e.category)} · ${esc(e.description)}</strong><small>${esc(e.expense_date)}${e.source_document_id?' · 📎 da documento':''}</small></div><strong>${money(e.amount)}</strong></div>`).join(''):'<div class="empty">Nessuna spesa extra.</div>'}</div>`}
function openWork(id){modal(`<h2>Nuovo lavoro</h2><form id="workForm"><div class="form-grid">${field('category','Categoria','select',['Meccanica','Pneumatici','Carrozzeria','Interni','Lavaggio','Altro'])}${field('title','Lavoro')}${field('due_date','Da fare entro','date')}${field('provider','Responsabile/fornitore')}${field('expected_cost','Costo previsto','number')}${field('actual_cost','Costo reale','number')}${field('notes','Note','textarea','',true)}</div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Aggiungi</button></div></form>`);$('#workForm').onsubmit=async e=>{e.preventDefault();const d=formJSON(e.target);d.expected_cost=+d.expected_cost||0;d.actual_cost=+d.actual_cost||0;try{await api(`/api/vehicles/${id}/works`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});closeModal();toast('Lavoro aggiunto');openVehicle(id,'works')}catch(err){toast(err.message,true)}}}
function completeWork(wid,vid){modal(`<h2>Completa lavoro</h2><form id="completeWorkForm"><div class="field"><label>Costo reale finale</label><input name="actual" type="number" step="0.01" placeholder="0,00"></div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Completa</button></div></form>`);$('#completeWorkForm').onsubmit=async e=>{e.preventDefault();try{await api(`/api/works/${wid}/complete?actual_cost=${encodeURIComponent(e.target.actual.value||0)}`,{method:'POST'});closeModal();toast('Lavoro completato');openVehicle(vid,'works')}catch(err){toast(err.message,true)}}}
function openExpense(id){modal(`<h2>Aggiungi spesa</h2><p class="muted">Per uno scontrino usa “Foto spesa”: qui inserisci un costo manuale.</p><form id="expenseForm"><div class="form-grid">${field('category','Categoria','select',['Passaggio','Trasporto','Asta','Commissioni','Ricambi','Carburante','Lavaggio','Meccanica','Carrozzeria','Altro'])}${field('supplier','Fornitore')}${field('description','Descrizione')}${field('amount','Importo','number')}${field('expense_date','Data','date')}</div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button type="button" class="ghost" onclick="openSmartCapture(${id},null,true)">📷 Foto spesa</button><button class="primary">Salva</button></div></form>`);$('#expenseForm').expense_date.value=todayISO();$('#expenseForm').onsubmit=async e=>{e.preventDefault();const d=formJSON(e.target);d.amount=+d.amount||0;try{await api(`/api/vehicles/${id}/expenses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});closeModal();toast('Spesa registrata');openVehicle(id,'works')}catch(err){toast(err.message,true)}}}

function vehiclePhotos(v){const done=v.photo_checklist.filter(x=>x.done).length,pct=Math.round(done/v.photo_checklist.length*100);$('#vehicleTab').innerHTML=`<div class="card"><div class="section-title"><h2>Checklist fotografica</h2><strong>${done}/${v.photo_checklist.length}</strong></div><div class="progress"><span style="width:${pct}%"></span></div><div class="grid cols-3" style="margin-top:14px">${v.photo_checklist.map(x=>`<div class="row"><span>${x.done?'✅':'❌'} ${esc(x.category.replaceAll('_',' '))}</span>${!x.done?`<button onclick="openPhoto(${v.id},'${x.category}')">Carica</button>`:''}</div>`).join('')}</div></div>
<div class="section-title"><h2>Foto</h2></div><div class="photo-grid">${v.photos.map(p=>`<div class="photo"><img src="/api/photos/${p.id}/file"><div>${esc(p.category.replaceAll('_',' '))}${p.is_cover?' · COPERTINA':''}</div></div>`).join('')}</div>`}
function openPhoto(id,category){modal(`<h2>Carica foto · ${esc(category.replaceAll('_',' '))}</h2><form id="photoForm"><div class="field"><input type="file" name="file" accept="image/*" capture="environment" required></div><div class="field"><label><input type="checkbox" name="is_cover"> Usa come copertina</label></div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Carica</button></div></form>`);$('#photoForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);fd.append('category',category);try{await api(`/api/vehicles/${id}/photos`,{method:'POST',body:fd});closeModal();toast('Foto caricata');openVehicle(id,'photos')}catch(err){toast(err.message,true)}}}

function vehicleDocuments(v){
  $('#vehicleTab').innerHTML=`<div class="document-brain-vehicle-head"><div><span class="eyebrow">DOCUMENT BRAIN</span><h2>Documenti ${esc(v.brand+' '+v.model)}</h2><p>Scatta o carica: riconosco il documento e lo archivio già su questa auto.</p></div><button class="primary big" onclick="openSmartCapture(${v.id})">📷 Scatta / carica</button></div><div class="list">${v.documents.length?v.documents.map(d=>documentRowHtml(d,true)).join(''):'<div class="empty">Nessun documento. Fai una foto al libretto o carica un PDF.</div>'}</div>`
}
function openDocUpload(vehicleId=null,clientId=null){ return openSmartCapture(vehicleId,clientId); }
function smartFieldsSummary(fields){
  const bits=[];
  if(fields.plate)bits.push(`Targa ${esc(fields.plate)}`);
  if(fields.vin)bits.push(`Telaio ${esc(fields.vin)}`);
  if(fields.fiscal_code)bits.push(`CF ${esc(fields.fiscal_code)}`);
  if(fields.amount)bits.push(`${money(fields.amount)}`);
  if(fields.mileage)bits.push(`${num(fields.mileage)} km`);
  return bits.join(' · ');
}
function documentRowHtml(d,insideVehicle=false){
  let f={};try{f=typeof d.detected_fields_obj==='object'?d.detected_fields_obj:JSON.parse(d.detected_fields||'{}')}catch{}
  const owner=d.vehicle_id?[d.brand,d.model,d.plate].filter(Boolean).join(' '):[d.first_name,d.last_name].filter(Boolean).join(' ');
  const confidence=Math.round(Number(d.confidence||0)*100);
  const pages=(d.page_from&&d.page_to&&d.page_from!==d.page_to)?` · pag. ${d.page_from}-${d.page_to}`:'';
  const state=d.analysis_state||'READY';
  const stateLabel=state==='OCR_ERROR'?'OCR NON RIUSCITO':state==='UNKNOWN'?'DA IDENTIFICARE':d.confirmed?'CONFERMATO':d.auto_linked?'COLLEGATO':'DA CONTROLLARE';
  const stateClass=state==='OCR_ERROR'?'red':state==='UNKNOWN'?'yellow':d.confirmed?'green':d.auto_linked?'blue':'yellow';
  return `<div class="row document-card smart-document ${state!=='READY'?'needs-review':''} ${!d.vehicle_id&&!d.client_id?'needs-owner':''}"><div class="row-main"><div class="document-badges"><span class="badge ${stateClass}">${stateLabel}</span><span class="badge dark">${esc(d.detected_doc_type||d.doc_type||'documento')}</span>${confidence?`<span class="confidence">${confidence}%</span>`:''}</div><strong>${esc(d.original_name)}</strong><small>${esc(d.review_reason||owner||'Non associato')}${pages}</small>${smartFieldsSummary(f)?`<small class="smart-fields">${smartFieldsSummary(f)}</small>`:''}</div><div class="row-actions">${!d.vehicle_id&&!d.client_id?`<button onclick="chooseDocumentOwner(${d.id})">Collega</button>`:''}${d.vehicle_id&&!d.confirmed?`<button onclick="reviewDoc(${d.id},${d.vehicle_id})">Verifica dati</button>`:''}${d.vehicle_id&&!insideVehicle?`<button onclick="openVehicle(${d.vehicle_id},'documents')">Auto</button>`:''}${d.batch_id&&String(d.mime_type||'').includes('pdf')?`<button onclick="window.open('/api/document-batches/${d.batch_id}/file','_blank')">Originale</button>`:''}<button onclick="window.open('/api/documents/${d.id}/file','_blank')">Apri</button></div></div>`;
}
async function openSmartCapture(vehicleId=null,clientId=null,expenseOnly=false){
  const linked=vehicleId?`<div class="smart-linked-note">✓ Verrà archiviato direttamente nella scheda auto selezionata.</div>`:'';
  modal(`<div class="smart-capture-modal"><span class="eyebrow">${expenseOnly?'SPESA DA FOTO':'ZERO SBATTI'}</span><h2>${expenseOnly?'💶 Fotografa scontrino o fattura':'📷 Scatta o carica'}</h2><p class="smart-lead">${expenseOnly?'Leggo importo, data e categoria. Il costo entra solo dopo la tua conferma.':'Non devi scegliere il tipo di documento. MALÙ23 lo legge, cerca targa/telaio/cliente, divide i PDF e ti propone cosa fare.'}</p>${linked}<form id="smartDocForm"><label class="smart-drop"><span>📸</span><strong>${expenseOnly?'Scatta la foto della spesa':'Scatta una foto o scegli un PDF'}</strong><small>${expenseOnly?'Scontrino o fattura · nessun salvataggio senza conferma':'Libretto, fattura, ricevuta, COC, documento, bonifico…'}</small><input type="file" name="file" accept="image/*,.pdf" capture="environment" required></label><div class="smart-auto-list"><span>✓ Riconoscimento automatico</span><span>✓ Collegamento alla vettura</span><span>✓ PDF separati per documento</span><span>✓ Spesa pronta da registrare</span></div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary big" id="smartUploadBtn">Analizza</button></div></form></div>`);
  $('#smartDocForm').onsubmit=async e=>{e.preventDefault();const btn=$('#smartUploadBtn');btn.disabled=true;btn.textContent='Sto leggendo…';const fd=new FormData(e.target);fd.append('doc_type','auto');if(vehicleId)fd.append('vehicle_id',vehicleId);if(clientId)fd.append('client_id',clientId);try{const r=await api('/api/documents/upload',{method:'POST',body:fd});showSmartCaptureResult(r,vehicleId)}catch(err){btn.disabled=false;btn.textContent='Analizza';toast(err.message,true)}};
}
function parseActionPayload(a){try{return a.payload||JSON.parse(a.payload_json||'{}')}catch{return {}}}
function smartActionHtml(a){const p=parseActionPayload(a);if(a.action_type==='CREATE_EXPENSE')return `<div class="smart-suggestion"><span>💶</span><div><strong>Spesa riconosciuta: ${money(p.amount)}</strong><small>${esc(p.category||'Altro')} · ${esc(p.expense_date||'')}</small></div><button class="primary" onclick="applyDocAction(${a.id})">Registra</button></div>`;if(a.action_type==='CREATE_VEHICLE')return `<div class="smart-suggestion"><span>🚗</span><div><strong>Nuova auto dal libretto</strong><small>${esc([p.brand,p.model,p.plate].filter(Boolean).join(' '))}</small></div><button class="primary" onclick="applyDocAction(${a.id})">Crea auto</button></div>`;return ''}
function showSmartCaptureResult(r,vehicleId=null){
  const s=r.summary||{};
  const docs=r.documents||[];
  const actions=r.actions||[];
  const needsHelp=Number(s.ocr_errors||0)+Number(s.unknown||0);
  modal(`<div class="smart-result ${needsHelp?'has-review':''}"><span class="eyebrow">${needsHelp?'SERVE UN CONTROLLO':'FATTO'}</span><h2>${needsHelp?'La foto è salvata. Completiamo insieme.':`Ho sistemato ${s.documents||docs.length} ${Number(s.documents||docs.length)===1?'documento':'documenti'}`}</h2><p class="muted">${s.pages||1} pagine lette${s.documents>1?` e divise automaticamente in ${s.documents} documenti`:''}. ${s.auto_linked?`${s.auto_linked} collegati da soli.`:''}</p>${s.ocr_errors?`<div class="smart-error-state"><b>!</b><div><strong>Non sono riuscito a leggere bene questa foto</strong><small>Niente è andato perso: riprova con più luce oppure registra il costo a mano.</small></div></div>`:''}${s.unknown?`<div class="smart-unknown-state"><b>?</b><div><strong>Tipo di documento non riconosciuto</strong><small>Scegli l’auto e controlla i dati prima di confermare.</small></div></div>`:''}${actions.map(smartActionHtml).join('')}<div class="smart-result-docs">${docs.map(d=>documentRowHtml(d,!!vehicleId)).join('')}</div>${s.to_review?`<div class="warn">${s.to_review} elemento/i non hanno ancora un proprietario certo. Tocca <strong>Collega</strong> e basta.</div>`:''}<div class="form-actions">${s.ocr_errors&&vehicleId?`<button onclick="closeModal();openExpense(${vehicleId})">Inserisci costo a mano</button>`:''}<button class="primary big" onclick="closeModal();${vehicleId?`openVehicle(${vehicleId},'documents')`:`route('documents')`}">${needsHelp?'Controlla documento':'Continua'}</button></div></div>`);
}
async function applyDocAction(id){try{const r=await api(`/api/document-actions/${id}/apply`,{method:'POST'});if(r.action_type==='CREATE_EXPENSE'){toast(`Spesa ${money(r.amount||0)} registrata`);closeModal();r.vehicle_id?openVehicle(r.vehicle_id,'works'):route('documents')}else if(r.action_type==='CREATE_VEHICLE'){toast('Auto creata dal documento');closeModal();openVehicle(r.vehicle_id)}else{toast('Fatto')}}catch(e){toast(e.message,true)}}
async function chooseDocumentOwner(docId){
  const [cars,clients]=await Promise.all([api('/api/vehicles'),api('/api/clients')]);
  modal(`<span class="eyebrow">UN SOLO TOCCO</span><h2>Dove lo archivio?</h2><p class="muted">Seleziona l’auto o il cliente. I prossimi documenti con la stessa targa/telaio/CF verranno collegati automaticamente.</p><div class="owner-picker"><h3>🚗 Auto</h3>${cars.map(v=>`<button onclick="linkDocument(${docId},${v.id},null)"><strong>${esc(v.brand+' '+v.model)}</strong><small>${esc(v.plate||v.vin||'')}</small></button>`).join('')||'<div class="empty">Nessuna auto.</div>'}<h3>👤 Cliente</h3>${clients.map(c=>`<button onclick="linkDocument(${docId},null,${c.id})"><strong>${esc(c.first_name+' '+c.last_name)}</strong><small>${esc(c.fiscal_code||c.phone||'')}</small></button>`).join('')||'<div class="empty">Nessun cliente.</div>'}</div>`)
}
async function linkDocument(docId,vehicleId=null,clientId=null){try{const r=await api(`/api/documents/${docId}/link`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vehicle_id:vehicleId,client_id:clientId})});closeModal();toast('Documento collegato');if(r.actions?.length){modal(`<h2>Collegato ✓</h2>${r.actions.map(smartActionHtml).join('')}<div class="form-actions"><button class="primary" onclick="closeModal();route('documents')">OK</button></div>`)}else route('documents')}catch(e){toast(e.message,true)}}
async function reviewDoc(docId,vehicleId){const v=await api(`/api/vehicles/${vehicleId}`),d=v.documents.find(x=>x.id===docId);let f={};try{f=JSON.parse(d.detected_fields||'{}')}catch{} modal(`<h2>Verifica OCR</h2><p class="warn">Conferma solo dati realmente leggibili nel documento.</p><div class="form-grid">${fieldValue('plate','Targa',f.plate||'')}${fieldValue('vin','Telaio',f.vin||'')}${fieldValue('brand','Marca',f.brand||'')}${fieldValue('model','Modello',f.model||'')}${fieldValue('registration_date','Prima immatricolazione',f.registration_date||'')}${fieldValue('fuel','Alimentazione',f.fuel||'')}${fieldValue('engine_cc','Cilindrata (cc)',f.engine_cc||'')}${fieldValue('mileage','Chilometri',f.mileage||'')}${fieldValue('fiscal_code','Codice fiscale',f.fiscal_code||'')}</div><h3>Testo OCR</h3><div class="codebox">${esc(d.ocr_text||'Nessun testo riconosciuto')}</div><div class="form-actions"><button onclick="closeModal()">Annulla</button><button class="primary" onclick="confirmDoc(${docId},${vehicleId})">Conferma dati</button></div>`)}
function fieldValue(name,label,value){return `<div class="field"><label>${label}</label><input id="ocr_${name}" value="${esc(value)}"></div>`}
async function confirmDoc(id,vid){const fields={plate:$('#ocr_plate')?.value||'',vin:$('#ocr_vin')?.value||'',brand:$('#ocr_brand')?.value||'',model:$('#ocr_model')?.value||'',registration_date:$('#ocr_registration_date')?.value||'',fuel:$('#ocr_fuel')?.value||'',engine_cc:$('#ocr_engine_cc')?.value||'',mileage:$('#ocr_mileage')?.value||'',fiscal_code:$('#ocr_fiscal_code')?.value||''};try{const r=await api(`/api/documents/${id}/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});closeModal();if(r.warnings.length)modal(`<h2>⚠️ Incongruenze</h2><div class="warn">${r.warnings.map(esc).join('<br>')}</div><div class="form-actions"><button class="primary" onclick="closeModal();openVehicle(${vid},'documents')">OK</button></div>`);else{toast('Documento confermato');openVehicle(vid,'documents')}}catch(e){toast(e.message,true)}}

async function vehicleAutoscout(v){let analysis=await api(`/api/vehicles/${v.id}/price-analysis`);const l=v.listing||{};let days=0;if(l.published_date)days=Math.max(0,Math.floor((new Date()-new Date(l.published_date))/(86400000)));$('#vehicleTab').innerHTML=`<div class="grid cols-3"><div class="card metric"><small>GIORNI ONLINE</small><div class="n">${days}</div></div><div class="card metric"><small>COSTO REALE</small><div class="n">${money(analysis.total_invested)}</div></div><div class="card metric"><small>MARGINE ATTUALE</small><div class="n">${analysis.current_margin==null?'—':money(analysis.current_margin)}</div></div></div>
<div class="grid cols-2" style="margin-top:16px"><div class="card"><h3>Price Brain</h3><div class="kv"><div><small>Vendita rapida</small><strong>${money(analysis.rapid)}</strong></div><div><small>Competitivo</small><strong>${money(analysis.competitive)}</strong></div><div><small>Test mercato</small><strong>${money(analysis.test_market)}</strong></div></div><p class="warn">${esc(analysis.advice)}</p><button class="primary" onclick="openListing(${v.id})">${v.listing?'Aggiorna':'Prepara'} AutoScout</button></div><div class="card"><h3>Annuncio</h3><strong>${esc(l.title||'Non ancora preparato')}</strong><p class="muted">${esc(l.url||'Link non inserito')}</p><div class="codebox">${esc(l.description||'La descrizione verrà generata dai dati già presenti.')}</div></div></div>`}
function openListing(id){api(`/api/vehicles/${id}`).then(v=>{const l=v.listing||{};modal(`<h2>AutoScout Studio</h2><p class="muted">Inserisci i valori osservati su AutoScout. Nessuno scraping automatico viene eseguito senza un’integrazione autorizzata.</p><form id="listingForm"><div class="form-grid">${fieldV('url','Link annuncio',l.url||'')}${fieldV('published_date','Data pubblicazione',l.published_date||'','date')}${fieldV('initial_price','Prezzo iniziale',l.initial_price||v.expected_sale_price,'number')}${fieldV('current_price','Prezzo attuale',l.current_price||v.expected_sale_price,'number')}${fieldV('market_low','Mercato basso',l.market_low,'number')}${fieldV('market_median','Mediana osservata',l.market_median,'number')}${fieldV('market_high','Mercato alto',l.market_high,'number')}</div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Salva e analizza</button></div></form>`);$('#listingForm').onsubmit=async e=>{e.preventDefault();const d=formJSON(e.target);['initial_price','current_price','market_low','market_median','market_high'].forEach(k=>d[k]=+d[k]||0);try{await api(`/api/vehicles/${id}/listing`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});closeModal();toast('AutoScout aggiornato');openVehicle(id,'autoscout')}catch(err){toast(err.message,true)}}})}
function fieldV(name,label,value,type='text'){return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" ${type==='number'?'step="0.01"':''} value="${esc(value||'')}"></div>`}

function vehicleDelivery(v){
  const d=v.delivery||{};
  const items=v.delivery_items||[];
  const phaseLabels={7:'7 giorni prima',5:'5 giorni prima',3:'3 giorni prima',1:'1 giorno prima',0:'Giorno consegna'};
  const phases=[7,5,3,1,0];
  const data=phases.map(phase=>{
    const rows=items.filter(x=>x.phase_days_before===phase);
    const task=v.tasks.find(x=>x.source==='delivery'&&x.delivery_phase===phase);
    const done=rows.filter(x=>x.completed).length;
    return {phase,rows,task,done,complete:rows.length>0&&done===rows.length};
  }).filter(x=>x.rows.length);
  const totalDone=items.filter(x=>x.completed).length;
  const pct=items.length?Math.round(totalDone/items.length*100):0;
  const actionable=data.find(x=>!x.complete && (!x.task?.due_date || x.task.due_date<=todayISO())) || data.find(x=>!x.complete) || null;
  const desktopCards=data.map(x=>`<div class="card delivery-phase ${x.complete?'phase-complete':''}">
      <div class="section-title compact"><div><span class="badge ${x.complete?'green':x.task?.priority==='URGENTE'?'red':'yellow'}">${x.complete?'COMPLETA':esc(x.task?.priority||'DA FARE')}</span><h3>${esc(phaseLabels[x.phase])}</h3><small>${esc(x.task?.due_date||'')}${x.task?.due_time?` · ${esc(x.task.due_time)}`:''} · ${x.done}/${x.rows.length}</small></div>${x.complete?'':`<button class="ghost" onclick="completeDeliveryPhase(${v.id},${x.phase})">Segna fase completa</button>`}</div>
      <div class="delivery-checklist">${x.rows.map(item=>deliveryItemButton(item,v.id)).join('')}</div>
    </div>`).join('');
  const mobileCurrent=actionable?`<div class="mobile-delivery-now">
      <div class="mobile-delivery-now-head"><div><small>${actionable.task?.due_date&&actionable.task.due_date<=todayISO()?'DA FARE ORA':'PROSSIMA FASE'}</small><h3>${esc(phaseLabels[actionable.phase])}</h3><p>${esc(actionable.task?.due_date||'')} · ${actionable.done}/${actionable.rows.length} completati</p></div><span class="delivery-ring">${Math.round(actionable.done/actionable.rows.length*100)}%</span></div>
      <div class="mobile-delivery-list">${actionable.rows.map(item=>deliveryItemButton(item,v.id,true)).join('')}</div>
      ${actionable.complete?'':`<button class="mobile-complete-phase" onclick="completeDeliveryPhase(${v.id},${actionable.phase})">✓ Segna tutta la fase completata</button>`}
    </div>`:'';
  const otherPhases=data.filter(x=>!actionable||x.phase!==actionable.phase).map(x=>`<details class="mobile-phase-summary"><summary><span><strong>${esc(phaseLabels[x.phase])}</strong><small>${x.complete?'Completata':`${x.done}/${x.rows.length} completati${x.task?.due_date?` · ${esc(x.task.due_date)}`:''}`}</small></span><span>${x.complete?'✓':'›'}</span></summary><div class="mobile-delivery-list">${x.rows.map(item=>deliveryItemButton(item,v.id,true)).join('')}</div></details>`).join('');
  const mobileHtml=`<div class="mobile-delivery">
    <div class="mobile-delivery-hero"><div><small>CONSEGNA</small><h2>${d.delivery_date?`${esc(d.delivery_date)}${d.delivery_time?` · ${esc(d.delivery_time)}`:''}`:'Non programmata'}</h2><p>${d.notes?esc(d.notes):'AUTOSALONE ONE ti mostra solo ciò che manca.'}</p></div><button onclick="openDelivery(${v.id})">${d.delivery_date?'Modifica':'Programma'}</button></div>
    ${items.length?`<div class="mobile-progress-card"><div><strong>${totalDone} di ${items.length}</strong><small>controlli completati</small></div><b>${pct}%</b><div class="progress"><span style="width:${pct}%"></span></div></div>`:''}
    ${mobileCurrent||'<div class="mobile-empty">Programma la consegna per creare automaticamente la checklist.</div>'}
    ${otherPhases?`<div class="mobile-section-head"><div><small>TUTTA LA CONSEGNA</small><h3>Altre fasi</h3></div></div>${otherPhases}`:''}
  </div>`;
  const desktopHtml=`<div class="desktop-delivery"><div class="grid cols-2"><div class="card"><h3>Delivery Brain</h3><p>${d.delivery_date?`Consegna programmata per <strong>${esc(d.delivery_date)} ${esc(d.delivery_time||'')}</strong>`:'Nessuna consegna programmata.'}</p>${d.notes?`<p class="muted">${esc(d.notes)}</p>`:''}<button class="primary" onclick="openDelivery(${v.id})">${d.delivery_date?'Modifica':'Programma'} consegna</button></div><div class="card"><h3>Controllo automatico</h3><p class="muted">Ogni voce è indipendente. Quando completi tutte le voci di una fase, AUTOSALONE ONE chiude automaticamente la relativa attività.</p><strong>${items.length?`${totalDone}/${items.length} controlli completati`:'Imposta una consegna per generare i controlli.'}</strong></div></div><div class="section-title"><h2>Checklist consegna</h2></div><div class="delivery-phases">${desktopCards||'<div class="empty">Imposta la data di consegna per generare automaticamente la checklist.</div>'}</div></div>`;
  $('#vehicleTab').innerHTML=mobileHtml+desktopHtml;
}
function deliveryItemButton(item,vehicleId,mobile=false){return `<button class="delivery-check ${mobile?'mobile-delivery-check':''} ${item.completed?'checked':''}" onclick="toggleDeliveryItem(${item.id},${vehicleId})"><span>${item.completed?'✓':'○'}</span><strong>${esc(item.label)}</strong></button>`;}
async function openDelivery(id){
  const v=await api(`/api/vehicles/${id}`),d=v.delivery||{};
  modal(`<h2>Programma consegna</h2><form id="deliveryForm"><div class="form-grid">${fieldV('delivery_date','Data',d.delivery_date||'','date')}${fieldV('delivery_time','Ora',d.delivery_time||'','time')}<div class="field full"><label>Note</label><textarea name="notes">${esc(d.notes||'')}</textarea></div></div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Genera / aggiorna checklist</button></div></form>`);
  $('#deliveryForm').onsubmit=async e=>{e.preventDefault();try{await api(`/api/vehicles/${id}/delivery`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formJSON(e.target))});closeModal();toast('Checklist consegna aggiornata');openVehicle(id,'delivery')}catch(err){toast(err.message,true)}};
}
async function toggleDeliveryItem(itemId,vehicleId){try{await api(`/api/delivery-items/${itemId}/toggle`,{method:'POST'});openVehicle(vehicleId,'delivery')}catch(e){toast(e.message,true)}}
async function completeDeliveryPhase(vehicleId,phase){try{await api(`/api/delivery/${vehicleId}/phase/${phase}/complete`,{method:'POST'});toast('Fase completata');openVehicle(vehicleId,'delivery')}catch(e){toast(e.message,true)}}

async function vehicleInstagram(v){const d=await api(`/api/vehicles/${v.id}/instagram`);$('#vehicleTab').innerHTML=`<div class="grid cols-2"><div class="card"><h3>Caption</h3><div class="codebox">${esc(d.caption)}</div><button class="ghost" onclick="copyText(${JSON.stringify(d.caption)})">Copia</button></div><div class="card"><h3>Story</h3><div class="codebox">${esc(d.story)}</div><button class="ghost" onclick="copyText(${JSON.stringify(d.story)})">Copia</button></div></div><p class="warn">${esc(d.note)}</p>`}
function copyText(s){navigator.clipboard.writeText(s).then(()=>toast('Copiato'))}

async function vehicleContract(v){const clients=await api('/api/clients');$('#vehicleTab').innerHTML=`<div class="card"><h3>Vendi auto</h3><p class="muted">I dati già presenti vengono riutilizzati. Il PDF generato va comunque verificato prima dell’uso reale.</p>${clients.length?`<button class="primary" onclick="openContract(${v.id})">Genera contratto</button>`:'<div class="warn">Prima crea il cliente nella sezione CLIENTI.</div>'}</div>`}
async function openContract(vid){const clients=await api('/api/clients'),v=await api(`/api/vehicles/${vid}`);modal(`<h2>Genera contratto</h2><form id="contractForm"><div class="form-grid"><div class="field"><label>Cliente</label><select name="client_id">${clients.map(c=>`<option value="${c.id}">${esc(c.first_name+' '+c.last_name)}</option>`).join('')}</select></div>${fieldV('sale_price','Prezzo vendita',v.expected_sale_price||0,'number')}${fieldV('deposit','Caparra',0,'number')}${fieldV('financing','Finanziamento',0,'number')}${field('notes','Note','textarea','',true)}</div><div class="field full"><label><input id="tradeinToggle" type="checkbox"> Il cliente lascia una permuta</label></div><div id="tradeinBox"></div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Genera PDF + segna venduta</button></div></form>`);$('#tradeinToggle').onchange=e=>$('#tradeinBox').innerHTML=e.target.checked?`<h3>Permuta → nuova auto automatica</h3><div class="form-grid">${fieldV('trade_brand','Marca','')}${fieldV('trade_model','Modello','')}${fieldV('trade_plate','Targa','')}${fieldV('trade_mileage','Km',0,'number')}${fieldV('trade_value','Valore ritiro',0,'number')}</div>`:'';$('#contractForm').onsubmit=async e=>{e.preventDefault();const f=formJSON(e.target),payload={vehicle_id:vid,client_id:+f.client_id,sale_price:+f.sale_price||0,deposit:+f.deposit||0,financing:+f.financing||0,notes:f.notes||''};if($('#tradeinToggle').checked)payload.tradein_vehicle={brand:f.trade_brand||'',model:f.trade_model||'',plate:f.trade_plate||'',mileage:+f.trade_mileage||0,purchase_price:+f.trade_value||0,status:'DA_CONTROLLARE'};try{const r=await api('/api/contracts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});closeModal();toast('Contratto generato');window.open(r.pdf_url,'_blank');openVehicle(vid,'delivery')}catch(err){toast(err.message,true)}}}

function openTask(vehicleId=null){modal(`<h2>Nuova attività</h2><form id="taskForm"><div class="form-grid">${field('title','Attività')}${field('due_date','Data','date')}${field('due_time','Ora','time')}<div class="field"><label>Avvisami prima</label><select name="reminder_minutes"><option value="0">All’orario</option><option value="30" selected>30 minuti prima</option><option value="60">1 ora prima</option><option value="120">2 ore prima</option><option value="1440">1 giorno prima</option></select></div>${field('description','Note','textarea','',true)}</div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Salva</button></div></form>`);$('#taskForm').onsubmit=async e=>{e.preventDefault();const d=formJSON(e.target);d.reminder_minutes=+d.reminder_minutes||0;if(vehicleId)d.vehicle_id=vehicleId;try{await api('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});closeModal();toast('Attività creata');vehicleId?openVehicle(vehicleId):route(currentView)}catch(err){toast(err.message,true)}}}

async function editTask(id){
  const tasks=await api('/api/tasks?show_completed=true'),t=tasks.find(x=>x.id===id);
  if(!t)return toast('Attività non trovata',true);
  if(t.source!=='manuale')return toast('Questa attività è gestita automaticamente',true);
  modal(`<h2>Modifica attività</h2><form id="editTaskForm"><div class="form-grid">${fieldV('title','Attività',t.title)}${fieldV('due_date','Data',t.due_date,'date')}${fieldV('due_time','Ora',t.due_time,'time')}<div class="field"><label>Avvisami prima</label><select name="reminder_minutes">${[[0,'All’orario'],[30,'30 minuti prima'],[60,'1 ora prima'],[120,'2 ore prima'],[1440,'1 giorno prima']].map(([v,l])=>`<option value="${v}" ${Number(t.reminder_minutes||0)===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field full"><label>Note</label><textarea name="description">${esc(t.description||'')}</textarea></div></div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Salva modifiche</button></div></form>`);
  $('#editTaskForm').onsubmit=async e=>{e.preventDefault();const d=formJSON(e.target);d.vehicle_id=t.vehicle_id;d.client_id=t.client_id;d.reminder_minutes=+d.reminder_minutes||0;d.source='manuale';try{await api(`/api/tasks/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});closeModal();toast('Attività aggiornata');route(currentView)}catch(err){toast(err.message,true)}};
}

async function renderClients(){setTitle('CLIENTI','Ogni cliente deve avere un ultimo contatto e un prossimo passo.');const clients=await api('/api/clients');content.innerHTML=`<div class="toolbar"><button class="primary" onclick="openClient()">＋ Nuovo cliente</button></div><div class="list">${clients.length?clients.map(c=>`<div class="row people-card"><div class="row-main"><span class="badge navy">${esc(c.status.replaceAll('_',' '))}</span><strong>${esc(c.first_name+' '+c.last_name)}</strong><small>${esc(c.phone)}${c.brand?` · ${esc(c.brand+' '+c.model)}`:''}${c.last_contact?` · ultimo contatto ${esc(c.last_contact)}`:''}${c.next_contact_date?` · prossimo ${esc(c.next_contact_date)}${c.next_contact_time?' '+esc(c.next_contact_time):''}`:''}${c.next_step?` · ${esc(c.next_step)}`:''}</small></div><div class="row-actions">${c.phone?`<a class="mini-action" href="tel:${esc(c.phone.replace(/[^+0-9]/g,''))}">☎ Chiama</a>`:''}${c.interested_vehicle_id?`<button onclick="openVehicle(${c.interested_vehicle_id})">Auto</button>`:''}<button class="primary-soft" onclick="openClientDetail(${c.id})">Apri</button></div></div>`).join(''):'<div class="empty">Nessun cliente.</div>'}</div>`}
const clientActionLabels={CHIAMATO:'Chiamato',NON_RISPONDE:'Non risponde',DA_RICHIAMARE:'Da richiamare',APPUNTAMENTO:'Appuntamento',INTERESSATO:'Interessato',TRATTATIVA:'Trattativa',CHIUSO:'Chiuso',PERSO:'Perso'};
async function openClientDetail(id){
  try{
    const [clients,history]=await Promise.all([api('/api/clients'),api(`/api/clients/${id}/interactions`)]),c=clients.find(x=>x.id===id);
    if(!c)throw new Error('Cliente non trovato');
    const terminal=['CHIUSO','PERSO'].includes(c.status);
    modal(`<div class="client-detail"><div class="client-detail-head"><div><span class="badge ${terminal?'gray':'navy'}">${esc((clientActionLabels[c.status]||c.status))}</span><h2>${esc(c.first_name+' '+c.last_name)}</h2><p>${esc(c.phone||'Telefono non inserito')}${c.brand?` · ${esc(c.brand+' '+c.model)}`:''}</p></div><button onclick="openClient(${c.id})">Modifica dati</button></div>
    <div class="client-next ${c.next_contact_date?'has-next':''}"><small>PROSSIMO PASSO</small><strong>${esc(c.next_step|| (terminal?'Trattativa conclusa':'Da definire'))}</strong><span>${c.next_contact_date?`${esc(c.next_contact_date)}${c.next_contact_time?' alle '+esc(c.next_contact_time):''}`:(terminal?'':'⚠️ Nessun richiamo programmato')}</span></div>
    <div class="client-quick-actions">${c.phone?`<a class="client-action call" href="tel:${esc(c.phone.replace(/[^+0-9]/g,''))}"><b>☎</b><span>Chiama ora</span></a>`:''}<button class="client-action" onclick="quickClientAction(${c.id},'CHIAMATO')"><b>✓</b><span>Chiamato</span></button><button class="client-action" onclick="quickClientAction(${c.id},'NON_RISPONDE')"><b>…</b><span>Non risponde</span></button><button class="client-action" onclick="openClientCallback(${c.id})"><b>⏰</b><span>Programma richiamo</span></button><button class="client-action" onclick="quickClientAction(${c.id},'TRATTATIVA')"><b>🤝</b><span>Trattativa</span></button><button class="client-action success" onclick="quickClientAction(${c.id},'CHIUSO')"><b>✓</b><span>Chiuso</span></button><button class="client-action danger" onclick="quickClientAction(${c.id},'PERSO')"><b>×</b><span>Perso</span></button></div>
    <div class="section-title compact"><h3>Cronologia</h3><button onclick="openDocUpload(null,${c.id})">＋ Documento</button></div><div class="client-timeline">${history.length?history.map(h=>`<div class="timeline-item"><span></span><div><strong>${esc(clientActionLabels[h.action]||h.action)}</strong><small>${esc((h.happened_at||'').replace('T',' '))}</small>${h.note?`<p>${esc(h.note)}</p>`:''}</div></div>`).join(''):'<div class="empty">Nessun contatto registrato. Usa le azioni qui sopra: la cronologia si compila da sola.</div>'}</div></div>`);
  }catch(e){toast(e.message,true)}
}
async function quickClientAction(id,action){
  try{
    let note='';
    if(action==='NON_RISPONDE')note='Tentativo di contatto senza risposta';
    await api(`/api/clients/${id}/interactions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,note})});
    toast(clientActionLabels[action]||'Contatto registrato');
    if(action==='NON_RISPONDE')return openClientCallback(id,true);
    await openClientDetail(id);
  }catch(e){toast(e.message,true)}
}
function callbackDefaults(){
  const now=new Date(),tomorrow=new Date(now);tomorrow.setDate(now.getDate()+1);tomorrow.setHours(9,0,0,0);
  return {date:localISO(tomorrow),time:'09:00'};
}
async function quickCallback(id,mode){
  const now=new Date();let when=new Date(now);
  if(mode==='2h')when.setHours(now.getHours()+2);
  if(mode==='tomorrow'){when.setDate(now.getDate()+1);when.setHours(9,0,0,0)}
  const payload={due_date:localISO(when),due_time:`${String(when.getHours()).padStart(2,'0')}:${String(when.getMinutes()).padStart(2,'0')}`,reminder_minutes:30,next_step:'Richiamare cliente'};
  try{await api(`/api/clients/${id}/callback`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});closeModal();toast('Richiamo programmato');route('clients')}catch(e){toast(e.message,true)}
}
function openClientCallback(id,afterNoAnswer=false){
  const d=callbackDefaults();
  modal(`<div class="callback-wizard"><span class="eyebrow">${afterNoAnswer?'NON HA RISPOSTO':'PROSSIMO PASSO'}</span><h2>Quando vuoi riprovare?</h2><p class="muted">Un tocco e MALÙ23 CARS crea il promemoria e la notifica.</p><div class="callback-presets"><button onclick="quickCallback(${id},'2h')"><strong>Tra 2 ore</strong><small>Richiamo rapido</small></button><button onclick="quickCallback(${id},'tomorrow')"><strong>Domani 09:00</strong><small>Inizio giornata</small></button></div><form id="callbackForm"><div class="form-grid">${fieldV('due_date','Giorno',d.date,'date')}${fieldV('due_time','Ora',d.time,'time')}<div class="field"><label>Avvisami</label><select name="reminder_minutes"><option value="0">All’orario</option><option value="30" selected>30 minuti prima</option><option value="60">1 ora prima</option><option value="120">2 ore prima</option><option value="1440">1 giorno prima</option></select></div>${fieldV('next_step','Nota','Richiamare cliente')}</div><div class="form-actions"><button type="button" onclick="openClientDetail(${id})">Indietro</button><button class="primary">Programma</button></div></form></div>`);
  $('#callbackForm').onsubmit=async e=>{e.preventDefault();const data=formJSON(e.target);data.reminder_minutes=+data.reminder_minutes||0;try{await api(`/api/clients/${id}/callback`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});closeModal();toast('Richiamo programmato');route('clients')}catch(err){toast(err.message,true)}};
}
async function openClient(clientId=null,presetStatus=''){
  const [cars,clients]=await Promise.all([api('/api/vehicles'),clientId?api('/api/clients'):Promise.resolve([])]),c=clientId?clients.find(x=>x.id===clientId):null;
  if(clientId&&!c)return toast('Cliente non trovato',true);
  const statuses=['CHIAMATO','NON RISPONDE','DA RICHIAMARE','APPUNTAMENTO','INTERESSATO','TRATTATIVA','CHIUSO','PERSO'];
  modal(`<h2>${c?'Modifica cliente':'Nuovo cliente'}</h2><form id="clientForm"><div class="form-grid">${fieldV('first_name','Nome',c?.first_name||'')}${fieldV('last_name','Cognome',c?.last_name||'')}${fieldV('phone','Telefono',c?.phone||'')}${fieldV('email','Email',c?.email||'')}${fieldV('fiscal_code','Codice fiscale',c?.fiscal_code||'')}${fieldV('address','Indirizzo',c?.address||'')}<div class="field"><label>Auto interessata</label><select name="interested_vehicle_id"><option value="">—</option>${cars.map(v=>`<option value="${v.id}" ${c?.interested_vehicle_id===v.id?'selected':''}>${esc(v.brand+' '+v.model+' '+v.plate)}</option>`).join('')}</select></div>${fieldV('offer','Offerta',c?.offer||0,'number')}<div class="field"><label>Stato</label><select name="status">${statuses.map(x=>`<option value="${x}" ${x===(presetStatus||c?.status||'INTERESSATO')?'selected':''}>${x.replaceAll('_',' ')}</option>`).join('')}</select></div>${fieldV('last_contact','Ultimo contatto',c?.last_contact||'','date')}${fieldV('next_contact_date','Richiamare il',c?.next_contact_date||'','date')}${fieldV('next_contact_time','Ora richiamo',c?.next_contact_time||'','time')}<div class="field"><label>Notifica</label><select name="reminder_minutes">${[[0,'All’orario'],[30,'30 minuti prima'],[60,'1 ora prima'],[120,'2 ore prima'],[1440,'1 giorno prima']].map(([v,l])=>`<option value="${v}" ${Number(c?.reminder_minutes??30)===v?'selected':''}>${l}</option>`).join('')}</select></div>${fieldV('next_step','Prossimo passo',c?.next_step||'')}${fieldV('tradein_notes','Permuta / note',c?.tradein_notes||'')}<div class="field full"><label>Note</label><textarea name="notes">${esc(c?.notes||'')}</textarea></div></div><div class="form-actions"><button type="button" onclick="closeModal()">Annulla</button><button class="primary">Salva</button></div></form>`);
  $('#clientForm').onsubmit=async e=>{e.preventDefault();const d=formJSON(e.target);d.interested_vehicle_id=d.interested_vehicle_id?+d.interested_vehicle_id:null;d.offer=+d.offer||0;d.reminder_minutes=+d.reminder_minutes||0;const url=c?`/api/clients/${c.id}`:'/api/clients',method=c?'PUT':'POST';try{await api(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});closeModal();toast(c?'Cliente aggiornato':'Cliente creato');route('clients')}catch(err){toast(err.message,true)}};
}

async function renderCalendar(){setTitle('CALENDARIO','Scadenze generate dal lavoro reale, non un’agenda da riempire.');const tasks=await api('/api/tasks');const groups={};tasks.forEach(t=>(groups[t.due_date||'Senza data']??=[]).push(t));content.innerHTML=`<div class="section-title"><h2>Attività e scadenze</h2><button class="primary" onclick="openTask()">＋ Attività</button></div>${Object.entries(groups).sort().map(([d,arr])=>`<div class="card" style="margin-bottom:12px"><h3>${esc(d)}</h3><div class="list">${arr.map(taskRow).join('')}</div></div>`).join('')||'<div class="empty">Calendario libero.</div>'}`}

async function renderFinance(){
  setTitle('GUADAGNI','Acquisto, lavori e spese contro vendite reali e previste.');
  const d=await api('/api/finance'),s=d.summary,sold=d.sold||[],stock=d.stock||[];
  const focus=[...stock].sort((a,b)=>Number(a.projected_margin??Number.MAX_SAFE_INTEGER)-Number(b.projected_margin??Number.MAX_SAFE_INTEGER))[0];
  const focusMargin=focus?.projected_margin;
  content.innerHTML=`<section class="finance-cockpit"><div class="finance-stage"><span class="eyebrow">CONTROLLO ECONOMICO · LIVE</span><h2>Il guadagno, senza conti a parte.</h2><p>Una foto aggiorna i costi. MALÙ23 ricalcola il margine per ogni auto e chiude il risultato alla vendita.</p><div class="finance-flow" aria-label="Flusso automatico del margine"><span><b>1</b>Acquisto</span><i>→</i><span><b>2</b>Lavori</span><i>→</i><span class="active"><b>3</b>Foto spesa</span><i>→</i><span><b>4</b>Vendita</span></div></div><div class="finance-profit-dial"><small>GUADAGNO REALIZZATO</small><strong>${money(s.realized_margin)}</strong><span>${s.sold_count} ${s.sold_count===1?'auto chiusa':'auto chiuse'}</span><div><em>Ricavi</em><b>${money(s.realized_revenue)}</b></div></div></section>
  <div class="finance-action-dock"><div><span class="dock-icon">◎</span><div><strong>Aggiungi un costo in 10 secondi</strong><small>Scatta lo scontrino: importo, fornitore e auto vengono proposti automaticamente.</small></div></div><div class="finance-hero-actions"><button class="primary" onclick="mobilePickVehicle('expense-photo')">📷 Fotografa spesa</button><button class="ghost" onclick="mobilePickVehicle('expense')">＋ Inserisci a mano</button></div></div>
  ${focus?`<button class="finance-next-move" onclick="openVehicle(${focus.id})"><span class="next-move-label">PROSSIMA MOSSA</span><span class="next-move-car"><strong>${esc(focus.brand+' '+focus.model)}</strong><small>${esc(focus.plate||'Senza targa')} · ${money(focus.total_invested)} investiti</small></span><span class="next-move-value"><small>${focusMargin==null?'PREZZO MANCANTE':'MARGINE PIÙ BASSO'}</small><strong class="${Number(focusMargin||0)<0?'negative':''}">${focusMargin==null?'Completa prezzo':money(focusMargin)}</strong></span><b>Apri →</b></button>`:''}
  <div class="finance-metrics"><div class="finance-metric profit"><small>GUADAGNO REALIZZATO</small><strong>${money(s.realized_margin)}</strong><span>${s.sold_count} auto vendute · ricavi ${money(s.realized_revenue)}</span></div><div class="finance-metric"><small>CAPITALE IN STOCK</small><strong>${money(s.stock_invested)}</strong><span>acquisto + lavori + spese</span></div><div class="finance-metric"><small>MARGINE PREVISTO</small><strong>${money(s.projected_margin)}</strong><span>sui prezzi di vendita inseriti</span></div><div class="finance-metric"><small>COSTI AGGIUNTIVI</small><strong>${money(s.expenses)}</strong><span>+ ${money(s.works)} lavori reali</span></div></div>
  <div class="finance-layout"><div><div class="section-title"><h2>Margine per auto venduta</h2></div><div class="profit-list">${sold.length?sold.map(v=>financeVehicleRow(v,true)).join(''):'<div class="empty"><strong>Nessuna vendita registrata.</strong><br>La prima vendita apparirà qui automaticamente.</div>'}</div></div><div><div class="section-title"><h2>Costi per categoria</h2></div><div class="card finance-breakdown">${d.expense_categories.length?d.expense_categories.map(x=>`<div><span>${esc(x.category)}</span><strong>${money(x.amount)}</strong><small>${x.count} movimenti</small></div>`).join(''):'<div class="empty">Nessuna spesa registrata.</div>'}</div></div></div>
  <div class="section-title"><h2>Movimenti recenti</h2><small class="muted">Vendite, lavori e spese collegati alle auto</small></div><div class="finance-transactions">${(d.recent_transactions||[]).length?d.recent_transactions.map(financeTransactionRow).join(''):'<div class="empty">Nessun movimento registrato.</div>'}</div>
  <div class="section-title"><h2>Stock · margine previsto</h2></div><div class="profit-grid">${stock.length?stock.map(financeVehicleCard).join(''):'<div class="empty">Nessuna auto aperta in stock.</div>'}</div>`;
}
function financeVehicleRow(v,realized=false){const m=realized?v.realized_margin:v.projected_margin;return `<button class="profit-row" onclick="openVehicle(${v.id})"><div><strong>${esc(v.brand+' '+v.model)}</strong><small>${esc(v.plate||'')} · costo ${money(v.total_invested)} · ${realized?'vendita':'previsto'} ${money(realized?v.sale_price:v.expected_sale_price)}</small></div><div class="profit-value ${Number(m||0)<0?'negative':''}"><strong>${m==null?'—':money(m)}</strong>${v.margin_percent!=null?`<small>${v.margin_percent}%</small>`:''}</div></button>`}
function financeVehicleCard(v){const m=v.projected_margin;return `<button class="profit-card" onclick="openVehicle(${v.id})"><span class="badge navy">${esc(stateLabels[v.status]||v.status)}</span><h3>${esc(v.brand+' '+v.model)}</h3><p>${esc(v.plate||'')} · investito ${money(v.total_invested)}</p><div><small>MARGINE PREVISTO</small><strong class="${Number(m||0)<0?'negative':''}">${m==null?'—':money(m)}</strong></div></button>`}
function financeTransactionRow(x){const positive=x.type==='sale';const car=[x.brand,x.model,x.plate].filter(Boolean).join(' ');return `<button class="finance-transaction" onclick="openVehicle(${x.vehicle_id},'${x.type==='sale'?'contract':'works'}')"><span class="transaction-icon ${positive?'positive':'negative'}">${positive?'↗':'↘'}</span><span><strong>${esc(x.label||'Movimento')}</strong><small>${esc(car)}${x.detail?` · ${esc(x.detail)}`:''} · ${esc(x.date||'')}</small></span><b class="${positive?'positive':'negative'}">${positive?'+':'−'}${money(Math.abs(Number(x.amount||0)))}</b></button>`}

async function renderAutoscout(){setTitle('AUTOSCOUT','Annunci, prezzo, aging e margine.');const cars=await api('/api/vehicles');const selling=cars.filter(v=>['DA_PUBBLICARE','IN_VENDITA','PRENOTATA'].includes(v.status));content.innerHTML=`<div class="grid cols-3">${selling.map(v=>`<div class="card clickable" onclick="openVehicle(${v.id},'autoscout')"><span class="badge ${v.status==='IN_VENDITA'?'green':'yellow'}">${esc(stateLabels[v.status])}</span><h3>${esc(v.brand+' '+v.model)}</h3><p>${esc(v.plate||'')} · ${money(v.expected_sale_price)}</p><small class="muted">Apri Price Brain / annuncio</small></div>`).join('')||'<div class="empty">Nessuna auto in fase di pubblicazione/vendita.</div>'}</div>`}

async function renderDocuments(){
  setTitle('DOCUMENTI','Scatta o manda un PDF: MALÙ23 legge, divide, collega e propone il prossimo passo.');
  const [docs,actions]=await Promise.all([api('/api/documents'),api('/api/document-actions?status=PENDING')]);
  const pending=actions.length;
  content.innerHTML=`<div class="document-brain-hero"><div><span class="eyebrow">DOCUMENT BRAIN</span><h2>Butta dentro il documento. Al resto penso io.</h2><p>Foto o PDF: riconosco tipo, targa, telaio, cliente, importo e pagine. Se posso lo collego da solo; se manca una sola informazione te la chiedo.</p><div class="smart-auto-list"><span>✓ PDF multipagina divisi</span><span>✓ Targa/VIN automatici</span><span>✓ Fatture → spese pronte</span><span>✓ Libretto → auto pronta</span></div></div><button class="primary smart-main-button" onclick="openSmartCapture()">📷 Scatta / carica</button></div>${pending?`<div class="smart-actions-inbox"><div class="section-title"><h2>✨ ${pending} ${pending===1?'azione pronta':'azioni pronte'}</h2><small>Conferma con un tocco: niente reinserimenti.</small></div>${actions.map(smartActionHtml).join('')}</div>`:''}<div class="section-title"><h2>Inbox documenti (${docs.length})</h2><button class="ghost" onclick="openSmartCapture()">＋ Documento</button></div><div class="list">${docs.length?docs.map(d=>documentRowHtml(d,false)).join(''):'<div class="empty"><strong>Nessun documento.</strong><br>Fai una foto al primo libretto o trascina un PDF.</div>'}</div>`;
}


async function renderSettings(){
  setTitle('MALÙ23 CARS','Profilo, sicurezza, notifiche, utenti e continuità operativa.');
  const me=await api('/api/me');

  if(me.role!=='OWNER' && me.username!=='locale'){
    const st=await api('/api/status');
    content.innerHTML=`<div class="settings-hero"><div><span class="eyebrow">IL TUO ACCESSO</span><h2>Ciao ${esc(me.display_name||me.username)}.</h2><p>Le impostazioni della concessionaria sono gestite dal titolare. Qui puoi controllare il tuo accesso e le notifiche sul dispositivo.</p></div><div class="readiness-score"><strong>STAFF</strong><small>accesso collaboratore</small></div></div>
    <div class="grid cols-2">
      <div class="card"><h2>🔔 Notifiche su questo dispositivo</h2><p class="muted">Puoi ricevere richiami, consegne e attività assegnate senza modificare la configurazione della concessionaria.</p><div class="notify-setup"><div><strong id="notifyState">Controllo notifiche…</strong><small>${st.push_devices||0} dispositivo/i registrato/i · ${st.unread_notifications||0} non lette</small></div><button class="primary" onclick="enablePushNotifications()">Attiva notifiche</button></div><div class="row-actions"><button onclick="openNotificationCenter()">Centro notifiche</button><button onclick="sendTestNotification()">Invia prova</button></div></div>
      <div class="card"><h2>👤 Account</h2><div class="kv"><div><small>Utente</small><strong>${esc(me.display_name||me.username)}</strong></div><div><small>Ruolo</small><strong>Collaboratore</strong></div><div><small>Versione</small><strong>${esc(st.version)}</strong></div><div><small>Database</small><strong>${st.ok?'✅ operativo':'❌ problema'}</strong></div></div><p class="muted" style="margin-top:14px">Per dati fiscali, utenti, backup e contratto rivolgiti al titolare.</p></div>
    </div>`;
    updateNotificationState();
    return;
  }

  const [s,st,rd,bk]=await Promise.all([api('/api/settings'),api('/api/status'),api('/api/readiness'),api('/api/backups/status')]);
  let users=[]; try{users=await api('/api/users')}catch(_){}
  const services=(s.dealer_services||'').split('|').filter(Boolean);
  const readinessRows=rd.checks.map(x=>`<div class="readiness-row ${x.ok?'ok':'missing'}"><span>${x.ok?'✓':'!'}</span><strong>${esc(x.label)}</strong></div>`).join('');
  const userRows=users.map(u=>`<div class="row"><div class="row-main"><strong>${esc(u.display_name||u.username)}</strong><small>@${esc(u.username)} · ${u.role==='OWNER'?'Titolare':'Collaboratore'} · ${u.active?'attivo':'disattivato'}</small></div></div>`).join('');
  const externalBackupState=bk.external_ready?'✅ pronta':bk.external_configured?'⚠️ configurata ma non scrivibile':'⚠️ da configurare';
  const externalBackupError=bk.external_error?`<p class="warn">Ultimo errore copia esterna: ${esc(bk.external_error)}</p>`:'';
  content.innerHTML=`<div class="settings-hero"><div><span class="eyebrow">CONFIGURAZIONE CONCESSIONARIA</span><h2>Malù23 Cars deve essere pronta anche quando tu non sei in ufficio.</h2><p>Qui controlli identità, notifiche, utenti, backup e gate di produzione.</p></div><div class="readiness-score"><strong>${rd.score}%</strong><small>prontezza tecnica cloud</small></div></div>
  <div class="grid cols-2">
    <div class="card brand-profile">
      <div class="brand-profile-head"><img src="/static/brand/malu23_logo_transparent.png" alt="Malù23 Cars"><h2>${esc(s.dealer_name||'Malù23 Cars')}</h2><p>${esc(s.dealer_tagline||'')}</p></div>
      <div class="brand-profile-body"><strong>${esc(s.dealer_address||'')}</strong><p class="muted">${esc(s.dealer_phone||'')}${s.dealer_phone_secondary?` · ${esc(s.dealer_phone_secondary)}`:''}<br>${esc(s.dealer_email||'')}${s.dealer_email_secondary?` · ${esc(s.dealer_email_secondary)}`:''}</p><div class="service-chips">${services.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>
    </div>
    <div class="card"><div class="section-title compact"><div><h2>Gate produzione</h2><p class="muted">Non nasconde ciò che manca prima dei dati reali.</p></div><span class="badge ${rd.ready?'green':'yellow'}">${rd.ready?'PRONTO':'DA CHIUDERE'}</span></div><div class="readiness-list">${readinessRows}</div></div>

    <div class="card full-span"><h2>Dati concessionaria</h2><form id="settingsForm"><div class="form-grid">
      ${fieldV('dealer_name','Ragione sociale',s.dealer_name)}${fieldV('dealer_owner','Titolare / referente',s.dealer_owner)}
      ${fieldV('dealer_vat','P.IVA',s.dealer_vat)}${fieldV('dealer_tax_code','Codice fiscale',s.dealer_tax_code)}
      ${fieldV('dealer_pec','PEC',s.dealer_pec,'email')}${fieldV('dealer_sdi','Codice SDI',s.dealer_sdi)}
      ${fieldV('dealer_iban','IBAN',s.dealer_iban)}${fieldV('dealer_address','Indirizzo',s.dealer_address)}
      ${fieldV('dealer_phone','Telefono Luca',s.dealer_phone)}${fieldV('dealer_phone_secondary','Telefono Silvano',s.dealer_phone_secondary)}
      ${fieldV('dealer_email','Email Luca',s.dealer_email,'email')}${fieldV('dealer_email_secondary','Email Silvano',s.dealer_email_secondary,'email')}
      ${fieldV('dealer_tagline','Claim',s.dealer_tagline)}${fieldV('dealer_guarantee','Garanzia',s.dealer_guarantee)}
      <div class="field full"><label>Servizi · separati da |</label><textarea name="dealer_services">${esc(s.dealer_services||'')}</textarea></div>
      <div class="field full"><label>Bio AutoScout</label><textarea name="autoscout_bio">${esc(s.autoscout_bio||'')}</textarea></div>
      <div class="field full"><label>Condizioni contratto reali</label><textarea name="contract_terms" rows="6" placeholder="Inserire qui il testo verificato del contratto Malù23 Cars">${esc(s.contract_terms||'')}</textarea></div>
      <div class="field full"><label>Nota privacy</label><textarea name="privacy_note" rows="3">${esc(s.privacy_note||'')}</textarea></div>
      <div class="field"><label>Contratto verificato</label><select name="contract_reviewed"><option value="0" ${s.contract_reviewed!=='1'?'selected':''}>No · bozza</option><option value="1" ${s.contract_reviewed==='1'?'selected':''}>Sì · verificato</option></select></div>
      ${fieldV('notify_day_start','Orario attività senza ora',s.notify_day_start||'08:30','time')}
      <div class="field"><label>Promemoria predefinito</label><select name="notify_default_minutes">${[[0,'All’orario'],[30,'30 minuti'],[60,'1 ora'],[120,'2 ore'],[1440,'1 giorno']].map(([v,l])=>`<option value="${v}" ${String(s.notify_default_minutes||'30')===String(v)?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Backup automatico</label><select name="backup_auto_enabled"><option value="1" ${s.backup_auto_enabled!=='0'?'selected':''}>Attivo</option><option value="0" ${s.backup_auto_enabled==='0'?'selected':''}>Disattivo</option></select></div>
      ${fieldV('backup_time','Ora backup automatico',s.backup_time||'02:30','time')}${fieldV('backup_retention_days','Conservazione backup (giorni)',s.backup_retention_days||'14','number')}
    </div><div class="form-actions"><button class="primary">Salva configurazione Malù23 Cars</button></div></form></div>

    <div class="card"><h2>🔔 Notification Brain</h2><p class="muted">Richiami, appuntamenti, consegne e attività. Su iPhone installa la web app nella Home e poi attiva le notifiche.</p>
      <div class="notify-setup"><div><strong id="notifyState">Controllo notifiche…</strong><small>${st.push_devices||0} dispositivo/i registrato/i · ${st.unread_notifications||0} non lette</small></div><button class="primary" onclick="enablePushNotifications()">Attiva su questo dispositivo</button></div>
      <div class="row-actions"><button onclick="openNotificationCenter()">Centro notifiche</button><button onclick="sendTestNotification()">Invia prova</button></div>
      <div class="iphone-install"><strong>iPhone · installazione guidata</strong><small>Invia il link su WhatsApp. La pagina riconosce l’iPhone e guida passo-passo fino alla Home.</small><div class="row-actions" style="margin-top:8px"><button onclick="copyIphoneInstallLink()">Copia link iPhone</button><button onclick="openIphoneInstallGuide()">Apri guida</button></div></div>
    </div>
    <div class="card"><h2>🛡 Backup e continuità</h2><div class="kv"><div><small>Automatico</small><strong>${bk.auto_enabled?'✅ attivo':'⚠️ disattivo'} · ${esc(bk.time)}</strong></div><div><small>Copia esterna</small><strong>${externalBackupState}</strong></div><div><small>Ultimo backup automatico</small><strong>${esc(bk.last_date||'mai')}</strong></div><div><small>Retention</small><strong>${bk.retention_days} giorni</strong></div></div>${externalBackupError}<div class="row-actions"><button class="primary" onclick="createBackup()">Crea e scarica backup</button><button onclick="forceBackup()">Esegui backup automatico ora</button></div><hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><h3>Ripristina</h3><input id="restoreFile" type="file" accept=".zip"><button class="ghost" onclick="restoreBackup()" style="margin-top:10px">Ripristina ZIP</button></div>

    <div class="card"><h2>👥 Utenti</h2><p class="muted">${users.length?`Accesso attuale: <strong>${esc(me.username||'locale')}</strong> · ${me.role==='OWNER'?'Titolare':'Collaboratore'}.`:'Primo avvio: crea il Titolare. Da quel momento MALÙ23 CARS protegge automaticamente l’accesso.'}</p>${me.role==='OWNER'||!users.length?`<form id="userForm"><div class="form-grid">${fieldV('username','Username','')}${fieldV('display_name','Nome visualizzato','')}${fieldV('password','Password (min. 8 caratteri)','','password')}<div class="field"><label>Ruolo</label><select name="role">${users.length?'<option value="STAFF">Collaboratore</option><option value="OWNER">Titolare</option>':'<option value="OWNER" selected>Titolare</option>'}</select></div></div><button class="primary" style="margin-top:10px">${users.length?'Aggiungi / aggiorna utente':'Crea Titolare e proteggi MALÙ23 CARS'}</button></form>`:''}<div class="list" style="margin-top:14px">${userRows||'<div class="empty">Nessun account personale ancora configurato.</div>'}</div>${me.role==='OWNER'?'<button class="ghost" onclick="showAudit()">Vedi attività recenti</button>':''}</div>
    <div class="card"><h2>Diagnostica</h2><div class="kv"><div><small>Versione</small><strong>${esc(st.version)}</strong></div><div><small>Database</small><strong>${st.ok?'✅ integro':'❌ problema'}</strong></div><div><small>OCR Tesseract</small><strong>${st.ocr_available?'✅ '+esc(st.ocr_language||'disponibile'):'⚠️ non installato'}</strong></div><div><small>Auto</small><strong>${st.vehicles}</strong></div><div><small>Notifiche</small><strong>${st.unread_notifications||0} non lette</strong></div><div><small>Dispositivi push</small><strong>${st.push_devices||0}</strong></div><div><small>Utenti</small><strong>${st.users||0}</strong></div><div><small>Eventi audit</small><strong>${st.audit_events||0}</strong></div></div>${st.ok?'':'<p class="warn">'+esc(st.database_integrity)+'</p>'}</div>
  </div>`;
  $('#settingsForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formJSON(e.target))});toast('Configurazione Malù23 Cars salvata');route('settings')}catch(err){toast(err.message,true)}};
  const uf=$('#userForm'); if(uf)uf.onsubmit=async e=>{e.preventDefault();try{await api('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formJSON(e.target))});toast('Utente salvato. Da ora l’accesso richiede login.');setTimeout(()=>route('settings'),350)}catch(err){toast(err.message,true)}};
  updateNotificationState();
}

async function createBackup(){try{const r=await api('/api/backups/create',{method:'POST'});window.location=r.url;toast('Backup creato')}catch(e){toast(e.message,true)}}
async function restoreBackup(){const f=$('#restoreFile').files[0];if(!f)return toast('Seleziona un backup ZIP',true);if(!confirm('Il database corrente verrà sostituito. Prima verrà creato un backup di sicurezza. Continuare?'))return;const fd=new FormData();fd.append('file',f);try{await api('/api/backups/restore',{method:'POST',body:fd});toast('Backup ripristinato');route('today')}catch(e){toast(e.message,true)}}
async function forceBackup(){try{const r=await api('/api/backups/auto-run',{method:'POST'});toast(r.external_copy?'Backup creato anche nella copia esterna':'Backup creato');route('settings')}catch(e){toast(e.message,true)}}
async function showAudit(){try{const rows=await api('/api/audit?limit=80');modal(`<h2>Attività recenti</h2><div class="list">${rows.length?rows.map(x=>`<div class="row"><div class="row-main"><strong>${esc(x.username||'locale')} · ${esc(x.method)} ${esc(x.path)}</strong><small>${esc((x.created_at||'').replace('T',' '))} · HTTP ${x.status_code}</small></div></div>`).join(''):'<div class="empty">Nessuna attività registrata.</div>'}</div>`)}catch(e){toast(e.message,true)}}

function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64); return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
async function updateNotificationState(){
  const el=$('#notifyState'); if(!el)return;
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window)){el.textContent='Notifiche push non supportate su questo browser';return;}
  const reg=await navigator.serviceWorker.ready.catch(()=>null); if(!reg){el.textContent='Service worker non disponibile';return;}
  const sub=await reg.pushManager.getSubscription().catch(()=>null);
  el.textContent=Notification.permission==='granted'&&sub?'✅ Notifiche attive su questo dispositivo':Notification.permission==='denied'?'⚠️ Notifiche bloccate nelle impostazioni':'Notifiche non ancora attivate';
}
async function enablePushNotifications(){
  try{
    if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window)) throw new Error('Questo browser non supporta le notifiche push');
    const permission=await Notification.requestPermission(); if(permission!=='granted') throw new Error('Permesso notifiche non concesso');
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){const k=await api('/api/push/public-key');sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(k.public_key)});}
    await api('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sub.toJSON())});
    toast('Notifiche Malù23 Cars attivate'); await updateNotificationState(); await updateNotificationBadge();
  }catch(e){toast(e.message,true)}
}
async function updateNotificationBadge(){
  try{const items=await api('/api/notifications?include_read=false'),badge=$('#notificationBadge');const n=items.filter(x=>x.status==='UNREAD').length;badge.textContent=n>99?'99+':n;badge.classList.toggle('hidden',!n);if('setAppBadge' in navigator){if(n)navigator.setAppBadge(n).catch(()=>{});else navigator.clearAppBadge().catch(()=>{});}return n;}catch{return 0}
}
function notificationRow(n){
  const who=[n.first_name,n.last_name].filter(Boolean).join(' '),car=[n.brand,n.model,n.plate].filter(Boolean).join(' '),ctx=[who,car].filter(Boolean).join(' · ');
  return `<div class="notification-row ${n.status==='UNREAD'?'unread':''}"><div><h4>${esc(n.title)}</h4><p>${esc(n.body||ctx||'')}</p><small>${esc((n.due_at||n.created_at||'').replace('T',' '))}${ctx?' · '+esc(ctx):''}</small></div><div class="notification-controls">${n.vehicle_id?`<button onclick="closeModal();openVehicle(${n.vehicle_id})">Apri auto</button>`:''}${n.status==='UNREAD'?`<button onclick="snoozeNotification(${n.id})">+1h</button><button onclick="readNotification(${n.id})">✓ Letta</button>`:''}</div></div>`;
}
async function openNotificationCenter(){
  try{const items=await api('/api/notifications');modal(`<h2>🔔 Centro notifiche</h2><div class="notify-setup"><div><strong>Malù23 Cars ti ricorda cosa fare</strong><small>Richiami, consegne, lavori e scadenze in un unico posto.</small></div><button class="primary" onclick="enablePushNotifications()">Attiva push</button></div><div class="notification-center">${items.length?items.map(notificationRow).join(''):'<div class="empty">Nessuna notifica. Tutto sotto controllo.</div>'}</div>`);await updateNotificationBadge();}catch(e){toast(e.message,true)}
}
async function readNotification(id){try{await api(`/api/notifications/${id}/read`,{method:'POST'});await openNotificationCenter();await updateNotificationBadge()}catch(e){toast(e.message,true)}}
async function snoozeNotification(id){try{await api(`/api/notifications/${id}/snooze?minutes=60`,{method:'POST'});toast('Promemoria rimandato di 1 ora');await openNotificationCenter();await updateNotificationBadge()}catch(e){toast(e.message,true)}}
async function sendTestNotification(){try{const r=await api('/api/notifications/test',{method:'POST'});toast(r.push_sent?'Notifica push inviata':'Test creato: attiva le notifiche push su questo dispositivo');await updateNotificationBadge()}catch(e){toast(e.message,true)}}

async function maybeOfferPushOnboarding(){
  if(!isStandaloneMode() || !('Notification' in window) || Notification.permission!=='default') return;
  if(localStorage.getItem('malu23_push_onboarding_seen')==='1') return;
  setTimeout(()=>{
    if(!isStandaloneMode() || Notification.permission!=='default') return;
    modal(`<div class="push-onboarding"><span class="eyebrow">ULTIMO PASSAGGIO</span><h2>Vuoi che MALÙ23 CARS ti ricordi le cose da fare?</h2><p class="muted">Richiami clienti, consegne, documenti e lavori possono arrivare direttamente come notifica sull’iPhone.</p><button class="primary big" onclick="finishPushOnboarding()">Sì, attiva notifiche</button><button class="ghost" style="margin-top:8px;width:100%" onclick="skipPushOnboarding()">Più tardi</button></div>`);
  },900);
}
async function finishPushOnboarding(){
  localStorage.setItem('malu23_push_onboarding_seen','1');
  await enablePushNotifications(); closeModal();
}
function skipPushOnboarding(){ localStorage.setItem('malu23_push_onboarding_seen','1'); closeModal(); }

if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
const initialView=new URLSearchParams(location.search).get('view');
route(['today','garage','clients','calendar','autoscout','documents','settings'].includes(initialView)?initialView:'today');
setInterval(updateNotificationBadge,30000);updateNotificationBadge();
maybeOfferPushOnboarding();


async function refreshSystemStatus(){
  try{const st=await api('/api/status');const dot=$('#statusDot');dot.textContent=`Malù23 · v${st.version}`;dot.title=st.ocr_available?'Database integro · OCR disponibile':'Database integro · OCR non installato';dot.style.opacity=st.ok?'1':'.7';}
  catch{const dot=$('#statusDot');dot.textContent='Connessione non disponibile';}
}
refreshSystemStatus();
