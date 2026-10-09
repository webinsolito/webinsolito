import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
test('service worker caches only explicit same-origin static assets',()=>{
  assert.match(source,/STATIC_URLS/);
  assert.match(source,/url\.origin!==self\.location\.origin/);
  assert.match(source,/!STATIC_URLS\.has\(url\.href\)/);
  assert.doesNotMatch(source,/event\.respondWith\(fetch\(req\)\.then\(res=>\{if\(res\.ok&&res\.type!==/);
});
