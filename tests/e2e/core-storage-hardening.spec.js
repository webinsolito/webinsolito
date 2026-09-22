import { test, expect } from '@playwright/test';

test('shared storage helper survives blocked localStorage and preserves falsy JSON values', async ({ page }) => {
  await page.goto('./');
  await page.addScriptTag({ url: './assets/webinsolito-core.js' });

  const falsyRoundTrip = await page.evaluate(() => {
    const key = 'wi-test-falsy';
    localStorage.setItem(key, '0');
    const value = window.Webinsolito.store.get(key, 99);
    localStorage.removeItem(key);
    return value;
  });
  expect(falsyRoundTrip).toBe(0);

  const blocked = await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    try { return window.Webinsolito.store.set('wi-test', { ok: true }); }
    finally { Storage.prototype.setItem = original; }
  });
  expect(blocked).toBe(false);
});
