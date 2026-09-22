const { test, expect } = require('@playwright/test');

test('shared storage helper preserves falsy JSON and survives blocked localStorage', async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({ url: '/assets/webinsolito-core.js' });

  const result = await page.evaluate(() => {
    const key = 'wi-test-falsy';
    localStorage.setItem(key, '0');
    const falsy = window.Webinsolito.store.get(key, 99);
    localStorage.removeItem(key);

    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    let blockedSet;
    try { blockedSet = window.Webinsolito.store.set('wi-test', { ok: true }); }
    finally { Storage.prototype.setItem = originalSet; }

    const missing = window.Webinsolito.store.get('wi-missing', false);
    return { falsy, blockedSet, missing };
  });

  expect(result.falsy).toBe(0);
  expect(result.blockedSet).toBe(false);
  expect(result.missing).toBe(false);
});