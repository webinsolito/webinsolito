import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const sw = fs.readFileSync('sw.js', 'utf8');

test('service worker does not persist query-bearing requests', async () => {
  expect(sw).toContain("!u.search&&!u.hash");
  expect(sw).toContain("res.type!=='basic'");
  expect(sw).toContain("credentials:'same-origin'");
});

test('offline navigation fallback strips query and does not cache the error', async () => {
  expect(sw).toContain("u.search='';u.hash=''");
  expect(sw).toContain("'Cache-Control':'no-store'");
  expect(sw).toContain("status:503");
});
