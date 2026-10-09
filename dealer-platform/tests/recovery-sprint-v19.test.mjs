import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildReportRows} from '../report-metrics.js';

test('Finanze riconosce ricavo e margine solo dopo consegna',async()=>{
  const rows=buildReportRows({
    vehicles:[{id:'v1',status:'DA_CONSEGNARE',sale_price:12000,purchase_date:'2026-09-01'},{id:'v2',status:'CONSEGNATA',sale_price:14000,purchase_date:'2026-09-01'}],
    financials:[{vehicle_id:'v1',purchase_price:9000},{vehicle_id:'v2',purchase_price:10000}],
    costs:[{vehicle_id:'v1',amount:500},{vehicle_id:'v2',amount:700}],
    invoices:[{id:'i1',vehicle_id:'v1',invoice_type:'SALE',total_amount:12000,issue_date:'2026-10-08'},{id:'i2',vehicle_id:'v2',invoice_type:'SALE',total_amount:14000,issue_date:'2026-10-08'}],
    contracts:[]
  },new Date('2026-10-09T12:00:00Z'));
  const pipeline=rows.find(r=>r.vehicle.id==='v1'),delivered=rows.find(r=>r.vehicle.id==='v2');
  assert.equal(pipeline.state,'PIPELINE');
  assert.equal(pipeline.recognizedSale,0);
  assert.equal(pipeline.margin,null);
  assert.equal(delivered.state,'DELIVERED');
  assert.equal(delivered.recognizedSale,14000);
  assert.equal(delivered.margin,3300);
});

test('modulo Finanze riusa le regole contabili centrali e hard-stoppa il Venditore',async()=>{
  const source=await readFile(new URL('../finances.js',import.meta.url),'utf8');
  assert.match(source,/buildReportRows/);
  assert.match(source,/reportTotals/);
  assert.match(source,/p\.role==='VENDITORE'\)return false/);
  assert.doesNotMatch(source,/function isSold\(/);
  assert.match(source,/CAPITALE STOCK\/PIPELINE/);
});

test('cache locale economica viene eliminata quando si perde il permesso',async()=>{
  const source=await readFile(new URL('../session-security.js',import.meta.url),'utf8');
  assert.match(source,/FINANCIAL_STORES=\['vehicle_financials','vehicle_costs','invoices'\]/);
  assert.match(source,/lostFinance/);
  assert.match(source,/purgeFinancialCache/);
  assert.match(source,/p\.role==='VENDITORE'\)return false/);
});

test('gateway login accetta identifier e Telegram ricontrolla membership ACTIVE',async()=>{
  const source=await readFile(new URL('../worker/index.js',import.meta.url),'utf8');
  assert.match(source,/body\.identifier\|\|body\.username/);
  assert.match(source,/const membership=await activeMembership\(env,link\.dealer_id,link\.user_id\);if\(!membership\)return null/);
  assert.match(source,/membershipCanSeeFinance/);
  assert.match(source,/payment_status/);
});
