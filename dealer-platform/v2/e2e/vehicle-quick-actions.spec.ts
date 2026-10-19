import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const MARIO='33333333-3333-3333-3333-333333333333'
const ANNA='44444444-4444-4444-4444-444444444444'

type State={financeRequests:number;interests:any[];workItems:any[];calendarEvents:any[]}
const day=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}

async function boot(page:Page){
 const state:State={
  financeRequests:0,
  interests:[{id:'interest-mario',dealer_id:DEALER,customer_id:MARIO,vehicle_id:VEHICLE,status:'TRATTATIVA',note:'Interessato'}],
  workItems:[],
  calendarEvents:[]
 }
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller-user'},
  dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:'Venditore',username:'seller',role:'VENDITORE',permissions:{}}
 })),{dealer:DEALER})
 await page.route(PROJECT+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method()
  const body=method==='GET'?null:req.postDataJSON() as any
  if(path==='/rest/v1/vehicles')return json(route,[{id:VEHICLE,dealer_id:DEALER,brand:'Volkswagen',model:'Golf',plate:'AB123CD',year:2022,mileage:58000,status:'IN_VENDITA',asking_price:21900}])
  if(path==='/rest/v1/vehicle_media')return json(route,[])
  if(path==='/rest/v1/vehicle_work_items'){
   if(method==='GET')return json(route,state.workItems)
   if(method==='POST'){const row={id:'work-'+(state.workItems.length+1),created_at:new Date().toISOString(),...body};state.workItems.unshift(row);return json(route,[row])}
  }
  if(path==='/rest/v1/customers')return json(route,[
   {id:MARIO,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',status:'CLIENTE'},
   {id:ANNA,dealer_id:DEALER,first_name:'Anna',last_name:'Bianchi',status:'LEAD'}
  ])
  if(path==='/rest/v1/customer_interactions')return json(route,[])
  if(path==='/rest/v1/customer_vehicle_interests'){
   if(method==='GET')return json(route,state.interests)
   if(method==='POST'){const row={id:'interest-'+(state.interests.length+1),created_at:new Date().toISOString(),...body};state.interests.push(row);return json(route,[row])}
  }
  if(path==='/rest/v1/calendar_events'){
   if(method==='GET')return json(route,state.calendarEvents)
   if(method==='POST'){const row={id:'event-'+(state.calendarEvents.length+1),created_at:new Date().toISOString(),...body};state.calendarEvents.push(row);return json(route,[row])}
  }
  if(path==='/rest/v1/contracts')return json(route,[])
  if(['/rest/v1/vehicle_financials','/rest/v1/vehicle_costs','/rest/v1/invoices'].includes(path)){state.financeRequests++;return json(route,[])}
  if(path.startsWith('/rest/v1/'))return json(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return state
}
function json(route:any,data:unknown){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}
async function openVehicle(page:Page){
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Garage'}):page.locator('.sidebar nav button').filter({hasText:'Garage'})).click()
 await expect(page.getByRole('heading',{name:'Garage'})).toBeVisible()
 await page.locator('.vehicle-card-v2').filter({hasText:'Volkswagen Golf'}).click()
 await expect(page.getByTestId('vehicle-360')).toBeVisible()
}

test('azione rapida Appuntamento apre il form con auto e cliente già selezionati',async({page})=>{
 const state=await boot(page)
 await openVehicle(page)
 await page.getByTestId('quick-appointment').click()
 await expect(page.getByRole('heading',{name:'Calendario'})).toBeVisible()
 const form=page.locator('.calendar-create')
 await expect(form).toBeVisible()
 await expect(form.getByRole('combobox').nth(0)).toHaveValue(MARIO)
 await expect(form.getByRole('combobox').nth(1)).toHaveValue(VEHICLE)
 await expect(form.getByPlaceholder('Es. richiamare cliente / consegna / prova auto')).toHaveValue('Appuntamento Volkswagen Golf')
 expect(state.financeRequests).toBe(0)
})

test('azioni rapide collegano cliente e creano pratica documentale senza cambiare pagina',async({page})=>{
 const state=await boot(page)
 await openVehicle(page)
 const drawer=page.getByTestId('vehicle-360')

 await drawer.getByTestId('quick-link-customer').click()
 const customerPanel=drawer.getByTestId('quick-customer-panel')
 await customerPanel.getByLabel('CLIENTE DA COLLEGARE').selectOption(ANNA)
 await customerPanel.getByLabel('NOTA COLLEGAMENTO').fill('Interessata dopo visita showroom')
 await customerPanel.getByRole('button',{name:'Collega cliente'}).click()
 await expect.poll(()=>state.interests.some(i=>i.customer_id===ANNA&&i.vehicle_id===VEHICLE)).toBe(true)
 expect(state.interests.filter(i=>i.customer_id===MARIO&&i.vehicle_id===VEHICLE)).toHaveLength(1)

 await drawer.getByTestId('quick-practice').click()
 const practice=drawer.getByTestId('quick-practice-panel')
 await practice.getByLabel('TITOLO PRATICA').fill('Passaggio di proprietà')
 await practice.getByLabel('SCADENZA PRATICA').fill(day(2))
 await practice.getByLabel('NOTA PRATICA').fill('Documenti cliente da verificare')
 await practice.getByRole('button',{name:'Crea pratica'}).click()
 await expect.poll(()=>state.workItems.some(w=>w.title==='Passaggio di proprietà')).toBe(true)
 const row=state.workItems.find(w=>w.title==='Passaggio di proprietà')
 expect(row).toMatchObject({vehicle_id:VEHICLE,category:'DOCUMENTI',priority:'HIGH',due_date:day(2)})
 expect(state.financeRequests).toBe(0)
})
