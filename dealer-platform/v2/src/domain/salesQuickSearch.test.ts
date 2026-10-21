import {describe,it,expect} from 'vitest'
import {filterSalesSegment,salesSegmentCounts,searchSales} from './salesView'
import type {Contract,TenantData} from '../types'
const dealer='dealer-A'
const sale=(id:string,customer_id:string,vehicle_id:string,stage='AGREED'):Contract=>({
 id,dealer_id:dealer,customer_id,vehicle_id,contract_number:id,template_code:'VENDITA',sale_stage:stage
})
const data={
 customers:[
  {id:'c1',dealer_id:dealer,first_name:'Giulìa',last_name:"D'Amico"},
  {id:'c2',dealer_id:dealer,first_name:'Marco',last_name:'Rossi'},
  {id:'c3',dealer_id:'another',first_name:'DATO',last_name:'RISERVATO'},
  {id:'c4',dealer_id:dealer,first_name:'Alba',last_name:'Bianchi',deleted_at:'2026-10-01T00:00:00Z'}
 ],
 vehicles:[
  {id:'v1',dealer_id:dealer,brand:'BMW',model:'X1',plate:'AB123CD'},
  {id:'v2',dealer_id:dealer,brand:'Audi',model:'A3',plate:'ZZ987YY'},
  {id:'v3',dealer_id:'another',brand:'SEGRETO',model:'Targa',plate:'XY123ZZ'},
  {id:'v4',dealer_id:dealer,brand:'Jeep',model:'Renegade',plate:'AA000BB',deleted_at:'2026-10-01T00:00:00Z'}
 ]
} as Pick<TenantData,'customers'|'vehicles'>
const rows=[
 sale('V-001-26','c1','v1'),
 sale('V-002-26','c2','v2','DELIVERED'),
 sale('V-003-26','c3','v3','CANCELLED'),
 sale('V-004-26','c4','v4')
]
describe('Modifica 34: ricerca rapida Vendite',()=>{
 it('cerca per nome e cognome, anche in ordine inverso e senza accenti',()=>{
  expect(searchSales(data,rows,'giulia').map(x=>x.id)).toEqual(['V-001-26'])
  expect(searchSales(data,rows,'amico giulia').map(x=>x.id)).toEqual(['V-001-26'])
  expect(searchSales(data,rows,'MARCO ROSSI').map(x=>x.id)).toEqual(['V-002-26'])
 })
 it('cerca targhe con e senza separatori, anche con lettere minuscole',()=>{
  for(const q of ['AB123CD','ab-123-cd','ab 123 cd'])expect(searchSales(data,rows,q).map(x=>x.id)).toEqual(['V-001-26'])
  expect(searchSales(data,rows,'zz987yy').map(x=>x.id)).toEqual(['V-002-26'])
 })
 it('cerca numero contratto con trattini o senza, inclusi archiviati',()=>{
  expect(searchSales(data,rows,'v00226').map(x=>x.id)).toEqual(['V-002-26'])
  expect(searchSales(data,rows,'V-003').map(x=>x.id)).toEqual(['V-003-26'])
  expect(searchSales(data,rows,'V-004').map(x=>x.id)).toEqual(['V-004-26'])
 })
 it('la ricerca ignora clienti e targhe non pertinenti al tenant o eliminati',()=>{
  for(const q of ['DATO','RISERVATO','SEGRETO','XY123ZZ','Alba','AA000BB']){
   expect(searchSales(data,rows,q).map(x=>x.id)).toEqual([])
  }
 })
 it('non espone importi, note finanziarie e altri dati non richiesti',()=>{
  const s={...rows[0],price:30000,deposit:1500,notes:'dati sensibili'}
  for(const q of ['30000','1500','sensibili'])expect(searchSales(data,[s],q)).toEqual([])
 })
 it('filtra per stato in modo indipendente e conserva ordine, con ALL esplicito',()=>{
  expect(filterSalesSegment(rows,'ALL')).toEqual(rows)
  expect(filterSalesSegment(rows,'ACTIVE').map(x=>x.id)).toEqual(['V-001-26','V-004-26'])
  expect(filterSalesSegment(rows,'DELIVERED').map(x=>x.id)).toEqual(['V-002-26'])
  expect(filterSalesSegment(rows,'CANCELLED').map(x=>x.id)).toEqual(['V-003-26'])
  expect(salesSegmentCounts(rows)).toEqual({ACTIVE:2,DELIVERED:1,CANCELLED:1})
  expect(searchSales(data,rows,'  ')).toEqual(rows)
 })
})
