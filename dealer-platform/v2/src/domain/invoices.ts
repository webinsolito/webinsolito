import type {InvoiceDetail,InvoiceReceipt} from '../lib/invoiceApi'

const num=(x:unknown)=>{const v=Number(x??0);return Number.isFinite(v)?v:0}
export type InvoiceFilter='all'|'open'|'overdue'|'paid'
export interface InvoiceRow {invoice:InvoiceDetail;total:number;paid:number;due:number;state:'UNPAID'|'PARTIAL'|'PAID';overdue:boolean;receipts:InvoiceReceipt[];historicalPaid:number}
export interface InvoiceSummary {rows:InvoiceRow[];total:number;collected:number;remaining:number;overdueAmount:number;openCount:number;overdueCount:number}

export function buildInvoiceSummary(invoices:InvoiceDetail[],receipts:InvoiceReceipt[],today:string):InvoiceSummary{
  const rows=invoices.filter(x=>x.invoice_type==='SALE'&&!x.deleted_at).map(invoice=>{
    const total=Math.max(0,num(invoice.total_amount))
    const paid=Math.min(total,Math.max(0,num(invoice.paid_amount)))
    const due=Math.max(0,Math.round((total-paid)*100)/100)
    const state:InvoiceRow['state']=due<=0?'PAID':paid>0?'PARTIAL':'UNPAID'
    const overdue=due>0&&Boolean(invoice.due_date)&&String(invoice.due_date)<today
    const entries=receipts.filter(r=>r.invoice_id===invoice.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
    const historicalPaid=Math.max(0,Math.round((paid-entries.reduce((s,r)=>s+num(r.amount),0))*100)/100)
    return {invoice,total,paid,due,state,overdue,receipts:entries,historicalPaid}
  }).sort((a,b)=>Number(b.overdue)-Number(a.overdue)||Number(b.due>0)-Number(a.due>0)||String(b.invoice.issue_date||'').localeCompare(String(a.invoice.issue_date||'')))
  return {rows,total:rows.reduce((s,r)=>s+r.total,0),collected:rows.reduce((s,r)=>s+r.paid,0),remaining:rows.reduce((s,r)=>s+r.due,0),overdueAmount:rows.filter(r=>r.overdue).reduce((s,r)=>s+r.due,0),openCount:rows.filter(r=>r.due>0).length,overdueCount:rows.filter(r=>r.overdue).length}
}
export function filterInvoices(rows:InvoiceRow[],filter:InvoiceFilter,search:string){
  const q=search.trim().toLocaleLowerCase('it')
  return rows.filter(r=>(filter==='all'||filter==='open'&&r.due>0||filter==='overdue'&&r.overdue||filter==='paid'&&r.due<=0)&&(!q||[r.invoice.number,r.invoice.counterparty_name,r.invoice.vehicle_id].some(value=>String(value||'').toLocaleLowerCase('it').includes(q))))
}
