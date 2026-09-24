const {test,expect}=require('@playwright/test');
const fs=require('fs');
const path=require('path');

const calcApps=['pizza-calc','recipe-convert','fuel-budget','home-budget','loan-compare','paint-calc','room-measure','tile-calc','currency-pocket','fuel-trip','cost-per-wear','shoe-size','size-convert','price-compare','used-price','margin-calc','mileage','date-calc','time-calc','unit-tools'];
const changed=[...calcApps,'accident-kit','leftover-chef','fake-shop','noise-diary','waste-day','business-card'];

test('final Home is icon plus category name only',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Dimmi cosa devi fare.'})).toBeVisible();
 await expect(page.locator('#categoryGrid .cat')).toHaveCount(12);
 await expect(page.locator('#categoryGrid .cat img')).toHaveCount(12);
 await expect(page.locator('#categoryGrid .cat p')).toHaveCount(0);
 await expect(page.locator('#categoryGrid .cat .catFoot')).toHaveCount(0);
 const text=(await page.locator('#categoryGrid').innerText()).toLowerCase();
 expect(text).not.toContain('strumenti');
});

test('mandatory intent queries produce sensible first results',async({page})=>{
 await page.goto('/');
 const q=page.locator('#globalSearch');
 const cases=[
  ['devo vendere la macchina','sell-my-car'],
  ['parto una settimana','packr'],
  ['cosa cucino stasera','frigochef'],
  ['devo studiare per un esame','exam-planner'],
  ['voglio risparmiare','savings-goal'],
  ['devo cambiare casa','moving-list'],
  ['devo organizzare i documenti','docpocket'],
  ['devo dividere una cena','splitly'],
  ['mi scade la revisione','autobuddy'],
  ['quanto spendo per un viaggio','tripcost']
 ];
 for(const [query,id] of cases){
  await q.fill(query);
  const first=page.locator('#searchResults .res[href]').first();
  await expect(first,query).toBeVisible();
  await expect(first,query).toHaveAttribute('data-app-id',id);
 }
});

test('every category exposes four real problem paths',async({page})=>{
 for(const slug of ['auto','food','soldi','eventi','documenti','casa','viaggi','persona','shopping','territorio','business','studio']){
  await page.goto('/'+slug+'/');
  await expect(page.locator('#intentGrid .intent'),slug).toHaveCount(4);
  await expect(page.locator('#apps .app').first(),slug).toBeVisible();
 }
});

test('twenty rebuilt calculators produce a rich result and history',async({page})=>{
 test.setTimeout(120000);
 for(const id of calcApps){
  await page.goto('/'+id+'/');
  await expect(page.locator('.pro-shell'),id).toBeVisible();
  await page.locator('#run').click();
  const title=page.locator('#result .pro-resultTitle');
  await expect(title,id).toBeVisible();
  await expect(title,id).not.toContainText('Calcolo non disponibile');
  await expect(page.locator('#result .pro-metric').first(),id).toBeVisible();
  await expect(page.locator('#history .pro-historyItem').first(),id).toBeVisible();
  await expect(page.locator('.pro-related a').first(),id).toBeVisible();
 }
});

test('AccidentKit is an incident workflow, not a generic note form',async({page})=>{
 await page.goto('/accident-kit/');
 await expect(page.getByText('Checklist incidente')).toBeVisible();
 await page.locator('#f_date').fill('2026-09-18');
 await page.locator('#f_place').fill('Brescia');
 await page.locator('#f_plate').fill('AB123CD');
 await page.locator('#f_notes').fill('Urto paraurti');
 await page.getByRole('button',{name:'Salva episodio'}).click();
 await expect(page.locator('#ilist')).toContainText('AB123CD');
});

test('LeftoverChef returns three concrete ideas',async({page})=>{
 await page.goto('/leftover-chef/');
 await page.locator('#ingredients').fill('pasta, zucchine, uova, parmigiano');
 await page.getByRole('button',{name:'Trova 3 idee'}).click();
 await expect(page.locator('#iout .pro-item')).toHaveCount(3);
});

test('FakeShop evaluates concrete risk signals without fake score',async({page})=>{
 await page.goto('/fake-shop/');
 await page.locator('#f_price').selectOption('molto basso');
 await page.locator('#f_payment').selectOption('bonifico/crypto');
 await page.locator('#f_company').selectOption('no');
 await page.getByRole('button',{name:'Valuta segnali'}).click();
 await expect(page.locator('#fout')).toContainText('Molti segnali di rischio');
 await expect(page.locator('#fout')).not.toContainText('/100');
});

test('NoiseDiary saves episodes and creates a summary',async({page})=>{
 await page.goto('/noise-diary/');
 await page.locator('#f_date').fill('2026-09-18');
 await page.locator('#f_time').fill('22:00');
 await page.locator('#f_source').fill('Locale sotto casa');
 await page.locator('#f_duration').fill('45');
 await page.locator('#f_severity').fill('8');
 await page.getByRole('button',{name:'Salva'}).click();
 await expect(page.locator('#nsummary')).toContainText('8');
 await expect(page.locator('#nlist')).toContainText('Locale sotto casa');
});

test('WasteDay computes the next collection from user schedule',async({page})=>{
 await page.goto('/waste-day/');
 await page.locator('#f_type').fill('Carta');
 await page.locator('#f_day').selectOption('lunedi');
 await page.locator('#f_time').fill('07:00');
 await page.getByRole('button',{name:'Salva calendario'}).click();
 await expect(page.locator('#wlist')).toContainText('Carta');
});

test('BusinessCard creates preview and local contact QR',async({page})=>{
 await page.goto('/business-card/');
 await page.locator('#f_name').fill('Mario Rossi');
 await page.locator('#f_role').fill('Consulente');
 await page.locator('#f_email').fill('mario@example.com');
 await page.getByRole('button',{name:'Genera'}).click();
 await expect(page.locator('#bcp')).toContainText('Mario Rossi');
 await expect(page.locator('#bcq canvas, #bcq img')).not.toHaveCount(0);
});

test('merged duplicates point users to the stronger app',async({page})=>{
 const merges={ 'damage-log':'accident-kit','car-docs':'docpocket','home-docs':'docpocket','booking-lite':'appointment','receipt-box':'receipt-pocket','bollo-check':'autobuddy','revisione-memo':'autobuddy','tyre-memo':'autobuddy','service-book':'autobuddy','expiry-food':'pantry','freezer-memo':'pantry','daily-spend':'home-budget','budget-lite':'home-budget' };
 for(const [id,target] of Object.entries(merges)){
  await page.goto('/'+id+'/',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>new URL(page.url()).pathname,{message:id,timeout:6000}).toBe('/'+target+'/');
  await expect(page.locator('body'),id).not.toBeEmpty();
 }
});

test('catalog truth stays internally coherent',async({request})=>{
 const d=await (await request.get('/apps.json')).json();
 const liveStatus=new Set(['MVP','BETA','STABLE']);
 const active=d.apps.filter(a=>liveStatus.has(a.status)&&a.path);
 const merged=d.apps.filter(a=>a.status==='MERGED');
 const planned=d.apps.filter(a=>a.status==='PLANNED');
 expect(d.categories).toHaveLength(12);
 expect(d.apps).toHaveLength(218);
 expect(active).toHaveLength(187);
 expect(merged).toHaveLength(13);
 expect(planned).toHaveLength(18);

 const byCategory=Object.fromEntries(d.categories.map(c=>[
  c.id,
  active.filter(a=>a.category===c.id).length
 ]));
 expect(byCategory).toEqual({
  auto:12,food:15,money:16,events:20,docs:16,home:19,
  travel:19,style:14,shopping:16,territory:3,business:19,study:18
 });

 expect(d.apps.filter(a=>liveStatus.has(a.status)&&!a.path)).toEqual([]);
 expect(planned.filter(a=>a.path)).toEqual([]);

 const activeIds=new Set(active.map(a=>a.id));
 for(const app of merged){
  expect(app.path,app.id+' keeps a compatibility route').toBeTruthy();
  expect(app.merged_into,app.id+' declares its destination').toBeTruthy();
  expect(activeIds.has(app.merged_into),app.id+' targets a live app').toBeTruthy();
 }
});

test('mobile quality at 360, 390 and 430 for Home and 20 rebuilt apps',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='desktop-chromium');
 test.setTimeout(150000);
 for(const width of [360,390,430]){
  await page.setViewportSize({width,height:850});
  await page.goto('/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Home overflow '+width).toBeTruthy();
  await expect(page.locator('#categoryGrid .cat img').first()).toBeVisible();
  for(const id of calcApps){
   await page.goto('/'+id+'/');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' overflow '+width).toBeTruthy();
   await expect(page.locator('.pro-shell'),id).toBeVisible();
  }
 }
});

test('AFTER screenshots: Home, categories and rebuilt apps',async({page},testInfo)=>{
 test.setTimeout(120000);
 const dir='test-results/quality-after/'+testInfo.project.name;
 fs.mkdirSync(dir,{recursive:true});
 await page.goto('/');await page.waitForSelector('#categoryGrid .cat');await page.screenshot({path:dir+'/home.png',fullPage:true});
 for(const slug of ['auto','documenti','casa','viaggi','shopping','studio']){
  await page.goto('/'+slug+'/');await page.waitForSelector('#apps .app');await page.screenshot({path:dir+'/category-'+slug+'.png',fullPage:true});
 }
 for(const id of ['accident-kit','leftover-chef','home-budget','paint-calc','fuel-trip','fake-shop','business-card','unit-tools']){
  await page.goto('/'+id+'/');await page.waitForSelector('#work');await page.screenshot({path:dir+'/app-'+id+'.png',fullPage:true});
 }
});

test('performance budget for rebuilt static assets',async({request})=>{
 const limits={
  '/':16000,
  '/assets/home-search.js':10000,
  '/assets/category-page.css':7000,
  '/assets/category-page.js':9000,
  '/assets/microapp-pro.css':10000,
  '/assets/microapp-pro-defs.js':30000,
  '/assets/microapp-pro.js':35000
 };
 for(const [url,max] of Object.entries(limits)){
  const r=await request.get(url);expect(r.ok(),url).toBeTruthy();
  const b=Buffer.byteLength(await r.body());
  expect(b,url+' bytes').toBeLessThanOrEqual(max);
 }
});
