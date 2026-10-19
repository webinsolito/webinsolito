import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const CONTRACT='44444444-4444-4444-4444-444444444444'
const INVOICE='55555555-5555-5555-5555-555555555555'

type State={financeRequests:number;workItems:any[];calendarEvents:any[]}
const day=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}

async function boot(page:Page,role:'ADMIN'|'VENDITORE'){
 const state:State={
  financeRequests:0,
  workItems:[
   {id:'doc-1',dealer_id:DEALER,vehicle_id:VEHICLE,title:'Passaggio di proprietà',category:'DOCUMENTI',status:'TODO',priority:'HIGH',due_date:day(2),note:'Documenti cliente da verificare'},
   {id:'delivery-1',dealer_id:DEALER,vehicle_id:VEHICLE,title:'Contratto firmato',category:'CONSEGNA',status:'DONE'}
  ],
  calendarEvents:[{id:'event-existing',dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,event_type:'DELIVERY',title:'Consegna Golf',starts_at:day(3)+'T10:00:00Z',status:'OPEN'}]
 }
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:role==='ADMIN'?'admin-user':'seller-user'},
  dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}
 })),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method()
  const body=method==='GET'?null:req.postDataJSON() as any
  if(path==='/rest/v1/vehicles')return json(route,[{id:VEHICLE,dealer_id:DEALER,brand:'Volkswagen',model:'Golf',version:'2.0 TDI',plate:'AB123CD',status:'IN_VENDITA',asking_price:25000}])
  if(path==='/rest/v1/vehicle_media')return json(route,[])
  if(path==='/rest/v1/vehicle_work_items'){
   if(method==='GET')return json(route,state.workItems)
   if(method==='POST'){const row={id:'work-'+(state.workItems.length+1),created_at:new Date().toISOString(),...body};state.workItems.push(row);return json(route,[row])}
   if(method==='PATCH'){const id=url.searchParams.get('id')?.replace(/^eq\./,'');const row=state.workItems.find(w=>w.id===id);if(row)Object.assign(row,body);return json(route,row?[row]:[])}
  }
  if(path==='/rest/v1/customers')return json(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',phone:'+393331112233',status:'CLIENTE'}])
  if(path==='/rest/v1/customer_interactions')return json(route,[])
  if(path==='/rest/v1/customer_vehicle_interests')return json(route,[{id:'interest-1',dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,status:'VINTA'}])
  if(path==='/rest/v1/calendar_events'){
   if(method==='GET')return json(route,state.calendarEvents)
   if(method==='POST'){const row={id:'event-'+(state.calendarEvents.length+1),created_at:new Date().toISOString(),...body};state.calendarEvents.push(row);return json(route,[row])}
  }
  if(path==='/rest/v1/contracts')return json(route,[{id:CONTRACT,dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,contract_number:'V-2026-100',contract_date:day(-1),template_code:'VENDITA',status:'SIGNED',sale_stage:'READY',price:25000,deposit:3000,planned_delivery_at:day(4)+'T15:00:00Z',sale_invoice_id:INVOICE,financing_status:'APPROVED'}])
  if(path==='/rest/v1/vehicle_financials'){state.financeRequests++;return json(route,[])}
  if(path==='/rest/v1/vehicle_costs'){state.financeRequests++;return json(route,[])}
  if(path==='/rest/v1/invoices'){state.financeRequests++;return json(route,[{id:INVOICE,dealer_id:DEALER,vehicle_id:VEHICLE,customer_id:CUSTOMER,invoice_type:'SALE',total_amount:25000,paid_amount:10000,payment_status:'PARTIAL',issue_date:day(-1),due_date:day(4)}])}
  if(path==='/rest/v1/invoice_receipts')return json(route,[])
  if(path.startsWith('/rest/v1/'))return json(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return state
}
function json(route:any,data:unknown){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}
async function openSales(page:Page){
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 await page.getByTestId('open-sale-360').click()
 await expect(page.getByTestId('sale-360')).toBeVisible()
}

test('ADMIN vede Vendita 360 completa, pratiche, checklist e pagamento protetto',async({page})=>{
 const state=await boot(page,'ADMIN')
 await openSales(page)
 const drawer=page.getByTestId('sale-360')
 await expect(drawer).toContainText('V-2026-100')
 await expect(drawer).toContainText('Volkswagen Golf 2.0 TDI')
 await expect(drawer).toContainText('Mario Rossi')
 await expect(drawer).toContainText('Consegna Golf')
 await expect(drawer).toContainText('Passaggio di proprietà')
 await expect(drawer).toContainText('1/7')
 const finance=drawer.getByTestId('sale-360-finance')
 await expect(finance).toBeVisible()
 await expect(finance).toContainText(/15\.?000/)
 expect(state.financeRequests).toBeGreaterThan(0)

 await finance.getByRole('button',{name:'Apri fattura e incassi'}).click()
 await expect(page.getByTestId('invoice-page')).toBeVisible()
 await expect(page.getByTestId('invoice-card-'+INVOICE)).toBeVisible()
})

test('VENDITORE vede la Vendita 360 operativa ma nessun pagamento e crea una vera DELIVERY',async({page})=>{
 const state=await boot(page,'VENDITORE')
 await openSales(page)
 const drawer=page.getByTestId('sale-360')
 await expect(drawer.getByTestId('sale-360-finance')).toHaveCount(0)
 await expect(drawer).not.toContainText('APPROVED')
 expect(state.financeRequests).toBe(0)

 await drawer.getByTestId('sale360-delivery-appointment').click()
 await expect(page.getByRole('heading',{name:'Calendario'})).toBeVisible()
 const form=page.locator('.calendar-create')
 await expect(form.getByRole('combobox').nth(0)).toHaveValue(CUSTOMER)
 await expect(form.getByRole('combobox').nth(1)).toHaveValue(VEHICLE)
 await expect(form.getByPlaceholder('Es. richiamare cliente / consegna / prova auto')).toHaveValue('Consegna Volkswagen Golf')
 await form.locator('input[type="datetime-local"]').fill(day(5)+'T11:30')
 await page.getByRole('button',{name:'Salva appuntamento'}).click()
 await expect.poll(()=>state.calendarEvents.some(e=>e.title==='Consegna Volkswagen Golf'&&e.event_type==='DELIVERY'&&e.customer_id===CUSTOMER&&e.vehicle_id===VEHICLE)).toBe(true)
 expect(state.financeRequests).toBe(0)
})

test('Vendita 360 apre cliente e auto esatti e prepara la checklist mancante',async({page})=>{
 const state=await boot(page,'VENDITORE')
 await openSales(page)
 const drawer=page.getByTestId('sale-360')

 await drawer.getByRole('button',{name:/Cliente.*Mario Rossi/}).click()
 await expect(page.getByTestId('customer-360')).toBeVisible()
 await expect(page.locator('.customer-detail').getByRole('heading',{name:'Mario Rossi'})).toBeVisible()

 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await page.getByTestId('open-sale-360').click()
 await page.getByTestId('sale-360').getByRole('button',{name:/Auto.*Volkswagen Golf/}).click()
 await expect(page.getByTestId('vehicle-360')).toBeVisible()

 await page.getByLabel('Chiudi').click()
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await page.getByTestId('open-sale-360').click()
 await page.getByTestId('sale-360').getByRole('button',{name:'Completa checklist'}).click()
 await expect.poll(()=>state.workItems.filter(w=>w.category==='CONSEGNA').length).toBe(7)
 expect(state.financeRequests).toBe(0)
})
