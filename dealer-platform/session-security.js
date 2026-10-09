import {OfflineDB} from './offline.js';

const SESSION_KEY='dealer-platform-session';
const TENANT_STORES=['vehicles','vehicle_financials','vehicle_costs','vehicle_events','vehicle_work_items','vehicle_media','documents','document_blobs','customers','customer_interactions','customer_vehicle_interests','calendar_events','contracts','contract_versions','invoices','mutations'];
const FINANCIAL_STORES=['vehicle_financials','vehicle_costs','invoices'];
const FINANCIAL_ENTITIES=new Set(FINANCIAL_STORES);

function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function canSeeFinance(value=session()){
  const p=value?.profile||{};
  if(p.role==='VENDITORE')return false;
  return ['ADMIN','AMMINISTRAZIONE'].includes(p.role)||p.permissions?.finance_view===true||p.permissions?.view_costs===true||p.permissions?.invoices_view===true;
}
async function tenantIdsInCache(){const ids=new Set();for(const store of TENANT_STORES){try{for(const row of await OfflineDB.list(store)){if(row?.dealer_id)ids.add(String(row.dealer_id))}}catch{}}return [...ids]}
async function removeMutations(dealerId){try{for(const row of await OfflineDB.list('mutations',dealerId))await OfflineDB.remove('mutations',row.id)}catch{}}
async function purgeDealer(dealerId){if(!dealerId)return;await OfflineDB.clearTenant(dealerId);await removeMutations(dealerId);for(const key of [`last_sync:${dealerId}`,`last_backup:${dealerId}`]){try{await OfflineDB.remove('meta',key)}catch{}}}
async function purgeFinancialCache(dealerId){
  if(!dealerId)return;
  for(const store of FINANCIAL_STORES){try{for(const row of await OfflineDB.list(store,dealerId))await OfflineDB.remove(store,row.id)}catch{}}
  try{for(const row of await OfflineDB.list('mutations',dealerId)){if(FINANCIAL_ENTITIES.has(row?.entity))await OfflineDB.remove('mutations',row.id)}}catch{}
  window.dispatchEvent(new CustomEvent('dealer:financial-cache-purged'));
}
export async function purgeAllCachedTenants(){for(const dealerId of await tenantIdsInCache())await purgeDealer(dealerId)}
export {purgeFinancialCache,canSeeFinance};

let current=session();
let lastDealerId=current?.dealer?.id||null;
let lastUserId=current?.user?.id||null;
let lastCanSeeFinance=canSeeFinance(current);
let purging=Promise.resolve();
function queuePurge(task){purging=purging.then(task).catch(err=>console.warn('secure local purge failed',err));return purging}

// A logged-out browser must not retain readable tenant business data.
if(!current)queuePurge(purgeAllCachedTenants);
// A non-financial role must not inherit financial cache from a previous privileged session.
else if(!lastCanSeeFinance&&lastDealerId)queuePurge(()=>purgeFinancialCache(lastDealerId));

window.addEventListener('dealer:session',()=>{
  const next=session(),nextDealer=next?.dealer?.id||null,nextUser=next?.user?.id||null,nextCanSeeFinance=canSeeFinance(next);
  const logout=!next;
  const switched=!!lastDealerId&&!!nextDealer&&(lastDealerId!==nextDealer||lastUserId!==nextUser);
  const lostFinance=!!lastDealerId&&!!nextDealer&&lastDealerId===nextDealer&&lastUserId===nextUser&&lastCanSeeFinance&&!nextCanSeeFinance;
  const previousDealer=lastDealerId;
  if((logout||switched)&&previousDealer)queuePurge(()=>purgeDealer(previousDealer));
  else if(lostFinance&&previousDealer)queuePurge(()=>purgeFinancialCache(previousDealer));
  lastDealerId=nextDealer;lastUserId=nextUser;lastCanSeeFinance=nextCanSeeFinance;
});

// Best-effort cleanup for forced-password logout or storage cleared outside Session.clear().
window.addEventListener('pageshow',()=>{const value=session();if(!value)queuePurge(purgeAllCachedTenants);else if(!canSeeFinance(value)&&value?.dealer?.id)queuePurge(()=>purgeFinancialCache(value.dealer.id))});
