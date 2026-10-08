import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('accesso diretto temporaneo è consentito solo in demo e non apre Supabase',async()=>{
  const config=await readFile(new URL('../config.js',import.meta.url),'utf8');
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  assert.match(config,/temporaryDirectAccess:\s*true/);
  assert.match(config,/demoMode:\s*true/);
  assert.match(app,/c\.temporaryDirectAccess&&c\.demoMode/);
  assert.match(app,/ensureTemporaryDirectAccess/);
  assert.doesNotMatch(app,/service_role/);
});
