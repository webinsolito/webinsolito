import {describe,it,expect} from 'vitest'
import {canSeeFinance} from './lib/api'
import {buildPriorities} from './domain/priorities'
import type {SessionPayload,TenantData} from './types'
const session=(role:string,permissions:Record<string,boolean>={}):SessionPayload=>({access_token:'x',refresh_token:'y',dealer:{id:'d',slug:'malu23'},profile:{role,permissions}})
const empty:TenantData={vehicles:[],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]}
describe('MALÙ23 V2 security',()=>{
  it('VENDITORE never gains finance from dirty permissions',()=>expect(canSeeFinance(session('VENDITORE',{finance_view:true,view_costs:true,invoices_view:true}))).toBe(false))
  it('ADMIN can see finance',()=>expect(canSeeFinance(session('ADMIN'))).toBe(true))
  it('OPERATORE requires explicit permission',()=>{expect(canSeeFinance(session('OPERATORE'))).toBe(false);expect(canSeeFinance(session('OPERATORE',{finance_view:true}))).toBe(true)})
})
describe('MALÙ23 V2 today priorities',()=>{
  it('surfaces missing price, photo and aged stock',()=>{const data={...empty,vehicles:[{id:'v1',dealer_id:'d',brand:'Fiat',model:'500',status:'IN_VENDITA',purchase_date:'2026-07-01'}]};const p=buildPriorities(data,new Date('2026-10-14T12:00:00Z'));expect(p.map(x=>x.kind)).toEqual(expect.arrayContaining(['PRICE','PHOTO','AGE']))})
  it('does not nag delivered vehicles',()=>{const data={...empty,vehicles:[{id:'v1',dealer_id:'d',status:'CONSEGNATA',purchase_date:'2026-01-01'}]};expect(buildPriorities(data,new Date('2026-10-14T12:00:00Z'))).toHaveLength(0)})
  it('detects overdue work',()=>{const data={...empty,vehicles:[{id:'v1',dealer_id:'d',brand:'VW',model:'Golf',status:'IN_ARRIVO'}],workItems:[{id:'w1',dealer_id:'d',vehicle_id:'v1',title:'Tagliando',status:'TODO',due_date:'2026-10-10'}]};expect(buildPriorities(data,new Date('2026-10-14T12:00:00Z')).some(x=>x.kind==='WORK')).toBe(true)})
})
