import {expect,test,type Page} from '@playwright/test'

const HOST='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const CAR='22222222-2222-2222-2222-222222222222'
const RESERVED='22222222-2222-2222-2222-222222222223'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const SALE='44444444-4444-4444-4444-444444444444'
const send=(route:any,data:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})

async function boot(page:Page,{withPhoto=false,reservation=false,price=0}:{withPhoto?:boolean;reservation?:boolean;price?:number}={}){
 const state={financeRequests:0,vehicleWrites:0,contractWrites:0}
 const vehicles=[{id:CAR,dealer_id:DEALER,brand:'Fiat',model:'500',status:'IN_VENDITA',asking_price:price,plate:'AA111AA'}]
 if(reservation)vehicles.push({id:RESERVED,dealer_id:DEALER,brand:'BMW',model:'X1',status:'PRENOTATA',asking_price:19000,plate:'BB222BB'})
 const media=withPhoto?[{id:'media1',dealer_id:DEALER,vehicle_id:CAR,kind:'PHOTO',object_key:'test/image.jpg'}]:[]
 const contracts=reservation?[{
  id:SALE,dealer_id:DEALER,vehicle_id:RESERVED,customer_id:CUSTOMER,contract_number:'V-URGENT',
  contract_date:new Date().toISOString().slice(0,10),template_code:'VENDITA',
  status:'DRAFT',sale_stage:'AGREED',reservation_expires_at:new Date(Date.now()+3600000).toISOString(),
  price:19000,deposit:0
 }]:[]
 await page.addInitScript(({dealer})=>localStorage.setItem('malu23-v2-session',JSON.stringify({
  access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,
  user:{id:'seller'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},
  profile:{role:'VENDITORE',username:'seller',display_name:'Venditore',permissions:{}}
 })),{dealer:DEALER})
 await page.route(HOST+'/**',async route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method()
  if(path==='/rest/v1/vehicles'){if(method!=='GET')state.vehicleWrites++;return send(route,vehicles)}
  if(path==='/rest/v1/vehicle_media')return send(route,media)
  if(path==='/rest/v1/contracts'){if(method!=='GET')state.contractWrites++;return send(route,contracts)}
  if(path==='/rest/v1/customers')return send(route,reservation?[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi'}]:[])
  if(['/rest/v1/vehicle_financials','/rest/v1/vehicle_costs','/rest/v1/invoices'].includes(path)){state.financeRequests++;return send(route,[])}
  if(path.startsWith('/rest/v1/'))return send(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return state
}

test('Mod54: la prima attività è in evidenza e non ricompare nella coda',async({page})=>{
 const state=await boot(page)
 const hero=page.getByTestId('today-primary-action')
 const queue=page.getByTestId('today-other-priorities')
 await expect(hero).toBeVisible()
 await expect(hero).toContainText('Fiat 500: manca il prezzo')
 await expect(queue.locator('.priority-row')).toHaveCount(1)
 await expect(queue).toContainText('Fiat 500: mancano le foto')
 await expect(queue).not.toContainText('Fiat 500: manca il prezzo')
 const heroTop=await hero.evaluate(e=>e.getBoundingClientRect().top)
 const queueTop=await queue.evaluate(e=>e.getBoundingClientRect().top)
 expect(heroTop).toBeLessThan(queueTop)
 await hero.getByRole('button',{name:'Apri auto'}).click()
 await expect(page.getByRole('heading',{name:'Garage'})).toBeVisible()
 await expect(page.locator('.garage-drawer-v2 h2')).toHaveText('Fiat 500')
 expect(state.financeRequests).toBe(0)
 expect(state.vehicleWrites).toBe(0)
 expect(state.contractWrites).toBe(0)
})

test('Mod54: con una sola priorità non mostra un secondo avviso fittizio',async({page})=>{
 await boot(page,{withPhoto:true})
 const hero=page.getByTestId('today-primary-action')
 await expect(hero).toContainText('Fiat 500: manca il prezzo')
 const queue=page.getByTestId('today-other-priorities')
 await expect(queue.locator('.priority-row')).toHaveCount(0)
 await expect(queue).toContainText('La prima attività è già evidenziata sopra')
 await expect(page.getByTestId('today-reservation-alert')).toHaveCount(0)
})

test('Mod54: avviso prenotazione presente una sola volta nel Centro scadenze e cliccabile',async({page})=>{
 const state=await boot(page,{withPhoto:true,price:18500,reservation:true})
 const alert=page.getByTestId('today-reservation-alert')
 await expect(alert).toHaveCount(1)
 await expect(alert).toContainText('Centro scadenze')
 await expect(alert).toContainText('1 prenotazione da verificare')
 await expect(page.locator('.reservation-alert-banner')).toHaveCount(0)
 await expect(page.getByTestId('today-upcoming-reservations')).toBeVisible()
 await alert.click()
 await expect(page.getByTestId('deadline-page')).toBeVisible()
 expect(state.financeRequests).toBe(0)
 expect(state.contractWrites).toBe(0)
})

test('Mod54: senza prenotazioni urgenti il Centro scadenze rimane disponibile',async({page})=>{
 await boot(page,{withPhoto:true,price:18500})
 await expect(page.getByTestId('today-reservation-alert')).toHaveCount(0)
 await expect(page.getByTestId('today-primary-action')).toBeVisible()
 await page.getByRole('button',{name:'Apri centro scadenze'}).click()
 await expect(page.getByTestId('deadline-page')).toBeVisible()
})
