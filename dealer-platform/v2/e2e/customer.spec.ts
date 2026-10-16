import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'

type State={financeRequests:number;customers:any[];interactions:any[];interests:any[];calendarEvents:any[];vehicles:any[]}

async function installBackend(page:Page){
  const state:State={financeRequests:0,customers:[],interactions:[],interests:[],calendarEvents:[],vehicles:[{id:VEHICLE,dealer_id:DEALER,brand:'Volkswagen',model:'Golf',version:'2.0 TDI',plate:'AB123CD',year:2022,mileage:58000,status:'IN_VENDITA',asking_price:21900,created_at:'2026-09-01T10:00:00Z'}]}
  await page.route(`${PROJECT}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method(),path=url.pathname
    if(path.endsWith('/functions/v1/gestionalejo-router/auth/resolve-login')){
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'seller-user',email:'seller@example.test'},dealer:{id:DEALER,slug:'malu23',display_name:'MALÙ23 CARS'},profile:{display_name:'Venditore Test',username:'seller',role:'VENDITORE',permissions:{}}})})
    }
    if(path.startsWith('/rest/v1/')){
      const table=path.slice('/rest/v1/'.length)
      if(['vehicle_financials','vehicle_costs','invoices'].includes(table))state.financeRequests++
      const id=url.searchParams.get('id')?.replace(/^eq\./,'')
      const body=method==='GET'?null:req.postDataJSON() as any
      if(table==='vehicles'&&method==='GET')return json(route,state.vehicles)
      if(table==='customers'){
        if(method==='GET')return json(route,state.customers)
        if(method==='POST'){
          const row={id:'55555555-5555-5555-5555-555555555555',created_at:new Date().toISOString(),...body}
          state.customers.unshift(row)
          return json(route,[row])
        }
        if(method==='PATCH'){
          const row=state.customers.find(c=>c.id===id)
          if(!row)return json(route,[])
          Object.assign(row,body)
          return json(route,[row])
        }
      }
      if(table==='customer_interactions'){
        if(method==='GET')return json(route,state.interactions)
        if(method==='POST'){
          const row={id:`interaction-${state.interactions.length+1}`,created_at:new Date().toISOString(),...body}
          state.interactions.unshift(row)
          return json(route,[row])
        }
      }
      if(table==='customer_vehicle_interests'){
        if(method==='GET')return json(route,state.interests)
        if(method==='POST'){
          const row={id:`interest-${state.interests.length+1}`,created_at:new Date().toISOString(),...body}
          state.interests.push(row)
          return json(route,[row])
        }
        if(method==='PATCH'){
          const row=state.interests.find(i=>i.id===id)
          if(!row)return json(route,[])
          Object.assign(row,body)
          return json(route,[row])
        }
      }
      if(table==='calendar_events'){
        if(method==='GET')return json(route,state.calendarEvents)
      }
      if(table==='vehicle_media'||table==='vehicle_work_items'||table==='contracts')return json(route,[])
      if(table==='vehicle_financials'||table==='vehicle_costs'||table==='invoices')return json(route,[])
      return json(route,[])
    }
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
  })
  return state
}

function json(route:any,data:unknown){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}

async function login(page:Page){
  await page.goto('/')
  await page.getByLabel('UTENTE O EMAIL').fill('seller')
  await page.getByLabel('PASSWORD').fill('test-password')
  await page.getByRole('button',{name:'Entra in MALÙ23'}).click()
  await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
}

async function openClients(page:Page){
  const mobile=(page.viewportSize()?.width||1200)<=760
  await (mobile?page.locator('.mobile-nav button').filter({hasText:'Clienti'}):page.locator('.sidebar nav button').filter({hasText:'Clienti'})).click()
  await expect(page.getByRole('heading',{name:'Clienti'})).toBeVisible()
}

test('Cliente completo: crea, modifica, collega auto, tratta offerta e registra contatto',async({page})=>{
  const state=await installBackend(page)
  await login(page)
  await openClients(page)
  expect(state.financeRequests).toBe(0)

  await page.getByTestId('new-customer').click()
  await page.getByLabel('NOME').fill('Luca')
  await page.getByLabel('COGNOME').fill('Bianchi')
  await page.getByLabel('TELEFONO').fill('3331234567')
  await page.getByLabel('EMAIL').fill('luca.bianchi@example.test')
  await page.getByLabel('CODICE FISCALE').fill('bnclcu90a01b157x')
  await page.getByLabel('CONTATTO PREFERITO').selectOption('WHATSAPP')
  await page.getByLabel('PROVENIENZA').fill('AutoScout')
  await page.getByLabel('NOTE CLIENTE').fill('Cerca un diesel automatico')
  await page.getByTestId('customer-save').click()

  await expect(page.getByTestId('customer-detail')).toContainText('Luca Bianchi')
  expect(state.customers).toHaveLength(1)
  expect(state.customers[0].fiscal_code).toBe('BNCLCU90A01B157X')
  expect(state.customers[0].preferred_contact).toBe('WHATSAPP')

  await page.getByTitle('Modifica cliente').click()
  await page.getByLabel('STATO CLIENTE').selectOption('CLIENTE')
  await page.getByLabel('NOTE CLIENTE').fill('Vuole Golf, valuta permuta')
  await page.getByTestId('customer-save').click()
  await expect.poll(()=>state.customers[0].status).toBe('CLIENTE')
  expect(state.customers[0].notes).toContain('permuta')

  await page.getByTestId('add-interest').click()
  await page.getByLabel('AUTO INTERESSATA').selectOption(VEHICLE)
  await page.getByLabel('FASE INTERESSE').selectOption('OFFERTA')
  await page.getByLabel('OFFERTA CLIENTE').fill('20500')
  await page.getByLabel('NOTA INTERESSE').fill('Offerta con permuta da valutare')
  await page.getByTestId('interest-save').click()
  await expect.poll(()=>state.interests.length).toBe(1)
  expect(state.interests[0].vehicle_id).toBe(VEHICLE)
  expect(Number(state.interests[0].offer_amount)).toBe(20500)
  await expect(page.getByText('Volkswagen Golf 2.0 TDI')).toBeVisible()

  await page.locator('.interest-row').click()
  await page.getByLabel('FASE INTERESSE').selectOption('TRATTATIVA')
  await page.getByTestId('interest-save').click()
  await expect.poll(()=>state.interests[0].status).toBe('TRATTATIVA')

  await page.getByPlaceholder('Es. richiamare per proposta Golf').fill('Richiamare per conferma permuta')
  await page.locator('.next-panel input[type="datetime-local"]').fill('2026-10-17T11:30')
  await page.locator('.next-panel').getByRole('button',{name:'Salva'}).click()
  await expect.poll(()=>state.customers[0].next_step).toBe('Richiamare per conferma permuta')

  await page.getByPlaceholder('Es. interessato, richiamare venerdì').fill('Chiamata positiva, attende valutazione permuta')
  await page.getByRole('button',{name:'Chiamata',exact:true}).click()
  await expect.poll(()=>state.interactions.length).toBe(1)
  expect(state.interactions[0].channel).toBe('TELEFONO')
  await expect(page.locator('.timeline')).toContainText('Chiamata positiva')
  expect(state.financeRequests).toBe(0)
})
