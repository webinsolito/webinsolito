import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const day=()=>new Date().toISOString().slice(0,10)

function json(route:any,data:unknown){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}

async function boot(page:Page){
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller'},
  dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:'Venditore',username:'seller',role:'VENDITORE',permissions:{}}
 })),{dealer:DEALER})
 await page.route(PROJECT+'/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/rest/v1/vehicles')return json(route,[{id:VEHICLE,dealer_id:DEALER,brand:'BMW',model:'X1',plate:'AB123CD',status:'IN_VENDITA',asking_price:32000}])
  if(path==='/rest/v1/vehicle_media'||path==='/rest/v1/vehicle_work_items'||path==='/rest/v1/customer_interactions'||path==='/rest/v1/customer_vehicle_interests'||path==='/rest/v1/calendar_events')return json(route,[])
  if(path==='/rest/v1/customers')return json(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',status:'CLIENTE'}])
  if(path==='/rest/v1/contracts')return json(route,[
   {id:'sale-active',dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,contract_number:'V-ACTIVE',contract_date:day(),template_code:'VENDITA',status:'SIGNED',sale_stage:'READY',price:32000,deposit:5000},
   {id:'sale-done',dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,contract_number:'V-DONE',contract_date:day(),template_code:'VENDITA',status:'SIGNED',sale_stage:'DELIVERED',price:31000,deposit:5000},
   {id:'sale-cancelled',dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,contract_number:'V-CANCELLED',contract_date:day(),template_code:'VENDITA',status:'CANCELLED',sale_stage:'CANCELLED',price:30000,deposit:0}
  ])
  if(path.startsWith('/rest/v1/'))return json(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
}

test('Vendite mostra di default solo il lavoro attivo e separa lo storico',async({page})=>{
 await boot(page)
 const active=page.getByTestId('sales-tab-active'),done=page.getByTestId('sales-tab-delivered'),cancelled=page.getByTestId('sales-tab-cancelled')
 await expect(active).toContainText('1')
 await expect(done).toContainText('1')
 await expect(cancelled).toContainText('1')
 await expect(active).toHaveAttribute('aria-selected','true')
 await expect(page.getByText('V-ACTIVE',{exact:true})).toBeVisible()
 await expect(page.getByText('V-DONE',{exact:true})).toHaveCount(0)
 await expect(page.getByText('V-CANCELLED',{exact:true})).toHaveCount(0)

 await done.click()
 await expect(done).toHaveAttribute('aria-selected','true')
 await expect(page.getByText('V-DONE',{exact:true})).toBeVisible()
 await expect(page.getByText('V-ACTIVE',{exact:true})).toHaveCount(0)
 await page.getByTestId('open-sale-360').click()
 await expect(page.getByTestId('sale-360')).toContainText('V-DONE')
 await page.getByTestId('sale-360').getByLabel('Chiudi').click()

 await cancelled.click()
 await expect(cancelled).toHaveAttribute('aria-selected','true')
 await expect(page.getByText('V-CANCELLED',{exact:true})).toBeVisible()
 await expect(page.getByText('V-DONE',{exact:true})).toHaveCount(0)
})

test('Nuova vendita riporta sempre alla sezione Attive',async({page})=>{
 await boot(page)
 await page.getByTestId('sales-tab-delivered').click()
 await expect(page.getByText('V-DONE',{exact:true})).toBeVisible()
 await page.getByTestId('new-sale').click()
 await expect(page.getByTestId('sales-tab-active')).toHaveAttribute('aria-selected','true')
 await expect(page.getByTestId('sale-create')).toBeVisible()
 await expect(page.getByText('V-ACTIVE',{exact:true})).toBeVisible()
})
