const DB_NAME='dealer-platform-local';
const DB_VERSION=7;
const STORES=['meta','vehicles','vehicle_financials','vehicle_costs','vehicle_events','vehicle_work_items','vehicle_media','documents','document_blobs','customers','customer_interactions','customer_vehicle_interests','calendar_events','contracts','contract_versions','mutations'];

function openDb(){
  return new Promise((resolve,reject)=>{
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
          if(['vehicle_financials','vehicle_costs','vehicle_events','vehicle_work_items','vehicle_media','documents','contracts'].includes(name))store.createIndex('vehicle_id','vehicle_id',{unique:false});
          if(['customer_interactions','customer_vehicle_interests','contracts'].includes(name))store.createIndex('customer_id','customer_id',{unique:false});
          if(name==='calendar_events'){
            store.createIndex('starts_at','starts_at',{unique:false});
            store.createIndex('customer_id','customer_id',{unique:false});
            store.createIndex('vehicle_id','vehicle_id',{unique:false});
          }
          if(name==='document_blobs')store.createIndex('document_id','document_id',{unique:true});
          if(name==='contract_versions')store.createIndex('contract_id','contract_id',{unique:false});
        }
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

function reqToPromise(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}

export const OfflineDB={
  async put(storeName,value){const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(storeName,'readwrite');t.objectStore(storeName).put(value);t.oncomplete=()=>resolve(value);t.onerror=()=>reject(t.error)})},
  async bulkPut(storeName,values){const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(storeName,'readwrite'),store=t.objectStore(storeName);values.forEach(v=>store.put(v));t.oncomplete=()=>resolve(values.length);t.onerror=()=>reject(t.error)})},
  async get(storeName,id){const db=await openDb();return reqToPromise(db.transaction(storeName,'readonly').objectStore(storeName).get(id))},
  async list(storeName,dealerId){const db=await openDb(),store=db.transaction(storeName,'readonly').objectStore(storeName);if(dealerId&&store.indexNames.contains('dealer_id'))return reqToPromise(store.index('dealer_id').getAll(dealerId));return reqToPromise(store.getAll())},
  async listByVehicle(storeName,vehicleId){const db=await openDb(),store=db.transaction(storeName,'readonly').objectStore(storeName);if(store.indexNames.contains('vehicle_id'))return reqToPromise(store.index('vehicle_id').getAll(vehicleId));return (await reqToPromise(store.getAll())).filter(r=>r.vehicle_id===vehicleId)},
  async listByCustomer(storeName,customerId){const db=await openDb(),store=db.transaction(storeName,'readonly').objectStore(storeName);if(store.indexNames.contains('customer_id'))return reqToPromise(store.index('customer_id').getAll(customerId));return (await reqToPromise(store.getAll())).filter(r=>r.customer_id===customerId)},
  async remove(storeName,id){const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(storeName,'readwrite');t.objectStore(storeName).delete(id);t.oncomplete=()=>resolve(true);t.onerror=()=>reject(t.error)})},
  async setMeta(key,value){return this.put('meta',{key,value,updated_at:new Date().toISOString()})},
  async getMeta(key){const row=await this.get('meta',key);return row?.value},
  async clearTenant(dealerId){const db=await openDb();for(const name of STORES.filter(s=>!['meta','mutations'].includes(s))){await new Promise((resolve,reject)=>{const t=db.transaction(name,'readwrite'),store=t.objectStore(name),idx=store.index('dealer_id'),req=idx.openCursor(IDBKeyRange.only(dealerId));req.onsuccess=()=>{const c=req.result;if(c){c.delete();c.continue()}};t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error)})}}
};

export function uuid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
export async function queueMutation({dealer_id,entity,method,row,record_id}){const mutation={id:uuid(),dealer_id,entity,method,record_id:record_id||row?.id||null,row:row||null,status:'PENDING',attempts:0,created_at:new Date().toISOString(),last_error:null};await OfflineDB.put('mutations',mutation);window.dispatchEvent(new CustomEvent('dealer:queue-changed'));return mutation}
export async function pendingMutations(dealerId){const all=await OfflineDB.list('mutations',dealerId);return all.filter(m=>m.status==='PENDING'||m.status==='FAILED').sort((a,b)=>a.created_at.localeCompare(b.created_at))}
export async function mutationCount(dealerId){return (await pendingMutations(dealerId)).length}
export async function markMutation(id,patch){const current=await OfflineDB.get('mutations',id);if(!current)return;await OfflineDB.put('mutations',{...current,...patch});window.dispatchEvent(new CustomEvent('dealer:queue-changed'))}
export async function pruneDoneMutations(maxAgeMs=86400000){const all=await OfflineDB.list('mutations'),cutoff=Date.now()-maxAgeMs;for(const m of all){if(m.status==='DONE'&&new Date(m.updated_at||m.created_at).getTime()<cutoff)await OfflineDB.remove('mutations',m.id)}}

export class SyncEngine{
  constructor({dealerId,getAccessToken,sendMutation,onStatus}){this.dealerId=dealerId;this.getAccessToken=getAccessToken;this.sendMutation=sendMutation;this.onStatus=onStatus||(()=>{});this.running=false}
  async sync(){if(this.running||!navigator.onLine)return {synced:0,remaining:await mutationCount(this.dealerId)};this.running=true;this.onStatus('syncing');let synced=0;try{const queue=await pendingMutations(this.dealerId);for(const m of queue){try{await markMutation(m.id,{status:'SYNCING',attempts:(m.attempts||0)+1,updated_at:new Date().toISOString()});const token=await this.getAccessToken();await this.sendMutation(m,token);await markMutation(m.id,{status:'DONE',last_error:null,updated_at:new Date().toISOString()});synced++}catch(err){await markMutation(m.id,{status:'FAILED',last_error:String(err?.message||err),updated_at:new Date().toISOString()});if(!navigator.onLine)break}}await pruneDoneMutations();const remaining=await mutationCount(this.dealerId);this.onStatus(remaining?'pending':'idle');return {synced,remaining}}finally{this.running=false}}
}

window.addEventListener('online',()=>window.dispatchEvent(new CustomEvent('dealer:online')));
window.addEventListener('offline',()=>window.dispatchEvent(new CustomEvent('dealer:offline')));
