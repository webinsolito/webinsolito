import test from 'node:test';
import assert from 'node:assert/strict';
import {saleState} from '../report-metrics.js';

test('stati commerciali e consegna senza timestamp restano pipeline',()=>{
  assert.equal(saleState({status:'PRENOTATA'},null),'PIPELINE');
  assert.equal(saleState({status:'DA_CONSEGNARE'},null),'PIPELINE');
  assert.equal(saleState({status:'CONSEGNATA'},null),'PIPELINE');
  assert.equal(saleState({status:'CONSEGNATA'},{sale_stage:'DELIVERED'}),'PIPELINE');
  assert.equal(saleState({status:'CONSEGNATA'},{sale_stage:'DELIVERED',delivered_at:'2026-10-11T10:00:00Z'}),'DELIVERED');
});
