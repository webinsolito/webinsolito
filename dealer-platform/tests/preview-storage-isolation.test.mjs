import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('preview storage must be isolated from production',async()=>{
  const preview=await readFile(new URL('../preview.html',import.meta.url),'utf8');
  const api=await readFile(new URL('../api.js',import.meta.url),'utf8');
  const offline=await readFile(new URL('../offline.js',import.meta.url),'utf8');
  const security=await readFile(new URL('../session-security.js',import.meta.url),'utf8');
  assert.match(preview,/dealer-platform-preview-session/);
  assert.doesNotMatch(preview,/localStorage\.setItem\('dealer-platform-session'/);
  assert.match(api,/dealer-platform-preview-session/);
  assert.match(offline,/dealer-platform-preview-local/);
  assert.match(security,/dealer-platform-preview-session/);
});
