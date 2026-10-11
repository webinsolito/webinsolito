import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('preview is a standalone static shell with no production persistence/runtime hooks',async()=>{
  const html=await read('preview.html');
  assert.match(html,/id="appShell"/);
  assert.match(html,/id="previewBadge"/);
  assert.match(html,/ANTEPRIMA · DATI DEMO · V1\.9\.7/);
  assert.doesNotMatch(html,/dealer-platform-session/);
  assert.doesNotMatch(html,/localStorage/);
  assert.doesNotMatch(html,/indexedDB/);
  assert.doesNotMatch(html,/OfflineDB/);
  assert.doesNotMatch(html,/supabase/i);
  assert.doesNotMatch(html,/serviceWorker/);
  assert.doesNotMatch(html,/import\s*\(/);
  assert.doesNotMatch(html,/<script[\s>]/i);
});

test('runtime 1.9.7 invalidates old PWA cache while keeping legacy config URL warm',async()=>{
  const [config,sw]=await Promise.all([read('config.js'),read('sw.js')]);
  assert.match(config,/version: '1\.9\.7'/);
  assert.match(sw,/dealer-platform-v1\.9\.7-static-only/);
  assert.match(sw,/\.\/config\.js\?v=1\.9\.7/);
  assert.match(sw,/\.\/config\.js\?v=1\.6\.1/);
  assert.match(sw,/\.\/reports\.js\?v=1\.9\.7/);
});
