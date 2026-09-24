const { test, expect } = require('@playwright/test');

const onePxPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1xkAAAAASUVORK5CYII=','base64');

async function addIngredient(page,name,qty=''){
  await page.locator('#iName').fill(name);
  if(qty) await page.locator('#iQty').fill(qty);
  await page.getByRole('button',{name:'Aggiungi ingrediente'}).click();
}

test.describe('FrigoChef finalization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/frigochef/');
  });

  test('core controls are accessible and back returns to Food', async ({ page }) => {
    await expect(page.locator('.top a')).toHaveAttribute('href','../food/');
    for (const id of ['iName','iQty','iCat','iExpiry','quickAdd','photo','missingMax','maxTime','diet','recipeSearch','importFile']) {
      const el=page.locator('#'+id);
      const name=await el.evaluate(node=>{
        if(node.labels?.length)return [...node.labels].map(x=>x.textContent.trim()).join(' ');
        return node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||'';
      });
      expect(name,id+' must have an accessible name').not.toBe('');
    }
    await expect(page.locator('#photo')).toHaveAttribute('accept','image/jpeg,image/png,image/webp');
    await expect(page.locator('#importFile')).toHaveAttribute('accept','.json,application/json');
  });

  test('pantry persists and duplicate ingredient is rejected', async ({ page }) => {
    const dialogs=[]; page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
    await addIngredient(page,'Pomodoro QA','2');
    await expect(page.getByText('Pomodoro QA',{exact:true})).toBeVisible();
    await addIngredient(page,'pomodoro qa','3');
    expect(dialogs.at(-1)).toContain('già presente');
    await page.reload();
    await expect(page.getByText('Pomodoro QA',{exact:true})).toBeVisible();
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('frigochef.v2')));
    expect(stored.pantry).toHaveLength(1);
  });

  test('real pantry produces a 100 percent compatible recipe', async ({ page }) => {
    for (const ingredient of ['pasta','aglio','olio']) await addIngredient(page,ingredient);
    await page.evaluate(()=>go('recipes'));
    await page.locator('#missingMax').selectOption('0');
    await page.locator('#recipeSearch').fill('Pasta aglio e olio');
    const card=page.locator('#recipeGrid .recipe').filter({hasText:'Pasta aglio e olio'});
    await expect(card).toBeVisible();
    await expect(card.locator('.score')).toHaveText('100%');
    await expect(card).toContainText('hai tutto');
  });

  test('missing ingredients can be added to shopping list and removed safely', async ({ page }) => {
    await addIngredient(page,'pasta');
    await page.evaluate(()=>go('recipes'));
    await page.locator('#recipeSearch').fill('Pasta aglio e olio');
    const card=page.locator('#recipeGrid .recipe').filter({hasText:'Pasta aglio e olio'});
    await card.getByRole('button',{name:'+ mancanti'}).click();
    await expect(page.locator('#shopping')).toContainText('aglio');
    await expect(page.locator('#shopping')).toContainText('olio');
    await page.locator('#shopping button').first().click();
    await expect(page.locator('#shopping')).not.toContainText('aglio');
  });

  test('forged fridge photo is rejected by signature validation', async ({ page }) => {
    const dialogs=[]; page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
    await page.locator('#photo').setInputFiles({name:'fake.png',mimeType:'image/png',buffer:Buffer.from('<script>alert(1)</script>')});
    await expect.poll(()=>dialogs.length).toBeGreaterThan(0);
    expect(dialogs.at(-1)).toContain('non è un’immagine valida');
    await expect(page.locator('#photoPreview img')).toHaveCount(0);

    await page.locator('#photo').setInputFiles({name:'frigo.png',mimeType:'image/png',buffer:onePxPng});
    await expect(page.locator('#photoPreview img')).toHaveCount(1);
  });

  test('malicious backup is normalized and cannot inject shopping handlers', async ({ page }) => {
    const backup={
      version:2,
      pantry:[
        {id:1,name:'<img src=x onerror="window.__xss=1">',qty:'1',cat:'Frigo',expiry:'2026-09-30'},
        {id:'1);window.__xss=1;//',name:'Injected',qty:'',cat:'Altro'}
      ],
      fav:[0,999,'bad'],
      cooked:[{id:0,at:'2026-09-23T12:00:00.000Z'},{id:999,at:'bad'}],
      shopping:["');window.__xss=1;//",'olio']
    };
    await page.evaluate(()=>{window.__xss=0});
    page.on('dialog',async d=>{await d.accept()});
    await page.evaluate(()=>go('settings'));
    await page.locator('#importFile').setInputFiles({
      name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))
    });
    await page.evaluate(()=>go('pantry'));
    expect(await page.evaluate(()=>window.__xss)).toBe(0);
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('frigochef.v2')));
    expect(stored.pantry).toHaveLength(1);
    expect(stored.fav).toEqual([0]);
    expect(stored.cooked).toHaveLength(1);
    await page.evaluate(()=>go('recipes'));
    expect(await page.evaluate(()=>window.__xss)).toBe(0);
    await expect(page.locator('#shopping')).toContainText("');window.__xss=1;//");
  });

  for (const width of [360,390,430]) {
    test('mobile has no horizontal overflow at '+width+'px', async ({ page }) => {
      await page.setViewportSize({width,height:844});
      await page.goto('/frigochef/');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});