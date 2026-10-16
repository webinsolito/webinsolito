import {config} from './config'
import type {SessionPayload} from '../types'

export type RegistrationDraft={
  dealer_name:string
  legal_name:string
  vat_number:string
  city:string
  address:string
  phone:string
  owner_display_name:string
  email:string
  username:string
}

export type RegistrationReceipt={
  request_id:string
  claim_token:string
  status:'PENDING'|'APPROVED'|'REJECTED'|'ACTIVATED'
  owner_notified?:boolean
}

export type RegistrationStatus={
  ok:true
  status:'PENDING'|'APPROVED'|'REJECTED'|'ACTIVATED'
  dealer_name:string
  dealer_slug?:string|null
  approved_at?:string|null
  rejected_at?:string|null
  activated_at?:string|null
}

async function post<T>(path:string,body:unknown){
  const res=await fetch(`${config.registrationUrl}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
  const text=await res.text()
  let data:any=null
  try{data=text?JSON.parse(text):null}catch{data=null}
  if(!res.ok)throw new Error(messageFor(data?.error||`http_${res.status}`))
  return data as T
}

function messageFor(error:string){
  const map:Record<string,string>={
    invalid_registration_data:'Controlla i dati inseriti: alcuni campi non sono validi.',
    email_already_in_use:'Questa email è già associata a un account.',
    registration_already_exists:'Esiste già una richiesta o una concessionaria con questi dati.',
    dealer_already_exists:'Questa concessionaria risulta già registrata.',
    registration_not_found:'Richiesta non trovata o collegamento non più valido.',
    registration_not_approved:'La richiesta deve ancora essere approvata.',
    registration_already_activated:'Questa richiesta è già stata attivata.',
    password_policy:'La password deve avere almeno 12 caratteri, maiuscola, minuscola, numero e simbolo.',
    activation_failed:'Non è stato possibile creare l’accesso. Riprova.',
    invalid_activation_data:'I dati di attivazione non sono validi.',
    activation_key_invalid:'Il codice di attivazione non è valido.',
    activation_key_expired:'Il codice di attivazione è scaduto. Riprova.',
    internal_error:'Servizio temporaneamente non disponibile. Riprova tra poco.'
  }
  return map[error]||'Operazione non riuscita. Riprova.'
}

export function requestDealerRegistration(draft:RegistrationDraft){
  return post<RegistrationReceipt>('/request',draft)
}

export function getDealerRegistrationStatus(receipt:Pick<RegistrationReceipt,'request_id'|'claim_token'>){
  return post<RegistrationStatus>('/status',receipt)
}

export function activateDealerRegistration(receipt:Pick<RegistrationReceipt,'request_id'|'claim_token'>,password:string){
  return post<SessionPayload & {registration_status:'ACTIVATED'}>('/activate',{...receipt,password})
}
