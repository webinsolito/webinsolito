import {config} from './config'
import {getSession,setSession} from './api'
import type {Invoice,SessionPayload} from '../types'

const WRITE_ROLES=new Set(['ADMIN','AMMINISTRAZIONE'])
export type PaymentMethod='BONIFICO'|'POS'|'CONTANTI'|'ASSEGNO'|'FINANZIAMENTO'|'ALTRO'
export interface InvoiceDetail extends Invoice {number:string;counterparty_name:string;paid_at?:string|null;payment_method?:string|null}
export interface InvoiceReceipt {id:string;dealer_id:string;invoice_id:string;amount:number;paid_on:string;payment_method:PaymentMethod;reference?:string|null;note?:string|null;created_at:string}
export interface ReceiptDraft {invoiceId:string;requestId:string;amount:number;paidOn:string;method:PaymentMethod;reference?:string;note?:string}
export interface ReceiptResult {ok:true;id:string;duplicate:boolean;paid_amount:number;payment_status:string;remaining:number}

export function canWriteInvoices(session:SessionPayload|null=getSession()){
  return Boolean(session&&!session.support_mode&&WRITE_ROLES.has(session.profile.role)&&session.profile.permissions?.invoices_write!==false)
}
export function canViewInvoices(session:SessionPayload|null=getSession()){
  return Boolean(session&&(session.support_mode||WRITE_ROLES.has(session.profile.role)&&session.profile.permissions?.invoices_view!==false))
}
async function parse<T>(response:Response):Promise<T>{
  const text=await response.text()
  let data:unknown=null
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
export async function fetchInvoiceReceipts():Promise<InvoiceReceipt[]>{
  const session=await liveSession()
  if(!canViewInvoices(session))throw new Error('Accesso alle fatture non consentito')
  const res=await fetch(config.supabaseUrl+'/rest/v1/invoice_receipts?dealer_id=eq.'+encodeURIComponent(session.dealer.id)+'&select=id,dealer_id,invoice_id,amount,paid_on,payment_method,reference,note,created_at&order=created_at.desc&limit=1000',{headers:{apikey:config.supabasePublishableKey,authorization:'Bearer '+session.access_token,accept:'application/json'}})
  return parse<InvoiceReceipt[]>(res)
}
export async function recordInvoiceReceipt(draft:ReceiptDraft):Promise<ReceiptResult>{
  const session=await liveSession()
  if(!canWriteInvoices(session))throw new Error('Registrazione incassi non consentita')
  const amount=Number(draft.amount),date=String(draft.paidOn||'')
  if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(amount*100))throw new Error('Importo non valido (massimo due decimali)')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>new Date().toISOString().slice(0,10))throw new Error('Data incasso non valida')
  if(!['BONIFICO','POS','CONTANTI','ASSEGNO','FINANZIAMENTO','ALTRO'].includes(draft.method))throw new Error('Metodo di pagamento non valido')
  const body={p_dealer_id:session.dealer.id,p_invoice_id:draft.invoiceId,p_request_id:draft.requestId,p_amount:amount,p_paid_on:date,p_method:draft.method,p_reference:(draft.reference||'').trim().slice(0,120),p_note:(draft.note||'').trim().slice(0,400)}
  return parse<ReceiptResult>(await fetch(config.supabaseUrl+'/rest/v1/rpc/record_invoice_receipt',{method:'POST',headers:{apikey:config.supabasePublishableKey,authorization:'Bearer '+session.access_token,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)}))
}
