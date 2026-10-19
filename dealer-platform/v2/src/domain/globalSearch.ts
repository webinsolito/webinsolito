import type {TenantData} from '../types'
import type {InvoiceDetail} from '../lib/invoiceApi'

export type GlobalSearchKind='VEHICLE'|'CUSTOMER'|'INVOICE'
export interface GlobalSearchResult {kind:GlobalSearchKind;id:string;title:string;subtitle:string;score:number}

const clean=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const compact=(value:unknown)=>clean(value).replace(/\s+/g,'')

function fieldScore(query:string,value:unknown){
 const q=clean(query),qc=compact(query),v=clean(value),vc=compact(value)
 if(!q||!v)return 0
 if(v===q||vc===qc)return 120
 if(v.startsWith(q)||vc.startsWith(qc))return 90
 if(v.includes(q)||vc.includes(qc))return 60
 return 0
}
function bestScore(query:string,fields:unknown[]){return Math.max(0,...fields.map(v=>fieldScore(query,v)))}

export function buildGlobalSearchResults(data:TenantData,query:string,includeInvoices:boolean):GlobalSearchResult[]{
 if(clean(query).length<2)return []
 const out:GlobalSearchResult[]=[]
 for(const vehicle of data.vehicles){
  if(vehicle.deleted_at)continue
  const title=[vehicle.brand,vehicle.model,vehicle.version].filter(Boolean).join(' ')||'Veicolo'
  const score=bestScore(query,[title,vehicle.brand,vehicle.model,vehicle.version,vehicle.plate,vehicle.vin])
  if(score)out.push({kind:'VEHICLE',id:vehicle.id,title,subtitle:[vehicle.plate||'Targa —',vehicle.vin?'Telaio '+vehicle.vin:null,vehicle.status?.replaceAll('_',' ')].filter(Boolean).join(' · '),score:score+((fieldScore(query,vehicle.plate)||fieldScore(query,vehicle.vin))?25:0)})
 }
 for(const customer of data.customers){
  if(customer.deleted_at)continue
  const title=[customer.first_name,customer.last_name].filter(Boolean).join(' ')||'Cliente'
  const score=bestScore(query,[title,customer.first_name,customer.last_name,customer.phone,customer.email,customer.fiscal_code])
  if(score)out.push({kind:'CUSTOMER',id:customer.id,title,subtitle:[customer.phone,customer.email,customer.fiscal_code].filter(Boolean).join(' · ')||'Anagrafica cliente',score:score+(fieldScore(query,customer.phone)?20:0)})
 }
 if(includeInvoices){
  const vehicles=new Map(data.vehicles.map(v=>[v.id,v]))
  for(const invoice of data.invoices as InvoiceDetail[]){
   if(invoice.deleted_at||invoice.invoice_type!=='SALE')continue
   const car=invoice.vehicle_id?vehicles.get(invoice.vehicle_id):undefined
   const carName=car?[car.brand,car.model].filter(Boolean).join(' '):''
   const score=bestScore(query,[invoice.number,invoice.counterparty_name,carName,car?.plate,car?.vin])
   if(score)out.push({kind:'INVOICE',id:invoice.id,title:'Fattura '+(invoice.number||'—'),subtitle:[invoice.counterparty_name,carName,car?.plate].filter(Boolean).join(' · ')||'Fattura vendita',score:score+(fieldScore(query,invoice.number)?25:0)})
  }
 }
 const kindOrder:Record<GlobalSearchKind,number>={VEHICLE:0,CUSTOMER:1,INVOICE:2}
 return out.sort((a,b)=>b.score-a.score||kindOrder[a.kind]-kindOrder[b.kind]||a.title.localeCompare(b.title,'it')).slice(0,12)
}
