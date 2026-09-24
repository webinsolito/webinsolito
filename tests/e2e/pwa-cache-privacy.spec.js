import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const sw = fs.readFileSync('sw.js', 'utf8');

test('service worker does not persist query-bearing requests', async () => {
  expect(sw).toContain("if(url.search||url.hash)return false");
  expect(sw).toContain("response.type!=='basic'");
  expect(sw).toContain("credentials:'same-origin'");
});

test('offline cache keys strip query/hash and fallback is never cached', async () => {
  expect(sw).toContain("url.search=''");
  expect(sw).toContain("url.hash=''");
  expect(sw).toContain("'Cache-Control':'no-store'");
  expect(sw).toContain("status:503");
});
