import {config} from './config'
import {getSession,setSession} from './api'
import {canViewInvoices,canWriteInvoices} from './invoiceApi'
import type {SessionPayload} from '../types'

export type CollectionChannel='TELEFONO'|'WHATSAPP'|'EMAIL'|'PEC'|'ALTRO'
export type CollectionOutcome='CONTATTATO'|'NESSUNA_RISPOSTA'|'PROMESSA_PAGAMENTO'|'CONTESTAZIONE'|'ALTRO'
export interface InvoiceCollectionFollowup {id:string;dealer_id:string;invoice_id:string;contacted_on:string;channel:CollectionChannel;outcome:CollectionOutcome;note?:string|null;next_follow_up_on?:string|null;created_by:string;created_at:string}
export interface CollectionFollowupDraft {invoiceId:string;requestId:string;contactedOn:string;channel:CollectionChannel;outcome:CollectionOutcome;note?:string;nextFollowUpOn?:string}

export const canViewCollections=canViewInvoices
export const canWriteCollections=canWriteInvoices

async function parse<T>(response:Response):Promise<T>{
 const text=await response.text();let data:unknown=null
 try{data=text?JSON.parse(text):null}catch{data=text}
 if(!response.ok){const d=data as {message?:string;details?:string;error?:string}|null;throw new Error(d?.message||d?.error||'Errore di collegamento')}
 return data as T
}
async function liveSession(){
 let session=getSession()
 if(!session)throw new Error('Sessione scaduta')
 if(!session.expires_at||Date.now()/1000>session.expires_at-30){
  const data=await parse<SessionPayload&{expires_in?:number}>(await fetch(config.supabaseUrl+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:config.supabasePublishableKey,'content-type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})}))
  session={...session,...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)}
  setSession(session)
 }
 return session
}
const localToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}

export async function fetchCollectionFollowups():Promise<InvoiceCollectionFollowup[]>{
 const session=await liveSession()
 if(!canViewCollections(session))throw new Error('Accesso allo scadenziario non consentito')
 const res=await fetch(config.supabaseUrl+'/rest/v1/invoice_collection_followups?dealer_id=eq.'+encodeURIComponent(session.dealer.id)+'&select=id,dealer_id,invoice_id,contacted_on,channel,outcome,note,next_follow_up_on,created_by,created_at&order=contacted_on.desc,created_at.desc&limit=1000',{headers:{apikey:config.supabasePublishableKey,authorization:'Bearer '+session.access_token,accept:'application/json'}})
 return parse<InvoiceCollectionFollowup[]>(res)
}
export async function recordCollectionFollowup(draft:CollectionFollowupDraft):Promise<InvoiceCollectionFollowup>{
 const session=await liveSession()
 if(!canWriteCollections(session))throw new Error('Registrazione solleciti non consentita')
 if(!session.user?.id)throw new Error('Sessione utente non valida')
 const contacted=String(draft.contactedOn||''),next=String(draft.nextFollowUpOn||'')
 if(!/^\d{4}-\d{2}-\d{2}$/.test(contacted)||contacted>localToday())throw new Error('Data contatto non valida')
 if(next&&(!/^\d{4}-\d{2}-\d{2}$/.test(next)||next<contacted))throw new Error('Data prossimo controllo non valida')
 if(!['TELEFONO','WHATSAPP','EMAIL','PEC','ALTRO'].includes(draft.channel))throw new Error('Canale non valido')
 if(!['CONTATTATO','NESSUNA_RISPOSTA','PROMESSA_PAGAMENTO','CONTESTAZIONE','ALTRO'].includes(draft.outcome))throw new Error('Esito non valido')
 const note=String(draft.note||'').trim()
 if(note.length>400)throw new Error('Nota troppo lunga')
 const body={id:draft.requestId,dealer_id:session.dealer.id,invoice_id:draft.invoiceId,contacted_on:contacted,channel:draft.channel,outcome:draft.outcome,note:note||null,next_follow_up_on:next||null,created_by:session.user.id}
 const rows=await parse<InvoiceCollectionFollowup[]>(await fetch(config.supabaseUrl+'/rest/v1/invoice_collection_followups',{method:'POST',headers:{apikey:config.supabasePublishableKey,authorization:'Bearer '+session.access_token,'content-type':'application/json',accept:'application/json',Prefer:'return=representation'},body:JSON.stringify(body)}))
 if(!rows.length)throw new Error('Sollecito non registrato')
 return rows[0]
}
