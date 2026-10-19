import {describe,it,expect} from 'vitest'
import {buildVehicle360} from './vehicle360'
import type {TenantData} from '../types'

const data:TenantData={
 vehicles:[{id:'v1',dealer_id:'d',brand:'BMW',model:'X1',sale_price:25000}],
 media:[],
 workItems:[
  {id:'w1',dealer_id:'d',vehicle_id:'v1',title:'Pratica immatricolazione',category:'DOCUMENTI',status:'TODO',due_date:'2026-10-20'},
  {id:'w2',dealer_id:'d',vehicle_id:'v1',title:'Contratto firmato',category:'CONSEGNA',status:'DONE'}
 ],
 customers:[{id:'c1',dealer_id:'d',first_name:'Mario',last_name:'Rossi'}],
 customerInteractions:[],
 customerInterests:[{id:'i1',dealer_id:'d',customer_id:'c1',vehicle_id:'v1',status:'TRATTATIVA'}],
 calendarEvents:[{id:'e1',dealer_id:'d',vehicle_id:'v1',title:'Test drive',starts_at:'2026-10-21T10:00:00Z',status:'OPEN'}],
 contracts:[{id:'s1',dealer_id:'d',vehicle_id:'v1',customer_id:'c1',contract_number:'V-1',template_code:'VENDITA',sale_stage:'READY',price:25000,planned_delivery_at:'2026-10-25T15:00:00Z'}],
 financials:[{id:'f1',dealer_id:'d',vehicle_id:'v1',purchase_price:18000}],
 costs:[{id:'cst',dealer_id:'d',vehicle_id:'v1',amount:1000}],
 invoices:[{id:'inv',dealer_id:'d',vehicle_id:'v1',invoice_type:'SALE',total_amount:25000,paid_amount:10000,issue_date:'2026-10-19'}]
}

describe('scheda auto 360',()=>{
 it('aggrega commerciale agenda pratiche vendita e consegna',()=>{const s=buildVehicle360(data,'v1','2026-10-19');expect(s.interests[0].customer?.last_name).toBe('Rossi');expect(s.upcoming[0].title).toBe('Test drive');expect(s.practices[0].title).toContain('immatricolazione');expect(s.sale?.sale_stage).toBe('READY');expect(s.delivery).toEqual({done:1,total:1})})
 it('calcola saldo fattura e margine senza nuove fonti',()=>{const s=buildVehicle360(data,'v1','2026-10-19');expect(s.invoiceDue).toBe(15000);expect(s.margin).toBe(6000)})
 it('ignora interessi persi e appuntamenti conclusi',()=>{const changed={...data,customerInterests:[{...data.customerInterests[0],status:'PERSA'}],calendarEvents:[{...data.calendarEvents[0],status:'DONE'}]};const s=buildVehicle360(changed,'v1','2026-10-19');expect(s.interests).toHaveLength(0);expect(s.upcoming).toHaveLength(0)})
})
