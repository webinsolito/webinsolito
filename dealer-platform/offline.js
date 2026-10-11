import {assessSyncConflict} from './sync-conflict.js?v=1.9.5';

const DB_NAME='dealer-platform-local';
const DB_VERSION=8;
const STORES=['meta','vehicles','vehicle_financials','vehicle_costs','vehicle_events','vehicle_work_items','vehicle_media','documents','document_blobs','customers','customer_interactions','customer_vehicle_interests','calendar_events','contracts','contract_versions','invoices','mutations'];
const FINANCIAL_STORES=new Set(['vehicle_financials','vehicle_costs','invoices']);
const FINANCIAL_ENTITIES=FINANCIAL_STORES;
const SERVER_SYNC_ENTITIES=new Set(['vehicles','vehicle_financials','vehicle_costs','vehicle_events','vehicle_work_items','vehicle_media','documents','customers','customer_interactions','customer_vehicle_interests','calendar_events','contracts','contract_versions','invoices']);

function currentSession(){try{return JSON.parse(localStorage.getItem('dealer-platform-session')||'null')}catch{return null}}
function canAccessFinancialData(){
  const p=currentSession()?.profile||{};
  if(p.role==='VENDITORE')return false;
  return ['ADMIN','AMMINISTRAZIONE'].includes(p.role)||p.permissions?.finance_view===true||p.permissions?.view_costs===true||p.permissions?.invoices_view===true;
}
function canReadStore(storeName){return !FINANCIAL_STORES.has(storeName)||canAccessFinancialData()}
function assertWriteStore(storeName){if(FINANCIAL_STORES.has(storeName)&&!canAccessFinancialData())throw new Error('financial_store_forbidden')}
function syncBaseKey(storeName,dealerId,id){return `syncbase:${dealerId}:${storeName}:${id}`}

let dbPromise=null;
function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      for(const name of STORES){
        if(!db.objectStoreNames.contains(name)){
          const opts=name==='meta'?{keyPath:'key'}:{keyPath:'id'};
          const store=db.createObjectStore(name,opts);
          if(name!=='meta')store.createIndex('dealer_id','dealer_id',{unique:false});
          if(name==='mutations'){
            store.createIndex('status','status',{unique:false});
            store.createIndex('created_at','created_at',{unique:false});
          }
          if(['vehicle_financials','vehicle_costs','vehicle_events','vehicle_work_items','vehicle_media','documents','contracts','invoices'].includes(name))store.createIndex('vehicle_id','vehicle_id',{unique:false});
          if(['customer_interactions','customer_vehicle_interests','contracts','invoices'].includes(name))store.createIndex('customer_id','customer_id',{unique:false});
          if(name==='calendar_events'){
            store.createIndex('starts_at','starts_at',{unique:false});
            store.createIndex('customer_id','customer_id',{unique:false});
            store.createIndex('vehicle_id','vehicle_id',{unique:false});
          }
          if(name==='document_blobs')store.createIndex('document_id','document_id',{unique:true});
          if(name==='contract_versions')store.createIndex('contract_id','contract_id',{unique:false});
          if(name==='invoices'){
            store.createIndex('issue_date','issue_date',{unique:false});
            store.createIndex('payment_status','payment_status',{unique:false});
          }
        }
      }
    };
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null};resolve(db)};
    req.onerror=()=>{dbPromise=null;reject(req.error)};
  });
  return dbPromise;
}

function reqToPromise(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function writeSyncBases(storeName,values=[]){
  if(!SERVER_SYNC_ENTITIES.has(storeName))return;
  const rows=values.filter(v=>v?.id&&v?.dealer_id&&v?.updated_at);if(!rows.length)return;
  const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite'),store=t.objectStore('meta'),now=new Date().toISOString();for(const row of rows)store.put({key:syncBaseKey(storeName,row.dealer_id,row.id),value:row.updated_at,updated_at:now});t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error)});
}
async function clearSyncBases(dealerId){
  if(!dealerId)return;const prefix=`syncbase:${dealerId}:`,db=await openDb();
  return new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite'),store=t.objectStore('meta'),req=store.openCursor();req.onsuccess=()=>{const c=req.result;if(c){if(String(c.key).startsWith(prefix))c.delete();c.continue()}};t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error)});
}
async function purgeStoreForDealer(storeName,dealerId){
  if(!dealerId)return 0;
  const db=await openDb();let removed=0;
  return new Promise((resolve,reject)=>{
    const t=db.transaction(storeName,'readwrite'),store=t.objectStore(storeName);
    if(!store.indexNames.contains('dealer_id')){t.abort();resolve(0);return}
    const req=store.index('dealer_id').openCursor(IDBKeyRange.only(dealerId));
    req.onsuccess=()=>{const c=req.result;if(c){c.delete();removed++;c.continue()}};
    t.oncomplete=()=>resolve(removed);t.onerror=()=>reject(t.error);t.onabort=()=>resolve(removed);
  });
}
async function dealerIdsInStore(storeName){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const t=db.transaction(storeName,'readonly'),store=t.objectStore(storeName);
    if(!store.indexNames.contains('dealer_id')){resolve([]);return}
    const ids=[],req=store.index('dealer_id').openKeyCursor(null,'nextunique');
    req.onsuccess=()=>{const c=req.result;if(c){if(c.key!=null)ids.push(String(c.key));c.continue()}};
    t.oncomplete=()=>resolve(ids);t.onerror=()=>reject(t.error);
  });
}

export const OfflineDB={
  async put(storeName,value){assertWriteStore(storeName);const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(storeName,'readwrite');t.objectStore(storeName).put(value);t.oncomplete=()=>resolve(value);t.onerror=()=>reject(t.error)})},
  async bulkPut(storeName,values){assertWriteStore(storeName);const db=await openDb();const count=await new Promise((resolve,reject)=>{const t=db.transaction(storeName,'readwrite'),store=t.objectStore(storeName);values.forEach(v=>store.put(v));t.oncomplete=()=>resolve(values.length);t.onerror=()=>reject(t.error)});await writeSyncBases(storeName,values);return count},
  async get(storeName,id){if(!canReadStore(storeName))return null;const db=await openDb();return reqToPromise(db.transaction(storeName,'readonly').objectStore(storeName).get(id))},
  async list(storeName,dealerId){if(!canReadStore(storeName))return [];const db=await openDb(),store=db.transaction(storeName,'readonly').objectStore(storeName);if(dealerId&&store.indexNames.contains('dealer_id'))return reqToPromise(store.index('dealer_id').getAll(dealerId));return reqToPromise(store.getAll())},
  async listByVehicle(storeName,vehicleId){if(!canReadStore(storeName))return [];const db=await openDb(),store=db.transaction(storeName,'readonly').objectStore(storeName);if(store.indexNames.contains('vehicle_id'))return reqToPromise(store.index('vehicle_id').getAll(vehicleId));return (await reqToPromise(store.getAll())).filter(r=>r.vehicle_id===vehicleId)},
  async listByCustomer(storeName,customerId){if(!canReadStore(storeName))return [];const db=await openDb(),store=db.transaction(storeName,'readonly').objectStore(storeName);if(store.indexNames.contains('customer_id'))return reqToPromise(store.index('customer_id').getAll(customerId));return (await reqToPromise(store.getAll())).filter(r=>r.customer_id===customerId)},
  async remove(storeName,id){const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(storeName,'readwrite');t.objectStore(storeName).delete(id);t.oncomplete=()=>resolve(true);t.onerror=()=>reject(t.error)})},
  async purgeStoreForDealer(storeName,dealerId){return purgeStoreForDealer(storeName,dealerId)},
  async dealerIdsInStore(storeName){return dealerIdsInStore(storeName)},
  async setMeta(key,value){return this.put('meta',{key,value,updated_at:new Date().toISOString()})},
  async getMeta(key){const row=await this.get('meta',key);return row?.value},
  async clearTenant(dealerId){const db=await openDb();for(const name of STORES.filter(s=>!['meta','mutations'].includes(s))){await new Promise((resolve,reject)=>{const t=db.transaction(name,'readwrite'),store=t.objectStore(name),idx=store.index('dealer_id'),req=idx.openCursor(IDBKeyRange.only(dealerId));req.onsuccess=()=>{const c=req.result;if(c){c.delete();c.continue()}};t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error)})}await clearSyncBases(dealerId)}
};

export function uuid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
export async function queueMutation({dealer_id,entity,method,row,record_id}){if(FINANCIAL_ENTITIES.has(entity)&&!canAccessFinancialData())throw new Error('financial_mutation_forbidden');const id=record_id||row?.id||null,expected_updated_at=id?await OfflineDB.getMeta(syncBaseKey(entity,dealer_id,id)):null;const mutation={id:uuid(),dealer_id,entity,method,record_id:id,row:row||null,expected_updated_at:expected_updated_at||null,status:'PENDING',attempts:0,created_at:new Date().toISOString(),last_error:null,conflict_code:null,conflict_server_updated_at:null,server_row:null};await OfflineDB.put('mutations',mutation);window.dispatchEvent(new CustomEvent('dealer:queue-changed'));return mutation}
export async function pendingMutations(dealerId){const all=await OfflineDB.list('mutations',dealerId);return all.filter(m=>(m.status==='PENDING'||m.status==='FAILED')&&(canAccessFinancialData()||!FINANCIAL_ENTITIES.has(m.entity))).sort((a,b)=>a.created_at.localeCompare(b.created_at))}
export async function mutationIssues(dealerId){const all=await OfflineDB.list('mutations',dealerId);return all.filter(m=>['FAILED','CONFLICT'].includes(m.status)&&(canAccessFinancialData()||!FINANCIAL_ENTITIES.has(m.entity))).sort((a,b)=>a.created_at.localeCompare(b.created_at))}
export async function mutationCount(dealerId){return (await pendingMutations(dealerId)).length}
export async function conflictCount(dealerId){return (await mutationIssues(dealerId)).filter(m=>m.status==='CONFLICT').length}
export async function markMutation(id,patch){const current=await OfflineDB.get('mutations',id);if(!current)return;await OfflineDB.put('mutations',{...current,...patch});window.dispatchEvent(new CustomEvent('dealer:queue-changed'))}
export async function pruneDoneMutations(maxAgeMs=86400000){const all=await OfflineDB.list('mutations'),cutoff=Date.now()-maxAgeMs;for(const m of all){if(m.status==='DONE'&&new Date(m.updated_at||m.created_at).getTime()<cutoff)await OfflineDB.remove('mutations',m.id)}}
export async function retryFailedMutations(dealerId){for(const m of await mutationIssues(dealerId)){if(m.status==='FAILED')await markMutation(m.id,{status:'PENDING',last_error:null,updated_at:new Date().toISOString()})}}
export async function resolveConflictKeepLocal(id){const m=await OfflineDB.get('mutations',id);if(!m||m.status!=='CONFLICT')return false;await markMutation(id,{status:'PENDING',expected_updated_at:m.conflict_server_updated_at||null,last_error:null,conflict_code:null,conflict_server_updated_at:null,server_row:null,updated_at:new Date().toISOString()});return true}
export async function resolveConflictUseServer(id){const m=await OfflineDB.get('mutations',id);if(!m||m.status!=='CONFLICT')return false;if(m.server_row)await OfflineDB.put(m.entity,m.server_row);else if(m.record_id)await OfflineDB.remove(m.entity,m.record_id);if(m.record_id){if(m.server_row?.updated_at)await OfflineDB.setMeta(syncBaseKey(m.entity,m.dealer_id,m.record_id),m.server_row.updated_at);else await OfflineDB.remove('meta',syncBaseKey(m.entity,m.dealer_id,m.record_id))}await OfflineDB.remove('mutations',id);window.dispatchEvent(new CustomEvent('dealer:queue-changed'));window.dispatchEvent(new CustomEvent('dealer:data-updated'));return true}

async function serverSnapshot(mutation,token){
  const c=globalThis.DEALER_CONFIG||{};if(c.demoMode||!c.supabaseUrl||!c.supabasePublishableKey||!SERVER_SYNC_ENTITIES.has(mutation.entity)||!mutation.record_id)return null;
  const id=encodeURIComponent(mutation.record_id),dealer=encodeURIComponent(mutation.dealer_id),url=`${c.supabaseUrl}/rest/v1/${mutation.entity}?id=eq.${id}&dealer_id=eq.${dealer}&select=*`;
  const res=await fetch(url,{method:'GET',headers:{apikey:c.supabasePublishableKey,authorization:`Bearer ${token}`},cache:'no-store'});if(!res.ok)throw new Error(`sync_probe_http_${res.status}`);const rows=await res.json();return Array.isArray(rows)?rows[0]||null:null;
}
async function detectConflict(mutation,token){
  if(mutation.method!=='UPSERT'||!mutation.record_id)return null;const serverRow=await serverSnapshot(mutation,token),assessment=assessSyncConflict({expectedUpdatedAt:mutation.expected_updated_at,mutationCreatedAt:mutation.created_at,serverRow});if(!assessment.conflict)return null;const err=new Error(assessment.code);err.code=assessment.code;err.serverRow=serverRow;throw err;
}
async function markEntitySynced(mutation){if(!mutation.record_id||!mutation.row?.updated_at)return;await OfflineDB.setMeta(syncBaseKey(mutation.entity,mutation.dealer_id,mutation.record_id),mutation.row.updated_at)}

export class SyncEngine{
  constructor({dealerId,getAccessToken,sendMutation,onStatus}){this.dealerId=dealerId;this.getAccessToken=getAccessToken;this.sendMutation=sendMutation;this.onStatus=onStatus||(()=>{});this.running=false}
  async sync(){if(this.running||!navigator.onLine)return {synced:0,remaining:await mutationCount(this.dealerId),conflicts:await conflictCount(this.dealerId)};this.running=true;this.onStatus('syncing');let synced=0;try{const queue=await pendingMutations(this.dealerId);for(const m of queue){try{await markMutation(m.id,{status:'SYNCING',attempts:(m.attempts||0)+1,updated_at:new Date().toISOString()});const token=await this.getAccessToken();await detectConflict(m,token);await this.sendMutation(m,token);await markEntitySynced(m);await markMutation(m.id,{status:'DONE',last_error:null,conflict_code:null,conflict_server_updated_at:null,server_row:null,updated_at:new Date().toISOString()});synced++}catch(err){const conflict=String(err?.code||err?.message||'').startsWith('sync_conflict_');await markMutation(m.id,{status:conflict?'CONFLICT':'FAILED',last_error:String(err?.message||err),conflict_code:conflict?String(err.code||err.message):null,conflict_server_updated_at:conflict?err.serverRow?.updated_at||null:null,server_row:conflict?err.serverRow||null:null,updated_at:new Date().toISOString()});if(!navigator.onLine)break}}await pruneDoneMutations();const remaining=await mutationCount(this.dealerId),conflicts=await conflictCount(this.dealerId);this.onStatus(conflicts?'conflict':remaining?'pending':'idle');return {synced,remaining,conflicts}}finally{this.running=false}}
}

window.addEventListener('online',()=>window.dispatchEvent(new CustomEvent('dealer:online')));
window.addEventListener('offline',()=>window.dispatchEvent(new CustomEvent('dealer:offline')));
