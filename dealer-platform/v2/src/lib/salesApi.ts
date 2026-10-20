import {getSession} from './api'
import {config} from './config'
import type {Contract,SaleDraft,SessionPayload} from '../types'

const CONTRACT_WRITE_ROLES=new Set(['ADMIN','VENDITORE','AMMINISTRAZIONE'])
const SALE_STAGES=new Set(['OPEN','AGREED','DEPOSIT','BALANCE_PENDING','READY','DELIVERED','CANCELLED'])

export function canWriteContracts(session:SessionPayload|null){
  if(!session)return false
  return CONTRACT_WRITE_ROLES.has(session.profile.role)||session.profile.permissions?.contracts_write===true
}

function activeSession(){
  const session=getSession()
  if(!session)throw new Error('session_required')
  if(!canWriteContracts(session))throw new Error('contracts_write_forbidden')
  return session
}

async function parse<T>(res:Response):Promise<T>{
  const text=await res.text();let data:unknown=null
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok){const d=data as {message?:string;error?:string}|null;throw new Error(d?.message||d?.error||`http_${res.status}`)}
  return data as T
}

async function write<T>(path:string,method:'POST'|'PATCH',body:unknown){
  const session=activeSession()
  return parse<T>(await fetch(`${config.supabaseUrl}/rest/v1/${path}`,{method,headers:{apikey:config.supabasePublishableKey,authorization:`Bearer ${session.access_token}`,'content-type':'application/json',accept:'application/json',Prefer:'return=representation'},body:JSON.stringify(body)}))
}

function first<T>(rows:T[],message:string){if(!rows?.length)throw new Error(message);return rows[0]}
function contractNumber(){const d=new Date();const date=d.toISOString().slice(0,10).replaceAll('-','');const time=d.toTimeString().slice(0,8).replaceAll(':','');const suffix=crypto.randomUUID().slice(0,4).toUpperCase();return `V-${date}-${time}-${suffix}`}

export async function createSaleContract(draft:SaleDraft){
  const session=activeSession()
  const customerId=String(draft.customerId||'').trim(),vehicleId=String(draft.vehicleId||'').trim()
  const price=Number(draft.price),deposit=Number(draft.deposit||0)
  if(!customerId||!vehicleId)throw new Error('Seleziona cliente e auto')
  if(!Number.isFinite(price)||price<=0)throw new Error('Inserisci il prezzo di vendita')
  if(!Number.isFinite(deposit)||deposit<0||deposit>price)throw new Error('Caparra non valida')
  const body={dealer_id:session.dealer.id,customer_id:customerId,vehicle_id:vehicleId,contract_number:contractNumber(),contract_date:new Date().toISOString().slice(0,10),template_code:'VENDITA',template_version:'1.0',price,deposit,notes:String(draft.notes||'').trim()||null,status:'DRAFT',sale_stage:'OPEN',financing_status:'NOT_REQUESTED',financing_amount:0,planned_delivery_at:draft.plannedDeliveryAt?new Date(draft.plannedDeliveryAt).toISOString():null,created_by:session.user?.id||null,updated_at:new Date().toISOString()}
  return first(await write<Contract[]>('contracts','POST',body),'sale_create_not_persisted')
}

export async function cancelSaleContract(contract:Contract,reason:string){
  const session=activeSession();const clean=String(reason||'').trim()
  if(clean.length<4)throw new Error('sale_cancel_reason_required')
  return first(await write<Contract[]>(`contracts?id=eq.${encodeURIComponent(contract.id)}&dealer_id=eq.${encodeURIComponent(session.dealer.id)}`,'PATCH',{sale_stage:'CANCELLED',sale_cancel_reason:clean.slice(0,240),updated_at:new Date().toISOString()}),'sale_cancel_not_persisted')
}

export async function updateSaleStage(contract:Contract,stage:string){
  const session=activeSession();const next=String(stage||'').toUpperCase()
  if(!SALE_STAGES.has(next))throw new Error('Stato vendita non valido')
  return first(await write<Contract[]>(`contracts?id=eq.${encodeURIComponent(contract.id)}&dealer_id=eq.${encodeURIComponent(session.dealer.id)}`,'PATCH',{sale_stage:next,updated_at:new Date().toISOString()}),'sale_stage_not_persisted')
}

export function friendlySaleError(error:unknown){
  const raw=error instanceof Error?error.message:String(error)
  const known:Record<string,string>={sale_contract_not_signed:'Prima serve il contratto firmato.',sale_invoice_missing:'Manca la fattura di vendita.',sale_invoice_wrong_type:'La fattura collegata non è una fattura di vendita.',sale_invoice_vehicle_mismatch:'La fattura non corrisponde all’auto.',sale_invoice_customer_mismatch:'La fattura non corrisponde al cliente.',sale_invoice_amount_mismatch:'Il totale fattura non corrisponde al prezzo di vendita.',sale_balance_open:'Il saldo non risulta completamente pagato.',sale_financing_not_paid:'Il finanziamento non risulta liquidato.',sale_checklist_incomplete:'Completa prima tutta la checklist di consegna.',sale_cancel_reason_required:'Seleziona il motivo dell’annullamento.',sale_cancel_admin_required:'Questa vendita richiede la conferma di Admin/Amministrazione.',sale_cancel_forbidden:'Non hai il permesso di annullare questa vendita.',sale_cancel_unauthorized:'Sessione non autorizzata all’annullamento.',sale_cancel_delivered_forbidden:'Una vendita già consegnata non può essere annullata.',sale_cancel_metadata_locked:'Il motivo di una vendita annullata non può più essere modificato.',sale_delivery_role_forbidden:'Solo Admin o Amministrazione possono confermare la consegna finale.',sale_delivery_unauthorized:'Sessione non autorizzata alla consegna.',sale_vehicle_missing:'Auto collegata alla vendita non trovata.',vehicle_plate_required:'Inserisci la targa prima della consegna.',vehicle_vin_required:'Inserisci il VIN prima della consegna.',vehicle_vin_invalid:'Il VIN non è valido.',vehicle_photo_required:'Aggiungi almeno una foto dell’auto prima della consegna.',sale_delivered_terminal:'La vendita è già consegnata e non può essere riaperta.',sale_cancelled_terminal:'La vendita è annullata e non può essere riaperta.'}
  const key=Object.keys(known).find(k=>raw.includes(k))
  return key?known[key]:raw
}
