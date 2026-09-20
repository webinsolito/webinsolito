const { test, expect } = require('@playwright/test');

test('PriceBasket requires a product name and persists a meaningful price entry', async ({ page }) => {
  await page.goto('/price-basket/');

  await page.locator('#f_source').fill('Supermercato');
  await page.locator('#f_amount').fill('2.49');
  await page.locator('#f_qty').fill('1 L');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#priceBasketValidation')).toContainText('nome del prodotto');
  await expect(page.locator('#list')).toContainText('Nessun elemento salvato');
  await expect(page.locator('#f_item')).toBeFocused();

  await page.locator('#f_item').fill('Latte');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#list')).toContainText('Latte');
  await expect(page.locator('#list')).toContainText('Supermercato');
  await page.reload();
  await expect(page.locator('#list')).toContainText('Latte');
});
