import {describe,expect,it} from 'vitest'
import {buildSalesReservationOverview,filterSalesReservations} from './salesReservationOverview'
import {reservationCompletionPrefix} from './reservationFollowup'
import type {Contract,TenantData} from '../types'
const now='2026-10-21T10:00:00Z'
const booking=(id:string,expiry:string|null,extra:Partial<Contract>={}):Contract=>({
 id,contract_number:'V-'+id,dealer_id:'dealer',customer_id:'cust-'+id,vehicle_id:'vehicle-'+id,
 template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT',deposit:0,reservation_expires_at:expiry,...extra
} as Contract)
const source=(contracts:Contract[],customers:any[]=[],logs:any[]=[])=>({
 contracts,customers,customerInteractions:logs,vehicles:[]
} as Pick<TenantData,'contracts'|'customers'|'customerInteractions'|'vehicles'>)
const exp={over:'2026-10-19T09:00:00Z',soon:'2026-10-23T10:00:00Z',later:'2026-11-02T10:00:00Z'}
describe('Modifica 33: panorama prenotazioni sulle Vendite',()=>{
 it('conta prenotazioni reali e non vendite chiuse oppure aperte senza impegno',()=>{
  const view=buildSalesReservationOverview(source([
   booking('over',exp.over),booking('soon',exp.soon),booking('later',exp.later),
   booking('undated',null),booking('cancel',exp.over,{sale_stage:'CANCELLED'}),
   booking('delivered',exp.over,{sale_stage:'DELIVERED'}),
   booking('open',exp.over,{sale_stage:'OPEN',deposit:0})
  ]),now)
  expect(view.rows.map(x=>x.contractId)).toEqual(['over','soon','undated','later'])
  expect(view.counts).toMatchObject({active:4,overdue:1,soon:1,noDeadline:1,action:2,completed:0})
 })
 it('separa richiamo scaduto, programmato e completato senza duplicati',()=>{
  const done=booking('done',exp.soon)
  const log={id:'i1',dealer_id:'dealer',customer_id:'cust-done',
   title:reservationCompletionPrefix(done,'SOON')+'Cliente ricontattato',happened_at:'2026-10-21T09:00:00Z'}
  const customers=[
   {id:'cust-planned',dealer_id:'dealer',next_step:'Ricontatto prenotazione V-planned',next_contact_at:'2026-10-22T10:00:00Z'},
   {id:'cust-over',dealer_id:'dealer',next_step:'Ricontatto prenotazione V-over',next_contact_at:'2026-10-20T10:00:00Z'}
  ]
  const view=buildSalesReservationOverview(source([booking('over',exp.over),booking('planned',exp.soon),done],customers,[log]),now)
  expect(view.counts).toMatchObject({active:3,overdue:1,soon:2,action:1,scheduled:1,completed:1})
  expect(filterSalesReservations(view.rows,'ACTION').map(x=>x.contractId)).toEqual(['over'])
  expect(filterSalesReservations(view.rows,'SCHEDULED').map(x=>x.contractId)).toEqual(['planned'])
  expect(filterSalesReservations(view.rows,'COMPLETED').map(x=>x.contractId)).toEqual(['done'])
 })
 it('completamento nella finestra preventiva non chiude un richiamo scaduto successivo',()=>{
  const sale=booking('a',exp.over)
  const logs=[{id:'l',dealer_id:'dealer',customer_id:'cust-a',title:reservationCompletionPrefix(sale,'SOON')+'terminato'}]
  const view=buildSalesReservationOverview(source([sale],[],logs),now)
  expect(view.rows[0].callbackState).toBe('NEEDS_PLAN')
  expect(view.counts.action).toBe(1)
 })
 it('una data mancante viene trattata come tale e non come urgenza',()=>{
  const view=buildSalesReservationOverview(source([booking('undated',null),booking('later',exp.later)]),now)
  expect(view.counts).toMatchObject({active:2,overdue:0,soon:0,action:0,noDeadline:1})
  expect(filterSalesReservations(view.rows,'NO_DEADLINE').map(x=>x.contractId)).toEqual(['undated'])
  expect(filterSalesReservations(view.rows,'ALL')).toHaveLength(2)
 })
})
