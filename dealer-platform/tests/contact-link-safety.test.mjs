import test from 'node:test';
import assert from 'node:assert/strict';
import {clientContactAction} from '../client-followup.js';

test('invalid phone falls back to valid email',()=>{
  assert.equal(clientContactAction({phone:'123',email:'cliente@example.it'}).kind,'email');
  assert.equal(clientContactAction({phone:'123'}).kind,'missing');
});

test('invalid email does not create a mailto link',()=>{
  assert.equal(clientContactAction({email:'indirizzo-incompleto'}).kind,'missing');
  assert.equal(clientContactAction({email:'cliente@example.it'}).kind,'email');
});

test('valid international phone remains supported',()=>{
  const contact=clientContactAction({phone:'+39 333 123 4567'});
  assert.equal(contact.kind,'whatsapp');
  assert.match(contact.href,/wa\\.me/);
});
