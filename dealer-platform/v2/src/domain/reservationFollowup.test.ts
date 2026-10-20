import {describe,expect,it} from 'vitest'
import {followupForReservation,isOverdueReservation,reservationContactTitle,reservationFollowupPrefix,reservationNextStep,validReservationCallback} from './reservationFollowup'
import type {Contract,CustomerInteraction} from '../types'
const sale={id:'s1',customer_id:'c1',contract_number:'V-125',template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT',deposit:0,reservation_expires_at:'2026-10-18T12:00:00Z'} as Contract
const now='2026-10-20T12:00:00Z'
describe('Modifica 29: guida prenotazioni scadute',()=>{
 it('mostra la guida solo quando la scadenza è informativamente superata',()=>{
  expect(isOverdueReservation(sale,now)).toBe(true)
  expect(isOverdueReservation({...sale,sale_stage:'CANCELLED'},now)).toBe(false)
  expect(isOverdueReservation({...sale,reservation_expires_at:'2026-11-01T12:00:00Z'},now)).toBe(false)
 })
 it('valida esito e nota del contatto senza mutare il contratto',()=>{
  expect(reservationContactTitle(sale,'NO_REPLY','Non raggiungibile')).toBe('Prenotazione V-125 · Non risponde · Non raggiungibile')
  expect(()=>reservationContactTitle(sale,'CONFIRMED','ok')).toThrow()
  expect(()=>reservationContactTitle(sale,'WITHDRAWAL','   ')).toThrow()
  expect(sale.sale_stage).toBe('AGREED')
 })
 it('elenca solo contatti legati a questa vendita, senza confondere altre pratiche dello stesso cliente',()=>{
  const rows=[
   {id:'1',customer_id:'c1',title:'Telefonata generica',happened_at:'2026-10-20T10:00:00Z'},
   {id:'2',customer_id:'c1',title:'Prenotazione V-125 · Non risponde · Chiamata',happened_at:'2026-10-20T11:00:00Z'},
   {id:'3',customer_id:'c1',title:'Prenotazione V-999 · Non risponde · Chiamata',happened_at:'2026-10-20T12:00:00Z'},
   {id:'4',customer_id:'c1',title:'Prenotazione V-125 · Conferma interesse · Chiamata',happened_at:'2026-10-20T13:00:00Z'}
  ] as CustomerInteraction[]
  expect(followupForReservation(sale,rows).map(x=>x.id)).toEqual(['4','2'])
  expect(reservationFollowupPrefix(sale)).toBe('Prenotazione V-125 · ')
 })
 it('richiamo nel futuro entro 30 giorni, mai nel passato o oltre il limite',()=>{
  expect(validReservationCallback('2026-10-23T12:00:00Z',now)).toBe(true)
  expect(validReservationCallback('2026-10-19T12:00:00Z',now)).toBe(false)
  expect(validReservationCallback('2026-11-21T12:00:00Z',now)).toBe(false)
  expect(validReservationCallback('invalid',now)).toBe(false)
  expect(reservationNextStep(sale)).toBe('Ricontatto prenotazione V-125')
 })
})
