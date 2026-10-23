import {expect,test,type Page} from '@playwright/test'

const HOST='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const STALE='22222222-2222-2222-2222-222222222221'
const BLOCKED='22222222-2222-2222-2222-222222222222'
const OTHER='22222222-2222-2222-2222-222222222223'
const BOOKED='22222222-2222-2222-2222-222222222224'
const SOLD='22222222-2222-2222-2222-222222222225'
const FREE='22222222-2222-2222-2222-222222222226'
const send=(route:any,body:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})

async function boot(page:Page,withAnomalies=true){
 const stats={financeRequests:0,vehicleWrites:0,contractWrites:0}
 const vehicles=[
  {id:STALE,brand:'Seat',model:'Leon',plate:'AA111AA',status:withAnomalies?'PRENOTATA':'IN_VENDITA'},
  {id:BLOCKED,brand:'Fiat',model:'500',plate:'BB222BB',status:withAnomalies?'BLOCCATA':'IN_VENDITA'},
  {id:OTHER,brand:'Volvo',model:'XC40',plate:'CC333CC',status:withAnomalies?'RITIRATA':'IN_VENDITA'},
  {id:BOOKED,brand:'BMW',model:'X1',plate:'DD444DD',status:'PRENOTATA'},
  {id:SOLD,brand:'Audi',model:'A3',plate:'EE555EE',status:'VENDUTA'},
  {id:FREE,brand:'Ford',model:'Focus',plate:'FF666FF',status:'IN_VENDITA'},
  {id:'deleted',brand:'Toyota',model:'Aygo',plate:'GG777GG',status:'BLOCCATA',deleted_at:'2026-10-22T10:00:00Z'}
 ].map(v=>({...v,dealer_id:DEALER,asking_price:17000}))
 const contracts=[{
  id:'44444444-4444-4444-4444-444444444441',dealer_id:DEALER,vehicle_id:BOOKED,
  customer_id:'33333333-3333-3333-3333-333333333333',contract_number:'V-VALIDA',template_code:'VENDITA',
  sale_stage:'AGREED',status:'DRAFT',deposit:0
 }]
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,
  user:{id:'seller'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},
  profile:{role:'VENDITORE',display_name:'Venditore',username:'seller',permissions:{}}
 })),{dealer:DEALER})
 await page.route(HOST+'/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/rest/v1/vehicles'){if(route.request().method()!=='GET')stats.vehicleWrites++;return send(route,vehicles)}
  if(path==='/rest/v1/contracts'){if(route.request().method()!=='GET')stats.contractWrites++;return send(route,contracts)}
  if(['/rest/v1/vehicle_financials','/rest/v1/vehicle_costs','/rest/v1/invoices'].includes(path)){stats.financeRequests++;return send(route,[])}
  if(path.startsWith('/rest/v1/'))return send(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return {stats,vehicles,contracts}
}
async function menu(page:Page,label:string){
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:label}):page.locator('.sidebar nav button').filter({hasText:label})).click()
}

test('Mod52: OGGI conta solo anomalie reali e apre Garage già filtrato, in ordine di priorità',async({page})=>{
 const {stats}=await boot(page)
 const shortcut=page.getByTestId('today-garage-review')
 await expect(shortcut).toBeVisible()
 await expect(page.getByTestId('today-garage-review-count')).toHaveText('3')
 await expect(page.getByTestId('today-garage-review-detail')).toContainText('1 prenotazione incoerente')
 await expect(page.getByTestId('today-garage-review-detail')).toContainText('1 bloccata')
 await expect(page.getByTestId('today-garage-review-detail')).toContainText('1 altra')
 await shortcut.click()
 await expect(page.getByRole('heading',{name:'Garage'})).toBeVisible()
 await expect(page.getByTestId('garage-filter-review')).toHaveAttribute('aria-pressed','true')
 await expect(page.getByTestId('garage-filter-review')).toContainText('3')
 const visible=page.locator('.garage-photo-card .garage-card-open')
 await expect(visible).toHaveCount(3)
 await expect(visible.nth(0)).toHaveAttribute('data-testid','vehicle-card-'+STALE)
 await expect(visible.nth(1)).toHaveAttribute('data-testid','vehicle-card-'+BLOCKED)
 await expect(visible.nth(2)).toHaveAttribute('data-testid','vehicle-card-'+OTHER)
 await expect(page.getByTestId('vehicle-card-'+BOOKED)).toHaveCount(0)
 await expect(page.getByTestId('vehicle-card-'+SOLD)).toHaveCount(0)
 expect(stats.financeRequests).toBe(0)
 expect(stats.vehicleWrites).toBe(0)
 expect(stats.contractWrites).toBe(0)
})

test('Mod52: apertura normale Garage ripristina Tutte, senza conservare il filtro da OGGI',async({page})=>{
 const {stats}=await boot(page)
 await page.getByTestId('today-garage-review').click()
 await expect(page.getByTestId('garage-filter-review')).toHaveAttribute('aria-pressed','true')
 await menu(page,'Oggi')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 await menu(page,'Garage')
 await expect(page.getByRole('heading',{name:'Garage'})).toBeVisible()
 await expect(page.getByTestId('garage-filter-review')).toHaveAttribute('aria-pressed','false')
 await expect(page.getByTestId('garage-filter-all')).toHaveAttribute('aria-pressed','true')
 await expect(page.locator('.garage-photo-card')).toHaveCount(6)
 expect(stats.financeRequests).toBe(0)
})

test('Mod52: aggiorna il riepilogo dopo sync e non segnala anomalie risolte',async({page})=>{
 const {stats,vehicles}=await boot(page)
 await page.getByTestId('today-garage-review').click()
 await expect(page.getByTestId('garage-availability-sync')).toContainText('Disponibilità sincronizzata')
 vehicles.find(v=>v.id===BLOCKED)!.status='IN_VENDITA'
 await page.getByTestId('garage-availability-refresh').click()
 await expect(page.getByTestId('garage-filter-review')).toContainText('2')
 await menu(page,'Oggi')
 await expect(page.getByTestId('today-garage-review-count')).toHaveText('2')
 await expect(page.getByTestId('today-garage-review-detail')).not.toContainText('bloccata')
 expect(stats.financeRequests).toBe(0)
})

test('Mod52: nessuna scheda aggiuntiva in OGGI quando non ci sono anomalie',async({page})=>{
 const {stats}=await boot(page,false)
 await expect(page.getByTestId('today-garage-review')).toHaveCount(0)
 await menu(page,'Garage')
 await expect(page.getByTestId('garage-filter-review')).toContainText('0')
 await expect(page.getByTestId('garage-filter-all')).toHaveAttribute('aria-pressed','true')
 expect(stats.financeRequests).toBe(0)
})


test('Mod53: OGGI mostra modello e targa delle prime tre auto, ogni riga apre la scheda esatta',async({page})=>{
 const {stats}=await boot(page)
 const panel=page.getByTestId('today-garage-review-panel')
 await expect(panel).toBeVisible()
 const rows=panel.locator('.today-garage-review-vehicle')
 await expect(rows).toHaveCount(3)
 await expect(rows.nth(0)).toHaveAttribute('data-testid','today-garage-review-car-'+STALE)
 await expect(rows.nth(1)).toHaveAttribute('data-testid','today-garage-review-car-'+BLOCKED)
 await expect(rows.nth(2)).toHaveAttribute('data-testid','today-garage-review-car-'+OTHER)
 await expect(rows.nth(0)).toContainText('Seat Leon')
 await expect(rows.nth(0)).toContainText('AA111AA')
 await expect(rows.nth(0)).toContainText('Prenotazione incoerente')
 await expect(rows.nth(1)).toContainText('Fiat 500')
 await expect(rows.nth(1)).toContainText('BB222BB')
 await expect(rows.nth(1)).toContainText('Auto bloccata')
 await expect(rows.nth(2)).toContainText('Volvo XC40')
 await expect(rows.nth(2)).toContainText('CC333CC')
 await expect(rows.nth(2)).toContainText('Stato da chiarire')
 await panel.getByTestId('today-garage-review-car-'+BLOCKED).click()
 await expect(page.getByRole('heading',{name:'Garage'})).toBeVisible()
 await expect(page.locator('.garage-drawer-v2 h2')).toHaveText('Fiat 500')
 expect(stats.financeRequests).toBe(0)
 expect(stats.contractWrites).toBe(0)
 expect(stats.vehicleWrites).toBe(0)
})

test('Mod53: quando le anomalie sono più di tre, il contatore resta completo e la lista è limitata',async({page})=>{
 const {stats,vehicles}=await boot(page)
 vehicles.push({...vehicles[0],id:'22222222-2222-2222-2222-222222222227',brand:'Renault',model:'Clio',plate:'HH888HH',status:'PRENOTATA'})
 await menu(page,'Garage')
 // La sync può essere già stata rilevata come modifica di un collega.
 await expect(page.getByTestId('garage-availability-sync')).toContainText(/Disponibilità (sincronizzata|aggiornata)/)
 await page.getByTestId('garage-availability-refresh').click()
 await expect(page.getByTestId('garage-filter-review')).toContainText('4')
 await menu(page,'Oggi')
 await expect(page.getByTestId('today-garage-review-count')).toHaveText('4')
 await expect(page.locator('.today-garage-review-vehicle')).toHaveCount(3)
 await expect(page.getByTestId('today-garage-review-car-'+STALE)).toBeVisible()
 await expect(page.getByTestId('today-garage-review-car-22222222-2222-2222-2222-222222222227')).toBeVisible()
 await expect(page.getByTestId('today-garage-review-car-'+BLOCKED)).toBeVisible()
 await expect(page.getByTestId('today-garage-review-car-'+OTHER)).toHaveCount(0)
 await expect(page.getByTestId('today-garage-review-more')).toContainText('+1 altre auto')
 await page.getByTestId('today-garage-review').click()
 await expect(page.getByTestId('garage-filter-review')).toHaveAttribute('aria-pressed','true')
 await expect(page.locator('.garage-photo-card')).toHaveCount(4)
 expect(stats.financeRequests).toBe(0)
})

test('Mod53: nessuna lista quando tutte le auto sono disponibili',async({page})=>{
 await boot(page,false)
 await expect(page.getByTestId('today-garage-review-panel')).toHaveCount(0)
 await expect(page.locator('.today-garage-review-vehicle')).toHaveCount(0)
})
