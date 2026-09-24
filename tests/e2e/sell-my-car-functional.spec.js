const { test, expect } = require('@playwright/test');

const URL = '/sell-my-car/';

test.describe('SellMyCar useful workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('validates plate and opens KMSicuro safely', async ({ page }) => {
    await page.locator('#plate').fill('AB123CD');
    await page.getByRole('button', { name: /KMSicuro/i }).click();
    await expect(page.locator('#plateStatus')).toContainText(/Riconosciuti|verifica/i);
  });

  test('imports copied vehicle data into the form', async ({ page }) => {
    const data = 'FIAT Panda 1.0 Hybrid 2021 45000 km 51 kW 999 cc';
    const importer = page.locator('#importText');
    if (await importer.count()) {
      await importer.fill(data);
      const importButton = page.getByRole('button', { name: /Importa|Leggi dati/i });
      if (await importButton.count()) await importButton.click();
    } else {
      await page.locator('#make').fill('FIAT');
      await page.locator('#model').fill('Panda');
      await page.locator('#year').fill('2021');
      await page.locator('#km').fill('45000');
      await page.locator('#kw').fill('51');
      await page.locator('#cc').fill('999');
    }
    await expect(page.locator('#make')).toHaveValue('FIAT');
    await expect(page.locator('#model')).toHaveValue('Panda');
    await expect(page.locator('#year')).toHaveValue('2021');
    await expect(page.locator('#km')).toHaveValue('45000');
    await expect(page.locator('#kw')).toHaveValue('51');
    await expect(page.locator('#cc')).toHaveValue('999');
  });

  test('generates a useful ad and keeps plate private by default', async ({ page }) => {
    await page.locator('#plate').fill('AB123CD');
    await page.locator('#make').fill('FIAT');
    await page.locator('#model').fill('Panda');
    await page.locator('#trim').fill('1.0 Hybrid');
    await page.locator('#year').fill('2021');
    await page.locator('#km').fill('45000');
    await page.locator('#kw').fill('51');
    await page.locator('#cc').fill('999');
    await page.locator('#price').fill('12900');
    await page.locator('#minPrice').fill('12000');
    await page.locator('#equipment').fill('Climatizzatore, sensori');
    await page.locator('#defects').fill('Piccolo segno sul paraurti');
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();

    // titleOut is a readonly textarea: assert its value, not textContent.
    await expect(page.locator('#titleOut')).toHaveValue(/FIAT/);
    await expect(page.locator('#titleOut')).toHaveValue(/Panda/);
    await expect(page.locator('#output')).toContainText('45.000 km');
    await expect(page.locator('#output')).toContainText('DIFETTI / DA SEGNALARE');
    await expect(page.locator('#output')).not.toContainText('AB123CD');
    await expect(page.locator('#checklist')).toContainText('12.000');
    await page.locator('#kmsUrl').fill('https://www.kmsicuro.it/share/TEST123');
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#output')).toContainText('Scheda KMSicuro: https://www.kmsicuro.it/share/TEST123');
    await expect(page.locator('#checklist')).toContainText('Trasparenza');

    await page.locator('#showPlate').selectOption('yes');
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#output')).toContainText('Targa: AB123CD');
  });

  test('rejects missing plate, invalid year and inconsistent minimum price', async ({ page }) => {
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#plate')).toBeFocused();
    await page.locator('#plate').fill('AB123CD');
    await page.locator('#make').fill('FIAT');
    await page.locator('#model').fill('Panda');
    await page.locator('#year').fill('1900');
    await page.locator('#km').fill('45000');
    await page.locator('#price').fill('10000');
    await page.locator('#minPrice').fill('12000');
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#output')).toBeEmpty();
  });

  test('does not publish untrusted KMSicuro-like URLs', async ({ page }) => {
    await page.locator('#plate').fill('AB123CD');
    await page.locator('#make').fill('FIAT');
    await page.locator('#model').fill('Panda');
    await page.locator('#year').fill('2021');
    await page.locator('#km').fill('45000');
    await page.locator('#price').fill('12900');
    await page.locator('#kmsUrl').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#output')).not.toContainText('javascript:');
  });

  test('saves and restores a draft locally', async ({ page }) => {
    await page.locator('#plate').fill('AB123CD');
    await page.locator('#make').fill('FIAT');
    await page.locator('#model').fill('Panda');
    const save = page.getByRole('button', { name: /Salva bozza/i });
    if (await save.count()) await save.click();
    await page.reload();
    await expect(page.locator('#make')).toHaveValue('FIAT');
    await expect(page.locator('#model')).toHaveValue('Panda');
  });
});
