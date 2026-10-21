import {describe,it,expect} from 'vitest'
import {resolveSaleChecklistAction} from './saleChecklistActions'
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
