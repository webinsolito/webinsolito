import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildTodayActions,garageGlance,clientGlance} from '../daily-ux-core.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('OGGI ordina azioni reali e non espone fatture al venditore',()=>{
  const now=new Date('2026-10-11T12:00:00Z');
  const data={
    vehicles:[{id:'v1',brand:'Fiat',model:'500',plate:'AA111BB',status:'DA_CONSEGNARE'}],
    customers:[{id:'c1',first_name:'Mario',last_name:'Rossi',next_contact_at:'2026-10-11T09:00:00Z',next_step:'Confermare appuntamento'}],
    contracts:[{id:'ct1',template_code:'VENDITA',vehicle_id:'v1',customer_id:'c1',sale_stage:'READY',planned_delivery_at:'2026-10-12T10:00:00Z'}],
    calendarEvents:[{id:'cal1',status:'OPEN',title:'Test drive',starts_at:'2026-10-11T15:00:00Z'}],
    workItems:[{id:'w1',vehicle_id:'v1',status:'TODO',title:'Lavaggio',due_date:'2026-10-10'}],
    invoices:[{id:'i1',invoice_type:'SALE',payment_status:'PARTIAL',total_amount:12000,paid_amount:2000,due_date:'2026-10-10'}]
  };
  const admin=buildTodayActions(data,now,{includeFinance:true});
  assert.equal(admin[0].kind,'invoice');
  assert.ok(admin.some(a=>a.kind==='callback'));
  assert.ok(admin.some(a=>a.kind==='calendar'));
  assert.ok(admin.some(a=>a.kind==='delivery'));
  const seller=buildTodayActions(data,now,{includeFinance:false});
  assert.ok(!seller.some(a=>a.kind==='invoice'));
  assert.equal(seller[0].kind,'callback');
});

test('Garage mostra prezzo cliente e consegna senza dati di costo',()=>{
  const vehicle={id:'v1',brand:'Fiat',model:'500',asking_price:12900,status:'DA_CONSEGNARE'};
  const glance=garageGlance(vehicle,{contracts:[{id:'ct1',template_code:'VENDITA',vehicle_id:'v1',customer_id:'c1',price:12500,sale_stage:'READY',planned_delivery_at:'2026-10-13T10:00:00Z'}],customers:[{id:'c1',first_name:'Mario',last_name:'Rossi'}]});
  assert.equal(glance.price,12500);
  assert.equal(glance.customer,'Mario Rossi');
  assert.equal(glance.customerId,'c1');
  assert.equal(glance.delivered,false);
  assert.equal('purchase_price' in glance,false);
  assert.equal('margin' in glance,false);
});

test('Clienti espone prossimo passo ultimo contatto e auto collegata',()=>{
  const glance=clientGlance({id:'c1',next_step:'Inviare proposta',next_contact_at:'2026-10-11T16:00:00Z',phone:'+393331234567'},{interactions:[{id:'a1',customer_id:'c1',channel:'TELEFONO',happened_at:'2026-10-10T10:00:00Z'}],interests:[{id:'x1',customer_id:'c1',vehicle_id:'v1',updated_at:'2026-10-10T11:00:00Z'}],vehicles:[{id:'v1',brand:'Peugeot',model:'308',plate:'AB123CD'}]});
  assert.equal(glance.nextStep,'Inviare proposta');
  assert.match(glance.lastContact,/TELEFONO/);
  assert.match(glance.vehicle,/Peugeot 308/);
});

test('modulo daily UX è disponibile online offline e in preview con rendering idempotente',async()=>{
  const [config,sw,preview,source]=await Promise.all([read('config.js'),read('sw.js'),read('preview.html'),read('daily-ux.js')]);
  assert.match(config,/daily-ux\.js\?v=1\.9\.6/);
  assert.match(sw,/daily-ux-core\.js/);
  assert.match(sw,/daily-ux\.js\?v=1\.9\.6/);
  assert.match(preview,/daily-ux\.js\?v=1\.9\.4/);
  assert.match(source,/includeFinance:canViewFinance\(\)/);
  assert.match(source,/section\.dataset\.dailyUxSig===sig/);
  assert.match(source,/section\.dataset\.dailyUxSig=sig/);
  assert.match(source,/min-height:44px/);
  assert.match(source,/Cliente:/);
  assert.match(source,/WhatsApp/);
});
