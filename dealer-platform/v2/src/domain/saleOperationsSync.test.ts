import {describe,it,expect} from 'vitest'
import {saleOperationsChanged,saleOperationsFingerprint,type SaleOperationsSnapshot} from './saleOperationsSync'
const local:SaleOperationsSnapshot={
 vehicles:[{id:'car',dealer_id:'dealer',status:'IN_VENDITA'}],
 contracts:[{id:'sale',dealer_id:'dealer',vehicle_id:'car',customer_id:'cust',template_code:'VENDITA',status:'DRAFT',sale_stage:'OPEN'}]
}
describe('Modifica 46 · stato vendita e disponibilità tra operatori',()=>{
 it('rileva nuovo stato, annullamento e altra prenotazione',()=>{
  expect(saleOperationsChanged(local,{...local,contracts:[{...local.contracts[0],sale_stage:'AGREED'}]},'dealer')).toBe(true)
  expect(saleOperationsChanged(local,{...local,contracts:[{...local.contracts[0],sale_stage:'CANCELLED'}]},'dealer')).toBe(true)
  expect(saleOperationsChanged(local,{...local,contracts:[...local.contracts,{...local.contracts[0],id:'new-sale'}]},'dealer')).toBe(true)
 })
 it('rileva disponibilità veicolo e proroga di prenotazione',()=>{
  expect(saleOperationsChanged(local,{...local,vehicles:[{...local.vehicles[0],status:'PRENOTATA'}]},'dealer')).toBe(true)
  expect(saleOperationsChanged(local,{...local,vehicles:[{...local.vehicles[0],status:'CONSEGNATA'}]},'dealer')).toBe(true)
  expect(saleOperationsChanged(local,{...local,contracts:[{...local.contracts[0],reservation_expires_at:'2026-11-02T00:00:00Z'}]},'dealer')).toBe(true)
 })
 it('non usa dati finanziari né modifiche di altre concessionarie',()=>{
  const foreign={...local.contracts[0],id:'other-sale',dealer_id:'other'}
  expect(saleOperationsChanged(local,{...local,contracts:[...local.contracts,foreign]},'dealer')).toBe(false)
  expect(saleOperationsChanged(local,{...local,contracts:[{...local.contracts[0],price:999} as typeof local.contracts[number]]},'dealer')).toBe(false)
  expect(saleOperationsChanged(local,{...local,vehicles:[...local.vehicles,{id:'other',dealer_id:'other',status:'PRENOTATA'}]},'dealer')).toBe(false)
 })
 it('l’ordine non modifica il fingerprint',()=>{
  expect(saleOperationsFingerprint(local,'dealer')).toEqual(saleOperationsFingerprint({vehicles:[...local.vehicles].reverse(),contracts:[...local.contracts].reverse()},'dealer'))
 })
})
