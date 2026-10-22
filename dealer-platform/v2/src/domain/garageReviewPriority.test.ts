import {describe,expect,it} from 'vitest'
import {compareGarageReviewPriority,garageReviewPriority} from './garageReviewPriority'
import type {Vehicle} from '../types'

const vehicle=(status:string):Vehicle=>({id:status,dealer_id:'dealer',status})
describe('Modifica 51 · priorità visualizzazione anomalie Garage',()=>{
 it('considera gli stati prenotati senza contratto come priorità più alta',()=>{
  expect(garageReviewPriority(vehicle('PRENOTATA'))).toEqual({kind:'reservation',rank:0,label:'Prenotazione incoerente'})
  expect(garageReviewPriority(vehicle(' riservata ')).rank).toBe(0)
 })
 it('distingue auto esplicitamente bloccate da altre indisponibilità',()=>{
  for(const state of ['BLOCCATA','NON_DISPONIBILE'])expect(garageReviewPriority(vehicle(state)).kind).toBe('blocked')
  for(const state of ['RITIRATA','FUORI_VENDITA','IN_CONSEGNA','DA_CONSEGNARE'])expect(garageReviewPriority(vehicle(state)).kind).toBe('other')
 })
 it('mantiene l’ordine relativo per gravità uguale e non modifica le righe sorgenti',()=>{
  const items=[vehicle('RITIRATA'),vehicle('BLOCCATA'),vehicle('RISERVATA'),vehicle('NON_DISPONIBILE'),vehicle('PRENOTATA'),vehicle('FUORI_VENDITA')]
  const snapshot=items.map(v=>v.status)
  const ordered=[...items].sort(compareGarageReviewPriority).map(v=>v.status)
  expect(ordered).toEqual(['RISERVATA','PRENOTATA','BLOCCATA','NON_DISPONIBILE','RITIRATA','FUORI_VENDITA'])
  expect(items.map(v=>v.status)).toEqual(snapshot)
  expect(compareGarageReviewPriority(vehicle('BLOCCATA'),vehicle('NON_DISPONIBILE'))).toBe(0)
 })
 it('non legge clienti, prezzi, date, margini o contratti per attribuire la priorità',()=>{
  const first={...vehicle('BLOCCATA'),asking_price:999999,created_at:'1990-01-01'}
  expect(garageReviewPriority(first)).toEqual(garageReviewPriority(vehicle('BLOCCATA')))
 })
})
