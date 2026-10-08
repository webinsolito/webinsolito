import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('instagram safety module contiene i guard di pubblicazione senza eseguirli in Node',async()=>{
  const source=await readFile(new URL('../instagram-safety.js',import.meta.url),'utf8');
  assert.match(source,/PUBBLICATO non può essere impostato manualmente/);
  assert.match(source,/normalizePublicMediaUrl/);
  assert.match(source,/SCHEDULED/);
  assert.match(source,/MutationObserver/);
});
