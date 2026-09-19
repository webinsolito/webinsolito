const { test, expect } = require('@playwright/test');

test('AccidentKit rejects empty records and saves meaningful incident data', async ({ page }) => {
  await page.goto('/accident-kit/');

  await page.getByRole('button', { name: 'Salva episodio' }).click();
  await expect(page.locator('#incidentValidation')).toContainText('Inserisci almeno');
  await expect(page.locator('#ilist')).toContainText('Nessun episodio salvato');

  await page.locator('#f_date').fill('2026-09-20');
  await page.locator('#f_place').fill('Brescia');
  await page.locator('#f_notes').fill('Paraurti posteriore danneggiato');
  await page.getByRole('button', { name: 'Salva episodio' }).click();

  await expect(page.locator('#ilist')).toContainText('Brescia');
  await expect(page.locator('#ilist')).toContainText('Paraurti posteriore danneggiato');
  await page.reload();
  await expect(page.locator('#ilist')).toContainText('Brescia');
});
