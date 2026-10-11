import assert from 'node:assert/strict';
import {test} from 'node:test';
import {saleState,buildReportRows,reportTotals} from '../report-metrics.js';

test('sold or status-only delivery stays in pipeline until delivered_at exists',()=>{
 assert.equal(saleState({status:'VENDUTA'},null),'PIPELINE');
 assert.equal(saleState({status:'DA_CONSEGNARE'},null),'PIPELINE');
 assert.equal(saleState({status:'CONSEGNATA'},null),'PIPELINE');
 assert.equal(saleState({status:'VENDUTA'},{sale_stage:'DELIVERED'}),'PIPELINE');
 assert.equal(saleState({status:'CONSEGNATA'},{sale_stage:'DELIVERED',delivered_at:'2026-10-11T10:00:00Z'}),'DELIVERED');
});
test('revenue and margin require physical delivery timestamp',()=>{
 const vehicle={id:'vehicle-1',status:'VENDUTA',sale_price:12000};
 const data={vehicles:[vehicle],financials:[{vehicle_id:'vehicle-1',purchase_price:8000}],costs:[],invoices:[],contracts:[{id:'sale-1',vehicle_id:'vehicle-1',template_code:'VENDITA',sale_stage:'DELIVERED',price:12000}]};
 const pending=buildReportRows(data);
 assert.equal(pending[0].recognizedSale,0);
 assert.equal(pending[0].margin,null);
 assert.equal(reportTotals(pending,[]).revenue,0);
 assert.equal(reportTotals(pending,[]).activeCapital,8000);
 vehicle.status='CONSEGNATA';
 data.contracts[0].delivered_at='2026-10-11T10:00:00Z';
 const delivered=buildReportRows(data);
 assert.equal(reportTotals(delivered,[]).revenue,12000);
 assert.equal(reportTotals(delivered,[]).margin,4000);
 assert.equal(delivered[0].saleDate,'2026-10-11');
});
