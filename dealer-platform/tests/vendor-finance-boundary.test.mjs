import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewFinancialReports,buildReportRows,reportTotals} from '../report-metrics.js';

test('VENDITORE non vede mai report economici in produzione, anche con permessi incoerenti',()=>{
  for(const permissions of [{},{view_costs:true},{finance_view:true},{view_costs:true,finance_view:true}]){
    assert.equal(canViewFinancialReports({role:'VENDITORE',permissions},false),false);
  }
  assert.equal(canViewFinancialReports({role:'AMMINISTRAZIONE'},false),true);
  assert.equal(canViewFinancialReports({role:'ADMIN'},false),true);
});

test('la demo esplicita resta accessibile senza abilitare dati economici production',()=>{
  assert.equal(canViewFinancialReports({role:'VENDITORE',permissions:{view_costs:true}},true),true);
  assert.equal(canViewFinancialReports({role:'VENDITORE',permissions:{view_costs:true}},false),false);
});

test('prenotazioni e consegne ancora aperte non producono ricavi o margini',()=>{
  const vehicles=[
    {id:'booked',status:'PRENOTATA',sale_price:12000,purchase_date:'2026-09-01'},
    {id:'pending',status:'DA_CONSEGNARE',sale_price:18000,purchase_date:'2026-09-02'},
    {id:'delivered',status:'CONSEGNATA',sale_price:22000,purchase_date:'2026-09-03'}
  ];
  const financials=[
    {vehicle_id:'booked',purchase_price:7000},
    {vehicle_id:'pending',purchase_price:11000},
    {vehicle_id:'delivered',purchase_price:16000}
  ];
  const rows=buildReportRows({vehicles,financials},new Date('2026-10-09T12:00:00Z'));
  for(const id of ['booked','pending']){
    const row=rows.find(r=>r.vehicle.id===id);
    assert.equal(row.state,'PIPELINE');
    assert.equal(row.recognizedSale,0);
    assert.equal(row.margin,null);
  }
  const totals=reportTotals(rows,[],'ALL',new Date('2026-10-09T12:00:00Z'));
  assert.equal(totals.revenue,22000);
  assert.equal(totals.margin,6000);
  assert.equal(totals.pipelineCount,2);
});
