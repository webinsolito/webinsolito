import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);const read=p=>readFile(new URL(p,root),'utf8');

test('offline sync conserva baseline server e separa conflitti dagli errori',async()=>{
  const source=await read('offline.js');
  assert.match(source,/syncbase:\$\{dealerId\}/);
  assert.match(source,/expected_updated_at/);
  assert.match(source,/status:conflict\?'CONFLICT':'FAILED'/);
  assert.match(source,/resolveConflictUseServer/);
  assert.match(source,/resolveConflictKeepLocal/);
  assert.match(source,/serverSnapshot/);
  assert.match(source,/cache:'no-store'/);
});

test('backup v2 non esporta né ripristina la coda mutazioni',async()=>{
  const source=await read('backup-core.js');
  assert.match(source,/BACKUP_VERSION=2/);
  assert.doesNotMatch(source,/BACKUP_STORES=Object\.freeze\([^\n]*'mutations'/);
  assert.match(source,/LEGACY_V1_STORES/);
  assert.match(source,/ignoredMutations/);
});

test('runtime 1.9.8 mantiene recovery idempotente offline e preview statica isolata',async()=>{
  const [config,sw,preview,recovery]=await Promise.all([read('config.js'),read('sw.js'),read('preview.html'),read('sync-recovery.js')]);
  assert.match(config,/version: '1\.9\.8'/);
  assert.match(config,/sync-recovery\.js\?v=1\.9\.6/);
  assert.match(sw,/dealer-platform-v1\.9\.8-static-only/);
  assert.match(sw,/sync-conflict\.js\?v=1\.9\.5/);
  assert.match(sw,/sync-recovery\.js\?v=1\.9\.6/);
  assert.match(preview,/ANTEPRIMA · DATI DEMO · V1\.9\.7/);
  assert.doesNotMatch(preview,/sync-recovery\.js|<script/i);
  assert.match(recovery,/issueSignature/);
  assert.match(recovery,/root\.dataset\.syncSig===sig/);
  assert.match(recovery,/Usa server/);
  assert.match(recovery,/Mantieni locale/);
  assert.match(recovery,/Riprova errori/);
});

test('venditore non vede eventuali mutazioni finanziarie nella recovery',async()=>{
  const source=await read('offline.js');
  assert.match(source,/FINANCIAL_ENTITIES/);
  assert.match(source,/canAccessFinancialData\(\)\|\|!FINANCIAL_ENTITIES\.has\(m\.entity\)/);
});
