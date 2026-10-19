import type {CalendarEvent,Contract,CustomerInteraction,CustomerInterest,TenantData} from '../types'

export interface Customer360Interest {interest:CustomerInterest;vehicle?:TenantData['vehicles'][number]}
export interface Customer360Summary {
 interests:Customer360Interest[]
 activeInterests:Customer360Interest[]
 upcomingEvents:CalendarEvent[]
 sale:Contract|null
 lastInteraction:CustomerInteraction|null
 nextEvent:CalendarEvent|null
}

const activeEvent=(status?:string)=>!['DONE','CANCELLED','CHIUSO'].includes(String(status||'').toUpperCase())
const interestRank:Record<string,number>={VINTA:6,TRATTATIVA:5,OFFERTA:4,TEST_DRIVE:3,INTERESSATO:2,PERSA:0}
const saleTime=(c:Contract)=>String(c.updated_at||c.contract_date||c.created_at||'')

export function buildCustomer360(data:TenantData,customerId:string,nowIso:string):Customer360Summary{
 const interests=data.customerInterests
  .filter(i=>i.customer_id===customerId)
  .map(interest=>({interest,vehicle:data.vehicles.find(v=>v.id===interest.vehicle_id&&!v.deleted_at)}))
  .sort((a,b)=>(interestRank[String(b.interest.status||'INTERESSATO').toUpperCase()]||1)-(interestRank[String(a.interest.status||'INTERESSATO').toUpperCase()]||1)||String(b.interest.updated_at||b.interest.created_at||'').localeCompare(String(a.interest.updated_at||a.interest.created_at||'')))
 const activeInterests=interests.filter(x=>String(x.interest.status||'').toUpperCase()!=='PERSA')
 const upcomingEvents=data.calendarEvents
  .filter(e=>e.customer_id===customerId&&activeEvent(e.status)&&Boolean(e.starts_at)&&String(e.starts_at)>=nowIso)
  .sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)))
 const sale=data.contracts
  .filter(c=>c.customer_id===customerId&&c.template_code==='VENDITA'&&c.sale_stage!=='CANCELLED')
  .sort((a,b)=>saleTime(b).localeCompare(saleTime(a)))[0]||null
 const lastInteraction=data.customerInteractions
  .filter(i=>i.customer_id===customerId)
  .sort((a,b)=>String(b.happened_at||b.created_at||'').localeCompare(String(a.happened_at||a.created_at||'')))[0]||null
 return {interests,activeInterests,upcomingEvents,sale,lastInteraction,nextEvent:upcomingEvents[0]||null}
}
