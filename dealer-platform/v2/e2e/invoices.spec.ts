import {expect,test,type Page} from '@playwright/test'
const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const INVOICE='22222222-2222-2222-2222-222222222222'
async function boot(page:Page,role:'ADMIN'|'VENDITORE'){
 let paid=5000;let receipt:any=null
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'admin-user'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}})),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  if(path.endsWith('/rest/v1/rpc/record_invoice_receipt')){
   const body=route.request().postDataJSON()
   if(receipt?.id===body.p_request_id)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,id:receipt.id,duplicate:true,paid_amount:paid,payment_status:'PARTIAL',remaining:20000-paid})})
   paid+=Number(body.p_amount);receipt={id:body.p_request_id,dealer_id:DEALER,invoice_id:INVOICE,amount:Number(body.p_amount),paid_on:body.p_paid_on,payment_method:body.p_method,created_at:new Date().toISOString()}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,id:receipt.id,duplicate:false,paid_amount:paid,payment_status:'PARTIAL',remaining:20000-paid})})
  }
  if(path==='/rest/v1/invoices')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:INVOICE,dealer_id:DEALER,number:'FV-2026-15',counterparty_name:'Mario Rossi',invoice_type:'SALE',total_amount:20000,paid_amount:paid,due_date:'2026-10-01',issue_date:'2026-09-20'}])})
  if(path==='/rest/v1/invoice_receipts')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(receipt?[receipt]:[])})
  if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
  return route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'})
 })
 await page.goto('/')
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Altro'}):page.locator('.sidebar nav button').filter({hasText:'Altro'})).click()
 await expect(page.getByRole('heading',{name:'Altro'})).toBeVisible()
}
test('ADMIN registra un pagamento e vede il saldo aggiornato',async({page})=>{
 await boot(page,'ADMIN')
 await page.getByRole('button',{name:'Apri fatture e incassi'}).click()
 await expect(page.getByTestId('invoice-page')).toBeVisible()
 await expect(page.getByText('Mario Rossi')).toBeVisible()
 await page.getByRole('button',{name:'Registra incasso'}).click()
 await expect(page.getByTestId('payment-modal')).toBeVisible()
 await page.getByLabel('Importo incassato').fill('1000')
 await page.getByRole('button',{name:'Conferma incasso'}).click()
 await expect(page.getByTestId('payment-modal')).toHaveCount(0)
 await expect(page.getByText(/14\.000.*da incassare/)).toBeVisible()
 await page.getByRole('button',{name:'Storico incassi'}).click()
 await expect(page.getByText(/Già pagato prima/)).toBeVisible()
})
test('VENDITORE non può aprire Fatture e Incassi',async({page})=>{
 await boot(page,'VENDITORE')
 await expect(page.getByRole('button',{name:'Apri fatture e incassi'})).toHaveCount(0)
})
