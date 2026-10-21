import {expect,test,type Page} from '@playwright/test'
const HOST='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const customerId=(i:number)=>'33333333-3333-3333-3333-'+String(i).padStart(12,'0')
const vehicleId=(i:number)=>'22222222-2222-2222-2222-'+String(i).padStart(12,'0')
const saleId=(i:number)=>'44444444-4444-4444-4444-'+String(i).padStart(12,'0')
const iso=(days:number)=>new Date(Date.now()+days*86400000).toISOString()
const response=(route:any,obj:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)})
async function boot(page:Page,empty=false){
 const state={financeRequests:0,contractWrites:0,vehicleWrites:0,interactionWrites:0,customers:[] as any[]}
 const vehicles=Array.from({length:10},(_,i)=>({id:vehicleId(i+1),dealer_id:DEALER,brand:'BMW',model:'X'+(i+1),plate:'AB00'+(i+1)+'CD',status:'PRENOTATA',asking_price:24000}))
 state.customers=Array.from({length:10},(_,i)=>({
  id:customerId(i+1),dealer_id:DEALER,first_name:'Cliente',last_name:String(i+1),
  ...(i===1?{next_step:'Ricontatto prenotazione V-OV-2',next_contact_at:iso(1)}:{})
 }))
 const sales=Array.from({length:10},(_,i)=>({
  id:saleId(i+1),dealer_id:DEALER,vehicle_id:vehicles[i].id,customer_id:state.customers[i].id,
  contract_number:'V-OV-'+(i+1),contract_date:'2026-10-15',template_code:'VENDITA',
  sale_stage:i===7?'CANCELLED':i===8?'DELIVERED':i===9?'OPEN':i===3?'DEPOSIT':'AGREED',
  status:i===7?'CANCELLED':'DRAFT',price:24000,deposit:0,
  reservation_expires_at:i===5?null:iso([-2,2,2.5,-1,8,0,12,-1,-1,-1][i]),
  reservation_extension_count:0
 }))
 const doneSale=sales[2]
 const history=[{id:'done',dealer_id:DEALER,customer_id:doneSale.customer_id,channel:'NOTE',
  title:'Prenotazione V-OV-3 · Richiamo completato · SOON · '+doneSale.reservation_expires_at+' · Cliente sentito',
  happened_at:iso(-.25)}]
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller'},
  dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},
  profile:{role:'VENDITORE',display_name:'Operatore',username:'seller',permissions:{}}
 })),{dealer:DEALER})
 await page.route(HOST+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method()
  if(path==='/rest/v1/vehicles'){if(method!=='GET')state.vehicleWrites++;return response(route,vehicles)}
  if(path==='/rest/v1/customers')return response(route,state.customers)
  if(path==='/rest/v1/contracts'){if(method!=='GET')state.contractWrites++;return response(route,empty?[]:sales)}
  if(path==='/rest/v1/customer_interactions'){if(method!=='GET')state.interactionWrites++;return response(route,empty?[]:history)}
  if(['/rest/v1/invoices','/rest/v1/vehicle_costs','/rest/v1/vehicle_financials'].includes(path)){state.financeRequests++;return response(route,[])}
  if(path.startsWith('/rest/v1/'))return response(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 return state
}
test('Mod33 Vendite riepiloga prenotazioni reali, scadenze e richiami completati',async({page})=>{
 const state=await boot(page)
 const overview=page.getByTestId('sales-booking-overview')
 await expect(overview).toBeVisible()
 await expect(page.getByTestId('sales-booking-active')).toHaveText('7')
 await expect(page.getByTestId('sales-booking-overdue')).toHaveText('2')
 await expect(page.getByTestId('sales-booking-soon')).toHaveText('2')
 await expect(page.getByTestId('sales-booking-completed')).toHaveText('1')
 await expect(overview.getByTestId('sales-booking-row')).toHaveCount(6)
 await overview.getByTestId('sales-booking-more').click()
 await expect(overview.getByTestId('sales-booking-row')).toHaveCount(7)
 await expect(overview).not.toContainText('V-OV-8')
 await expect(overview).not.toContainText('V-OV-9')
 await expect(overview).not.toContainText('V-OV-10')
 expect(state.financeRequests).toBe(0)
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
})
test('Mod33 filtri coerenti: richiami da gestire, programmati, completati e auto senza scadenza',async({page})=>{
 const state=await boot(page)
 const overview=page.getByTestId('sales-booking-overview')
 await overview.getByTestId('sales-booking-filter-action').click()
 await expect(overview.getByTestId('sales-booking-row')).toHaveCount(2)
 await expect(overview).toContainText('V-OV-1')
 await expect(overview).toContainText('V-OV-4')
 await overview.getByTestId('sales-booking-filter-scheduled').click()
 await expect(overview.getByTestId('sales-booking-row')).toHaveCount(1)
 await expect(overview).toContainText('V-OV-2')
 await overview.getByTestId('sales-booking-filter-completed').click()
 await expect(overview.getByTestId('sales-booking-row')).toHaveCount(1)
 await expect(overview.getByTestId('sales-booking-row')).toHaveAttribute('data-callback-state','COMPLETED')
 await expect(overview).toContainText('V-OV-3')
 await overview.getByTestId('sales-booking-filter-no_deadline').click()
 await expect(overview.getByTestId('sales-booking-row')).toHaveCount(1)
 await expect(overview).toContainText('V-OV-6')
 await expect(overview).toContainText('Prenotazione senza data di scadenza')
 expect(state.financeRequests).toBe(0)
})
test('Mod33 apre Vendita 360 esatta anche dalla tab Consegnate, senza chiamate finanziarie',async({page})=>{
 const state=await boot(page)
 await page.getByTestId('sales-tab-delivered').click()
 await expect(page.getByTestId('sales-tab-delivered')).toHaveAttribute('aria-selected','true')
 const overview=page.getByTestId('sales-booking-overview')
 await overview.getByTestId('sales-booking-filter-completed').click()
 await overview.getByTestId('sales-booking-row').click()
 await expect(page.getByTestId('sales-tab-active')).toHaveAttribute('aria-selected','true')
 await expect(page.getByTestId('sale-360').locator('header h2')).toHaveText('V-OV-3')
 await expect(page.getByTestId('reservation-followup-completed')).toBeVisible()
 expect(state.financeRequests).toBe(0)
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
})
test('Mod33 nessuna prenotazione: stato vuoto esplicito e contatori a zero',async({page})=>{
 await boot(page,true)
 const overview=page.getByTestId('sales-booking-overview')
 await expect(page.getByTestId('sales-booking-active')).toHaveText('0')
 await expect(page.getByTestId('sales-booking-overdue')).toHaveText('0')
 await expect(page.getByTestId('sales-booking-soon')).toHaveText('0')
 await expect(page.getByTestId('sales-booking-completed')).toHaveText('0')
 await expect(overview.getByTestId('sales-booking-empty')).toContainText('Nessuna auto attualmente prenotata')
})
