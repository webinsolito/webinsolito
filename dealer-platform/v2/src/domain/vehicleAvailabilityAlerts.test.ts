import {describe,it,expect} from 'vitest'
import {vehicleAvailabilityAlert as alert} from './vehicleAvailabilityAlerts'
import type {Contract,Vehicle} from '../types'
const dealer='dealer'
const vehicle:Vehicle={id:'car',dealer_id:dealer,status:'IN_VENDITA',brand:'Audi',model:'A3'}
const booked:Contract={id:'sale',dealer_id:dealer,vehicle_id:'car',customer_id:'customer',contract_number:'V1',template_code:'VENDITA',status:'DRAFT',sale_stage:'AGREED'}
describe('Modifica 47 · avvisi disponibilità operativa auto',()=>{
 it('lascia libera una vettura in vendita senza prenotazioni',()=>{
  expect(alert(vehicle,[],dealer)).toBeNull()
  expect(alert(vehicle,[{...booked,sale_stage:'OPEN',status:'DRAFT',deposit:0}],dealer)).toBeNull()
 })
 it('prenota solo quando esiste una vendita realmente vincolante',()=>{
  expect(alert(vehicle,[booked],dealer)?.kind).toBe('BOOKED')
  expect(alert(vehicle,[{...booked,sale_stage:'OPEN',deposit:100}],dealer)?.kind).toBe('BOOKED')
  expect(alert(vehicle,[{...booked,sale_stage:'CANCELLED'}],dealer)).toBeNull()
 })
 it('auto consegnata o venduta prevale sulle vecchie prenotazioni',()=>{
  expect(alert({...vehicle,status:'CONSEGNATA'},[booked],dealer)?.kind).toBe('SOLD')
  expect(alert(vehicle,[{...booked,sale_stage:'DELIVERED'}],dealer)?.kind).toBe('SOLD')
  expect(alert({...vehicle,status:'VENDUTA'},[],dealer)?.kind).toBe('SOLD')
 })
 it('stato PRENOTATA senza prenotazione attiva non inventa un vincolo',()=>{
  const row=alert({...vehicle,status:'PRENOTATA'},[{...booked,sale_stage:'CANCELLED'}],dealer)
  expect(row?.kind).toBe('UNAVAILABLE')
  expect(row?.detail).toContain('nessuna prenotazione attiva')
 })
 it('segnala indisponibilità esplicita e schede eliminate',()=>{
  expect(alert({...vehicle,status:'NON_DISPONIBILE'},[],dealer)?.kind).toBe('UNAVAILABLE')
  expect(alert({...vehicle,deleted_at:'2026-10-22T12:00:00Z'},[],dealer)?.kind).toBe('UNAVAILABLE')
 })
 it('esclude vendite di altre auto e concessionarie, senza usare prezzi o dati cliente',()=>{
  expect(alert(vehicle,[{...booked,vehicle_id:'another'}],dealer)).toBeNull()
  expect(alert(vehicle,[{...booked,dealer_id:'another'}],dealer)).toBeNull()
  expect(alert(vehicle,[{...booked,price:900000}],dealer)?.detail).not.toContain('900000')
 })
})
