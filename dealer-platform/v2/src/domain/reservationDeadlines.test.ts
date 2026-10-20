import {describe,it,expect} from 'vitest'
import {reservationAlert,activeReservationAlerts,canExtendReservation,extensionDeadline} from './reservationDeadlines'
import type {Contract,SessionPayload} from '../types'
const now='2026-10-20T12:00:00.000Z'
const sale=(v:Partial<Contract>={}):Contract=>({
 id:'one',dealer_id:'dealer',vehicle_id:'car',customer_id:'customer',contract_number:'V-ONE',
 template_code:'VENDITA',status:'DRAFT',sale_stage:'AGREED',deposit:0,
 reservation_expires_at:'2026-10-21T12:00:00.000Z',...v
})
const user=(role:string):SessionPayload=>({
 dealer:{id:'dealer',slug:'test'},profile:{role},access_token:'a',refresh_token:'r'
})
describe('scadenze prenotazione v26',()=>{
 it('avvisa per prenotazioni in scadenza, senza considerare altri contratti',()=>{
  expect(reservationAlert(sale(),now)).toBe('SOON')
  expect(reservationAlert(sale({reservation_expires_at:'2026-10-10T12:00:00.000Z'}),now)).toBe('OVERDUE')
  expect(reservationAlert(sale({reservation_expires_at:'2026-11-20T12:00:00.000Z'}),now)).toBe('LATER')
  expect(reservationAlert(sale({reservation_expires_at:null}),now)).toBe('NONE')
  expect(reservationAlert(sale({sale_stage:'CANCELLED'}),now)).toBe('NONE')
  expect(reservationAlert(sale({sale_stage:'DELIVERED'}),now)).toBe('NONE')
  expect(reservationAlert(sale({sale_stage:'OPEN',deposit:0}),now)).toBe('NONE')
 })
 it('ordina avvisi reali per urgenza',()=>{
  const rows=activeReservationAlerts({contracts:[sale({id:'soon'}),sale({id:'past',reservation_expires_at:'2026-10-19T00:00:00Z'}),sale({id:'closed',sale_stage:'DELIVERED'})]},now)
  expect(rows.map(x=>x.id)).toEqual(['past','soon'])
 })
 it('venditore proroga solo accordo libero da impegni, admin gestisce anche avanzate',()=>{
  expect(canExtendReservation(sale(),user('VENDITORE'))).toBe(true)
  expect(canExtendReservation(sale({deposit:100}),user('VENDITORE'))).toBe(false)
  expect(canExtendReservation(sale({sale_stage:'DEPOSIT'}),user('VENDITORE'))).toBe(false)
  expect(canExtendReservation(sale({status:'SIGNED'}),user('VENDITORE'))).toBe(false)
  expect(canExtendReservation(sale({sale_invoice_id:'invoice'}),user('VENDITORE'))).toBe(false)
  expect(canExtendReservation(sale({sale_stage:'READY'}),user('ADMIN'))).toBe(true)
  expect(canExtendReservation(sale({sale_stage:'READY'}),user('OPERATORE'))).toBe(false)
 })
 it('proroga dal termine più recente e applica limite 30 giorni',()=>{
  expect(extensionDeadline(sale(),7,now)).toBe('2026-10-28T12:00:00.000Z')
  expect(extensionDeadline(sale({reservation_expires_at:'2026-10-19T12:00:00.000Z'}),7,now)).toBe('2026-10-27T12:00:00.000Z')
  expect(()=>extensionDeadline(sale({reservation_expires_at:'2026-11-19T12:00:00.000Z'}),7,now)).toThrow()
 })
})
