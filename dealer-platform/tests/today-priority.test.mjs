import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseTodayPriority} from '../today-priority.js';

const now=new Date('2026-10-08T08:00:00Z');

test('incassi scaduti prevalgono e sommano solo il residuo',()=>{
  const result=chooseTodayPriority({
    invoices:[{invoice_type:'SALE',payment_status:'PARTIAL',due_date:'2026-10-06',total_amount:12900,paid_amount:3000}],
    customers:[{next_contact_at:'2026-10-08T09:00:00Z'}],
    vehicles:[{status:'DA_CONSEGNARE'}]
  },now);
  assert.equal(result.view,'fatture');
  assert.equal(result.meta,9900);
  assert.match(result.title,/incasso scaduto/);
});

test('richiamo imminente resta la singola azione primaria senza insoluti',()=>{
  const result=chooseTodayPriority({
    invoices:[{invoice_type:'SALE',payment_status:'PARTIAL',due_date:'2026-10-12',total_amount:1000,paid_amount:100}],
    customers:[{next_contact_at:'2026-10-08T10:00:00Z',next_step:'Confermare il test drive'}],
    vehicles:[{status:'DA_CONSEGNARE'}]
  },now);
  assert.equal(result.view,'clients');
  assert.equal(result.action,'Apri clienti');
  assert.equal(result.subtitle,'Confermare il test drive');
});

test('appuntamento di oggi entra davvero nella priorità operativa',()=>{
  const result=chooseTodayPriority({
    calendarEvents:[{title:'Consegna Fiat 500',starts_at:'2026-10-08T14:30:00Z',status:'OPEN'}],
    vehicles:[{status:'IN_VENDITA'}]
  },now);
  assert.equal(result.view,'calendar');
  assert.equal(result.action,'Apri calendario');
  assert.match(result.title,/Consegna Fiat 500/);
});

test('consegna, saldo in scadenza, lavori e stock anziano hanno fallback deterministico',()=>{
  assert.equal(chooseTodayPriority({vehicles:[{status:'DA_CONSEGNARE'}]},now).view,'vendite');
  assert.equal(chooseTodayPriority({invoices:[{invoice_type:'SALE',payment_status:'UNPAID',due_date:'2026-10-10',total_amount:500}]},now).view,'fatture');
  assert.equal(chooseTodayPriority({workItems:[{status:'TODO',due_date:'2026-10-01'}]},now).view,'garage');
  const aged=chooseTodayPriority({vehicles:[{status:'IN_VENDITA',purchase_date:'2026-07-01'}]},now);
  assert.equal(aged.view,'garage');
  assert.equal(aged.eyebrow,'STOCK DA MUOVERE');
  assert.equal(chooseTodayPriority({vehicles:[{status:'IN_VENDITA',purchase_date:'2026-10-01'}]},now).tone,'calm');
});
