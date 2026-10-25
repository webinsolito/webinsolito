import type {TenantData,Contract} from '../types'
import {followupForReservation,latestReservationCompletion,reservationNextStep} from './reservationFollowup'
import {reservationAlert,type ReservationAlert} from './reservationDeadlines'

export type ReservationCallbackState='NEEDS_CONTACT'|'NEEDS_PLAN'|'CALLBACK_DUE'|'SCHEDULED'|'AFTER_EXPIRY'|'COMPLETED'
export interface TodayReservationCallback{
 id:string
 contractId:string
 contractNumber:string
 customerId:string
 customerName:string
 vehicleName:string
 expiresAt:string
 state:ReservationCallbackState
 callbackAt:string|null
 lastContactAt:string|null
 lastContactTitle:string|null
 linkedCustomerFollowup:boolean
}

const order:Record<ReservationCallbackState,number>={CALLBACK_DUE:0,AFTER_EXPIRY:1,NEEDS_CONTACT:2,NEEDS_PLAN:3,SCHEDULED:4,COMPLETED:5}
const name=(...parts:(string|undefined|null)[])=>parts.filter(Boolean).join(' ').trim()

export function buildReservationCallbacksByWindow(data:Pick<TenantData,'contracts'|'customers'|'vehicles'|'customerInteractions'>,nowIso:string,window:Extract<ReservationAlert,'SOON'|'OVERDUE'>):TodayReservationCallback[]{
 const now=Date.parse(nowIso)
 if(!Number.isFinite(now))return []
 const rows:TodayReservationCallback[]=[]
 for(const sale of data.contracts){
  if(reservationAlert(sale,nowIso)!==window)continue
  const customer=data.customers.find(c=>c.id===sale.customer_id&&c.dealer_id===sale.dealer_id&&!c.deleted_at)
  const vehicle=data.vehicles.find(v=>v.id===sale.vehicle_id&&v.dealer_id===sale.dealer_id&&!v.deleted_at)
  const lastContact=followupForReservation(sale,data.customerInteractions.filter(x=>x.dealer_id===sale.dealer_id))[0]
  const callbackMatches=customer?.next_step===reservationNextStep(sale)
  const rawCallback=callbackMatches?customer?.next_contact_at:null
  const callbackTime=rawCallback?Date.parse(rawCallback):NaN
  const validCallback=Number.isFinite(callbackTime)
  const completion=latestReservationCompletion(sale,data.customerInteractions.filter(x=>x.dealer_id===sale.dealer_id),window)
  const completedAt=completion?Date.parse(completion.happened_at||completion.created_at||''):NaN
  const editedAt=customer?.updated_at?Date.parse(customer.updated_at):NaN
  const newCallbackAfterCompletion=validCallback&&Number.isFinite(completedAt)&&Number.isFinite(editedAt)&&editedAt>=completedAt
  const state:ReservationCallbackState=completion&&!newCallbackAfterCompletion?'COMPLETED':validCallback?(callbackTime<=now?'CALLBACK_DUE':window==='SOON'&&callbackTime>Date.parse(sale.reservation_expires_at||'')?'AFTER_EXPIRY':'SCHEDULED'):(lastContact?'NEEDS_PLAN':'NEEDS_CONTACT')
  rows.push({
   id:'reservation-callback:'+sale.id,contractId:sale.id,contractNumber:sale.contract_number,customerId:sale.customer_id,
   customerName:name(customer?.first_name,customer?.last_name)||'Cliente non disponibile',
   vehicleName:name(vehicle?.brand,vehicle?.model,vehicle?.plate)||'Auto non disponibile',
   expiresAt:sale.reservation_expires_at!,
   state,callbackAt:validCallback?rawCallback!:null,
   lastContactAt:lastContact?.happened_at||lastContact?.created_at||null,
   lastContactTitle:lastContact?.title||null,
   linkedCustomerFollowup:callbackMatches
  })
 }
 return rows.sort((a,b)=>order[a.state]-order[b.state]
  ||(a.state==='CALLBACK_DUE'&&b.state==='CALLBACK_DUE'?String(a.callbackAt).localeCompare(String(b.callbackAt)):0)
  ||a.expiresAt.localeCompare(b.expiresAt)||a.contractNumber.localeCompare(b.contractNumber,'it'))
}
export function buildTodayReservationCallbacks(data:Pick<TenantData,'contracts'|'customers'|'vehicles'|'customerInteractions'>,nowIso:string){
 return buildReservationCallbacksByWindow(data,nowIso,'OVERDUE')
}
export function buildUpcomingReservationCallbacks(data:Pick<TenantData,'contracts'|'customers'|'vehicles'|'customerInteractions'>,nowIso:string){
 return buildReservationCallbacksByWindow(data,nowIso,'SOON')
}
export const overdueCallbackCounts=(rows:TodayReservationCallback[])=>({
 toDo:rows.filter(r=>r.state!=='SCHEDULED'&&r.state!=='COMPLETED').length,
 scheduled:rows.filter(r=>r.state==='SCHEDULED').length
})
export const completedReservationCallbackCount=(rows:TodayReservationCallback[])=>rows.filter(r=>r.state==='COMPLETED').length
export const overdueCallbackLabel=(state:ReservationCallbackState)=>({
 NEEDS_CONTACT:'Da ricontattare',
 NEEDS_PLAN:'Contatto registrato · pianifica richiamo',
 CALLBACK_DUE:'Richiamo da fare',
 SCHEDULED:'Richiamo programmato',
 AFTER_EXPIRY:'Richiamo oltre la scadenza · anticipa',
 COMPLETED:'Richiamo completato'
})[state]
