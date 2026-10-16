import {config} from './config'
import {getSession,setSession} from './api'
import type {Customer,CustomerDraft,CustomerInterest,CustomerInterestDraft,SessionPayload} from '../types'

const CUSTOMER_WRITE_ROLES=new Set(['ADMIN','VENDITORE'])
const INTEREST_STATUSES=new Set(['INTERESSATO','TEST_DRIVE','OFFERTA','TRATTATIVA','VINTA','PERSA'])

async function parse<T>(res:Response):Promise<T>{
  const text=await res.text()
  let data:unknown=null
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok){
    const body=data as {message?:string;error_description?:string;error?:string}|null
    throw new Error(body?.message||body?.error_description||body?.error||`http_${res.status}`)
  }
  return data as T
}

async function liveSession(){
  let session=getSession()
  if(!session)throw new Error('session_required')
  if(!session.expires_at||Date.now()/1000<=session.expires_at-30)return session
  const data=await parse<SessionPayload & {expires_in?:number}>(await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{
    method:'POST',
    headers:{'content-type':'application/json',apikey:config.supabasePublishableKey},
    body:JSON.stringify({refresh_token:session.refresh_token})
  }))
  session={...session,...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)}
  setSession(session)
  return session
}

function requireCustomerWrite(session:SessionPayload){
  const allowed=CUSTOMER_WRITE_ROLES.has(session.profile.role)||session.profile.permissions?.customers_write===true
  if(!allowed)throw new Error('customers_write_forbidden')
}

async function write<T>(path:string,method:'POST'|'PATCH',body:unknown){
  const session=await liveSession()
  requireCustomerWrite(session)
  return parse<T>(await fetch(`${config.supabaseUrl}/rest/v1/${path}`,{
    method,
    headers:{
      apikey:config.supabasePublishableKey,
      authorization:`Bearer ${session.access_token}`,
      accept:'application/json',
      'content-type':'application/json',
      Prefer:'return=representation'
    },
    body:JSON.stringify(body)
  }))
}

function first<T>(rows:T[],message:string){if(!rows?.length)throw new Error(message);return rows[0]}
const clean=(value?:string|null)=>String(value||'').trim()

export async function saveCustomer(draft:CustomerDraft,customerId?:string){
  const session=await liveSession()
  requireCustomerWrite(session)
  const firstName=clean(draft.firstName)
  const lastName=clean(draft.lastName)
  const email=clean(draft.email).toLowerCase()
  if(!firstName)throw new Error('Nome obbligatorio')
  if(!lastName)throw new Error('Cognome obbligatorio')
  if(email&&!/^\S+@\S+\.\S+$/.test(email))throw new Error('Email non valida')
  const payload={
    first_name:firstName,
    last_name:lastName,
    phone:clean(draft.phone)||null,
    email:email||null,
    fiscal_code:clean(draft.fiscalCode).toUpperCase()||null,
    status:clean(draft.status)||'LEAD',
    source:clean(draft.source)||null,
    preferred_contact:clean(draft.preferredContact).toUpperCase()||null,
    notes:clean(draft.notes)||null,
    updated_at:new Date().toISOString()
  }
  if(customerId){
    return first(await write<Customer[]>(`customers?id=eq.${encodeURIComponent(customerId)}&dealer_id=eq.${encodeURIComponent(session.dealer.id)}`,'PATCH',payload),'customer_update_not_persisted')
  }
  return first(await write<Customer[]>('customers','POST',{
    ...payload,
    dealer_id:session.dealer.id,
    created_by:session.user?.id||null
  }),'customer_create_not_persisted')
}

export async function saveCustomerInterest(customer:Customer,draft:CustomerInterestDraft,interestId?:string){
  const session=await liveSession()
  requireCustomerWrite(session)
  const vehicleId=clean(draft.vehicleId)
  const status=clean(draft.status).toUpperCase()||'INTERESSATO'
  if(!vehicleId)throw new Error('Seleziona un’auto')
  if(!INTEREST_STATUSES.has(status))throw new Error('Stato interesse non valido')
  const rawOffer=draft.offerAmount
  const offer=rawOffer===null||rawOffer===undefined||rawOffer===''?null:Number(rawOffer)
  if(offer!==null&&(!Number.isFinite(offer)||offer<0))throw new Error('Offerta non valida')
  const payload={
    status,
    offer_amount:offer,
    note:clean(draft.note)||null,
    updated_at:new Date().toISOString()
  }
  if(interestId){
    return first(await write<CustomerInterest[]>(`customer_vehicle_interests?id=eq.${encodeURIComponent(interestId)}&dealer_id=eq.${encodeURIComponent(session.dealer.id)}`,'PATCH',payload),'customer_interest_update_not_persisted')
  }
  return first(await write<CustomerInterest[]>('customer_vehicle_interests','POST',{
    ...payload,
    dealer_id:session.dealer.id,
    customer_id:customer.id,
    vehicle_id:vehicleId,
    created_by:session.user?.id||null
  }),'customer_interest_create_not_persisted')
}
