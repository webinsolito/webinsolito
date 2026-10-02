const { test, expect } = require('@playwright/test');

test.describe('FuelGo assisted location search', () => {
  test('CAP index is derived from the real FuelGo dataset', async ({ request }) => {
    const r = await request.get('/fuelgo/data/caps.json');
    expect(r.ok()).toBeTruthy();
    const j = await r.json();
    expect(Array.isArray(j.rows)).toBeTruthy();
    expect(j.rows.length).toBeGreaterThan(5000);
    expect(j.rows.some(x => x.province === 'BS' && /^25\d{3}$/.test(x.cap))).toBeTruthy();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/fuelgo/');
    await expect(page.locator('#dataFreshness')).not.toContainText('Caricamento');
  });

  test('one letter already proposes real places/provinces', async ({ page }) => {
    await page.locator('#cityInput').fill('B');
    const suggestions = page.locator('#placeSuggestions');
    await expect(suggestions).toBeVisible();
    await expect(suggestions.locator('.suggestion')).toHaveCount(10);
    await expect(suggestions).toContainText(/Provincia B|BARI|BRESCIA|BERGAMO/i);
  });

  test('province code can be selected directly', async ({ page }) => {
    await page.locator('#cityInput').fill('BS');
    await expect(page.locator('#placeSuggestions')).toContainText('Provincia BS');
    await page.getByRole('option', { name: /Provincia BS/i }).click();
    await expect(page.locator('#resultTitle')).toContainText('Provincia BS');
  });

  test('Comune autocomplete resolves Brescia exactly', async ({ page }) => {
    await page.locator('#cityInput').fill('Brescia');
    await expect(page.locator('#placeSuggestions')).toContainText(/BRESCIA · BS/i);
    await page.getByRole('option', { name: /BRESCIA · BS/i }).first().click();
    await expect(page.locator('#resultTitle')).toContainText('BRESCIA');
  });

  test('CAP input offers real locality matches', async ({ page, request }) => {
    const r = await request.get('/fuelgo/data/caps.json');
    const j = await r.json();
    const row = j.rows.find(x => x.province === 'BS' && /^25\d{3}$/.test(x.cap));
    expect(row).toBeTruthy();
    await page.locator('#cityInput').fill(row.cap);
    await expect(page.locator('#placeSuggestions')).toContainText(row.cap);
    await expect(page.locator('#placeSuggestions')).toContainText(row.city);
  });

  test('search input exposes combobox semantics without trapping keyboard users', async ({ page }) => {
    const input = page.locator('#cityInput');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await expect(input).toHaveAttribute('aria-controls', 'placeSuggestions');
    await input.fill('B');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
  });
});
