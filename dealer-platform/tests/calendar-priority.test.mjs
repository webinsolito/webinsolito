import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarAction,chooseCalendarPriority} from '../calendar-priority.js';

const now=new Date('2026-10-08T08:00:00.000Z');

test('seleziona la scadenza aperta più urgente e ignora eventi chiusi',()=>{
  const result=chooseCalendarPriority([
    {id:'done',status:'DONE',starts_at:'2026-10-01T08:00:00.000Z',title:'Vecchio'},
    {id:'next',status:'OPEN',starts_at:'2026-10-08T09:00:00.000Z',title:'Consegna',vehicle_id:'v1'},
    {id:'late',status:'OPEN',starts_at:'2026-10-08T07:30:00.000Z',title:'Richiamo',customer_id:'c1'}
  ],now);
  assert.equal(result.eventId,'late');
  assert.equal(result.kind,'overdue');
  assert.equal(result.timing,'Scaduto da 30 min');
});

test('collega direttamente clienti e veicoli alla scheda corretta',()=>{
  assert.deepEqual(calendarAction({customer_id:'c1'}),{kind:'open_customer',label:'Apri cliente'});
  assert.deepEqual(calendarAction({vehicle_id:'v1'}),{kind:'open_vehicle',label:'Apri auto'});
});

test('un evento manuale senza collegamenti può essere chiuso',()=>{
  assert.deepEqual(calendarAction({id:'e1'}),{kind:'complete',label:'Segna fatto'});
  assert.equal(calendarAction({id:'virtual',virtual:true}).kind,'none');
});

test('senza eventi aperti mostra lo stato vuoto',()=>{
  const result=chooseCalendarPriority([{id:'x',status:'CANCELLED',starts_at:'2026-10-08T08:00:00.000Z'}],now);
  assert.equal(result.kind,'calm');
  assert.equal(result.eventId,null);
});
