import {expect,test,type Page} from '@playwright/test'
const HOST='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const cid=(n:number)=>'33333333-3333-3333-3333-'+String(n).padStart(12,'0')
const vid=(n:number)=>'22222222-2222-2222-2222-'+String(n).padStart(12,'0')
const sid=(n:number)=>'44444444-4444-4444-4444-'+String(n).padStart(12,'0')
const iso=(days:number)=>new Date(Date.now()+days*86400000).toISOString()
const send=(route:any,obj:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)})
async function boot(page:Page){
 const state={contractWrites:0,vehicleWrites:0,financeRequests:0,customerWrites:0,interactionWrites:0,customers:[] as any[],interactions:[] as any[]}
 const vehicles=Array.from({length:8},(_,i)=>({id:vid(i+1),dealer_id:DEALER,brand:'Audi',model:'A'+(i+1),status:'PRENOTATA',asking_price:21000}))
 const sales=Array.from({length:8},(_,i)=>({
  id:sid(i+1),dealer_id:DEALER,customer_id:cid(i+1),vehicle_id:vid(i+1),
  contract_number:'V-PREVENT-'+(i+1),template_code:'VENDITA',contract_date:'2026-10-18',
  sale_stage:i===7?'CANCELLED':'AGREED',status:'DRAFT',price:21000,deposit:0,
  reservation_expires_at:iso([1,2,2.5,1.5,2.8,-2,6,1][i]),reservation_extension_count:0
 }))
 state.customers=Array.from({length:8},(_,i)=>({
  id:cid(i+1),dealer_id:DEALER,first_name:'Cliente',last_name:String(i+1),
  phone:'+393331234567',email:'cliente'+(i+1)+'@example.test',
  ...(i===1?{next_step:'Ricontatto prenotazione V-PREVENT-2',next_contact_at:iso(-1)}:{}),
  ...(i===2?{next_step:'Ricontatto prenotazione V-PREVENT-3',next_contact_at:iso(4)}:{}),
  ...(i===4?{next_step:'Ricontatto prenotazione V-PREVENT-5',next_contact_at:iso(1)}:{})
 }))
 state.interactions=[{
  id:'record4',dealer_id:DEALER,customer_id:cid(4),channel:'TELEFONO',
  title:'Prenotazione V-PREVENT-4 · Non risponde · Da richiamare',happened_at:iso(-.25)
 }]
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller'},
  dealer:{id:dealer,slug:'demo',display_name:'Demo'},profile:{role:'VENDITORE',username:'seller',display_name:'Operatore',permissions:{}}
 })),{dealer:DEALER})
 await page.route(HOST+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method()
  if(path==='/rest/v1/vehicles'){if(method!=='GET')state.vehicleWrites++;return send(route,vehicles)}
  if(path==='/rest/v1/customers'){
   if(method==='PATCH'){
    state.customerWrites++
    const customer=state.customers.find(x=>x.id===new URL(req.url()).searchParams.get('id')?.replace('eq.',''))
    if(!customer)return send(route,[])
    Object.assign(customer,req.postDataJSON())
    return send(route,[customer])
   }
   return send(route,state.customers)
  }
  if(path==='/rest/v1/contracts'){if(method!=='GET')state.contractWrites++;return send(route,sales)}
  if(path==='/rest/v1/customer_interactions'){
   if(method==='POST'){state.interactionWrites++;const row={id:'saved'+state.interactionWrites,...req.postDataJSON()};state.interactions.unshift(row);return send(route,[row])}
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
test('Mod31: Oggi separa prenotazioni in scadenza da scadute, conta richiamo oltre scadenza come non gestito',async({page})=>{
 const state=await boot(page)
 const near=page.getByTestId('today-upcoming-reservations')
 await expect(near).toBeVisible()
 await expect(page.getByTestId('today-overdue-callbacks')).toBeVisible()
 await expect(near.getByTestId('today-upcoming-to-do')).toHaveText('4')
 await expect(near.getByTestId('today-upcoming-scheduled')).toHaveText('1')
 await expect(near.getByTestId('today-upcoming-row')).toHaveCount(4)
 await expect(near.getByTestId('today-upcoming-row').first()).toHaveAttribute('data-callback-state','CALLBACK_DUE')
 await expect(near).toContainText('Richiamo oltre la scadenza · anticipa')
 await near.getByTestId('today-upcoming-show-all').click()
 await expect(near.getByTestId('today-upcoming-row')).toHaveCount(5)
 await expect(near).not.toContainText('V-PREVENT-6')
 await expect(near).not.toContainText('V-PREVENT-7')
 await expect(near).not.toContainText('V-PREVENT-8')
 expect(state.financeRequests).toBe(0)
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
})
test('Mod31: dalla coda preventiva apre la vendita corretta e registra contatto CRM senza cambiare auto',async({page})=>{
 const state=await boot(page)
 await page.getByTestId('today-upcoming-row').filter({hasText:'V-PREVENT-1'}).click()
 await expect(page.getByTestId('sale-360').locator('header h2')).toHaveText('V-PREVENT-1')
 const panel=page.getByTestId('reservation-followup-panel')
 await expect(panel).toHaveAttribute('data-booking-state','SOON')
 await expect(panel).toContainText('Previeni la scadenza')
 await panel.getByLabel('Esito ricontatto').selectOption('CONFIRMED')
 await panel.getByLabel('Nota ricontatto').fill('Cliente conferma interesse, richiamare')
 await panel.getByTestId('reservation-followup-save').click()
 await expect.poll(()=>state.interactionWrites).toBe(1)
 await expect(panel.getByRole('status')).toContainText('Contatto registrato')
 await expect(panel.getByTestId('reservation-followup-history')).toContainText('Conferma interesse')
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
 expect(state.financeRequests).toBe(0)
})
test('Mod31: impedisce richiamo oltre termine, prima del termine lo salva e Oggi aggiorna contatori',async({page})=>{
 const state=await boot(page)
 await page.getByTestId('today-upcoming-row').filter({hasText:'V-PREVENT-1'}).click()
 const panel=page.getByTestId('reservation-followup-panel')
 const input=panel.getByLabel('Data richiamo prenotazione')
 const inputValue=(days:number)=>{
  const d=new Date(Date.now()+days*86400000)
  return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)
 }
 await input.fill(inputValue(2))
 await expect(panel.getByTestId('reservation-preventive-deadline-warning')).toBeVisible()
 await expect(panel.getByTestId('reservation-followup-plan')).toBeDisabled()
 expect(state.customerWrites).toBe(0)
 await input.fill(inputValue(.5))
 await expect(panel.getByTestId('reservation-preventive-deadline-warning')).toHaveCount(0)
 await panel.getByTestId('reservation-followup-plan').click()
 await expect.poll(()=>state.customerWrites).toBe(1)
 await expect(panel.getByRole('status')).toContainText('Richiamo salvato')
 await page.getByRole('button',{name:'Chiudi vendita 360'}).click()
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Oggi'}):page.locator('.sidebar nav button').filter({hasText:'Oggi'})).click()
 const near=page.getByTestId('today-upcoming-reservations')
 await expect(near.getByTestId('today-upcoming-to-do')).toHaveText('3')
 await expect(near.getByTestId('today-upcoming-scheduled')).toHaveText('2')
 await near.getByTestId('today-upcoming-show-all').click()
 await expect(near.getByTestId('today-upcoming-row').filter({hasText:'V-PREVENT-1'})).toHaveAttribute('data-callback-state','SCHEDULED')
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
 expect(state.financeRequests).toBe(0)
})


test('Mod32: segna richiamo completato e non lo ripropone come urgente, storico sempre visibile',async({page})=>{
 const state=await boot(page)
 const panelToday=page.getByTestId('today-upcoming-reservations')
 await panelToday.getByTestId('today-upcoming-row').filter({hasText:'V-PREVENT-1'}).click()
 const panel=page.getByTestId('reservation-followup-panel')
 await expect(panel.getByTestId('reservation-followup-finish')).toBeDisabled()
 await panel.getByLabel('Nota chiusura richiamo').fill('Cliente contattato, interesse confermato')
 await panel.getByTestId('reservation-followup-finish').click()
 await expect.poll(()=>state.interactionWrites).toBe(1)
 await expect(panel.getByTestId('reservation-followup-completed')).toBeVisible()
 await expect(panel.getByTestId('reservation-followup-history')).toContainText('Richiamo completato')
 await expect(panel.getByTestId('reservation-followup-finish')).toHaveCount(0)
 await page.getByRole('button',{name:'Chiudi vendita 360'}).click()
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Oggi'}):page.locator('.sidebar nav button').filter({hasText:'Oggi'})).click()
 await expect(panelToday.getByTestId('today-upcoming-to-do')).toHaveText('3')
 await expect(panelToday.getByTestId('today-upcoming-completed')).toHaveText('1')
 await expect(panelToday.getByTestId('today-upcoming-row').filter({hasText:'V-PREVENT-1'})).toHaveCount(0)
 await panelToday.getByTestId('today-upcoming-show-completed').click()
 await expect(panelToday.getByTestId('today-upcoming-completed-row')).toContainText('V-PREVENT-1')
 expect(state.customerWrites).toBe(0)
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
 expect(state.financeRequests).toBe(0)
})
test('Mod32: completa solo il richiamo collegato, cancella promemoria CRM ma permette nuova programmazione',async({page})=>{
 const state=await boot(page)
 const near=page.getByTestId('today-upcoming-reservations')
 await near.getByTestId('today-upcoming-show-all').click()
 await near.getByTestId('today-upcoming-row').filter({hasText:'V-PREVENT-5'}).click()
 const panel=page.getByTestId('reservation-followup-panel')
 await expect(panel).toContainText('Ricontatto prenotazione V-PREVENT-5')
 await panel.getByLabel('Nota chiusura richiamo').fill('Richiamo effettuato come concordato')
 await panel.getByTestId('reservation-followup-finish').click()
 await expect.poll(()=>state.customerWrites).toBe(1)
 expect(state.interactionWrites).toBe(1)
 expect(state.customers[4].next_step).toBeNull()
 expect(state.customers[4].next_contact_at).toBeNull()
 await expect(panel.getByTestId('reservation-followup-completed')).toBeVisible()
 const callback=new Date(Date.now()+1.5*86400000)
 const local=new Date(callback.getTime()-callback.getTimezoneOffset()*60000).toISOString().slice(0,16)
 await panel.getByLabel('Data richiamo prenotazione').fill(local)
 await panel.getByTestId('reservation-followup-plan').click()
 await expect.poll(()=>state.customerWrites).toBe(2)
 await page.getByRole('button',{name:'Chiudi vendita 360'}).click()
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Oggi'}):page.locator('.sidebar nav button').filter({hasText:'Oggi'})).click()
 await near.getByTestId('today-upcoming-show-all').click()
 await expect(near.getByTestId('today-upcoming-row').filter({hasText:'V-PREVENT-5'})).toHaveAttribute('data-callback-state','SCHEDULED')
 await expect(near.getByTestId('today-upcoming-completed')).toHaveCount(0)
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
 expect(state.financeRequests).toBe(0)
})
