import {expect,test,type Page} from '@playwright/test'
import {DELIVERY_CHECKLIST} from '../src/domain/sale360'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const CONTRACT='44444444-4444-4444-4444-444444444444'
const INVOICE='55555555-5555-5555-5555-555555555555'

type Options={completeChecklist?:boolean;paid?:boolean}
type State={financeRequests:number;contract:any;workItems:any[]}
const day=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function json(route:any,data:unknown){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}

async function boot(page:Page,role:'ADMIN'|'VENDITORE',options:Options={}){
 const state:State={financeRequests:0,contract:{id:CONTRACT,dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,contract_number:'V-2026-300',contract_date:day(-2),template_code:'VENDITA',status:'SIGNED',sale_stage:'READY',price:25000,deposit:3000,planned_delivery_at:day(1)+'T15:00:00Z',sale_invoice_id:INVOICE,financing_amount:0,financing_status:'NOT_REQUESTED'},workItems:[]}
 state.workItems=(options.completeChecklist?DELIVERY_CHECKLIST:DELIVERY_CHECKLIST.slice(0,2)).map((title,i)=>({id:'w'+i,dealer_id:DEALER,vehicle_id:VEHICLE,title,category:'CONSEGNA',status:'DONE'}))
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:role==='ADMIN'?'admin':'seller'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}})),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method(),body=method==='GET'?null:req.postDataJSON() as any
  if(path==='/rest/v1/vehicles')return json(route,[{id:VEHICLE,dealer_id:DEALER,brand:'Audi',model:'A3',plate:'AB123CD',vin:'WVWZZZ1JZXW000001',status:'IN_VENDITA',asking_price:25000}])
  if(path==='/rest/v1/vehicle_media')return json(route,[])
  if(path==='/rest/v1/vehicle_work_items')return json(route,state.workItems)
  if(path==='/rest/v1/customers')return json(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',status:'CLIENTE'}])
  if(path==='/rest/v1/customer_interactions'||path==='/rest/v1/customer_vehicle_interests'||path==='/rest/v1/calendar_events')return json(route,[])
  if(path==='/rest/v1/contracts'){if(method==='PATCH'){Object.assign(state.contract,body,{delivered_at:body.sale_stage==='DELIVERED'?new Date().toISOString():state.contract.delivered_at});return json(route,[state.contract])}return json(route,[state.contract])}
  if(path==='/rest/v1/vehicle_financials'||path==='/rest/v1/vehicle_costs'){state.financeRequests++;return json(route,[])}
  if(path==='/rest/v1/invoices'){state.financeRequests++;return json(route,[{id:INVOICE,dealer_id:DEALER,vehicle_id:VEHICLE,customer_id:CUSTOMER,invoice_type:'SALE',total_amount:25000,paid_amount:options.paid?25000:10000,payment_status:options.paid?'PAID':'PARTIAL',issue_date:day(-2),due_date:day(0)}])}
  if(path==='/rest/v1/invoice_receipts')return json(route,[])
  if(path.startsWith('/rest/v1/'))return json(route,[])
  return route.fulfill({status:404,contentType:'application/json',body:'{}'})
 })
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 return state
}

async function openGate(page:Page){
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await expect(page.getByRole('heading',{name:'Vendite'})).toBeVisible()
 await page.getByRole('button',{name:'Verifica consegna'}).click()
 const gate=page.getByTestId('delivery-gate');await expect(gate).toBeVisible();return gate
}

test('ADMIN vede i blocchi reali prima della consegna',async({page})=>{
 await boot(page,'ADMIN',{completeChecklist:false,paid:false})
 const gate=await openGate(page)
 await expect(gate).toContainText('Consegna bloccata')
 await expect(gate.locator('[data-gate-check="contract"]')).toContainText('Contratto SIGNED')
 await expect(gate.locator('[data-gate-check="checklist"]')).toContainText('5 controlli mancanti')
 await expect(gate.locator('[data-gate-check="invoice"]')).toContainText('Fattura SALE collegata')
 await expect(gate.locator('[data-gate-check="balance"]')).toContainText(/15\.000.*€/)
 await expect(gate.getByRole('button',{name:/Consegna bloccata/})).toBeDisabled()
})

test('ADMIN con gate tutto verde conferma due volte e consegna definitivamente',async({page})=>{
 const state=await boot(page,'ADMIN',{completeChecklist:true,paid:true})
 const gate=await openGate(page)
 await expect(gate).toContainText('Pronta per la consegna')
 await expect(gate).toContainText('TUTTO VERDE')
 await gate.getByRole('button',{name:'Consegna veicolo'}).click()
 await expect(gate).toContainText('Dopo non potrai riaprire la vendita')
 await gate.getByRole('button',{name:'Conferma definitivamente'}).click()
 await expect.poll(()=>state.contract.sale_stage).toBe('DELIVERED')
 await expect(page.getByTestId('sale-360')).toHaveCount(0)
 await expect(page.getByTestId('sale-card')).toContainText('Consegnata')
})

test('VENDITORE prepara la consegna senza ricevere dati finanziari',async({page})=>{
 const state=await boot(page,'VENDITORE',{completeChecklist:true,paid:true})
 const gate=await openGate(page)
 await expect(gate.locator('[data-gate-check="finance"]')).toContainText('Verifica amministrativa finale')
 await expect(gate.locator('[data-gate-check="invoice"]')).toHaveCount(0)
 await expect(gate.locator('[data-gate-check="balance"]')).toHaveCount(0)
 await expect(gate.getByRole('button',{name:/Conferma finale/})).toBeDisabled()
 await expect(page.getByTestId('sale-360-finance')).toHaveCount(0)
 expect(state.financeRequests).toBe(0)
})