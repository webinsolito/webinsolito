import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const EXISTING='22222222-2222-2222-2222-222222222222'
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2f1cAAAAASUVORK5CYII=','base64')

type MockState={financeRequests:number;storageUploads:number;vehicles:any[];media:any[];workItems:any[]}

async function installBackend(page:Page){
  const state:MockState={financeRequests:0,storageUploads:0,vehicles:[{id:EXISTING,dealer_id:DEALER,brand:'Volkswagen',model:'Golf',version:'2.0 TDI',plate:'AB123CD',year:2022,mileage:58000,status:'IN_VENDITA',asking_price:21900,created_at:'2026-09-01T10:00:00Z'}],media:[],workItems:[]}
  await page.route(`${PROJECT}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method(),path=url.pathname
    if(path.endsWith('/functions/v1/gestionalejo-router/auth/resolve-login')){const body=req.postDataJSON() as {identifier?:string};const seller=String(body.identifier||'').toLowerCase().includes('seller');return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:seller?'seller-user':'admin-user',email:seller?'seller@example.test':'admin@example.test'},dealer:{id:DEALER,slug:'malu23',display_name:'MALÙ23 CARS'},profile:{display_name:seller?'Venditore Test':'Admin Test',username:seller?'seller':'admin',role:seller?'VENDITORE':'ADMIN',permissions:{}}})})}
    if(path.startsWith('/storage/v1/object/')){if(method==='POST'){state.storageUploads++;return route.fulfill({status:200,contentType:'application/json',body:'{}'})}if(method==='DELETE')return route.fulfill({status:200,contentType:'application/json',body:'{}'});if(method==='GET')return route.fulfill({status:200,contentType:'image/png',body:PNG})}
    if(path.startsWith('/rest/v1/')){
      const table=path.slice('/rest/v1/'.length)
      if(['vehicle_financials','vehicle_costs','invoices'].includes(table))state.financeRequests++
      const id=url.searchParams.get('id')?.replace(/^eq\./,'')
      const vehicleId=url.searchParams.get('vehicle_id')?.replace(/^eq\./,'')
      const body=method==='GET'?null:req.postDataJSON() as any
      if(table==='vehicles'){
        if(method==='GET')return json(route,state.vehicles)
        if(method==='POST'){const row={id:'33333333-3333-3333-3333-333333333333',created_at:new Date().toISOString(),...body};state.vehicles.unshift(row);return json(route,[row])}
        if(method==='PATCH'){const row=state.vehicles.find(v=>v.id===id);if(!row)return json(route,[]);Object.assign(row,body);return json(route,[row])}
      }
      if(table==='vehicle_media'){
        if(method==='GET')return json(route,state.media)
        if(method==='POST'){state.media.push(body);return json(route,[body])}
        if(method==='PATCH'){const rows=state.media.filter(m=>id?m.id===id:vehicleId?m.vehicle_id===vehicleId:true);rows.forEach(r=>Object.assign(r,body));return json(route,rows)}
        if(method==='DELETE'){const found=state.media.filter(m=>m.id===id);state.media=state.media.filter(m=>m.id!==id);return json(route,found)}
      }
      if(table==='vehicle_work_items'){
        if(method==='GET')return json(route,state.workItems)
        if(method==='POST'){const row={id:'44444444-4444-4444-4444-444444444444',created_at:new Date().toISOString(),...body};state.workItems.unshift(row);return json(route,[row])}
        if(method==='PATCH'){const row=state.workItems.find(w=>w.id===id);if(!row)return json(route,[]);Object.assign(row,body);return json(route,[row])}
      }
      if(table==='customers'||table==='customer_interactions'||table==='customer_vehicle_interests'||table==='calendar_events'||table==='contracts'||table==='vehicle_financials'||table==='vehicle_costs'||table==='invoices')return json(route,[])
      return json(route,[])
    }
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
  })
  return state
}

function json(route:any,data:unknown){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}
async function login(page:Page,identifier='admin'){await page.goto('/');await page.getByLabel('UTENTE O EMAIL').fill(identifier);await page.getByLabel('PASSWORD').fill('test-password');await page.getByRole('button',{name:'Entra in MALÙ23'}).click();await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()}
async function openGarage(page:Page){const mobile=(page.viewportSize()?.width||1200)<=760;await (mobile?page.locator('.mobile-nav button').filter({hasText:'Garage'}):page.locator('.sidebar nav button').filter({hasText:'Garage'})).click();await expect(page.getByRole('heading',{name:'Garage'})).toBeVisible()}

test('VENDITORE loads Garage without requesting finance tables',async({page})=>{const state=await installBackend(page);await login(page,'seller');await openGarage(page);await expect(page.getByTestId('new-vehicle')).toBeVisible();expect(state.financeRequests).toBe(0)})

test('Garage creates, edits and completes a photo-first vehicle flow',async({page})=>{const state=await installBackend(page);await login(page);await openGarage(page);await page.getByTestId('new-vehicle').click();await page.getByTestId('vehicle-brand').fill('Peugeot');await page.getByTestId('vehicle-model').fill('308');await page.getByTestId('vehicle-save').click();await expect(page.locator('.garage-drawer-v2 h2')).toHaveText('Peugeot 308');await page.getByLabel('Modifica auto').click();await page.getByLabel('PREZZO CLIENTE').fill('18900');await page.getByTestId('vehicle-save').click();await expect(page.locator('.drawer-grid')).toContainText('18.900');await page.getByTestId('vehicle-photo-input').setInputFiles({name:'iphone-camera.jpg',mimeType:'image/jpeg',buffer:Buffer.from('fake-jpeg')});await expect(page.locator('.drawer-grid')).toContainText('1/6');await expect(page.getByText('Copertina',{exact:true})).toBeVisible();expect(state.storageUploads).toBe(1);await page.getByRole('button',{name:/Lavoro/}).click();await page.getByPlaceholder('es. Tagliando completo').fill('Tagliando completo');await page.getByRole('button',{name:'Aggiungi lavoro'}).click();await expect(page.getByText('Tagliando completo')).toBeVisible();await page.getByRole('button',{name:'Fatto'}).click();await expect(page.getByText('Tagliando completo')).toHaveCount(0);expect(state.vehicles.some(v=>v.brand==='Peugeot'&&Number(v.asking_price)===18900)).toBe(true)})
