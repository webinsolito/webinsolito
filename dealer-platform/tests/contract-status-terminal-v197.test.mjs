import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {saleContractStatusTransition,saleContractTermsChanged} from '../sale-lifecycle.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('frozen signed and cancelled contract states cannot be downgraded',()=>{
  assert.equal(saleContractStatusTransition('FROZEN','DRAFT').ok,false);
  assert.equal(saleContractStatusTransition('FROZEN','SIGNED').ok,true);
  assert.equal(saleContractStatusTransition('SIGNED','DRAFT').ok,false);
  assert.equal(saleContractStatusTransition('SIGNED','FROZEN').ok,false);
  assert.equal(saleContractStatusTransition('CANCELLED','DRAFT').ok,false);
  const frozen={status:'FROZEN',contract_number:'1',contract_date:'2026-10-11',customer_id:'c',vehicle_id:'v',price:100,deposit:0,template_code:'VENDITA',template_version:'1',notes:''};
  assert.equal(saleContractTermsChanged(frozen,{...frozen,status:'DRAFT'}),true);
});

test('legacy delivered DRAFT contract is immutable without rewriting its historical status',()=>{
  const delivered={status:'DRAFT',sale_stage:'DELIVERED',contract_number:'1',contract_date:'2026-09-01',customer_id:'c',vehicle_id:'v',price:15000,deposit:1000,template_code:'VENDITA',template_version:'1',notes:'storico'};
  assert.equal(saleContractTermsChanged(delivered,{...delivered,price:15001}),true);
  assert.equal(saleContractTermsChanged(delivered,{...delivered,status:'FROZEN'}),true);
  assert.equal(saleContractTermsChanged(delivered,{...delivered}),false);
});

test('database migration closes downgrade bypass and freezes historical delivered terms',async()=>{
  const sql=await read('supabase/migrations/0019_contract_status_terminal_v197.sql');
  assert.match(sql,/old\.template_code = 'VENDITA'.*old\.sale_stage = 'DELIVERED'/s);
  assert.match(sql,/new\.price is distinct from old\.price/s);
  assert.match(sql,/raise exception 'sale_contract_terms_locked'/);
  assert.match(sql,/old\.status = 'FROZEN'.*new\.status not in \('FROZEN','SIGNED'\)/s);
  assert.match(sql,/old\.status = 'SIGNED'.*new\.status is distinct from 'SIGNED'/s);
  assert.match(sql,/old\.status = 'CANCELLED'.*new\.status is distinct from 'CANCELLED'/s);
  assert.match(sql,/before update of status, contract_number, contract_date, customer_id, vehicle_id, price, deposit, template_code, template_version, notes on public\.contracts/i);
});

test('contract versions remain immutable server-side',async()=>{
  const sql=await read('supabase/migrations/0006_contracts_v07.sql');
  assert.match(sql,/guard_contract_version_immutable/);
  assert.match(sql,/contract_version_is_immutable/);
  assert.doesNotMatch(sql,/grant\s+delete\s+on\s+public\.contract_versions/i);
});
