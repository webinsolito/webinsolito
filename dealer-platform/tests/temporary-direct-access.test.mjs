import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('anteprima diretta resta isolata dai dati reali',async()=>{
  const preview=await readFile(new URL('../preview.html',import.meta.url),'utf8');
  const manifest=await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8');
  const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(preview,/demoMode:true/);
  assert.match(preview,/supabaseUrl:''/);
  assert.match(preview,/workerUrl:''/);
  assert.match(preview,/ANTEPRIMA · DATI DEMO/);
  assert.doesNotMatch(preview,/sb_publishable_/);
  assert.doesNotMatch(preview,/service_role/);
  assert.match(manifest,/preview\.html\?source=pwa/);
  assert.match(sw,/\.\/preview\.html/);
});
