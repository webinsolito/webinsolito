import test from 'node:test';
import assert from 'node:assert/strict';
import {saleState} from '../report-metrics.js';

test('PRENOTATA e DA_CONSEGNARE restano pipeline',()=>{
  assert.equal(saleState({status:'PRENOTATA'},null),'PIPELINE');
  assert.equal(saleState({status:'DA_CONSEGNARE'},null),'PIPELINE');
  assert.equal(saleState({status:'CONSEGNATA'},null),'DELIVERED');
});
