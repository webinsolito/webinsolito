import {expect,test,type Page} from '@playwright/test'
const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const SALE='44444444-4444-4444-4444-444444444444'
const t='2026-10-20T13:00:00Z'
const send=(r:any,value:unknown)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)})
const ev=(id:string,event_type:string,stamp:string,other:Record<string,unknown>={})=>({
 id,dealer_id:DEALER,contract_id:SALE,vehicle_id:VEHICLE,event_type,occurred_at:stamp,...other
})
async function boot(page:Page,mode:'HISTORY'|'EMPTY'|'ERROR'='HISTORY'){
 const state={historyRequests:0,financeRequests:0,crossTenant:false}
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller'},
  dealer:{id:dealer,slug:'demo',display_name:'Demo'},profile:{role:'VENDITORE',username:'seller',display_name:'Venditore',permissions:{}}
 })),{dealer:DEALER})
 await page.route(PROJECT+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname
  if(path==='/rest/v1/vehicles')return send(route,[{id:VEHICLE,dealer_id:DEALER,brand:'BMW',model:'X1',status:'PRENOTATA',asking_price:22000}])
  if(path==='/rest/v1/customers')return send(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Ada',last_name:'Rossi'}])
  if(path==='/rest/v1/contracts')return send(route,[{id:SALE,dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,contract_number:'V-TEST-27',contract_date:'2026-10-20',template_code:'VENDITA',sale_stage:'AGREED',status:'DRAFT',price:22000,deposit:0,reservation_expires_at:'2026-10-27T13:00:00Z',reservation_extension_count:1}])
  if(path==='/rest/v1/vehicle_reservation_events_v270'){
   state.historyRequests++
   state.crossTenant ||= url.searchParams.get('dealer_id')!=='eq.'+DEALER || url.searchParams.get('contract_id')!=='eq.'+SALE
   if(mode==='ERROR')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'temporary_unavailable'})})
   if(mode==='EMPTY')return send(route,[])
   return send(route,[
    ev('fifth','BASELINE','2026-10-20T10:00:00Z'),
    ev('first','CANCELLED','2026-10-20T17:00:00Z',{reason:'Cliente rinuncia'}),
    ev('fourth','RESERVED','2026-10-20T11:00:00Z',{actor_name:'Ada Bianchi',actor_role:'VENDITORE',expires_at_after:'2026-10-27T13:00:00Z'}),
    ev('third','EXTENDED','2026-10-20T15:00:00Z',{actor_name:'Mario Bianchi',actor_role:'ADMIN',reason:'Cliente in attesa',expires_at_before:'2026-10-27T13:00:00Z',expires_at_after:'2026-11-03T13:00:00Z'}),
    ev('second','RELEASED','2026-10-20T16:00:00Z')
   ])
  }
  if(['/rest/v1/vehicle_financials','/rest/v1/vehicle_costs','/rest/v1/invoices'].includes(path)){state.financeRequests++;return send(route,[])}
  if(path.startsWith('/rest/v1/'))return send(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await page.getByTestId('open-sale-360').click()
 return state
}
test('Modifica 27: cronologia audit ordinata, operatore, motivo e mostra tutti',async({page})=>{
 const state=await boot(page)
 const panel=page.getByTestId('reservation-history-panel')
 await expect(panel.getByTestId('reservation-history-event')).toHaveCount(4)
 await expect(panel.getByTestId('reservation-history-event').first()).toContainText('Vendita annullata')
 await expect(panel).toContainText('Mario Bianchi · ADMIN')
 await expect(panel).toContainText('Cliente in attesa')
 await expect(panel).toContainText('→')
 await panel.getByTestId('reservation-history-toggle').click()
 await expect(panel.getByTestId('reservation-history-event')).toHaveCount(5)
 await expect(panel).toContainText('Stato iniziale · non retroattivo')
 expect(state.crossTenant).toBe(false)
 expect(state.financeRequests).toBe(0)
})
test('Modifica 27: aggiornamento dello storico e stato vuoto esplicito',async({page})=>{
 const state=await boot(page,'EMPTY')
 const panel=page.getByTestId('reservation-history-panel')
 await expect(panel).toContainText('Nessun evento registrato')
 await panel.getByTestId('reservation-history-refresh').click()
 await expect.poll(()=>state.historyRequests).toBeGreaterThanOrEqual(2)
 expect(state.crossTenant).toBe(false)
})
test('Modifica 27: errore rete visibile senza mostrare dati di altri tenant',async({page})=>{
 const state=await boot(page,'ERROR')
 await expect(page.getByTestId('reservation-history-panel').getByRole('alert')).toContainText('temporaneamente non disponibile')
 expect(state.crossTenant).toBe(false)
 expect(state.financeRequests).toBe(0)
})
