import {describe,expect,it} from 'vitest'
import {reservesVehicle,reservationLabel,vehicleReservation} from './saleReservation'
import type {Contract} from '../types'
const sale=(overrides:Partial<Contract>={}):Contract=>({
 id:'sale-1',dealer_id:'dealer-1',vehicle_id:'vehicle-1',customer_id:'customer-1',
 contract_number:'S-1',template_code:'VENDITA',sale_stage:'OPEN',status:'DRAFT',deposit:0,...overrides
})

describe('prenotazione vendita v25',()=>{
 it('OPEN senza impegno non prenota',()=>expect(reservesVehicle(sale())).toBe(false))
 it.each(['AGREED','DEPOSIT','BALANCE_PENDING','READY'])('stato %s blocca auto',stage=>expect(reservesVehicle(sale({sale_stage:stage}))).toBe(true))
 it('OPEN con caparra o firma blocca auto',()=>{
  expect(reservesVehicle(sale({deposit:1}))).toBe(true)
  expect(reservesVehicle(sale({status:'SIGNED'}))).toBe(true)
 })
 it('consegnata o annullata non trattiene prenotazione',()=>{
  expect(reservesVehicle(sale({sale_stage:'CANCELLED',deposit:200}))).toBe(false)
  expect(reservesVehicle(sale({sale_stage:'DELIVERED',status:'SIGNED'}))).toBe(false)
 })
 it('un contratto non vendita non blocca auto',()=>expect(reservesVehicle(sale({template_code:'CAPARRA',sale_stage:'AGREED'}))).toBe(false))
 it('trova un unico responsabile ed esclude la vendita corrente',()=>{
  const contract=sale({sale_stage:'AGREED'})
  expect(vehicleReservation([sale({id:'lead'}),contract],'vehicle-1')?.id).toBe('sale-1')
  expect(vehicleReservation([contract],'vehicle-1','sale-1')).toBeNull()
  expect(vehicleReservation([contract],'different-vehicle')).toBeNull()
 })
 it('mostra solo nome cliente, senza campi finance',()=>expect(reservationLabel({customers:[{id:'customer-1',dealer_id:'dealer-1',first_name:'Ada',last_name:'Rossi'}]},sale())).toBe('Ada Rossi'))
})
