import {describe,expect,it} from 'vitest'
import {garageReservationCounts,garageReservationDueLabel,garageReservationFilterMatch} from './garageReservations'
import type {Contract,Vehicle} from '../types'
const now='2026-10-20T12:00:00.000Z'
const vehicles=['booked','due','late','free','past','hidden'].map(id=>({
 id,dealer_id:'d',status:id==='booked'?'PRENOTATA':'IN_VENDITA',deleted_at:id==='hidden'?'2026-10-18':null
})) as Vehicle[]
const sale=(id:string,expires_at:string|null,extra:Partial<Contract>={}):Contract=>({
 id:'s-'+id,dealer_id:'d',vehicle_id:id,customer_id:'c',contract_number:id,
 template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT',deposit:0,
 reservation_expires_at:expires_at,...extra
})
const sales=[
 sale('booked','2026-11-01T12:00:00Z'),
 sale('due','2026-10-22T12:00:00Z'),
 sale('late','2026-10-19T12:00:00Z'),
 sale('past','2026-10-19T12:00:00Z',{sale_stage:'CANCELLED'}),
 sale('hidden','2026-10-19T12:00:00Z')
]
describe('garage prenotazioni v28',()=>{
 it('conta solo auto visibili e prenotazioni attive',()=>{
  expect(garageReservationCounts(vehicles,sales,now)).toEqual({ALL:5,BOOKED:3,DUE:1,OVERDUE:1})
 })
 it('filtri rispettano la vendita anziché il solo stato del veicolo',()=>{
  expect(garageReservationFilterMatch(vehicles[0],sales,'BOOKED',now)).toBe(true)
  expect(garageReservationFilterMatch(vehicles[1],sales,'DUE',now)).toBe(true)
  expect(garageReservationFilterMatch(vehicles[2],sales,'OVERDUE',now)).toBe(true)
  expect(garageReservationFilterMatch(vehicles[4],sales,'BOOKED',now)).toBe(false)
  expect(garageReservationFilterMatch(vehicles[1],sales,'OVERDUE',now)).toBe(false)
  expect(garageReservationFilterMatch(vehicles[2],sales,'DUE',now)).toBe(false)
 })
 it('assenza scadenza resta prenotata, ma non viene chiamata scaduta',()=>{
  const c=sale('booked',null)
  expect(garageReservationFilterMatch(vehicles[0],[c],'BOOKED',now)).toBe(true)
  expect(garageReservationFilterMatch(vehicles[0],[c],'DUE',now)).toBe(false)
  expect(garageReservationDueLabel(c,now)).toBe('Scadenza da definire')
 })
 it('etichetta corretta per futuro, scadenza e ritardo',()=>{
  expect(garageReservationDueLabel(sales[0],now)).toBe('Prenotazione attiva')
  expect(garageReservationDueLabel(sales[1],now)).toBe('In scadenza')
  expect(garageReservationDueLabel(sales[2],now)).toBe('Scaduta · verifica')
 })
})
