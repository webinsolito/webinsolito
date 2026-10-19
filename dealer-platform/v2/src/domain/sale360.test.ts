import {describe,it,expect} from 'vitest'
import {buildSale360} from './sale360'
import type {Contract,TenantData} from '../types'

const contract:Contract={id:'s1',dealer_id:'d',customer_id:'c1',vehicle_id:'v1',contract_number:'V-1',template_code:'VENDITA',sale_stage:'READY',sale_invoice_id:'inv1'}
const data:TenantData={vehicles:[{id:'v1',dealer_id:'d',brand:'BMW',model:'X1'}],media:[],workItems:[
 {id:'w1',dealer_id:'d',vehicle_id:'v1',title:'Contratto firmato',category:'CONSEGNA',status:'DONE'},
 {id:'w2',dealer_id:'d',vehicle_id:'v1',title:'Passaggio di proprietà',category:'DOCUMENTI',status:'TODO',due_date:'2026-10-21'}
],customers:[{id:'c1',dealer_id:'d',first_name:'Mario'}],customerInteractions:[],customerInterests:[],calendarEvents:[
 {id:'e1',dealer_id:'d',customer_id:'c1',vehicle_id:'v1',event_type:'DELIVERY',title:'Consegna BMW',starts_at:'2026-10-22T10:00:00Z',status:'OPEN'}
],contracts:[contract],financials:[],costs:[],invoices:[{id:'inv1',dealer_id:'d',vehicle_id:'v1',customer_id:'c1',invoice_type:'SALE',total_amount:25000,paid_amount:10000,payment_status:'PARTIAL'}]}
describe('sale 360',()=>{
 it('aggrega cliente auto checklist pratiche e consegna',()=>{const s=buildSale360(data,contract,'2026-10-19T12:00:00Z');expect(s.customer?.first_name).toBe('Mario');expect(s.vehicle?.model).toBe('X1');expect(s.checklist.done).toBe(1);expect(s.practices[0].title).toBe('Passaggio di proprietà');expect(s.nextEvent?.event_type).toBe('DELIVERY')})
 it('calcola il saldo della fattura vendita',()=>{const s=buildSale360(data,contract,'2026-10-19T12:00:00Z');expect(s.invoice?.id).toBe('inv1');expect(s.invoiceTotal).toBe(25000);expect(s.invoicePaid).toBe(10000);expect(s.invoiceDue).toBe(15000)})
})
