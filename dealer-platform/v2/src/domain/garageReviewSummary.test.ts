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


describe('Modifica 53 · anteprima delle tre auto prioritarie in OGGI',()=>{
 it('mostra massimo tre auto nell’esatto ordine del filtro Garage, mantenendo il totale completo',()=>{
  const data={vehicles:[
   vehicle('other1','RITIRATA'),vehicle('blocked1','BLOCCATA'),vehicle('reserved1','PRENOTATA'),
   vehicle('other2','FUORI_VENDITA'),vehicle('reserved2','RISERVATA'),vehicle('blocked2','NON_DISPONIBILE'),
   vehicle('free','IN_VENDITA'),vehicle('sold','CONSEGNATA'),vehicle('booked','PRENOTATA')
  ],contracts:[booking]}
  const initial=data.vehicles.map(x=>x.id)
  const result=summary(data,dealer)
  expect(result).toMatchObject({total:6,reservation:2,blocked:2,other:2})
  expect(result.topVehicles.map(v=>v.id)).toEqual(['reserved1','reserved2','blocked1'])
  expect(data.vehicles.map(x=>x.id)).toEqual(initial)
 })
 it('riduce la lista quando un collega risolve lo stato, escludendo veicoli di altri dealer',()=>{
  const base=[vehicle('a','PRENOTATA'),vehicle('b','BLOCCATA'),vehicle('c','RITIRATA'),{...vehicle('foreign','PRENOTATA'),dealer_id:'another'}]
  const before=summary({vehicles:base,contracts:[]},dealer)
  expect(before.topVehicles.map(v=>v.id)).toEqual(['a','b','c'])
  const updated=base.map(v=>v.id==='a'?{...v,status:'IN_VENDITA'}:v)
  const after=summary({vehicles:updated,contracts:[]},dealer)
  expect(after.topVehicles.map(v=>v.id)).toEqual(['b','c'])
  expect(after.total).toBe(2)
 })
 it('non mostra duplicati, auto eliminate o prenotazioni regolari',()=>{
  const a=vehicle('a','RITIRATA')
  const result=summary({vehicles:[a,{...a},vehicle('booked','PRENOTATA'),{...a,id:'deleted',deleted_at:'2026-10-22T10:00:00Z'}],contracts:[booking]},dealer)
  expect(result.topVehicles.map(v=>v.id)).toEqual(['a'])
  expect(result.total).toBe(1)
 })
 it('non mostra nessuna auto in assenza di anomalie',()=>{
  const result=summary({vehicles:[vehicle('free','IN_VENDITA'),vehicle('booked','PRENOTATA')],contracts:[booking]},dealer)
  expect(result.topVehicles).toEqual([])
  expect(result.total).toBe(0)
 })
})
