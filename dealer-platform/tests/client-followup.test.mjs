import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseClientFollowup,clientContactAction,snoozeUntil} from '../client-followup.js';

const now=new Date('2026-10-08T08:00:00.000Z');

test('il richiamo scaduto prevale su quelli futuri e chiusi',()=>{
  const result=chooseClientFollowup([
    {id:'future',first_name:'Anna',status:'LEAD',next_contact_at:'2026-10-09T08:00:00.000Z'},
    {id:'closed',first_name:'Chiuso',status:'CHIUSO_VINTO',next_contact_at:'2026-10-01T08:00:00.000Z'},
    {id:'late',first_name:'Mario',last_name:'Rossi',status:'TRATTATIVA',next_contact_at:'2026-10-08T06:00:00.000Z',next_step:'Preventivo'}
  ],now);
  assert.equal(result.customerId,'late');
  assert.equal(result.kind,'overdue');
  assert.equal(result.timing,'Scaduto da 2 ore');
});

test('senza richiami attivi restituisce uno stato calmo esplicito',()=>{
  const result=chooseClientFollowup([{id:'x',status:'CHIUSO_PERSO',next_contact_at:'2026-10-08T07:00:00.000Z'}],now);
  assert.equal(result.kind,'calm');
  assert.equal(result.customerId,null);
});

test('il contatto usa WhatsApp con messaggio già pronto e fallback email',()=>{
  const wa=clientContactAction({first_name:'Mario',phone:'+39 333 123 4567'},'Peugeot 308 · AB123CD');
  assert.equal(wa.kind,'whatsapp');
  assert.match(wa.href,/^https:\/\/wa\.me\/393331234567\?text=/);
  assert.match(decodeURIComponent(wa.href),/Peugeot 308 · AB123CD/);
  const mail=clientContactAction({email:'anna@example.it'});
  assert.equal(mail.kind,'email');
  assert.match(mail.href,/^mailto:anna@example\.it/);
});

test('rimanda a domani in modo deterministico',()=>{
  assert.equal(snoozeUntil(now,24),'2026-10-09T08:00:00.000Z');
});
