import {describe,expect,it} from 'vitest'
import {buildUpcomingReservationCallbacks,buildTodayReservationCallbacks,overdueCallbackCounts,overdueCallbackLabel} from './todayReservationCallbacks'
import type {Contract,TenantData} from '../types'
const now='2026-10-21T09:00:00.000Z'
const sale=(id:string,exp:string|null,extra:Partial<Contract>={}):Contract=>({
 id,contract_number:'SALE-'+id,dealer_id:'d',customer_id:'c-'+id,vehicle_id:'v-'+id,
 template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT',deposit:0,
 reservation_expires_at:exp,...extra
} as Contract)
const data=(contracts:Contract[],customers:any[]=[],interactions:any[]=[],vehicles:any[]=[])=>({contracts,customers,customerInteractions:interactions,vehicles} as Pick<TenantData,'contracts'|'customers'|'customerInteractions'|'vehicles'>)
describe('Modifica 31: prevenzione prenotazioni entro 72 ore',()=>{
 it('include 1 minuto, esattamente 72 ore, non oltre né già scadute; annullate/consegnate escluse',()=>{
  const source=data([
   sale('soon','2026-10-21T09:01:00Z'),sale('edge','2026-10-24T09:00:00Z'),
   sale('later','2026-10-24T09:00:01Z'),sale('past','2026-10-21T08:59:59Z'),
   sale('cancel','2026-10-22T09:00:00Z',{sale_stage:'CANCELLED'}),
   sale('delivered','2026-10-22T09:00:00Z',{sale_stage:'DELIVERED'}),
   sale('none',null)
  ])
  const upcoming=buildUpcomingReservationCallbacks(source,now)
  expect(upcoming.map(x=>x.contractId)).toEqual(['soon','edge'])
  expect(buildTodayReservationCallbacks(source,now).map(x=>x.contractId)).toEqual(['past'])
 })
 it('distingue richiamo già scaduto, nuovo cliente, contatto già registrato e richiamo prima della scadenza',()=>{
  const source=data([
   sale('due','2026-10-23T09:00:00Z'),sale('new','2026-10-23T10:00:00Z'),
   sale('contacted','2026-10-23T11:00:00Z'),sale('scheduled','2026-10-23T11:00:00Z')
  ],[
   {id:'c-due',dealer_id:'d',next_step:'Ricontatto prenotazione SALE-due',next_contact_at:'2026-10-21T08:00:00Z'},
   {id:'c-scheduled',dealer_id:'d',next_step:'Ricontatto prenotazione SALE-scheduled',next_contact_at:'2026-10-22T08:00:00Z'}
  ],[
   {id:'i1',dealer_id:'d',customer_id:'c-contacted',title:'Prenotazione SALE-contacted · Non risponde · Chiamato',happened_at:'2026-10-21T07:00:00Z'}
  ])
  const rows=buildUpcomingReservationCallbacks(source,now)
  expect(rows.map(x=>x.state)).toEqual(['CALLBACK_DUE','NEEDS_CONTACT','NEEDS_PLAN','SCHEDULED'])
  expect(overdueCallbackCounts(rows)).toEqual({toDo:3,scheduled:1})
 })
 it('richiamo dopo scadenza non va dichiarato gestito: occorre anticiparlo',()=>{
  const s=sale('after','2026-10-23T09:00:00Z')
  const customer={id:'c-after',dealer_id:'d',next_step:'Ricontatto prenotazione SALE-after',next_contact_at:'2026-10-25T10:00:00Z'}
  const [row]=buildUpcomingReservationCallbacks(data([s],[customer]),now)
  expect(row.state).toBe('AFTER_EXPIRY')
  expect(row.callbackAt).toBe('2026-10-25T10:00:00Z')
  expect(overdueCallbackLabel(row.state)).toContain('anticipa')
  expect(overdueCallbackCounts([row])).toEqual({toDo:1,scheduled:0})
 })
 it('ignora clienti, auto e interazioni appartenenti ad altre concessionarie',()=>{
  const [row]=buildUpcomingReservationCallbacks(data([sale('one','2026-10-22T11:00:00Z')],
   [{id:'c-one',dealer_id:'other',first_name:'Private',next_step:'Ricontatto prenotazione SALE-one',next_contact_at:'2026-10-22T10:00:00Z'}],
   [{customer_id:'c-one',dealer_id:'other',title:'Prenotazione SALE-one · Conferma interesse · Private'}],
   [{id:'v-one',dealer_id:'other',brand:'Secret'}]),now)
  expect(row).toMatchObject({customerName:'Cliente non disponibile',vehicleName:'Auto non disponibile',state:'NEEDS_CONTACT',lastContactTitle:null})
 })
 it('invalid date is not actionable; per-sale callbacks never cross the expiry boundary as scheduled',()=>{
  expect(buildUpcomingReservationCallbacks(data([sale('x','2026-10-22T09:00:00Z')]),'bad')).toEqual([])
  const [row]=buildUpcomingReservationCallbacks(data([sale('x','2026-10-22T09:00:00Z')],[{id:'c-x',dealer_id:'d',next_step:'Ricontatto prenotazione SALE-x',next_contact_at:'2026-10-22T09:00:00Z'}]),now)
  expect(row.state).toBe('SCHEDULED')
 })
})
