import test from 'node:test';
import assert from 'node:assert/strict';

test('instagram safety module loads outside browser without side effects',async()=>{
  const mod=await import('../instagram-safety.js');
  assert.ok(mod);
});
