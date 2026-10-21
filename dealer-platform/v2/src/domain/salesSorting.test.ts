import {describe,it,expect} from 'vitest'
import {sortSales,salesPriority,salesPriorityLabel} from './salesSorting'
import {filterSalesSegment,searchSales} from './salesView'
import type {Contract,TenantData} from '../types'
const now='2026-10-21T12:00:00Z'
const make=(id:string,extra:Partial<Contract>={}):Contract=>({
 id,contract_number:id,dealer_id:'dealer',customer_id:'c-'+id,vehicle_id:'v-'+id,
 template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT',contract_date:'2026-10-14',
 price:18000,deposit:0,...extra
} as Contract)
const sales=[
 make('regular',{contract_date:'2026-10-20'}),
 make('delivery-today',{planned_delivery_at:'2026-10-22T09:00:00Z'}),
 make('expiry-soon',{reservation_expires_at:'2026-10-23T12:00:00Z'}),
 make('delivery-overdue',{planned_delivery_at:'2026-10-19T09:00:00Z'}),
 make('expiry-overdue',{reservation_expires_at:'2026-10-18T09:00:00Z'}),
 make('future',{planned_delivery_at:'2026-11-10T09:00:00Z'}),
 make('cancelled',{sale_stage:'CANCELLED',reservation_expires_at:'2026-10-17T09:00:00Z',planned_delivery_at:'2026-10-17T09:00:00Z'}),
 make('delivered',{sale_stage:'DELIVERED',reservation_expires_at:'2026-10-16T09:00:00Z',planned_delivery_at:'2026-10-16T09:00:00Z'})
]
const ids=(items:Contract[])=>items.map(x=>x.id)
describe('Modifica 36 · ordinamento delle vendite',()=>{
 it('ordina urgenze: prenotazione scaduta, consegna in ritardo, prenotazione imminente, consegna imminente',()=>{
  const result=ids(sortSales(sales,'PRIORITY',now))
  expect(result.slice(0,4)).toEqual(['expiry-overdue','delivery-overdue','expiry-soon','delivery-today'])
  expect(result.slice(-2).sort()).toEqual(['cancelled','delivered'])
  expect(salesPriority(sales[4],now)).toBe('RESERVATION_OVERDUE')
  expect(salesPriorityLabel('DELIVERY_SOON')).toBe('Consegna imminente')
 })
 it('ordina le scadenze prenotazione e mette in fondo contratti senza scadenza e terminali',()=>{
  const result=ids(sortSales(sales,'RESERVATION',now))
  expect(result.slice(0,2)).toEqual(['expiry-overdue','expiry-soon'])
  expect(result.slice(-2).sort()).toEqual(['cancelled','delivered'])
  expect(result.indexOf('regular')).toBeGreaterThan(result.indexOf('expiry-soon'))
 })
 it('ordina le consegne prima per data, ignorando date di archiviati come attività urgenti',()=>{
  const result=ids(sortSales(sales,'DELIVERY',now))
  expect(result.slice(0,3)).toEqual(['delivery-overdue','delivery-today','future'])
  expect(result.slice(-2).sort()).toEqual(['cancelled','delivered'])
 })
 it('ordina per vendita recente e non rimuove nessun record',()=>{
  const result=sortSales(sales,'RECENT',now)
  expect(result).toHaveLength(sales.length)
  expect(result[0].id).toBe('regular')
  expect(new Set(ids(result)).size).toBe(sales.length)
 })
 it('rispetta i filtri e la ricerca applicati prima del sorting; non reintroduce archiviati',()=>{
  const rows=[make('Alpha',{sale_stage:'AGREED'}),make('Beta',{sale_stage:'CANCELLED'})]
  const data={customers:[],vehicles:[]} as Pick<TenantData,'customers'|'vehicles'>
  expect(ids(sortSales(searchSales(data,filterSalesSegment(rows,'ACTIVE'),'Alpha'),'PRIORITY',now))).toEqual(['Alpha'])
  expect(ids(sortSales(searchSales(data,filterSalesSegment(rows,'CANCELLED'),'Beta'),'DELIVERY',now))).toEqual(['Beta'])
 })
 it('data inesistente non prevale sulle scadenze valide; ordinamento stabile e non muta input',()=>{
  const a=make('A',{reservation_expires_at:'invalid',planned_delivery_at:'invalid'})
  const b=make('B',{reservation_expires_at:'2026-10-22T08:00:00Z'})
  const originals=[a,b]
  expect(ids(sortSales(originals,'RESERVATION',now))).toEqual(['B','A'])
  expect(ids(originals)).toEqual(['A','B'])
  expect(sortSales(originals,'PRIORITY','invalid')).toHaveLength(2)
 })
 it('prenotazioni scadute e consegne in ritardo non sono mai rialzate se la vendita è annullata o consegnata',()=>{
  const cancelled=make('c',{sale_stage:'CANCELLED',reservation_expires_at:'2026-10-18T09:00:00Z'})
  const delivered=make('d',{sale_stage:'DELIVERED',planned_delivery_at:'2026-10-16T09:00:00Z'})
  expect(salesPriority(cancelled,now)).toBe('TERMINAL')
  expect(salesPriority(delivered,now)).toBe('TERMINAL')
 })
})
