import type {PriorityItem} from './priorities'
import type {TodayReservationCallback} from './todayReservationCallbacks'

export type TodayPrimaryAction=
 | {source:'OVERDUE_RESERVATION';callback:TodayReservationCallback}
 | {source:'PRIORITY';priority:PriorityItem}
 | {source:'UPCOMING_RESERVATION';callback:TodayReservationCallback}
 | {source:'NONE'}

const actionableReservation=(row:TodayReservationCallback)=>row.state!=='SCHEDULED'&&row.state!=='COMPLETED'

export function dedupeTodayPriorities(priorities:PriorityItem[],reservationCallbacks:TodayReservationCallback[]){
 const linkedCustomers=new Set(
  reservationCallbacks
   .filter(row=>row.linkedCustomerFollowup)
   .map(row=>row.customerId)
 )
 return priorities.filter(item=>!(
  item.kind==='CUSTOMER'&&
  item.customerId&&
  linkedCustomers.has(item.customerId)
 ))
}

export function selectTodayPrimaryAction(
 priorities:PriorityItem[],
 overdueReservations:TodayReservationCallback[],
 upcomingReservations:TodayReservationCallback[]
):TodayPrimaryAction{
 const overdue=overdueReservations.find(actionableReservation)
 if(overdue)return {source:'OVERDUE_RESERVATION',callback:overdue}
 if(priorities[0])return {source:'PRIORITY',priority:priorities[0]}
 const upcoming=upcomingReservations.find(actionableReservation)
 if(upcoming)return {source:'UPCOMING_RESERVATION',callback:upcoming}
 return {source:'NONE'}
}

export function remainingTodayPriorities(priorities:PriorityItem[],primary:TodayPrimaryAction,limit=12){
 if(primary.source!=='PRIORITY')return priorities.slice(0,limit)
 return priorities.filter(item=>item.id!==primary.priority.id).slice(0,limit)
}
