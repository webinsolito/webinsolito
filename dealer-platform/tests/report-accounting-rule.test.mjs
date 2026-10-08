import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReportRows} from '../report-metrics.js';

test('fattura emessa non basta a riconoscere una vendita non consegnata',()=>{
  const rows=buildReportRows({
    vehicles:[{id:'v',status:'DA_CONSEGNARE',purchase_date:'2026-09-01'}],
    financials:[{vehicle_id:'v',purchase_price:10000}],
    costs:[],
    contracts:[{id:'c',vehicle_id:'v',template_code:'VENDITA',sale_stage:'READY',price:15000}],
    invoices:[{id:'i',vehicle_id:'v',invoice_type:'SALE',total_amount:15000,issue_date:'2026-10-01'}]
  },new Date('2026-10-08T12:00:00Z'));
  assert.equal(rows[0].state,'PIPELINE');
  assert.equal(rows[0].recognizedSale,0);
  assert.equal(rows[0].margin,null);
});
