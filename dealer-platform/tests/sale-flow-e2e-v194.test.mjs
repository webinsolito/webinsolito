import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DELIVERY_CHECKLIST_TITLES,saleDeliveryGate,saleStageTransition} from '../sale-lifecycle.js';
import {buildReportRows,reportTotals} from '../report-metrics.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

function flowFixture(){
  const vehicle={id:'v1',status:'DA_CONSEGNARE',sale_price:15000,purchase_date:'2026-09-01'};
  const contract={id:'c1',template_code:'VENDITA',status:'SIGNED',sale_stage:'READY',vehicle_id:'v1',customer_id:'u1',price:15000,deposit:2000,financing_amount:0,financing_status:'NOT_REQUESTED'};
  const invoice={id:'i1',invoice_type:'SALE',vehicle_id:'v1',customer_id:'u1',total_amount:15000,paid_amount:2000,payment_status:'PARTIAL'};
  const workItems=DELIVERY_CHECKLIST_TITLES.map((title,index)=>({id:`w${index}`,vehicle_id:'v1',category:'CONSEGNA',title,status:index===0?'DONE':'TODO'}));
  return {vehicle,contract,invoice,workItems};
}

test('flusso reale resta bloccato finché saldo e checklist non sono completi',()=>{
  const f=flowFixture();
  assert.equal(saleDeliveryGate({contract:f.contract,invoice:f.invoice,workItems:f.workItems}).code,'sale_balance_open');
  f.invoice.paid_amount=15000;
  assert.equal(saleDeliveryGate({contract:f.contract,invoice:f.invoice,workItems:f.workItems}).code,'sale_checklist_pending');
  for(const item of f.workItems)item.status='DONE';
  assert.equal(saleDeliveryGate({contract:f.contract,invoice:f.invoice,workItems:f.workItems}).ready,true);
});

test('contabilità riconosce la vendita soltanto dopo timestamp di consegna fisica',()=>{
  const f=flowFixture();
  f.invoice.paid_amount=15000;
  for(const item of f.workItems)item.status='DONE';
  const data={vehicles:[f.vehicle],financials:[{vehicle_id:'v1',purchase_price:10000}],costs:[{vehicle_id:'v1',amount:1000}],invoices:[f.invoice],contracts:[f.contract]};
  let rows=buildReportRows(data,new Date('2026-10-11T12:00:00Z'));
  assert.equal(reportTotals(rows,data.invoices,'ALL',new Date('2026-10-11T12:00:00Z')).revenue,0);
  f.contract.sale_stage='DELIVERED';
  rows=buildReportRows(data,new Date('2026-10-11T12:00:00Z'));
  assert.equal(reportTotals(rows,data.invoices).revenue,0);
  f.contract.delivered_at='2026-10-11T11:00:00Z';
  f.vehicle.status='CONSEGNATA';
  rows=buildReportRows(data,new Date('2026-10-11T12:00:00Z'));
  const totals=reportTotals(rows,data.invoices);
  assert.equal(totals.revenue,15000);
  assert.equal(totals.margin,4000);
  assert.equal(rows[0].saleDate,'2026-10-11');
  assert.equal(saleStageTransition('DELIVERED','READY').code,'sale_delivered_terminal');
});

test('runtime, UI e database applicano lo stesso blocco terminale',async()=>{
  const [api,safety,config,sw,preview,migration]=await Promise.all([
    read('api.js'),read('sale-safety.js'),read('config.js'),read('sw.js'),read('preview.html'),read('supabase/migrations/0017_sale_terminal_lock_v194.sql')
  ]);
  assert.match(api,/saleContractTermsChanged/);
  assert.match(api,/saleStageTransition/);
  assert.match(api,/vehicleDeliveryTransition/);
  assert.match(safety,/option\[value="DELIVERED"\]/);
  assert.match(safety,/Vendita consegnata: pratica definitiva/);
  assert.match(config,/version: '1\.9\.6'/);
  assert.match(config,/sale-safety\.js\?v=1\.9\.4/);
  assert.match(sw,/dealer-platform-v1\.9\.6-static-only/);
  assert.match(sw,/sale-safety\.js\?v=1\.9\.4/);
  assert.match(preview,/preview-1\.9\.6/);
  assert.match(migration,/sale_delivered_terminal/);
  assert.match(migration,/sale_contract_terms_locked/);
  assert.match(migration,/sale_delivery_timestamp_locked/);
  assert.match(migration,/vehicle_delivered_terminal/);
});
