const { test, expect } = require('@playwright/test');

const onePxPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1xkAAAAASUVORK5CYII=','base64');

test.describe('ScreenSort finalization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/screensort/');
  });

  test('core controls are accessible and navigation returns to Documenti', async ({ page }) => {
    await expect(page.locator('.top a')).toHaveAttribute('href','../documenti/');
    for (const id of ['search','filter','files','defaultCat','tags','note','newCollection']) {
      const el=page.locator('#'+id);
      const name=await el.evaluate(node => {
        if(node.labels?.length) return [...node.labels].map(x=>x.textContent.trim()).join(' ');
        return node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||'';
      });
      expect(name,id+' must have an accessible name').not.toBe('');
    }
    await expect(page.locator('#files')).toHaveAttribute('accept','image/jpeg,image/png,image/webp');
    await expect(page.locator('#ocrStatus')).toHaveAttribute('role','status');
  });

  test('valid PNG imports and Idee stays a first-class category', async ({ page }) => {
    await page.locator('button[data-go="import"]:visible').click();
    await page.locator('#defaultCat').selectOption({label:'Idee'});
    await page.locator('#files').setInputFiles({name:'idea.png',mimeType:'image/png',buffer:onePxPng});
    await page.getByRole('button',{name:'Importa screenshot'}).click();
    await expect.poll(async()=>page.locator('#grid .shot').count()).toBe(1);
    await expect(page.locator('#grid select')).toHaveValue('Idee');
    await expect(page.locator('#grid select')).toHaveAttribute('aria-label',/Categoria di/);
  });

  test('forged image MIME is rejected by signature validation', async ({ page }) => {
    await page.locator('button[data-go="import"]:visible').click();
    await page.locator('#files').setInputFiles({name:'fake.png',mimeType:'image/png',buffer:Buffer.from('<script>alert(1)</script>')});
    const dialogPromise=page.waitForEvent('dialog');
    await page.getByRole('button',{name:'Importa screenshot'}).click();
    const dialog=await dialogPromise;
    expect(dialog.message()).toContain('non è un’immagine valida');
    await dialog.accept();
    await page.evaluate(()=>go('inbox'));
    await expect(page.locator('#grid .shot')).toHaveCount(0);
  });

  test('corrupt or injected collections are normalized without executing content', async ({ page }) => {
    await page.addInitScript(() => {
      window.__xss=0;
      localStorage.setItem('screensort.collections.v2',JSON.stringify([
        {id:1,name:'<img src=x onerror="window.__xss=1">',ids:[1]},
        {id:'1);window.__xss=1;//',name:'Injected',ids:['bad']}
      ]));
    });
    await page.reload();
    await page.evaluate(()=>go('collections'));
    await expect(page.locator('#collectionGrid')).toContainText('<img src=x');
    expect(await page.evaluate(()=>window.__xss)).toBe(0);
    const stored=await page.evaluate(()=>collections);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(1);
  });

  test('OCR failure is visible and does not destroy imported data', async ({ page }) => {
    await page.locator('button[data-go="import"]:visible').click();
    await page.locator('#files').setInputFiles({name:'ocr.png',mimeType:'image/png',buffer:onePxPng});
    await page.getByRole('button',{name:'Importa screenshot'}).click();
    await page.locator('#grid .selectBox').click();
    await page.evaluate(() => {
      window.Tesseract={createWorker:async()=>{throw new Error('offline OCR')}};
    });
    await page.getByRole('button',{name:'Leggi testo'}).click();
    await expect(page.locator('#ocrStatus')).toContainText('OCR non riuscito');
    await expect(page.locator('#grid .shot')).toHaveCount(1);
  });

  for (const width of [360,390,430]) {
    test('mobile has no horizontal overflow at '+width+'px', async ({ page }) => {
      await page.setViewportSize({width,height:844});
      await page.goto('/screensort/');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});