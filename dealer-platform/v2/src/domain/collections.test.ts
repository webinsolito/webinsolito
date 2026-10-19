import {describe,it,expect} from 'vitest'
import {buildCollectionSchedule,filterCollectionTasks} from './collections'
import type {InvoiceRow} from './invoices'
import type {InvoiceCollectionFollowup} from '../lib/collectionsApi'

const row=(id:string,due:number,dueDate:string,paid=0):InvoiceRow=>({invoice:{id,dealer_id:'d1',number:id,counterparty_name:'Cliente '+id,invoice_type:'SALE',total_amount:due+paid,paid_amount:paid,due_date:dueDate,issue_date:'2026-09-01'},total:due+paid,paid,due,state:paid?'PARTIAL':'UNPAID',overdue:dueDate<'2026-10-19',receipts:[],historicalPaid:paid})
const follow=(id:string,invoiceId:string,next:string|null):InvoiceCollectionFollowup=>({id,dealer_id:'d1',invoice_id:invoiceId,contacted_on:'2026-10-18',channel:'TELEFONO',outcome:'CONTATTATO',next_follow_up_on:next,created_by:'u1',created_at:'2026-10-18T10:00:00Z'})

describe('scadenziario incassi',()=>{
 it('porta in Oggi gli insoluti scaduti e sposta in Programmati quelli con prossimo controllo futuro',()=>{
  const rows=[row('a',15000,'2026-10-01',5000),row('b',4000,'2026-10-10'),row('c',2000,'2026-10-25')]
  const followups=[follow('f1','b','2026-10-22')]
  const s=buildCollectionSchedule(rows,followups,'2026-10-19')
  expect(s.todayCount).toBe(1);expect(s.todayAmount).toBe(15000)
  expect(s.scheduledCount).toBe(2);expect(s.overdueCount).toBe(2);expect(s.overdueAmount).toBe(19000)
  expect(filterCollectionTasks(s.tasks,'today').map(x=>x.row.invoice.id)).toEqual(['a'])
  expect(filterCollectionTasks(s.tasks,'scheduled').map(x=>x.row.invoice.id)).toEqual(['b','c'])
 })
 it('un sollecito senza nuova data non nasconde una fattura ancora scaduta',()=>{
  const s=buildCollectionSchedule([row('a',3000,'2026-10-01')],[follow('f1','a',null)],'2026-10-19')
  expect(s.tasks[0].actionableToday).toBe(true)
  expect(s.tasks[0].latest?.id).toBe('f1')
 })
})
