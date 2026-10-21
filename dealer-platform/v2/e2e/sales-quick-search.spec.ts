import {expect,test,type Page} from '@playwright/test'
const API='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const id=(type:string,n:number)=>type.repeat(8)+'-'+type.repeat(4)+'-'+type.repeat(4)+'-'+type.repeat(4)+'-'+String(n).padStart(12,type)
const json=(route:any,data:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
async function setup(page:Page){
 const stats={contractWrites:0,vehicleWrites:0,financeRequests:0}
 const customers=[
  {id:id('3',1),dealer_id:DEALER,first_name:'Alba',last_name:'Bianchi'},
  {id:id('3',2),dealer_id:DEALER,first_name:'Marco',last_name:'Rossi'},
  {id:id('3',3),dealer_id:DEALER,first_name:'Giulìa',last_name:"D'Amico"},
  {id:id('3',4),dealer_id:DEALER,first_name:'Sara',last_name:'Verdi'}
 ]
 const vehicles=[
  {id:id('2',1),dealer_id:DEALER,brand:'BMW',model:'X1',plate:'AB123CD',status:'PRENOTATA'},
  {id:id('2',2),dealer_id:DEALER,brand:'Audi',model:'A3',plate:'ZZ987YY',status:'VENDUTA'},
  {id:id('2',3),dealer_id:DEALER,brand:'Toyota',model:'Yaris',plate:'EF456GH',status:'PRENOTATA'},
  {id:id('2',4),dealer_id:DEALER,brand:'Jeep',model:'Renegade',plate:'CD555EF',status:'IN_VENDITA'}
 ]
 const contracts=[
  {id:id('4',1),dealer_id:DEALER,customer_id:customers[0].id,vehicle_id:vehicles[0].id,contract_number:'V-101-26',template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT',deposit:0},
  {id:id('4',2),dealer_id:DEALER,customer_id:customers[1].id,vehicle_id:vehicles[1].id,contract_number:'V-202-26',template_code:'VENDITA',sale_stage:'DELIVERED',status:'SIGNED',deposit:0},
  {id:id('4',3),dealer_id:DEALER,customer_id:customers[2].id,vehicle_id:vehicles[2].id,contract_number:'V-303-26',template_code:'VENDITA',sale_stage:'READY',status:'DRAFT',deposit:0},
  {id:id('4',4),dealer_id:DEALER,customer_id:customers[3].id,vehicle_id:vehicles[3].id,contract_number:'V-404-26',template_code:'VENDITA',sale_stage:'CANCELLED',status:'CANCELLED',deposit:0}
 ]
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller'},
  dealer:{id:dealer,slug:'demo',display_name:'Demo'},profile:{role:'VENDITORE',display_name:'Operatore',username:'seller',permissions:{}}
 })),{dealer:DEALER})
 await page.route(API+'/**',async route=>{
  const path=new URL(route.request().url()).pathname
  const method=route.request().method()
  if(path==='/rest/v1/vehicles'){if(method!=='GET')stats.vehicleWrites++;return json(route,vehicles)}
  if(path==='/rest/v1/contracts'){if(method!=='GET')stats.contractWrites++;return json(route,contracts)}
  if(path==='/rest/v1/customers')return json(route,customers)
  if(['/rest/v1/vehicle_financials','/rest/v1/vehicle_costs','/rest/v1/invoices'].includes(path)){stats.financeRequests++;return json(route,[])}
  if(path.startsWith('/rest/v1/'))return json(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 return stats
}
test('Mod34 cerca per cliente anche tra le vendite consegnate e apre la Scheda Vendita 360° esatta',async({page})=>{
 const stats=await setup(page)
 await expect(page.getByTestId('sales-tab-active')).toHaveAttribute('aria-selected','true')
 const search=page.getByTestId('sales-quick-search')
 await search.fill('marco rossi')
 await expect(page.getByTestId('sales-tab-all')).toHaveAttribute('aria-selected','true')
 await expect(page.getByTestId('sale-card')).toHaveCount(1)
 await expect(page.getByTestId('sales-search-count')).toContainText('1 risultati')
 await expect(page.getByTestId('sale-card')).toContainText('V-202-26')
 await page.getByTestId('open-sale-360').click()
 await expect(page.getByTestId('sale-360').locator('header h2')).toHaveText('V-202-26')
 expect(stats.financeRequests).toBe(0)
 expect(stats.contractWrites).toBe(0)
 expect(stats.vehicleWrites).toBe(0)
})
test('Mod34 targa con trattini, contratto senza trattini, cognome senza accenti',async({page})=>{
 await setup(page)
 const field=page.getByTestId('sales-quick-search')
 await field.fill('ab-123-cd')
 await expect(page.getByTestId('sale-card')).toHaveCount(1)
 await expect(page.getByTestId('sale-card')).toContainText('V-101-26')
 await field.fill('v30326')
 await expect(page.getByTestId('sale-card')).toHaveCount(1)
 await expect(page.getByTestId('sale-card')).toContainText('V-303-26')
 await field.fill('amico giulia')
 await expect(page.getByTestId('sale-card')).toHaveCount(1)
 await expect(page.getByTestId('sale-card')).toContainText('V-303-26')
})
test('Mod34 filtri rapidi restringono i risultati e cancellazione ripristina le attive',async({page})=>{
 const stats=await setup(page)
 const field=page.getByTestId('sales-quick-search')
 await field.fill('V-404')
 await expect(page.getByTestId('sale-card')).toHaveCount(1)
 await page.getByTestId('sales-tab-delivered').click()
 await expect(page.getByTestId('sale-card')).toHaveCount(0)
 await expect(page.getByTestId('sales-search-empty')).toContainText('Nessuna vendita trovata')
 await page.getByTestId('sales-tab-cancelled').click()
 await expect(page.getByTestId('sale-card')).toHaveCount(1)
 await expect(page.getByTestId('sale-card')).toContainText('V-404-26')
 await page.getByTestId('sales-search-clear').click()
 await expect(field).toHaveValue('')
 await expect(page.getByTestId('sales-tab-active')).toHaveAttribute('aria-selected','true')
 await expect(page.getByTestId('sale-card')).toHaveCount(2)
 expect(stats.financeRequests).toBe(0)
})
test('Mod34 ricerca senza risultati e nuovo contratto non resta nascosto dietro filtro',async({page})=>{
 await setup(page)
 const field=page.getByTestId('sales-quick-search')
 await field.fill('esito impossibile 99123')
 await expect(page.getByTestId('sales-search-empty')).toContainText('Nessuna vendita trovata')
 await field.press('Escape')
 await expect(field).toHaveValue('')
 await field.fill('V-404')
 await page.getByTestId('new-sale').click()
 await expect(page.getByTestId('sales-tab-active')).toHaveAttribute('aria-selected','true')
 await expect(field).toHaveValue('')
 await expect(page.getByTestId('sale-create')).toBeVisible()
})
