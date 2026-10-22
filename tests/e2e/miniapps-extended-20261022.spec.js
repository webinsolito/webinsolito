const {test,expect}=require('@playwright/test');

test.use({timezoneId:'Europe/Rome'});
const IDS=['autobuddy','fuelgo','parkmemo','carcost','fuel-saver','tripcost','packr','frigochef','splitly','docpocket','screensort','bresciago','stylematch','safebuy'];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n1kAAAAASUVORK5CYII=','base64');
const money=text=>{const v=(text.match(/-?[\d.]+,\d\d/)||[])[0];return v?Number(v.replace(/\./g,'').replace(',','.')):NaN};
async function goto(page,id){await page.goto('/'+id+'/',{waitUntil:'domcontentloaded'});await expect(page.locator('body')).not.toBeEmpty();}
async function noOverflow(page){const size=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));expect(size.body-size.viewport).toBeLessThanOrEqual(2);}
function trackErrors(page){const errors=[];page.on('pageerror',e=>errors.push(e.message));return errors;}

test('14 real app entrypoints load without JS exceptions and keep 320-430px mobile layout',async({page})=>{
 const errors=trackErrors(page);
 for(const id of IDS){
   await page.setViewportSize({width:320,height:760});
   await goto(page,id);await page.waitForTimeout(80);
   await noOverflow(page);
   await page.setViewportSize({width:430,height:900});
   await noOverflow(page);
 }
 expect(errors,'Browser exceptions in the 14 public app shells: '+errors.join(' | ')).toEqual([]);
});

test('Splitly safely renders participant names, handles cents, and persists after reload',async({page})=>{
 await goto(page,'splitly');
 const injected='<img src=x onerror=window.__injected=1>';
 await page.evaluate(()=>window.__injected=0);
 await page.locator('#names').fill('Luca, '+injected+', Mia');
 await page.locator('#total').fill('10');
 await page.locator('#payer').selectOption({label:'Luca'});
 await page.locator('#calculateBtn').click();
 await expect(page.locator('#result')).toHaveClass(/show/);
 expect(await page.evaluate(()=>window.__injected)).toBe(0);
 await expect(page.locator('#debts')).toContainText(injected);
 expect(await page.locator('#debts img').count()).toBe(0);
 const euroAmount=await page.locator('#debts .money').allInnerTexts();
 const cents=euroAmount.map(money);
 expect(cents.every(x=>Number.isFinite(x))).toBe(true);
 expect(Math.round(cents.reduce((sum,n)=>sum+n,0)*100)).toBe(1000);
 await page.reload();
 await expect(page.locator('#result')).toHaveClass(/show/);
 await expect(page.locator('#debts')).toContainText(injected);
});

test('Splitly rejects invalid money and repeated names',async({page})=>{
 await goto(page,'splitly');
 await page.locator('#names').fill('Luca, Luca');
 await page.locator('#total').fill('-10');
 await page.locator('#calculateBtn').click();
 await expect(page.locator('#error')).toBeVisible();
 await expect(page.locator('#result')).not.toHaveClass(/show/);
});

test('Packr DST spring/autumn boundaries, invalid dates, and persisted checklist',async({page})=>{
 await goto(page,'packr');
 await page.locator('#dest').fill('Roma QA');
 for(const [from,to] of [['2026-03-28','2026-03-29'],['2026-10-24','2026-10-25']]){
   await page.locator('#start').fill(from);
   await page.locator('#end').fill(to);
   await page.locator('#generateBtn').click();
   await expect(page.locator('#tripMeta')).toContainText('2 giorni');
 }
 await page.locator('#start').fill('2026-10-26');
 await page.locator('#end').fill('2026-10-24');
 await page.locator('#generateBtn').click();
 await expect(page.locator('#formError')).toHaveClass(/show/);
 await page.reload();
 await expect(page.locator('#tripTitle')).toHaveText('Roma QA');
});

test('FrigoChef exact ingredient recognition, persistence, and HTML escaping',async({page})=>{
 await goto(page,'frigochef');
 await page.locator('#ingredientInput').fill('a');
 await page.locator('#addBtn').click();
 await page.locator('#completeOnly').check();
 await expect(page.locator('#recipes')).toContainText('non c’è una ricetta completa');
 await page.locator('#completeOnly').uncheck();
 const injected='<img src=x onerror=window.__injected=1>';
 await page.evaluate(()=>window.__injected=0);
 await page.locator('#ingredientInput').fill(injected);
 await page.locator('#addBtn').click();
 await expect(page.locator('#ingredients')).toContainText(injected);
 expect(await page.evaluate(()=>window.__injected)).toBe(0);
 expect(await page.locator('#ingredients img').count()).toBe(0);
 await page.reload();
 await expect(page.locator('#ingredients')).toContainText(injected);
});

test('AutoBuddy refuses repeated registration and retains garage after reload',async({page})=>{
 await goto(page,'autobuddy');
 await page.evaluate(()=>{go('garage');const el=document.getElementById('garageForm');if(getComputedStyle(el).display==='none')toggleGarageForm();});
 await page.locator('#vPlate').fill('AB123CD');
 await page.locator('#vModel').fill('QA utilitaria');
 await page.locator('button[onclick="addVehicle()"]').click();
 await expect(page.locator('#garageGrid')).toContainText('AB123CD');
 page.once('dialog',dialog=>dialog.accept());
 await page.evaluate(()=>{const el=document.getElementById('garageForm');if(getComputedStyle(el).display==='none')toggleGarageForm();});
 await page.locator('#vPlate').fill('ab123cd');
 await page.locator('#vModel').fill('QA duplicato');
 await page.locator('button[onclick="addVehicle()"]').click();
 await expect(page.locator('#garageGrid')).not.toContainText('QA duplicato');
 await page.reload();
 await page.evaluate(()=>go('garage'));
 await expect(page.locator('#garageGrid')).toContainText('QA utilitaria');
});

test('CarCost and FuelSaver correctly calculate real amounts and reject missing inputs',async({page})=>{
 await goto(page,'carcost');
 await page.locator('#km').fill('12000');
 await page.locator('#consumption').fill('6');
 await page.locator('#fuelPrice').fill('1.8');
 await page.locator('#insurance').fill('600');
 for(const id of ['tax','maintenance','other','depreciation'])await page.locator('#'+id).fill('0');
 await page.locator('#calculateBtn').click();
 expect(money(await page.locator('#annual').innerText())).toBeCloseTo(1896,2);
 await page.locator('#km').fill('0');
 await page.locator('#calculateBtn').click();
 await expect(page.locator('#annual')).toHaveText('Dati mancanti');
 await goto(page,'fuel-saver');
 await page.locator('#currentPrice').fill('1.90');
 await page.locator('#altPrice').fill('1.70');
 await page.locator('#liters').fill('40');
 await page.locator('#extraKm').fill('0');
 await page.locator('#consumption').fill('6');
 await page.locator('#calculateBtn').click();
 expect(money(await page.locator('#net').innerText())).toBeCloseTo(8,2);
 await page.locator('#extraKm').fill('100');
 await page.locator('#calculateBtn').click();
 await expect(page.locator('#verdict')).toHaveText(/No, la deviazione/);
});

test('TripCost calculates return distance, passenger split, one-way conversion',async({page})=>{
 await goto(page,'tripcost');
 for(const [id,value] of Object.entries({distance:'100',people:'3',consumption:'6',fuelPrice:'1.8',tolls:'12',parking:'3',extras:'0'}))await page.locator('#'+id).fill(value);
 expect(money(await page.locator('#total').innerText())).toBeCloseTo(36.6,2);
 expect(money(await page.locator('#perPerson').innerText())).toBeCloseTo(12.2,2);
 await page.locator('#oneWayBtn').click();
 expect(money(await page.locator('#total').innerText())).toBeCloseTo(25.8,2);
 await page.locator('#resetBtn').click();
 await expect(page.locator('#total')).toHaveText('—');
});

test('DocPocket persists documents, escapes HTML, and refuses oversized attachments',async({page})=>{
 await goto(page,'docpocket');
 await page.locator('#docName').fill('<img src=x onerror=alert(1)>');
 await page.locator('#saveBtn').click();
 await expect(page.locator('#docs')).toContainText('<img src=x onerror=alert(1)>');
 expect(await page.locator('#docs img').count()).toBe(0);
 await page.reload();
 await expect(page.locator('#docs')).toContainText('<img src=x onerror=alert(1)>');
 await page.locator('#docName').fill('Troppo grande');
 await page.locator('#file').setInputFiles({name:'huge.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10*1024*1024+1,65)});
 await page.locator('#saveBtn').click();
 await expect(page.locator('#error')).toContainText('massimo 10 MB');
 await expect(page.locator('#docs')).not.toContainText('Troppo grande');
});

test('DocPocket rejects a fake PDF rather than archiving arbitrary bytes',async({page})=>{
 await goto(page,'docpocket');
 await page.locator('#docName').fill('PDF fasullo');
 await page.locator('#file').setInputFiles({name:'documento.pdf',mimeType:'application/pdf',buffer:Buffer.from('<script>alert(1)</script>')});
 await page.locator('#saveBtn').click();
 await expect(page.locator('#docs')).not.toContainText('PDF fasullo');
 await expect(page.locator('#error')).toContainText(/valido|formato|sicuro/i);
});

test('ScreenSort saves, classifies and retains an imported screenshot',async({page})=>{
 await goto(page,'screensort');
 await page.locator('#files').setInputFiles({name:'schermo.png',mimeType:'image/png',buffer:png});
 await expect(page.locator('#inboxCount')).toHaveText('1');
 await page.locator('[data-cat]').first().click();
 await expect(page.locator('#archiveCount')).toHaveText('1');
 await page.reload();
 await expect(page.locator('#archiveCount')).toHaveText('1');
});

test('ScreenSort rejects a forged image MIME, without saving it',async({page})=>{
 await goto(page,'screensort');
 await page.locator('#files').setInputFiles({name:'finto.png',mimeType:'image/png',buffer:Buffer.from('<script>alert(1)</script>')});
 await expect(page.locator('#inboxCount')).toHaveText('0');
 await expect(page.locator('#importStatus')).toContainText(/saltate|non supportato|non valida/i);
});

test('ParkMemo GPS denial is recoverable and successful parking survives reload',async({page,context})=>{
 await goto(page,'parkmemo');
 await context.grantPermissions([]);
 await page.locator('#note').fill('Posteggio QA');
 await page.locator('#saveBtn').click();
 await expect(page.locator('#saveStatus')).toContainText(/permesso|posizione/i);
 await context.grantPermissions(['geolocation']);
 await context.setGeolocation({latitude:45.54,longitude:10.22});
 await page.locator('#saveBtn').click();
 await expect(page.locator('#activeCard')).toBeVisible();
 await page.reload();
 await expect(page.locator('#activeCard')).toBeVisible();
});

test('FuelGo shows stale provenance and handles an unreachable feed without blank screen',async({page})=>{
 await goto(page,'fuelgo');
 await expect(page.locator('#datasetInfo')).toContainText(/Prezzi MIMIT|dati non disponibili/i);
 if((await page.locator('#datasetInfo').innerText()).includes('2026-10-15'))
   await expect(page.locator('#datasetInfo')).toContainText(/Dati non recenti/i);
 await page.route('**/fuelgo/data/index.json',r=>r.abort('failed'));
 await page.reload();
 await expect(page.locator('#results')).toContainText(/Non riesco a caricare/i);
});

test('BresciaGo gracefully handles a failed events feed without invented events',async({page})=>{
 await page.route('**/bresciago/data/events.json*',r=>r.abort('failed'));
 await goto(page,'bresciago');
 await expect(page.locator('#freshness')).toContainText(/non disponibile/i);
 await expect(page.locator('#events')).toContainText(/Non riesco a caricare/i);
});

test('StyleMatch returns an understandable suggested size',async({page})=>{
 await goto(page,'stylematch');
 await page.locator('#chest').fill('110');
 await page.locator('#waist').fill('100');
 await page.locator('#hip').fill('110');
 await page.locator('#sizes').fill('L:118\nXL:124\nXXL:132');
 await page.locator('#matchBtn').click();
 await expect(page.locator('#bestSize')).not.toHaveText('—');
 await expect(page.locator('#candidateList')).toContainText('L');
});

test('SafeBuy displays a warning for suspicious purchasing conditions',async({page})=>{
 await goto(page,'safebuy');
 await page.locator('#url').fill('http://example.com/pay/login');
 await page.locator('#payment').selectOption('irreversible');
 await page.locator('#pressure').check();
 await page.locator('#scanBtn').click();
 await expect(page.locator('#resultCard')).toHaveClass(/show/);
 await expect(page.locator('#resultLevel')).toHaveText(/Attenzione alta|Molti segnali critici/i);
});
