import {describe,it,expect} from 'vitest'
import {buildCustomer360} from './customer360'
import type {TenantData} from '../types'

const data:TenantData={
 vehicles:[
  {id:'v1',dealer_id:'d',brand:'BMW',model:'X1'},
  {id:'v2',dealer_id:'d',brand:'Audi',model:'Q3'}
 ],
 media:[],workItems:[],
 customers:[{id:'c1',dealer_id:'d',first_name:'Mario'}],
 customerInteractions:[
  {id:'i-old',dealer_id:'d',customer_id:'c1',title:'Prima chiamata',happened_at:'2026-10-18T09:00:00Z'},
  {id:'i-new',dealer_id:'d',customer_id:'c1',title:'Offerta inviata',happened_at:'2026-10-19T09:00:00Z'}
 ],
 customerInterests:[
  {id:'x1',dealer_id:'d',customer_id:'c1',vehicle_id:'v1',status:'TRATTATIVA'},
  {id:'x2',dealer_id:'d',customer_id:'c1',vehicle_id:'v2',status:'PERSA'}
 ],
 calendarEvents:[
  {id:'e-old',dealer_id:'d',customer_id:'c1',title:'Vecchio evento',starts_at:'2026-10-18T10:00:00Z',status:'OPEN'},
  {id:'e-next',dealer_id:'d',customer_id:'c1',title:'Test drive',starts_at:'2026-10-20T10:00:00Z',status:'OPEN'}
 ],
 contracts:[{id:'s1',dealer_id:'d',customer_id:'c1',vehicle_id:'v1',contract_number:'V-1',template_code:'VENDITA',sale_stage:'DEPOSIT',updated_at:'2026-10-19T11:00:00Z'}],
 financials:[],costs:[],invoices:[]
}
describe('customer 360',()=>{
 it('mette prima la trattativa attiva e separa gli interessi persi',()=>{const s=buildCustomer360(data,'c1','2026-10-19T12:00:00Z');expect(s.interests[0].interest.status).toBe('TRATTATIVA');expect(s.activeInterests).toHaveLength(1);expect(s.activeInterests[0].vehicle?.model).toBe('X1')})
 it('trova prossimo appuntamento e ultima interazione',()=>{const s=buildCustomer360(data,'c1','2026-10-19T12:00:00Z');expect(s.nextEvent?.title).toBe('Test drive');expect(s.lastInteraction?.title).toBe('Offerta inviata')})
 it('trova la vendita attiva più recente',()=>{const s=buildCustomer360(data,'c1','2026-10-19T12:00:00Z');expect(s.sale?.contract_number).toBe('V-1');expect(s.sale?.sale_stage).toBe('DEPOSIT')})
})
