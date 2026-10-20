import {reservationAlert} from './reservationDeadlines'
import {vehicleReservation} from './saleReservation'
import type {Contract,Vehicle} from '../types'

export type GarageReservationFilter='ALL'|'BOOKED'|'DUE'|'OVERDUE'

export function garageReservationFilterMatch(
 vehicle:Vehicle,
 contracts:Contract[],
 filter:GarageReservationFilter,
 nowIso:string
){
 if(filter==='ALL')return true
 const sale=vehicleReservation(contracts,vehicle.id)
 if(!sale)return false
 if(filter==='BOOKED')return true
 const alert=reservationAlert(sale,nowIso)
 return filter==='DUE'?alert==='SOON':alert==='OVERDUE'
}

export function garageReservationCounts(vehicles:Vehicle[],contracts:Contract[],nowIso:string){
 const active=vehicles.filter(v=>!v.deleted_at)
 return {
  ALL:active.length,
  BOOKED:active.filter(v=>garageReservationFilterMatch(v,contracts,'BOOKED',nowIso)).length,
  DUE:active.filter(v=>garageReservationFilterMatch(v,contracts,'DUE',nowIso)).length,
  OVERDUE:active.filter(v=>garageReservationFilterMatch(v,contracts,'OVERDUE',nowIso)).length
 } as Record<GarageReservationFilter,number>
}

export function garageReservationDueLabel(contract:Contract,nowIso:string){
 const state=reservationAlert(contract,nowIso)
 if(state==='OVERDUE')return 'Scaduta · verifica'
 if(state==='SOON')return 'In scadenza'
 return contract.reservation_expires_at?'Prenotazione attiva':'Scadenza da definire'
}
