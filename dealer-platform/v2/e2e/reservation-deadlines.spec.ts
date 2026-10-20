import {expect,test,type Page} from '@playwright/test'
const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const SALE='44444444-4444-4444-4444-444444444444'
const day=()=>new Date().toISOString().slice(0,10)
const send=(r:any,value:unknown)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)})

async function boot(page:Page,stage:'AGREED'|'DEPOSIT'='AGREED'){
 const state={
  financeRequests:0,extensions:0,
  contract:{
   id:SALE,dealer_id:DEALER,vehicle_id:VEHICLE,customer_id:CUSTOMER,
   contract_number:'V-BOOKING-26',contract_date:day(),template_code:'VENDITA',
   status:'DRAFT',sale_stage:stage,price:20000,deposit:stage==='DEPOSIT'?500:0,
   reservation_expires_at:new Date(Date.now()+20*3600*1000).toISOString(),
   reservation_extension_count:0,reservation_extend_reason:null
  }
 }
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,
  user:{id:'seller'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},
  profile:{role:'VENDITORE',username:'seller',display_name:'Venditore',permissions:{}}
 })),{dealer:DEALER})
 await page.route(PROJECT+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname
  if(path==='/rest/v1/vehicles')return send(route,[{id:VEHICLE,dealer_id:DEALER,status:'PRENOTATA',brand:'BMW',model:'X1',asking_price:20000}])
  if(path==='/rest/v1/customers')return send(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',status:'CLIENTE'}])
  if(path==='/rest/v1/contracts'){
   if(req.method()==='PATCH'){
    const body=req.postDataJSON()
    if(body.reservation_expires_at){
     state.extensions++
     Object.assign(state.contract,body,{reservation_extension_count:state.contract.reservation_extension_count+1})
    }
    return send(route,[state.contract])
   }
   return send(route,[state.contract])
  }
  if(['/rest/v1/vehicle_financials','/rest/v1/vehicle_costs','/rest/v1/invoices'].includes(path)){
   state.financeRequests++;return send(route,[])
  }
  if(path.startsWith('/rest/v1/'))return send(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return state
}
async function go(page:Page,label:string){
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:label}):page.locator('.sidebar nav button').filter({hasText:label})).click()
}
test('Modifica 26: promemoria Oggi e Centro Scadenze aprono la vendita corretta',async({page})=>{
 const state=await boot(page)
 await expect(page.getByTestId('today-reservation-alert')).toContainText('1 prenotazione')
 await page.getByTestId('today-reservation-alert').click()
 await expect(page.getByTestId('deadline-page')).toBeVisible()
 await page.getByRole('button',{name:'Prenotazioni',exact:true}).click()
 await expect(page.locator('.deadline-card')).toHaveCount(1)
 await expect(page.locator('.deadline-card')).toContainText('V-BOOKING-26')
 await page.locator('.deadline-card').click()
 await expect(page.getByTestId('reservation-deadline-panel')).toBeVisible()
 await expect(page.getByTestId('reservation-deadline-state')).toContainText('in scadenza')
 expect(state.financeRequests).toBe(0)
})
test('Modifica 26: proroga motivata e confermata, senza dati finanziari venditore',async({page})=>{
 const state=await boot(page)
 await go(page,'Vendite')
 await page.getByTestId('open-sale-360').click()
 const panel=page.getByTestId('reservation-deadline-panel')
 await panel.getByTestId('reservation-extend-open').click()
 await panel.getByLabel('Durata proroga').selectOption('7')
 await panel.getByLabel('Motivo proroga').fill('Attesa conferma cliente')
 await panel.getByTestId('reservation-extend-next').click()
 expect(state.extensions).toBe(0)
 await panel.getByTestId('reservation-extend-confirm').click()
 await expect.poll(()=>state.extensions).toBe(1)
 await expect(panel.getByTestId('reservation-extension-count')).toContainText('1')
 await expect(page.getByTestId('sales-reservation-alert')).toHaveCount(0)
 expect(state.contract.reservation_extend_reason).toBe('Attesa conferma cliente')
 expect(state.financeRequests).toBe(0)
})
test('Modifica 26: venditore non può prorogare una vendita con impegni',async({page})=>{
 const state=await boot(page,'DEPOSIT')
 await go(page,'Vendite')
 await page.getByTestId('open-sale-360').click()
 const panel=page.getByTestId('reservation-deadline-panel')
 await expect(panel).toContainText('Admin/Amministrazione')
 await expect(panel.getByTestId('reservation-extend-open')).toHaveCount(0)
 expect(state.extensions).toBe(0)
 expect(state.financeRequests).toBe(0)
})
