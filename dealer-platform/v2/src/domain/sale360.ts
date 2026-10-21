import type {Contract,TenantData} from '../types'

export const DELIVERY_CHECKLIST=['Contratto firmato','Saldo verificato','Passaggio / documenti completati','Libretto e documenti pronti','Preparazione auto completata','Doppie chiavi presenti','Garanzia / documentazione consegnata']

const active=(status?:string)=>!['DONE','CANCELLED','CHIUSO'].includes(String(status||'').toUpperCase())
const docs=(value?:string)=>/(document|pratic|passaggio|libretto|immatricol|garanzi|firma|contratt)/i.test(String(value||''))

export function buildSale360(data:TenantData,contract:Contract,nowIso:string){
 const customer=data.customers.find(c=>c.id===contract.customer_id)
 const vehicle=data.vehicles.find(v=>v.id===contract.vehicle_id)
 const deliveryItems=data.workItems.filter(w=>w.dealer_id===contract.dealer_id&&w.vehicle_id===contract.vehicle_id&&w.category==='CONSEGNA')
 const doneTitles=new Set(deliveryItems.filter(w=>String(w.status||'').toUpperCase()==='DONE').map(w=>String(w.title||'').trim()))
 const checklist={done:DELIVERY_CHECKLIST.filter(x=>doneTitles.has(x)).length,total:DELIVERY_CHECKLIST.length,items:DELIVERY_CHECKLIST.map(title=>({title,done:doneTitles.has(title)}))}
 const practices=data.workItems.filter(w=>w.vehicle_id===contract.vehicle_id&&active(w.status)&&(String(w.category||'').toUpperCase()==='DOCUMENTI'||docs(w.title)||docs(w.category))).sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')))
 const events=data.calendarEvents.filter(e=>active(e.status)&&e.starts_at&&String(e.starts_at)>=nowIso&&e.customer_id===contract.customer_id&&e.vehicle_id===contract.vehicle_id).sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)))
 const invoice=(contract.sale_invoice_id?data.invoices.find(i=>i.id===contract.sale_invoice_id):undefined)||data.invoices.filter(i=>i.vehicle_id===contract.vehicle_id&&i.customer_id===contract.customer_id&&String(i.invoice_type||'').toUpperCase()==='SALE'&&!i.deleted_at).sort((a,b)=>String(b.issue_date||'').localeCompare(String(a.issue_date||'')))[0]
 const total=Number(invoice?.total_amount??invoice?.total??0),paid=Number(invoice?.paid_amount||0)
 return {customer,vehicle,deliveryItems,checklist,practices,events,nextEvent:events[0]||null,invoice:invoice||null,invoiceTotal:total,invoicePaid:paid,invoiceDue:Math.max(0,total-paid)}
}
