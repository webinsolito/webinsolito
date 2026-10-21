import {DELIVERY_CHECKLIST} from './sale360'
import type {Contract} from '../types'

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
