export type ReservationEventType='BASELINE'|'RESERVED'|'EXTENDED'|'CANCELLED'|'RELEASED'|'DELIVERED'
export interface ReservationHistoryEvent{
 id:string;dealer_id:string;contract_id:string;vehicle_id:string;
 event_type:ReservationEventType;occurred_at:string;
 actor_user_id?:string|null;actor_name?:string|null;actor_role?:string|null;
 sale_stage_before?:string|null;sale_stage_after?:string|null;
 expires_at_before?:string|null;expires_at_after?:string|null;reason?:string|null;
}
const titles:Record<ReservationEventType,string>={
 BASELINE:'Prenotazione già in corso',
 RESERVED:'Auto prenotata',
 EXTENDED:'Prenotazione prorogata',
 CANCELLED:'Vendita annullata · auto liberata',
 RELEASED:'Prenotazione rilasciata',
 DELIVERED:'Veicolo consegnato'
}
export const reservationEventTitle=(event:Pick<ReservationHistoryEvent,'event_type'>)=>
 titles[event.event_type]||'Aggiornamento prenotazione'
export function reservationEventActor(event:Pick<ReservationHistoryEvent,'actor_name'|'actor_user_id'|'actor_role'|'event_type'>){
 if(event.event_type==='BASELINE')return 'Stato iniziale · non retroattivo'
 if(event.actor_name?.trim())return event.actor_name.trim()+(event.actor_role?' · '+event.actor_role:'')
 if(event.actor_user_id)return 'Operatore identificato'
 return 'Sistema / operatore non identificato'
}
export function reservationEventDetails(event:ReservationHistoryEvent){
 if(event.event_type==='EXTENDED')return [event.expires_at_before,event.expires_at_after]
 if(event.event_type==='RESERVED'||event.event_type==='BASELINE')return [null,event.expires_at_after]
 return [null,null]
}
export function sortReservationHistory(events:ReservationHistoryEvent[]){
 return [...events].sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)||b.id.localeCompare(a.id))
}
