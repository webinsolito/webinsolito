import {expect,test,type Page} from '@playwright/test'
const HOST='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const FUTURE='22222222-2222-2222-2222-222222222221'
const DUE='22222222-2222-2222-2222-222222222222'
const LATE='22222222-2222-2222-2222-222222222223'
const FREE='22222222-2222-2222-2222-222222222224'
const STALE='22222222-2222-2222-2222-222222222225'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const date=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString()
const send=(r:any,v:unknown)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v)})
async function boot(page:Page){
 const state={financeRequests:0,historyRequests:0}
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller'},
  dealer:{id:dealer,slug:'demo',display_name:'Demo'},profile:{role:'VENDITORE',display_name:'Venditore',username:'seller',permissions:{}}
 })),{dealer:DEALER})
 const vehicles=[
  {id:FUTURE,brand:'BMW',model:'X1',plate:'AA111AA',status:'PRENOTATA'},
  {id:DUE,brand:'Audi',model:'A3',plate:'BB222BB',status:'PRENOTATA'},
  {id:LATE,brand:'Fiat',model:'500',plate:'CC333CC',status:'PRENOTATA'},
  {id:FREE,brand:'Volvo',model:'XC40',plate:'DD444DD',status:'IN_VENDITA'},
  {id:STALE,brand:'Seat',model:'Leon',plate:'EE555EE',status:'PRENOTATA'}
 ].map(v=>({...v,dealer_id:DEALER,asking_price:20000}))
 const sales=[
  {id:'44444444-4444-4444-4444-444444444441',vehicle_id:FUTURE,contract_number:'B-FUTURE',reservation_expires_at:date(12)},
  {id:'44444444-4444-4444-4444-444444444442',vehicle_id:DUE,contract_number:'B-DUE',reservation_expires_at:date(2)},
  {id:'44444444-4444-4444-4444-444444444443',vehicle_id:LATE,contract_number:'B-OVERDUE',reservation_expires_at:date(-1)},
  {id:'44444444-4444-4444-4444-444444444445',vehicle_id:STALE,contract_number:'B-CANCELLED',reservation_expires_at:date(-1),sale_stage:'CANCELLED'}
 ].map(s=>({dealer_id:DEALER,customer_id:CUSTOMER,template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT',price:20000,deposit:0,...s}))
 await page.route(HOST+'/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/rest/v1/vehicles')return send(route,vehicles)
  if(path==='/rest/v1/customers')return send(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Ada',last_name:'Rossi'}])
  if(path==='/rest/v1/contracts')return send(route,sales)
  if(path==='/rest/v1/vehicle_reservation_events_v270'){state.historyRequests++;return send(route,[])}
  if(['/rest/v1/vehicle_financials','/rest/v1/vehicle_costs','/rest/v1/invoices'].includes(path)){state.financeRequests++;return send(route,[])}
  if(path.startsWith('/rest/v1/'))return send(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Garage'}):page.locator('.sidebar nav button').filter({hasText:'Garage'})).click()
 await expect(page.getByRole('heading',{name:'Garage'})).toBeVisible()
 return state
}
test('Modifica 28: filtri Garage identificano solo prenotazioni reali e le scadenze',async({page})=>{
 const state=await boot(page)
 const tabs=page.getByTestId('garage-reservation-filters')
 await expect(tabs.getByTestId('garage-filter-all')).toContainText('5')
 await expect(tabs.getByTestId('garage-filter-booked')).toContainText('3')
 await expect(tabs.getByTestId('garage-filter-due')).toContainText('1')
 await expect(tabs.getByTestId('garage-filter-overdue')).toContainText('1')
 await tabs.getByTestId('garage-filter-booked').click()
 await expect(page.getByTestId('garage-filter-booked')).toHaveAttribute('aria-pressed','true')
 await expect(page.locator('[data-testid^="vehicle-card-"]')).toHaveCount(3)
 await expect(page.getByTestId('garage-booking-due')).toHaveCount(3)
 await tabs.getByTestId('garage-filter-due').click()
 await expect(page.locator('[data-testid^="vehicle-card-"]')).toHaveCount(1)
 await expect(page.getByTestId('vehicle-card-'+DUE)).toBeVisible()
 await expect(page.getByTestId('garage-booking-due')).toContainText('In scadenza')
 await tabs.getByTestId('garage-filter-overdue').click()
 await expect(page.locator('[data-testid^="vehicle-card-"]')).toHaveCount(1)
 await expect(page.getByTestId('vehicle-card-'+LATE)).toBeVisible()
 await expect(page.getByTestId('garage-booking-due')).toContainText('Scaduta')
 expect(state.financeRequests).toBe(0)
})
test('Modifica 28: Garage apre esattamente la Scheda Vendita 360° della prenotazione',async({page})=>{
 const state=await boot(page)
 await page.getByTestId('garage-filter-overdue').click()
 await page.getByTestId('garage-open-sale-'+LATE).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 await expect(page.getByTestId('sale-360')).toBeVisible()
 await expect(page.getByTestId('sale-360').locator('header h2')).toHaveText('B-OVERDUE')
 await expect(page.getByTestId('reservation-deadline-panel')).toContainText('Prenotazione scaduta')
 expect(state.financeRequests).toBe(0)
})
test('Modifica 28: stato auto reale, ricerca contratto/cliente e reset dei filtri',async({page})=>{
 const state=await boot(page)
 await page.getByLabel('Filtra per stato auto').selectOption('IN_VENDITA')
 await expect(page.locator('[data-testid^="vehicle-card-"]')).toHaveCount(1)
 await expect(page.getByTestId('vehicle-card-'+FREE)).toBeVisible()
 await page.getByTestId('garage-filter-booked').click()
 await expect(page.getByTestId('garage-filter-empty')).toBeVisible()
 await page.getByRole('button',{name:'Mostra tutte le auto'}).click()
 await expect(page.locator('[data-testid^="vehicle-card-"]')).toHaveCount(5)
 await page.getByLabel('Cerca nel Garage').fill('B-OVERDUE')
 await expect(page.getByTestId('vehicle-card-'+LATE)).toBeVisible()
 await expect(page.locator('[data-testid^="vehicle-card-"]')).toHaveCount(1)
 await page.getByLabel('Cerca nel Garage').fill('Ada Rossi')
 await expect(page.locator('[data-testid^="vehicle-card-"]')).toHaveCount(3)
 expect(state.financeRequests).toBe(0)
})
