import {describe,it,expect} from 'vitest'
import {buildDeadlineSummary} from './deadlines'
import type {TenantData} from '../types'
import type {CollectionTask} from './collections'

const base:TenantData={vehicles:[{id:'v1',dealer_id:'d',brand:'BMW',model:'X1',plate:'AB123CD'}],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]}

describe('Centro Scadenze',()=>{
 it('ordina prima scaduti e oggi',()=>{const data={...base,customers:[{id:'c1',dealer_id:'d',first_name:'Mario',last_name:'Rossi',next_contact_at:'2026-10-18T09:00:00Z'},{id:'c2',dealer_id:'d',first_name:'Anna',last_name:'Bianchi',next_contact_at:'2026-10-19T10:00:00Z'}]};const s=buildDeadlineSummary(data,'2026-10-19');expect(s.items.map(x=>x.id)).toEqual(['customer:c1','customer:c2']);expect(s.overdue).toBe(1);expect(s.today).toBe(1)})
 it('riconosce consegne e pratiche/documenti',()=>{const data={...base,calendarEvents:[{id:'e1',dealer_id:'d',event_type:'DELIVERY',title:'Consegna X1',starts_at:'2026-10-20T10:00:00Z',vehicle_id:'v1'},{id:'e2',dealer_id:'d',event_type:'DOCUMENT',title:'Pratica immatricolazione',starts_at:'2026-10-21T10:00:00Z',vehicle_id:'v1'}]};const s=buildDeadlineSummary(data,'2026-10-19');expect(s.items.map(x=>x.kind)).toEqual(['DELIVERY','DOCUMENT'])})
 it('include lavori con scadenza e collega auto',()=>{const data={...base,workItems:[{id:'w1',dealer_id:'d',vehicle_id:'v1',title:'Revisione documenti',category:'DOCUMENTI',status:'TODO',due_date:'2026-10-19'}]};expect(buildDeadlineSummary(data,'2026-10-19').items[0]).toMatchObject({kind:'DOCUMENT',vehicleId:'v1'})})
 it('include incassi solo quando vengono forniti dal livello finanziario',()=>{const task={row:{invoice:{id:'i1',dealer_id:'d',number:'FV-1',counterparty_name:'Cliente',invoice_type:'SALE',customer_id:'c1',vehicle_id:'v1'},receipts:[],historicalPaid:0,total:1000,paid:0,due:1000,state:'OPEN',overdue:true},followups:[],latest:null,actionDate:'2026-10-19',actionableToday:true,scheduled:false,daysOverdue:5} as unknown as CollectionTask;expect(buildDeadlineSummary(base,'2026-10-19').items).toHaveLength(0);expect(buildDeadlineSummary(base,'2026-10-19',[task]).items[0].kind).toBe('COLLECTION')})
})
