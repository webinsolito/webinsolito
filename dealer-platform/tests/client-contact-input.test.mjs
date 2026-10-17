import test from 'node:test';
import assert from 'node:assert/strict';
import {clientContactAction} from '../client-followup.js';
test('invalid phone and email are not actionable',()=>{
  assert.equal(clientContactAction({phone:'123'}).kind,'missing');
  assert.equal(clientContactAction({email:'invalid'}).kind,'missing');
});
