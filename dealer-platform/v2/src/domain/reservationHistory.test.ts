import {describe,it,expect} from 'vitest'
import {reservationEventTitle,reservationEventActor,reservationEventDetails,sortReservationHistory,type ReservationHistoryEvent} from './reservationHistory'
const event=(v:Partial<ReservationHistoryEvent>={}):ReservationHistoryEvent=>({
 id:'e-1',dealer_id:'d',contract_id:'c',vehicle_id:'v',event_type:'RESERVED',
 occurred_at:'2026-10-20T13:00:00Z',expires_at_after:'2026-10-27T13:00:00Z',...v
})
describe('storico prenotazioni v27',()=>{
 it('nomina eventi reali e distingue lo stato iniziale dai fatti storici',()=>{
  expect(reservationEventTitle(event())).toBe('Auto prenotata')
  expect(reservationEventTitle(event({event_type:'BASELINE'}))).toBe('Prenotazione già in corso')
  expect(reservationEventTitle(event({event_type:'CANCELLED'}))).toContain('annullata')
 })
 it('mostra operatore registrato e nessun nominativo inventato',()=>{
  expect(reservationEventActor(event({actor_name:'Mario Rossi',actor_role:'VENDITORE'}))).toBe('Mario Rossi · VENDITORE')
  expect(reservationEventActor(event({actor_user_id:'test'}))).toBe('Operatore identificato')
  expect(reservationEventActor(event({event_type:'BASELINE',actor_name:null}))).toContain('non retroattivo')
 })
 it('proroga mostra prima e dopo, annullamento non divulga scadenze',()=>{
  const a=event({event_type:'EXTENDED',expires_at_before:'old',expires_at_after:'new'})
  expect(reservationEventDetails(a)).toEqual(['old','new'])
  expect(reservationEventDetails(event({event_type:'CANCELLED'}))).toEqual([null,null])
 })
 it('ordinamento cronologico con copia senza modificare i dati',()=>{
  const a=event(),b=event({id:'e-2',occurred_at:'2026-10-21T13:00:00Z'})
  const arr=[a,b]
  expect(sortReservationHistory(arr).map(x=>x.id)).toEqual(['e-2','e-1'])
  expect(arr[0].id).toBe('e-1')
 })
})
