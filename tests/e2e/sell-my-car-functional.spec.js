const { test, expect } = require('@playwright/test');

test.describe('SellMyCar useful workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__opened = null;
      window.open = (...args) => { window.__opened = args; return null; };
    });
    await page.goto('/sell-my-car/');
  });

  test('validates plate and opens KMSicuro safely', async ({ page }) => {
    await page.locator('#plate').fill('A1');
    await page.getByRole('button', { name: 'Apri KMSicuro' }).click();
    await expect(page.locator('#plateStatus')).toContainText('Controlla la targa');

    await page.locator('#plate').fill('ab123cd');
    await page.getByRole('button', { name: 'Apri KMSicuro' }).click();
    await expect(page.locator('#plate')).toHaveValue('AB123CD');
    await expect(page.locator('#plateStatus')).toContainText('copiata');
    const opened = await page.evaluate(() => window.__opened);
    expect(opened[0]).toBe('https://www.kmsicuro.it/');
    expect(opened[2]).toContain('noopener');
    expect(opened[2]).toContain('noreferrer');
  });

  test('imports copied vehicle data into the form', async ({ page }) => {
    await page.locator('#kmsText').fill(
      'Marca: FIAT\nModello: PANDA\nImmatricolazione: 2021\nPotenza: 51 kW\nCilindrata: 999 cm³'
    );
    await page.getByRole('button', { name: 'Compila dati automaticamente' }).click();
    await expect(page.locator('#make')).toHaveValue('FIAT');
    await expect(page.locator('#model')).toHaveValue('PANDA');
    await expect(page.locator('#year')).toHaveValue('2021');
    await expect(page.locator('#kw')).toHaveValue('51');
    await expect(page.locator('#cc')).toHaveValue('999');
    await expect(page.locator('#plateStatus')).toContainText('Riconosciuti');
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

    await expect(page.locator('#titleOut')).toContainText('FIAT');
    await expect(page.locator('#titleOut')).toContainText('Panda');
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
    await page.locator('#make').fill('FIAT');
    await page.locator('#model').fill('Panda');
    await page.locator('#year').fill('2021');
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#error')).toContainText('targa valida');
    await expect(page.locator('#plate')).toBeFocused();

    await page.locator('#plate').fill('AB123CD');
    await page.locator('#year').fill('2200');
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#error')).toContainText('anno valido');
    await expect(page.locator('#year')).toBeFocused();

    await page.locator('#year').fill('2021');
    await page.locator('#price').fill('10000');
    await page.locator('#minPrice').fill('15000');
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#error')).toContainText('prezzo minimo');
    await expect(page.locator('#minPrice')).toBeFocused();
  });

  test('does not publish untrusted KMSicuro-like URLs', async ({ page }) => {
    await page.locator('#plate').fill('AB123CD');
    await page.locator('#make').fill('FIAT');
    await page.locator('#model').fill('Panda');
    await page.locator('#year').fill('2021');
    await page.locator('#kmsUrl').fill('https://evil.example/?next=https://www.kmsicuro.it/share/TEST123');
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#output')).not.toContainText('evil.example');
    await expect(page.locator('#checklist')).not.toContainText('Trasparenza');

    await page.locator('#kmsUrl').fill('http://www.kmsicuro.it/share/TEST123');
    await page.getByRole('button', { name: 'Genera annuncio completo' }).click();
    await expect(page.locator('#output')).not.toContainText('http://www.kmsicuro.it');
    await expect(page.locator('#checklist')).not.toContainText('Trasparenza');
  });

  test('saves and restores a draft locally', async ({ page }) => {
    await page.locator('#make').fill('Toyota');
    await page.locator('#model').fill('Yaris');
    await page.locator('#year').fill('2020');
    await page.getByRole('button', { name: 'Salva bozza' }).click();
    await page.reload();
    await expect(page.locator('#make')).toHaveValue('Toyota');
    await expect(page.locator('#model')).toHaveValue('Yaris');
    await expect(page.locator('#year')).toHaveValue('2020');
  });
});