import {describe,expect,it} from 'vitest'
import {buildOperationalReport} from './report'
import type {TenantData} from '../types'

const DAY=86_400_000
const base=():TenantData=>({vehicles:[],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]})

describe('buildOperationalReport',()=>{
  it('segnala stock fermo e capitale immobilizzato senza inventare date mancanti',()=>{
    const now=Date.UTC(2026,9,17)
    const data=base()
    data.vehicles=[
      {id:'old',dealer_id:'d1',brand:'Fiat',model:'Panda',status:'IN_VENDITA',purchase_date:new Date(now-120*DAY).toISOString()},
      {id:'new',dealer_id:'d1',brand:'BMW',model:'X1',status:'IN_VENDITA',purchase_date:new Date(now-20*DAY).toISOString()},
      {id:'unknown',dealer_id:'d1',brand:'Audi',model:'A3',status:'IN_VENDITA'}
    ]
    data.financials=[
      {id:'f1',dealer_id:'d1',vehicle_id:'old',purchase_price:9000},
      {id:'f2',dealer_id:'d1',vehicle_id:'new',purchase_price:20000},
      {id:'f3',dealer_id:'d1',vehicle_id:'unknown',purchase_price:15000}
    ]
    const report=buildOperationalReport(data,now,'90')
    expect(report.stockCount).toBe(3)
    expect(report.staleCount).toBe(1)
    expect(report.staleCapital).toBe(9000)
    expect(report.missingStockDates).toBe(1)
    expect(report.buckets.find(x=>x.bucket==='90+')?.count).toBe(1)
  })

  it('calcola vendite, margine, incassi e tempo medio solo su consegne verificate nel periodo',()=>{
    const now=Date.UTC(2026,9,17)
    const purchased=new Date(now-50*DAY).toISOString()
    const delivered=new Date(now-10*DAY).toISOString()
    const data=base()
    data.vehicles=[{id:'v1',dealer_id:'d1',brand:'BMW',model:'320',status:'CONSEGNATA',purchase_date:purchased,sale_price:20000}]
    data.financials=[{id:'f1',dealer_id:'d1',vehicle_id:'v1',purchase_price:12000}]
    data.costs=[{id:'c1',dealer_id:'d1',vehicle_id:'v1',amount:1000}]
    data.contracts=[{id:'ct1',dealer_id:'d1',customer_id:'u1',vehicle_id:'v1',contract_number:'C1',price:20000,status:'SIGNED',sale_stage:'DELIVERED',integrity_state:'VERIFIED',delivered_at:delivered,sale_invoice_id:'i1'}]
    data.invoices=[{id:'i1',dealer_id:'d1',vehicle_id:'v1',invoice_type:'SALE',total_amount:20000,paid_amount:15000,payment_status:'PARTIAL'}]
    const report=buildOperationalReport(data,now,'30')
    expect(report.salesCount).toBe(1)
    expect(report.revenue).toBe(20000)
    expect(report.realizedMargin).toBe(7000)
    expect(report.collected).toBe(15000)
    expect(report.receivable).toBe(5000)
    expect(report.averageDaysToSell).toBe(40)
    expect(report.marginRate).toBe(35)
  })

  it('esclude legacy non verificate e vendite fuori periodo',()=>{
    const now=Date.UTC(2026,9,17)
    const data=base()
    data.vehicles=[
      {id:'legacy',dealer_id:'d1',status:'CONSEGNATA',purchase_date:new Date(now-40*DAY).toISOString()},
      {id:'old',dealer_id:'d1',status:'CONSEGNATA',purchase_date:new Date(now-200*DAY).toISOString()}
    ]
    data.financials=[{id:'f1',dealer_id:'d1',vehicle_id:'legacy',purchase_price:10000},{id:'f2',dealer_id:'d1',vehicle_id:'old',purchase_price:10000}]
    data.contracts=[
      {id:'c1',dealer_id:'d1',customer_id:'u1',vehicle_id:'legacy',contract_number:'1',price:15000,status:'SIGNED',sale_stage:'DELIVERED',integrity_state:'LEGACY_UNVERIFIED',delivered_at:new Date(now-5*DAY).toISOString()},
      {id:'c2',dealer_id:'d1',customer_id:'u2',vehicle_id:'old',contract_number:'2',price:16000,status:'SIGNED',sale_stage:'DELIVERED',integrity_state:'VERIFIED',delivered_at:new Date(now-120*DAY).toISOString()}
    ]
    const report=buildOperationalReport(data,now,'90')
    expect(report.salesCount).toBe(0)
    expect(report.revenue).toBe(0)
    expect(report.realizedMargin).toBe(0)
  })
})
