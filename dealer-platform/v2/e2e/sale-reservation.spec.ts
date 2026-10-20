import {expect,test,type Page} from '@playwright/test'
const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const BOOKED='22222222-2222-2222-2222-222222222222'
const FREE='22222222-2222-2222-2222-222222222223'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const CONTRACT='44444444-4444-4444-4444-444444444444'
const day=()=>new Date().toISOString().slice(0,10)
const send=(r:any,body:unknown)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
async function boot(page:Page){
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller'},
  dealer:{id:dealer,slug:'demo',display_name:'Demo'},profile:{role:'VENDITORE',display_name:'Venditore',username:'seller',permissions:{}}
 })),{dealer:DEALER})
 await page.route(PROJECT+'/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/rest/v1/vehicles')return send(route,[
   {id:BOOKED,dealer_id:DEALER,brand:'BMW',model:'X1',status:'PRENOTATA',asking_price:20000},
   {id:FREE,dealer_id:DEALER,brand:'Fiat',model:'500',status:'IN_VENDITA',asking_price:13000}
  ])
  if(path==='/rest/v1/customers')return send(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',status:'CLIENTE'}])
  if(path==='/rest/v1/contracts')return send(route,[{
   id:CONTRACT,dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:BOOKED,
   contract_number:'V-OWNER',contract_date:day(),template_code:'VENDITA',
   sale_stage:'AGREED',status:'DRAFT',price:20000,deposit:0
  }])
  if(path.startsWith('/rest/v1/'))return send(route,[])
  return send(route,{})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
}
async function nav(page:Page,label:string){
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:label}):page.locator('.sidebar nav button').filter({hasText:label})).click()
}
test('Modifica 25: cliente proprietario della prenotazione visibile in Vendite e Garage',async({page})=>{
 await boot(page)
 await nav(page,'Vendite')
 await expect(page.getByText('V-OWNER',{exact:true})).toBeVisible()
 await expect(page.getByTestId('sale-reservation-owner')).toContainText('Mario Rossi')
 await expect(page.getByTestId('sale-reservation-owner')).toContainText('V-OWNER')
 await nav(page,'Garage')
 await expect(page.getByTestId('garage-reservation-owner')).toContainText('Mario Rossi')
})
test('Modifica 25: nuova vendita avvisa e non propone auto già prenotata',async({page})=>{
 await boot(page)
 await nav(page,'Vendite')
 await expect(page.getByText('V-OWNER',{exact:true})).toBeVisible()
 await page.getByTestId('new-sale').click()
 const picker=page.getByLabel('AUTO VENDITA')
 await expect(picker.locator('option[value="'+BOOKED+'"]')).toBeDisabled()
 await expect(picker.locator('option[value="'+FREE+'"]')).toBeEnabled()
 await expect(picker.locator('option[value="'+BOOKED+'"]')).toContainText('Mario Rossi')
})
