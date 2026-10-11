import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);const read=p=>readFile(new URL(p,root),'utf8');

test('matrice pre-release copre ruoli dispositivi offline lifecycle e recovery',async()=>{
  const doc=await read('PRE_RELEASE_CHECKLIST.md');
  for(const required of ['ADMIN','VENDITORE','Windows desktop','iPhone Safari/PWA','Offline → online','Stock → Prenotata → Venduta → Da consegnare → Consegnata','delivered_at','Usa server / Mantieni locale','AutoScout','Instagram','Telegram'])assert.match(doc,new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('integrazioni mantengono i guardrail di pubblicazione e privacy',async()=>{
  const [autoscout,instagram,telegram]=await Promise.all([read('autoscout-safety.js'),read('instagram-safety.js'),read('worker/index.js')]);
  assert.match(autoscout,/URL HTTPS reale di AutoScout24/);
  assert.match(autoscout,/PUBLISHED/);
  assert.match(instagram,/PUBBLICATO non può essere impostato manualmente/);
  assert.match(instagram,/conferma Meta\/server/);
  assert.match(telegram,/membershipCanSeeFinance/);
  assert.match(telegram,/VENDITORE/);
});
