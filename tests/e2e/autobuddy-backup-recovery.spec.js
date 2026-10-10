const { test, expect } = require('@playwright/test');

test('AutoBuddy backup import can be undone without losing Garage data', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/autobuddy/');
  await page.evaluate(() => {
    const state = emptyState();
    state.vehicles = [{ id: 1, plate: 'AA111AA', model: 'Auto precedente', km: 12000 }];
    localStorage.setItem('autobuddy.v2', JSON.stringify(state));
  });
  await page.reload();
  await page.locator('button[data-go="garage"]:visible').click();
  await expect(page.locator('#garageGrid')).toContainText('AA111AA');

  const incoming = {
    version: 2,
    vehicles: [{ id: 2, plate: 'BB222BB', model: 'Auto importata', km: 45000 }],
    expenses: [{ id: 3, veh: 2, cat: 'Carburante', amt: 25, date: '2026-10-10' }]
  };
  await page.locator('#importFile').setInputFiles({
    name: 'autobuddy-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(incoming))
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('autobuddy.v2')).vehicles[0].plate)).toBe('BB222BB');
  await expect(page.locator('#restoreBackupBtn')).toBeVisible();
  await page.locator('#restoreBackupBtn').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('autobuddy.v2')).vehicles[0].plate)).toBe('AA111AA');
  await page.reload();
  await page.locator('button[data-go="garage"]:visible').click();
  await expect(page.locator('#garageGrid')).toContainText('AA111AA');
  expect(browserErrors).toEqual([]);
});

test('AutoBuddy rejects orphan expense without changing existing Garage', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/autobuddy/');
  await page.evaluate(() => {
    const state = emptyState();
    state.vehicles = [{ id: 1, plate: 'AA111AA', model: 'Auto originale' }];
    localStorage.setItem('autobuddy.v2', JSON.stringify(state));
  });
  await page.reload();
  const broken = { version: 2, vehicles: [{ id: 2, plate: 'BB222BB' }], expenses: [{ id: 4, veh: 999, amt: 50 }] };
  await page.locator('#importFile').setInputFiles({
    name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(broken))
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('autobuddy.v2')).vehicles[0].plate)).toBe('AA111AA');
  await expect(page.locator('#restoreBackupBtn')).toBeHidden();
});
