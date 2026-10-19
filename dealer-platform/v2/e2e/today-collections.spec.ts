import {expect,test,type Page} from '@playwright/test'
const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const INVOICE='22222222-2222-2222-2222-222222222222'

async function boot(page:Page,role:'ADMIN'|'VENDITORE'){
 let followupRequests=0
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'admin-user'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}})),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  if(path==='/rest/v1/invoice_collection_followups'){
   followupRequests++
   return route.fulfill({status:200,contentType:'application/json',body:'[]'})
  }
  if(path==='/rest/v1/invoices')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:INVOICE,dealer_id:DEALER,number:'FV-2026-44',counterparty_name:'Mario Rossi',invoice_type:'SALE',total_amount:18000,paid_amount:3000,due_date:'2026-10-01',issue_date:'2026-09-20'}])})
  if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
  return route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return {get followupRequests(){return followupRequests}}
}

test('ADMIN vede gli incassi urgenti direttamente in OGGI e apre lo Scadenziario',async({page})=>{
 const stats=await boot(page,'ADMIN')
 await expect(page.getByText('Incassi da sollecitare')).toBeVisible()
 const focus=page.locator('.focus-card')
 await expect(focus.getByRole('heading',{name:'Mario Rossi: incasso da sollecitare'})).toBeVisible()
 await expect(focus).toContainText('FV-2026-44')
 await expect(focus).toContainText('15.000')
 expect(stats.followupRequests).toBeGreaterThan(0)
 await focus.getByRole('button',{name:'Apri scadenziario'}).click()
 await expect(page.getByTestId('collections-page')).toBeVisible()
})

test('VENDITORE non vede incassi in OGGI e non interroga la API finanziaria',async({page})=>{
 const stats=await boot(page,'VENDITORE')
 await expect(page.getByText('Incassi da sollecitare')).toHaveCount(0)
 await expect(page.getByText('Mario Rossi: incasso da sollecitare')).toHaveCount(0)
 await page.waitForTimeout(250)
 expect(stats.followupRequests).toBe(0)
})
