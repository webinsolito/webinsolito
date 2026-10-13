import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('runtime 1.9.8 invalidates the PWA cache for lifecycle hardening',async()=>{
  const [config,sw]=await Promise.all([read('config.js'),read('sw.js')]);
  assert.match(config,/version: '1\.9\.8'/);
  assert.match(config,/sale-safety\.js\?v=1\.9\.8/);
  assert.match(sw,/dealer-platform-v1\.9\.8-static-only/);
  assert.match(sw,/config\.js\?v=1\.9\.8/);
  assert.match(sw,/sale-safety\.js\?v=1\.9\.8/);
  assert.match(sw,/\.\/sale-lifecycle\.js/);
});

test('manual DELIVERED stage is removed before checking whether the sale already exists',async()=>{
  const source=await read('sale-safety.js');
  const removeAt=source.indexOf("option[value=\"DELIVERED\"]");
  const idAt=source.indexOf("const id=String(form.elements.id?.value||'')");
  assert.notEqual(removeAt,-1);
  assert.notEqual(idAt,-1);
  assert.ok(removeAt<idAt);
  assert.match(source,/if\(!id\)\{/);
  assert.match(source,/La fase CONSEGNATA non si imposta dal menu/);
});
