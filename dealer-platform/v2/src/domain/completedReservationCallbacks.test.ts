import {describe,expect,it} from 'vitest'
import {buildUpcomingReservationCallbacks,buildTodayReservationCallbacks,completedReservationCallbackCount,overdueCallbackCounts} from './todayReservationCallbacks'
import {latestReservationCompletion,reservationCompletionPrefix,reservationCompletionTitle} from './reservationFollowup'
import type {Contract,TenantData} from '../types'
const now='2026-10-21T10:00:00Z'
const s=(id:string,expiry:string)=>({id,contract_number:'R-'+id,dealer_id:'d',customer_id:'c-'+id,vehicle_id:'v-'+id,
 template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT',deposit:0,reservation_expires_at:expiry} as Contract)
const data=(sale:Contract,interactions:any[]=[],customer:any={})=>({
 contracts:[sale],vehicles:[],customers:[{id:sale.customer_id,dealer_id:'d',...customer}],customerInteractions:interactions
} as Pick<TenantData,'contracts'|'vehicles'|'customers'|'customerInteractions'>)
const log=(sale:Contract,window:'SOON'|'OVERDUE',time:string)=>({
 id:'log',customer_id:sale.customer_id,dealer_id:'d',
 title:reservationCompletionPrefix(sale,window)+'Chiamata terminata con esito confermato',happened_at:time,channel:'NOTE'
})
describe('Modifica 32 · chiusura richiamo senza ripetizione',()=>{
 it('un richiamo concluso prima della scadenza non è più da fare, ma rimane nel conteggio completati',()=>{
  const sale=s('1','2026-10-22T10:00:00Z')
  const rows=buildUpcomingReservationCallbacks(data(sale,[log(sale,'SOON','2026-10-21T09:00:00Z')]),now)
  expect(rows[0].state).toBe('COMPLETED')
  expect(overdueCallbackCounts(rows)).toEqual({toDo:0,scheduled:0})
  expect(completedReservationCallbackCount(rows)).toBe(1)
 })
 it('se lo stesso richiamo viene riprogrammato dopo il completamento torna programmato',()=>{
  const sale=s('1','2026-10-22T10:00:00Z')
  const rows=buildUpcomingReservationCallbacks(data(sale,[log(sale,'SOON','2026-10-21T09:00:00Z')],{
   next_step:'Ricontatto prenotazione R-1',next_contact_at:'2026-10-22T08:00:00Z',updated_at:'2026-10-21T09:30:00Z'
  }),now)
  expect(rows[0].state).toBe('SCHEDULED')
  expect(completedReservationCallbackCount(rows)).toBe(0)
 })
 it('un completamento della fase SOON non silenzia la verifica OVERDUE successiva',()=>{
  const sale=s('1','2026-10-22T10:00:00Z')
  const source=data(sale,[log(sale,'SOON','2026-10-21T09:00:00Z')])
  expect(buildUpcomingReservationCallbacks(source,now)[0].state).toBe('COMPLETED')
  expect(buildTodayReservationCallbacks(source,'2026-10-23T10:00:00Z')[0].state).toBe('NEEDS_PLAN')
 })
 it('annullamento o proroga elimina il completamento dalla vista delle prenotazioni non più in scadenza',()=>{
  const sale=s('1','2026-10-22T10:00:00Z')
  const d=data(sale,[log(sale,'SOON','2026-10-21T09:00:00Z')])
  expect(buildUpcomingReservationCallbacks(d,now)).toHaveLength(1)
  sale.reservation_expires_at='2026-11-06T10:00:00Z'
  expect(buildUpcomingReservationCallbacks(d,now)).toHaveLength(0)
  sale.reservation_expires_at='2026-10-22T10:00:00Z';sale.sale_stage='CANCELLED'
  expect(buildUpcomingReservationCallbacks(d,now)).toHaveLength(0)
 })
 it('lo storico è isolato per vendita e dealer',()=>{
  const sale=s('1','2026-10-22T10:00:00Z')
  const wrong={...log(sale,'SOON','2026-10-21T09:00:00Z'),dealer_id:'other'}
  const wrongSale={...log(sale,'SOON','2026-10-21T09:00:00Z'),title:'Prenotazione R-2 · Richiamo completato · SOON · 2026-10-22T10:00:00Z · Note'}
  expect(buildUpcomingReservationCallbacks(data(sale,[wrong,wrongSale]),now)[0].state).toBe('NEEDS_CONTACT')
  expect(latestReservationCompletion(sale,[wrongSale],'SOON')).toBeNull()
 })
 it('nuovo contatto successivo a completamento riapre la necessità di una prossima azione',()=>{
  const sale=s('1','2026-10-22T10:00:00Z')
  const last={id:'later',customer_id:sale.customer_id,dealer_id:'d',title:'Prenotazione R-1 · Non risponde · Nuovo tentativo',happened_at:'2026-10-21T09:10:00Z'}
  expect(buildUpcomingReservationCallbacks(data(sale,[log(sale,'SOON','2026-10-21T09:00:00Z'),last]),now)[0].state).toBe('NEEDS_PLAN')
 })
 it('titolo di completamento richiede nota valida e scadenza davvero attiva',()=>{
  const future=new Date(Date.now()+86400000).toISOString()
  const sale=s('v',future)
  expect(reservationCompletionTitle(sale,'SOON','Contatto verificato')).toContain('Richiamo completato · SOON ·')
  expect(()=>reservationCompletionTitle(sale,'SOON','no')).toThrow()
  expect(()=>reservationCompletionTitle({...sale,sale_stage:'CANCELLED'},'SOON','Note sufficienti')).toThrow()
 })
})
