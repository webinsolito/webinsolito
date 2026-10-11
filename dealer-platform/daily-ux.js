import {OfflineDB} from './offline.js';
import {Session} from './api.js';
import {buildTodayActions,garageGlance,clientGlance} from './daily-ux-core.js';

const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
const date=v=>v?new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit'}).format(new Date(v)):'—';
let snapshot={vehicles:[],customers:[],interactions:[],interests:[],contracts:[],workItems:[],calendarEvents:[],invoices:[]};
let refreshing=false,scheduled=false;

function dealerId(){return Session.get()?.dealer?.id||null}
function canViewFinance(){const p=Session.get()?.profile||{};if(p.role==='VENDITORE')return false;return ['ADMIN','AMMINISTRAZIONE'].includes(p.role)||p.permissions?.finance_view===true||p.permissions?.view_costs===true||p.permissions?.invoices_view===true}
function openView(view){const b=$(`.navbtn[data-view="${view}"]`);if(b)b.click()}
function openClient(id){openView('clients');if(!id)return;setTimeout(()=>document.querySelector(`#crmGrid [data-client-id="${CSS.escape(id)}"]`)?.click(),120)}
function openVehicle(id){if(id)window.dispatchEvent(new CustomEvent('dealer:open-vehicle',{detail:{id}}));else openView('garage')}
function normalizePhone(phone){return String(phone||'').replace(/[^0-9+]/g,'')}

function ensureStyle(){if($('#dailyUxStyle'))return;const s=document.createElement('style');s.id='dailyUxStyle';s.textContent=`
.m23-action-section{margin-top:22px}.m23-action-head{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:10px}.m23-action-head small{display:block;font-size:10px;letter-spacing:.7px;color:var(--muted);font-weight:950}.m23-action-head h2{margin:3px 0 0;font-size:18px}.m23-action-count{font-size:11px;color:var(--muted);font-weight:850}.m23-action-list{display:grid;gap:8px}.m23-action{display:grid;grid-template-columns:42px 1fr auto;gap:11px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:14px;padding:11px 12px}.m23-action-icon{width:42px;height:42px;border-radius:12px;background:#f1f3f6;display:grid;place-items:center;font-size:17px;font-weight:950}.m23-action b{display:block;font-size:12px}.m23-action span{display:block;font-size:11px;color:var(--muted);margin-top:3px}.m23-action button{min-height:44px;border:0;background:#111827;color:#fff;border-radius:10px;padding:0 13px;font-size:11px;font-weight:900}.m23-action-empty{background:#fff;border:1px dashed var(--line);border-radius:14px;padding:15px;font-size:12px;color:var(--muted)}
.dux-garage-glance{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.dux-pill{display:inline-flex;align-items:center;min-height:28px;padding:5px 8px;border-radius:999px;background:#f4f6f8;font-size:10px;font-weight:850;color:#364152}.dux-pill.delivery{background:#eef8f2;color:#236643}.dux-pill.customer{background:#eef5ff;color:#315c8e}.dux-garage-quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.dux-garage-quick button{min-height:40px;border:1px solid var(--line);background:#fff;border-radius:9px;padding:0 10px;font-size:10px;font-weight:900;color:#1f2937}
.dux-client-glance{margin-top:10px;border-top:1px solid var(--line);padding-top:9px;display:grid;gap:5px}.dux-client-glance strong{font-size:11px}.dux-client-glance span{font-size:10px;color:var(--muted)}.dux-client-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.dux-client-actions a,.dux-client-actions button{min-height:40px;display:inline-flex;align-items:center;text-decoration:none;border:1px solid var(--line);background:#fff;color:#1f2937;border-radius:9px;padding:0 10px;font-size:10px;font-weight:900}
@media(max-width:820px){.m23-action{grid-template-columns:40px 1fr}.m23-action button{grid-column:1/-1;width:100%}.m23-action b{font-size:13px}.m23-action span,.dux-pill,.dux-client-glance span{font-size:11px}.dux-garage-quick button,.dux-client-actions a,.dux-client-actions button{min-height:44px;font-size:11px}.vehicle-card .garage-actions select{min-height:44px!important;font-size:11px!important;max-width:100%!important}.vehicle-card .textbtn{min-height:44px!important;font-size:11px!important}.crm-card p{font-size:11px!important}.crm-card h3{font-size:14px!important}}
`;document.head.appendChild(s)}

function actionIcon(kind){return ({invoice:'€',callback:'↗',calendar:'◷',delivery:'✓',work:'!'})[kind]||'•'}
function renderToday(){
  const view=$('[data-view="today"]'),activity=$('#activityList');if(!view||!activity)return;
  let section=$('#m23TodayActionSection');if(!section){section=document.createElement('section');section.id='m23TodayActionSection';section.className='m23-action-section';const timeline=activity.previousElementSibling?.classList?.contains('section')?activity.previousElementSibling:null;(timeline||activity).before(section)}
  const actions=buildTodayActions(snapshot,new Date(),{includeFinance:canViewFinance(),limit:6});
  const sig=JSON.stringify(actions);if(section.dataset.dailyUxSig===sig)return;section.dataset.dailyUxSig=sig;
  section.innerHTML=`<div class="m23-action-head"><div><small>DA FARE OGGI</small><h2>Azioni pronte</h2></div><span class="m23-action-count">${actions.length}</span></div><div class="m23-action-list">${actions.length?actions.map((a,i)=>`<div class="m23-action" data-action-index="${i}"><div class="m23-action-icon">${actionIcon(a.kind)}</div><div><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div><button type="button">Apri →</button></div>`).join(''):'<div class="m23-action-empty">Nessuna azione urgente: puoi lavorare su stock e nuove opportunità.</div>'}</div>`;
  $$('[data-action-index]',section).forEach(row=>{const action=actions[Number(row.dataset.actionIndex)];row.querySelector('button').onclick=()=>{if(action.kind==='callback'&&action.customerId)openClient(action.customerId);else if(action.kind==='work'&&action.vehicleId)openVehicle(action.vehicleId);else openView(action.view)}});
}

function renderGarage(){
  for(const card of $$('[data-open-vehicle].vehicle-card')){
    const vehicle=snapshot.vehicles.find(v=>v.id===card.dataset.openVehicle);if(!vehicle)continue;
    const g=garageGlance(vehicle,snapshot);if(!g)continue;
    const sig=JSON.stringify(g);if(card.dataset.dailyUxSig===sig)continue;card.dataset.dailyUxSig=sig;
    let box=card.querySelector('.dux-garage-glance');if(!box){box=document.createElement('div');box.className='dux-garage-glance';card.querySelector('.stockline')?.after(box)}
    box.innerHTML=`<span class="dux-pill">Prezzo ${money(g.price)}</span>${g.customer?`<span class="dux-pill customer">Cliente: ${esc(g.customer)}</span>`:''}${g.deliveryAt?`<span class="dux-pill delivery">${g.delivered?'Consegnata':'Consegna'} ${date(g.deliveryAt)}</span>`:''}`;
    let quick=card.querySelector('.dux-garage-quick');if(!quick){quick=document.createElement('div');quick.className='dux-garage-quick';const actions=card.querySelector('.garage-actions');actions?.before(quick)}
    quick.innerHTML=`${g.customerId?'<button type="button" data-q="client">Cliente</button>':''}${g.contractId?'<button type="button" data-q="sale">Vendita</button>':''}<button type="button" data-q="docs">Documenti</button>`;
    quick.querySelector('[data-q="client"]')?.addEventListener('click',e=>{e.stopPropagation();openClient(g.customerId)});
    quick.querySelector('[data-q="sale"]')?.addEventListener('click',e=>{e.stopPropagation();openView('vendite')});
    quick.querySelector('[data-q="docs"]')?.addEventListener('click',e=>{e.stopPropagation();openView('documenti')});
  }
}

function renderClients(){
  for(const card of $$('#crmGrid [data-client-id]')){
    const customer=snapshot.customers.find(c=>c.id===card.dataset.clientId);if(!customer)continue;
    const g=clientGlance(customer,snapshot),sig=JSON.stringify(g);if(card.dataset.dailyUxClientSig===sig)continue;card.dataset.dailyUxClientSig=sig;
    let box=card.querySelector('.dux-client-glance');if(!box){box=document.createElement('div');box.className='dux-client-glance';card.appendChild(box)}
    box.innerHTML=`<strong>${esc(g.nextStep)}</strong><span>Ultimo: ${esc(g.lastContact)}</span><span>${esc(g.vehicle)}</span>`;
    let actions=card.querySelector('.dux-client-actions');if(!actions){actions=document.createElement('div');actions.className='dux-client-actions';card.appendChild(actions)}
    const phone=normalizePhone(g.phone),wa=phone.replace(/^\+/,'');actions.innerHTML=`${phone?`<a href="tel:${esc(phone)}" data-no-open>Chiama</a><a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" data-no-open>WhatsApp</a>`:''}${g.vehicleId?'<button type="button" data-q="vehicle" data-no-open>Auto</button>':''}`;
    actions.querySelector('[data-q="vehicle"]')?.addEventListener('click',e=>{e.stopPropagation();openVehicle(g.vehicleId)});
    actions.querySelectorAll('[data-no-open]').forEach(el=>el.addEventListener('click',e=>e.stopPropagation()));
  }
}

function patch(){ensureStyle();renderToday();renderGarage();renderClients()}
async function refresh(){
  if(refreshing)return;refreshing=true;try{const id=dealerId();if(!id)return;const finance=canViewFinance();const [vehicles,customers,interactions,interests,contracts,workItems,calendarEvents,invoices]=await Promise.all([
    OfflineDB.list('vehicles',id),OfflineDB.list('customers',id),OfflineDB.list('customer_interactions',id),OfflineDB.list('customer_vehicle_interests',id),OfflineDB.list('contracts',id),OfflineDB.list('vehicle_work_items',id),OfflineDB.list('calendar_events',id),finance?OfflineDB.list('invoices',id):Promise.resolve([])
  ]);snapshot={vehicles,customers,interactions,interests,contracts,workItems,calendarEvents,invoices};patch()}catch(err){console.warn('Daily UX non disponibile',err)}finally{refreshing=false}}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;refresh()},100)}

if(typeof document!=='undefined'){
  ensureStyle();document.addEventListener('click',e=>{if(e.target.closest?.('[data-no-open]'))e.stopPropagation()},true);
  new MutationObserver(()=>patch()).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('dealer:data-updated',schedule);window.addEventListener('dealer:queue-changed',schedule);window.addEventListener('dealer:session',schedule);window.addEventListener('online',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
}
