const { test, expect } = require('@playwright/test');

test('Pantry requires a product name and persists a meaningful item', async ({ page }) => {
  await page.goto('/pantry/');

  await page.locator('#f_qty').fill('2 confezioni');
  await page.locator('#f_date').fill('2026-09-30');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#pantryValidation')).toContainText('nome del prodotto');
  await expect(page.locator('#list')).toContainText('Nessun elemento salvato');
  await expect(page.locator('#f_item')).toBeFocused();

  await page.locator('#f_item').fill('Latte');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#list')).toContainText('Latte');
  await expect(page.locator('#list')).toContainText('2 confezioni');
  await page.reload();
  await expect(page.locator('#list')).toContainText('Latte');
});
