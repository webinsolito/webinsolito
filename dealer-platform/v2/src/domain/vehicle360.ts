import type {Contract,Customer,CustomerInterest,TenantData,VehicleWorkItem,CalendarEvent,Invoice} from '../types'

export interface Vehicle360Interest {interest:CustomerInterest;customer?:Customer}
export interface Vehicle360Practice {id:string;title:string;detail:string;due?:string|null;kind:'DOCUMENT'|'WORK'|'EVENT'}
export interface Vehicle360Summary {
 interests:Vehicle360Interest[]
 upcoming:CalendarEvent[]
 practices:Vehicle360Practice[]
 sale:Contract|null
 delivery:{done:number;total:number}
 invoice:Invoice|null
 invoiceDue:number
 costs:number
 margin:number|null
}

const active=(status?:string)=>!['DONE','CANCELLED','CHIUSO','COMPLETATO'].includes(String(status||'').toUpperCase())
const docLike=(...values:Array<string|undefined|null>)=>/DOCUMENT|PRATICA|PASSAGG|IMMATRIC|LIBRET|TARG|RADIAZ|REVISION/i.test(values.join(' '))
const saleTime=(c:Contract)=>String(c.contract_date||c.created_at||'')

export function buildVehicle360(data:TenantData,vehicleId:string,today:string):Vehicle360Summary{
 const interests=data.customerInterests
  .filter(i=>i.vehicle_id===vehicleId&&String(i.status||'').toUpperCase()!=='PERSA')
  .map(interest=>({interest,customer:data.customers.find(c=>c.id===interest.customer_id&&!c.deleted_at)}))
  .sort((a,b)=>String(b.interest.updated_at||b.interest.created_at||'').localeCompare(String(a.interest.updated_at||a.interest.created_at||'')))

 const upcoming=data.calendarEvents
  .filter(e=>e.vehicle_id===vehicleId&&active(e.status)&&Boolean(e.starts_at)&&String(e.starts_at).slice(0,10)>=today)
  .sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)))

 const practices:Vehicle360Practice[]=[]
 for(const w of data.workItems.filter(w=>w.vehicle_id===vehicleId&&active(w.status))){
  if(docLike(w.category,w.title,w.note))practices.push({id:'work:'+w.id,title:w.title||w.category||'Pratica auto',detail:[w.category,w.note].filter(Boolean).join(' · ')||'Pratica operativa',due:w.due_date,kind:'DOCUMENT'})
  else if(w.due_date)practices.push({id:'work:'+w.id,title:w.title||w.category||'Attività auto',detail:[w.category,w.note].filter(Boolean).join(' · ')||'Attività operativa',due:w.due_date,kind:'WORK'})
 }
 for(const e of data.calendarEvents.filter(e=>e.vehicle_id===vehicleId&&active(e.status)&&docLike(e.event_type,e.title,e.note))){
  practices.push({id:'event:'+e.id,title:e.title||'Pratica / documento',detail:e.note||String(e.event_type||'DOCUMENT').replaceAll('_',' '),due:e.starts_at?.slice(0,10),kind:'EVENT'})
 }
 practices.sort((a,b)=>String(a.due||'9999').localeCompare(String(b.due||'9999'))||a.title.localeCompare(b.title,'it'))

 const sale=data.contracts
  .filter(c=>c.vehicle_id===vehicleId&&c.template_code==='VENDITA'&&c.sale_stage!=='CANCELLED')
  .sort((a,b)=>saleTime(b).localeCompare(saleTime(a)))[0]||null
 const deliveryItems=data.workItems.filter(w=>w.vehicle_id===vehicleId&&w.category==='CONSEGNA')
 const delivery={done:deliveryItems.filter(w=>w.status==='DONE').length,total:deliveryItems.length}

 const invoice=data.invoices
  .filter(i=>i.vehicle_id===vehicleId&&i.invoice_type==='SALE'&&!i.deleted_at)
  .sort((a,b)=>String(b.issue_date||'').localeCompare(String(a.issue_date||'')))[0]||null
 const invoiceTotal=Number(invoice?.total_amount??invoice?.total??0)
 const paid=Number(invoice?.paid_amount??0)
 const invoiceDue=Math.max(0,invoiceTotal-paid)

 const costs=data.costs.filter(c=>c.vehicle_id===vehicleId).reduce((sum,c)=>sum+Number(c.amount||0),0)
 const financial=data.financials.find(f=>f.vehicle_id===vehicleId)
 const saleValue=Number(sale?.price||data.vehicles.find(v=>v.id===vehicleId)?.sale_price||0)
 const purchase=Number(financial?.purchase_price||0)
 const margin=saleValue>0&&purchase>0?saleValue-purchase-costs:null

 return {interests,upcoming,practices,sale,delivery,invoice,invoiceDue,costs,margin}
}
