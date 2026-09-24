const { test, expect } = require('@playwright/test');

const requiredFields = ['plate', 'make', 'model', 'year'];
const labelledFields = ['plate','kmsText','make','model','trim','year','km','registration','fuel','gear','kw','cc','color','kmsUrl','condition','price','minPrice','equipment','maintenance','defects','platform','showPlate','seller','titleOut','output'];

test.describe('SellMyCar accessibility and semantic validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sell-my-car/');
  });

  test('critical inputs expose semantic constraints', async ({ page }) => {
    for (const id of requiredFields) {
      await expect(page.locator(`#${id}`)).toHaveAttribute('required', '');
    }
    await expect(page.locator('#plate')).toHaveAttribute('aria-describedby', 'plateStatus');
    await expect(page.locator('#error')).toHaveAttribute('role', 'alert');
  });

  test('every visible form control has an accessible name', async ({ page }) => {
    for (const id of labelledFields) {
      const control = page.locator(`#${id}`);
      await expect(control).toHaveCount(1);
      const name = await control.evaluate(el => {
        if (el.labels && el.labels.length) return [...el.labels].map(x => x.textContent.trim()).join(' ');
        return el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '';
      });
      expect(name, `${id} must have an accessible name`).not.toBe('');
    }
  });

  test('invalid generation focuses the first missing critical field', async ({ page }) => {
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#error')).toBeVisible();
    await expect(page.locator('#error')).toContainText('targa');
    await expect(page.locator('#plate')).toBeFocused();
  });
});
