import {expect,test,type Page} from '@playwright/test'
const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const INVOICE='22222222-2222-2222-2222-222222222222'
type BootOptions={ackFailureOnce?:boolean;locked?:boolean}
async function boot(page:Page,role:'ADMIN'|'VENDITORE',options:BootOptions={}){
 let paid=5000;let receipt:any=null;let failureSent=false
 const stats={rpcCalls:0}
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'admin-user'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}})),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  if(path.endsWith('/rest/v1/rpc/record_invoice_receipt')){
   stats.rpcCalls++
   const body=route.request().postDataJSON()
   if(receipt?.id===body.p_request_id)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,id:receipt.id,duplicate:true,paid_amount:paid,payment_status:paid>=20000?'PAID':'PARTIAL',remaining:Math.max(0,20000-paid)})})
   paid+=Number(body.p_amount);receipt={id:body.p_request_id,dealer_id:DEALER,invoice_id:INVOICE,amount:Number(body.p_amount),paid_on:body.p_paid_on,payment_method:body.p_method,created_at:new Date().toISOString()}
   if(options.ackFailureOnce&&!failureSent){failureSent=true;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'network_ack_lost'})})}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,id:receipt.id,duplicate:false,paid_amount:paid,payment_status:paid>=20000?'PAID':'PARTIAL',remaining:Math.max(0,20000-paid)})})
  }
  if(path==='/rest/v1/invoices')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:INVOICE,dealer_id:DEALER,number:'FV-2026-15',counterparty_name:'Mario Rossi',invoice_type:'SALE',total_amount:20000,paid_amount:paid,due_date:'2026-10-01',issue_date:'2026-09-20'}])})
  if(path==='/rest/v1/invoice_receipts'){
   if(options.locked)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'dealer_access_locked'})})
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(receipt?[receipt]:[])})
  }
  if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
  return route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'})
 })
 await page.goto('/')
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Altro'}):page.locator('.sidebar nav button').filter({hasText:'Altro'})).click()
 await expect(page.getByRole('heading',{name:'Altro'})).toBeVisible()
 return stats
}
async function openInvoices(page:Page){
 await page.getByRole('button',{name:'Apri fatture e incassi'}).click()
 await expect(page.getByTestId('invoice-page')).toBeVisible()
}
test('ADMIN registra un pagamento parziale e vede il saldo aggiornato',async({page})=>{
 await boot(page,'ADMIN')
 await openInvoices(page)
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
test('ADMIN completa il saldo e la fattura risulta saldata',async({page})=>{
 await boot(page,'ADMIN')
 await openInvoices(page)
 await page.getByRole('button',{name:'Registra incasso'}).click()
 await page.getByRole('button',{name:'Conferma incasso'}).click()
 await expect(page.getByTestId('payment-modal')).toHaveCount(0)
 await page.getByRole('button',{name:'Saldate'}).click()
 await expect(page.getByText('Saldo completato')).toBeVisible()
 await expect(page.getByText('SALDATA')).toBeVisible()
})
test('retry dopo risposta persa riusa lo stesso id e non duplica il pagamento',async({page})=>{
 const stats=await boot(page,'ADMIN',{ackFailureOnce:true})
 await openInvoices(page)
 await page.getByRole('button',{name:'Registra incasso'}).click()
 await page.getByLabel('Importo incassato').fill('1000')
 await page.getByRole('button',{name:'Conferma incasso'}).click()
 await expect(page.getByTestId('payment-modal')).toBeVisible()
 await expect(page.getByTestId('payment-modal').getByRole('alert')).toContainText('network_ack_lost')
 await page.getByRole('button',{name:'Conferma incasso'}).click()
 await expect(page.getByTestId('payment-modal')).toHaveCount(0)
 await expect(page.getByText(/14\.000.*da incassare/)).toBeVisible()
 expect(stats.rpcCalls).toBe(2)
})
test('importo superiore al residuo non parte verso la RPC',async({page})=>{
 const stats=await boot(page,'ADMIN')
 await openInvoices(page)
 await page.getByRole('button',{name:'Registra incasso'}).click()
 const amount=page.getByLabel('Importo incassato')
 await amount.fill('15000.01')
 await amount.evaluate((node:HTMLInputElement)=>node.removeAttribute('max'))
 await page.getByRole('button',{name:'Conferma incasso'}).click()
 await expect(page.getByRole('alert')).toContainText('non superare il saldo')
 await expect(page.getByTestId('payment-modal')).toBeVisible()
 expect(stats.rpcCalls).toBe(0)
})
test('accesso concessionaria scaduto o bloccato impedisce il caricamento fatture',async({page})=>{
 await boot(page,'ADMIN',{locked:true})
 await openInvoices(page)
 await expect(page.getByRole('alert')).toContainText('Non hai il permesso')
 await expect(page.getByText('Mario Rossi')).toHaveCount(0)
})
test('VENDITORE non può aprire Fatture e Incassi',async({page})=>{
 await boot(page,'VENDITORE')
 await expect(page.getByRole('button',{name:'Apri fatture e incassi'})).toHaveCount(0)
})
