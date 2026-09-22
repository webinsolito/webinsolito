const { test, expect } = require('@playwright/test');

test.describe('Auto utility sprint', () => {
  test('RangeCalc verifies a real trip and minimum start level', async ({ page }) => {
    await page.goto('/range-calc/');
    await page.locator('#capacity').fill('50');
    await page.locator('#level').fill('50');
    await page.locator('#cons').fill('5');
    await page.locator('#reserve').fill('10');
    await page.locator('#tripKm').fill('300');
    await page.getByRole('button', { name: 'Verifica autonomia' }).click();
    await expect(page.locator('#safeRange')).toHaveText('400 km');
    await expect(page.locator('#minStart')).toHaveText('40%');
    await expect(page.locator('#tripStatus')).toContainText('compatibile');
  });

  test('EVCharge exposes range and energy cost, not only charge time', async ({ page }) => {
    await page.goto('/evcharge/');
    await page.locator('#battery').fill('60');
    await page.locator('#startPct').fill('20');
    await page.locator('#targetPct').fill('80');
    await page.locator('#power').fill('11');
    await page.locator('#price').fill('0.5');
    await page.locator('#eff').fill('90');
    await page.locator('#consumption').fill('15');
    await page.locator('#tripKm').fill('250');
    await page.getByRole('button', { name: 'Calcola ricarica' }).click();
    await expect(page.locator('#addedRange')).toHaveText('240 km');
    await expect(page.locator('#targetRange')).toHaveText('320 km');
    await expect(page.locator('#tripStatus')).toContainText('copre teoricamente');
  });

  test('ParkingCost supports free minutes and tariff steps', async ({ page }) => {
    await page.goto('/parking-cost/');
    await page.locator('#start').fill('2026-09-22T10:00');
    await page.locator('#end').fill('2026-09-22T11:20');
    await page.locator('#freeMins').fill('15');
    await page.locator('#stepMins').fill('30');
    await page.locator('#first').fill('2');
    await page.locator('#next').fill('1.5');
    await page.getByRole('button', { name: 'Calcola costo' }).click();
    await expect(page.locator('#billHours')).toHaveText('3');
    await expect(page.locator('#nextStep')).toHaveText('25 min');
    await expect(page.locator('#cost')).toContainText('5');
  });

  test('FuelSaver includes detour time in the decision', async ({ page }) => {
    await page.goto('/fuel-saver/');
    await page.locator('#priceA').fill('1.90');
    await page.locator('#priceB').fill('1.75');
    await page.locator('#litres').fill('40');
    await page.locator('#detour').fill('10');
    await page.locator('#cons').fill('6');
    await page.locator('#timeMins').fill('10');
    await page.locator('#timeValue').fill('12');
    await page.getByRole('button', { name: 'Confronta davvero' }).click();
    await expect(page.locator('#timeCost')).toContainText('2');
    await expect(page.locator('#minLitres')).toHaveText('21 L');
    await expect(page.locator('#status')).toContainText('conviene');
  });

  test('CarValue adjusts the formula using mileage and history and feeds SellMyCar', async ({ page }) => {
    await page.goto('/car-value/');
    await page.locator('#price').fill('30000');
    await page.locator('#years').fill('5');
    await page.locator('#rate').fill('12');
    await page.locator('#mileage').fill('75000');
    await page.locator('#annualKm').fill('15000');
    await page.locator('#owners').fill('1');
    await page.locator('#service').selectOption('complete');
    await page.locator('#damage').selectOption('none');
    await page.getByRole('button', { name: 'Calcola forchetta' }).click();
    await expect(page.locator('#kmDelta')).toHaveText('+0%');
    await expect(page.locator('#status')).toContainText('+4.0%');
    await expect(page.locator('#rangeValue')).not.toHaveText('—');
    await expect(page.locator('#sellLink')).toHaveAttribute('href', /sell-my-car\/\?price=\d+/);
  });

  test('SellMyCar accepts a price suggested by CarValue', async ({ page }) => {
    await page.goto('/sell-my-car/?price=12345');
    await expect(page.locator('#price')).toHaveValue('12345');
  });
});