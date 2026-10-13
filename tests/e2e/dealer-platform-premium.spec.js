const {test,expect}=require('@playwright/test');

const APP='/dealer-platform/index.html';
const DEALER_ID='11111111-1111-4111-8111-111111111111';
const session={access_token:'qa-access-token',refresh_token:'qa-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'22222222-2222-4222-8222-222222222222',email:'admin@qa.local'},dealer:{id:DEALER_ID,slug:'malu23',display_name:'MALÙ23 QA'},profile:{display_name:'QA Admin',role:'ADMIN',username:'qa-admin',permissions:{admin_manage:true,garage_write:true,customers_write:true,documents_write:true,invoices_view:true,invoices_write:true,finance_view:true,view_costs:true,costs_write:true,contracts_write:true,calendar_write:true,autoscout_manage:true,instagram_manage:true,reports_view:true}}};

async function boot(page){
  await page.addInitScript(({session})=>localStorage.setItem('dealer-platform-session',JSON.stringify(session)),{session});
  await page.route('**/dealer-platform/sw.js*',r=>r.fulfill({status:404,contentType:'application/javascript',body:''}));
  await page.route('https://telegram.org/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.Telegram={WebApp:{}};'}));
  await page.route('https://jnofezlhptbrkoxhdenx.supabase.co/**',r=>{
    const u=new URL(r.request().url());
    if(u.pathname.startsWith('/rest/v1/')){
      const entity=u.pathname.split('/').pop();
      const body=entity==='vehicles'?[{id:'veh-ui-1',dealer_id:DEALER_ID,brand:'Fiat',model:'500',plate:'UI123AA',vin:'ZFA12345678901234',year:2023,status:'IN_VENDITA',asking_price:13900,created_at:'2026-10-13T10:00:00Z',updated_at:'2026-10-13T10:00:00Z'}]:entity==='customers'?[{id:'cus-ui-1',dealer_id:DEALER_ID,first_name:'Mario',last_name:'Bianchi',phone:'3331234567',status:'LEAD',created_at:'2026-10-13T10:00:00Z',updated_at:'2026-10-13T10:00:00Z'}]:[];
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    }
    return r.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
  await page.goto(APP,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#m23GlobalSearchBtn')).toBeVisible();
}

test('premium shell exposes global search and operational results',async({page})=>{
  await boot(page);
  await page.locator('#m23GlobalSearchBtn').click();
  await expect(page.locator('#m23Command')).toBeVisible();
  await expect(page.locator('#m23CommandResults')).toContainText('Nuova auto');
  await page.locator('#m23CommandInput').fill('UI123AA');
  await expect(page.locator('#m23CommandResults')).toContainText('Fiat 500');
  await page.locator('.m23-result[data-kind="vehicle"]').click();
  await expect(page.locator('.view[data-view="garage"]')).toHaveClass(/active/);
});

test('premium iPhone shell keeps search and one-tap create accessible',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='iphone','mobile-only premium check');
  await boot(page);
  await expect(page.locator('#m23MobileFab')).toBeVisible();
  const box=await page.locator('#m23MobileFab').boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(50);
  await page.locator('#m23MobileFab').click();
  await expect(page.locator('.m23-create-menu')).toBeVisible();
  await expect(page.locator('.m23-create-menu')).toContainText('Nuovo cliente');
});
