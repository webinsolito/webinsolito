import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('report export mantiene CSV e stampa senza fingere PDF server-side',async()=>{
  const src=await readFile(new URL('../reports.js',import.meta.url),'utf8');
  assert.match(src,/Esporta CSV/);
  assert.match(src,/Stampa \/ PDF/);
  assert.match(src,/window\.print\(\)/);
  assert.match(src,/text\/csv/);
});
