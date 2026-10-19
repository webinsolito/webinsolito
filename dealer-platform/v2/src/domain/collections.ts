import type {InvoiceRow} from './invoices'
import type {InvoiceCollectionFollowup} from '../lib/collectionsApi'

export type CollectionFilter='today'|'scheduled'|'all'
export interface CollectionTask {row:InvoiceRow;followups:InvoiceCollectionFollowup[];latest:InvoiceCollectionFollowup|null;actionDate:string;actionableToday:boolean;scheduled:boolean;daysOverdue:number}
export interface CollectionSummary {tasks:CollectionTask[];todayCount:number;todayAmount:number;scheduledCount:number;overdueCount:number;overdueAmount:number}

const dayDiff=(from:string,to:string)=>Math.max(0,Math.floor((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000))

export function buildCollectionSchedule(rows:InvoiceRow[],followups:InvoiceCollectionFollowup[],today:string):CollectionSummary{
 const tasks=rows.filter(r=>r.due>0).map(row=>{
  const entries=followups.filter(f=>f.invoice_id===row.invoice.id).sort((a,b)=>String(b.contacted_on).localeCompare(String(a.contacted_on))||String(b.created_at).localeCompare(String(a.created_at)))
  const latest=entries[0]||null
  const dueDate=String(row.invoice.due_date||'')
  const actionDate=latest?.next_follow_up_on||dueDate||today
  const actionableToday=actionDate<=today
  const scheduled=actionDate>today
  const daysOverdue=dueDate&&dueDate<today?dayDiff(dueDate,today):0
  return {row,followups:entries,latest,actionDate,actionableToday,scheduled,daysOverdue}
 }).sort((a,b)=>Number(b.actionableToday)-Number(a.actionableToday)||a.actionDate.localeCompare(b.actionDate)||String(a.row.invoice.due_date||'').localeCompare(String(b.row.invoice.due_date||'')))
 return {tasks,todayCount:tasks.filter(t=>t.actionableToday).length,todayAmount:tasks.filter(t=>t.actionableToday).reduce((s,t)=>s+t.row.due,0),scheduledCount:tasks.filter(t=>t.scheduled).length,overdueCount:tasks.filter(t=>t.daysOverdue>0).length,overdueAmount:tasks.filter(t=>t.daysOverdue>0).reduce((s,t)=>s+t.row.due,0)}
}
export function filterCollectionTasks(tasks:CollectionTask[],filter:CollectionFilter){
 if(filter==='today')return tasks.filter(t=>t.actionableToday)
 if(filter==='scheduled')return tasks.filter(t=>t.scheduled)
 return tasks
}
