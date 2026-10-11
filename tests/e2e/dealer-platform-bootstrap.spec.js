const {test,expect}=require('@playwright/test');

const APP='/dealer-platform/index.html';
const PREVIEW='/dealer-platform/preview.html';
const DEALER_ID='11111111-1111-4111-8111-111111111111';
const USER_ID='22222222-2222-4222-8222-222222222222';

function capture(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(`pageerror:${e.message}`));
  page.on('console',m=>{if(m.type()==='error')errors.push(`console:${m.text()}`)});
  page.on('requestfailed',r=>errors.push(`requestfailed:${r.url()} ${r.failure()?.errorText||''}`));
  return errors;
}
async function snapshot(page,errors){
  return page.evaluate(errors=>({
    errors,
    url:location.href,
    text:document.body?.innerText?.slice(0,1200)||'',
    shellExists:!!document.querySelector('#appShell'),
    shellHidden:document.querySelector('#appShell')?.hidden,
    loginHidden:document.querySelector('#loginScreen')?.hidden,
    session:localStorage.getItem('dealer-platform-session'),
    config:window.DEALER_CONFIG||null,
    scripts:[...document.scripts].map(s=>s.src||'inline').slice(-12)
  }),errors);
}
async function assertBoot(page,errors,label){
  try{await expect(page.locator('#appShell')).toBeVisible({timeout:6000})}
  catch{throw new Error(`${label} bootstrap failed\n${JSON.stringify(await snapshot(page,errors),null,2)}`)}
}
async function mockRuntime(page){
  await page.route('https://telegram.org/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.Telegram={WebApp:{}};'}));
  await page.route('https://jnofezlhptbrkoxhdenx.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
}

test.describe.configure({timeout:12000});

test('preview bootstrap reaches visible app shell',async({page})=>{
  const errors=capture(page);await mockRuntime(page);
  await page.goto(PREVIEW,{waitUntil:'domcontentloaded'});
  await assertBoot(page,errors,'preview');
});

test('authenticated runtime reaches visible app shell',async({page})=>{
  const errors=capture(page);await mockRuntime(page);
  await page.addInitScript(value=>localStorage.setItem('dealer-platform-session',JSON.stringify(value)),{
    access_token:'qa-access',refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,
    user:{id:USER_ID,email:'admin@qa.local'},dealer:{id:DEALER_ID,slug:'malu23',display_name:'MALÙ23 QA'},
    profile:{display_name:'QA Admin',role:'ADMIN',permissions:{admin_manage:true,finance_view:true,view_costs:true,invoices_view:true}}
  });
  await page.goto(APP,{waitUntil:'domcontentloaded'});
  await assertBoot(page,errors,'authenticated');
});
