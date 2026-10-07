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

export async function fetchTenantData(dealerId){
  const c=cfg();
  if(c.demoMode||!c.supabaseUrl)return demoData(dealerId);
  const enc=encodeURIComponent(dealerId);
  const [vehicles,customers,costs,events]=await Promise.all([
    rest(`vehicles?dealer_id=eq.${enc}&deleted_at=is.null&select=*`),
    rest(`customers?dealer_id=eq.${enc}&deleted_at=is.null&select=*`),
    rest(`vehicle_costs?dealer_id=eq.${enc}&select=*`),
    rest(`vehicle_events?dealer_id=eq.${enc}&select=*&order=happened_at.desc`)
  ]);
  await Promise.all([OfflineDB.bulkPut('vehicles',vehicles),OfflineDB.bulkPut('customers',customers),OfflineDB.bulkPut('vehicle_costs',costs),OfflineDB.bulkPut('vehicle_events',events)]);
  await OfflineDB.setMeta(`last_sync:${dealerId}`,new Date().toISOString());
  return {vehicles,customers,costs,events};
}

export async function cachedTenantData(dealerId){
  const [vehicles,customers,costs,events]=await Promise.all(['vehicles','customers','vehicle_costs','vehicle_events'].map(s=>OfflineDB.list(s,dealerId)));
  return {vehicles,customers,costs,events};
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
  const c=cfg();if(c.demoMode||!c.supabaseUrl){await new Promise(r=>setTimeout(r,120));return {demo:true}}
  if(!['vehicles','customers','vehicle_costs','vehicle_events','documents'].includes(mutation.entity))throw new Error('entity_not_allowed');
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
  const vehicles=[
    {id:'demo-v1',dealer_id:dealerId,brand:'Peugeot',model:'308',plate:'AB123CD',year:2014,mileage:109000,status:'IN_VENDITA',asking_price:10900,updated_at:new Date().toISOString()},
    {id:'demo-v2',dealer_id:dealerId,brand:'Fiat',model:'500',plate:'CD456EF',year:2021,mileage:42000,status:'DA_CONSEGNARE',sale_price:12900,updated_at:new Date().toISOString()},
    {id:'demo-v3',dealer_id:dealerId,brand:'Volkswagen',model:'Golf 8',plate:'EF789GH',year:2022,mileage:58000,status:'PRENOTATA',asking_price:21500,updated_at:new Date().toISOString()}
  ];
  const customers=[{id:'demo-c1',dealer_id:dealerId,first_name:'Mario',last_name:'Rossi',phone:'',next_contact_at:new Date(Date.now()+3600000).toISOString(),next_step:'Richiamare per Peugeot 308',status:'LEAD'}];
  const costs=[{id:'demo-cost1',dealer_id:dealerId,vehicle_id:'demo-v1',category:'CARROZZERIA',amount:380,occurred_on:new Date().toISOString().slice(0,10)}];
  const events=[{id:'demo-e1',dealer_id:dealerId,vehicle_id:'demo-v1',event_type:'TEST_DRIVE',title:'Test drive Mario Rossi',happened_at:new Date().toISOString()}];
  Promise.all([OfflineDB.bulkPut('vehicles',vehicles),OfflineDB.bulkPut('customers',customers),OfflineDB.bulkPut('vehicle_costs',costs),OfflineDB.bulkPut('vehicle_events',events)]).catch(()=>{});
  return {vehicles,customers,costs,events};
}
