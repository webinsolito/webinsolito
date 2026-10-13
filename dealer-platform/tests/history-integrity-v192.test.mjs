import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('migration classifies legacy deliveries without rewriting commercial facts',async()=>{
  const sql=await read('supabase/migrations/0015_history_integrity_v192.sql');
  assert.match(sql,/integrity_state text not null default 'CURRENT'/);
  assert.match(sql,/integrity_state='LEGACY_UNVERIFIED'/);
  assert.match(sql,/Dati economici e date non modificati/);
  assert.match(sql,/new\.integrity_state := 'VERIFIED'/);
  assert.match(sql,/sale_contract_not_signed/);
  assert.match(sql,/sale_balance_open/);
  assert.match(sql,/sale_checklist_incomplete/);
});

test('data quality UI surfaces legacy deliveries without exposing finance to sellers',async()=>{
  const source=await read('data-quality.js');
  assert.match(source,/LEGACY_UNVERIFIED/);
  assert.match(source,/STORICO DA VERIFICARE/);
  assert.match(source,/canSeeFinance\(\)/);
  assert.match(source,/finance\?OfflineDB\.list\('vehicle_financials'/);
  assert.match(source,/escluse da ricavi e margini riconosciuti/);
});

test('runtime 1.9.8 keeps the hardened historical audit module and isolated preview',async()=>{
  const [config,sw,preview]=await Promise.all([read('config.js'),read('sw.js'),read('preview.html')]);
  assert.match(config,/version: '1\.9\.8'/);
  assert.match(config,/data-quality\.js\?v=1\.9\.7/);
  assert.match(sw,/dealer-platform-v1\.9\.8-static-only/);
  assert.match(sw,/data-quality\.js\?v=1\.9\.7/);
  assert.match(preview,/V1\.9\.7/);
});
