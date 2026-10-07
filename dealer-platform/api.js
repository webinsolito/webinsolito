import {OfflineDB,queueMutation,uuid} from './offline.js';

const cfg=()=>window.DEALER_CONFIG||{};
const jsonHeaders=(extra={})=>({'content-type':'application/json',...extra});

function assertConfigured(){
  const c=cfg();
  if(!c.supabaseUrl||!c.supabasePublishableKey)throw new Error('backend_not_configured');
  return c;
}

async function parse(res){
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok)throw new Error(data?.message||data?.error_description||data?.error||`http_${res.status}`);
  return data;
}

export const Session={
  key:'dealer-platform-session',
  get(){try{return JSON.parse(localStorage.getItem(this.key)||'null')}catch{return null}},
  set(value){if(value)localStorage.setItem(this.key,JSON.stringify(value));else localStorage.removeItem(this.key);window.dispatchEvent(new CustomEvent('dealer:session'))},
  clear(){this.set(null)},
  accessToken(){return this.get()?.access_token||null},
  refreshToken(){return this.get()?.refresh_token||null},
  expired(){const s=this.get();return !s?.expires_at||Date.now()/1000>s.expires_at-30}
};

async function authPassword(email,password){
  const c=assertConfigured();
  const res=await fetch(`${c.supabaseUrl}/auth/v1/token?grant_type=password`,{method:'POST',headers:jsonHeaders({apikey:c.supabasePublishableKey}),body:JSON.stringify({email,password})});
  const data=await parse(res);const session={...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)};Session.set(session);return session;
}

async function refresh(){
  const c=assertConfigured(),token=Session.refreshToken();if(!token)throw new Error('no_refresh_token');
  const res=await fetch(`${c.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:jsonHeaders({apikey:c.supabasePublishableKey}),body:JSON.stringify({refresh_token:token})});
  const data=await parse(res);const previous=Session.get()||{};const session={...previous,...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)};Session.set(session);return session;
}

export async function accessToken(){if(Session.expired())await refresh();return Session.accessToken()}

async function rest(path,{method='GET',body,token,prefer}={}){
  const c=assertConfigured();const jwt=token||await accessToken();
  const headers={apikey:c.supabasePublishableKey,authorization:`Bearer ${jwt}`};
  if(body!==undefined)Object.assign(headers,jsonHeaders());if(prefer)headers.Prefer=prefer;
  return parse(await fetch(`${c.supabaseUrl}/rest/v1/${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}));
}

async function hydrateEmailSession(session,dealerSlug){
  const slug=encodeURIComponent(dealerSlug||cfg().defaultDealerSlug||'malu23');
  const dealers=await rest(`dealers?slug=eq.${slug}&select=id,slug,display_name&limit=1`,{token:session.access_token});
  const dealer=dealers?.[0];if(!dealer)throw new Error('dealer_not_authorized');
  const memberships=await rest(`memberships?dealer_id=eq.${encodeURIComponent(dealer.id)}&select=user_id,username,role,permissions,status&limit=1`,{token:session.access_token});
  const member=memberships?.[0];if(!member||member.status!=='ACTIVE')throw new Error('membership_inactive');
  const profiles=await rest('profiles?select=display_name,force_password_change&limit=1',{token:session.access_token});
  const hydrated={...session,dealer,profile:{...(profiles?.[0]||{}),username:member.username,role:member.role,permissions:member.permissions}};Session.set(hydrated);return hydrated;
}

export async function login({identifier,password,dealerSlug}){
  const c=cfg();
  if(c.demoMode||!c.workerUrl){
    const demo={access_token:'demo',refresh_token:'demo',expires_at:Math.floor(Date.now()/1000)+86400,user:{id:'demo-admin',email:'admin@malu23.local'},dealer:{id:'demo-malu23',slug:'malu23',display_name:'MALÙ23 CARS'},profile:{display_name:'Admin',role:'ADMIN',username:'admin'}};Session.set(demo);return demo;
  }
  if(identifier.includes('@'))return hydrateEmailSession(await authPassword(identifier,password),dealerSlug);
  const res=await fetch(`${c.workerUrl}/auth/resolve-login`,{method:'POST',headers:jsonHeaders(),body:JSON.stringify({username:identifier,dealer_slug:dealerSlug||c.defaultDealerSlug,password})});
  const data=await parse(res);Session.set(data);return data;
}

export async function logout(){Session.clear()}

const DATA_STORES=['vehicles','vehicle_financials','vehicle_costs','vehicle_events','vehicle_work_items','vehicle_media','documents','customers'];

export async function fetchTenantData(dealerId){
  const c=cfg();
  if(c.demoMode||!c.supabaseUrl)return demoData(dealerId);
  const enc=encodeURIComponent(dealerId);
  const [vehicles,financials,costs,events,workItems,media,documents,customers]=await Promise.all([
    rest(`vehicles?dealer_id=eq.${enc}&deleted_at=is.null&select=*`),
    rest(`vehicle_financials?dealer_id=eq.${enc}&select=*`),
    rest(`vehicle_costs?dealer_id=eq.${enc}&select=*`),
    rest(`vehicle_events?dealer_id=eq.${enc}&select=*&order=happened_at.desc`),
    rest(`vehicle_work_items?dealer_id=eq.${enc}&select=*&order=created_at.desc`),
    rest(`vehicle_media?dealer_id=eq.${enc}&select=*&order=sort_order.asc,created_at.asc`),
    rest(`documents?dealer_id=eq.${enc}&deleted_at=is.null&select=*`),
    rest(`customers?dealer_id=eq.${enc}&deleted_at=is.null&select=*`)
  ]);
  const data={vehicles,financials,costs,events,workItems,media,documents,customers};
  await Promise.all([
    OfflineDB.bulkPut('vehicles',vehicles),OfflineDB.bulkPut('vehicle_financials',financials),OfflineDB.bulkPut('vehicle_costs',costs),OfflineDB.bulkPut('vehicle_events',events),
    OfflineDB.bulkPut('vehicle_work_items',workItems),OfflineDB.bulkPut('vehicle_media',media),OfflineDB.bulkPut('documents',documents),OfflineDB.bulkPut('customers',customers)
  ]);
  await OfflineDB.setMeta(`last_sync:${dealerId}`,new Date().toISOString());
  return data;
}

export async function cachedTenantData(dealerId){
  const rows=await Promise.all(DATA_STORES.map(s=>OfflineDB.list(s,dealerId)));
  return Object.fromEntries(DATA_STORES.map((s,i)=>[({vehicle_financials:'financials',vehicle_costs:'costs',vehicle_events:'events',vehicle_work_items:'workItems',vehicle_media:'media'}[s]||s),rows[i]]));
}

export async function saveOfflineEntity(entity,dealerId,row,method='UPSERT'){
  const id=row.id||uuid();const full={...row,id,dealer_id:dealerId,updated_at:new Date().toISOString()};
  await OfflineDB.put(entity,full);
  await queueMutation({dealer_id:dealerId,entity,method,row:full,record_id:id});
  return full;
}

export async function softDeleteEntity(entity,dealerId,id){
  const current=await OfflineDB.get(entity,id);if(!current)throw new Error('record_not_found');
  const row={...current,deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  await OfflineDB.put(entity,row);await queueMutation({dealer_id:dealerId,entity,method:'UPSERT',row,record_id:id});return row;
}

export async function sendMutation(mutation,token){
  const c=cfg();if(c.demoMode||!c.supabaseUrl){await new Promise(r=>setTimeout(r,80));return {demo:true}}
  if(!DATA_STORES.includes(mutation.entity))throw new Error('entity_not_allowed');
  if(mutation.method==='UPSERT')return rest(`${mutation.entity}?on_conflict=id`,{method:'POST',body:mutation.row,token,prefer:'resolution=merge-duplicates,return=representation'});
  if(mutation.method==='DELETE')return rest(`${mutation.entity}?id=eq.${encodeURIComponent(mutation.record_id)}`,{method:'DELETE',token,prefer:'return=minimal'});
  throw new Error('mutation_method_not_supported');
}

export async function validateTelegram(initData){
  const c=cfg();if(!c.workerUrl)throw new Error('worker_not_configured');
  return parse(await fetch(`${c.workerUrl}/telegram/validate`,{method:'POST',headers:jsonHeaders(),body:JSON.stringify({initData})}));
}

export async function linkTelegram(initData,dealerId){
  const c=cfg(),token=await accessToken();if(!c.workerUrl)throw new Error('worker_not_configured');
  dealerId=dealerId||Session.get()?.dealer?.id;
  if(!dealerId)throw new Error('dealer_required');
  return parse(await fetch(`${c.workerUrl}/telegram/link`,{method:'POST',headers:jsonHeaders({authorization:`Bearer ${token}`,'x-dealer-id':dealerId}),body:JSON.stringify({initData,dealer_id:dealerId})}));
}

function demoData(dealerId='demo-malu23'){
  const now=new Date().toISOString();
  const vehicles=[
    {id:'demo-v1',dealer_id:dealerId,brand:'Peugeot',model:'308',version:'1.6 BlueHDi',plate:'AB123CD',vin:'VF3DEMO308',year:2014,mileage:109000,status:'IN_VENDITA',asking_price:10900,purchase_date:'2026-09-18',created_at:'2026-09-18T09:00:00Z',updated_at:now},
    {id:'demo-v2',dealer_id:dealerId,brand:'Fiat',model:'500',version:'1.0 Hybrid',plate:'CD456EF',vin:'ZFADEMO500',year:2021,mileage:42000,status:'DA_CONSEGNARE',sale_price:12900,purchase_date:'2026-08-27',created_at:'2026-08-27T09:00:00Z',updated_at:now},
    {id:'demo-v3',dealer_id:dealerId,brand:'Volkswagen',model:'Golf 8',version:'2.0 TDI',plate:'EF789GH',vin:'WVWDEMOGOLF',year:2022,mileage:58000,status:'PRENOTATA',asking_price:21500,purchase_date:'2026-09-03',created_at:'2026-09-03T09:00:00Z',updated_at:now}
  ];
  const financials=[
    {id:'demo-f1',dealer_id:dealerId,vehicle_id:'demo-v1',purchase_price:7750,minimum_price:9900,vat_regime:'MARGINE',supplier:'Fornitore Demo',updated_at:now},
    {id:'demo-f2',dealer_id:dealerId,vehicle_id:'demo-v2',purchase_price:9150,minimum_price:11900,vat_regime:'MARGINE',supplier:'Fornitore Demo',updated_at:now},
    {id:'demo-f3',dealer_id:dealerId,vehicle_id:'demo-v3',purchase_price:16200,minimum_price:19900,vat_regime:'IVA_ESPOSTA',supplier:'Fornitore Demo',updated_at:now}
  ];
  const costs=[
    {id:'demo-cost1',dealer_id:dealerId,vehicle_id:'demo-v1',category:'CARROZZERIA',supplier:'Carrozzeria Demo',amount:380,occurred_on:'2026-10-05',note:'Paraurti posteriore',updated_at:now},
    {id:'demo-cost2',dealer_id:dealerId,vehicle_id:'demo-v1',category:'TAGLIANDO',amount:190,occurred_on:'2026-10-03',updated_at:now},
    {id:'demo-cost3',dealer_id:dealerId,vehicle_id:'demo-v2',category:'PREPARAZIONE',amount:600,occurred_on:'2026-09-20',updated_at:now}
  ];
  const events=[
    {id:'demo-e1',dealer_id:dealerId,vehicle_id:'demo-v1',event_type:'TEST_DRIVE',title:'Test drive Mario Rossi',happened_at:now,updated_at:now},
    {id:'demo-e2',dealer_id:dealerId,vehicle_id:'demo-v2',event_type:'SALE',title:'Saldo ricevuto',happened_at:'2026-10-06T12:00:00Z',updated_at:now}
  ];
  const workItems=[
    {id:'demo-w1',dealer_id:dealerId,vehicle_id:'demo-v1',title:'Lavaggio completo',category:'PREPARAZIONE',status:'TODO',due_date:'2026-10-08',priority:'NORMAL',updated_at:now},
    {id:'demo-w2',dealer_id:dealerId,vehicle_id:'demo-v2',title:'Controllo documenti consegna',category:'CONSEGNA',status:'TODO',due_date:'2026-10-08',priority:'HIGH',updated_at:now}
  ];
  const media=[];
  const documents=[];
  const customers=[{id:'demo-c1',dealer_id:dealerId,first_name:'Mario',last_name:'Rossi',phone:'',next_contact_at:new Date(Date.now()+3600000).toISOString(),next_step:'Richiamare per Peugeot 308',status:'LEAD'}];
  const data={vehicles,financials,costs,events,workItems,media,documents,customers};
  Promise.all([
    OfflineDB.bulkPut('vehicles',vehicles),OfflineDB.bulkPut('vehicle_financials',financials),OfflineDB.bulkPut('vehicle_costs',costs),OfflineDB.bulkPut('vehicle_events',events),
    OfflineDB.bulkPut('vehicle_work_items',workItems),OfflineDB.bulkPut('vehicle_media',media),OfflineDB.bulkPut('documents',documents),OfflineDB.bulkPut('customers',customers)
  ]).catch(()=>{});
  return data;
}
