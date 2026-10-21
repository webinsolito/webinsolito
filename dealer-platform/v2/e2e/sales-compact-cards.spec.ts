import {expect,test,type Page} from '@playwright/test'
const HOST='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const C='33333333-3333-3333-3333-333333333333'
const V='22222222-2222-2222-2222-222222222222'
const iso=(days:number)=>new Date(Date.now()+days*86400000).toISOString()
const json=(route:any,data:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
async function boot(page:Page,{role='VENDITORE'}:{role?:string}={}){
 const state={contractWrites:0,vehicleWrites:0,financeRequests:0}
 const customers=[{id:C,dealer_id:DEALER,first_name:'Giulia',last_name:'Rossi'}]
 const vehicles=[{id:V,dealer_id:DEALER,brand:'BMW',model:'X1',plate:'AB123CD',status:'PRENOTATA',asking_price:28000}]
 const contracts=[
  {id:'sale-active',dealer_id:DEALER,vehicle_id:V,customer_id:C,contract_number:'V-COMPACT-1',contract_date:'2026-10-20',
   template_code:'VENDITA',status:'DRAFT',sale_stage:'AGREED',price:28000,deposit:1500,reservation_expires_at:iso(-2)},
  {id:'sale-ready',dealer_id:DEALER,vehicle_id:V,customer_id:C,contract_number:'V-COMPACT-2',contract_date:'2026-10-19',
   template_code:'VENDITA',status:'SIGNED',sale_stage:'READY',price:30000,deposit:3000,planned_delivery_at:iso(2)},
  {id:'sale-delivered',dealer_id:DEALER,vehicle_id:V,customer_id:C,contract_number:'V-COMPACT-3',contract_date:'2026-10-18',
   template_code:'VENDITA',status:'SIGNED',sale_stage:'DELIVERED',price:28000,deposit:3000},
  {id:'sale-cancelled',dealer_id:DEALER,vehicle_id:V,customer_id:C,contract_number:'V-COMPACT-4',contract_date:'2026-10-17',
   template_code:'VENDITA',status:'CANCELLED',sale_stage:'CANCELLED',price:28000,deposit:0}
 ]
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller'},
  dealer:{id:dealer,slug:'demo',display_name:'Demo'},profile:{role,display_name:'Tester',username:'seller',permissions:{}}
 })),{dealer:DEALER,role})
 await page.route(HOST+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname
  if(path==='/rest/v1/vehicles'){if(req.method()!=='GET')state.vehicleWrites++;return json(route,vehicles)}
  if(path==='/rest/v1/contracts'){if(req.method()!=='GET')state.contractWrites++;return json(route,contracts)}
  if(path==='/rest/v1/customers')return json(route,customers)
  if(path==='/rest/v1/vehicle_work_items')return json(route,[{id:'a',dealer_id:DEALER,vehicle_id:V,category:'CONSEGNA',title:'Contratto firmato',status:'DONE'}])
  if(['/rest/v1/vehicle_financials','/rest/v1/vehicle_costs','/rest/v1/invoices'].includes(path)){state.financeRequests++;return json(route,[])}
  if(path.startsWith('/rest/v1/'))return json(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 return state
}
test('Mod35 scheda compatta mostra dati essenziali e prenotazione urgente senza sei barre giganti',async({page})=>{
 const state=await boot(page)
 const card=page.getByTestId('sale-card').filter({hasText:'V-COMPACT-1'})
 await expect(card).toBeVisible()
 await expect(card).toContainText('BMW X1')
 await expect(card).toContainText('Giulia Rossi')
 await expect(card).toContainText('AB123CD')
 await expect(card).toContainText('Accordo')
 await expect(card).toContainText('Checklist')
 await expect(card.getByTestId('sale-reservation-owner')).toContainText('SCADUTA')
 await expect(card.locator('details')).not.toHaveAttribute('open','')
 await expect(card.locator('.sale-kpis')).not.toBeVisible()
 await expect(card.getByTestId('open-sale-360')).toBeVisible()
 // Regressione Mod35: le azioni più frequenti devono restare disponibili senza espandere la scheda.
 await expect(card.getByRole('button',{name:'Avanza a Caparra'})).toBeVisible()
 await expect(card.getByRole('button',{name:'Prepara checklist'})).toBeVisible()
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
 expect(state.financeRequests).toBe(0)
})
test('Mod35 espandi dettagli e azioni: prezzo, caparra, progress e quick actions preservati',async({page})=>{
 const state=await boot(page)
 const card=page.getByTestId('sale-card').filter({hasText:'V-COMPACT-1'})
 await card.getByTestId('sale-card-details').locator('summary').click()
 await expect(card.getByTestId('sale-card-details')).toHaveAttribute('open','')
 await expect(card).toContainText('Prezzo')
 await expect(card).toContainText('Caparra')
 await expect(card.locator('.sale-progress')).toBeVisible()
 await expect(card.getByRole('button',{name:'Prepara checklist'})).toBeVisible()
 await expect(card.getByRole('button',{name:'Avanza a Caparra'})).toBeVisible()
 await card.getByRole('button',{name:'Apri tutta la Vendita 360°'}).click()
 await expect(page.getByTestId('sale-360').locator('header h2')).toHaveText('V-COMPACT-1')
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
})
test('Mod35 consegna READY e schede archiviate non perdono i controlli di permesso',async({page})=>{
 const state=await boot(page)
 await page.getByTestId('sales-tab-all').click()
 const ready=page.getByTestId('sale-card').filter({hasText:'V-COMPACT-2'})
 await ready.getByTestId('sale-card-details').locator('summary').click()
 await expect(ready.getByRole('button',{name:'Verifica consegna'})).toBeVisible()
 await ready.getByRole('button',{name:'Verifica consegna'}).click()
 await expect(page.getByTestId('sale-360').locator('header h2')).toHaveText('V-COMPACT-2')
 await page.getByRole('button',{name:'Chiudi vendita 360'}).click()
 for(const label of ['V-COMPACT-3','V-COMPACT-4']){
  const card=page.getByTestId('sale-card').filter({hasText:label})
  await card.getByTestId('sale-card-details').locator('summary').click()
  await expect(card.locator('.sale-actions button')).toHaveCount(0)
  await expect(card.getByTestId('open-sale-360')).toBeVisible()
 }
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
})
test('Mod35 pulsanti ed elementi leggibili senza overflow su viewport piccolo',async({page})=>{
 await boot(page)
 const card=page.getByTestId('sale-card').first()
 const viewport=page.viewportSize()
 const dimensions=await card.boundingBox()
 expect(dimensions).toBeTruthy()
 if((viewport?.width||1200)<=760){
  expect(dimensions!.width).toBeLessThanOrEqual(viewport!.width+1)
  const open=await card.getByTestId('open-sale-360').boundingBox()
  expect(open!.height).toBeGreaterThanOrEqual(43)
  await card.getByTestId('sale-card-details').locator('summary').click()
  const details=await card.getByTestId('sale-card-details').locator('summary').boundingBox()
  expect(details!.height).toBeGreaterThanOrEqual(42)
 }
 await card.getByTestId('open-sale-360').click()
 await expect(page.getByTestId('sale-360').locator('header h2')).toHaveText('V-COMPACT-1')
})
test('Mod35 ruolo senza permesso scrittura vede 360 ma non azioni rapide di modifica',async({page})=>{
 await boot(page,{role:'OPERATORE'})
 const card=page.getByTestId('sale-card').first()
 await card.getByTestId('sale-card-details').locator('summary').click()
 await expect(card.getByRole('button',{name:'Avanza a Caparra'})).toHaveCount(0)
 await expect(card.getByTestId('open-sale-360')).toBeVisible()
})

test('Mod36: ordinamento intelligente predefinito mostra prima la prenotazione scaduta',async({page})=>{
 const state=await boot(page)
 await expect(page.getByTestId('sales-sort-priority')).toHaveAttribute('aria-pressed','true')
 const cards=page.getByTestId('sale-card')
 await expect(cards.first()).toHaveAttribute('data-sale-id','sale-active')
 await expect(cards.first().getByTestId('sale-sort-priority')).toContainText('Prenotazione scaduta')
 await expect(page.getByTestId('sales-sort-hint')).toContainText('prenotazioni scadute')
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
 expect(state.financeRequests).toBe(0)
})
test('Mod36: data consegna e scadenza prenotazione riordinano senza cambiare contratti',async({page})=>{
 const state=await boot(page)
 const cards=page.getByTestId('sale-card')
 await page.getByTestId('sales-sort-delivery').click()
 await expect(page.getByTestId('sales-sort-delivery')).toHaveAttribute('aria-pressed','true')
 await expect(cards.first()).toHaveAttribute('data-sale-id','sale-ready')
 await expect(cards.first().getByTestId('sale-sort-priority')).toHaveCount(0)
 await page.getByTestId('sales-sort-reservation').click()
 await expect(cards.first()).toHaveAttribute('data-sale-id','sale-active')
 await expect(page.getByTestId('sales-sort-hint')).toContainText('scadenza più vicina')
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
})
test('Mod36: ordina per più recenti e mantiene in archivio le vendite concluse',async({page})=>{
 await boot(page)
 await page.getByTestId('sales-tab-all').click()
 await page.getByTestId('sales-sort-recent').click()
 const cards=page.getByTestId('sale-card')
 await expect(cards).toHaveCount(4)
 await expect(cards.nth(0)).toHaveAttribute('data-sale-id','sale-active')
 await expect(cards.nth(1)).toHaveAttribute('data-sale-id','sale-ready')
 await expect(cards.nth(2)).toHaveAttribute('data-sale-id','sale-delivered')
 await expect(cards.nth(3)).toHaveAttribute('data-sale-id','sale-cancelled')
 await page.getByTestId('sales-sort-priority').click()
 await expect(cards.nth(2)).toHaveAttribute('data-sale-id','sale-delivered')
 await expect(cards.nth(3)).toHaveAttribute('data-sale-id','sale-cancelled')
})
test('Mod36: ricerca e filtro convivono con riordino e aprono la vendita esatta',async({page})=>{
 const state=await boot(page)
 const search=page.getByTestId('sales-quick-search')
 await search.fill('V-COMPACT-2')
 await expect(page.getByTestId('sales-tab-all')).toHaveAttribute('aria-selected','true')
 await expect(page.getByTestId('sale-card')).toHaveCount(1)
 await page.getByTestId('sales-sort-delivery').click()
 await expect(page.getByTestId('sale-card')).toHaveAttribute('data-sale-id','sale-ready')
 await page.getByTestId('sales-tab-delivered').click()
 await expect(page.getByTestId('sale-card')).toHaveCount(0)
 await page.getByTestId('sales-tab-all').click()
 await expect(page.getByTestId('sale-card')).toHaveCount(1)
 await page.getByTestId('open-sale-360').click()
 await expect(page.getByTestId('sale-360').locator('header h2')).toHaveText('V-COMPACT-2')
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
 expect(state.financeRequests).toBe(0)
})
