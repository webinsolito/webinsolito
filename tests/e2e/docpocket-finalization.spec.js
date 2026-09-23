const { test, expect } = require('@playwright/test');

const pdf=Buffer.from('%PDF-1.4\n% DocPocket QA\n');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1xkAAAAASUVORK5CYII=','base64');

test.describe('DocPocket finalization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docpocket/');
  });

  test('controls are accessible and back returns to Documenti', async ({ page }) => {
    await expect(page.locator('.top a')).toHaveAttribute('href','../documenti/');
    for(const id of ['search','filter','docName','cat','expiry','note','file','importFile']){
      const el=page.locator('#'+id);
      const name=await el.evaluate(node=>{
        if(node.labels?.length)return [...node.labels].map(x=>x.textContent.trim()).join(' ');
        return node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||'';
      });
      expect(name,id+' must have an accessible name').not.toBe('');
    }
    await expect(page.locator('#file')).toHaveAttribute('accept','image/jpeg,image/png,image/webp,application/pdf,.pdf');
    await expect(page.locator('#importFile')).toHaveAttribute('accept','.json,application/json');
    await expect(page.locator('#ocrNotice')).toHaveAttribute('role','status');
  });

  test('valid PDF archives locally and forged PDF is rejected', async ({ page }) => {
    await page.locator('button[data-go="add"]:visible').click();
    await page.locator('#docName').fill('Documento QA');
    await page.locator('#file').setInputFiles({name:'qa.pdf',mimeType:'application/pdf',buffer:pdf});
    await page.getByRole('button',{name:'Salva documento'}).click();
    await expect(page.locator('#wallet')).toContainText('Documento QA');

    const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
    await page.evaluate(()=>go('add'));
    await page.locator('#docName').fill('Falso');
    await page.locator('#file').setInputFiles({name:'fake.pdf',mimeType:'application/pdf',buffer:Buffer.from('not-a-real-pdf')});
    await page.getByRole('button',{name:'Salva documento'}).click();
    expect(dialogs.at(-1)).toContain('non è valido');
    await page.evaluate(()=>go('wallet'));
    await expect(page.locator('#wallet')).not.toContainText('Falso');
  });

  test('valid image can run OCR failure path without losing document', async ({ page }) => {
    await page.locator('button[data-go="add"]:visible').click();
    await page.locator('#docName').fill('Immagine QA');
    await page.locator('#file').setInputFiles({name:'qa.png',mimeType:'image/png',buffer:png});
    await page.getByRole('button',{name:'Salva documento'}).click();
    await page.evaluate(()=>{window.Tesseract={createWorker:async()=>{throw new Error('OCR offline')}}});
    await page.getByRole('button',{name:'OCR'}).click();
    await expect(page.locator('#ocrNotice')).toContainText('OCR non riuscito');
    await expect(page.locator('#wallet')).toContainText('Immagine QA');
  });

  test('opening a document uses safe blank target features', async ({ page }) => {
    await page.locator('button[data-go="add"]:visible').click();
    await page.locator('#docName').fill('Apri QA');
    await page.locator('#file').setInputFiles({name:'qa.pdf',mimeType:'application/pdf',buffer:pdf});
    await page.getByRole('button',{name:'Salva documento'}).click();
    await page.evaluate(()=>{window.__opened=null;window.open=(...args)=>{window.__opened=args;return null}});
    await page.getByRole('button',{name:'Apri'}).click();
    const opened=await page.evaluate(()=>window.__opened);
    expect(opened[0]).toMatch(/^blob:/);
    expect(opened[2]).toContain('noopener');
    expect(opened[2]).toContain('noreferrer');
  });

  test('backup import appends with new numeric ids and drops invalid files', async ({ page }) => {
    await page.locator('button[data-go="add"]:visible').click();
    await page.locator('#docName').fill('Prima del backup');
    await page.locator('#file').setInputFiles({name:'base.pdf',mimeType:'application/pdf',buffer:pdf});
    await page.getByRole('button',{name:'Salva documento'}).click();

    const backup={version:2,docs:[
      {id:1,name:'Import valido',cat:'Altro',expiry:'',note:'',type:'application/pdf',size:pdf.length,fav:false,trash:false,ocr:'',at:new Date().toISOString(),fileData:'data:application/pdf;base64,'+pdf.toString('base64')},
      {id:'not-a-number',name:'ID non valido',cat:'Altro',type:'application/pdf',fileData:'data:application/pdf;base64,'+pdf.toString('base64')},
      {id:2,name:'PDF mascherato',cat:'Altro',type:'application/pdf',fileData:'data:application/pdf;base64,'+Buffer.from('not-a-real-pdf').toString('base64')}
    ]};
    page.on('dialog',async d=>{await d.accept()});
    await page.evaluate(()=>go('settings'));
    await page.locator('#importFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await page.evaluate(()=>go('wallet'));
    await expect(page.locator('#wallet')).toContainText('Prima del backup');
    await expect(page.locator('#wallet')).toContainText('Import valido');
    await expect(page.locator('#wallet')).not.toContainText('PDF mascherato');
    const docs=await page.evaluate(async()=>await all());
    const ids=docs.map(x=>x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(x=>Number.isFinite(Number(x))&&Number(x)>0)).toBeTruthy();
  });

  test('encrypted backup primitive still roundtrips', async ({ page }) => {
    const ok=await page.evaluate(async()=>{
      const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
      const key=await cryptoKey('Password-QA-123',salt);
      const plain=new TextEncoder().encode('docpocket-qa');
      const enc=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
      const dec=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,enc);
      return new TextDecoder().decode(dec)==='docpocket-qa';
    });
    expect(ok).toBe(true);
  });

  for(const width of [360,390,430]){
    test('mobile has no horizontal overflow at '+width+'px',async({page})=>{
      await page.setViewportSize({width,height:844});
      await page.goto('/docpocket/');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});