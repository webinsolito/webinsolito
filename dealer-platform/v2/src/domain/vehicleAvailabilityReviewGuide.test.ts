import {describe,expect,it} from 'vitest'
import {vehicleAvailabilityReviewGuide as guide} from './vehicleAvailabilityReviewGuide'
import type {Contract,Vehicle} from '../types'

const dealer='dealer-a'
const car:Vehicle={id:'car-1',dealer_id:dealer,brand:'Audi',model:'A3',status:'PRENOTATA'}
const cancelled:Contract={
 id:'sale-cancel',dealer_id:dealer,vehicle_id:car.id,customer_id:'customer',contract_number:'V-ANNULLATA',
 template_code:'VENDITA',status:'CANCELLED',sale_stage:'CANCELLED',updated_at:'2026-10-22T10:00:00Z'
}
const draft:Contract={...cancelled,id:'sale-open',contract_number:'V-APERTA',status:'DRAFT',sale_stage:'OPEN',updated_at:'2026-10-22T11:00:00Z'}
describe('Modifica 50 · verifica guidata della disponibilità',()=>{
 it('linka la pratica annullata quando una vettura risulta ancora prenotata',()=>{
  const result=guide(car,[draft,cancelled],dealer)
  expect(result?.contractId).toBe(cancelled.id)
  expect(result?.actionLabel).toBe('Apri pratica V-ANNULLATA')
  expect(result?.instruction).toContain('annullata')
  expect(result?.reason).toContain('PRENOTATA')
 })
 it('segnala il blocco senza inventare contratti e apre la scheda auto',()=>{
  const result=guide({...car,status:'BLOCCATA'},[],dealer)
  expect(result?.contractId).toBeNull()
  expect(result?.instruction).toContain('motivo dello stato')
  expect(result?.actionLabel).toBe('Apri scheda auto')
 })
 it('collega una trattativa aperta, ma non la trasforma in prenotazione',()=>{
  const result=guide({...car,status:'BLOCCATA'},[cancelled,draft],dealer)
  expect(result?.contractId).toBe(draft.id)
  expect(result?.instruction).toContain('senza prenotazione attiva')
 })
 it('non mostra una guida per auto libere, prenotate correttamente o vendute',()=>{
  const agreed={...draft,id:'agreed',sale_stage:'AGREED',contract_number:'V-ATTIVA'}
  expect(guide({...car,status:'IN_VENDITA'},[],dealer)).toBeNull()
  expect(guide(car,[agreed],dealer)).toBeNull()
  expect(guide({...car,status:'CONSEGNATA'},[cancelled],dealer)).toBeNull()
 })
 it('non espone pratiche di altri veicoli, tenant o tipologie',()=>{
  const foreign={...cancelled,dealer_id:'dealer-b'}
  const otherCar={...cancelled,vehicle_id:'car-2'}
  const otherType={...cancelled,template_code:'ACQUISTO'}
  for(const unrelated of [foreign,otherCar,otherType]){
   const result=guide(car,[unrelated],dealer)
   expect(result?.contractId).toBeNull()
   expect(result?.instruction).not.toContain('V-ANNULLATA')
  }
  expect(guide({...car,dealer_id:'dealer-b'},[cancelled],dealer)).toBeNull()
  expect(guide({...car,deleted_at:'2026-10-22T12:00:00Z'},[cancelled],dealer)).toBeNull()
 })
 it('non inserisce dati del cliente, importi o informazioni finanziarie nel testo',()=>{
  const result=guide(car,[{...cancelled,price:100000,deposit:5000,notes:'DATI PRIVATI'}],dealer)
  expect(JSON.stringify(result)).not.toContain('100000')
  expect(JSON.stringify(result)).not.toContain('DATI PRIVATI')
 })
})
