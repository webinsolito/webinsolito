import test from 'node:test';
import assert from 'node:assert/strict';
import {DELIVERY_CHECKLIST_TITLES,deliveryReadiness} from '../delivery-readiness.js';

const vehicle={id:'v1',status:'DA_CONSEGNARE'};

test('il saldo residuo blocca la consegna prima della checklist',()=>{
  const result=deliveryReadiness({vehicle,invoices:[{id:'i1',vehicle_id:'v1',invoice_type:'SALE',total_amount:12900,paid_amount:3000,payment_status:'PARTIAL'}]});
  assert.equal(result.action,'open_invoices');
  assert.equal(result.amount,9900);
  assert.equal(result.tone,'blocked');
});

test('senza saldo residuo propone creazione e poi un solo controllo alla volta',()=>{
  const seed=deliveryReadiness({vehicle,invoices:[{vehicle_id:'v1',invoice_type:'SALE',total_amount:5000,paid_amount:5000,payment_status:'PAID'}]});
  assert.equal(seed.action,'seed');
  const items=DELIVERY_CHECKLIST_TITLES.map((title,index)=>({id:`w${index}`,vehicle_id:'v1',category:'CONSEGNA',title,status:index===0?'DONE':'TODO'}));
  const next=deliveryReadiness({vehicle,workItems:items});
  assert.equal(next.action,'complete_next');
  assert.equal(next.workItem.title,'Saldo verificato');
  assert.equal(next.done,1);
});

test('checklist completa abilita chiusura e stato consegnato resta definitivo',()=>{
  const items=DELIVERY_CHECKLIST_TITLES.map((title,index)=>({id:`w${index}`,vehicle_id:'v1',category:'CONSEGNA',title,status:'DONE'}));
  assert.equal(deliveryReadiness({vehicle,workItems:items}).action,'mark_delivered');
  const complete=deliveryReadiness({vehicle:{...vehicle,status:'CONSEGNATA'},workItems:items});
  assert.equal(complete.action,'none');
  assert.equal(complete.progress,100);
});
