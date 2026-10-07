import {OfflineDB} from './offline.js';
import {Session,saveOfflineEntity} from './api.js';

const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate=d=>new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'2-digit',month:'short'}).format(d);
const fmtTime=d=>new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(d);
const fmtLong=d=>new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d);
const TYPES=['APPOINTMENT','CALLBACK','TEST_DRIVE','DELIVERY','PAYMENT','DOCUMENT','WORK','OTHER'];
const state={dealerId:null,events:[],customers:[],vehicles:[],workItems:[],mode:'week',cursor:new Date(),filter:'ALL'};

function dealerId(){return Session.get()?.dealer?.id||'demo-malu23'}
function labelType(v){return ({APPOINTMENT:'APPUNTAMENTO',CALLBACK:'RICHIAMO',TEST_DRIVE:'TEST DRIVE',DELIVERY:'CONSEGNA',PAYMENT:'PAGAMENTO',DOCUMENT:'DOCUMENTO',WORK:'LAVORO',OTHER:'ALTRO'})[v]||v}
function customerName(id){const c=state.customers.find(x=>x.id===id);return c?`${c.first_name||''} ${c.last_name||''}`.trim():''}
function vehicleName(id){const v=state.vehicles.find(x=>x.id===id);return v?`${v.brand||''} ${v.model||''}${v.plate?` · ${v.plate}`:''}`.trim():''}
function startOfDay(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function startOfWeek(d){const x=startOfDay(d),day=(x.getDay()+6)%7;return addDays(x,-day)}
function startOfMonth(d){const x=startOfDay(d);x.setDate(1);return x}
function endOfMonth(d){const x=startOfMonth(d);x.setMonth(x.getMonth()+1);return x}
function toLocalInput(iso){if(!iso)return'';const d=new Date(iso),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`}
function fromLocalInput(v){return v?new Date(v).toISOString():null}
function replace(row){const i=state.events.findIndex(x=>x.id===row.id);if(i>=0)state.events[i]=row;else state.events.unshift(row)}

function derivedEvents(){
  const callbacks=state.customers.filter(c=>!c.deleted_at&&c.next_contact_at).map(c=>({id:`callback:${c.id}`,virtual:true,event_type:'CALLBACK',title:c.next_step||`Richiamare ${customerName(c.id)}`,starts_at:c.next_contact_at,status:'OPEN',priority:'NORMAL',customer_id:c.id,source:'CRM'}));
  const works=state.workItems.filter(w=>!['DONE','CANCELLED'].includes(w.status)&&w.due_date).map(w=>({id:`work:${w.id}`,virtual:true,event_type:'WORK',title:w.title,starts_at:new Date(`${w.due_date}T09:00:00`).toISOString(),status:'OPEN',priority:w.priority||'NORMAL',vehicle_id:w.vehicle_id,source:'GARAGE'}));
  return [...callbacks,...works];
}
function allEvents(){return [...state.events.filter(e=>e.status!=='CANCELLED'),...derivedEvents()].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))}

async function load(){
  state.dealerId=dealerId();
  [state.events,state.customers,state.vehicles,state.workItems]=await Promise.all([
    OfflineDB.list('calendar_events',state.dealerId),OfflineDB.list('customers',state.dealerId),OfflineDB.list('vehicles',state.dealerId),OfflineDB.list('vehicle_work_items',state.dealerId)
  ]);
  render();
}

function inject(){
  if($('#calendarView'))return;
  const side=$('.side .nav'),mobile=$('.mobile-nav');
  const sideInbox=side?.querySelector('[data-view="inbox"]');
  const mobileInbox=mobile?.querySelector('[data-view="inbox"]');
  if(side){const b=document.createElement('button');b.className='navbtn';b.dataset.view='calendar';b.innerHTML='📅 &nbsp; Calendario';sideInbox?side.insertBefore(b,sideInbox):side.appendChild(b);b.onclick=openView}
  if(mobile){const b=document.createElement('button');b.className='navbtn';b.dataset.view='calendar';b.innerHTML='📅<small>CALEND.</small>';mobileInbox?mobile.insertBefore(b,mobileInbox):mobile.appendChild(b);b.onclick=openView}
  const inbox=$('.view[data-view="inbox"]');
  if(inbox){const section=document.createElement('section');section.className='view';section.dataset.view='calendar';section.id='calendarView';section.innerHTML='<div id="calendarApp"></div>';inbox.before(section)}
  const st=document.createElement('style');st.id='calendarV05Style';st.textContent=`
  .mobile-nav{grid-template-columns:repeat(6,1fr)!important}.cal-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.cal-head h2{margin:3px 0 0;font-size:19px}.cal-head small{font-size:8px;color:var(--muted);font-weight:900}.cal-actions{display:flex;gap:7px;flex-wrap:wrap}.cal-tabs,.cal-filter{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.cal-tabs button,.cal-filter button{border:1px solid var(--line);background:#fff;border-radius:10px;padding:8px 10px;font-size:8px;font-weight:900}.cal-tabs button.active,.cal-filter button.active{background:#111827;color:#fff;border-color:#111827}.cal-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.cal-kpis>div{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px}.cal-kpis span{display:block;font-size:7px;color:var(--muted);font-weight:900}.cal-kpis b{display:block;font-size:16px;margin-top:4px}.cal-agenda{display:grid;gap:8px}.cal-day{background:#fff;border:1px solid var(--line);border-radius:15px;padding:12px}.cal-day h3{font-size:10px;margin:0 0 8px}.cal-event{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px;border-radius:10px;background:#f6f7f9;margin-top:6px}.cal-event.overdue{outline:1px solid #e4a15d}.cal-event.done{opacity:.55}.cal-event strong{font-size:9px}.cal-event small{display:block;font-size:7px;color:var(--muted);margin-top:2px}.cal-event-actions{display:flex;gap:5px}.cal-event-actions button{border:0;border-radius:8px;padding:6px 7px;font-size:8px;font-weight:900}.cal-month{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.cal-cell{min-height:105px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:7px}.cal-cell.muted{opacity:.45}.cal-cell.today{border-color:#111827}.cal-cell>b{font-size:9px}.cal-dot{font-size:7px;padding:5px 6px;margin-top:5px;background:#f2f4f6;border-radius:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cal-overlay{position:fixed;inset:0;z-index:140;background:rgba(5,9,16,.58);display:grid;place-items:center;padding:18px}.cal-modal{width:min(620px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:20px;padding:18px}.cal-modal-head{display:flex;justify-content:space-between;align-items:center}.cal-modal-head h3{margin:0}.cal-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.cal-field{display:grid;gap:5px}.cal-field.wide{grid-column:1/-1}.cal-field label{font-size:7px;font-weight:950;color:var(--muted)}.cal-field input,.cal-field select,.cal-field textarea{border:1px solid var(--line);border-radius:10px;padding:9px 10px;font-size:10px;background:#fff}.cal-field textarea{min-height:70px}.cal-empty{font-size:8px;color:var(--muted);padding:8px 0}
  @media(max-width:820px){.cal-kpis{grid-template-columns:1fr 1fr}.cal-head{align-items:flex-start}.cal-form{grid-template-columns:1fr}.cal-field.wide{grid-column:auto}.cal-month{grid-template-columns:repeat(7,minmax(42px,1fr));overflow:auto}.cal-cell{min-height:85px;padding:5px}.cal-dot{font-size:6px}.cal-actions .btn{display:inline-block!important}}
  `;document.head.appendChild(st);
  document.body.addEventListener('click',e=>{if(e.target.matches('.cal-overlay'))closeModal()});
}

function openView(){
  $$('.view').forEach(v=>v.classList.toggle('active',v.id==='calendarView'));
  $$('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view==='calendar'));
  const t=$('#pageTitle');if(t)t.textContent='CALENDARIO';
  window.scrollTo({top:0,behavior:'smooth'});load().catch(console.warn);
}

function render(){
  const root=$('#calendarApp');if(!root)return;
  const events=allEvents(),now=new Date(),todayStart=startOfDay(now),todayEnd=addDays(todayStart,1),weekEnd=addDays(startOfWeek(now),7);
  const open=events.filter(e=>e.status!=='DONE'),today=open.filter(e=>{const d=new Date(e.starts_at);return d>=todayStart&&d<todayEnd}).length,overdue=open.filter(e=>new Date(e.starts_at)<now).length,week=open.filter(e=>{const d=new Date(e.starts_at);return d>=startOfWeek(now)&&d<weekEnd}).length;
  root.innerHTML=`<div class="cal-head"><div><small>AGENDA OPERATIVA</small><h2>${esc(titleRange())}</h2></div><div class="cal-actions"><button class="btn ghost" id="calPrev">←</button><button class="btn ghost" id="calToday">Oggi</button><button class="btn ghost" id="calNext">→</button><button class="btn" id="calNew">＋ Evento</button></div></div><div class="cal-kpis"><div><span>OGGI</span><b>${today}</b></div><div><span>SCADUTI</span><b>${overdue}</b></div><div><span>SETTIMANA</span><b>${week}</b></div><div><span>APERTO TOTALE</span><b>${open.length}</b></div></div><div class="cal-tabs"><button data-mode="day" class="${state.mode==='day'?'active':''}">Giorno</button><button data-mode="week" class="${state.mode==='week'?'active':''}">Settimana</button><button data-mode="month" class="${state.mode==='month'?'active':''}">Mese</button></div><div class="cal-filter"><button data-filter="ALL" class="${state.filter==='ALL'?'active':''}">Tutto</button>${TYPES.map(t=>`<button data-filter="${t}" class="${state.filter===t?'active':''}">${labelType(t)}</button>`).join('')}</div><div id="calBody"></div>`;
  $('#calPrev').onclick=()=>move(-1);$('#calNext').onclick=()=>move(1);$('#calToday').onclick=()=>{state.cursor=new Date();render()};$('#calNew').onclick=()=>openModal();$$('[data-mode]',root).forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;render()});$$('[data-filter]',root).forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;render()});renderBody();
}

function titleRange(){if(state.mode==='day')return fmtLong(state.cursor);if(state.mode==='week'){const s=startOfWeek(state.cursor),e=addDays(s,6);return `${fmtDate(s)} — ${fmtDate(e)}`}return new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(state.cursor)}
function move(dir){if(state.mode==='day')state.cursor=addDays(state.cursor,dir);else if(state.mode==='week')state.cursor=addDays(state.cursor,dir*7);else{const x=new Date(state.cursor);x.setMonth(x.getMonth()+dir);state.cursor=x}render()}
function filteredEvents(){return allEvents().filter(e=>state.filter==='ALL'||e.event_type===state.filter)}
function range(){if(state.mode==='day'){const s=startOfDay(state.cursor);return[s,addDays(s,1)]}if(state.mode==='week'){const s=startOfWeek(state.cursor);return[s,addDays(s,7)]}return[startOfMonth(state.cursor),endOfMonth(state.cursor)]}

function renderBody(){const body=$('#calBody');if(!body)return;if(state.mode==='month'){renderMonth(body);return}const [s,e]=range(),events=filteredEvents().filter(x=>{const d=new Date(x.starts_at);return d>=s&&d<e});const days=state.mode==='day'?[s]:Array.from({length:7},(_,i)=>addDays(s,i));body.className='cal-agenda';body.innerHTML=days.map(d=>{const ds=startOfDay(d),de=addDays(ds,1),items=events.filter(x=>{const t=new Date(x.starts_at);return t>=ds&&t<de});return `<section class="cal-day"><h3>${fmtLong(d)}</h3>${items.length?items.map(eventHtml).join(''):'<div class="cal-empty">Nessun impegno.</div>'}</section>`}).join('');bindEventButtons(body)}
function eventHtml(e){const d=new Date(e.starts_at),over=e.status!=='DONE'&&d<new Date(),who=[customerName(e.customer_id),vehicleName(e.vehicle_id)].filter(Boolean).join(' · ');return `<div class="cal-event ${over?'overdue':''} ${e.status==='DONE'?'done':''}"><div><strong>${fmtTime(d)} · ${esc(e.title)}</strong><small>${esc(labelType(e.event_type))}${who?` · ${esc(who)}`:''}${e.virtual?' · automatico':''}</small></div><div class="cal-event-actions">${e.virtual?`<button data-jump="${e.customer_id?'clients':'garage'}">Apri</button>`:`${e.status!=='DONE'?`<button data-done="${esc(e.id)}">✓</button>`:''}<button data-edit="${esc(e.id)}">Modifica</button>`}</div></div>`}
function bindEventButtons(root){$$('[data-done]',root).forEach(b=>b.onclick=()=>markDone(b.dataset.done));$$('[data-edit]',root).forEach(b=>b.onclick=()=>openModal(b.dataset.edit));$$('[data-jump]',root).forEach(b=>b.onclick=()=>document.querySelector(`.navbtn[data-view="${b.dataset.jump}"]`)?.click())}

function renderMonth(body){const first=startOfMonth(state.cursor),gridStart=startOfWeek(first),events=filteredEvents();body.className='cal-month';body.innerHTML=Array.from({length:42},(_,i)=>{const d=addDays(gridStart,i),ds=startOfDay(d),de=addDays(ds,1),items=events.filter(x=>{const t=new Date(x.starts_at);return t>=ds&&t<de}).slice(0,3),same=d.getMonth()===state.cursor.getMonth(),today=startOfDay(d).getTime()===startOfDay(new Date()).getTime();return `<div class="cal-cell ${same?'':'muted'} ${today?'today':''}"><b>${d.getDate()}</b>${items.map(x=>`<div class="cal-dot" title="${esc(x.title)}">${esc(fmtTime(new Date(x.starts_at)))} ${esc(x.title)}</div>`).join('')}${items.length>=3?'<div class="cal-dot">…</div>':''}</div>`}).join('')}

function openModal(id){
  const existing=id?state.events.find(x=>x.id===id):null,now=new Date(Date.now()+3600000);now.setMinutes(0,0,0);const start=existing?.starts_at||now.toISOString();
  const o=document.createElement('div');o.className='cal-overlay';o.id='calOverlay';o.innerHTML=`<div class="cal-modal"><div class="cal-modal-head"><h3>${existing?'Modifica evento':'Nuovo evento'}</h3><button class="x" id="calClose">×</button></div><form id="calForm" class="cal-form"><div class="cal-field"><label>TIPO</label><select name="event_type">${TYPES.map(t=>`<option value="${t}" ${existing?.event_type===t?'selected':''}>${labelType(t)}</option>`).join('')}</select></div><div class="cal-field"><label>PRIORITÀ</label><select name="priority"><option>NORMAL</option><option ${existing?.priority==='HIGH'?'selected':''}>HIGH</option><option ${existing?.priority==='LOW'?'selected':''}>LOW</option></select></div><div class="cal-field wide"><label>TITOLO</label><input name="title" required value="${esc(existing?.title||'')}"></div><div class="cal-field"><label>INIZIO</label><input name="starts_at" type="datetime-local" required value="${esc(toLocalInput(start))}"></div><div class="cal-field"><label>DURATA MINUTI</label><input name="duration" type="number" min="0" value="${existing?.ends_at?Math.max(0,Math.round((new Date(existing.ends_at)-new Date(existing.starts_at))/60000)):60}"></div><div class="cal-field"><label>CLIENTE</label><select name="customer_id"><option value="">—</option>${state.customers.filter(c=>!c.deleted_at).map(c=>`<option value="${esc(c.id)}" ${existing?.customer_id===c.id?'selected':''}>${esc(customerName(c.id))}</option>`).join('')}</select></div><div class="cal-field"><label>AUTO</label><select name="vehicle_id"><option value="">—</option>${state.vehicles.filter(v=>!v.deleted_at).map(v=>`<option value="${esc(v.id)}" ${existing?.vehicle_id===v.id?'selected':''}>${esc(vehicleName(v.id))}</option>`).join('')}</select></div><div class="cal-field"><label>PROMEMORIA</label><select name="reminder_minutes"><option value="0">Nessuno</option><option value="15" ${existing?.reminder_minutes===15?'selected':''}>15 min prima</option><option value="30" ${(!existing||existing?.reminder_minutes===30)?'selected':''}>30 min prima</option><option value="60" ${existing?.reminder_minutes===60?'selected':''}>1 ora prima</option><option value="1440" ${existing?.reminder_minutes===1440?'selected':''}>1 giorno prima</option></select></div><div class="cal-field"><label>STATO</label><select name="status"><option value="OPEN">APERTO</option><option value="DONE" ${existing?.status==='DONE'?'selected':''}>FATTO</option><option value="CANCELLED" ${existing?.status==='CANCELLED'?'selected':''}>ANNULLATO</option></select></div><div class="cal-field wide"><label>NOTE</label><textarea name="note">${esc(existing?.note||'')}</textarea></div><div class="cal-field wide"><button class="btn" type="submit">Salva evento</button></div></form></div>`;document.body.appendChild(o);$('#calClose').onclick=closeModal;$('#calForm').onsubmit=e=>saveEvent(e,existing)}
function closeModal(){$('#calOverlay')?.remove()}
async function saveEvent(e,existing){e.preventDefault();const fd=new FormData(e.currentTarget),starts=fromLocalInput(fd.get('starts_at')),duration=Number(fd.get('duration')||0),ends=duration?new Date(new Date(starts).getTime()+duration*60000).toISOString():null,row=await saveOfflineEntity('calendar_events',state.dealerId,{...(existing||{}),event_type:String(fd.get('event_type')),title:String(fd.get('title')||'').trim(),starts_at:starts,ends_at:ends,status:String(fd.get('status')||'OPEN'),priority:String(fd.get('priority')||'NORMAL'),customer_id:String(fd.get('customer_id')||'')||null,vehicle_id:String(fd.get('vehicle_id')||'')||null,reminder_minutes:Number(fd.get('reminder_minutes')||0),source:existing?.source||'MANUAL',note:String(fd.get('note')||'').trim()});replace(row);closeModal();render();if(navigator.onLine)window.dispatchEvent(new CustomEvent('dealer:online'))}
async function markDone(id){const e=state.events.find(x=>x.id===id);if(!e)return;replace(await saveOfflineEntity('calendar_events',state.dealerId,{...e,status:'DONE'}));render();if(navigator.onLine)window.dispatchEvent(new CustomEvent('dealer:online'))}

function init(){inject();window.addEventListener('dealer:session',()=>load().catch(()=>{}));window.addEventListener('dealer:queue-changed',()=>{if($('#calendarView')?.classList.contains('active'))load().catch(()=>{})});load().catch(()=>{})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
