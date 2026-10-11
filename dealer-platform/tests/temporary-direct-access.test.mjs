import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('anteprima diretta resta completamente isolata dai dati reali',async()=>{
  const preview=await readFile(new URL('../preview.html',import.meta.url),'utf8');
  const manifest=await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8');
  const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(preview,/ANTEPRIMA · DATI DEMO · V1\.9\.7/);
  assert.match(preview,/id="appShell"/);
  assert.doesNotMatch(preview,/dealer-platform-session|localStorage|indexedDB|OfflineDB/i);
  assert.doesNotMatch(preview,/supabase|workerUrl|serviceWorker/i);
  assert.doesNotMatch(preview,/<script[\s>]|import\s*\(/i);
  assert.doesNotMatch(preview,/sb_publishable_|service_role/);
  assert.match(manifest,/preview\.html\?source=pwa/);
  assert.match(sw,/\.\/preview\.html/);
});
