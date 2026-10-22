import {describe,expect,it} from 'vitest'
import {filterSaleChecklistHistory,inlineChecklistAttribution,saleChecklistHistoryActor,saleChecklistHistoryTitle,visibleSaleChecklistHistory,type SaleChecklistHistoryEvent} from './saleChecklistHistory'
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

describe('Modifica 43 · operatore e orario accanto alla verifica',()=>{
 const items=[
  {id:'work',dealer_id:'dealer',vehicle_id:'vehicle',title:base.title,category:'CONSEGNA',status:'DONE'},
  {id:'undo',dealer_id:'dealer',vehicle_id:'vehicle',title:DELIVERY_CHECKLIST[1],category:'CONSEGNA',status:'TODO'}
 ]
 it('mostra il completamento solo del lavoro esatto, con ora reale',()=>{
  const s=inlineChecklistAttribution([{...base,actor_name:'Giulia',actor_role:'VENDITORE'}],items,contract,base.title,true)
  expect(s).toContain('Completata · Giulia · VENDITORE')
  expect(s).toContain('21/10/2026')
 })
 it('mostra la correzione dopo un vero rollback a TODO',()=>{
  const event={...base,title:DELIVERY_CHECKLIST[1],work_item_id:'undo',event_type:'CORRECTED' as const,actor_name:'Marco'}
  expect(inlineChecklistAttribution([event],items,contract,DELIVERY_CHECKLIST[1],false)).toContain('Corretta · Marco')
  expect(inlineChecklistAttribution([event],items,contract,DELIVERY_CHECKLIST[1],true)).toBeNull()
 })
 it('rifiuta eventi di altro lavoro, tenant, auto, o non coerenti con lo stato attuale',()=>{
  expect(inlineChecklistAttribution([{...base,work_item_id:'another'}],items,contract,base.title,true)).toBeNull()
  expect(inlineChecklistAttribution([{...base,dealer_id:'foreign'}],items,contract,base.title,true)).toBeNull()
  expect(inlineChecklistAttribution([{...base,vehicle_id:'other'}],items,contract,base.title,true)).toBeNull()
  expect(inlineChecklistAttribution([{...base,event_type:'CORRECTED'}],items,contract,base.title,true)).toBeNull()
 })
 it('non inventa autore e data in assenza di eventi precedenti alla registrazione',()=>{
  expect(inlineChecklistAttribution([],items,contract,base.title,true)).toBeNull()
  expect(inlineChecklistAttribution([],items,contract,DELIVERY_CHECKLIST[1],false)).toBeNull()
 })
})

describe('Modifica 44 · accesso immediato allo storico della singola verifica',()=>{
 const related={...base,id:'second',event_type:'CORRECTED' as const,occurred_at:'2026-10-22T07:10:00Z'}
 const other={...base,id:'another-check',title:DELIVERY_CHECKLIST[1]}
 const rows=[related,other,base]
 it('filtra esclusivamente la verifica selezionata, mantenendo tutti gli eventi e l’ordine',()=>{
  expect(filterSaleChecklistHistory(rows,DELIVERY_CHECKLIST[0]).map(e=>e.id)).toEqual(['second','e1'])
  expect(rows).toHaveLength(3)
 })
 it('mostra lo storico completo quando si annulla il filtro',()=>{
  expect(filterSaleChecklistHistory(rows,null)).toBe(rows)
  expect(filterSaleChecklistHistory(rows,undefined)).toBe(rows)
 })
 it('non accetta un filtro non appartenente alle 7 verifiche',()=>{
  expect(filterSaleChecklistHistory(rows,'Saldo privato inventato')).toEqual([])
 })
 it('una verifica senza eventi mostra zero eventi, senza fabbricare dati',()=>{
  expect(filterSaleChecklistHistory(rows,DELIVERY_CHECKLIST[6])).toEqual([])
 })
})
