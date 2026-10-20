import type {TenantData,Contract} from '../types'
import {isOverdueReservation,followupForReservation,reservationNextStep} from './reservationFollowup'

export type ReservationCallbackState='NEEDS_CONTACT'|'NEEDS_PLAN'|'CALLBACK_DUE'|'SCHEDULED'
export interface TodayReservationCallback{
 id:string
 contractId:string
 contractNumber:string
 customerName:string
 vehicleName:string
 expiresAt:string
 state:ReservationCallbackState
 callbackAt:string|null
 lastContactAt:string|null
 lastContactTitle:string|null
}

const order:Record<ReservationCallbackState,number>={CALLBACK_DUE:0,NEEDS_CONTACT:1,NEEDS_PLAN:2,SCHEDULED:3}
const name=(...parts:(string|undefined|null)[])=>parts.filter(Boolean).join(' ').trim()

export function buildTodayReservationCallbacks(data:Pick<TenantData,'contracts'|'customers'|'vehicles'|'customerInteractions'>,nowIso:string):TodayReservationCallback[]{
 const now=Date.parse(nowIso)
 if(!Number.isFinite(now))return []
 const rows:TodayReservationCallback[]=[]
 for(const sale of data.contracts){
  if(!isOverdueReservation(sale,nowIso))continue
  const customer=data.customers.find(c=>c.id===sale.customer_id&&c.dealer_id===sale.dealer_id&&!c.deleted_at)
  const vehicle=data.vehicles.find(v=>v.id===sale.vehicle_id&&v.dealer_id===sale.dealer_id&&!v.deleted_at)
  const lastContact=followupForReservation(sale,data.customerInteractions.filter(x=>x.dealer_id===sale.dealer_id))[0]
  const callbackMatches=customer?.next_step===reservationNextStep(sale)
  const rawCallback=callbackMatches?customer?.next_contact_at:null
  const callbackTime=rawCallback?Date.parse(rawCallback):NaN
  const validCallback=Number.isFinite(callbackTime)
  const state:ReservationCallbackState=validCallback?(callbackTime<=now?'CALLBACK_DUE':'SCHEDULED'):(lastContact?'NEEDS_PLAN':'NEEDS_CONTACT')
  rows.push({
   id:'reservation-callback:'+sale.id,contractId:sale.id,contractNumber:sale.contract_number,
   customerName:name(customer?.first_name,customer?.last_name)||'Cliente non disponibile',
   vehicleName:name(vehicle?.brand,vehicle?.model,vehicle?.plate)||'Auto non disponibile',
   expiresAt:sale.reservation_expires_at!,
   state,callbackAt:validCallback?rawCallback!:null,
   lastContactAt:lastContact?.happened_at||lastContact?.created_at||null,
   lastContactTitle:lastContact?.title||null
  })
 }
 return rows.sort((a,b)=>order[a.state]-order[b.state]
  ||(a.state==='CALLBACK_DUE'&&b.state==='CALLBACK_DUE'?String(a.callbackAt).localeCompare(String(b.callbackAt)):0)
  ||a.expiresAt.localeCompare(b.expiresAt)||a.contractNumber.localeCompare(b.contractNumber,'it'))
}
export const overdueCallbackCounts=(rows:TodayReservationCallback[])=>({
 toDo:rows.filter(r=>r.state!=='SCHEDULED').length,
 scheduled:rows.filter(r=>r.state==='SCHEDULED').length
})
export const overdueCallbackLabel=(state:ReservationCallbackState)=>({
 NEEDS_CONTACT:'Da ricontattare',
 NEEDS_PLAN:'Contatto registrato · pianifica richiamo',
 CALLBACK_DUE:'Richiamo da fare',
 SCHEDULED:'Richiamo programmato'
})[state]
