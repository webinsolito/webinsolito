const { test, expect } = require('@playwright/test');

const PAGE_ERRORS=new WeakMap();
test.beforeEach(async ({page})=>{const e=[];PAGE_ERRORS.set(page,e);page.on('pageerror',x=>e.push(x.message));});
test.afterEach(async ({page})=>{const all=PAGE_ERRORS.get(page)||[];const errors=all.filter(x=>!(/127\.0\.0\.1:4173\/sw\.js due to access control checks\.?$/i.test(x)));expect(errors,errors.join('\n')).toEqual([]);});

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
  expect(active.filter(a=>a.category==='auto')).toHaveLength(17);
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


test('SEO and installability: every active app has metadata, with browser install smoke per category', async ({ page, request }) => {
  const r=await request.get('/apps.json');
  const catalog=await r.json();
  const active=catalog.apps.filter(a=>['MVP','BETA','STABLE'].includes(a.status)&&a.path);
  for(const app of active){
    const res=await request.get('/'+app.path);
    expect(res.ok(),app.name+' page').toBeTruthy();
    const html=await res.text();
    expect(html,app.name+' canonical').toMatch(/<link[^>]+rel=["']canonical["']/i);
    expect(html,app.name+' description').toMatch(/<meta[^>]+name=["']description["']/i);
    expect(html,app.name+' manifest').toMatch(/<link[^>]+rel=["']manifest["']/i);
  }
  for(const category of catalog.categories){
    const app=active.find(a=>a.category===category.id);
    expect(app,category.id+' sample').toBeTruthy();
    await page.goto('/'+app.path);
    await expect(page.locator('.wi-app-install')).toBeVisible();
  }
});

test('Home links directly to real category pages', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('#categoryGrid .cat')).toHaveCount(12);
  await expect(page.locator('#groups')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Auto',exact:true})).toHaveAttribute('href','./auto/');
  await page.goto('/auto/');
  await expect(page.locator('#apps .app')).toHaveCount(17);
  await expect(page.locator('#availableCount')).toHaveText('17 disponibili');
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


test('Catalog keeps only useful active apps and home stays category-only', async ({ page }) => {
  const catalog = await (await page.request.get('/apps.json')).json();
  const active = catalog.apps.filter(a => ['MVP','BETA','STABLE'].includes(a.status) && a.path);
  expect(active).toHaveLength(181);
  await page.goto('/');
  await expect(page.getByText('In evidenza')).toHaveCount(0);
  await expect(page.locator('#categoryGrid .cat')).toHaveCount(12);
});

test('Shared micro-app engine performs a calculation and persists a record', async ({ page }) => {
  await page.goto('/discount-calc/');
  await page.locator('#f_price').fill('100');
  await page.locator('#f_discount').fill('20');
  await page.getByRole('button', { name: 'Calcola' }).click();
  await expect(page.locator('#out')).toContainText('80');
  await page.goto('/pantry/');
  await page.locator('#f_item').fill('Pasta');
  await page.locator('#f_qty').fill('2 pacchi');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#list')).toContainText('Pasta');
});


test('Category pages hide planned ideas from visitors', async ({ page }) => {
  await page.goto('/documenti/');
  await expect(page.getByText('In arrivo')).toHaveCount(0);
  await expect(page.locator('#planned')).toHaveCount(0);
});

test('Specialized utilities perform their real functions', async ({ page }) => {
  await page.goto('/warranty-check/');
  await page.locator('#date').fill('2026-01-01');
  await page.locator('#months').fill('24');
  await page.getByRole('button', { name: 'Calcola' }).click();
  await expect(page.locator('#out')).toContainText('01/01/2028');

  await page.goto('/serial-check/');
  await page.locator('#serial').fill('1HGCM82633A004352');
  await page.getByRole('button', { name: 'Controlla formato' }).click();
  await expect(page.locator('#out')).toContainText('VIN');

  await page.goto('/secure-notes/');
  await page.locator('#pass').fill('test-passphrase-123');
  await page.locator('#note').fill('nota privata test');
  await page.getByRole('button', { name: 'Cifra e salva' }).click();
  await expect(page.locator('#status')).toContainText('cifrata');
  await page.getByRole('button', { name: 'Decifra' }).click();
  await expect(page.locator('#note')).toHaveValue('nota privata test');

  await page.goto('/qrpocket/');
  await page.locator('#text').fill('https://webinsolito.github.io/webinsolito/');
  await page.getByRole('button', { name: 'Genera QR' }).click();
  await expect(page.locator('#qr canvas')).toHaveCount(1);
});

test('FileRename creates renamed downloadable copies locally', async ({ page }) => {
  await page.goto('/file-rename/');
  await page.locator('#files').setInputFiles([
    { name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-jpg-data') }
  ]);
  await page.locator('#prefix').fill('vacanza-');
  await page.getByRole('button', { name: 'Prepara nomi' }).click();
  await expect(page.locator('#list')).toContainText('vacanza-foto-01.jpg');
  await expect(page.locator('#list a[download]')).toHaveCount(1);
});


test('Home intent search understands natural problems', async ({ page }) => {
  await page.goto('/');
  const q=page.locator('#globalSearch');
  const cases=[
    ['devo vendere la macchina','sell-my-car'],
    ['mi scade la revisione','revisione-memo'],
    ['quanto spendo per andare a Roma','tripcost'],
    ['parto una settimana','packr'],
    ['voglio dividere una cena','splitly'],
    ['cosa cucino','frigochef'],
    ['devo studiare per un esame','exam-planner'],
    ['quanto mi costa davvero auto','carcost']
  ];
  for(const [query,id] of cases){
    await q.fill(query);
    const first=page.locator('#searchResults .res[href]').first();
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute('data-app-id',id);
  }
});

test('Home fuzzy search tolerates a useful typo', async ({ page }) => {
  await page.goto('/');
  await page.locator('#globalSearch').fill('revizione auto');
  await expect(page.locator('#searchResults .res[href]').first()).toHaveAttribute('data-app-id','revisione-memo');
});

test('Home visual hierarchy keeps categories strong without featured clutter', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('In evidenza')).toHaveCount(0);
  await expect(page.locator('#categoryGrid .cat')).toHaveCount(12);
    const icon=page.locator('#categoryGrid .cat img').first();
  const card=page.locator('#categoryGrid .cat').first();
  const iconBox=await icon.boundingBox(), cardBox=await card.boundingBox();
  expect(iconBox?.width).toBeGreaterThanOrEqual(56);
  expect(cardBox?.height).toBeGreaterThanOrEqual(175);
});

test('Home stays dense and readable on iPhone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name!=='iphone');
  await page.goto('/');
  const grid=page.locator('#categoryGrid');
  const cols=await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(cols).toBe(2);
  const icon=await page.locator('#categoryGrid .cat img').first().boundingBox();
  expect(icon?.width).toBeGreaterThanOrEqual(54);
});

test('Home visual before-after artifact', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name!=='desktop-chromium');
  try{
    await page.goto('https://webinsolito.github.io/webinsolito/?visual-baseline=run1',{waitUntil:'networkidle',timeout:15000});
    await page.screenshot({path:'test-results/home-visual-before-desktop.png',fullPage:true});
  }catch{}
  await page.goto('/');
  await page.waitForSelector('#categoryGrid .cat');
  await page.screenshot({path:'test-results/home-visual-after-desktop.png',fullPage:true});
});


test('Quality rebuild: 20 improved apps expose their specific flows', async ({ page }) => {
  const cases = [
    ['/seasonal-food/','#monthName'],
    ['/cocktail-mix/','#recipe'],
    ['/budget-lite/','#stats'],
    ['/savings-goal/','#target'],
    ['/warranty-pocket/','#months'],
    ['/manuals-pocket/','#source'],
    ['/laundry-helper/','#fabric'],
    ['/plant-water/','#interval'],
    ['/currency-pocket/','#fee'],
    ['/outfit-picker/','#tops'],
    ['/capsule-wardrobe/','#list'],
    ['/wishlist/','#target'],
    ['/return-memo/','#next'],
    ['/recycle-helper/','#q'],
    ['/waste-day/','#day'],
    ['/work-timer/','#project'],
    ['/quote-maker/','#lines'],
    ['/text-counter/','#txt'],
    ['/decision-helper/','#wBenefit'],
    ['/wardrobe/','#season']
  ];
  for (const [url,sel] of cases) {
    await page.goto(url);
    await expect(page.locator(sel)).toBeVisible();
  }
});

test('BudgetLite calculates totals and keeps records', async ({ page }) => {
  await page.goto('/budget-lite/');
  await page.locator('#item').fill('Spesa QA');
  await page.locator('#amount').fill('25');
  await page.locator('#type').selectOption('expense');
  await page.getByRole('button',{name:'Salva'}).click();
  await expect(page.locator('#list')).toContainText('Spesa QA');
  await expect(page.locator('#stats')).toContainText('25');
});

test('WarrantyPocket calculates a real expiry', async ({ page }) => {
  await page.goto('/warranty-pocket/');
  await page.locator('#item').fill('Telefono QA');
  await page.locator('#date').fill('2026-01-15');
  await page.locator('#months').selectOption('24');
  await page.getByRole('button',{name:'Salva garanzia'}).click();
  await expect(page.locator('#list')).toContainText('15/01/2028');
});

test('PlantWater marks a plant watered today', async ({ page }) => {
  await page.goto('/plant-water/');
  await page.locator('#item').fill('Ficus QA');
  await page.locator('#interval').fill('7');
  await page.getByRole('button',{name:'Salva'}).click();
  await expect(page.locator('#list')).toContainText('Ficus QA');
  await page.getByRole('button',{name:'Fatto oggi'}).click();
  await expect(page.locator('#list')).toContainText('tra 7 giorni');
});

test('QuoteMaker calculates line items and VAT', async ({ page }) => {
  await page.goto('/quote-maker/');
  await page.locator('[data-k="desc"]').fill('Servizio QA');
  await page.locator('[data-k="qty"]').fill('2');
  await page.locator('[data-k="price"]').fill('100');
  await page.locator('#vat').fill('22');
  await page.getByRole('button',{name:'Calcola preventivo'}).click();
  await expect(page.locator('#out')).toContainText('244');
});

test('Wardrobe data can feed OutfitPicker', async ({ page }) => {
  await page.goto('/wardrobe/');
  await page.locator('#item').fill('Maglia blu');
  await page.locator('#type').selectOption('top');
  await page.getByRole('button',{name:'Salva capo'}).click();
  await page.goto('/outfit-picker/');
  await page.getByRole('button',{name:'Usa Wardrobe'}).click();
  await expect(page.locator('#tops')).toContainText('Maglia blu');
});

test('Merged apps are no longer active catalog entries', async ({ request }) => {
  const c=await (await request.get('/apps.json')).json();
  for(const id of ['focus-mode','laundry-tags','eventi-go','today-nearby','weekend-go','tonight','free-events','family-events','market-go','concert-go','festival-go','museum-go','cinema-go','outdoor-go','date-ideas','rainy-day','kids-weekend','village-fest','local-sport']){
    const a=c.apps.find(x=>x.id===id);
    expect(a.status).toBe('MERGED');
    expect(a.path).toBe('');
  }
});

test('Mobile quality rebuild fits 360, 390 and 430 without horizontal overflow', async ({ browser }) => {
  for(const width of [360,390,430]){
    const ctx=await browser.newContext({viewport:{width,height:844}});
    const p=await ctx.newPage();
    for(const id of ['budget-lite','warranty-pocket','laundry-helper','plant-water','currency-pocket','outfit-picker','wishlist','return-memo','recycle-helper','waste-day','work-timer','quote-maker','text-counter','decision-helper','wardrobe']){
      await p.goto('/'+id+'/');
      const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
      expect(overflow,id+' overflow @'+width).toBe(false);
    }
    await ctx.close();
  }
});

test('Home category tiles contain only icon and name', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#categoryGrid .cat')).toHaveCount(12);
  for(const card of await page.locator('#categoryGrid .cat').all()){
    await expect(card.locator('img')).toHaveCount(1);
    await expect(card.locator('.catName')).toHaveCount(1);
    await expect(card.locator('p,.catFoot')).toHaveCount(0);
  }
});
test('Home mandatory natural-language intents stay sensible', async ({ page }) => {
  await page.goto('/');
  const q=page.locator('#globalSearch');
  const checks=[
    ['devo vendere la macchina','sell-my-car'],
    ['parto una settimana','packr'],
    ['cosa cucino stasera','frigochef'],
    ['devo studiare per un esame','exam-planner'],
    ['voglio risparmiare','savings-goal'],
    ['devo cambiare casa','moving-list'],
    ['devo organizzare i documenti','docpocket'],
    ['devo dividere una cena','splitly'],
    ['mi scade la revisione','revisione-memo'],
    ['quanto spendo per un viaggio','tripcost']
  ];
  for(const [text,id] of checks){await q.fill(text);await expect(page.locator('#searchResults .res[href]').first()).toHaveAttribute('data-app-id',id);}
});

test('BresciaGo absorbs merged event views', async ({ page }) => {
  for(const [view,label] of [['weekend','Weekend'],['free','Gratis'],['family','Famiglia'],['music','Musica']]){
    await page.goto('/bresciago/?view='+view);
    await expect(page.locator('#sectionTitle')).toContainText(label,{timeout:15000});
    await expect(page.locator('#feedStatus')).toContainText('eventi',{timeout:15000});
  }
});
test('No active catalog link points to a merged app', async ({ request }) => {
  const c=await (await request.get('/apps.json')).json();
  const merged=new Set(c.apps.filter(a=>a.status==='MERGED').map(a=>a.id));
  const active=c.apps.filter(a=>['MVP','BETA','STABLE'].includes(a.status)&&a.path);
  expect(active.some(a=>merged.has(a.id))).toBe(false);
  expect(active).toHaveLength(181);
});
