import {expect,test,type Page} from '@playwright/test'
const HOST='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const CUSTOMER_BASE='33333333-3333-3333-3333-3333333333'
const VEHICLE_BASE='22222222-2222-2222-2222-2222222222'
const CONTRACT_BASE='44444444-4444-4444-4444-4444444444'
const uid=(prefix:string,i:number)=>prefix+String(i).padStart(2,'0')
const iso=(days:number)=>new Date(Date.now()+days*86400000).toISOString()
const send=(r:any,body:unknown)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
async function boot(page:Page,mode:'ACTIVE'|'NO_OVERDUE'='ACTIVE'){
 const state={contractWrites:0,vehicleWrites:0,financeRequests:0,customerWrites:0,interactions:[] as any[],customers:[] as any[]}
 const cars=Array.from({length:8},(_,i)=>({id:uid(VEHICLE_BASE,i+1),dealer_id:DEALER,brand:'BMW',model:'X'+(i+1),plate:'BS00'+(i+1)+'TT',status:'PRENOTATA',asking_price:22000}))
 state.customers=Array.from({length:8},(_,i)=>({
  id:uid(CUSTOMER_BASE,i+1),dealer_id:DEALER,first_name:'Cliente',last_name:String(i+1),
  phone:'+393331234567',email:'cliente'+(i+1)+'@example.test',
  ...(i===0?{next_step:'Ricontatto prenotazione V-TODAY-1',next_contact_at:iso(-1)}:{}),
  ...(i===3?{next_step:'Ricontatto prenotazione V-TODAY-4',next_contact_at:iso(3)}:{})
 }))
 let sales=Array.from({length:8},(_,i)=>({
  id:uid(CONTRACT_BASE,i+1),dealer_id:DEALER,vehicle_id:cars[i].id,customer_id:state.customers[i].id,
  contract_number:'V-TODAY-'+(i+1),contract_date:'2026-10-10',template_code:'VENDITA',
  sale_stage:i===6?'CANCELLED':'AGREED',status:'DRAFT',price:22000,deposit:0,
  reservation_expires_at:mode==='NO_OVERDUE'?iso(9):i===7?iso(9):iso(-(i+1)),
  reservation_extension_count:0
 }))
 state.interactions=[{id:'log1',dealer_id:DEALER,customer_id:state.customers[2].id,
  title:'Prenotazione V-TODAY-3 · Non risponde · Riprovare domani',happened_at:iso(-.3),channel:'TELEFONO'}]
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,
  user:{id:'seller'},dealer:{id:dealer,slug:'demo',display_name:'Demo'},
  profile:{role:'VENDITORE',display_name:'Venditore',username:'seller',permissions:{}}
 })),{dealer:DEALER})
 await page.route(HOST+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method()
  if(path==='/rest/v1/vehicles'){if(method!=='GET')state.vehicleWrites++;return send(route,cars)}
  if(path==='/rest/v1/customers'){
   if(method==='PATCH'){state.customerWrites++;const patch=req.postDataJSON() as any;const id=new URL(req.url()).searchParams.get('id')?.replace('eq.','');const customer=state.customers.find(x=>x.id===id);if(!customer)return send(route,[]);Object.assign(customer,patch);return send(route,[customer])}
   return send(route,state.customers)
  }
  if(path==='/rest/v1/contracts'){if(method!=='GET')state.contractWrites++;return send(route,sales)}
  if(path==='/rest/v1/customer_interactions'){
   if(method==='POST'){const body=req.postDataJSON() as any;state.interactions.unshift({id:'log'+(state.interactions.length+1),...body});return send(route,[state.interactions[0]])}
   return send(route,state.interactions)
  }
  if(['/rest/v1/vehicle_financials','/rest/v1/vehicle_costs','/rest/v1/invoices'].includes(path)){state.financeRequests++;return send(route,[])}
  if(path.startsWith('/rest/v1/'))return send(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return state
}
async function go(page:Page,label:string){
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:label}):page.locator('.sidebar nav button').filter({hasText:label})).click()
}
test('V30 Oggi: priorità corrette, conteggi, cronologia, lista espandibile',async({page})=>{
 const state=await boot(page)
 const panel=page.getByTestId('today-overdue-callbacks')
 await expect(panel).toBeVisible()
 await expect(page.getByTestId('today-callback-to-do')).toHaveText('5')
 await expect(page.getByTestId('today-callback-scheduled')).toHaveText('1')
 await expect(panel.getByTestId('today-callback-row')).toHaveCount(5)
 await expect(panel.getByTestId('today-callback-row').first()).toHaveAttribute('data-callback-state','CALLBACK_DUE')
 await expect(panel).toContainText('Contatto registrato · pianifica richiamo')
 await panel.getByTestId('today-callback-show-all').click()
 await expect(panel.getByTestId('today-callback-row')).toHaveCount(6)
 await expect(panel.getByTestId('today-callback-row').last()).toHaveAttribute('data-callback-state','SCHEDULED')
 await expect(panel.getByTestId('today-callback-row').last()).toContainText('Richiamo programmato')
 expect(state.financeRequests).toBe(0)
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
})
test('V30 Oggi: pulsante apre la vendita esatta con guida ricontatto',async({page})=>{
 const state=await boot(page)
 await page.getByTestId('today-callback-row').first().click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 await expect(page.getByTestId('sale-360')).toBeVisible()
 await expect(page.getByTestId('sale-360').locator('header h2')).toHaveText('V-TODAY-1')
 await expect(page.getByTestId('reservation-followup-panel')).toContainText('Auto ancora prenotata')
 expect(state.financeRequests).toBe(0)
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
})
test('V30: programmare richiamo da vendita aggiorna la coda Oggi senza liberare auto',async({page})=>{
 const state=await boot(page)
 const exact=page.getByTestId('today-callback-row').filter({hasText:'V-TODAY-2'})
 await exact.click()
 const panel=page.getByTestId('reservation-followup-panel')
 const local=new Date(Date.now()+2*86400000)
 const callback=new Date(local.getTime()-local.getTimezoneOffset()*60000).toISOString().slice(0,16)
 await panel.getByLabel('Data richiamo prenotazione').fill(callback)
 await panel.getByTestId('reservation-followup-plan').click()
 await expect.poll(()=>state.customerWrites).toBe(1)
 await expect(panel.getByRole('status')).toContainText('Richiamo salvato')
 await page.getByRole('button',{name:'Chiudi vendita 360'}).click()
 await go(page,'Oggi')
 const row=page.getByTestId('today-callback-row').filter({hasText:'V-TODAY-2'})
 await expect(row).toHaveAttribute('data-callback-state','SCHEDULED')
 await expect(page.getByTestId('today-callback-to-do')).toHaveText('4')
 await expect(page.getByTestId('today-callback-scheduled')).toHaveText('2')
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
 expect(state.financeRequests).toBe(0)
})
test('V30: prenotazioni non scadute, consegnate o annullate non creano falsi richiami',async({page})=>{
 const state=await boot(page,'NO_OVERDUE')
 await expect(page.getByTestId('today-overdue-callbacks')).toHaveCount(0)
 expect(state.financeRequests).toBe(0)
})
