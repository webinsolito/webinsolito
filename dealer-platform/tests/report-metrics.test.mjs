import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReportRows,reportTotals,canViewFinancialReports,periodMatches,openInvoiceAmount,isInvoiceOverdue} from '../report-metrics.js';

const now=new Date('2026-10-08T12:00:00Z');
const vehicles=[
  {id:'stock',status:'DISPONIBILE',purchase_date:'2026-07-01',brand:'A',model:'One'},
  {id:'pipe',status:'DA_CONSEGNARE',purchase_date:'2026-09-01',brand:'B',model:'Two'},
  {id:'done',status:'CONSEGNATA',purchase_date:'2026-08-01',brand:'C',model:'Three'}
];
const financials=[
  {vehicle_id:'stock',purchase_price:8000},
  {vehicle_id:'pipe',purchase_price:9000},
  {vehicle_id:'done',purchase_price:10000}
];
const costs=[
  {vehicle_id:'stock',amount:500},{vehicle_id:'pipe',amount:600},{vehicle_id:'done',amount:1000},
  {vehicle_id:'done',amount:999,deleted_at:'2026-01-01'}
];
const contracts=[
  {id:'cp',vehicle_id:'pipe',template_code:'VENDITA',sale_stage:'READY',price:14000,contract_date:'2026-10-05'},
  {id:'cd',vehicle_id:'done',template_code:'VENDITA',sale_stage:'DELIVERED',price:16000,contract_date:'2026-09-30',delivered_at:'2026-10-07T10:00:00Z',sale_invoice_id:'idone'}
];
const invoices=[
  {id:'ipipe',vehicle_id:'pipe',invoice_type:'SALE',total_amount:15000,paid_amount:2000,issue_date:'2026-10-05',due_date:'2026-10-20'},
  {id:'idone',vehicle_id:'done',invoice_type:'SALE',total_amount:17000,paid_amount:12000,issue_date:'2026-10-07',due_date:'2026-10-06'}
];

test('vendita in corso non diventa ricavo o margine',()=>{
  const rows=buildReportRows({vehicles,financials,costs,invoices,contracts},now);
  const pipe=rows.find(r=>r.vehicle.id==='pipe'),done=rows.find(r=>r.vehicle.id==='done');
  assert.equal(pipe.state,'PIPELINE');
  assert.equal(pipe.agreedSale,14000);
  assert.equal(pipe.recognizedSale,0);
  assert.equal(pipe.margin,null);
  assert.equal(done.state,'DELIVERED');
  assert.equal(done.recognizedSale,16000);
  assert.equal(done.margin,5000);
});

test('totali periodo riconoscono solo consegne e tengono capitale non consegnato',()=>{
  const rows=buildReportRows({vehicles,financials,costs,invoices,contracts},now);
  const totals=reportTotals(rows,invoices,'MONTH',now);
  assert.equal(totals.stockCount,1);
  assert.equal(totals.pipelineCount,1);
  assert.equal(totals.activeCapital,18100);
  assert.equal(totals.revenue,16000);
  assert.equal(totals.margin,5000);
  assert.equal(totals.deliveredCount,1);
  assert.equal(totals.receivables,16000);
  assert.equal(totals.overdue,5000);
});

test('permessi report non espongono costi al venditore',()=>{
  assert.equal(canViewFinancialReports({role:'ADMIN'},false),true);
  assert.equal(canViewFinancialReports({role:'AMMINISTRAZIONE'},false),true);
  assert.equal(canViewFinancialReports({role:'OPERATORE',permissions:{finance_view:true}},false),true);
  assert.equal(canViewFinancialReports({role:'VENDITORE',permissions:{finance_view:true,reports_view:true}},false),false);
  assert.equal(canViewFinancialReports({role:'VENDITORE',permissions:{reports_view:true}},false),false);
});

test('periodo e scadenze sono deterministici',()=>{
  assert.equal(periodMatches('2026-10-07','MONTH',now),true);
  assert.equal(periodMatches('2026-09-30','MONTH',now),false);
  assert.equal(periodMatches('2026-09-30','YEAR',now),true);
  assert.equal(openInvoiceAmount(invoices[1]),5000);
  assert.equal(isInvoiceOverdue(invoices[1],now),true);
  assert.equal(isInvoiceOverdue(invoices[0],now),false);
});
