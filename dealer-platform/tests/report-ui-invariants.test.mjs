import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('report usa concessionaria dinamica e non hardcodata',async()=>{
  const src=await readFile(new URL('../reports.js',import.meta.url),'utf8');
  assert.match(src,/dealerName\(\)/);
  assert.match(src,/dealerSlug\(\)/);
  assert.doesNotMatch(src,/MALÙ23 CARS — Report gestionale/);
  assert.match(src,/VENDUTO CONSEGNATO/);
  assert.match(src,/VENDITE IN CORSO/);
});
