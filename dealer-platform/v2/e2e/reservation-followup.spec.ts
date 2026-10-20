import {expect,test,type Page} from '@playwright/test'
const HOST='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CONTRACT='44444444-4444-4444-4444-444444444444'
const iso=(days:number)=>new Date(Date.now()+days*86400000).toISOString()
const send=(route:any,obj:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)})
async function setup(page:Page,{role='VENDITORE',overdue=true,existingAction=false}:{role?:string;overdue?:boolean;existingAction?:boolean}={}){
 const state={interactionWrites:0,customerWrites:0,contractWrites:0,vehicleWrites:0,financeRequests:0,interactions:[] as any[],customers:[{
  id:CUSTOMER,dealer_id:DEALER,first_name:'Ada',last_name:'Rossi',phone:'+393331234567',email:'ada@example.test',
  ...(existingAction?{next_step:'Richiamare per preventivo nuovo',next_contact_at:iso(4)}:{})
 }]}
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'agent'},
  dealer:{id:dealer,slug:'demo',display_name:'Demo'},profile:{role,display_name:'Operatore Test',username:'agent',permissions:{}}
 })),{dealer:DEALER,role})
 await page.route(HOST+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method()
  if(path==='/rest/v1/vehicles'){
   if(method!=='GET')state.vehicleWrites++
   return send(route,[{id:VEHICLE,dealer_id:DEALER,brand:'BMW',model:'X1',status:'PRENOTATA',asking_price:23000}])
  }
  if(path==='/rest/v1/customers'){
   if(method==='PATCH'){
    state.customerWrites++
    const patch=req.postDataJSON() as any
    Object.assign(state.customers[0],patch)
    return send(route,[state.customers[0]])
   }
   return send(route,state.customers)
  }
  if(path==='/rest/v1/customer_interactions'){
   if(method==='POST'){
    state.interactionWrites++
    const body=req.postDataJSON() as any
    const row={id:'contact-'+state.interactionWrites,...body}
    state.interactions.unshift(row)
    return send(route,[row])
   }
   return send(route,state.interactions)
  }
  if(path==='/rest/v1/contracts'){
   if(method!=='GET')state.contractWrites++
   return send(route,[{
    id:CONTRACT,dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,
    contract_number:'V-EXPIRED-29',contract_date:'2026-10-01',template_code:'VENDITA',
    sale_stage:'AGREED',status:'DRAFT',price:23000,deposit:0,
    reservation_expires_at:overdue?iso(-2):iso(9),reservation_extension_count:0
   }])
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
 await expect(page.getByTestId('sale-360')).toBeVisible()
 return state
}
test('V29 prenotazione scaduta: ricontatto persistente in CRM senza liberare auto',async({page})=>{
 const state=await setup(page)
 const panel=page.getByTestId('reservation-followup-panel')
 await expect(panel).toContainText('Auto ancora prenotata')
 await expect(panel.getByTestId('reservation-followup-call')).toHaveAttribute('href','tel:+393331234567')
 await panel.getByLabel('Esito ricontatto').selectOption('WITHDRAWAL')
 await panel.getByLabel('Nota ricontatto').fill('Cliente valuta la rinuncia')
 await panel.getByTestId('reservation-followup-save').click()
 await expect.poll(()=>state.interactionWrites).toBe(1)
 await expect(panel.getByRole('status')).toContainText('Contatto registrato')
 await expect(panel.getByTestId('reservation-followup-history')).toContainText('Rinuncia da verificare')
 expect(state.interactions[0].title).toContain('V-EXPIRED-29')
 expect(state.interactions[0].title).toContain('Cliente valuta la rinuncia')
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
 expect(state.financeRequests).toBe(0)
})
test('V29 richiamo: non sovrascrive una azione CRM esistente senza conferma',async({page})=>{
 const state=await setup(page,{existingAction:true})
 const panel=page.getByTestId('reservation-followup-panel')
 const local=new Date(Date.now()+3*86400000);const v=new Date(local.getTime()-local.getTimezoneOffset()*60000).toISOString().slice(0,16)
 await panel.getByLabel('Data richiamo prenotazione').fill(v)
 await expect(panel.getByTestId('reservation-followup-plan')).toBeDisabled()
 await expect(panel).toContainText('Richiamare per preventivo nuovo')
 await panel.getByText('Sostituisci la prossima azione CRM esistente').check()
 await panel.getByTestId('reservation-followup-plan').click()
 await expect.poll(()=>state.customerWrites).toBe(1)
 expect(state.customers[0].next_step).toBe('Ricontatto prenotazione V-EXPIRED-29')
 expect(state.customers[0].next_contact_at).toBeTruthy()
 expect(state.interactionWrites).toBe(0)
 expect(state.contractWrites).toBe(0)
 expect(state.vehicleWrites).toBe(0)
})
test('V29 limite permessi: ruolo senza scrittura CRM vede solo guida e contatti',async({page})=>{
 const state=await setup(page,{role:'OPERATORE'})
 const panel=page.getByTestId('reservation-followup-panel')
 await expect(panel).toContainText('serve il permesso di scrittura CRM')
 await expect(panel.getByTestId('reservation-followup-save')).toHaveCount(0)
 await expect(panel.getByTestId('reservation-followup-plan')).toHaveCount(0)
 expect(state.customerWrites).toBe(0)
 expect(state.interactionWrites).toBe(0)
})
test('V29 nessuna procedura di ricontatto per auto prenotata non scaduta',async({page})=>{
 await setup(page,{overdue:false})
 await expect(page.getByTestId('reservation-followup-panel')).toHaveCount(0)
 await expect(page.getByTestId('reservation-deadline-panel')).toBeVisible()
})
