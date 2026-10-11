import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');

test('seller finance is denied at the offline data layer',()=>{
  const src=read('offline.js');
  assert.match(src,/role==='VENDITORE'\)return false/);
  assert.match(src,/FINANCIAL_STORES=new Set\(\['vehicle_financials','vehicle_costs','invoices'\]\)/);
  assert.match(src,/financial_store_forbidden/);
  assert.match(src,/financial_mutation_forbidden/);
  assert.match(src,/purgeStoreForDealer/);
});

test('logout cache discovery sees finance-only tenants without exposing rows',()=>{
  const offline=read('offline.js'),session=read('session-security.js');
  assert.match(offline,/dealerIdsInStore/);
  assert.match(offline,/openKeyCursor\(null,'nextunique'\)/);
  assert.match(session,/OfflineDB\.dealerIdsInStore\(store\)/);
  assert.match(session,/orphan finance-only caches/);
});

test('seller sync skips finance endpoints and finance cache writes',()=>{
  const src=read('api.js');
  assert.match(src,/finance\?rest\(`vehicle_financials/);
  assert.match(src,/finance\?rest\(`vehicle_costs/);
  assert.match(src,/finance\?rest\(`invoices/);
  assert.match(src,/if\(finance\)writes\.push/);
  assert.match(src,/financial_entity_forbidden/);
});

test('service worker never caches external or authenticated traffic',()=>{
  const src=read('sw.js');
  assert.match(src,/url\.origin!==self\.location\.origin/);
  assert.match(src,/authorization/);
  assert.match(src,/API, Supabase, Telegram and every other external\/sensitive request are network-only/);
  assert.doesNotMatch(src,/if\(res\.ok&&res\.type!=='opaque'\).*caches\.open\(CACHE\)/s);
});

test('feature modules wait for security cleanup and readability layer is loaded',()=>{
  const src=read('config.js');
  assert.match(src,/DEALER_SECURITY_READY=Promise\.all/);
  assert.match(src,/await window\.DEALER_SECURITY_READY/);
  assert.match(src,/readability\.css\?v=1\.9\.3/);
});
