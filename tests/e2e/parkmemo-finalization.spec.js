const { test, expect } = require('@playwright/test');

const onePxPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1xkAAAAASUVORK5CYII=','base64');

test.describe('ParkMemo finalization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/parkmemo/');
  });

  test('controls are accessible and back returns to Auto', async ({ page }) => {
    await expect(page.locator('a.back')).toHaveAttribute('href','../auto/');
    for (const id of ['note','address','until','pic']) {
      const el=page.locator('#'+id);
      const name=await el.evaluate(node=>{
        if(node.labels?.length)return [...node.labels].map(x=>x.textContent.trim()).join(' ');
        return node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||'';
      });
      expect(name,id+' must have an accessible name').not.toBe('');
    }
    await expect(page.locator('#pic')).toHaveAttribute('accept','image/jpeg,image/png,image/webp');
  });

  test('manual parking rejects empty state and persists useful data', async ({ page }) => {
    const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
    await page.getByRole('button',{name:'Salva senza posizione'}).click();
    expect(dialogs.at(-1)).toContain('nota o un indirizzo');
    await expect(page.locator('#note')).toBeFocused();

    await page.locator('#note').fill('Fila C posto 12');
    await page.locator('#address').fill('Via Roma 1, Brescia');
    await page.getByRole('button',{name:'Salva senza posizione'}).click();
    await expect(page.locator('#activeCard')).toContainText('Fila C posto 12');
    await page.reload();
    await expect(page.locator('#activeCard')).toContainText('Fila C posto 12');
  });

  test('GPS failure is reported without creating a parking record', async ({ page }) => {
    const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
    await page.evaluate(() => {
      Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
        getCurrentPosition:(ok,fail)=>fail({message:'permesso negato'})
      }});
    });
    await page.getByRole('button',{name:'SALVA POSIZIONE'}).click();
    await expect.poll(()=>dialogs.length).toBeGreaterThan(0);
    expect(dialogs.at(-1)).toContain('permesso negato');
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('parkmemo.v2')||'null'));
    expect(stored?.current||null).toBeNull();
  });

  test('forged photo is rejected while a valid PNG is accepted', async ({ page }) => {
    const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
    await page.locator('#pic').setInputFiles({name:'fake.png',mimeType:'image/png',buffer:Buffer.from('<script>alert(1)</script>')});
    await expect.poll(()=>dialogs.length).toBeGreaterThan(0);
    expect(dialogs.at(-1)).toContain('non è un’immagine valida');

    await page.locator('#pic').setInputFiles({name:'park.png',mimeType:'image/png',buffer:onePxPng});
    await page.locator('#note').fill('Foto parcheggio');
    await expect.poll(async()=>page.evaluate(()=>photoData.startsWith('data:image/jpeg;base64,'))).toBeTruthy();
    await page.getByRole('button',{name:'Salva senza posizione'}).click();
    await expect(page.locator('#activeCard img.photo')).toHaveCount(1);
  });

  test('manipulated local state is normalized before rendering', async ({ page }) => {
    await page.addInitScript(() => {
      window.__xss=0;
      localStorage.setItem('parkmemo.v2',JSON.stringify({
        version:2,
        current:{id:1,lat:null,lng:null,note:'Test',address:'Brescia',until:'bad',photo:'x" onerror="window.__xss=1',at:'bad'},
        history:[
          {id:2,lat:45.5,lng:10.2,note:'<img src=x onerror="window.__xss=1">',address:'',until:'',photo:'javascript:alert(1)',at:'bad'},
          {id:'2);window.__xss=1;//',lat:45,lng:10,note:'Injected',address:'',at:new Date().toISOString()}
        ],
        frequent:[{id:3,note:'Casa',address:'Via A',lat:999,lng:10}]
      }));
    });
    await page.reload();
    expect(await page.evaluate(()=>window.__xss)).toBe(0);
    await expect(page.locator('#activeCard img.photo')).toHaveCount(0);
    const stored=await page.evaluate(()=>S);
    expect(stored.history).toHaveLength(1);
    expect(stored.history[0].photo).toBe('');
    expect(stored.history[0].at).toBe('');
    expect(stored.frequent[0].lat).toBeNull();
  });

  test('navigation uses safe external target features', async ({ page }) => {
    await page.locator('#note').fill('GPS QA');
    await page.evaluate(() => {
      window.__opened=null;
      window.open=(...args)=>{window.__opened=args;return null};
      Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
        getCurrentPosition:(ok)=>ok({coords:{latitude:45.54,longitude:10.21}})
      }});
    });
    await page.getByRole('button',{name:'SALVA POSIZIONE'}).click();
    await page.getByRole('button',{name:'PORTAMI ALL’AUTO'}).first().click();
    const opened=await page.evaluate(()=>window.__opened);
    expect(opened[0]).toContain('https://maps.apple.com/');
    expect(opened[2]).toContain('noopener');
    expect(opened[2]).toContain('noreferrer');
  });

  for (const width of [360,390,430]) {
    test('mobile has no horizontal overflow at '+width+'px', async ({ page }) => {
      await page.setViewportSize({width,height:844});
      await page.goto('/parkmemo/');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});