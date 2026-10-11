import {OfflineDB} from './offline.js';
import {Session} from './api.js';

const ADVANCED_STATUSES=new Set(['IN_VENDITA','PRENOTATA','VENDUTA','DA_CONSEGNARE','CONSEGNATA']);
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const normText=v=>String(v??'').trim();
export const normalizePlate=v=>normText(v).replace(/\s+/g,'').toUpperCase();
export const normalizeVin=v=>normText(v).replace(/\s+/g,'').toUpperCase();
export const isValidVin=v=>!v||/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(v));
export const isAdvancedStatus=status=>ADVANCED_STATUSES.has(String(status||''));
export const hasVehiclePhoto=(media=[],vehicleId)=>Boolean(vehicleId&&(media||[]).some(x=>x&&!x.deleted_at&&x.vehicle_id===vehicleId&&String(x.kind||'PHOTO').toUpperCase()==='PHOTO'&&normText(x.object_key)));
export const requiresPhotoForAdvance=(previousStatus,nextStatus)=>isAdvancedStatus(nextStatus)&&!isAdvancedStatus(previousStatus);
export function findVehicleDuplicate(vehicles,{id=null,plate='',vin=''}){
  const p=normalizePlate(plate),v=normalizeVin(vin);
  return (vehicles||[]).find(row=>row&&!row.deleted_at&&row.id!==id&&((p&&normalizePlate(row.plate)===p)||(v&&normalizeVin(row.vin)===v)))||null;
}
export function vehiclePublishIssue({vehicle={},vehicles=[],media=[],previousStatus=null}={}){
  const plate=normalizePlate(vehicle.plate),vin=normalizeVin(vehicle.vin),status=String(vehicle.status||'IN_ARRIVO');
  if(vin&&!isValidVin(vin))return 'VIN non valido: servono 17 caratteri e non sono ammesse I, O o Q.';
  const dup=findVehicleDuplicate(vehicles,{id:vehicle.id,plate,vin});
  if(dup)return plate&&normalizePlate(dup.plate)===plate?'Targa già presente nel Garage.':'VIN già presente nel Garage.';
  if(isAdvancedStatus(status)){
    if(!plate)return 'Inserisci la targa prima di portare l’auto in vendita.';
    if(!vin)return 'Inserisci il VIN prima di portare l’auto in vendita.';
    if(requiresPhotoForAdvance(previousStatus,status)&&!hasVehiclePhoto(media,vehicle.id))return 'Aggiungi almeno una foto prima di portare l’auto in vendita.';
  }
  return '';
}
export function vehicleCostIssue({vehicleId,amount,category,vehicles=[]}={}){
  if(!vehicleId||!(vehicles||[]).some(v=>v.id===vehicleId&&!v.deleted_at))return 'Apri prima la scheda dell’auto corretta.';
  if(!(Number(amount)>0))return 'Inserisci un importo spesa maggiore di zero.';
  if(!normText(category))return 'Inserisci la categoria della spesa.';
  return '';
}

let snapshot={vehicles:[],media:[],contracts:[],customers:[],interactions:[],interests:[]};
let scheduled=false,running=false;
function dealerId(){return Session.get()?.dealer?.id||null}
function esc(v=''){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dateShort(v){if(!v)return '';try{return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit'}).format(new Date(v))}catch{return ''}}
function customerName(id){const c=snapshot.customers.find(x=>x.id===id);return c?`${c.first_name||''} ${c.last_name||''}`.trim():''}
function activeContract(vehicleId){return snapshot.contracts.filter(c=>c&&!c.deleted_at&&c.template_code==='VENDITA'&&c.vehicle_id===vehicleId&&c.sale_stage!=='CANCELLED').sort((a,b)=>String(b.updated_at||b.contract_date||'').localeCompare(String(a.updated_at||a.contract_date||'')))[0]||null}
function currentDrawerVehicle(){
  const form=$('#gdVehicleForm');
  const id=normText(form?.elements?.id?.value||form?.dataset?.vehicleId);
  if(id){const byId=snapshot.vehicles.find(v=>v.id===id);if(byId)return byId}
  const head=$('#garageDrawer .gd-head');if(!head)return null;
  const plate=normText(head.querySelector('small')?.textContent?.split('·')[0]);
  if(plate&&plate!=='SENZA TARGA'){const found=snapshot.vehicles.find(v=>normalizePlate(v.plate)===normalizePlate(plate));if(found)return found}
  const match=String(head.querySelector('p')?.textContent||'').match(/VIN\s+([A-Z0-9]+)/i);
  return match?snapshot.vehicles.find(v=>normalizeVin(v.vin)===normalizeVin(match[1]))||null:null;
}
function customerLastInteraction(id){return snapshot.interactions.filter(x=>x.customer_id===id).sort((a,b)=>String(b.happened_at||b.created_at||'').localeCompare(String(a.happened_at||a.created_at||'')))[0]||null}

function patchGarage(){
  const form=$('#gdVehicleForm'),current=currentDrawerVehicle();
  if(form){
    const plate=form.elements.plate,vin=form.elements.vin;
    if(plate&&!plate.dataset.oqNormBound){plate.dataset.oqNormBound='1';plate.autocapitalize='characters';plate.addEventListener('blur',()=>{plate.value=normalizePlate(plate.value)})}
    if(vin&&!vin.dataset.oqNormBound){vin.dataset.oqNormBound='1';vin.maxLength=17;vin.autocapitalize='characters';vin.placeholder='17 caratteri';vin.addEventListener('blur',()=>{vin.value=normalizeVin(vin.value)})}
  }
  const cost=$('#gdCostForm');
  if(cost&&current&&!cost.querySelector('.oq-cost-target')){
    const note=document.createElement('div');note.className='oq-cost-target';
    note.textContent=`Spesa su: ${current.brand||''} ${current.model||''} · ${current.plate||current.vin||'senza identificativo'}`;
    cost.prepend(note);
  }
  for(const card of $$('[data-open-vehicle].vehicle-card')){
    const vehicle=snapshot.vehicles.find(v=>v.id===card.dataset.openVehicle);if(!vehicle)continue;
    const contract=activeContract(vehicle.id),client=contract?customerName(contract.customer_id):'';
    let line=card.querySelector('.oq-garage-sale');
    if(!contract){line?.remove();continue}
    const delivery=contract.planned_delivery_at?` · consegna ${dateShort(contract.planned_delivery_at)}`:'';
    const sig=JSON.stringify([contract.id,client,delivery]);
    if(line?.dataset.oqSig===sig)continue;
    if(!line){line=document.createElement('div');line.className='oq-garage-sale';card.querySelector('.stockline')?.after(line)}
    line.dataset.oqSig=sig;
    line.innerHTML=`<span>${client?`Cliente: <b>${esc(client)}</b>`:'Vendita collegata'}${delivery}</span>`;
  }
}
function patchClients(){
  for(const card of $$('#crmGrid [data-client-id]')){
    const c=snapshot.customers.find(x=>x.id===card.dataset.clientId);if(!c)continue;
    const last=customerLastInteraction(c.id),interest=snapshot.interests.find(i=>i.customer_id===c.id);
    let box=card.querySelector('.oq-client-action');
    const next=normText(c.next_step)||'⚠ Prossima azione da definire';
    const lastText=last?`${last.type||last.channel||'Contatto'} · ${dateShort(last.happened_at||last.created_at)}`:'Nessun contatto registrato';
    const linked=interest?'Auto collegata':'⚠ Nessuna auto collegata';
    const sig=JSON.stringify([next,lastText,linked]);
    if(box?.dataset.oqSig===sig)continue;
    if(!box){box=document.createElement('div');box.className='oq-client-action';card.appendChild(box)}
    box.dataset.oqSig=sig;
    box.innerHTML=`<b>${esc(next)}</b><span>Ultimo: ${esc(lastText)} · ${esc(linked)}</span>`;
  }
}
function injectStyle(){if($('#operationalQualityStyle'))return;const s=document.createElement('style');s.id='operationalQualityStyle';s.textContent=`
.oq-cost-target{grid-column:1/-1;background:#eef5ff;border:1px solid #cfdef5;border-radius:9px;padding:8px 10px;font-size:10px;font-weight:850;color:#294d79}.oq-garage-sale{margin-top:8px;background:#f4f7fb;border-radius:9px;padding:7px 9px;font-size:10px;color:#4b5563}.oq-client-action{margin-top:10px;padding-top:9px;border-top:1px solid var(--line);display:grid;gap:3px}.oq-client-action b{font-size:11px}.oq-client-action span{font-size:10px;color:var(--muted)}
`;document.head.appendChild(s)}
function validateSubmit(e){
  const form=e.target;if(!(form instanceof HTMLFormElement))return;
  if(form.id==='gdVehicleForm'){
    const current=currentDrawerVehicle(),candidate={...(current||{}),plate:normalizePlate(form.elements.plate?.value),vin:normalizeVin(form.elements.vin?.value),status:String(form.elements.status?.value||current?.status||'IN_ARRIVO')};
    const issue=vehiclePublishIssue({vehicle:candidate,vehicles:snapshot.vehicles,media:snapshot.media,previousStatus:current?.status||null});
    if(issue){e.preventDefault();e.stopImmediatePropagation();alert(issue);return}
    if(form.elements.plate)form.elements.plate.value=candidate.plate;if(form.elements.vin)form.elements.vin.value=candidate.vin;
  }
  if(form.id==='entityForm'&&String(new FormData(form).get('entityType'))==='vehicle'){
    const fd=new FormData(form),candidate={id:null,plate:normalizePlate(fd.get('plate')),vin:normalizeVin(fd.get('vin')),status:String(fd.get('status')||'IN_ARRIVO')};
    const issue=vehiclePublishIssue({vehicle:candidate,vehicles:snapshot.vehicles,media:snapshot.media,previousStatus:null});
    if(issue){e.preventDefault();e.stopImmediatePropagation();alert(issue);return}
    if(form.elements.plate)form.elements.plate.value=candidate.plate;if(form.elements.vin)form.elements.vin.value=candidate.vin;
  }
  if(form.id==='gdCostForm'){
    const current=currentDrawerVehicle(),fd=new FormData(form),issue=vehicleCostIssue({vehicleId:current?.id,amount:fd.get('amount'),category:fd.get('category'),vehicles:snapshot.vehicles});
    if(issue){e.preventDefault();e.stopImmediatePropagation();alert(issue)}
  }
}
async function refresh(){if(running)return;running=true;try{const id=dealerId();if(!id)return;const [vehicles,media,contracts,customers,interactions,interests]=await Promise.all([
  OfflineDB.list('vehicles',id),OfflineDB.list('vehicle_media',id),OfflineDB.list('contracts',id),OfflineDB.list('customers',id),OfflineDB.list('customer_interactions',id),OfflineDB.list('customer_vehicle_interests',id)
]);snapshot={vehicles,media,contracts,customers,interactions,interests};patchGarage();patchClients()}catch(err){console.warn('Qualità operativa non disponibile',err)}finally{running=false}}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;refresh()},100)}
injectStyle();document.addEventListener('submit',validateSubmit,true);window.addEventListener('dealer:data-updated',schedule);window.addEventListener('dealer:queue-changed',schedule);window.addEventListener('online',schedule);new MutationObserver(()=>{patchGarage();patchClients();schedule()}).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
