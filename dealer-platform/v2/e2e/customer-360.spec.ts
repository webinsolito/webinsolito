import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const CONTRACT='44444444-4444-4444-4444-444444444444'

type State={financeRequests:number}
const day=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}

async function boot(page:Page){
 const state:State={financeRequests:0}
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller-user'},
  dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:'Venditore',username:'seller',role:'VENDITORE',permissions:{}}
 })),{dealer:DEALER})
 await page.route(PROJECT+'/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  if(path==='/rest/v1/vehicles')return json(route,[{id:VEHICLE,dealer_id:DEALER,brand:'Volkswagen',model:'Golf',version:'2.0 TDI',plate:'AB123CD',status:'IN_VENDITA',asking_price:21900}])
  if(path==='/rest/v1/vehicle_media')return json(route,[])
  if(path==='/rest/v1/vehicle_work_items')return json(route,[])
  if(path==='/rest/v1/customers')return json(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',phone:'+393331112233',email:'mario@example.test',status:'LEAD',next_step:'Inviare proposta definitiva',next_contact_at:day(1)+'T09:30:00Z'}])
  if(path==='/rest/v1/customer_interactions')return json(route,[{id:'interaction-1',dealer_id:DEALER,customer_id:CUSTOMER,channel:'TELEFONO',title:'Offerta inviata',happened_at:day(0)+'T08:30:00Z'}])
  if(path==='/rest/v1/customer_vehicle_interests')return json(route,[{id:'interest-1',dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,status:'TRATTATIVA',offer_amount:21000,note:'Vuole chiudere entro venerdì'}])
  if(path==='/rest/v1/calendar_events')return json(route,[{id:'event-1',dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,event_type:'TEST_DRIVE',title:'Test drive finale',starts_at:day(2)+'T10:00:00Z',status:'OPEN'}])
  if(path==='/rest/v1/contracts')return json(route,[{id:CONTRACT,dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,contract_number:'V-2026-99',contract_date:day(-1),template_code:'VENDITA',status:'SIGNED',sale_stage:'READY',price:21900,deposit:2000,planned_delivery_at:day(4)+'T15:00:00Z'}])
  if(['/rest/v1/vehicle_financials','/rest/v1/vehicle_costs','/rest/v1/invoices'].includes(path)){state.financeRequests++;return json(route,[])}
  if(path.startsWith('/rest/v1/'))return json(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return state
}
function json(route:any,data:unknown){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}
async function openClients(page:Page){
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Clienti'}):page.locator('.sidebar nav button').filter({hasText:'Clienti'})).click()
 await expect(page.getByRole('heading',{name:'Clienti'})).toBeVisible()
 await page.locator('.client-main').filter({hasText:'Mario Rossi'}).click()
 await expect(page.getByTestId('customer-360')).toBeVisible()
}

test('Scheda Cliente 360 mostra situazione completa e apre la Scheda Auto 360',async({page})=>{
 const state=await boot(page)
 await openClients(page)
 const cockpit=page.getByTestId('customer-360')
 await expect(cockpit).toContainText('Inviare proposta definitiva')
 await expect(cockpit).toContainText('Volkswagen Golf')
 await expect(cockpit).toContainText('Test drive finale')
 await expect(cockpit).toContainText('Pronta consegna')
 await expect(cockpit).toContainText('Offerta inviata')
 expect(state.financeRequests).toBe(0)

 await cockpit.getByRole('button',{name:/Apri auto/}).click()
 await expect(page.getByTestId('vehicle-360')).toBeVisible()
 await expect(page.getByTestId('vehicle-360')).toContainText('Volkswagen Golf')
 expect(state.financeRequests).toBe(0)
})

test('Cliente 360 apre appuntamento con cliente e auto precompilati',async({page})=>{
 const state=await boot(page)
 await openClients(page)
 await page.getByTestId('customer-360').getByRole('button',{name:/Nuovo appuntamento/}).click()
 await expect(page.getByRole('heading',{name:'Calendario'})).toBeVisible()
 const form=page.locator('.calendar-create')
 await expect(form).toBeVisible()
 await expect(form.getByRole('combobox').nth(0)).toHaveValue(CUSTOMER)
 await expect(form.getByRole('combobox').nth(1)).toHaveValue(VEHICLE)
 await expect(form.getByPlaceholder('Es. richiamare cliente / consegna / prova auto')).toHaveValue('Appuntamento Volkswagen Golf')
 expect(state.financeRequests).toBe(0)
})

test('Cliente 360 apre la vendita esatta del cliente',async({page})=>{
 const state=await boot(page)
 await openClients(page)
 await page.getByTestId('customer-360').getByRole('button',{name:'Apri vendita'}).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 const focused=page.locator('.sale-card.vehicle-focus')
 await expect(focused).toContainText('Volkswagen Golf')
 await expect(focused).toContainText('Mario Rossi')
 await expect(focused).toContainText('Pronta consegna')
 expect(state.financeRequests).toBe(0)
})
