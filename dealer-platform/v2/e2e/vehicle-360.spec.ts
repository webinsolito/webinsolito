import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const INVOICE='44444444-4444-4444-4444-444444444444'
const INTEREST='55555555-5555-5555-5555-555555555555'
const CONTRACT='66666666-6666-6666-6666-666666666666'

type State={financeRequests:number}
const day=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}

async function boot(page:Page,role:'ADMIN'|'VENDITORE'){
 const state:State={financeRequests:0}
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:role==='ADMIN'?'admin-user':'seller-user'},
  dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}
 })),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname
  if(path==='/rest/v1/vehicles')return json(route,[{id:VEHICLE,dealer_id:DEALER,brand:'Volkswagen',model:'Golf',version:'2.0 TDI',plate:'AB123CD',year:2022,mileage:58000,status:'IN_VENDITA',asking_price:25000,sale_price:25000}])
  if(path==='/rest/v1/vehicle_media')return json(route,[])
  if(path==='/rest/v1/vehicle_work_items')return json(route,[
   {id:'work-doc',dealer_id:DEALER,vehicle_id:VEHICLE,title:'Pratica immatricolazione',category:'DOCUMENTI',status:'TODO',priority:'HIGH',due_date:day(1),note:'Libretto da chiudere'},
   {id:'work-delivery',dealer_id:DEALER,vehicle_id:VEHICLE,title:'Contratto firmato',category:'CONSEGNA',status:'DONE'}
  ])
  if(path==='/rest/v1/customers')return json(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',phone:'+393331112233',status:'CLIENTE'}])
  if(path==='/rest/v1/customer_interactions')return json(route,[])
  if(path==='/rest/v1/customer_vehicle_interests')return json(route,[{id:INTEREST,dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,status:'TRATTATIVA',offer_amount:24000,note:'Vuole chiudere questa settimana'}])
  if(path==='/rest/v1/calendar_events')return json(route,[{id:'event-1',dealer_id:DEALER,vehicle_id:VEHICLE,customer_id:CUSTOMER,event_type:'TEST_DRIVE',title:'Test drive Golf',starts_at:day(2)+'T10:00:00Z',status:'OPEN',note:'Confermare un giorno prima'}])
  if(path==='/rest/v1/contracts')return json(route,[{id:CONTRACT,dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,contract_number:'V-2026-88',contract_date:day(-1),template_code:'VENDITA',status:'SIGNED',sale_stage:'READY',price:25000,deposit:3000,planned_delivery_at:day(3)+'T15:00:00Z'}])
  if(path==='/rest/v1/vehicle_financials'){state.financeRequests++;return json(route,[{id:'fin-1',dealer_id:DEALER,vehicle_id:VEHICLE,purchase_price:18000,minimum_price:22000}])}
  if(path==='/rest/v1/vehicle_costs'){state.financeRequests++;return json(route,[{id:'cost-1',dealer_id:DEALER,vehicle_id:VEHICLE,amount:1000,category:'PREPARAZIONE'}])}
  if(path==='/rest/v1/invoices'){state.financeRequests++;return json(route,[{id:INVOICE,dealer_id:DEALER,vehicle_id:VEHICLE,customer_id:CUSTOMER,invoice_type:'SALE',number:'FV-2026-88',counterparty_name:'Mario Rossi',total_amount:25000,paid_amount:10000,payment_status:'PARTIAL',issue_date:day(-1),due_date:day(3)}])}
  if(path==='/rest/v1/invoice_receipts')return json(route,[])
  if(path.startsWith('/rest/v1/'))return json(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return state
}
function json(route:any,data:unknown){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}
async function openGarage(page:Page){
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Garage'}):page.locator('.sidebar nav button').filter({hasText:'Garage'})).click()
 await expect(page.getByRole('heading',{name:'Garage'})).toBeVisible()
 await page.locator('.vehicle-card-v2').filter({hasText:'Volkswagen Golf'}).click()
 await expect(page.getByTestId('vehicle-360')).toBeVisible()
}

test('ADMIN vede la scheda auto 360 completa e apre la fattura esatta',async({page})=>{
 const state=await boot(page,'ADMIN')
 await openGarage(page)
 const drawer=page.getByTestId('vehicle-360')
 await expect(drawer.getByRole('button',{name:/Mario Rossi.*TRATTATIVA/i})).toBeVisible()
 await expect(drawer.getByText('Test drive Golf')).toBeVisible()
 await expect(drawer.getByRole('button',{name:/Pratica immatricolazione/})).toBeVisible()
 await expect(drawer.getByText('V-2026-88')).toBeVisible()
 await expect(drawer.getByText('Pronta consegna')).toBeVisible()
 await expect(drawer.getByTestId('vehicle-360-finance')).toBeVisible()
 await expect(drawer.getByTestId('vehicle-360-finance')).toContainText('6.000')
 await expect(drawer.getByTestId('vehicle-360-finance')).toContainText('15.000')
 expect(state.financeRequests).toBeGreaterThan(0)

 await drawer.getByRole('button',{name:'Apri fattura'}).click()
 await expect(page.getByRole('heading',{name:'Fatture e Incassi'})).toBeVisible()
 await expect(page.getByTestId('invoice-card-'+INVOICE)).toBeVisible()
})

test('VENDITORE vede commerciale, agenda e vendita ma nessun dato finanziario',async({page})=>{
 const state=await boot(page,'VENDITORE')
 await openGarage(page)
 const drawer=page.getByTestId('vehicle-360')
 await expect(drawer.getByRole('button',{name:/Mario Rossi.*TRATTATIVA/i})).toBeVisible()
 await expect(drawer.getByText('Test drive Golf')).toBeVisible()
 await expect(drawer.getByRole('button',{name:/Pratica immatricolazione/})).toBeVisible()
 await expect(drawer.getByText('V-2026-88')).toBeVisible()
 await expect(drawer.getByTestId('vehicle-360-finance')).toHaveCount(0)
 expect(state.financeRequests).toBe(0)

 await drawer.getByRole('button',{name:'Apri vendita'}).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 const focused=page.locator('.sale-card.vehicle-focus')
 await expect(focused).toContainText('Volkswagen Golf')
 await expect(focused).toContainText('Mario Rossi')
 expect(state.financeRequests).toBe(0)
})

test('dalla scheda 360 apre direttamente il cliente interessato',async({page})=>{
 await boot(page,'VENDITORE')
 await openGarage(page)
 const drawer=page.getByTestId('vehicle-360')
 await drawer.getByRole('button',{name:/Mario Rossi.*TRATTATIVA/i}).click()
 await expect(page.getByRole('heading',{name:'Clienti'})).toBeVisible()
 await expect(page.locator('.customer-detail').getByRole('heading',{name:'Mario Rossi'})).toBeVisible()
})
