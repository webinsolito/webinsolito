import {describe,it,expect} from 'vitest'
import {buildGlobalSearchResults} from './globalSearch'
import type {TenantData} from '../types'

const data:TenantData={vehicles:[{id:'v1',dealer_id:'d',brand:'BMW',model:'X1',plate:'AB123CD',vin:'WBA123456789'}],media:[],workItems:[],customers:[{id:'c1',dealer_id:'d',first_name:'Mario',last_name:'Rossi',phone:'+39 333 123 4567',email:'mario@example.test'}],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[{id:'i1',dealer_id:'d',vehicle_id:'v1',invoice_type:'SALE',number:'FV-2026-77',counterparty_name:'Mario Rossi',issue_date:'2026-10-01',total_amount:25000} as any]}

describe('ricerca globale',()=>{
 it('trova auto per targa anche con spazi',()=>expect(buildGlobalSearchResults(data,'AB 123 CD',false)[0]).toMatchObject({kind:'VEHICLE',id:'v1'}))
 it('trova auto per telaio',()=>expect(buildGlobalSearchResults(data,'WBA123456789',false)[0]).toMatchObject({kind:'VEHICLE',id:'v1'}))
 it('trova cliente per telefono ignorando formattazione',()=>expect(buildGlobalSearchResults(data,'3331234567',false)[0]).toMatchObject({kind:'CUSTOMER',id:'c1'}))
 it('mostra fatture solo quando il profilo può vedere finanze',()=>{expect(buildGlobalSearchResults(data,'FV-2026-77',false).some(x=>x.kind==='INVOICE')).toBe(false);expect(buildGlobalSearchResults(data,'FV-2026-77',true)[0]).toMatchObject({kind:'INVOICE',id:'i1'})})
})
