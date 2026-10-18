import {describe,it,expect} from 'vitest'
import {buildInvoiceSummary,filterInvoices} from './invoices'
import type {InvoiceDetail,InvoiceReceipt} from '../lib/invoiceApi'
const inv=(id:string,total:number,paid:number,dueDate='2026-10-01'):InvoiceDetail=>({id,dealer_id:'d1',number:id,counterparty_name:'Cliente '+id,invoice_type:'SALE',total_amount:total,paid_amount:paid,due_date:dueDate,issue_date:'2026-09-20'})
describe('fatture e incassi',()=>{
 it('calcola insoluti, parziali, scaduti, saldi e pagamenti preesistenti senza duplicarli',()=>{
   const invoices=[inv('a',20000,5000),inv('b',10000,10000),inv('c',3000,0,'2026-12-01')]
   const receipts:InvoiceReceipt[]=[{id:'r1',dealer_id:'d1',invoice_id:'a',amount:2000,paid_on:'2026-09-29',payment_method:'BONIFICO',created_at:'2026-09-29'}]
   const summary=buildInvoiceSummary(invoices,receipts,'2026-10-18')
   expect(summary.total).toBe(33000);expect(summary.collected).toBe(15000)
   expect(summary.remaining).toBe(18000);expect(summary.overdueAmount).toBe(15000)
   expect(summary.overdueCount).toBe(1);expect(summary.openCount).toBe(2)
   expect(summary.rows.find(x=>x.invoice.id==='a')?.historicalPaid).toBe(3000)
   expect(filterInvoices(summary.rows,'overdue','').map(r=>r.invoice.id)).toEqual(['a'])
 })
 it('esclude documenti non vendita e cancellati e ignora incassi superiori al totale nelle letture',()=>{
   const invoices=[inv('a',100,105),{...inv('b',100,0),invoice_type:'PURCHASE'},{...inv('c',100,0),deleted_at:'2026-10-01'}]
   const s=buildInvoiceSummary(invoices,[],'2026-10-18')
   expect(s.rows).toHaveLength(1);expect(s.remaining).toBe(0)
   expect(s.rows[0].paid).toBe(100);expect(s.rows[0].state).toBe('PAID')
 })
})
