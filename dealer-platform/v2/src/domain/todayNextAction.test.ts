import {describe,expect,it} from 'vitest'
import type {PriorityItem} from './priorities'
import type {TodayReservationCallback} from './todayReservationCallbacks'
import {dedupeTodayPriorities,remainingTodayPriorities,selectTodayPrimaryAction} from './todayNextAction'

const priority=(id:string,extra:Partial<PriorityItem>={}):PriorityItem=>({
 id,kind:'PRICE',severity:3,title:id,detail:id,...extra
})
const callback=(id:string,extra:Partial<TodayReservationCallback>={}):TodayReservationCallback=>({
 id:'reservation-callback:'+id,
 contractId:'contract-'+id,
 contractNumber:'SALE-'+id,
 customerId:'customer-'+id,
 customerName:'Cliente '+id,
 vehicleName:'Auto '+id,
 expiresAt:'2026-10-20T10:00:00Z',
 state:'NEEDS_CONTACT',
 callbackAt:null,
 lastContactAt:null,
 lastContactTitle:null,
 linkedCustomerFollowup:false,
 ...extra
})

describe('Dealer V57 · Oggi con una sola priorità operativa',()=>{
 it('una prenotazione scaduta da gestire viene prima delle priorità generiche',()=>{
  const regular=[priority('price')]
  const expired=[callback('a',{state:'CALLBACK_DUE'})]
  expect(selectTodayPrimaryAction(regular,expired,[])).toMatchObject({
   source:'OVERDUE_RESERVATION',
   callback:{contractId:'contract-a'}
  })
 })

 it('se la hero è una prenotazione non perde la prima priorità ordinaria dalla coda',()=>{
  const regular=[priority('price'),priority('photo',{kind:'PHOTO'})]
  const primary=selectTodayPrimaryAction(regular,[callback('a')],[])
  expect(remainingTodayPriorities(regular,primary).map(x=>x.id)).toEqual(['price','photo'])
 })

 it('se la hero è una priorità la rimuove una sola volta dalla coda',()=>{
  const regular=[priority('price'),priority('photo',{kind:'PHOTO'})]
  const primary=selectTodayPrimaryAction(regular,[],[])
  expect(primary.source).toBe('PRIORITY')
  expect(remainingTodayPriorities(regular,primary).map(x=>x.id)).toEqual(['photo'])
 })

 it('deduplica il follow-up cliente già rappresentato dalla prenotazione',()=>{
  const regular=[
   priority('customer',{kind:'CUSTOMER',customerId:'customer-a'}),
   priority('other-customer',{kind:'CUSTOMER',customerId:'customer-b'}),
   priority('price')
  ]
  const callbacks=[callback('a',{linkedCustomerFollowup:true,state:'CALLBACK_DUE'})]
  expect(dedupeTodayPriorities(regular,callbacks).map(x=>x.id)).toEqual(['other-customer','price'])
 })

 it('una prenotazione futura diventa hero solo quando non restano attività più urgenti',()=>{
  const future=callback('soon',{expiresAt:'2026-10-27T10:00:00Z',state:'NEEDS_CONTACT'})
  expect(selectTodayPrimaryAction([],[],[future]).source).toBe('UPCOMING_RESERVATION')
  expect(selectTodayPrimaryAction([priority('price')],[],[future]).source).toBe('PRIORITY')
  expect(selectTodayPrimaryAction([],[],[callback('scheduled',{state:'SCHEDULED'})]).source).toBe('NONE')
 })
})
