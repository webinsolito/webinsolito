import {describe,it,expect} from 'vitest'
import {formatSaleCancelReason,saleCancellationAuthority,saleCancellationNeedsAdmin} from './saleCancellation'
import type {Contract,SessionPayload} from '../types'

const contract=(over:Partial<Contract>={}):Contract=>({id:'s1',dealer_id:'d',customer_id:'c',vehicle_id:'v',contract_number:'V-1',template_code:'VENDITA',sale_stage:'OPEN',status:'DRAFT',deposit:0,financing_amount:0,...over})
const session=(role:string):SessionPayload=>({access_token:'x',refresh_token:'x',dealer:{id:'d',slug:'d'},profile:{role}})

describe('sale cancellation',()=>{
 it('consente al venditore solo una trattativa pulita',()=>{expect(saleCancellationAuthority(session('VENDITORE'),contract()).allowed).toBe(true);expect(saleCancellationNeedsAdmin(contract({sale_stage:'DEPOSIT'}))).toBe(true);expect(saleCancellationNeedsAdmin(contract({deposit:500}))).toBe(true);expect(saleCancellationNeedsAdmin(contract({status:'SIGNED'}))).toBe(true);expect(saleCancellationNeedsAdmin(contract({sale_invoice_id:'i1'}))).toBe(true)})
 it('admin e amministrazione possono finalizzare una vendita avanzata',()=>{const advanced=contract({sale_stage:'READY',deposit:1000,status:'SIGNED'});expect(saleCancellationAuthority(session('ADMIN'),advanced).allowed).toBe(true);expect(saleCancellationAuthority(session('AMMINISTRAZIONE'),advanced).allowed).toBe(true);expect(saleCancellationAuthority(session('VENDITORE'),advanced)).toMatchObject({allowed:false,requiresAdmin:true})})
 it('formatta un motivo auditabile e limitato',()=>{expect(formatSaleCancelReason('CLIENTE_RINUNCIA','  non risponde più  ')).toBe('Cliente ha rinunciato — non risponde più');expect(formatSaleCancelReason('ALTRO','x'.repeat(300)).length).toBe(240)})
})
