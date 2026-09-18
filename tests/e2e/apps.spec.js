const { test, expect } = require('@playwright/test');

const PAGE_ERRORS=new WeakMap();
test.beforeEach(async ({page})=>{const e=[];PAGE_ERRORS.set(page,e);page.on('pageerror',x=>e.push(x.message));});
test.afterEach(async ({page})=>{expect(PAGE_ERRORS.get(page)||[],(PAGE_ERRORS.get(page)||[]).join('\n')).toEqual([]);});

const APPS=['autobuddy','fuelgo','carcost','tripcost','parkmemo','bollo-check','revisione-memo','tyre-memo','service-book','fuel-saver','car-value','parking-cost','evcharge','range-calc','sell-my-car','dealerflow','bresciago','frigochef','stylematch','splitly','screensort','packr','docpocket','safebuy'];

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
  await page.locator('button[onclick="runScan()"]:visible').click();
  await expect(page.locator('#result')).not.toContainText('/100');
  await expect(page.locator('#result')).toContainText(/Pochi segnali|Attenzione/);
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


test('CarCost: calculate and save a real ownership scenario', async ({ page }) => {
  await page.goto('/carcost/');
  await page.locator('#carName').fill('Auto QA');
  await page.locator('#price').fill('20000');
  await page.locator('#years').fill('5');
  await page.locator('#km').fill('15000');
  await page.locator('#cons').fill('6');
  await page.locator('#fuel').fill('1.80');
  await page.locator('#insurance').fill('600');
  await page.locator('#tax').fill('200');
  await page.locator('#maintenance').fill('500');
  await page.locator('#resale').fill('8000');
  await page.getByRole('button',{name:'Calcola costo reale'}).click();
  await expect(page.locator('#monthly')).not.toHaveText('—');
  await expect(page.locator('#perKm')).toContainText('€');
  await page.getByRole('button',{name:'Salva questo calcolo'}).click();
  await expect(page.locator('#historyList')).toContainText('Auto QA');
});

test('TripCost: calculate total and split per person', async ({ page }) => {
  await page.goto('/tripcost/');
  await page.locator('#tripName').fill('Viaggio QA');
  await page.locator('#distance').fill('100');
  await page.locator('#people').fill('4');
  await page.locator('#cons').fill('6');
  await page.locator('#fuel').fill('1.80');
  await page.locator('#tolls').fill('20');
  await page.getByRole('button',{name:'Calcola viaggio'}).click();
  await expect(page.locator('#total')).not.toHaveText('—');
  await expect(page.locator('#perPerson')).not.toHaveText('—');
  await page.getByRole('button',{name:'Salva viaggio'}).click();
  await expect(page.locator('#historyList')).toContainText('Viaggio QA');
});

test('DocPocket: native encrypted-backup crypto roundtrip', async ({ page }) => {
  await page.goto('/docpocket/');
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

test('Catalog: active apps, manifests and icons exist', async ({ request }) => {
  const r=await request.get('/apps.json');
  expect(r.ok()).toBeTruthy();
  const catalog=await r.json();
  expect(catalog.categories).toHaveLength(12);
  const active=catalog.apps.filter(a=>['MVP','BETA','STABLE'].includes(a.status)&&a.path);
  expect(active.length).toBeGreaterThanOrEqual(24);
  expect(active.filter(a=>a.category==='auto')).toHaveLength(15);
  for(const app of active){
    const pageRes=await request.get('/'+app.path);
    expect(pageRes.ok(),app.name+' page').toBeTruthy();
    const manifestRes=await request.get('/'+app.path+'manifest.json');
    expect(manifestRes.ok(),app.name+' manifest').toBeTruthy();
    const m=await manifestRes.json();
    expect(m.name).toBeTruthy();
    const iconRes=await request.get('/'+app.icon);
    expect(iconRes.ok(),app.name+' icon').toBeTruthy();
  }
});

test('FuelGo: cost tools use the selected official price', async ({ page }) => {
  await page.goto('/fuelgo/');
  await expect(page.locator('#dataFreshness')).toContainText('impianti',{timeout:15000});
  await page.locator('#cityInput').fill('Brescia');
  await page.getByRole('button',{name:'Cerca'}).click();
  await expect.poll(async()=>page.locator('.station').count(),{timeout:15000}).toBeGreaterThan(0);
  await expect(page.getByRole('link',{name:'Costo auto'}).first()).toHaveAttribute('href',/carcost\/\?fuel=/);
  await expect(page.getByRole('link',{name:'Costo viaggio'}).first()).toHaveAttribute('href',/tripcost\/\?fuel=/);
});


test('SEO and installability: every active app exposes canonical, description and install action', async ({ page, request }) => {
  const r=await request.get('/apps.json');
  const catalog=await r.json();
  const active=catalog.apps.filter(a=>['MVP','BETA','STABLE'].includes(a.status)&&a.path);
  for(const app of active){
    await page.goto('/'+app.path);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await expect(page.locator('.wi-app-install')).toBeVisible();
  }
});

test('Home links directly to real category pages', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('#categoryGrid .cat')).toHaveCount(12);
  await expect(page.locator('#groups')).toHaveCount(0);
  await expect(page.getByRole('link',{name:/Auto & mobilità/i})).toHaveAttribute('href','./auto/');
  await page.goto('/auto/');
  await expect(page.locator('#apps .app')).toHaveCount(15);
  await expect(page.locator('#availableCount')).toHaveText('15 disponibili');
  const old=await request.get('/categorie.html');
  expect(old.ok()).toBeTruthy();
});


test('Auto MVP: BolloCheck validates, calculates and resets', async ({ page }) => {
  await page.goto('/bollo-check/');
  await page.getByRole('button',{name:'Calcola'}).click();
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#expiry').fill('2027-01-15');
  await page.locator('#amount').fill('240');
  await page.getByRole('button',{name:'Calcola'}).click();
  await expect(page.locator('#daysLeft')).not.toHaveText('—');
  await page.getByRole('button',{name:'Reset'}).click();
  await expect(page.locator('#daysLeft')).toHaveText('—');
});

test('Auto MVP: RevisioneMemo calculates a reminder', async ({ page }) => {
  await page.goto('/revisione-memo/');
  await page.getByRole('button',{name:'Calcola'}).click();
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#baseDate').fill('2026-01-15');
  await page.locator('#months').fill('24');
  await page.getByRole('button',{name:'Calcola'}).click();
  await expect(page.locator('#nextDate')).not.toHaveText('—');
});

test('Auto MVP: TyreMemo rejects impossible km and calculates valid data', async ({ page }) => {
  await page.goto('/tyre-memo/');
  await page.locator('#installKm').fill('50000');
  await page.locator('#currentKm').fill('40000');
  await page.getByRole('button',{name:'Controlla'}).click();
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#currentKm').fill('56000');
  await page.getByRole('button',{name:'Controlla'}).click();
  await expect(page.locator('#kmLeft')).not.toHaveText('—');
});

test('Auto MVP: ServiceBook stores a maintenance entry', async ({ page }) => {
  await page.goto('/service-book/');
  await page.getByRole('button',{name:'Salva intervento'}).click();
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#title').fill('Tagliando QA');
  await page.locator('#date').fill('2026-09-18');
  await page.locator('#km').fill('45000');
  await page.locator('#cost').fill('320');
  await page.getByRole('button',{name:'Salva intervento'}).click();
  await expect(page.locator('#list')).toContainText('Tagliando QA');
  await page.reload();
  await expect(page.locator('#list')).toContainText('Tagliando QA');
});

test('Auto MVP: FuelSaver calculates net detour benefit', async ({ page }) => {
  await page.goto('/fuel-saver/');
  await page.getByRole('button',{name:'Confronta'}).click();
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#priceA').fill('1.90');
  await page.locator('#priceB').fill('1.75');
  await page.locator('#litres').fill('40');
  await page.locator('#detour').fill('6');
  await page.locator('#cons').fill('6.5');
  await page.getByRole('button',{name:'Confronta'}).click();
  await expect(page.locator('#net')).not.toHaveText('—');
});

test('Auto MVP: CarValue returns transparent depreciation estimate', async ({ page }) => {
  await page.goto('/car-value/');
  await page.getByRole('button',{name:'Calcola stima'}).click();
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#price').fill('30000');
  await page.locator('#years').fill('4');
  await page.locator('#rate').fill('12');
  await page.getByRole('button',{name:'Calcola stima'}).click();
  await expect(page.locator('#value')).not.toHaveText('—');
});

test('Auto MVP: ParkingCost validates time and calculates tariff', async ({ page }) => {
  await page.goto('/parking-cost/');
  await page.locator('#start').fill('2026-09-18T12:00');
  await page.locator('#end').fill('2026-09-18T10:00');
  await page.getByRole('button',{name:'Calcola costo'}).click();
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#end').fill('2026-09-18T15:30');
  await page.locator('#first').fill('2');
  await page.locator('#next').fill('1.5');
  await page.getByRole('button',{name:'Calcola costo'}).click();
  await expect(page.locator('#cost')).not.toHaveText('—');
});

test('Auto MVP: EVCharge calculates energy time and cost', async ({ page }) => {
  await page.goto('/evcharge/');
  await page.locator('#battery').fill('60');
  await page.locator('#startPct').fill('80');
  await page.locator('#targetPct').fill('20');
  await page.locator('#power').fill('11');
  await page.getByRole('button',{name:'Calcola ricarica'}).click();
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#startPct').fill('20');
  await page.locator('#targetPct').fill('80');
  await page.locator('#price').fill('0.45');
  await page.getByRole('button',{name:'Calcola ricarica'}).click();
  await expect(page.locator('#cost')).not.toHaveText('—');
  await expect(page.locator('#time')).not.toHaveText('—');
});

test('Auto MVP: RangeCalc calculates fuel and EV range', async ({ page }) => {
  await page.goto('/range-calc/');
  await page.getByRole('button',{name:'Stima autonomia'}).click();
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#capacity').fill('50');
  await page.locator('#level').fill('50');
  await page.locator('#cons').fill('6');
  await page.getByRole('button',{name:'Stima autonomia'}).click();
  await expect(page.locator('#range')).toContainText('km');
  await page.locator('#mode').selectOption('ev');
  await page.locator('#capacity').fill('70');
  await page.locator('#cons').fill('18');
  await page.getByRole('button',{name:'Stima autonomia'}).click();
  await expect(page.locator('#available')).toContainText('kWh');
});

test('Auto MVP: SellMyCar generates and persists a listing draft', async ({ page }) => {
  await page.goto('/sell-my-car/');
  await page.getByRole('button',{name:'Genera annuncio'}).click();
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#make').fill('Toyota');
  await page.locator('#model').fill('Yaris');
  await page.locator('#year').fill('2022');
  await page.locator('#km').fill('32000');
  await page.locator('#price').fill('15900');
  await page.getByRole('button',{name:'Genera annuncio'}).click();
  await expect(page.locator('#output')).toHaveValue(/Toyota Yaris/);
  await page.reload();
  await expect(page.locator('#output')).toHaveValue(/Toyota Yaris/);
});

test('Real category pages exist for all 12 macro-categories', async ({ request }) => {
  for (const slug of ['auto','food','soldi','eventi','documenti','casa','viaggi','persona','shopping','territorio','business','studio']) {
    const r=await request.get('/'+slug+'/');
    expect(r.ok(),slug).toBeTruthy();
  }
});
