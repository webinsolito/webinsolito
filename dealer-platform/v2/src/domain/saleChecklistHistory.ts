import {DELIVERY_CHECKLIST} from './sale360'
import type {Contract,TenantData} from '../types'

export type SaleChecklistEventType='COMPLETED'|'CORRECTED'
export interface SaleChecklistHistoryEvent{
 id:string;dealer_id:string;vehicle_id:string;work_item_id:string;
 title:string;event_type:SaleChecklistEventType;occurred_at:string;
 actor_user_id?:string|null;actor_name?:string|null;actor_role?:string|null
}
export const saleChecklistHistoryTitle=(row:Pick<SaleChecklistHistoryEvent,'event_type'>)=>
 row.event_type==='COMPLETED'?'Verifica completata':'Verifica corretta'
export function saleChecklistHistoryActor(row:Pick<SaleChecklistHistoryEvent,'actor_name'|'actor_user_id'|'actor_role'>){
 if(row.actor_name?.trim())return row.actor_name.trim()+(row.actor_role?' · '+row.actor_role:'')
 if(row.actor_user_id)return 'Operatore identificato'
 return 'Sistema / operatore non identificato'
}
// Always apply tenant/vehicle/title scoping again before rendering returned REST rows.
export function visibleSaleChecklistHistory(rows:SaleChecklistHistoryEvent[],contract:Pick<Contract,'dealer_id'|'vehicle_id'>){
 return rows.filter(row=>row.dealer_id===contract.dealer_id&&row.vehicle_id===contract.vehicle_id
  &&DELIVERY_CHECKLIST.includes(row.title)&&['COMPLETED','CORRECTED'].includes(row.event_type)
  &&Boolean(row.id)&&Boolean(row.occurred_at))
  .sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)||b.id.localeCompare(a.id))
  .slice(0,100)
}

/** Attribute only a recorded event belonging to the exact work item and current state. */
export function inlineChecklistAttribution(
 events:SaleChecklistHistoryEvent[],items:TenantData['workItems'],contract:Pick<Contract,'dealer_id'|'vehicle_id'>,title:string,done:boolean
):string|null{
 if(!DELIVERY_CHECKLIST.includes(title))return null
 const workIds=new Set(items.filter(w=>w.dealer_id===contract.dealer_id&&w.vehicle_id===contract.vehicle_id
  &&String(w.category||'').toUpperCase()==='CONSEGNA'&&String(w.title||'').trim()===title
  &&(done?String(w.status||'').toUpperCase()==='DONE':
   !['DONE','CANCELLED','CHIUSO'].includes(String(w.status||'').toUpperCase()))).map(w=>w.id))
 if(!workIds.size)return null
 const row=visibleSaleChecklistHistory(events,contract).find(row=>row.title===title&&workIds.has(row.work_item_id))
 if(!row||row.event_type!==(done?'COMPLETED':'CORRECTED'))return null
 const date=new Date(row.occurred_at)
 if(Number.isNaN(date.getTime()))return null
 const timestamp=date.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
 return (done?'Completata':'Corretta')+' · '+saleChecklistHistoryActor(row)+' · '+timestamp
}
