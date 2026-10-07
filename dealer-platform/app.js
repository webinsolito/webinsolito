import {OfflineDB,SyncEngine,mutationCount} from './offline.js';
import {Session,login,logout,fetchTenantData,cachedTenantData,saveOfflineEntity,sendMutation,accessToken,validateTelegram,linkTelegram} from './api.js';

const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n||0));
const dateTime=v=>v?new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'—';
const state={view:'today',dealerId:'demo-malu23',dealerName:'MALÙ23 CARS',data:{vehicles:[],customers:[],costs:[],events:[]},syncState:'idle',telegram:null};
let syncEngine=null,deferredInstall=null;

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function statusLabel(s){return ({IN_ARRIVO:'IN ARRIVO',DA_CONTROLLARE:'DA CONTROLLARE',IN_PREPARAZIONE:'IN PREPARAZIONE',DA_FOTOGRAFARE:'DA FOTOGRAFARE',DA_PUBBLICARE:'DA PUBBLICARE',IN_VENDITA:'IN VENDITA',PRENOTATA:'PRENOTATA',VENDUTA:'VENDUTA',DA_CONSEGNARE:'DA CONSEGNARE',CONSEGNATA:'CONSEGNATA'})[s]||s||'—'}

function sessionDealer(){const s=Session.get();return s?.dealer||{id:'demo-malu23',display_name:'MALÙ23 CARS',slug:'malu23'}}

async function boot(){
  registerSW();bindGlobal();initTelegram();
  const s=Session.get();
  if(!s){showLogin();return}
  await enterApp();
}

function registerSW(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn)}

function bindGlobal(){
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;renderInstall()});
  window.addEventListener('appinstalled',()=>{deferredInstall=null;renderInstall()});
  window.addEventListener('dealer:online',()=>{renderConnectivity();syncNow()});
  window.addEventListener('dealer:offline',renderConnectivity);
  window.addEventListener('dealer:queue-changed',renderConnectivity);
  $('#loginForm')?.addEventListener('submit',handleLogin);
  $('#logoutBtn')?.addEventListener('click',async()=>{await logout();location.reload()});
  $('#installBtn')?.addEventListener('click',installApp);
  $('#addVehicleBtn')?.addEventListener('click',()=>openModal('vehicle'));
  $('#addCustomerBtn')?.addEventListener('click',()=>openModal('customer'));
  $('#modalClose')?.addEventListener('click',closeModal);
  $('#modal')?.addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
  $('#entityForm')?.addEventListener('submit',saveModal);
  $('#syncBtn')?.addEventListener('click',syncNow);
  $('#telegramLinkBtn')?.addEventListener('click',handleTelegramLink);
  $$('.navbtn').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
}

async function handleLogin(e){
  e.preventDefault();const fd=new FormData(e.currentTarget);const msg=$('#loginMsg');msg.textContent='Accesso…';
  try{await login({identifier:String(fd.get('identifier')||''),password:String(fd.get('password')||''),dealerSlug:String(fd.get('dealer')||'malu23')});msg.textContent='';await enterApp()}
  catch(err){msg.textContent=err.message==='backend_not_configured'?'Backend non ancora collegato. Usa “Entra demo”.':`Accesso non riuscito: ${err.message}`}
}

async function enterApp(){
  $('#loginScreen').hidden=true;$('#appShell').hidden=false;
  const dealer=sessionDealer();state.dealerId=dealer.id||'demo-malu23';state.dealerName=dealer.display_name||'MALÙ23 CARS';
  $('#dealerName').textContent=state.dealerName;$('#dealerBadge').textContent=state.dealerName.trim().slice(0,1).toUpperCase();
  syncEngine=new SyncEngine({dealerId:state.dealerId,getAccessToken:accessToken,sendMutation,onStatus:s=>{state.syncState=s;renderConnectivity()}});
  state.data=await cachedTenantData(state.dealerId);
  if(!state.data.vehicles.length)state.data=await fetchTenantData(state.dealerId);
  renderAll();renderConnectivity();renderInstall();
  if(navigator.onLine)refreshFromServer();
}

async function refreshFromServer(){
  try{state.data=await fetchTenantData(state.dealerId);renderAll();await syncNow()}
  catch(err){console.warn('refresh offline/fallito',err);renderConnectivity()}
}

function showLogin(){
  $('#appShell').hidden=true;$('#loginScreen').hidden=false;
  const demo=$('#demoBtn');demo.onclick=async()=>{await login({identifier:'admin',password:'demo',dealerSlug:'malu23'});await enterApp()};
}

function go(view){state.view=view;$$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===view));$$('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#pageTitle').textContent=({today:'OGGI',garage:'GARAGE',clients:'CLIENTI',inbox:'INBOX',admin:'ADMIN'})[view]||view.toUpperCase();window.scrollTo({top:0,behavior:'smooth'})}

function renderAll(){renderToday();renderGarage();renderClients();renderInbox();renderAdmin()}

function renderToday(){
  const v=state.data.vehicles,c=state.data.customers;
  const delivery=v.filter(x=>x.status==='DA_CONSEGNARE').length;
  const callbacks=c.filter(x=>x.next_contact_at&&new Date(x.next_contact_at)<=new Date(Date.now()+86400000)).length;
  const published=v.filter(x=>x.status==='IN_VENDITA').length;
  $('#todayStats').innerHTML=`<div><span>PARCO</span><b>${v.length}</b></div><div><span>IN VENDITA</span><b>${published}</b></div><div><span>RICHIAMI</span><b>${callbacks}</b></div><div><span>CONSEGNE</span><b>${delivery}</b></div>`;
  let priority='Nessuna urgenza';let sub='La giornata è sotto controllo.';let target='garage';
  if(callbacks){priority=`${callbacks} ${callbacks===1?'cliente':'clienti'} da richiamare`;sub='Parti dai contatti con prossimo passo in scadenza.';target='clients'}else if(delivery){priority=`${delivery} ${delivery===1?'consegna':'consegne'} da preparare`;sub='Controlla documenti e checklist veicolo.'}
  $('#priorityTitle').textContent=priority;$('#prioritySub').textContent=sub;$('#priorityBtn').onclick=()=>go(target);
  const latest=[...state.data.events].sort((a,b)=>String(b.happened_at).localeCompare(String(a.happened_at))).slice(0,5);
  $('#activityList').innerHTML=latest.length?latest.map(e=>`<div class="row"><div><strong>${esc(e.title)}</strong><small>${dateTime(e.happened_at)}</small></div><span class="tag">${esc(e.event_type||'EVENTO')}</span></div>`).join(''):'<div class="empty">Nessuna attività ancora.</div>';
}

function vehicleCost(id){return state.data.costs.filter(c=>c.vehicle_id===id).reduce((a,b)=>a+Number(b.amount||0),0)}
function vehicleEvents(id){return state.data.events.filter(e=>e.vehicle_id===id).sort((a,b)=>String(b.happened_at).localeCompare(String(a.happened_at))).slice(0,3)}

function renderGarage(){
  const list=$('#vehicleGrid');const rows=state.data.vehicles.filter(v=>!v.deleted_at);
  list.innerHTML=rows.length?rows.map(v=>{
    const extra=vehicleCost(v.id),events=vehicleEvents(v.id),sale=Number(v.sale_price||v.asking_price||0);
    return `<article class="vehicle-card"><div class="vehicle-top"><div><small>${esc(v.plate||'SENZA TARGA')}</small><h3>${esc(v.brand)} ${esc(v.model)}</h3><p>${esc(v.year||'—')} · ${Number(v.mileage||0).toLocaleString('it-IT')} km</p></div><span class="tag">${esc(statusLabel(v.status))}</span></div><div class="metrics"><div><span>SPESE</span><b>${money(extra)}</b></div><div><span>PREZZO</span><b>${money(sale)}</b></div><div><span>EVENTI</span><b>${events.length}</b></div></div><div class="timeline">${events.length?events.map(e=>`<div>${dateTime(e.happened_at)} · ${esc(e.title)}</div>`).join(''):'<div>Nessun evento registrato</div>'}</div><button class="textbtn" data-vehicle-event="${esc(v.id)}">＋ Aggiungi evento</button></article>`
  }).join(''):'<div class="empty">Nessuna auto. Puoi aggiungerne una anche offline.</div>';
  $$('[data-vehicle-event]').forEach(b=>b.onclick=()=>addVehicleEvent(b.dataset.vehicleEvent));
}

function renderClients(){
  const rows=state.data.customers.filter(c=>!c.deleted_at).sort((a,b)=>String(a.next_contact_at||'9999').localeCompare(String(b.next_contact_at||'9999')));
  $('#clientList').innerHTML=rows.length?rows.map(c=>`<div class="row"><div><strong>${esc(c.first_name)} ${esc(c.last_name)}</strong><small>${esc(c.next_step||'Nessun prossimo passo')} · ${dateTime(c.next_contact_at)}</small></div><span class="tag">${esc(c.status||'LEAD')}</span></div>`).join(''):'<div class="empty">Nessun cliente.</div>';
}

function renderInbox(){
  $('#inboxList').innerHTML='<div class="empty"><b>Inbox locale pronta.</b><br>Il prossimo step collegherà foto/PDF a R2. I documenti privati resteranno disponibili offline solo se l’utente li ha esplicitamente scaricati sul dispositivo.</div>';
}

function renderAdmin(){
  const s=Session.get();$('#adminInfo').innerHTML=`<div class="row"><div><strong>${esc(s?.profile?.display_name||'Admin')}</strong><small>${esc(s?.user?.email||'modalità demo')}</small></div><span class="tag">${esc(s?.profile?.role||'ADMIN')}</span></div>`;
  $('#backendMode').textContent=(window.DEALER_CONFIG?.demoMode?'DEMO LOCALE':'SUPABASE');
}

async function renderConnectivity(){
  const count=state.dealerId?await mutationCount(state.dealerId):0;const online=navigator.onLine;
  const badge=$('#networkBadge');badge.className=`network ${online?'online':'offline'}`;badge.innerHTML=`<i></i>${online?'ONLINE':'OFFLINE'}`;
  $('#queueCount').textContent=String(count);$('#syncState').textContent=state.syncState==='syncing'?'Sincronizzazione…':count?`${count} modifiche da inviare`:(online?'Tutto sincronizzato':'Lavoro locale attivo');
  $('#syncBtn').disabled=!online||!count||state.syncState==='syncing';
}

async function syncNow(){
  if(!syncEngine)return;const result=await syncEngine.sync();if(result.synced){state.data=await cachedTenantData(state.dealerId);renderAll()}renderConnectivity();return result
}

function openModal(type){
  $('#modal').hidden=false;$('#entityType').value=type;$('#modalTitle').textContent=type==='vehicle'?'Nuova auto':'Nuovo cliente';
  $('#vehicleFields').hidden=type!=='vehicle';$('#customerFields').hidden=type!=='customer';$('#entityForm').reset();$('#entityType').value=type;
}
function closeModal(){$('#modal').hidden=true}

async function saveModal(e){
  e.preventDefault();const fd=new FormData(e.currentTarget),type=fd.get('entityType');
  if(type==='vehicle'){
    const row=await saveOfflineEntity('vehicles',state.dealerId,{brand:String(fd.get('brand')||'').trim(),model:String(fd.get('model')||'').trim(),plate:String(fd.get('plate')||'').trim().toUpperCase(),year:Number(fd.get('year')||0)||null,mileage:Number(fd.get('mileage')||0)||0,status:'IN_ARRIVO'});
    state.data.vehicles.push(row);
    const event=await saveOfflineEntity('vehicle_events',state.dealerId,{vehicle_id:row.id,event_type:'CREATED',title:'Auto inserita',happened_at:new Date().toISOString()});state.data.events.unshift(event);
  }else{
    const row=await saveOfflineEntity('customers',state.dealerId,{first_name:String(fd.get('first_name')||'').trim(),last_name:String(fd.get('last_name')||'').trim(),phone:String(fd.get('phone')||'').trim(),next_step:'Nuovo contatto',status:'LEAD'});state.data.customers.push(row);
  }
  closeModal();renderAll();renderConnectivity();if(navigator.onLine)syncNow();
}

async function addVehicleEvent(vehicleId){
  const title=prompt('Cosa è successo a questa auto?');if(!title)return;
  const row=await saveOfflineEntity('vehicle_events',state.dealerId,{vehicle_id:vehicleId,event_type:'NOTE',title:title.trim(),happened_at:new Date().toISOString()});state.data.events.unshift(row);renderAll();renderConnectivity();if(navigator.onLine)syncNow();
}

function initTelegram(){
  const tg=window.Telegram?.WebApp;if(!tg?.initData)return;
  state.telegram=tg;document.documentElement.classList.add('telegram');tg.ready();tg.expand();
  try{tg.setHeaderColor('#0b1220');tg.setBackgroundColor('#f4f5f7')}catch{}
  $('#telegramBanner').hidden=false;$('#telegramBanner').textContent='Telegram Mini App rilevata · identità da validare';
  const cfg=window.DEALER_CONFIG||{};if(cfg.workerUrl)validateTelegram(tg.initData).then(r=>{$('#telegramBanner').textContent=r.ok?'Telegram verificato ✓':'Telegram non verificato'}).catch(()=>{$('#telegramBanner').textContent='Telegram: validazione non disponibile'});
}

async function handleTelegramLink(){
  const tg=window.Telegram?.WebApp;if(!tg?.initData){alert('Apri questa app dal bot Telegram per collegare l’account.');return}
  try{await linkTelegram(tg.initData);alert('Account Telegram collegato.');$('#telegramLinkBtn').textContent='Telegram collegato ✓'}catch(err){alert(`Collegamento non completato: ${err.message}`)}
}

async function installApp(){
  if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;renderInstall();return}
  alert('Su iPhone: Condividi → Aggiungi alla schermata Home. Su Chrome desktop: usa “Installa app” nella barra indirizzi.');
}
function renderInstall(){const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;$('#installBtn').hidden=!!standalone}

boot();
