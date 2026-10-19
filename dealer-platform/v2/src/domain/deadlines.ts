import type {CollectionTask} from './collections'
import type {TenantData} from '../types'

export type DeadlineKind='CUSTOMER'|'APPOINTMENT'|'DELIVERY'|'DOCUMENT'|'WORK'|'COLLECTION'
export type DeadlineBucket='OVERDUE'|'TODAY'|'UPCOMING'
export interface DeadlineItem{
 id:string;kind:DeadlineKind;title:string;detail:string;date:string;bucket:DeadlineBucket;urgency:number;
 customerId?:string;vehicleId?:string;invoiceId?:string
}
export interface DeadlineSummary{
 items:DeadlineItem[];overdue:number;today:number;upcoming:number;next7:number
}

const day=(value:string)=>value.slice(0,10)
const activeStatus=(value?:string)=>!['DONE','CANCELLED','CHIUSO','COMPLETATO'].includes(String(value||'').toUpperCase())
const daysBetween=(from:string,to:string)=>Math.floor((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)
const bucketOf=(date:string,today:string):DeadlineBucket=>date<today?'OVERDUE':date===today?'TODAY':'UPCOMING'
const urgencyOf=(date:string,today:string)=>date<today?3:date===today?2:1
const customerName=(data:TenantData,id?:string|null)=>{const c=id?data.customers.find(x=>x.id===id):undefined;return c?[c.first_name,c.last_name].filter(Boolean).join(' ')||'Cliente':''}
const vehicleName=(data:TenantData,id?:string|null)=>{const v=id?data.vehicles.find(x=>x.id===id):undefined;return v?[v.brand,v.model,v.plate].filter(Boolean).join(' ')||'Auto':''}
const looksDocument=(...values:Array<string|undefined|null>)=>values.join(' ').toUpperCase().match(/DOCUMENT|PRATICA|PASSAGG|IMMATRIC|TARG|LIBRET|RADIAZ|REVISION/)
const looksDelivery=(...values:Array<string|undefined|null>)=>values.join(' ').toUpperCase().match(/DELIVERY|CONSEGN/)

export function buildDeadlineSummary(data:TenantData,today:string,collections:CollectionTask[]=[]):DeadlineSummary{
 const items:DeadlineItem[]=[]

 for(const customer of data.customers){
  if(customer.deleted_at||!customer.next_contact_at)continue
  const date=day(customer.next_contact_at)
  const title=[customer.first_name,customer.last_name].filter(Boolean).join(' ')||'Cliente'
  items.push({id:'customer:'+customer.id,kind:'CUSTOMER',title:'Richiamare '+title,detail:customer.next_step||'Ricontatto cliente',date,bucket:bucketOf(date,today),urgency:urgencyOf(date,today),customerId:customer.id})
 }

 for(const event of data.calendarEvents){
  if(!event.starts_at||!activeStatus(event.status))continue
  const date=day(event.starts_at)
  const kind:DeadlineKind=looksDelivery(event.event_type,event.title)?'DELIVERY':looksDocument(event.event_type,event.title,event.note)?'DOCUMENT':'APPOINTMENT'
  const related=[customerName(data,event.customer_id),vehicleName(data,event.vehicle_id),event.note].filter(Boolean).join(' · ')
  items.push({id:'calendar:'+event.id,kind,title:event.title||({DELIVERY:'Consegna',DOCUMENT:'Pratica / documento',APPOINTMENT:'Appuntamento'}[kind]||'Appuntamento'),detail:related||String(event.event_type||'Appuntamento').replaceAll('_',' '),date,bucket:bucketOf(date,today),urgency:urgencyOf(date,today)+(event.priority==='HIGH'?1:0),customerId:event.customer_id||undefined,vehicleId:event.vehicle_id||undefined})
 }

 for(const work of data.workItems){
  if(!work.due_date||!activeStatus(work.status))continue
  const date=day(work.due_date)
  const kind:DeadlineKind=looksDocument(work.category,work.title,work.note)?'DOCUMENT':'WORK'
  const car=vehicleName(data,work.vehicle_id)
  items.push({id:'work:'+work.id,kind,title:work.title||work.category||'Attività auto',detail:[car,work.category,work.note].filter(Boolean).join(' · ')||'Attività Garage',date,bucket:bucketOf(date,today),urgency:urgencyOf(date,today)+(work.priority==='HIGH'?1:0),vehicleId:work.vehicle_id})
 }

 for(const task of collections){
  if(task.row.due<=0)continue
  const date=task.actionDate
  const inv=task.row.invoice
  items.push({id:'collection:'+inv.id,kind:'COLLECTION',title:'Incasso '+(inv.counterparty_name||'cliente'),detail:'Fattura '+(inv.number||'—')+' · '+Math.round(task.row.due).toLocaleString('it-IT')+' € da incassare',date,bucket:bucketOf(date,today),urgency:urgencyOf(date,today)+(task.daysOverdue>0?1:0),invoiceId:inv.id,customerId:inv.customer_id,vehicleId:inv.vehicle_id})
 }

 items.sort((a,b)=>b.urgency-a.urgency||a.date.localeCompare(b.date)||a.title.localeCompare(b.title,'it'))
 const next7=items.filter(x=>x.date>=today&&daysBetween(today,x.date)<=7).length
 return {items,overdue:items.filter(x=>x.bucket==='OVERDUE').length,today:items.filter(x=>x.bucket==='TODAY').length,upcoming:items.filter(x=>x.bucket==='UPCOMING').length,next7}
}

export function filterDeadlines(items:DeadlineItem[],bucket:'ALL'|DeadlineBucket,kind:'ALL'|DeadlineKind){
 return items.filter(x=>(bucket==='ALL'||x.bucket===bucket)&&(kind==='ALL'||x.kind===kind))
}
