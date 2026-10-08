import {OfflineDB} from './offline.js';

const SESSION_KEY='dealer-platform-session';
const TENANT_STORES=['vehicles','vehicle_financials','vehicle_costs','vehicle_events','vehicle_work_items','vehicle_media','documents','document_blobs','customers','customer_interactions','customer_vehicle_interests','calendar_events','contracts','contract_versions','invoices','mutations'];

function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
async function tenantIdsInCache(){const ids=new Set();for(const store of TENANT_STORES){try{for(const row of await OfflineDB.list(store)){if(row?.dealer_id)ids.add(String(row.dealer_id))}}catch{}}return [...ids]}
async function removeMutations(dealerId){try{for(const row of await OfflineDB.list('mutations',dealerId))await OfflineDB.remove('mutations',row.id)}catch{}}
async function purgeDealer(dealerId){if(!dealerId)return;await OfflineDB.clearTenant(dealerId);await removeMutations(dealerId);for(const key of [`last_sync:${dealerId}`,`last_backup:${dealerId}`]){try{await OfflineDB.remove('meta',key)}catch{}}}
export async function purgeAllCachedTenants(){for(const dealerId of await tenantIdsInCache())await purgeDealer(dealerId)}

let lastDealerId=session()?.dealer?.id||null;
let lastUserId=session()?.user?.id||null;
let purging=Promise.resolve();
function queuePurge(task){purging=purging.then(task).catch(err=>console.warn('secure local purge failed',err));return purging}

// A logged-out browser must not retain readable tenant business data.
if(!session())queuePurge(purgeAllCachedTenants);

window.addEventListener('dealer:session',()=>{
  const next=session(),nextDealer=next?.dealer?.id||null,nextUser=next?.user?.id||null;
  const logout=!next;
  const switched=!!lastDealerId&&!!nextDealer&&(lastDealerId!==nextDealer||lastUserId!==nextUser);
  const previousDealer=lastDealerId;
  if((logout||switched)&&previousDealer)queuePurge(()=>purgeDealer(previousDealer));
  lastDealerId=nextDealer;lastUserId=nextUser;
});

// Best-effort cleanup for forced-password logout or storage cleared outside Session.clear().
window.addEventListener('pageshow',()=>{if(!session())queuePurge(purgeAllCachedTenants)});
