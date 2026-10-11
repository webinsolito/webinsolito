import test from 'node:test';
import assert from 'node:assert/strict';
import {DELIVERY_CHECKLIST_TITLES,normalizeInvoicePayment,saleContractTermsChanged,saleDeliveryGate,saleInvoiceIntegrity,saleStageTransition,selectSaleInvoice,vehicleDeliveryTransition} from '../sale-lifecycle.js';

const contract={id:'c1',template_code:'VENDITA',status:'SIGNED',vehicle_id:'v1',customer_id:'u1',price:10000,deposit:1000,contract_number:'2026/0001',contract_date:'2026-10-01',notes:'ok',financing_amount:0,financing_status:'NOT_REQUESTED'};
const invoice={id:'i1',invoice_type:'SALE',vehicle_id:'v1',customer_id:'u1',total_amount:10000,paid_amount:10000,payment_status:'UNPAID'};
const checklist=DELIVERY_CHECKLIST_TITLES.map((title,index)=>({id:`w${index}`,vehicle_id:'v1',category:'CONSEGNA',title,status:'DONE'}));

test('stato pagamento deriva dagli importi e non dalla select UI',()=>{
  assert.equal(normalizeInvoicePayment(invoice).payment_status,'PAID');
  assert.equal(normalizeInvoicePayment({...invoice,paid_amount:2500,payment_status:'PAID'}).payment_status,'PARTIAL');
  assert.equal(normalizeInvoicePayment({...invoice,paid_amount:15000}).paid_amount,10000);
});

test('fattura vendita deve coincidere con cliente, auto e prezzo contratto',()=>{
  assert.equal(saleInvoiceIntegrity(contract,invoice).ok,true);
  assert.equal(saleInvoiceIntegrity(contract,{...invoice,customer_id:'u2'}).code,'sale_invoice_customer_mismatch');
  assert.equal(saleInvoiceIntegrity(contract,{...invoice,total_amount:9990}).code,'sale_invoice_amount_mismatch');
});

test('selezione fattura preferisce collegamento esplicito e poi match cliente-auto',()=>{
  const fallback={...invoice,id:'fallback',issue_date:'2026-10-10'};
  const linked={...invoice,id:'linked',issue_date:'2026-10-01'};
  assert.equal(selectSaleInvoice({...contract,sale_invoice_id:'linked'},[fallback,linked]).id,'linked');
  assert.equal(selectSaleInvoice(contract,[fallback]).id,'fallback');
});

test('consegna richiede contratto firmato, fattura saldata e checklist completa',()=>{
  assert.equal(saleDeliveryGate({contract:{...contract,status:'FROZEN'},invoice,workItems:checklist}).code,'sale_contract_not_signed');
  assert.equal(saleDeliveryGate({contract,invoice:{...invoice,paid_amount:1000},workItems:checklist}).code,'sale_balance_open');
  assert.equal(saleDeliveryGate({contract,invoice,workItems:checklist.slice(1)}).code,'sale_checklist_missing');
  assert.equal(saleDeliveryGate({contract,invoice,workItems:checklist}).ready,true);
});

test('finanziamento non liquidato blocca la consegna anche con fattura saldata',()=>{
  const financed={...contract,financing_amount:6000,financing_status:'APPROVED'};
  assert.equal(saleDeliveryGate({contract:financed,invoice,workItems:checklist}).code,'sale_financing_not_paid');
});

test('consegna e annullamento sono stati terminali',()=>{
  assert.equal(saleStageTransition('DELIVERED','READY').code,'sale_delivered_terminal');
  assert.equal(saleStageTransition('DELIVERED','DELIVERED').ok,true);
  assert.equal(saleStageTransition('CANCELLED','OPEN').code,'sale_cancelled_terminal');
  assert.equal(saleStageTransition('READY','DELIVERED').ok,true);
});

test('termini del contratto congelato non possono cambiare',()=>{
  const frozen={...contract,status:'FROZEN'};
  assert.equal(saleContractTermsChanged(frozen,{...frozen,price:10100}),true);
  assert.equal(saleContractTermsChanged(frozen,{...frozen,customer_id:'u2'}),true);
  assert.equal(saleContractTermsChanged(frozen,{...frozen,sale_stage:'READY',planned_delivery_at:'2026-10-20T10:00:00Z'}),false);
  assert.equal(saleContractTermsChanged({...frozen,status:'DRAFT'},{...frozen,status:'DRAFT',price:10100}),false);
});

test('veicolo consegnato non torna in stock',()=>{
  assert.equal(vehicleDeliveryTransition('CONSEGNATA','IN_VENDITA').code,'vehicle_delivered_terminal');
  assert.equal(vehicleDeliveryTransition('CONSEGNATA','CONSEGNATA').ok,true);
  assert.equal(vehicleDeliveryTransition('DA_CONSEGNARE','CONSEGNATA').ok,true);
});
