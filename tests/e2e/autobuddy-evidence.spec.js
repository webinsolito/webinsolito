const { test, expect } = require('@playwright/test');

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64'
);

async function addVehicle(page) {
  await page.goto('/autobuddy/');
  await page.getByRole('button', { name: 'Auto' }).first().click();
  await page.getByRole('button', { name: '+ Veicolo' }).click();
  await page.locator('#vPlate').fill('AB123CD');
  await page.locator('#vModel').fill('FIAT Panda');
  await page.locator('#vYear').fill('2021');
  await page.locator('#vKm').fill('45000');
  await page.getByRole('button', { name: 'Salva veicolo' }).click();
}

test.describe('AutoBuddy contextual photo evidence', () => {
  test('exposes camera-friendly evidence inputs', async ({ page }) => {
    await page.goto('/autobuddy/');
    for (const id of ['dPhoto', 'mPhoto']) {
      const input = page.locator('#' + id);
      await expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
      await expect(input).toHaveAttribute('capture', 'environment');
    }
  });

  test('deadline photo auto-fills the date and persists with its context', async ({ page }) => {
    await addVehicle(page);
    await page.getByRole('button', { name: 'Scadenze' }).first().click();
    await page.locator('#dVeh').selectOption({ index: 1 });
    await page.locator('#dType').selectOption({ label: 'Revisione' });
    await page.locator('#dPhoto').setInputFiles({ name: 'revisione.png', mimeType: 'image/png', buffer: tinyPng });
    await expect(page.locator('#dDate')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Aggiungi scadenza' }).click();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('autobuddy.v2')));
    expect(saved.deadlines).toHaveLength(1);
    expect(saved.deadlines[0].type).toBe('Revisione');
    expect(saved.deadlines[0].photo).toMatch(/^data:image\/(?:jpeg|png|webp);base64,/);
    await expect(page.locator('#deadlineList')).toContainText('prova allegata');
    await expect(page.locator('#deadlineList').getByRole('button', { name: 'Foto' })).toHaveCount(1);
  });

  test('maintenance photo stays linked to vehicle, work and date', async ({ page }) => {
    await addVehicle(page);
    await page.getByRole('button', { name: 'Storico' }).first().click();
    await page.locator('#mVeh').selectOption({ index: 1 });
    await page.locator('#mType').fill('Tagliando completo');
    await page.locator('#mKm').fill('45500');
    await page.locator('#mCost').fill('280');
    await page.locator('#mPhoto').setInputFiles({ name: 'tagliando.png', mimeType: 'image/png', buffer: tinyPng });
    await expect(page.locator('#mDate')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Salva intervento' }).click();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('autobuddy.v2')));
    expect(saved.maintenance).toHaveLength(1);
    expect(saved.maintenance[0].type).toBe('Tagliando completo');
    expect(saved.maintenance[0].photo).toMatch(/^data:image\/(?:jpeg|png|webp);base64,/);
    await expect(page.locator('#maintList')).toContainText('prova allegata');
    await expect(page.locator('#maintList').getByRole('button', { name: 'Foto' })).toHaveCount(1);
  });

  test('normalization preserves only safe image evidence', async ({ page }) => {
    await page.goto('/autobuddy/');
    const result = await page.evaluate(() => {
      const base = {
        version: 2,
        vehicles: [{ id: 1, plate: 'AB123CD', model: 'Auto', year: '2021', fuel: 'Benzina', km: 1000, photo: '' }],
        deadlines: [{ id: 2, veh: 1, type: 'Revisione', date: '2026-10-10', note: '', photo: 'javascript:alert(1)' }],
        maintenance: [{ id: 3, veh: 1, type: 'Tagliando', km: 1000, date: '2026-09-24', cost: 10, shop: '', nextDate: '', nextKm: 0, photo: 'data:image/png;base64,AAAA' }]
      };
      return normalizeState(base);
    });
    expect(result.deadlines[0].photo).toBe('');
    expect(result.maintenance[0].photo).toBe('data:image/png;base64,AAAA');
  });
});
