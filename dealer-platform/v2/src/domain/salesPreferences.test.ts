import {describe,expect,it} from 'vitest'
import {DEFAULT_SALES_PREFERENCES,readSalesPreferences,saveSalesPreferences,salesPreferencesKey} from './salesPreferences'
import type {SessionPayload} from '../types'

const session=(dealer='d1',user='staff1'):SessionPayload=>({
 access_token:'not-saved',refresh_token:'not-saved',
 dealer:{id:dealer,slug:'sample'},user:{id:user},profile:{id:user,username:user,role:'VENDITORE'}
})
const storage=()=>{
 const data=new Map<string,string>()
 return {
  data,getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>{data.set(key,value)}
 }
}
describe('Modifica 37 · preferenze di consultazione Vendite per operatore',()=>{
 it('salva ordinamento, filtro e densità con sola struttura non personale e li ricarica',()=>{
  const db=storage(),key=salesPreferencesKey(session())!
  expect(readSalesPreferences(key,db)).toEqual(DEFAULT_SALES_PREFERENCES)
  expect(saveSalesPreferences(key,{sortMode:'DELIVERY',segment:'DELIVERED',viewMode:'EXPANDED'},db)).toBe(true)
  expect(readSalesPreferences(key,db)).toEqual({sortMode:'DELIVERY',segment:'DELIVERED',viewMode:'EXPANDED'})
  expect(db.data.get(key)).toBe('{"version":1,"sortMode":"DELIVERY","segment":"DELIVERED","viewMode":"EXPANDED"}')
 })
 it('non condivide preferenze tra utenti o concessionarie sullo stesso browser',()=>{
  const db=storage()
  const a=salesPreferencesKey(session('dealer1','alice'))!,b=salesPreferencesKey(session('dealer1','bob'))!,
   c=salesPreferencesKey(session('dealer2','alice'))!
  expect(new Set([a,b,c]).size).toBe(3)
  saveSalesPreferences(a,{sortMode:'RECENT',segment:'ALL',viewMode:'EXPANDED'},db)
  expect(readSalesPreferences(b,db)).toEqual(DEFAULT_SALES_PREFERENCES)
  expect(readSalesPreferences(c,db)).toEqual(DEFAULT_SALES_PREFERENCES)
 })
 it('rifiuta l’archiviazione se l’utente non è identificato, senza creare chiavi di ruolo condivise',()=>{
  const anonymous={...session(),user:undefined,profile:{role:'VENDITORE'}} as SessionPayload
  expect(salesPreferencesKey(anonymous)).toBeNull()
  const db=storage()
  expect(saveSalesPreferences(null,{sortMode:'RECENT',segment:'ALL',viewMode:'EXPANDED'},db)).toBe(false)
  expect(db.data.size).toBe(0)
  expect(readSalesPreferences(null,db)).toEqual(DEFAULT_SALES_PREFERENCES)
 })
 it('dati corrotti, formato futuro o valori estranei sono ignorati senza crash',()=>{
  const key=salesPreferencesKey(session())!,db=storage()
  db.setItem(key,'{bad')
  expect(readSalesPreferences(key,db)).toEqual(DEFAULT_SALES_PREFERENCES)
  db.setItem(key,JSON.stringify({version:2,segment:'CANCELLED'}))
  expect(readSalesPreferences(key,db)).toEqual(DEFAULT_SALES_PREFERENCES)
  db.setItem(key,JSON.stringify({version:1,sortMode:'INVALID',segment:'DELIVERED',viewMode:47}))
  expect(readSalesPreferences(key,db)).toEqual({sortMode:'PRIORITY',segment:'DELIVERED',viewMode:'COMPACT'})
 })
 it('la memorizzazione indisponibile non interrompe l’app',()=>{
  const blocked={getItem:()=>{throw new Error('denied')},setItem:()=>{throw new Error('denied')}} as unknown as Storage
  const key=salesPreferencesKey(session())!
  expect(readSalesPreferences(key,blocked)).toEqual(DEFAULT_SALES_PREFERENCES)
  expect(saveSalesPreferences(key,{...DEFAULT_SALES_PREFERENCES},blocked)).toBe(false)
 })
 it('ricorda il filtro Da completare soltanto per l’operatore selezionato',()=>{
  const db=storage(),alice=salesPreferencesKey(session('dealer','alice'))!,bob=salesPreferencesKey(session('dealer','bob'))!
  expect(saveSalesPreferences(alice,{sortMode:'DELIVERY',segment:'TO_COMPLETE',viewMode:'COMPACT'},db)).toBe(true)
  expect(readSalesPreferences(alice,db)).toMatchObject({sortMode:'DELIVERY',segment:'TO_COMPLETE'})
  expect(readSalesPreferences(bob,db)).toEqual(DEFAULT_SALES_PREFERENCES)
 })
 it('l’identità usata nella chiave ha fallback su id profilo o username ma non contiene credenziali',()=>{
  const alt={...session(),user:undefined,profile:{role:'VENDITORE',id:'p123'}} as SessionPayload
  expect(salesPreferencesKey(alt)).toContain('p123')
  expect(salesPreferencesKey(session())).not.toContain('not-saved')
  expect(salesPreferencesKey(session('A:1','account@domain.test'))).toContain('A%3A1')
 })
})
