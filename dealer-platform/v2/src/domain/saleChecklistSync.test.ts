import {describe,it,expect} from 'vitest'
import {deliveryChecklistChanged,deliveryChecklistFingerprint} from './saleChecklistSync'
import type {VehicleWorkItem} from '../types'
const item:VehicleWorkItem={id:'w1',dealer_id:'dealer',vehicle_id:'auto',title:'Contratto firmato',category:'CONSEGNA',status:'TODO'}
const other:VehicleWorkItem={id:'w2',dealer_id:'dealer',vehicle_id:'auto',title:'Chiavi presenti',category:'CONSEGNA',status:'DONE'}
describe('Modifica 45 · sincronizzazione checklist fra operatori',()=>{
 it('riconosce completamenti, correzioni e nuove verifiche',()=>{
  expect(deliveryChecklistChanged([item],[{...item,status:'DONE'}],'dealer','auto')).toBe(true)
  expect(deliveryChecklistChanged([{...item,status:'DONE'}],[item],'dealer','auto')).toBe(true)
  expect(deliveryChecklistChanged([item],[item,other],'dealer','auto')).toBe(true)
 })
 it('ignora le differenze di ordinamento e gli altri lavori di officina',()=>{
  expect(deliveryChecklistChanged([item,other],[other,item],'dealer','auto')).toBe(false)
  expect(deliveryChecklistChanged([item],[item,{...other,category:'PREPARAZIONE'}],'dealer','auto')).toBe(false)
 })
 it('non accetta modifiche di altri concessionari o altre auto',()=>{
  expect(deliveryChecklistChanged([item],[item,{...other,dealer_id:'altro'}],'dealer','auto')).toBe(false)
  expect(deliveryChecklistChanged([item],[item,{...other,vehicle_id:'un-altra-auto'}],'dealer','auto')).toBe(false)
 })
 it('riconosce modifica timestamp senza mutare i dati e non interpreta note finanziarie',()=>{
  const current={...item,completed_at:'2026-10-22T09:00:00Z'}
  expect(deliveryChecklistChanged([item],[current],'dealer','auto')).toBe(true)
  expect(deliveryChecklistChanged([item],[{...item,note:'nota differente'}],'dealer','auto')).toBe(false)
  expect(deliveryChecklistFingerprint([item],'dealer','auto')).toEqual(deliveryChecklistFingerprint([item],'dealer','auto'))
 })
})
