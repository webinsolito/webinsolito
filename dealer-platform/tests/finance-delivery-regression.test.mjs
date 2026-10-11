import assert from 'node:assert/strict';
import {test} from 'node:test';
import {saleState,buildReportRows,reportTotals} from '../report-metrics.js';

test('sold but not delivered stays in pipeline',()=>{
 assert.equal(saleState({status:'VENDUTA'},null),'PIPELINE');
 assert.equal(saleState({status:'DA_CONSEGNARE'},null),'PIPELINE');
 assert.equal(saleState({status:'CONSEGNATA'},null),'DELIVERED');
 assert.equal(saleState({status:'VENDUTA'},{sale_stage:'DELIVERED'}),'DELIVERED');
});
test('revenue and margin require delivery',()=>{
 const vehicle={id:'vehicle-1',status:'VENDUTA',sale_price:12000};
 const data={vehicles:[vehicle],financials:[{vehicle_id:'vehicle-1',purchase_price:8000}],costs:[],invoices:[],contracts:[]};
 const pending=buildReportRows(data);
 assert.equal(pending[0].recognizedSale,0);
 assert.equal(pending[0].margin,null);
 assert.equal(reportTotals(pending,[]).revenue,0);
 assert.equal(reportTotals(pending,[]).activeCapital,8000);
 vehicle.status='CONSEGNATA';
 const delivered=buildReportRows(data);
 assert.equal(reportTotals(delivered,[]).revenue,12000);
 assert.equal(reportTotals(delivered,[]).margin,4000);
});
