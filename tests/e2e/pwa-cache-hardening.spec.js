const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('PWA cache hardening', () => {
  const sw = fs.readFileSync(path.join(process.cwd(), 'sw.js'), 'utf8');

  test('does not cache private/no-store responses or range requests', async () => {
    expect(sw).toContain("policy.includes('no-store')");
    expect(sw).toContain("policy.includes('private')");
    expect(sw).toContain("request.headers.has('range')");
  });

  test('normalizes cache keys and keeps dynamic catalog/data network-first', async () => {
    expect(sw).toContain("url.search=''");
    expect(sw).toContain("url.hash=''");
    expect(sw).toContain("url.pathname.endsWith('/apps.json')");
    expect(sw).toContain("url.pathname.includes('/data/')");
  });
});
