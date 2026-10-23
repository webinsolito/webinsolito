import {describe,it,expect} from 'vitest'
import {buildGarageReviewSummary as summary} from './garageReviewSummary'
import type {Contract,Vehicle} from '../types'

const dealer='dealer-a'
const vehicle=(id:string,status:string):Vehicle=>({id,dealer_id:dealer,status})
const booking:Contract={id:'booking',dealer_id:dealer,vehicle_id:'booked',customer_id:'customer',contract_number:'V1',template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT'}
describe('Modifica 52 · conteggio coerente fra OGGI e Garage',()=>{
 it('raggruppa solo gli stati che richiedono davvero una verifica',()=>{
  const data={
   vehicles:[vehicle('stale','PRENOTATA'),vehicle('held','RISERVATA'),vehicle('blocked','BLOCCATA'),vehicle('unavailable','NON_DISPONIBILE'),vehicle('other','RITIRATA'),vehicle('booked','PRENOTATA'),vehicle('free','IN_VENDITA'),vehicle('sold','VENDUTA')],
   contracts:[booking]
  }
  const result=summary(data,dealer)
  expect(result).toMatchObject({total:5,reservation:2,blocked:2,other:1})
  expect(result.ids.has('booked')).toBe(false)
  expect(result.ids.has('free')).toBe(false)
  expect(result.ids.has('sold')).toBe(false)
 })
 it('ignora altri tenant, auto eliminate e duplicazioni di inventario',()=>{
  const a=vehicle('a','BLOCCATA')
  const data={vehicles:[a,{...a},{...a,id:'other',dealer_id:'dealer-b'},{...a,id:'deleted',deleted_at:'2026-10-22T10:00:00Z'}],contracts:[] as Contract[]}
  const result=summary(data,dealer)
  expect(result).toMatchObject({total:1,blocked:1,reservation:0,other:0})
  expect([...result.ids]).toEqual(['a'])
 })
 it('non trasforma vendite concluse o prenotazioni vere in anomalie',()=>{
  const sale:Contract={...booking,id:'delivered',vehicle_id:'delivered',sale_stage:'DELIVERED'}
  const result=summary({vehicles:[vehicle('booked','PRENOTATA'),vehicle('delivered','PRENOTATA')],contracts:[booking,sale]},dealer)
  expect(result.total).toBe(0)
 })
 it('non usa dati finanziari né contratti di un altro dealer',()=>{
  const differentDealer={...booking,dealer_id:'dealer-b',vehicle_id:'stale'}
  const result=summary({vehicles:[vehicle('stale','PRENOTATA')],contracts:[differentDealer]},dealer)
  expect(result).toMatchObject({total:1,reservation:1})
  expect(result.ids.has('stale')).toBe(true)
 })
})
