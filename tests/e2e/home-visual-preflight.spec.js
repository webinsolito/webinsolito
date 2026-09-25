const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('Home premium composition is stable on desktop, 390 and 430', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const shots='test-results/home-visual-preflight';
  fs.mkdirSync(shots,{recursive:true});

  for (const viewport of [
    {name:'desktop',width:1440,height:1000},
    {name:'mobile-390',width:390,height:844},
    {name:'mobile-430',width:430,height:932}
  ]) {
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await page.goto('/',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Dimmi cosa devi fare.'})).toBeVisible();
    await expect(page.locator('.searchShell')).toBeVisible();
    const cards=page.locator('#categoryGrid .cat');
    await expect(cards).toHaveCount(12);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),viewport.name+' horizontal overflow').toBeLessThanOrEqual(1);

    const first=await cards.nth(0).boundingBox();
    const second=await cards.nth(1).boundingBox();
    const travel=await cards.nth(5).boundingBox();
    expect(first?.height||0,viewport.name+' first card height').toBeGreaterThanOrEqual(180);
    expect(second?.height||0,viewport.name+' regular card height').toBeGreaterThanOrEqual(170);
    expect(travel?.height||0,viewport.name+' travel card height').toBeGreaterThanOrEqual(180);

    if(viewport.width<=430){
      expect(first?.width||0,viewport.name+' featured Auto width').toBeGreaterThan((second?.width||0)*1.7);
      expect(travel?.width||0,viewport.name+' featured Travel width').toBeGreaterThan((second?.width||0)*1.7);
    }

    await expect(cards.nth(0)).toHaveAttribute('href','./auto/');
    await expect(cards.nth(5)).toHaveAttribute('href','./viaggi/');
    await page.screenshot({path:`${shots}/${viewport.name}.png`,fullPage:true});
  }
});

test('Home category cards preserve interaction and navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  const first=page.locator('#categoryGrid .cat').first();
  await first.hover();
  const transform=await first.evaluate(el=>getComputedStyle(el).transform);
  expect(transform).not.toBe('none');
  await first.click();
  await expect(page).toHaveURL(/\/auto\/$/);
});
