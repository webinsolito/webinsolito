import {config} from './config'
import {getSession} from './api'
import type {Contract} from '../types'
import type {SaleChecklistHistoryEvent} from '../domain/saleChecklistHistory'

// Read-only: historical events are generated atomically in PostgreSQL, not by the browser.
export async function fetchSaleChecklistHistory(contract:Pick<Contract,'dealer_id'|'vehicle_id'>):Promise<SaleChecklistHistoryEvent[]>{
 const session=getSession()
 if(!session)throw new Error('session_required')
 if(contract.dealer_id!==session.dealer.id)throw new Error('sale_checklist_history_wrong_dealer')
 const params=new URLSearchParams({
  select:'id,dealer_id,vehicle_id,work_item_id,title,event_type,occurred_at,actor_user_id,actor_name,actor_role',
  dealer_id:'eq.'+session.dealer.id,vehicle_id:'eq.'+contract.vehicle_id,
  order:'occurred_at.desc,id.desc',limit:'100'
 })
 const res=await fetch(config.supabaseUrl+'/rest/v1/sale_checklist_events_v420?'+params.toString(),{
  method:'GET',headers:{apikey:config.supabasePublishableKey,authorization:'Bearer '+session.access_token,accept:'application/json'}
 })
 if(!res.ok)throw new Error('history_http_'+res.status)
 const rows:unknown=await res.json()
 if(!Array.isArray(rows))throw new Error('history_invalid_response')
 return rows as SaleChecklistHistoryEvent[]
}
