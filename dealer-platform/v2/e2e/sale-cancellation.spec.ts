import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const CONTRACT='44444444-4444-4444-4444-444444444444'

type Options={stage?:string;deposit?:number;status?:string;saleInvoiceId?:string|null;financingAmount?:number}
type State={contract:any;vehicle:any;calendarEvents:any[];financeRequests:number;patches:number}
const day=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function json(route:any,data:unknown,status=200){return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})}

async function boot(page:Page,role:'ADMIN'|'VENDITORE',options:Options={}){
 const state:State={
  financeRequests:0,patches:0,
  vehicle:{id:VEHICLE,dealer_id:DEALER,brand:'BMW',model:'X1',plate:'AB123CD',vin:'WVWZZZ1JZXW000024',status:'PRENOTATA',asking_price:32000},
  calendarEvents:[{id:'delivery-1',dealer_id:DEALER,event_type:'DELIVERY',title:'Consegna BMW X1',starts_at:day(2)+'T15:00:00Z',status:'OPEN',customer_id:CUSTOMER,vehicle_id:VEHICLE}],
  contract:{id:CONTRACT,dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,contract_number:'V-CANCEL-24',contract_date:day(-1),template_code:'VENDITA',status:options.status||'DRAFT',sale_stage:options.stage||'OPEN',price:32000,deposit:options.deposit||0,financing_amount:options.financingAmount||0,financing_status:'NOT_REQUESTED',sale_invoice_id:options.saleInvoiceId??null,planned_delivery_at:day(2)+'T15:00:00Z'}
 }
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:role==='ADMIN'?'admin':'seller'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}})),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method(),body=method==='GET'?null:req.postDataJSON() as any
  if(path==='/rest/v1/vehicles')return json(route,[state.vehicle])
  if(path==='/rest/v1/vehicle_media')return json(route,[{id:'m1',dealer_id:DEALER,vehicle_id:VEHICLE,kind:'PHOTO',object_key:'vehicles/'+VEHICLE+'/photo.jpg'}])
  if(path==='/rest/v1/vehicle_work_items'||path==='/rest/v1/customer_interactions'||path==='/rest/v1/customer_vehicle_interests')return json(route,[])
  if(path==='/rest/v1/customers')return json(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',status:'CLIENTE'}])
  if(path==='/rest/v1/calendar_events')return json(route,state.calendarEvents)
  if(path==='/rest/v1/contracts'){
   if(method==='PATCH'){
    state.patches++
    if(body.sale_stage==='CANCELLED'){
     Object.assign(state.contract,body,{sale_cancelled_at:new Date().toISOString(),sale_cancelled_by:role==='ADMIN'?'admin':'seller'})
     state.vehicle.status='IN_VENDITA'
     state.calendarEvents.forEach(event=>{if(event.event_type==='DELIVERY'&&event.status==='OPEN')event.status='CANCELLED'})
    }
    return json(route,[state.contract])
   }
   return json(route,[state.contract])
  }
  if(path==='/rest/v1/vehicle_financials'||path==='/rest/v1/vehicle_costs'||path==='/rest/v1/invoices'){state.financeRequests++;return json(route,[])}
  if(path==='/rest/v1/invoice_receipts')return json(route,[])
  if(path.startsWith('/rest/v1/'))return json(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return state
}

async function openCancellation(page:Page){
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 await page.getByTestId('open-sale-360').click()
 const drawer=page.getByTestId('sale-360')
 await expect(drawer).toBeVisible()
 await drawer.getByTestId('open-sale-cancel').click()
 return drawer
}

async function chooseAndConfirm(drawer:any){
 await drawer.getByLabel('Motivo annullamento').selectOption('CLIENTE_RINUNCIA')
 await drawer.getByLabel('Dettagli annullamento').fill('cliente non procede più')
 await drawer.getByRole('button',{name:'Continua'}).click()
 await expect(drawer).toContainText('Cliente ha rinunciato — cliente non procede più')
 await drawer.getByRole('button',{name:'Conferma annullamento definitivo'}).click()
}

test('VENDITORE annulla una trattativa pulita senza ricevere dati finanziari',async({page})=>{
 const state=await boot(page,'VENDITORE')
 const drawer=await openCancellation(page)
 await expect(drawer.getByTestId('sale-cancel-admin-lock')).toHaveCount(0)
 await chooseAndConfirm(drawer)
 await expect.poll(()=>state.contract.sale_stage).toBe('CANCELLED')
 expect(state.contract.sale_cancel_reason).toBe('Cliente ha rinunciato — cliente non procede più')
 expect(state.vehicle.status).toBe('IN_VENDITA')
 expect(state.calendarEvents[0].status).toBe('CANCELLED')
 expect(state.financeRequests).toBe(0)
 await expect(page.getByTestId('sale-360')).toHaveCount(0)
 await expect(page.getByTestId('sales-tab-cancelled')).toHaveAttribute('aria-selected','true')
 await expect(page.getByTestId('sale-card')).toContainText('Annullata')
 await page.getByTestId('open-sale-360').click()
 const summary=page.getByTestId('sale-cancelled-summary')
 await expect(summary).toContainText('Cliente ha rinunciato — cliente non procede più')
 await expect(summary).toContainText('non può essere riaperta')
})

test('VENDITORE non può annullare una vendita con caparra o fase avanzata',async({page})=>{
 const state=await boot(page,'VENDITORE',{stage:'DEPOSIT',deposit:1500})
 const drawer=await openCancellation(page)
 const lock=drawer.getByTestId('sale-cancel-admin-lock')
 await expect(lock).toBeVisible()
 await expect(lock).toContainText('Serve Admin/Amministrazione')
 await expect(drawer.getByLabel('Motivo annullamento')).toHaveCount(0)
 expect(state.patches).toBe(0)
 expect(state.contract.sale_stage).toBe('DEPOSIT')
 expect(state.financeRequests).toBe(0)
})

test('ADMIN può annullare una vendita avanzata con doppia conferma',async({page})=>{
 const state=await boot(page,'ADMIN',{stage:'READY',deposit:2000,status:'SIGNED',saleInvoiceId:'invoice-1',financingAmount:5000})
 const drawer=await openCancellation(page)
 await expect(drawer.getByTestId('sale-cancel-admin-lock')).toHaveCount(0)
 await drawer.getByLabel('Motivo annullamento').selectOption('FINANZIAMENTO')
 await drawer.getByLabel('Dettagli annullamento').fill('cliente rinuncia al finanziamento')
 await drawer.getByRole('button',{name:'Continua'}).click()
 await expect(drawer).toContainText('Questa operazione non riapre automaticamente fatture')
 await drawer.getByRole('button',{name:'Conferma annullamento definitivo'}).click()
 await expect.poll(()=>state.contract.sale_stage).toBe('CANCELLED')
 expect(state.vehicle.status).toBe('IN_VENDITA')
 expect(state.calendarEvents[0].status).toBe('CANCELLED')
 await expect(page.getByTestId('sales-tab-cancelled')).toHaveAttribute('aria-selected','true')
})
