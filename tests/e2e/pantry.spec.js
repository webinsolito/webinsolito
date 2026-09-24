const { test, expect } = require('@playwright/test');

test('Pantry requires a product name and persists a meaningful item', async ({ page }) => {
  await page.goto('/pantry/');

  // Pantry v3 separates pantry and freezer. Exercise the real pantry form
  // instead of the removed legacy micro-app selectors.
  await page.getByRole('button', { name: 'Dispensa' }).click();
  await page.locator('#pQty').fill('2 confezioni');
  await page.locator('#pExpiry').fill('2026-09-30');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#pantryList')).toContainText('Nessun prodotto in dispensa');
  await expect(page.locator('#pName')).toBeFocused();

  await page.locator('#pName').fill('Latte');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#pantryList')).toContainText('Latte');
  await expect(page.locator('#pantryList')).toContainText('2 confezioni');
  await page.reload();
  await page.getByRole('button', { name: 'Dispensa' }).click();
  await expect(page.locator('#pantryList')).toContainText('Latte');
});
