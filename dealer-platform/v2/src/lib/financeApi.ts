import {config} from './config'
import {getSession,setSession} from './api'
import type {SessionPayload,VehicleFinancial} from '../types'

const FINANCE_ROLES=new Set(['ADMIN','AMMINISTRAZIONE'])
const VAT_REGIMES=new Set(['IVA_ESPOSTA','MARGINE','PRIVATO_FUORI_CAMPO'])

export interface VehicleFinancialDraft { supplier?:string|null; purchase_date?:string|null; purchase_price:number|string; minimum_price?:number|string|null; vat_regime?:string }

async function parse<T>(res:Response):Promise<T>{const text=await res.text();let data:unknown=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!res.ok){const d=data as {message?:string;error_description?:string;error?:string}|null;throw new Error(d?.message||d?.error_description||d?.error||`http_${res.status}`)}return data as T}
async function liveSession(){let session=getSession();if(!session)throw new Error('Sessione scaduta');if(!session.expires_at||Date.now()/1000>session.expires_at-30){const data=await parse<SessionPayload & {expires_in?:number}>(await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{'content-type':'application/json',apikey:config.supabasePublishableKey},body:JSON.stringify({refresh_token:session.refresh_token})}));session={...session,...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)};setSession(session)}return session}

export function canWriteFinance(session:SessionPayload|null=getSession()){if(!session||!FINANCE_ROLES.has(session.profile.role))return false;return session.profile.permissions?.costs_write!==false}

export async function saveVehicleFinancial(vehicleId:string,draft:VehicleFinancialDraft){
  const session=await liveSession()
  if(!canWriteFinance(session))throw new Error('finance_write_forbidden')
  const purchase=Number(draft.purchase_price)
  const minimum=draft.minimum_price===''||draft.minimum_price==null?null:Number(draft.minimum_price)
  const supplier=String(draft.supplier||'').trim().slice(0,160)||null
  const purchaseDate=String(draft.purchase_date||'').trim()||null
  const vat=String(draft.vat_regime||'MARGINE').toUpperCase()
  if(!Number.isFinite(purchase)||purchase<0||purchase>10000000)throw new Error('Costo acquisto non valido')
  if(minimum!==null&&(!Number.isFinite(minimum)||minimum<0||minimum>10000000))throw new Error('Prezzo minimo non valido')
  if(purchaseDate&&!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate))throw new Error('Data acquisto non valida')
  if(!VAT_REGIMES.has(vat))throw new Error('Regime IVA non valido')
  const body={dealer_id:session.dealer.id,vehicle_id:vehicleId,supplier,purchase_date:purchaseDate,purchase_price:purchase,minimum_price:minimum,vat_regime:vat,updated_at:new Date().toISOString()}
  const res=await fetch(`${config.supabaseUrl}/rest/v1/vehicle_financials?on_conflict=dealer_id,vehicle_id`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json',apikey:config.supabasePublishableKey,authorization:`Bearer ${session.access_token}`,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(body)})
  const rows=await parse<VehicleFinancial[]>(res)
  if(!rows?.length)throw new Error('Dati economici non salvati')
  return rows[0]
}
