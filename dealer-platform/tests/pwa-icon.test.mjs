import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('la PWA MALÙ23 dichiara un logo vettoriale locale',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
  const icon=manifest.icons.find(x=>x.src==='./malu23-icon.svg');
  assert.ok(icon,'Icona PWA mancante');
  assert.equal(icon.type,'image/svg+xml');
  assert.equal(icon.sizes,'any');
  const svg=await readFile(new URL('../malu23-icon.svg',import.meta.url),'utf8');
  assert.match(svg,/<svg[^>]+viewBox="0 0 512 512"/);
  assert.match(svg,/<text[^>]*>M23<\/text>/);
  assert.doesNotMatch(svg,/<script|(?:href|src)="https?:\/\//i);
});
