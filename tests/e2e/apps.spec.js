const { test, expect } = require('@playwright/test');

const PAGE_ERRORS=new WeakMap();
test.beforeEach(async ({page})=>{const e=[];PAGE_ERRORS.set(page,e);page.on('pageerror',x=>e.push(x.message));});
test.afterEach(async ({page})=>{expect(PAGE_ERRORS.get(page)||[],(PAGE_ERRORS.get(page)||[]).join('\n')).toEqual([]);});

const APPS=['autobuddy','dealerflow','bresciago','frigochef','stylematch','splitly','parkmemo','screensort','packr','docpocket','safebuy','fuelgo'];

for (const app of APPS) {
  test(app+' loads without JavaScript page errors', async ({ page }) => {
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/'+app+'/',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(400);
    expect(errors,errors.join('\n')).toEqual([]);
    await expect(page.locator('body')).not.toBeEmpty();
  });
}

test('AutoBuddy: add a vehicle and persist it', async ({ page }) => {
  await page.goto('/autobuddy/');
  await page.locator('button[data-go="garage"]:visible').click();
  await page.getByRole('button',{name:/Veicolo/}).first().click();
  await page.locator('#vPlate').fill('QA123QA');
  await page.locator('#vModel').fill('Auto Test');
  await page.getByRole('button',{name:'Salva veicolo'}).click();
  await expect(page.locator('#garageGrid')).toContainText('Auto Test');
  await page.reload();
  await page.locator('button[data-go="garage"]:visible').click();
  await expect(page.locator('#garageGrid')).toContainText('Auto Test');
});

test('DealerFlow: create a lead', async ({ page }) => {
  await page.goto('/dealerflow/');
  await page.getByRole('button',{name:/Nuovo cliente/i}).click();
  await page.locator('#lName').fill('Cliente QA');
  await page.locator('#lContact').fill('0300000000');
  await page.locator('#lInterest').fill('Auto QA');
  await page.getByRole('button',{name:'Salva cliente'}).click();
  await expect(page.getByText('Cliente QA',{exact:true})).toBeVisible();
});

test('BresciaGo: automatic feed loads and an event can be chosen', async ({ page }) => {
  await page.goto('/bresciago/');
  await expect.poll(async()=>page.locator('.event').count(),{timeout:15000}).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Scegli evento'}).first().click();
  await expect(page.locator('#pickedCount')).not.toHaveText('');
});

test('FrigoChef: add an ingredient', async ({ page }) => {
  await page.goto('/frigochef/');
  await page.locator('#iName').fill('Pomodoro QA');
  await page.locator('#iQty').fill('2');
  await page.getByRole('button',{name:'Aggiungi ingrediente'}).click();
  await expect(page.getByText('Pomodoro QA',{exact:true})).toBeVisible();
});

test('StyleMatch: save measurements locally', async ({ page }) => {
  page.on('dialog',d=>d.accept());
  await page.goto('/stylematch/');
  await page.locator('#height').fill('175');
  await page.locator('#chest').fill('96');
  await page.locator('#waist').fill('82');
  await page.locator('#hip').fill('98');
  await page.getByRole('button',{name:'Salva profilo'}).click();
  const stored=await page.evaluate(()=>localStorage.getItem('stylematch.v2'));
  expect(stored).toContain('175');
});

test('Splitly: create a group', async ({ page }) => {
  await page.goto('/splitly/');
  await page.locator('#gName').fill('Weekend QA');
  await page.locator('#gPeople').fill('Alice, Bob');
  await page.getByRole('button',{name:'Salva gruppo'}).click();
  await expect(page.locator('#participants')).toContainText('Alice');
  await expect(page.locator('#participants')).toContainText('Bob');
});

test('ParkMemo: save parking without GPS', async ({ page }) => {
  await page.goto('/parkmemo/');
  await page.locator('#note').fill('Parcheggio QA');
  await page.locator('#address').fill('Brescia');
  await page.getByRole('button',{name:'Salva senza posizione'}).click();
  await expect(page.locator('#activeCard')).toContainText('Parcheggio QA');
});

test('ScreenSort: import a screenshot into IndexedDB', async ({ page }) => {
  await page.goto('/screensort/');
  await page.locator('button[data-go="import"]:visible').click();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1xkAAAAASUVORK5CYII=','base64');
  await page.locator('#files').setInputFiles({name:'qa-shot.png',mimeType:'image/png',buffer:png});
  await page.getByRole('button',{name:'Importa screenshot'}).click();
  await expect.poll(async()=>page.locator('#grid').locator('img').count(),{timeout:10000}).toBeGreaterThan(0);
});

test('Packr: create a trip and checklist', async ({ page }) => {
  await page.goto('/packr/');
  await page.locator('#dest').fill('Brescia QA');
  await page.locator('#start').fill('2026-10-01');
  await page.locator('#end').fill('2026-10-03');
  await page.getByRole('button',{name:'Genera checklist'}).click();
  await expect(page.getByText('Brescia QA',{exact:true}).first()).toBeVisible();
  await expect(page.locator('#categories')).not.toBeEmpty();
});

test('DocPocket: archive a PDF locally', async ({ page }) => {
  await page.goto('/docpocket/');
  await page.locator('button[data-go="add"]:visible').click();
  await page.locator('#docName').fill('Documento QA');
  await page.locator('#file').setInputFiles({name:'qa.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\\n% QA\\n')});
  await page.getByRole('button',{name:'Salva documento'}).click();
  await expect(page.locator('#wallet')).toContainText('Documento QA');
});

test('SafeBuy: scan returns a result', async ({ page }) => {
  await page.goto('/safebuy/');
  await page.locator('#url').fill('https://example.com/prodotto');
  await page.locator('#seller').fill('Negozio QA');
  await page.locator('#price').fill('99');
  await page.getByRole('button',{name:'CONTROLLA'}).click();
  await expect(page.locator('#result')).toContainText('/100');
});

test('FuelGo: search Brescia and receive official stations', async ({ page }) => {
  await page.goto('/fuelgo/');
  await expect(page.locator('#dataFreshness')).toContainText('impianti',{timeout:15000});
  await page.locator('#cityInput').fill('Brescia');
  await page.getByRole('button',{name:'Cerca'}).click();
  await expect.poll(async()=>page.locator('.station').count(),{timeout:15000}).toBeGreaterThan(0);
  await expect(page.getByRole('link',{name:'Portami lì'}).first()).toBeVisible();
});


test('Settings screens: clean and reachable', async ({ page }) => {
  for (const app of ['autobuddy','dealerflow','frigochef','stylematch','splitly','parkmemo','screensort','packr','docpocket','safebuy']) {
    await page.goto('/'+app+'/');
    await page.evaluate(()=>go('settings'));
    const panel=page.locator('[data-panel="settings"]');
    await expect(panel).toHaveClass(/on/);
    await expect(panel.locator('.settingsShell')).toBeVisible();
    await expect(panel.locator('.dangerZone')).toHaveCount(1);
  }
});


test('Public UI: no developer jargon', async ({ page }) => {
  const pages=['/','/autobuddy/','/dealerflow/','/bresciago/','/frigochef/','/stylematch/','/splitly/','/parkmemo/','/screensort/','/packr/','/docpocket/','/safebuy/','/fuelgo/'];
  const banned=['local-first','mobile-first','indexeddb','tesseract.js','mini-crm','digital fitting room','shared money, zero chaos','photo inbox','travel memory','local document wallet','local risk scanner','punteggio euristico','svuota-frigo mode'];
  for (const url of pages) {
    await page.goto(url);
    const visible=(await page.locator('body').innerText()).toLowerCase();
    for (const term of banned) expect(visible, url+' contiene '+term).not.toContain(term);
  }
});
