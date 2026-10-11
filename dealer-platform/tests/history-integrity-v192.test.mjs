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

test('data quality UI surfaces legacy deliveries in sales finance and reports',async()=>{
  const source=await read('data-quality.js');
  assert.match(source,/LEGACY_UNVERIFIED/);
  assert.match(source,/STORICO DA VERIFICARE/);
  assert.match(source,/patchSales\(\)/);
  assert.match(source,/historyWarning\(root,legacySales\(\)\.length\)/);
});

test('newer runtime keeps the v1.9.2 historical audit module loaded and cached',async()=>{
  const [config,sw,preview]=await Promise.all([read('config.js'),read('sw.js'),read('preview.html')]);
  assert.match(config,/version: '1\.9\.3'/);
  assert.match(config,/data-quality\.js\?v=1\.9\.2/);
  assert.match(sw,/dealer-platform-v1\.9\.3-static-only/);
  assert.match(sw,/data-quality\.js\?v=1\.9\.2/);
  assert.match(preview,/preview-1\.9\.3/);
});
