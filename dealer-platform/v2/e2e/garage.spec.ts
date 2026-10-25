import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const EXISTING='22222222-2222-2222-2222-222222222222'
const CUSTOMER='55555555-5555-5555-5555-555555555555'
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2f1cAAAAASUVORK5CYII=','base64')

type MockState={financeRequests:number;storageUploads:number;vehicles:any[];media:any[];workItems:any[];customers:any[];interactions:any[];calendarEvents:any[];contracts:any[]}

async function installBackend(page:Page){
  const state:MockState={financeRequests:0,storageUploads:0,vehicles:[{id:EXISTING,dealer_id:DEALER,brand:'Volkswagen',model:'Golf',version:'2.0 TDI',plate:'AB123CD',year:2022,mileage:58000,status:'IN_VENDITA',asking_price:21900,created_at:'2026-09-01T10:00:00Z'}],media:[],workItems:[],customers:[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',phone:'+393331112233',email:'mario@example.test',status:'LEAD',next_step:'Richiamare cliente',next_contact_at:'2026-10-14T10:00:00+02:00',updated_at:'2026-10-14T09:00:00Z'}],interactions:[],calendarEvents:[],contracts:[]}
  await page.route(`${PROJECT}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method(),path=url.pathname
    if(path.endsWith('/functions/v1/gestionalejo-router/auth/resolve-login')){const body=req.postDataJSON() as {identifier?:string;dealer_slug?:string};expect(body.dealer_slug).toBe('autosalone-demo');const seller=String(body.identifier||'').toLowerCase().includes('seller');return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:seller?'seller-user':'admin-user',email:seller?'seller@example.test':'admin@example.test'},dealer:{id:DEALER,slug:'autosalone-demo',display_name:'Autosalone Demo'},profile:{display_name:seller?'Venditore Test':'Admin Test',username:seller?'seller':'admin',role:seller?'VENDITORE':'ADMIN',permissions:{}}})})}
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
        if(method==='POST'){const row={id:`work-${state.workItems.length+1}`,created_at:new Date().toISOString(),...body};state.workItems.unshift(row);return json(route,[row])}
        if(method==='PATCH'){const row=state.workItems.find(w=>w.id===id);if(!row)return json(route,[]);Object.assign(row,body);return json(route,[row])}
      }
      if(table==='customers'){
        if(method==='GET')return json(route,state.customers)
        if(method==='PATCH'){const row=state.customers.find(c=>c.id===id);if(!row)return json(route,[]);Object.assign(row,body);return json(route,[row])}
      }
      if(table==='customer_interactions'){
        if(method==='GET')return json(route,state.interactions)
        if(method==='POST'){const row={id:`interaction-${state.interactions.length+1}`,created_at:new Date().toISOString(),...body};state.interactions.unshift(row);return json(route,[row])}
      }
      if(table==='calendar_events'){
        if(method==='GET')return json(route,state.calendarEvents)
        if(method==='POST'){const row={id:`calendar-${state.calendarEvents.length+1}`,created_at:new Date().toISOString(),...body};state.calendarEvents.push(row);return json(route,[row])}
        if(method==='PATCH'){const row=state.calendarEvents.find(e=>e.id===id);if(!row)return json(route,[]);Object.assign(row,body);return json(route,[row])}
      }
      if(table==='contracts'){
        if(method==='GET')return json(route,state.contracts)
        if(method==='POST'){const row={id:`contract-${state.contracts.length+1}`,created_at:new Date().toISOString(),...body};state.contracts.unshift(row);return json(route,[row])}
        if(method==='PATCH'){const row=state.contracts.find(c=>c.id===id);if(!row)return json(route,[]);Object.assign(row,body);return json(route,[row])}
      }
      if(table==='customer_vehicle_interests'||table==='vehicle_financials'||table==='vehicle_costs'||table==='invoices')return json(route,[])
      return json(route,[])
    }
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
  })
  return state
}

function json(route:any,data:unknown){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}
async function login(page:Page,identifier='admin'){await page.goto('/');await page.getByLabel('CODICE CONCESSIONARIA').fill('autosalone-demo');await page.getByLabel('UTENTE O EMAIL').fill(identifier);await page.getByLabel('PASSWORD').fill('demo');await page.getByRole('button',{name:'Entra',exact:true}).click();await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible();await expect(page.locator('.brand')).toContainText('Autosalone Demo')}
async function openView(page:Page,label:'Garage'|'Clienti'|'Calendario'|'Vendite'){const mobile=(page.viewportSize()?.width||1200)<=760;await (mobile?page.locator('.mobile-nav button').filter({hasText:label}):page.locator('.sidebar nav button').filter({hasText:label})).click();await expect(page.getByRole('heading',{name:label})).toBeVisible()}

test('VENDITORE loads Garage without requesting finance tables',async({page})=>{const state=await installBackend(page);await login(page,'seller');await openView(page,'Garage');await expect(page.getByTestId('new-vehicle')).toBeVisible();expect(state.financeRequests).toBe(0)})

test('Garage creates, edits and completes a photo-first vehicle flow',async({page})=>{const state=await installBackend(page);await login(page);await openView(page,'Garage');await page.getByTestId('new-vehicle').click();await page.getByTestId('vehicle-brand').fill('Peugeot');await page.getByTestId('vehicle-model').fill('308');await page.getByTestId('vehicle-save').click();await expect(page.locator('.garage-drawer-v2 h2')).toHaveText('Peugeot 308');await page.getByLabel('Modifica auto').click();await page.getByLabel('PREZZO CLIENTE').fill('18900');await page.getByTestId('vehicle-save').click();await expect(page.locator('.drawer-grid')).toContainText('18.900');await page.getByTestId('vehicle-photo-input').setInputFiles({name:'iphone-camera.jpg',mimeType:'image/jpeg',buffer:Buffer.from('fake-jpeg')});await expect(page.locator('.drawer-grid')).toContainText('1/6');await expect(page.getByText('Copertina',{exact:true})).toBeVisible();expect(state.storageUploads).toBe(1);await page.getByRole('button',{name:/Lavoro/}).click();await page.getByPlaceholder('es. Tagliando completo').fill('Tagliando completo');await page.getByRole('button',{name:'Aggiungi lavoro'}).click();await expect(page.getByText('Tagliando completo')).toBeVisible();await page.getByRole('button',{name:'Fatto'}).click();await expect(page.getByText('Tagliando completo')).toHaveCount(0);expect(state.vehicles.some(v=>v.brand==='Peugeot'&&Number(v.asking_price)===18900)).toBe(true)})

test('OGGI routes overdue customer work and Clienti persists next action plus TELEFONO log',async({page})=>{const state=await installBackend(page);await login(page);await expect(page.getByText('Mario Rossi: Richiamare cliente')).toBeVisible();await page.getByRole('button',{name:/Mario Rossi: Richiamare cliente/}).click();await expect(page.getByRole('heading',{name:'Clienti'})).toBeVisible();await page.locator('.client-main').filter({hasText:'Mario Rossi'}).click();const next=page.getByPlaceholder('Es. richiamare per proposta Golf');await next.fill('Inviare proposta Golf');await page.locator('.next-panel input[type="datetime-local"]').fill('2026-10-16T11:30');await page.locator('.next-panel').getByRole('button',{name:'Salva',exact:true}).click();await expect.poll(()=>state.customers[0].next_step).toBe('Inviare proposta Golf');await page.getByPlaceholder('Es. interessato, richiamare venerdì').fill('Cliente interessato, chiamata completata');await page.getByRole('button',{name:'Chiamata',exact:true}).click();await expect.poll(()=>state.interactions.length).toBe(1);expect(state.interactions[0].channel).toBe('TELEFONO');expect(state.interactions[0].title).toContain('Cliente interessato')})

test('Calendario creates a valid linked appointment and closes it',async({page})=>{const state=await installBackend(page);await login(page);await openView(page,'Calendario');await page.getByRole('button',{name:'Nuovo appuntamento'}).click();await page.getByPlaceholder('Es. richiamare cliente / consegna / prova auto').fill('Prova Volkswagen Golf');await page.locator('.calendar-create input[type="datetime-local"]').fill('2026-10-16T15:00');await page.locator('.calendar-create select').nth(0).selectOption(CUSTOMER);await page.locator('.calendar-create select').nth(1).selectOption(EXISTING);await page.getByPlaceholder('Dettaglio utile').fill('Confermare 30 minuti prima');await page.getByRole('button',{name:'Salva appuntamento'}).click();await expect(page.getByText('Prova Volkswagen Golf')).toBeVisible();expect(state.calendarEvents).toHaveLength(1);expect(state.calendarEvents[0].customer_id).toBe(CUSTOMER);expect(state.calendarEvents[0].vehicle_id).toBe(EXISTING);expect(state.calendarEvents[0].event_type).toBe('APPOINTMENT');expect(state.calendarEvents[0].priority).toBe('NORMAL');await page.getByTitle('Segna completato').click();await expect.poll(()=>state.calendarEvents[0].status).toBe('DONE');await expect(page.getByText('Prova Volkswagen Golf')).toHaveCount(0)})

test('VENDITORE opens a sale and prepares delivery without finance access',async({page})=>{const state=await installBackend(page);await login(page,'seller');await openView(page,'Vendite');expect(state.financeRequests).toBe(0);await page.getByTestId('new-sale').click();await page.getByLabel('CLIENTE VENDITA').selectOption(CUSTOMER);await page.getByLabel('AUTO VENDITA').selectOption(EXISTING);await expect(page.getByLabel('PREZZO VENDITA')).toHaveValue('21900');await page.getByLabel('CAPARRA VENDITA').fill('2000');await page.getByLabel('CONSEGNA PREVISTA').fill('2026-10-20T15:00');await page.getByTestId('sale-save').click();await expect.poll(()=>state.contracts.length).toBe(1);expect(state.contracts[0].dealer_id).toBe(DEALER);expect(state.contracts[0].template_code).toBe('VENDITA');expect(state.contracts[0].sale_stage).toBe('OPEN');expect(state.contracts[0].contract_number).toMatch(/^V-/);await expect(page.getByTestId('sale-card')).toContainText('Volkswagen Golf');await page.getByRole('button',{name:'Avanza a Accordo'}).click();await expect.poll(()=>state.contracts[0].sale_stage).toBe('AGREED');await page.getByRole('button',{name:'Prepara checklist'}).click();await expect.poll(()=>state.workItems.filter(w=>w.category==='CONSEGNA').length).toBe(7);expect(state.financeRequests).toBe(0)})


for(const width of [320,375]){
 test(`Visual refresh: tutte le sei sezioni mobili sono raggiungibili su ${width}px, senza seconda riga`,async({page})=>{
  await page.setViewportSize({width,height:740})
  const state=await installBackend(page)
  await login(page)
  const buttons=page.locator('.mobile-nav button')
  await expect(buttons).toHaveCount(6)
  const rects=await buttons.evaluateAll(items=>items.map(item=>{
   const r=item.getBoundingClientRect()
   return {left:r.left,top:r.top,right:r.right,width:r.width,height:r.height}
  }))
  expect(rects.every(r=>Math.abs(r.top-rects[0].top)<2)).toBe(true)
  expect(rects.every(r=>r.width>=44&&r.height>=48&&r.right<=width+1)).toBe(true)
  await expect(page.locator('.mobile-nav button[aria-current="page"]')).toHaveCount(1)
  await expect(page.locator('.mobile-nav button[aria-current="page"]')).toContainText('Oggi')
  await expect(page.locator('.mobile-view-label')).toContainText('Oggi')
  await page.getByRole('button',{name:'Apri ricerca globale'}).click()
  await expect(page.getByRole('dialog',{name:'Ricerca globale'})).toBeVisible()
  await page.getByRole('button',{name:'Chiudi ricerca'}).click()
  await page.locator('.mobile-nav button').filter({hasText:'Altro'}).click()
  await expect(page.getByRole('heading',{name:'Altro'})).toBeVisible()
  await expect(page.locator('.mobile-nav button[aria-current="page"]')).toContainText('Altro')
  await page.locator('.mobile-nav button').filter({hasText:'Garage'}).click()
  await expect(page.getByRole('heading',{name:'Garage'})).toBeVisible()
  const create=page.getByTestId('new-vehicle')
  await expect(create).toBeVisible()
  await expect(create).toContainText('Nuova auto')
  const metrics=await create.evaluate(el=>{const r=el.getBoundingClientRect();return {height:r.height,fontSize:parseFloat(getComputedStyle(el).fontSize)}})
  expect(metrics.height).toBeGreaterThanOrEqual(44)
  expect(metrics.fontSize).toBeGreaterThanOrEqual(11)
  expect(state.financeRequests).toBe(0)
 })
}

test('Visual refresh: menu desktop e moduli secondari mantengono la voce attiva',async({page})=>{
 await page.setViewportSize({width:1280,height:800})
 await installBackend(page)
 await login(page)
 await expect(page.locator('.sidebar nav button')).toHaveCount(6)
 await expect(page.locator('.sidebar nav button[aria-current="page"]')).toContainText('Oggi')
 await expect(page.locator('.mobile-nav')).toBeHidden()
 await page.locator('.sidebar nav button').filter({hasText:'Vendite'}).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 await expect(page.locator('.sidebar nav button[aria-current="page"]')).toContainText('Vendite')
 await page.locator('.sidebar nav button').filter({hasText:'Altro'}).click()
 await expect(page.getByRole('heading',{name:'Altro'})).toBeVisible()
 await page.getByRole('button',{name:'Apri centro scadenze'}).click()
 await expect(page.locator('.sidebar nav button[aria-current="page"]')).toContainText('Altro')
})
