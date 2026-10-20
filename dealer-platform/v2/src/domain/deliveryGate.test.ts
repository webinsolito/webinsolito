import {describe,it,expect} from 'vitest'
import {buildDeliveryGate} from './deliveryGate'
import type {Contract,TenantData} from '../types'
import {DELIVERY_CHECKLIST} from './sale360'

const contract:Contract={id:'s1',dealer_id:'d',customer_id:'c1',vehicle_id:'v1',contract_number:'V-1',template_code:'VENDITA',status:'SIGNED',sale_stage:'READY',price:20000,sale_invoice_id:'i1',financing_amount:0}
const done=DELIVERY_CHECKLIST.map((title,i)=>({id:'w'+i,dealer_id:'d',vehicle_id:'v1',title,category:'CONSEGNA',status:'DONE'}))
const base:TenantData={vehicles:[{id:'v1',dealer_id:'d'}],media:[],workItems:done,customers:[{id:'c1',dealer_id:'d'}],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[contract],financials:[],costs:[],invoices:[{id:'i1',dealer_id:'d',vehicle_id:'v1',customer_id:'c1',invoice_type:'SALE',total_amount:20000,paid_amount:20000,payment_status:'PAID'}]}

describe('delivery gate',()=>{
 it('abilita consegna solo con controlli server-equivalenti verdi',()=>{const g=buildDeliveryGate(base,contract,true);expect(g.canDeliver).toBe(true);expect(g.blockerCount).toBe(0)})
 it('blocca contratto non firmato, checklist e saldo aperto',()=>{const data={...base,workItems:done.slice(0,5),invoices:[{...base.invoices[0],paid_amount:15000,payment_status:'PARTIAL'}]};const g=buildDeliveryGate(data,{...contract,status:'DRAFT'},true);expect(g.canDeliver).toBe(false);expect(g.checks.filter(x=>x.state==='BLOCK').map(x=>x.id)).toEqual(expect.arrayContaining(['contract','checklist','balance']))})
 it('non espone dati finanziari al venditore e richiede verifica amministrativa',()=>{const g=buildDeliveryGate({...base,invoices:[]},contract,false);expect(g.canDeliver).toBe(false);expect(g.checks.find(x=>x.id==='finance')?.state).toBe('PRIVATE');expect(g.checks.some(x=>x.id==='invoice')).toBe(false)})
})