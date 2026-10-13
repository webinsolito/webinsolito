const { test, expect } = require('@playwright/test');

const APP='/dealer-platform/index.html';
const PREVIEW='/dealer-platform/preview.html';
const DEALER_ID='11111111-1111-4111-8111-111111111111';
const USER_ID='22222222-2222-4222-8222-222222222222';
const FINANCE_PATHS=['vehicle_financials','vehicle_costs','invoices'];

function sessionFor(role='ADMIN'){
  const admin=role==='ADMIN';
  return {
    access_token:'qa-access-token',refresh_token:'qa-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,
    user:{id:USER_ID,email:admin?'admin@qa.local':'seller@qa.local'},
    dealer:{id:DEALER_ID,slug:'malu23',display_name:'MALÙ23 QA'},
    profile:{display_name:admin?'QA Admin':'QA Venditore',role,username:admin?'qa-admin':'qa-seller',permissions:admin?{
      admin_manage:true,garage_write:true,customers_write:true,documents_write:true,invoices_view:true,invoices_write:true,
      finance_view:true,view_costs:true,costs_write:true,contracts_write:true,calendar_write:true,autoscout_manage:true,
      instagram_manage:true,reports_view:true
    }:{garage_write:true,customers_write:true,contracts_write:true,calendar_write:true}}
  };
}

async function seedSession(page,role){
  const value=sessionFor(role);
  await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:'dealer-platform-session',value});
}

async function blockServiceWorker(page){
  await page.route('**/dealer-platform/sw.js*',route=>route.fulfill({status:404,contentType:'application/javascript',body:''}));
}

function fixtureFor(path){
  const now='2026-10-11T12:00:00.000Z';
  if(path==='vehicles')return [{id:'veh-1',dealer_id:DEALER_ID,brand:'Fiat',model:'500',plate:'QA123AA',vin:'ZFA12345678901234',status:'IN_VENDITA',asking_price:12900,purchase_date:'2026-10-01',created_at:now,updated_at:now}];
  if(path==='customers')return [{id:'cus-1',dealer_id:DEALER_ID,first_name:'Mario',last_name:'Rossi',created_at:now,updated_at:now}];
  if(path==='vehicle_financials')return [{id:'fin-1',dealer_id:DEALER_ID,vehicle_id:'veh-1',purchase_price:9000,minimum_price:11000,updated_at:now}];
  if(path==='vehicle_costs')return [{id:'cost-1',dealer_id:DEALER_ID,vehicle_id:'veh-1',category:'PREPARAZIONE',amount:300,occurred_on:'2026-10-02',updated_at:now}];
  if(path==='invoices')return [];
  return [];
}

async function mockExternalRuntime(page,seen=[]){
  await page.route('https://telegram.org/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:'window.Telegram={WebApp:{}};'}));
  await page.route('https://jnofezlhptbrkoxhdenx.supabase.co/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/rest/v1/')){
      const entity=url.pathname.split('/').pop();seen.push(entity);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixtureFor(entity))});
    }
    return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
}

async function rawDealerCount(page,store,dealerId){
  return page.evaluate(async({store,dealerId})=>{
    const req=indexedDB.open('dealer-platform-local',8);
    const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
    const count=await new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readonly'),os=tx.objectStore(store);
      const idx=os.indexNames.contains('dealer_id')?os.index('dealer_id'):null;
      const r=idx?idx.count(IDBKeyRange.only(dealerId)):os.count();
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    db.close();return count;
  },{store,dealerId});
}

async function rawPut(page,store,value){
  return page.evaluate(async({store,value})=>{
    const req=indexedDB.open('dealer-platform-local',8);
    const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    db.close();
  },{store,value});
}

test.describe('MALÙ23 release gate',()=>{
  test('preview is storage-isolated and responsive on desktop/iPhone',async({page})=>{
    const external=[];
    page.on('request',req=>{const u=new URL(req.url());if(!['127.0.0.1','localhost'].includes(u.hostname))external.push(req.url())});
    await page.goto(PREVIEW,{waitUntil:'domcontentloaded'});
    await expect(page.locator('#previewBadge')).toContainText('ANTEPRIMA');
    await expect(page.locator('#appShell')).toBeVisible();
    await expect(page.locator('#loginScreen')).toBeHidden();
    expect(await page.evaluate(()=>localStorage.getItem('dealer-platform-session'))).toBeNull();
    const dbNames=await page.evaluate(async()=>typeof indexedDB.databases==='function'?(await indexedDB.databases()).map(x=>x.name):[]);
    expect(dbNames).not.toContain('dealer-platform-local');
    expect(external).toEqual([]);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
    const mobile=await page.evaluate(()=>innerWidth<=820);
    if(mobile){
      for(const label of ['OGGI','GARAGE','CLIENTI','CALENDARIO','ALTRO'])await expect(page.locator('.mobile-nav')).toContainText(label);
      const heights=await page.locator('.mobile-nav button:visible').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
      expect(heights.length).toBeGreaterThanOrEqual(5);
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    }
  });

  test('VENDITORE never requests finance endpoints',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='desktop-chromium','role/network gate runs once');
    await blockServiceWorker(page);
    const seen=[];await seedSession(page,'VENDITORE');await mockExternalRuntime(page,seen);
    await page.goto(APP,{waitUntil:'domcontentloaded'});
    await expect(page.locator('#appShell')).toBeVisible();
    await expect(page.locator('#dealerName')).toContainText('MALÙ23 QA');
    await page.waitForTimeout(350);
    for(const entity of FINANCE_PATHS)expect(seen).not.toContain(entity);
    seen.length=0;
    await page.evaluate(async dealerId=>{const {fetchTenantData}=await import('./api.js');await fetchTenantData(dealerId)},DEALER_ID);
    for(const entity of FINANCE_PATHS)expect(seen).not.toContain(entity);
    await expect.poll(async()=>page.locator('[data-view="finanze"]:visible,[data-view="fatture"]:visible').count()).toBe(0);
  });

  test('ADMIN loads authorized finance endpoints',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='desktop-chromium','role/network gate runs once');
    await blockServiceWorker(page);
    const seen=[];await seedSession(page,'ADMIN');await mockExternalRuntime(page,seen);
    await page.goto(APP,{waitUntil:'domcontentloaded'});
    await expect(page.locator('#appShell')).toBeVisible();
    seen.length=0;
    await page.evaluate(async dealerId=>{const {fetchTenantData}=await import('./api.js');await fetchTenantData(dealerId)},DEALER_ID);
    for(const entity of FINANCE_PATHS)expect(seen).toContain(entity);
  });

  test('same-account role downgrade and logout physically purge IndexedDB tenant data',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='desktop-chromium','IndexedDB purge gate runs once');
    const seen=[];await seedSession(page,'ADMIN');await mockExternalRuntime(page,seen);
    await page.goto(APP,{waitUntil:'domcontentloaded'});
    await expect(page.locator('#appShell')).toBeVisible();
    await page.evaluate(async({dealerId})=>{
      const {OfflineDB}=await import('./offline.js');
      const now=new Date().toISOString();
      await OfflineDB.put('vehicle_financials',{id:'qa-fin-cache',dealer_id:dealerId,vehicle_id:'qa-v',purchase_price:10000,updated_at:now});
      await OfflineDB.put('vehicle_costs',{id:'qa-cost-cache',dealer_id:dealerId,vehicle_id:'qa-v',category:'PREPARAZIONE',amount:100,updated_at:now});
      await OfflineDB.put('invoices',{id:'qa-inv-cache',dealer_id:dealerId,invoice_type:'SALE',total_amount:1000,paid_amount:0,updated_at:now});
      await OfflineDB.put('vehicles',{id:'qa-v',dealer_id:dealerId,brand:'QA',model:'Cache',status:'IN_VENDITA',updated_at:now});
    },{dealerId:DEALER_ID});
    for(const store of FINANCE_PATHS)expect(await rawDealerCount(page,store,DEALER_ID)).toBeGreaterThan(0);
    expect(await rawDealerCount(page,'vehicles',DEALER_ID)).toBeGreaterThan(0);
    await page.evaluate(()=>{
      const current=JSON.parse(localStorage.getItem('dealer-platform-session'));
      current.profile={display_name:'QA Venditore',role:'VENDITORE',username:'qa-seller',permissions:{garage_write:true,customers_write:true,contracts_write:true,calendar_write:true}};
      localStorage.setItem('dealer-platform-session',JSON.stringify(current));
      window.dispatchEvent(new CustomEvent('dealer:session'));
    });
    for(const store of FINANCE_PATHS)await expect.poll(()=>rawDealerCount(page,store,DEALER_ID)).toBe(0);
    expect(await rawDealerCount(page,'vehicles',DEALER_ID)).toBeGreaterThan(0);
    await page.evaluate(()=>{localStorage.removeItem('dealer-platform-session');window.dispatchEvent(new CustomEvent('dealer:session'))});
    await expect.poll(()=>rawDealerCount(page,'vehicles',DEALER_ID)).toBe(0);
  });

  test('logged-out startup purges a finance-only orphan tenant cache',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='desktop-chromium','orphan cache gate runs once');
    await page.goto(PREVIEW,{waitUntil:'domcontentloaded'});
    await expect(page.locator('#appShell')).toBeVisible();
    // Simulate sensitive rows left by a pre-hardening build. Public OfflineDB.put correctly blocks this while logged out,
    // so the release gate seeds the stale row directly at IndexedDB level and then verifies the security cleanup path.
    await page.evaluate(async()=>{const {OfflineDB}=await import('./offline.js');await OfflineDB.list('vehicles','orphan-finance-only')});
    await rawPut(page,'vehicle_financials',{id:'orphan-fin',dealer_id:'orphan-finance-only',vehicle_id:'orphan-v',purchase_price:12345,updated_at:new Date().toISOString()});
    expect(await rawDealerCount(page,'vehicle_financials','orphan-finance-only')).toBeGreaterThan(0);
    await page.evaluate(async()=>{await import('./session-security.js?orphan-release-gate=197')});
    await expect.poll(()=>rawDealerCount(page,'vehicle_financials','orphan-finance-only')).toBe(0);
  });

  test('offline reload reopens cached PWA shell and data',async({page,context},testInfo)=>{
    test.skip(testInfo.project.name!=='desktop-chromium','service-worker offline gate runs in Chromium');
    const seen=[];await seedSession(page,'ADMIN');await mockExternalRuntime(page,seen);
    await page.goto(APP,{waitUntil:'networkidle'});
    await expect(page.locator('#appShell')).toBeVisible();
    await expect(page.locator('#vehicleGrid')).toContainText('Fiat');
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('#appShell')).toBeVisible();
    await expect(page.locator('#vehicleGrid')).toContainText('Fiat');
    await expect.poll(async()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:10000}).toBeTruthy();
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('#appShell')).toBeVisible();
    await expect(page.locator('#vehicleGrid')).toContainText('Fiat');
    await expect(page.locator('#networkBadge')).toContainText('OFFLINE');
    await context.setOffline(false);
  });

  test('conflict recovery UI applies server choice explicitly',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='desktop-chromium','conflict UI gate runs once');
    const seen=[];await seedSession(page,'ADMIN');await mockExternalRuntime(page,seen);
    await page.goto(APP,{waitUntil:'domcontentloaded'});
    await expect(page.locator('#appShell')).toBeVisible();
    await page.evaluate(async({dealerId})=>{
      const {OfflineDB}=await import('./offline.js');
      const now=new Date().toISOString();
      await OfflineDB.put('vehicles',{id:'conflict-v',dealer_id:dealerId,brand:'Locale',model:'A',status:'IN_VENDITA',updated_at:now});
      await OfflineDB.put('mutations',{id:'conflict-m',dealer_id:dealerId,entity:'vehicles',method:'UPSERT',record_id:'conflict-v',row:{id:'conflict-v',dealer_id:dealerId,brand:'Locale',model:'A',status:'IN_VENDITA',updated_at:now},expected_updated_at:now,status:'CONFLICT',attempts:1,created_at:now,last_error:'sync_conflict_server_newer',conflict_code:'sync_conflict_server_newer',conflict_server_updated_at:'2026-10-11T13:00:00.000Z',server_row:{id:'conflict-v',dealer_id:dealerId,brand:'Server',model:'B',status:'IN_VENDITA',updated_at:'2026-10-11T13:00:00.000Z'}});
      window.dispatchEvent(new CustomEvent('dealer:queue-changed'));
    },{dealerId:DEALER_ID});
    await expect(page.locator('#syncRecovery')).toBeVisible();
    await expect(page.getByRole('button',{name:'Usa server'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Mantieni locale'})).toBeVisible();
    await page.getByRole('button',{name:'Usa server'}).click();
    await expect.poll(async()=>page.evaluate(async()=>{const {OfflineDB}=await import('./offline.js');return (await OfflineDB.get('vehicles','conflict-v'))?.brand})).toBe('Server');
    await expect.poll(async()=>page.evaluate(async()=>{const {OfflineDB}=await import('./offline.js');return (await OfflineDB.get('mutations','conflict-m'))??null})).toBeNull();
  });
});
