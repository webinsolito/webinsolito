import {describe,it,expect} from 'vitest'
import {resolveSaleChecklistAction,resolveSaleChecklistUndo} from './saleChecklistActions'
import {DELIVERY_CHECKLIST} from './sale360'
import type {Contract,TenantData} from '../types'
const dealer='dealer-one'
const sale:Contract={id:'sale-one',dealer_id:dealer,customer_id:'customer-one',vehicle_id:'vehicle-one',contract_number:'V-1',template_code:'VENDITA',sale_stage:'READY',status:'SIGNED'}
const data:TenantData={vehicles:[{id:'vehicle-one',dealer_id:dealer}],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[sale],financials:[],costs:[],invoices:[]}
const title=DELIVERY_CHECKLIST[2]
describe('Modifica 40 · completamento selettivo checklist vendita',()=>{
 it('una voce mancante viene creata soltanto per questa auto',()=>expect(resolveSaleChecklistAction(data,sale,title)).toEqual({kind:'CREATE'}))
 it('completa una voce già presente senza creare duplicati',()=>{
  const item={id:'item-one',dealer_id:dealer,vehicle_id:sale.vehicle_id,title,category:'CONSEGNA',status:'TODO'}
  expect(resolveSaleChecklistAction({...data,workItems:[item]},sale,title)).toEqual({kind:'EXISTING',item})
 })
 it('una voce già completata non viene aggiornata di nuovo',()=>{
  expect(resolveSaleChecklistAction({...data,workItems:[{id:'one',dealer_id:dealer,vehicle_id:sale.vehicle_id,title,category:'CONSEGNA',status:'DONE'}]},sale,title)).toEqual({kind:'DONE'})
 })
 it('ignora le altre concessionarie, le altre auto e le categorie errate',()=>{
  const workItems=[
   {id:'foreign',dealer_id:'dealer-two',vehicle_id:sale.vehicle_id,title,category:'CONSEGNA',status:'DONE'},
   {id:'other-vehicle',dealer_id:dealer,vehicle_id:'vehicle-two',title,category:'CONSEGNA',status:'DONE'},
   {id:'wrong-category',dealer_id:dealer,vehicle_id:sale.vehicle_id,title,category:'DOCUMENTI',status:'DONE'}
  ]
  expect(resolveSaleChecklistAction({...data,workItems},sale,title).kind).toBe('CREATE')
 })
 it('non consente titoli arbitrari né vendite terminali',()=>{
  expect(()=>resolveSaleChecklistAction(data,sale,'Fattura riservata')).toThrow('non riconosciuta')
  expect(()=>resolveSaleChecklistAction(data,{...sale,sale_stage:'DELIVERED'},title)).toThrow('non è più modificabile')
  expect(()=>resolveSaleChecklistAction(data,{...sale,sale_stage:'CANCELLED'},title)).toThrow('non è più modificabile')
 })
 it('non lavora con una scheda veicolo estranea alla concessionaria',()=>{
  expect(()=>resolveSaleChecklistAction({...data,vehicles:[{id:'vehicle-one',dealer_id:'dealer-two'}]},sale,title)).toThrow('Auto della concessionaria')
 })
})

describe('Modifica 41 · correzione protetta checklist',()=>{
 const done={id:'completed',dealer_id:dealer,vehicle_id:sale.vehicle_id,title,category:'CONSEGNA',status:'DONE',completed_at:'2026-10-21T12:00:00Z'}
 it('individua una sola attività DONE della vendita corretta',()=>{
  expect(resolveSaleChecklistUndo({...data,workItems:[done]},sale,title)).toEqual(done)
 })
 it('blocca la correzione di una verifica non completata',()=>{
  expect(()=>resolveSaleChecklistUndo({...data,workItems:[{...done,status:'TODO'}]},sale,title)).toThrow('non risulta più completata')
 })
 it('blocca vendite consegnate, annullate e veicoli fuori concessionaria',()=>{
  const d={...data,workItems:[done]}
  expect(()=>resolveSaleChecklistUndo(d,{...sale,sale_stage:'DELIVERED'},title)).toThrow('non è più modificabile')
  expect(()=>resolveSaleChecklistUndo(d,{...sale,sale_stage:'CANCELLED'},title)).toThrow('non è più modificabile')
  expect(()=>resolveSaleChecklistUndo({...d,vehicles:[{id:sale.vehicle_id,dealer_id:'alien'}]},sale,title)).toThrow('Auto della concessionaria')
 })
 it('ignora le righe concluse della concessionaria estranea',()=>{
  const foreign={...done,dealer_id:'alien'}
  expect(()=>resolveSaleChecklistUndo({...data,workItems:[foreign]},sale,title)).toThrow('non risulta più completata')
 })
 it('rifiuta le doppie attestazioni DONE per non lasciare il gate erroneamente verde',()=>{
  expect(()=>resolveSaleChecklistUndo({...data,workItems:[done,{...done,id:'other'}]},sale,title)).toThrow('più verifiche completate')
 })
 it('rifiuta verifiche fuori dalla checklist definita',()=>{
  expect(()=>resolveSaleChecklistUndo({...data,workItems:[done]},sale,'Verifica inventata')).toThrow('non riconosciuta')
 })
})
