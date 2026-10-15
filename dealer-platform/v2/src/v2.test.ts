import {describe,it,expect} from 'vitest'
import {canSeeFinance,canWriteCalendar,canWriteCustomers,canWriteGarage} from './lib/api'
import {buildPriorities} from './domain/priorities'
import {normalizeVehicleDraft,storageObjectPath,validateVehicleDraft,vehicleCompleteness} from './domain/garage'
import type {SessionPayload,TenantData,Vehicle} from './types'
const session=(role:string,permissions:Record<string,boolean>={}):SessionPayload=>({access_token:'x',refresh_token:'y',dealer:{id:'d',slug:'malu23'},profile:{role,permissions}})
const empty:TenantData={vehicles:[],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]}
describe('MALÙ23 V2 security',()=>{
  it('VENDITORE never gains finance from dirty permissions',()=>expect(canSeeFinance(session('VENDITORE',{finance_view:true,view_costs:true,invoices_view:true}))).toBe(false))
  it('ADMIN can see finance',()=>expect(canSeeFinance(session('ADMIN'))).toBe(true))
  it('OPERATORE requires explicit finance permission',()=>{expect(canSeeFinance(session('OPERATORE'))).toBe(false);expect(canSeeFinance(session('OPERATORE',{finance_view:true}))).toBe(true)})
  it('Garage writes are limited to operational roles or explicit permission',()=>{expect(canWriteGarage(session('ADMIN'))).toBe(true);expect(canWriteGarage(session('VENDITORE'))).toBe(true);expect(canWriteGarage(session('OPERATORE'))).toBe(true);expect(canWriteGarage(session('AMMINISTRAZIONE'))).toBe(false);expect(canWriteGarage(session('AMMINISTRAZIONE',{garage_write:true}))).toBe(true)})
  it('Customer writes mirror live RLS roles and permission',()=>{expect(canWriteCustomers(session('ADMIN'))).toBe(true);expect(canWriteCustomers(session('VENDITORE'))).toBe(true);expect(canWriteCustomers(session('OPERATORE'))).toBe(false);expect(canWriteCustomers(session('OPERATORE',{customers_write:true}))).toBe(true)})
  it('Calendar writes stay available to operational roles',()=>{expect(canWriteCalendar(session('ADMIN'))).toBe(true);expect(canWriteCalendar(session('VENDITORE'))).toBe(true);expect(canWriteCalendar(session('AMMINISTRAZIONE'))).toBe(true);expect(canWriteCalendar(session('OPERATORE'))).toBe(true)})
})
describe('MALÙ23 V2 Garage domain',()=>{
  it('normalizes vehicle identity fields before persistence',()=>{const v=normalizeVehicleDraft({brand:' Peugeot ',model:' 308 ',plate:'ab123cd',vin:' vf3abc123 ',year:2022,mileage:58000,asking_price:18900});expect(v.brand).toBe('Peugeot');expect(v.model).toBe('308');expect(v.plate).toBe('AB123CD');expect(v.vin).toBe('VF3ABC123')})
  it('rejects invalid essential vehicle data',()=>{expect(validateVehicleDraft({brand:'',model:'308'}).valid).toBe(false);expect(validateVehicleDraft({brand:'Peugeot',model:'308',year:1900}).valid).toBe(false)})
  it('computes explicit completeness without inventing data',()=>{const v:Vehicle={id:'v',dealer_id:'d',brand:'Peugeot',model:'308',plate:'AB123CD',year:2022,mileage:58000,status:'IN_VENDITA',asking_price:18900};expect(vehicleCompleteness(v,6).percent).toBe(100);const incomplete=vehicleCompleteness({...v,asking_price:null},1);expect(incomplete.percent).toBeLessThan(100);expect(incomplete.missing).toEqual(expect.arrayContaining(['Prezzo cliente','Almeno 6 foto']))})
  it('creates tenant and vehicle scoped media paths with sanitized names',()=>expect(storageObjectPath('dealer','vehicle','media','foto iPhone #1.JPG')).toBe('private/dealer/vehicle/media/foto-iPhone-1.JPG'))
})
describe('MALÙ23 V2 today priorities',()=>{
  it('surfaces missing price, photo and aged stock',()=>{const data={...empty,vehicles:[{id:'v1',dealer_id:'d',brand:'Fiat',model:'500',status:'IN_VENDITA',purchase_date:'2026-07-01'}]};const p=buildPriorities(data,new Date('2026-10-14T12:00:00'));expect(p.map(x=>x.kind)).toEqual(expect.arrayContaining(['PRICE','PHOTO','AGE']))})
  it('does not nag delivered vehicles',()=>{const data={...empty,vehicles:[{id:'v1',dealer_id:'d',status:'CONSEGNATA',purchase_date:'2026-01-01'}]};expect(buildPriorities(data,new Date('2026-10-14T12:00:00'))).toHaveLength(0)})
  it('detects overdue work',()=>{const data={...empty,vehicles:[{id:'v1',dealer_id:'d',brand:'VW',model:'Golf',status:'IN_ARRIVO'}],workItems:[{id:'w1',dealer_id:'d',vehicle_id:'v1',title:'Tagliando',status:'TODO',due_date:'2026-10-10'}]};expect(buildPriorities(data,new Date('2026-10-14T12:00:00')).some(x=>x.kind==='WORK')).toBe(true)})
  it('puts overdue customer follow-ups into OGGI',()=>{const data={...empty,customers:[{id:'c1',dealer_id:'d',first_name:'Mario',last_name:'Rossi',next_step:'Richiamare per proposta',next_contact_at:'2026-10-13T10:00:00+02:00'}]};const p=buildPriorities(data,new Date('2026-10-14T12:00:00+02:00'));expect(p.some(x=>x.kind==='CUSTOMER'&&x.severity===3&&x.customerId==='c1')).toBe(true)})
  it('puts overdue and today calendar events into OGGI but ignores completed ones',()=>{const data={...empty,calendarEvents:[{id:'e1',dealer_id:'d',title:'Prova auto',starts_at:'2026-10-13T10:00:00+02:00',status:'OPEN'},{id:'e2',dealer_id:'d',title:'Consegna',starts_at:'2026-10-14T15:00:00+02:00',status:'OPEN'},{id:'e3',dealer_id:'d',title:'Fatto',starts_at:'2026-10-14T09:00:00+02:00',status:'DONE'}]};const p=buildPriorities(data,new Date('2026-10-14T12:00:00+02:00'));expect(p.filter(x=>x.kind==='CALENDAR')).toHaveLength(2);expect(p.find(x=>x.id==='cal:e1')?.severity).toBe(3)})
})
