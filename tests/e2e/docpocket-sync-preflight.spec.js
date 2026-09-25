const { test, expect } = require('@playwright/test');
const pdf=Buffer.from('%PDF-1.4\n% DocPocket preflight\n');

test.describe('DocPocket async security preflight',()=>{
  test.beforeEach(async({page})=>{await page.goto('/docpocket/');});

  test('forged PDF rejection is observed after async validation',async({page})=>{
    await page.locator('button[data-go="add"]:visible').click();
    await page.locator('#docName').fill('Documento non valido');
    await page.locator('#file').setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid-pdf-content')});
    const dialogPromise=page.waitForEvent('dialog');
    await page.getByRole('button',{name:'Salva documento'}).click();
    const dialog=await dialogPromise;
    expect(dialog.message()).toContain('non è valido');
    await dialog.accept();
    await page.evaluate(()=>go('wallet'));
    await expect(page.locator('#wallet')).not.toContainText('Documento non valido');
  });

  test('safe document opening is observed after async database read',async({page})=>{
    await page.locator('button[data-go="add"]:visible').click();
    await page.locator('#docName').fill('Documento apertura');
    await page.locator('#file').setInputFiles({name:'open.pdf',mimeType:'application/pdf',buffer:pdf});
    await page.getByRole('button',{name:'Salva documento'}).click();
    await page.evaluate(()=>{window.__docPocketOpened=null;window.open=(...args)=>{window.__docPocketOpened=args;return null;};});
    await page.getByRole('button',{name:'Apri'}).click();
    await expect.poll(()=>page.evaluate(()=>window.__docPocketOpened)).not.toBeNull();
    const opened=await page.evaluate(()=>window.__docPocketOpened);
    expect(opened[0]).toMatch(/^blob:/);
    expect(opened[2]).toContain('noopener');
    expect(opened[2]).toContain('noreferrer');
  });
});
