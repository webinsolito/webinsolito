import test from 'node:test';
import assert from 'node:assert/strict';
import {isInvoiceOverdue} from '../report-metrics.js';

test('fattura saldata non resta scaduta',()=>{
  const now=new Date('2026-10-08T12:00:00Z');
  assert.equal(isInvoiceOverdue({invoice_type:'SALE',total_amount:1000,paid_amount:1000,due_date:'2026-10-01'},now),false);
});
