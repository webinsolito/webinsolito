import {describe,it,expect} from 'vitest'
import {buildPriorities} from './priorities'
import type {TenantData} from '../types'

const base:TenantData={vehicles:[{id:'v1',dealer_id:'d',brand:'BMW',model:'X1',status:'IN_VENDITA',asking_price:30000}],media:[{id:'m1',dealer_id:'d',vehicle_id:'v1',object_key:'x.jpg'}],workItems:[],customers:[{id:'c1',dealer_id:'d',first_name:'Mario',last_name:'Rossi'}],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]}

describe('priorità consegne',()=>{
 it('riconosce READY come consegna urgente e collega la vendita esatta',()=>{
  const data:TenantData={...base,contracts:[{id:'s1',dealer_id:'d',customer_id:'c1',vehicle_id:'v1',contract_number:'V-1',template_code:'VENDITA',sale_stage:'READY',planned_delivery_at:'2026-10-22T10:00:00Z'}],workItems:[{id:'w1',dealer_id:'d',vehicle_id:'v1',title:'Contratto firmato',category:'CONSEGNA',status:'DONE'}]}
  const rows=buildPriorities(data,new Date('2026-10-19T10:00:00Z'))
  const delivery=rows.find(x=>x.kind==='DELIVERY')
  expect(delivery).toMatchObject({saleId:'s1',vehicleId:'v1',customerId:'c1',severity:3})
  expect(delivery?.detail).toContain('checklist 1/7')
 })
 it('porta in Oggi una consegna pianificata entro tre giorni anche prima di READY',()=>{
  const data:TenantData={...base,contracts:[{id:'s2',dealer_id:'d',customer_id:'c1',vehicle_id:'v1',contract_number:'V-2',template_code:'VENDITA',sale_stage:'BALANCE_PENDING',planned_delivery_at:'2026-10-21T10:00:00Z'}]}
  expect(buildPriorities(data,new Date('2026-10-19T10:00:00Z')).find(x=>x.id==='delivery:s2')).toMatchObject({kind:'DELIVERY',saleId:'s2',severity:2})
 })
})
