import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=name=>fs.readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const ux=read('premium-ux.js');
const css=read('premium-ui.css');
const config=read('config.js');
const sw=read('sw.js');

test('premium runtime is wired and available offline',()=>{
  assert.match(config,/premium-ux\.js\?v=1\.0\.0/);
  assert.match(ux,/premium-ui\.css\?v=1\.0\.0/);
  assert.match(sw,/premium-ui\.css\?v=1\.0\.0/);
  assert.match(sw,/premium-ux\.js\?v=1\.0\.0/);
});

test('global search only reads operational vehicle and customer stores',()=>{
  assert.match(ux,/OfflineDB\.list\('vehicles',id\)/);
  assert.match(ux,/OfflineDB\.list\('customers',id\)/);
  assert.doesNotMatch(ux,/OfflineDB\.list\('vehicle_financials'/);
  assert.doesNotMatch(ux,/OfflineDB\.list\('vehicle_costs'/);
  assert.doesNotMatch(ux,/OfflineDB\.list\('invoices'/);
  assert.doesNotMatch(ux,/purchase_price|minimum_price|margin/i);
});

test('premium UX supports universal search, keyboard access and one-tap create actions',()=>{
  assert.match(ux,/Cerca auto, targa o cliente/);
  assert.match(ux,/e\.key==='k'.*metaKey.*ctrlKey/s);
  assert.match(ux,/e\.key==='\/'/);
  assert.match(ux,/addVehicleBtn/);
  assert.match(ux,/addCustomerBtn/);
  assert.match(ux,/syncBtn/);
  assert.match(ux,/dealer:open-vehicle/);
  assert.match(ux,/data-client-id/);
});

test('visual system covers desktop, iPhone, command palette and reduced motion',()=>{
  assert.match(css,/\.m23-command/);
  assert.match(css,/\.m23-mobile-fab/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.garage-drawer/);
  assert.match(css,/\.crm-drawer/);
});
