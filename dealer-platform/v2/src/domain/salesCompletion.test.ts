import {describe,expect,it} from 'vitest'
import {DELIVERY_CHECKLIST} from './sale360'
import {filterIncompleteSales,incompleteSalesIndex,salesCompletionStatus} from './salesCompletion'
import type {Contract,TenantData} from '../types'

const dealer='dealer-a'
const sale=(id:string,extra:Partial<Contract>={}):Contract=>({
 id,dealer_id:dealer,customer_id:'cust-'+id,vehicle_id:'vehicle-'+id,
 contract_number:'SALE-'+id,template_code:'VENDITA',sale_stage:'READY',status:'SIGNED',...extra
})
const fullData=(contract:Contract,extra:Partial<TenantData>={}):TenantData=>({
 contracts:[contract],vehicles:[{id:contract.vehicle_id,dealer_id:dealer,plate:'AB123CD',vin:'WBA12345678901234'}],
 media:[{id:'m1',dealer_id:dealer,vehicle_id:contract.vehicle_id,kind:'PHOTO',object_key:'photos/photo-1.jpg'}],
 workItems:DELIVERY_CHECKLIST.map((title,i)=>({id:'w'+i,dealer_id:dealer,vehicle_id:contract.vehicle_id,category:'CONSEGNA',title,status:'DONE'})),
 customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],financials:[],costs:[],invoices:[],...extra
})
describe('Modifica 38 · filtro Da completare sulle Vendite',()=>{
 it('vende pronta, firmata, foto+VIN validi e checklist completa: nessuna verifica operativa mancante',()=>{
  const contract=sale('ready')
  const d=fullData(contract)
  expect(salesCompletionStatus(d,contract)).toMatchObject({count:0,checks:[]})
  expect(incompleteSalesIndex(d,[contract]).size).toBe(0)
 })
 it('firma, fase di vendita, foto, identificativi e checklist generano voci puntuali non duplicate',()=>{
  const contract=sale('missing',{sale_stage:'AGREED',status:'DRAFT'})
  const d=fullData(contract,{vehicles:[{id:contract.vehicle_id,dealer_id:dealer,plate:'',vin:''}],media:[],workItems:[]})
  const result=salesCompletionStatus(d,contract)!
  expect(result.count).toBe(5)
  expect(result.checks.map(x=>x.id)).toEqual(['stage','contract','identity','photo','checklist'])
  expect(result.checks.find(x=>x.id==='checklist')?.detail).toContain('7 controlli mancanti')
  expect(result.checks.some(x=>x.id==='finance')).toBe(false)
 })
 it('tiene conto di checklist parziale e non considera DONE di un altro dealer',()=>{
  const contract=sale('mixed')
  const workItems=DELIVERY_CHECKLIST.map((title,i)=>({id:'w'+i,dealer_id:i===0?dealer:'dealer-b',vehicle_id:contract.vehicle_id,category:'CONSEGNA',title,status:'DONE'}))
  const result=salesCompletionStatus(fullData(contract,{workItems}),contract)!
  expect(result.checks.map(x=>x.id)).toEqual(['checklist'])
  expect(result.checks[0].detail).toContain('6 controlli mancanti')
 })
 it('ignora foto e VIN provenienti da un dealer estraneo anche con vehicle_id coincidente',()=>{
  const contract=sale('foreign')
  const d=fullData(contract,{vehicles:[{id:contract.vehicle_id,dealer_id:'dealer-b',plate:'AB123CD',vin:'WBA12345678901234'}],
   media:[{id:'m-other',dealer_id:'dealer-b',vehicle_id:contract.vehicle_id,kind:'PHOTO',object_key:'private.jpg'}]})
  expect(salesCompletionStatus(d,contract)!.checks.map(x=>x.id)).toEqual(['identity','photo'])
 })
 it('vendite annullate e consegnate restano fuori anche se hanno verifiche incomplete',()=>{
  const a=sale('a',{sale_stage:'CANCELLED',status:'CANCELLED'}),b=sale('b',{sale_stage:'DELIVERED'})
  const d=fullData(a,{contracts:[a,b],vehicles:[],workItems:[],media:[]})
  expect(salesCompletionStatus(d,a)).toBeNull()
  expect(salesCompletionStatus(d,b)).toBeNull()
  expect(incompleteSalesIndex(d,[a,b]).size).toBe(0)
 })
 it('filtra i risultati ma mantiene ordine già ottenuto da ricerca e ordinamento',()=>{
  const ready=sale('ready'),todo=sale('todo',{sale_stage:'AGREED'}),old=sale('old',{sale_stage:'DELIVERED'})
  const d=fullData(ready,{contracts:[old,ready,todo],vehicles:[
    {id:ready.vehicle_id,dealer_id:dealer,plate:'AB123CD',vin:'WBA12345678901234'},
    {id:todo.vehicle_id,dealer_id:dealer,plate:'AB123CD',vin:'WBA12345678901234'}
   ],media:[
    {id:'m1',dealer_id:dealer,vehicle_id:ready.vehicle_id,object_key:'ready.jpg'},
    {id:'m2',dealer_id:dealer,vehicle_id:todo.vehicle_id,object_key:'todo.jpg'}],
   workItems:[...DELIVERY_CHECKLIST.map((title,i)=>({id:'r'+i,dealer_id:dealer,vehicle_id:ready.vehicle_id,category:'CONSEGNA',title,status:'DONE'})),
    ...DELIVERY_CHECKLIST.map((title,i)=>({id:'t'+i,dealer_id:dealer,vehicle_id:todo.vehicle_id,category:'CONSEGNA',title,status:'DONE'}))]})
  const index=incompleteSalesIndex(d,d.contracts)
  expect(index.size).toBe(1)
  expect(index.get('todo')?.checks.map(x=>x.id)).toEqual(['stage'])
  expect(filterIncompleteSales([old,todo,ready],index).map(x=>x.id)).toEqual(['todo'])
 })
 it('non usa fatture o finanziamenti per qualificare un caso come non operativo',()=>{
  const contract=sale('financial',{price:20000,financing_amount:12000,financing_status:'REQUESTED'})
  const d=fullData(contract)
  expect(salesCompletionStatus(d,contract)!.count).toBe(0)
  // La consegna definitiva resta vincolata al gate completo della scheda 360°.
 })
})
