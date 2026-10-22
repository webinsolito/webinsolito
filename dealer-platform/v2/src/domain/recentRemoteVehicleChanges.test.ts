import {describe,expect,it} from 'vitest'
import {operationalVehicleStateChanges as changes,RECENT_REMOTE_CHANGE_MS,unexpiredRemoteChanges} from './recentRemoteVehicleChanges'
import type {SaleOperationsSnapshot} from './saleOperationsSync'
const base:SaleOperationsSnapshot={
 vehicles:[{id:'a',dealer_id:'dealer',status:'IN_VENDITA'},{id:'b',dealer_id:'dealer',status:'PRENOTATA'}],
 contracts:[{id:'c',dealer_id:'dealer',vehicle_id:'b',customer_id:'customer',template_code:'VENDITA',status:'DRAFT',sale_stage:'AGREED'}]
}
describe('Modifica 48 · evidenzia solo stati cambiati dopo la prima sincronizzazione',()=>{
 it('evidenzia solo l’auto effettivamente prenotata o consegnata',()=>{
  const remote={...base,vehicles:base.vehicles.map(v=>v.id==='a'?{...v,status:'PRENOTATA'}:v)}
  expect(changes(base,remote,'dealer')).toEqual(['a'])
  expect(changes(remote,{...remote,vehicles:remote.vehicles.map(v=>v.id==='a'?{...v,status:'CONSEGNATA'}:v)},'dealer')).toEqual(['a'])
 })
 it('riconosce nuova prenotazione e annullamento tramite i contratti',()=>{
  const remote={...base,contracts:[...base.contracts,{...base.contracts[0],id:'new',vehicle_id:'a'}]}
  expect(changes(base,remote,'dealer')).toEqual(['a'])
  expect(changes(remote,{...remote,contracts:remote.contracts.map(c=>c.id==='new'?{...c,sale_stage:'CANCELLED'}:c)},'dealer')).toEqual(['a'])
 })
 it('ignora variazioni soltanto di timestamp, scadenza, prezzo e ordine',()=>{
  const remote={...base,vehicles:base.vehicles.map(v=>({...v,updated_at:'2026-10-22T11:00:00Z'})),contracts:base.contracts.map(c=>({...c,updated_at:'2026-10-22T11:00:00Z',reservation_expires_at:'2026-11-01T11:00:00Z'}))}
  expect(changes(base,remote,'dealer')).toEqual([])
  expect(changes(base,{...base,contracts:base.contracts.map(c=>({...c,price:50000}))} as SaleOperationsSnapshot,'dealer')).toEqual([])
  expect(changes(base,{...base,vehicles:[...base.vehicles].reverse(),contracts:[...base.contracts].reverse()},'dealer')).toEqual([])
 })
 it('non evidenzia auto importate, estranee o di altre concessionarie',()=>{
  expect(changes(base,{...base,vehicles:[...base.vehicles,{id:'new',dealer_id:'dealer',status:'PRENOTATA'}]},'dealer')).toEqual([])
  const foreign={id:'foreign',dealer_id:'different-dealer',status:'CONSEGNATA'}
  expect(changes(base,{...base,vehicles:[...base.vehicles,foreign],contracts:[...base.contracts,{...base.contracts[0],id:'other',vehicle_id:'a',dealer_id:'different-dealer'}]},'dealer')).toEqual([])
 })
 it('rimuove il segnale allo scadere di 30 secondi',()=>{
  expect(RECENT_REMOTE_CHANGE_MS).toBe(30_000)
  expect(unexpiredRemoteChanges({a:30000,b:31000,c:20000},30000)).toEqual({b:31000})
  expect(unexpiredRemoteChanges({a:30000},30000)).toEqual({})
 })
})
