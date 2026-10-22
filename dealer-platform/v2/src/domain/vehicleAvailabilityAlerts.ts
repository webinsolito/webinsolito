import {reservesVehicle} from './saleReservation'
import type {Contract,Vehicle} from '../types'

export type VehicleAvailabilityKind='BOOKED'|'SOLD'|'UNAVAILABLE'
export interface VehicleAvailabilityAlert{
 kind:VehicleAvailabilityKind
 label:string
 detail:string
}
/** Conservative operational alert derived from active sales and real vehicle state. */
export function vehicleAvailabilityAlert(
 vehicle:Pick<Vehicle,'id'|'dealer_id'|'status'|'deleted_at'>|undefined,
 contracts:Pick<Contract,'dealer_id'|'vehicle_id'|'template_code'|'sale_stage'|'status'|'deposit'>[],
 dealerId:string
):VehicleAvailabilityAlert|null{
 if(!vehicle||vehicle.dealer_id!==dealerId||vehicle.deleted_at){
  return {kind:'UNAVAILABLE',label:'AUTO NON DISPONIBILE',detail:'Scheda veicolo non disponibile: verifica prima di proporla.'}
 }
 const status=String(vehicle.status||'').trim().toUpperCase()
 const sales=contracts.filter(c=>c.dealer_id===dealerId&&c.vehicle_id===vehicle.id&&c.template_code==='VENDITA')
 if(['VENDUTA','CONSEGNATA','SOLD'].includes(status)||sales.some(c=>String(c.sale_stage||'').toUpperCase()==='DELIVERED')){
  return {kind:'SOLD',label:'AUTO VENDUTA',detail:'Vendita conclusa o veicolo consegnato: non proporre questa auto.'}
 }
 if(sales.some(reservesVehicle)){
  return {kind:'BOOKED',label:'AUTO PRENOTATA',detail:'Prenotazione attiva: verifica la pratica prima di proporre questa auto.'}
 }
 if(['PRENOTATA','RISERVATA','BLOCCATA','NON_DISPONIBILE','FUORI_VENDITA','RITIRATA','DA_CONSEGNARE','IN_CONSEGNA'].includes(status)){
  return {kind:'UNAVAILABLE',label:'DISPONIBILITÀ DA VERIFICARE',
   detail:'Stato '+status.replaceAll('_',' ')+': nessuna prenotazione attiva confermata. Verifica prima di proporla.'}
 }
 return null
}
