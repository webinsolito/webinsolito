import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'

async function boot(page:Page,role:'ADMIN'|'VENDITORE'){
  await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:role==='ADMIN'?'admin-user':'seller-user'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role==='ADMIN'?'Admin':'Venditore',username:role.toLowerCase(),role,permissions:{}}})),{dealer:DEALER,role})
  await page.route(`${PROJECT}/**`,async route=>{const url=new URL(route.request().url());if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});return route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'})})
  await page.goto('/')
  await expect(page.locator('.brand')).toContainText('Autosalone Demo')
  const mobile=(page.viewportSize()?.width||1200)<=760
  await (mobile?page.locator('.mobile-nav button').filter({hasText:'Altro'}):page.locator('.sidebar nav button').filter({hasText:'Altro'})).click()
  await expect(page.getByRole('heading',{name:'Altro'})).toBeVisible()
}

test('ADMIN sees the operational documents entry',async({page})=>{await boot(page,'ADMIN');await expect(page.getByRole('button',{name:'Apri documenti e OCR'})).toBeVisible()})
test('VENDITORE never sees the financial documents entry',async({page})=>{await boot(page,'VENDITORE');await expect(page.getByRole('button',{name:'Apri documenti e OCR'})).toHaveCount(0)})
