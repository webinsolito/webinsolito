import {expect,test,type Page} from '@playwright/test'
const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const INVOICE='44444444-4444-4444-4444-444444444444'

const day=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
const iso=(offset:number,hour='09:00:00')=>day(offset)+'T'+hour+'Z'

async function boot(page:Page,role:'ADMIN'|'VENDITORE'){
 let invoiceRequests=0,followupRequests=0
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'user-1'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}})),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  if(path==='/rest/v1/vehicles')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:VEHICLE,dealer_id:DEALER,brand:'BMW',model:'X1',plate:'AB123CD',year:2024,mileage:18000,status:'IN_VENDITA',asking_price:32900}])})
  if(path==='/rest/v1/customers')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',phone:'+39 333 1234567',status:'CLIENTE',next_contact_at:iso(-1),next_step:'Richiamare per conferma'}])})
  if(path==='/rest/v1/calendar_events')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
   {id:'e-delivery',dealer_id:DEALER,event_type:'DELIVERY',title:'Consegna BMW X1',starts_at:iso(0,'15:00:00'),status:'OPEN',priority:'HIGH',customer_id:CUSTOMER,vehicle_id:VEHICLE},
   {id:'e-doc',dealer_id:DEALER,event_type:'DOCUMENT',title:'Pratica immatricolazione',starts_at:iso(1,'10:00:00'),status:'OPEN',priority:'NORMAL',vehicle_id:VEHICLE}
  ])})
  if(path==='/rest/v1/vehicle_work_items')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'w1',dealer_id:DEALER,vehicle_id:VEHICLE,title:'Controllo finale',category:'PREPARAZIONE',status:'TODO',priority:'NORMAL',due_date:day(0)}])})
  if(path==='/rest/v1/invoices'){invoiceRequests++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:INVOICE,dealer_id:DEALER,vehicle_id:VEHICLE,customer_id:CUSTOMER,number:'FV-2026-88',counterparty_name:'Mario Rossi',invoice_type:'SALE',total_amount:32900,paid_amount:10000,payment_status:'PARTIAL',due_date:day(-2),issue_date:day(-10)}])})}
  if(path==='/rest/v1/invoice_collection_followups'){followupRequests++;return route.fulfill({status:200,contentType:'application/json',body:'[]'})}
  if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
  return route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return {get invoiceRequests(){return invoiceRequests},get followupRequests(){return followupRequests}}
}

test('ADMIN vede una coda unica di scadenze e apre la pratica collegata',async({page})=>{
 const stats=await boot(page,'ADMIN')
 await page.getByRole('button',{name:'Apri centro scadenze'}).click()
 const center=page.getByTestId('deadline-page')
 await expect(center).toBeVisible()
 await expect(center.getByText('Richiamare Mario Rossi')).toBeVisible()
 await expect(center.getByText('Consegna BMW X1')).toBeVisible()
 await expect(center.getByText('Pratica immatricolazione')).toBeVisible()
 await expect(center.getByText('Controllo finale')).toBeVisible()
 await expect(center.getByText('Incasso Mario Rossi')).toBeVisible()
 expect(stats.invoiceRequests).toBeGreaterThan(0)
 expect(stats.followupRequests).toBeGreaterThan(0)

 await center.getByRole('button',{name:'Apri Pratica immatricolazione'}).click()
 await expect(page.locator('.drawer').getByRole('heading',{name:/BMW X1/})).toBeVisible()
})

test('VENDITORE usa il Centro Scadenze senza ricevere dati finanziari',async({page})=>{
 const stats=await boot(page,'VENDITORE')
 await page.getByRole('button',{name:'Apri centro scadenze'}).click()
 const center=page.getByTestId('deadline-page')
 await expect(center).toBeVisible()
 await expect(center.getByText('Richiamare Mario Rossi')).toBeVisible()
 await expect(center.getByText('Consegna BMW X1')).toBeVisible()
 await expect(center.getByRole('button',{name:'Incassi',exact:true})).toHaveCount(0)
 await expect(center.getByText('Incasso Mario Rossi')).toHaveCount(0)
 await page.waitForTimeout(250)
 expect(stats.invoiceRequests).toBe(0)
 expect(stats.followupRequests).toBe(0)
})
