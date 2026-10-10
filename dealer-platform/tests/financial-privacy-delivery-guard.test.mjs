import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewFinancialReports,buildReportRows,reportTotals} from '../report-metrics.js';

test('VENDITORE cannot view financial reports even with stale elevated permissions',()=>{
  for(const permissions of [{},{view_costs:true},{finance_view:true},{view_costs:true,finance_view:true}]){
    assert.equal(canViewFinancialReports({role:'VENDITORE',permissions},false),false);
  }
  assert.equal(canViewFinancialReports({role:'ADMIN'},false),true);
});

test('deposit, pending delivery and open invoices never inflate recognized revenue',()=>{
  const now=new Date('2026-10-10T12:00:00Z');
  const vehicles=[
    {id:'deposit',status:'PRENOTATA',purchase_date:'2026-09-01',sale_price:13000},
    {id:'pending',status:'DA_CONSEGNARE',purchase_date:'2026-09-01',sale_price:14000},
    {id:'delivered',status:'CONSEGNATA',purchase_date:'2026-09-01',sale_price:15000}
  ];
  const contracts=[
    {id:'c1',vehicle_id:'deposit',template_code:'VENDITA',sale_stage:'DEPOSIT',price:13000},
    {id:'c2',vehicle_id:'pending',template_code:'VENDITA',sale_stage:'READY',price:14000},
    {id:'c3',vehicle_id:'delivered',template_code:'VENDITA',sale_stage:'DELIVERED',price:15000,delivered_at:'2026-10-09'}
  ];
  const invoices=vehicles.map((v,i)=>({id:'i'+i,vehicle_id:v.id,invoice_type:'SALE',total_amount:v.sale_price,paid_amount:0,issue_date:'2026-10-09'}));
  const rows=buildReportRows({vehicles,contracts,invoices},now);
  assert.deepEqual(rows.map(r=>r.state),['PIPELINE','PIPELINE','DELIVERED']);
  assert.deepEqual(rows.map(r=>r.recognizedSale),[0,0,15000]);
  assert.deepEqual(rows.map(r=>r.margin),[null,null,15000]);
  const totals=reportTotals(rows,invoices,'ALL',now);
  assert.equal(totals.revenue,15000);
  assert.equal(totals.deliveredCount,1);
  assert.equal(totals.pipelineCount,2);
});
