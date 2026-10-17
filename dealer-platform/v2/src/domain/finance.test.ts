import {describe,expect,it} from 'vitest'
import {buildFinanceSnapshot} from './finance'
import type {TenantData} from '../types'

const base=():TenantData=>({vehicles:[],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]})

describe('buildFinanceSnapshot',()=>{
  it('calcola investimento e margine previsto sullo stock',()=>{
    const data=base()
    data.vehicles=[{id:'v1',dealer_id:'d1',brand:'Fiat',model:'500',status:'IN_VENDITA',asking_price:15000}]
    data.financials=[{id:'f1',dealer_id:'d1',vehicle_id:'v1',purchase_price:10000}]
    data.costs=[{id:'c1',dealer_id:'d1',vehicle_id:'v1',amount:1000,category:'PREPARAZIONE'}]
    const result=buildFinanceSnapshot(data)
    expect(result.rows[0].invested).toBe(11000)
    expect(result.rows[0].expectedMargin).toBe(4000)
    expect(result.stockInvestment).toBe(11000)
    expect(result.realizedMargin).toBe(0)
  })

  it('riconosce margine reale e residuo solo sulla vendita consegnata verificata',()=>{
    const data=base()
    data.vehicles=[{id:'v1',dealer_id:'d1',brand:'BMW',model:'320',status:'CONSEGNATA',sale_price:20000}]
    data.financials=[{id:'f1',dealer_id:'d1',vehicle_id:'v1',purchase_price:12000}]
    data.costs=[{id:'c1',dealer_id:'d1',vehicle_id:'v1',amount:1000,category:'PREPARAZIONE'}]
    data.contracts=[{id:'ct1',dealer_id:'d1',customer_id:'u1',vehicle_id:'v1',contract_number:'C1',price:20000,status:'SIGNED',sale_stage:'DELIVERED',integrity_state:'VERIFIED',sale_invoice_id:'i1'}]
    data.invoices=[{id:'i1',dealer_id:'d1',vehicle_id:'v1',invoice_type:'SALE',total_amount:20000,paid_amount:5000,payment_status:'PARTIAL'}]
    const result=buildFinanceSnapshot(data)
    expect(result.rows[0].recognizedSale).toBe(true)
    expect(result.rows[0].realizedMargin).toBe(7000)
    expect(result.realizedRevenue).toBe(20000)
    expect(result.realizedMargin).toBe(7000)
    expect(result.collected).toBe(5000)
    expect(result.receivable).toBe(15000)
  })

  it('esclude dal margine le vendite legacy non verificate',()=>{
    const data=base()
    data.vehicles=[{id:'v1',dealer_id:'d1',brand:'Audi',model:'A3',status:'CONSEGNATA',sale_price:18000}]
    data.financials=[{id:'f1',dealer_id:'d1',vehicle_id:'v1',purchase_price:11000}]
    data.contracts=[{id:'ct1',dealer_id:'d1',customer_id:'u1',vehicle_id:'v1',contract_number:'C1',price:18000,status:'SIGNED',sale_stage:'DELIVERED',integrity_state:'LEGACY_UNVERIFIED'}]
    data.invoices=[{id:'i1',dealer_id:'d1',vehicle_id:'v1',invoice_type:'SALE',total_amount:18000,paid_amount:18000,payment_status:'PAID'}]
    const result=buildFinanceSnapshot(data)
    expect(result.rows[0].recognizedSale).toBe(false)
    expect(result.rows[0].realizedMargin).toBeNull()
    expect(result.realizedRevenue).toBe(0)
    expect(result.unverifiedSales).toBe(1)
  })
})
