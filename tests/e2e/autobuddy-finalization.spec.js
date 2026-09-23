const { test, expect } = require('@playwright/test');

const critical = ['vPlate','vModel','vYear','vKm','eAmt','mType','docFile','importFile'];

async function createVehicle(page, { plate='QA123QA', model='Auto Test', year='2021', km='12000' } = {}) {
  await page.locator('button[data-go="garage"]:visible').click();
  await page.getByRole('button', { name:/Veicolo/ }).first().click();
  await page.locator('#vPlate').fill(plate);
  await page.locator('#vModel').fill(model);
  if (year !== null) await page.locator('#vYear').fill(year);
  if (km !== null) await page.locator('#vKm').fill(km);
  await page.getByRole('button', { name:'Salva veicolo' }).click();
}

test.describe('AutoBuddy finalization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/autobuddy/');
  });

  test('critical controls expose accessible names and semantic bounds', async ({ page }) => {
    for (const id of critical) {
      const el = page.locator('#' + id);
      await expect(el).toHaveCount(1);
      const name = await el.evaluate(node => {
        if (node.labels && node.labels.length) return [...node.labels].map(x => x.textContent.trim()).join(' ');
        return node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') || '';
      });
      expect(name, id + ' must have an accessible name').not.toBe('');
    }
    await expect(page.locator('#vPlate')).toHaveAttribute('required', '');
    await expect(page.locator('#vModel')).toHaveAttribute('required', '');
    await expect(page.locator('#vYear')).toHaveAttribute('min', '1950');
    await expect(page.locator('#vYear')).toHaveAttribute('max', '2100');
    await expect(page.locator('#vKm')).toHaveAttribute('min', '0');
    await expect(page.locator('#eAmt')).toHaveAttribute('min', '0.01');
    await expect(page.locator('#importFile')).toHaveAttribute('accept', '.json,application/json');
  });

  test('vehicle validation rejects invalid plate, year and kilometres', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });

    await createVehicle(page, { plate:'A1', model:'Panda', year:'2021', km:'12000' });
    expect(dialogs.at(-1)).toContain('targa valida');
    await expect(page.locator('#vPlate')).toBeFocused();

    await page.locator('#vPlate').fill('AB123CD');
    await page.locator('#vYear').fill('2200');
    await page.getByRole('button', { name:'Salva veicolo' }).click();
    expect(dialogs.at(-1)).toContain('anno valido');
    await expect(page.locator('#vYear')).toBeFocused();

    await page.locator('#vYear').fill('2021');
    await page.locator('#vKm').fill('-1');
    await page.getByRole('button', { name:'Salva veicolo' }).click();
    expect(dialogs.at(-1)).toContain('chilometri validi');
    await expect(page.locator('#vKm')).toBeFocused();
  });

  test('valid vehicle persists and user text is escaped', async ({ page }) => {
    await page.addInitScript(() => { window.__xss = 0; });
    await createVehicle(page, { model:'<img src=x onerror="window.__xss=1">', year:'2021', km:'12000' });
    await expect(page.locator('#garageGrid')).toContainText('<img src=x');
    expect(await page.evaluate(() => window.__xss)).toBe(0);
    await page.reload();
    await page.locator('button[data-go="garage"]:visible').click();
    await expect(page.locator('#garageGrid')).toContainText('<img src=x');
    expect(await page.evaluate(() => window.__xss)).toBe(0);
  });

  test('expense and maintenance reject invalid numeric values', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
    await createVehicle(page);

    await page.evaluate(() => go('expenses'));
    await page.locator('#eVeh').selectOption({ index:1 });
    await page.locator('#eAmt').fill('-10');
    await page.getByRole('button', { name:'Registra spesa' }).click();
    expect(dialogs.at(-1)).toContain('importo valido');
    const afterExpense = await page.evaluate(() => JSON.parse(localStorage.getItem('autobuddy.v2')));
    expect(afterExpense.expenses).toHaveLength(0);

    await page.evaluate(() => go('maintenance'));
    await page.locator('#mVeh').selectOption({ index:1 });
    await page.locator('#mType').fill('Tagliando');
    await page.locator('#mCost').fill('-20');
    await page.getByRole('button', { name:'Salva intervento' }).click();
    expect(dialogs.at(-1)).toContain('costo valido');
    const afterMaint = await page.evaluate(() => JSON.parse(localStorage.getItem('autobuddy.v2')));
    expect(afterMaint.maintenance).toHaveLength(0);
  });

  test('backup import normalizes schema and scrubs untrusted data URIs', async ({ page }) => {
    page.on('dialog', async d => { await d.accept(); });
    const backup = {
      version:2,
      vehicles:[
        { id:1, plate:'AB123CD', model:'Panda', photo:'javascript:alert(1)' },
        { id:'1);window.__xss=1;//', plate:'ZZ999ZZ', model:'Injected' }
      ],
      documents:[
        { id:2, veh:1, name:'Bad', data:'javascript:alert(2)' },
        { id:'2);window.__xss=1;//', veh:1, name:'Injected', data:'' }
      ],
      parking:{ lat:'\" onclick=\"window.__xss=1', lng:9.1, note:'<img src=x onerror=window.__xss=1>' }
    };
    await page.locator('#importFile').setInputFiles({
      name:'backup.json',
      mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(backup))
    });
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const x = JSON.parse(localStorage.getItem('autobuddy.v2') || '{}');
        return x.vehicles?.[0]?.model || '';
      });
    }).toBe('Panda');

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('autobuddy.v2')));
    expect(stored.vehicles[0].photo).toBe('');
    expect(stored.documents[0].data).toBe('');
    expect(stored.vehicles).toHaveLength(1);
    expect(stored.documents).toHaveLength(1);
    expect(stored.parking.lat).toBeNull();
    expect(await page.evaluate(() => window.__xss || 0)).toBe(0);
    expect(Array.isArray(stored.deadlines)).toBeTruthy();
    expect(Array.isArray(stored.expenses)).toBeTruthy();
    expect(Array.isArray(stored.maintenance)).toBeTruthy();
    expect(Array.isArray(stored.kmLog)).toBeTruthy();
  });

  for (const width of [360,390,430]) {
    test('mobile has no horizontal overflow at ' + width + 'px', async ({ page }) => {
      await page.setViewportSize({ width, height:844 });
      await page.goto('/autobuddy/');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
