import {vehicleAvailabilityAlert} from './vehicleAvailabilityAlerts'
import type {Contract,Vehicle} from '../types'

export interface VehicleAvailabilityReviewGuide{
 reason:string
 instruction:string
 actionLabel:string
 contractId:string|null
}

/** Mod50: read-only, dealer-scoped guidance for an already flagged vehicle. */
export function vehicleAvailabilityReviewGuide(vehicle:Vehicle,contracts:Contract[],dealerId:string):VehicleAvailabilityReviewGuide|null{
 if(vehicle.dealer_id!==dealerId||vehicle.deleted_at
  ||vehicleAvailabilityAlert(vehicle,contracts,dealerId)?.kind!=='UNAVAILABLE')return null
 const status=String(vehicle.status||'').trim().toUpperCase().replaceAll('_',' ')
 const reservationState=['PRENOTATA','RISERVATA'].includes(String(vehicle.status||'').trim().toUpperCase())
 const sales=contracts
  .filter(c=>c.dealer_id===dealerId&&c.vehicle_id===vehicle.id&&c.template_code==='VENDITA')
  .filter(c=>['OPEN','CANCELLED'].includes(String(c.sale_stage||'OPEN').toUpperCase()))
  .sort((a,b)=>{
   const cancelled=(c:Contract)=>String(c.sale_stage||'').toUpperCase()==='CANCELLED'
   const priority=(c:Contract)=>Number(reservationState?cancelled(c):!cancelled(c))
   return priority(b)-priority(a)
    ||String(b.updated_at||b.created_at||b.contract_date||'').localeCompare(String(a.updated_at||a.created_at||a.contract_date||''))
    ||a.id.localeCompare(b.id)
  })
 const sale=sales[0]
 const reason=reservationState
  ?`Stato ${status}: manca una prenotazione attiva confermata.`
  :`Stato ${status}: disponibilità bloccata o da chiarire.`
 if(!sale)return {reason,instruction:'Controlla nella scheda auto il motivo dello stato prima di proporla.',actionLabel:'Apri scheda auto',contractId:null}
 const number=String(sale.contract_number||'').trim()||'collegata'
 const cancelled=String(sale.sale_stage||'').toUpperCase()==='CANCELLED'
 return {
  reason,
  instruction:cancelled
   ?`La pratica ${number} è annullata. Verifica se lo stato dell'auto va corretto.`
   :`La pratica ${number} è aperta, senza prenotazione attiva. Controlla la pratica prima di modificare lo stato.`,
  actionLabel:`Apri pratica ${number}`,
  contractId:sale.id
 }
}
