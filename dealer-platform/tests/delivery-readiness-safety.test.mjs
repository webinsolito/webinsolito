import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryReadiness, DELIVERY_CHECKLIST_TITLES} from '../delivery-readiness.js';

const vehicle={id:'v1',status:'DA_CONSEGNARE'};
const completeItems=DELIVERY_CHECKLIST_TITLES.map((title,i)=>({id:'w'+i,vehicle_id:'v1',category:'CONSEGNA',title,status:'DONE'}));

test('a partially paid invoice blocks delivery even if all checklist items are complete',()=>{
  const result=deliveryReadiness({vehicle,workItems:completeItems,invoices:[{id:'i1',vehicle_id:'v1',invoice_type:'SALE',total_amount:12000,paid_amount:5000}]});
  assert.equal(result.tone,'blocked');
  assert.equal(result.amount,7000);
  assert.equal(result.action,'open_invoices');
});

test('deleted or cancelled delivery tasks cannot artificially complete the checklist',()=>{
  const items=[{id:'w1',vehicle_id:'v1',category:'CONSEGNA',title:DELIVERY_CHECKLIST_TITLES[0],status:'DONE'},
    {id:'w2',vehicle_id:'v1',category:'CONSEGNA',title:DELIVERY_CHECKLIST_TITLES[1],status:'DONE',deleted_at:'2026-10-09'},
    {id:'w3',vehicle_id:'v1',category:'CONSEGNA',title:DELIVERY_CHECKLIST_TITLES[2],status:'TODO'}];
  const result=deliveryReadiness({vehicle,workItems:items});
  assert.equal(result.action,'complete_next');
  assert.equal(result.workItem.id,'w3');
  assert.equal(result.progress,50);
});

test('a completed delivery stays completed, never returns an editable next action',()=>{
  const result=deliveryReadiness({vehicle:{...vehicle,status:'CONSEGNATA'},invoices:[{vehicle_id:'v1',invoice_type:'SALE',total_amount:1000,paid_amount:0}]});
  assert.equal(result.action,'none');
  assert.equal(result.tone,'complete');
});

test('delivery checklist can be seeded in one guided action when empty',()=>{
  const result=deliveryReadiness({vehicle});
  assert.equal(result.action,'seed');
  assert.equal(result.total,7);
  assert.equal(result.progress,0);
});
