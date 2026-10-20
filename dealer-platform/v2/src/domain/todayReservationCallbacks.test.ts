import {describe,expect,it} from 'vitest'
import {buildTodayReservationCallbacks,overdueCallbackCounts,overdueCallbackLabel} from './todayReservationCallbacks'
import type {Contract,TenantData} from '../types'
const now='2026-10-20T12:00:00Z'
const makeSale=(id:string,extra:Partial<Contract>={}):Contract=>({
 id,dealer_id:'dealer',customer_id:'customer-'+id,vehicle_id:'car-'+id,
 contract_number:'SALE-'+id,template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT',
 deposit:0,reservation_expires_at:'2026-10-18T12:00:00Z',...extra
} as Contract)
const data=(contracts:Contract[],customers:any[]=[],interactions:any[]=[],vehicles:any[]=[])=>({
 contracts,customers,customerInteractions:interactions,vehicles
} as Pick<TenantData,'contracts'|'customers'|'customerInteractions'|'vehicles'>)
describe('Modifica 30 · richiami prenotazioni scadute su Oggi',()=>{
 it('non mostra prenotazioni future, senza scadenza, consegnate o annullate',()=>{
  const rows=buildTodayReservationCallbacks(data([
   makeSale('late'),makeSale('future',{reservation_expires_at:'2026-10-25T12:00:00Z'}),
   makeSale('cancel',{sale_stage:'CANCELLED'}),makeSale('delivered',{sale_stage:'DELIVERED'}),
   makeSale('none',{reservation_expires_at:null})
  ]),now)
  expect(rows.map(x=>x.contractId)).toEqual(['late'])
  expect(rows[0].state).toBe('NEEDS_CONTACT')
 })
 it('priorità richiamo scaduto > non contattato > contattato senza nuovo richiamo > programmato futuro',()=>{
  const sales=['due','new','not-planned','planned'].map(x=>makeSale(x))
  const customers=[
   {id:'customer-due',dealer_id:'dealer',next_step:'Ricontatto prenotazione SALE-due',next_contact_at:'2026-10-19T15:00:00Z'},
   {id:'customer-not-planned',dealer_id:'dealer'},
   {id:'customer-planned',dealer_id:'dealer',next_step:'Ricontatto prenotazione SALE-planned',next_contact_at:'2026-10-22T15:00:00Z'}
  ]
  const interactions=[{id:'interaction',dealer_id:'dealer',customer_id:'customer-not-planned',title:'Prenotazione SALE-not-planned · Non risponde · Ricontattare',happened_at:'2026-10-20T10:00:00Z'}]
  const rows=buildTodayReservationCallbacks(data(sales,customers,interactions),now)
  expect(rows.map(x=>x.state)).toEqual(['CALLBACK_DUE','NEEDS_CONTACT','NEEDS_PLAN','SCHEDULED'])
  expect(overdueCallbackCounts(rows)).toEqual({toDo:3,scheduled:1})
  expect(overdueCallbackLabel(rows[2].state)).toContain('pianifica')
 })
 it('una callback CRM di altra vendita non deve sopprimere il richiamo della vendita scaduta',()=>{
  const sale=makeSale('a')
  const rows=buildTodayReservationCallbacks(data([sale],[{id:'customer-a',dealer_id:'dealer',next_step:'Ricontatto prenotazione SALE-b',next_contact_at:'2026-10-23T10:00:00Z'}]),now)
  expect(rows[0].state).toBe('NEEDS_CONTACT')
  expect(rows[0].callbackAt).toBeNull()
 })
 it('RLS lato UI: non associa cliente, veicolo o contatto di concessionaria differente',()=>{
  const rows=buildTodayReservationCallbacks(data([makeSale('a')],[{id:'customer-a',dealer_id:'other',first_name:'Segreto'}],[{dealer_id:'other',customer_id:'customer-a',title:'Prenotazione SALE-a · Non risponde · segreto'}],[{id:'car-a',dealer_id:'other',brand:'SEGRETO'}]),now)
  expect(rows[0]).toMatchObject({customerName:'Cliente non disponibile',vehicleName:'Auto non disponibile',state:'NEEDS_CONTACT'})
  expect(rows[0].lastContactTitle).toBeNull()
 })
 it('una successiva proroga elimina il richiamo dalla lista, senza cambiare dati sorgente',()=>{
  const sale=makeSale('a')
  const source=data([sale])
  expect(buildTodayReservationCallbacks(source,now)).toHaveLength(1)
  sale.reservation_expires_at='2026-10-27T12:00:00Z'
  expect(buildTodayReservationCallbacks(source,now)).toHaveLength(0)
  expect(buildTodayReservationCallbacks(source,'invalid')).toEqual([])
 })
})
