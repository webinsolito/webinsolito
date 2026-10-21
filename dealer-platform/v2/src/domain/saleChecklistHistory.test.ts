import {describe,expect,it} from 'vitest'
import {saleChecklistHistoryActor,saleChecklistHistoryTitle,visibleSaleChecklistHistory,type SaleChecklistHistoryEvent} from './saleChecklistHistory'
import {DELIVERY_CHECKLIST} from './sale360'
const base:SaleChecklistHistoryEvent={id:'e1',dealer_id:'dealer',vehicle_id:'vehicle',work_item_id:'work',title:DELIVERY_CHECKLIST[0],event_type:'COMPLETED',occurred_at:'2026-10-21T16:30:00Z'}
const contract={dealer_id:'dealer',vehicle_id:'vehicle'}
describe('Modifica 42 · storico checklist in sola lettura',()=>{
 it('distingue completamento e correzione senza dati finanziari',()=>{
  expect(saleChecklistHistoryTitle(base)).toBe('Verifica completata')
  expect(saleChecklistHistoryTitle({...base,event_type:'CORRECTED'})).toBe('Verifica corretta')
 })
 it('mostra soltanto l’identità verificabile dell’operatore',()=>{
  expect(saleChecklistHistoryActor({...base,actor_name:' Giulia ',actor_role:'VENDITORE'})).toBe('Giulia · VENDITORE')
  expect(saleChecklistHistoryActor({...base,actor_user_id:'id'})).toBe('Operatore identificato')
  expect(saleChecklistHistoryActor(base)).toBe('Sistema / operatore non identificato')
 })
 it('rifiuta eventi di altri tenant, altre auto, voci inventate e operazioni ignote',()=>{
  const rows=[base,{...base,id:'foreign',dealer_id:'other'},{...base,id:'other-car',vehicle_id:'other'},
   {...base,id:'finance',title:'Acconto riservato'},{...base,id:'made-up',event_type:'PAID' as SaleChecklistHistoryEvent['event_type']}]
  expect(visibleSaleChecklistHistory(rows,contract)).toEqual([base])
 })
 it('ordina dal più recente senza mutare l’array originale',()=>{
  const newer={...base,id:'e2',occurred_at:'2026-10-21T17:30:00Z',event_type:'CORRECTED' as const}
  const rows=[base,newer]
  expect(visibleSaleChecklistHistory(rows,contract).map(x=>x.id)).toEqual(['e2','e1'])
  expect(rows[0].id).toBe('e1')
 })
})
