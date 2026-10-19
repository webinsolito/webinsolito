import {expect,test,type Page} from '@playwright/test'
const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const INVOICE='44444444-4444-4444-4444-444444444444'

async function boot(page:Page,role:'ADMIN'|'VENDITORE'){
 let invoiceRequests=0
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'user-1'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}})),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  if(path==='/rest/v1/vehicles')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:VEHICLE,dealer_id:DEALER,brand:'BMW',model:'X1',version:'xDrive20d',plate:'AB123CD',vin:'WBA123456789XYZ',year:2024,mileage:18000,status:'IN_VENDITA',asking_price:32900}])})
  if(path==='/rest/v1/customers')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',phone:'+39 333 123 4567',email:'mario@example.test',fiscal_code:'RSSMRA80A01H501U',status:'CLIENTE'}])})
  if(path==='/rest/v1/invoices'){invoiceRequests++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:INVOICE,dealer_id:DEALER,vehicle_id:VEHICLE,customer_id:CUSTOMER,number:'FV-2026-77',counterparty_name:'Mario Rossi',invoice_type:'SALE',total_amount:32900,paid_amount:10000,payment_status:'PARTIAL',due_date:'2026-10-10',issue_date:'2026-10-01'}])})}
  if(path==='/rest/v1/invoice_receipts')return route.fulfill({status:200,contentType:'application/json',body:'[]'})
  if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
  return route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return {get invoiceRequests(){return invoiceRequests}}
}

async function search(page:Page,value:string){
 await page.getByRole('button',{name:'Apri ricerca globale'}).click()
 const dialog=page.getByTestId('global-search')
 await expect(dialog).toBeVisible()
 await dialog.getByRole('textbox',{name:'Ricerca globale'}).fill(value)
 return dialog
}

test('ADMIN cerca targa, telefono e fattura e apre direttamente i record',async({page})=>{
 const stats=await boot(page,'ADMIN')
 let dialog=await search(page,'AB 123 CD')
 await dialog.getByRole('button',{name:/AUTO BMW X1/}).click()
 await expect(page.locator('.drawer').getByRole('heading',{name:'BMW X1 xDrive20d'})).toBeVisible()

 dialog=await search(page,'3331234567')
 await dialog.getByRole('button',{name:/CLIENTE Mario Rossi/}).click()
 await expect(page.locator('.customer-detail').getByRole('heading',{name:'Mario Rossi'})).toBeVisible()

 dialog=await search(page,'FV-2026-77')
 await dialog.getByRole('button',{name:/FATTURA Fattura FV-2026-77/}).click()
 const card=page.getByTestId('invoice-card-'+INVOICE)
 await expect(card).toBeVisible()
 await expect(card.getByText('Storico pagamenti registrati')).toBeVisible()
 expect(stats.invoiceRequests).toBeGreaterThan(0)
})

test('VENDITORE non riceve né cerca fatture dalla ricerca globale',async({page})=>{
 const stats=await boot(page,'VENDITORE')
 const dialog=await search(page,'FV-2026-77')
 await expect(dialog.getByText('Nessun risultato trovato.')).toBeVisible()
 await expect(dialog.getByText('FATTURA',{exact:true})).toHaveCount(0)
 await page.waitForTimeout(250)
 expect(stats.invoiceRequests).toBe(0)
})
