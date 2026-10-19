import {expect,test,type Page} from '@playwright/test'
const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const INVOICE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
async function boot(page:Page,role:'ADMIN'|'VENDITORE'){
 let followups:any[]=[];let collectionRequests=0
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'admin-user'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}})),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  if(path==='/rest/v1/invoice_collection_followups'){
   collectionRequests++
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();followups=[{...body,created_at:new Date().toISOString()}];return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify(followups)})}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(followups)})
  }
  if(path==='/rest/v1/invoices')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:INVOICE,dealer_id:DEALER,customer_id:CUSTOMER,number:'FV-2026-15',counterparty_name:'Mario Rossi',invoice_type:'SALE',total_amount:20000,paid_amount:5000,due_date:'2026-10-01',issue_date:'2026-09-20'}])})
  if(path==='/rest/v1/customers')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',phone:'+393331234567',email:'mario@example.test'}])})
  if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
  return route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'})
 })
 await page.goto('/')
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Altro'}):page.locator('.sidebar nav button').filter({hasText:'Altro'})).click()
 await expect(page.getByRole('heading',{name:'Altro'})).toBeVisible()
 return {get collectionRequests(){return collectionRequests}}
}
test('ADMIN registra un sollecito e programma il prossimo controllo',async({page})=>{
 await boot(page,'ADMIN')
 await page.getByRole('button',{name:'Apri scadenziario incassi'}).click()
 await expect(page.getByTestId('collections-page')).toBeVisible()
 await expect(page.getByText('Mario Rossi')).toBeVisible()
 await page.getByRole('button',{name:'Registra sollecito'}).click()
 await page.getByLabel('Esito sollecito').selectOption('PROMESSA_PAGAMENTO')
 await page.getByLabel('Prossimo controllo').fill('2099-01-01')
 await page.getByLabel('Nota sollecito').fill('Bonifico promesso dal cliente')
 await page.getByRole('button',{name:'Salva sollecito'}).click()
 await expect(page.getByTestId('collection-modal')).toHaveCount(0)
 await expect(page.getByText('Nessun incasso da sollecitare oggi.')).toBeVisible()
 await page.getByRole('button',{name:'Programmati'}).click()
 await expect(page.getByText('Mario Rossi')).toBeVisible()
 await page.getByRole('button',{name:'Storico solleciti'}).click()
 await expect(page.getByText('Bonifico promesso dal cliente')).toBeVisible()
})
test('VENDITORE non vede lo Scadenziario Incassi e non richiama la relativa API',async({page})=>{
 const stats=await boot(page,'VENDITORE')
 await expect(page.getByRole('button',{name:'Apri scadenziario incassi'})).toHaveCount(0)
 expect(stats.collectionRequests).toBe(0)
})
