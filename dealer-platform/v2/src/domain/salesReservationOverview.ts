import type {Contract,TenantData} from '../types'
import {reservesVehicle} from './saleReservation'
import {reservationAlert} from './reservationDeadlines'
import {buildTodayReservationCallbacks,buildUpcomingReservationCallbacks,type ReservationCallbackState} from './todayReservationCallbacks'

export type SalesReservationBucket='OVERDUE'|'SOON'|'LATER'|'NO_DEADLINE'
export type SalesReservationFilter='ALL'|'ACTION'|'SCHEDULED'|'COMPLETED'|'NO_DEADLINE'
export interface SalesReservationRow{
 id:string
 contractId:string
 contractNumber:string
 customerName:string
 vehicleName:string
 expiresAt:string|null
 bucket:SalesReservationBucket
 callbackState:ReservationCallbackState|null
 callbackAt:string|null
 lastContactAt:string|null
}
export interface SalesReservationOverviewData{
 rows:SalesReservationRow[]
 counts:{active:number;overdue:number;soon:number;completed:number;action:number;scheduled:number;noDeadline:number}
}
const priority:Record<SalesReservationBucket,number>={OVERDUE:0,SOON:1,NO_DEADLINE:2,LATER:3}
const name=(...parts:Array<string|undefined|null>)=>parts.filter(Boolean).join(' ').trim()

export function buildSalesReservationOverview(data:Pick<TenantData,'contracts'|'customers'|'vehicles'|'customerInteractions'>,nowIso:string):SalesReservationOverviewData{
 const soon=new Map(buildUpcomingReservationCallbacks(data,nowIso).map(x=>[x.contractId,x]))
 const overdue=new Map(buildTodayReservationCallbacks(data,nowIso).map(x=>[x.contractId,x]))
 const rows:SalesReservationRow[]=[]
 for(const sale of data.contracts){
  if(!reservesVehicle(sale))continue
  const alert=reservationAlert(sale,nowIso)
  const bucket:SalesReservationBucket=alert==='SOON'||alert==='OVERDUE'?alert:alert==='LATER'?'LATER':'NO_DEADLINE'
  const callback=bucket==='SOON'?soon.get(sale.id):bucket==='OVERDUE'?overdue.get(sale.id):undefined
  const customer=data.customers.find(x=>x.id===sale.customer_id&&x.dealer_id===sale.dealer_id&&!x.deleted_at)
  const vehicle=data.vehicles.find(x=>x.id===sale.vehicle_id&&x.dealer_id===sale.dealer_id&&!x.deleted_at)
  rows.push({
   id:'sales-reservation:'+sale.id,contractId:sale.id,contractNumber:sale.contract_number,
   customerName:name(customer?.first_name,customer?.last_name)||'Cliente non disponibile',
   vehicleName:name(vehicle?.brand,vehicle?.model,vehicle?.plate)||'Veicolo non disponibile',
   expiresAt:bucket==='NO_DEADLINE'?null:sale.reservation_expires_at||null,
   bucket,callbackState:callback?.state||null,callbackAt:callback?.callbackAt||null,
   lastContactAt:callback?.lastContactAt||null
  })
 }
 rows.sort((a,b)=>priority[a.bucket]-priority[b.bucket]
  ||(a.bucket==='OVERDUE'||a.bucket==='SOON'?String(a.expiresAt).localeCompare(String(b.expiresAt)):0)
  ||a.contractNumber.localeCompare(b.contractNumber,'it'))
 const count=(check:(r:SalesReservationRow)=>boolean)=>rows.filter(check).length
 return {rows,counts:{
  active:rows.length,overdue:count(x=>x.bucket==='OVERDUE'),soon:count(x=>x.bucket==='SOON'),
  completed:count(x=>x.callbackState==='COMPLETED'),
  action:count(x=>['OVERDUE','SOON'].includes(x.bucket)&&x.callbackState!=='SCHEDULED'&&x.callbackState!=='COMPLETED'),
  scheduled:count(x=>x.callbackState==='SCHEDULED'),noDeadline:count(x=>x.bucket==='NO_DEADLINE')
 }}
}

export function filterSalesReservations(rows:SalesReservationRow[],filter:SalesReservationFilter):SalesReservationRow[]{
 switch(filter){
  case 'ACTION':return rows.filter(x=>['OVERDUE','SOON'].includes(x.bucket)&&x.callbackState!=='SCHEDULED'&&x.callbackState!=='COMPLETED')
  case 'SCHEDULED':return rows.filter(x=>x.callbackState==='SCHEDULED')
  case 'COMPLETED':return rows.filter(x=>x.callbackState==='COMPLETED')
  case 'NO_DEADLINE':return rows.filter(x=>x.bucket==='NO_DEADLINE')
  default:return rows
 }
}
export const salesReservationBucketLabel=(bucket:SalesReservationBucket)=>({
 OVERDUE:'Scaduta',SOON:'Entro 72 ore',LATER:'Più avanti',NO_DEADLINE:'Senza scadenza'
})[bucket]
