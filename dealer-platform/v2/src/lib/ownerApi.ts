import {config} from './config'
import {getSession,setSession} from './api'
import type {AdminMember,Dealer,Profile,Role,SessionPayload} from '../types'

const BASE_SESSION_KEY='dealer-cockpit-owner-base-session'

export type OwnerDealer=Dealer&{
  vat_number?:string|null
  contact_email?:string|null
  phone?:string|null
  created_at?:string
  members:{total:number;active:number;admins:number}
}
export type OwnerRegistration={
  id:string;dealer_name:string;legal_name:string;vat_number?:string|null;city?:string|null;address?:string|null;phone?:string|null;owner_display_name:string;email:string;username:string;status:string;dealer_id?:string|null;created_at:string;approved_at?:string|null;rejected_at?:string|null;activated_at?:string|null
}
export type OwnerRenewal={
  id:string;dealer_id:string;requested_by:string;status:string;previous_expires_at:string;requested_at:string;approved_at?:string|null;rejected_at?:string|null;new_expires_at?:string|null
}
export type OwnerSupport={id:string;dealer_id:string;reason?:string|null;started_at:string;expires_at:string}
export type OwnerOverview={ok:true;owner:{label:string};dealers:OwnerDealer[];registrations:OwnerRegistration[];renewals:OwnerRenewal[];support_session:OwnerSupport|null}
export type OwnerDealerDetail={ok:true;dealer:OwnerDealer;members:AdminMember[];audit_logs:Array<{id:string;actor_user_id?:string;entity_type?:string;entity_id?:string|null;action?:string;created_at?:string}>;owner_user_id:string}
export type OwnerMe={ok:true;owner:{label:string};user_id:string}

async function parse<T>(res:Response):Promise<T>{
  const text=await res.text();let data:any=null
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok){
    const code=String(data?.error||data?.message||`http_${res.status}`)
    const friendly:Record<string,string>={
      owner_required:'Questo account non è abilitato come proprietario.',
      unauthorized:'Sessione scaduta. Accedi di nuovo.',
      session_revoked:'Sessione non più valida. Accedi di nuovo.',
      dealer_not_found:'Concessionaria non trovata.',
      dealer_archived:'La concessionaria è archiviata.',
      registration_not_found:'Richiesta di registrazione non trovata.',
      registration_not_pending:'La richiesta è già stata gestita.',
      renewal_not_found:'Richiesta di rinnovo non trovata.',
      renewal_not_pending:'Il rinnovo è già stato gestito.',
      invalid_dealer_status:'Stato concessionaria non valido.',
      invalid_member_data:'Controlla nome, email, username e ruolo.',
      username_exists:'Questo username è già usato nella concessionaria.',
      email_exists:'Questa email è già collegata a un account Dealer Cockpit.',
      member_not_found:'Dipendente non trovato.',
      member_create_failed:'Non è stato possibile creare il dipendente.',
      last_admin_required:'Deve rimanere almeno un amministratore attivo.',
      cannot_demote_or_suspend_self:'Non puoi sospendere o declassare il tuo stesso account OWNER.'
    }
    throw new Error(friendly[code]||code)
  }
  return data as T
}

async function activeOwnerSession(){
  let session=getSession()
  if(!session)throw new Error('Sessione mancante. Accedi di nuovo.')
  if(!session.expires_at||Date.now()/1000>session.expires_at-30){
    const data=await parse<SessionPayload&{expires_in?:number}>(await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{'content-type':'application/json',apikey:config.supabasePublishableKey},body:JSON.stringify({refresh_token:session.refresh_token})}))
    session={...session,...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)}
    setSession(session)
  }
  return session
}

async function ownerFetch<T>(path:string,{method='GET',body}:{method?:'GET'|'POST';body?:unknown}={}){
  const session=await activeOwnerSession()
  const headers:Record<string,string>={authorization:`Bearer ${session.access_token}`,accept:'application/json'}
  if(body!==undefined)headers['content-type']='application/json'
  return parse<T>(await fetch(`${config.ownerUrl}${path}`,{method,headers,cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)}))
}

export function getOwnerMe(){return ownerFetch<OwnerMe>('/me')}
export function getOwnerOverview(){return ownerFetch<OwnerOverview>('/overview')}
export function getOwnerDealerDetail(dealerId:string){return ownerFetch<OwnerDealerDetail>('/dealer/detail',{method:'POST',body:{dealer_id:dealerId}})}
export function approveOwnerRegistration(requestId:string){return ownerFetch<{ok:true;result?:unknown}>('/registration/approve',{method:'POST',body:{request_id:requestId}})}
export function rejectOwnerRegistration(requestId:string){return ownerFetch<{ok:true}>('/registration/reject',{method:'POST',body:{request_id:requestId}})}
export function approveOwnerRenewal(requestId:string){return ownerFetch<{ok:true;result?:unknown}>('/renewal/approve',{method:'POST',body:{request_id:requestId}})}
export function rejectOwnerRenewal(requestId:string){return ownerFetch<{ok:true}>('/renewal/reject',{method:'POST',body:{request_id:requestId}})}
export function setOwnerDealerStatus(dealerId:string,status:'ACTIVE'|'SUSPENDED'){return ownerFetch<{ok:true;status:string}>('/dealer/status',{method:'POST',body:{dealer_id:dealerId,status}})}
export function createOwnerMember(dealerId:string,draft:{display_name:string;email:string;username:string;role:Role}){return ownerFetch<{ok:true;user_id:string;temp_password:string}>('/member/create',{method:'POST',body:{dealer_id:dealerId,...draft}})}
export function updateOwnerMember(dealerId:string,member:AdminMember,update:{display_name:string;role:Role;status:string}){return ownerFetch<{ok:true}>('/member/update',{method:'POST',body:{dealer_id:dealerId,user_id:member.user_id,...update}})}
export function resetOwnerMemberPassword(dealerId:string,userId:string){return ownerFetch<{ok:true;temp_password:string}>('/member/reset-password',{method:'POST',body:{dealer_id:dealerId,user_id:userId}})}

export async function enterOwnerSupport(dealerId:string,reason='Assistenza cliente'){
  const base=await activeOwnerSession()
  if(base.support_mode)throw new Error('Sei già in modalità supporto.')
  const result=await ownerFetch<{ok:true;dealer:Dealer;support_session_id:string;support_expires_at:string;profile:Profile}>('/support/start',{method:'POST',body:{dealer_id:dealerId,reason}})
  sessionStorage.setItem(BASE_SESSION_KEY,JSON.stringify(base))
  const next:SessionPayload={...base,dealer:result.dealer,profile:result.profile,support_mode:true,support_session_id:result.support_session_id,support_expires_at:result.support_expires_at}
  setSession(next)
  return next
}

export async function exitOwnerSupport(){
  const current=getSession()
  if(!current)return null
  let base:SessionPayload|null=null
  try{base=JSON.parse(sessionStorage.getItem(BASE_SESSION_KEY)||'null')}catch{base=null}
  try{if(current.support_mode)await ownerFetch<{ok:true}>('/support/end',{method:'POST',body:{session_id:current.support_session_id||''}})}catch{}
  sessionStorage.removeItem(BASE_SESSION_KEY)
  if(!base){setSession(null);return null}
  const restored:SessionPayload={...base,access_token:current.access_token,refresh_token:current.refresh_token,expires_at:current.expires_at,expires_in:current.expires_in}
  setSession(restored)
  return restored
}

export function ownerBaseSessionExists(){return Boolean(sessionStorage.getItem(BASE_SESSION_KEY))}
