import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('release note Admin dichiara solo garanzie coperte dal codice',async()=>{
  const text=await readFile(new URL('../ADMIN_V15.md',import.meta.url),'utf8');
  assert.match(text,/Solo un membro `ADMIN` attivo/);
  assert.match(text,/password temporanee obbligano il cambio/);
  assert.match(text,/revoca anche il collegamento Telegram/);
});
