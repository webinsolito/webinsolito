import {expect,test,type Page} from '@playwright/test'
import {DELIVERY_CHECKLIST} from '../src/domain/sale360'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const VEHICLE='22222222-2222-2222-2222-222222222222'
const CUSTOMER='33333333-3333-3333-3333-333333333333'
const CONTRACT='44444444-4444-4444-4444-444444444444'
const INVOICE='55555555-5555-5555-5555-555555555555'

type Options={completeChecklist?:boolean;paid?:boolean;pendingChecklist?:boolean;delivered?:boolean;seedHistory?:boolean}
type State={financeRequests:number;contract:any;vehicle:any;calendarEvents:any[];workItems:any[];workItemPosts:number;workItemPatches:number;undoRequests:string[];checklistHistory:any[];historyReads:string[];snapshotReads:number;snapshotOffline:boolean}
const day=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function json(route:any,data:unknown){return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}

async function boot(page:Page,role:'ADMIN'|'VENDITORE'|'AMMINISTRAZIONE',options:Options={}){
 const state:State={financeRequests:0,vehicle:{id:VEHICLE,dealer_id:DEALER,brand:'Audi',model:'A3',plate:'AB123CD',vin:'WVWZZZ1JZXW000001',status:'IN_VENDITA',asking_price:25000},calendarEvents:[{id:'delivery-event',dealer_id:DEALER,event_type:'DELIVERY',title:'Consegna Audi A3',starts_at:day(0)+'T15:00:00Z',status:'OPEN',priority:'HIGH',customer_id:CUSTOMER,vehicle_id:VEHICLE}],contract:{id:CONTRACT,dealer_id:DEALER,customer_id:CUSTOMER,vehicle_id:VEHICLE,contract_number:'V-2026-300',contract_date:day(-2),template_code:'VENDITA',status:'SIGNED',sale_stage:'READY',price:25000,deposit:3000,planned_delivery_at:day(1)+'T15:00:00Z',sale_invoice_id:INVOICE,financing_amount:0,financing_status:'NOT_REQUESTED'},workItems:[],workItemPosts:0,workItemPatches:0,undoRequests:[],checklistHistory:[],historyReads:[],snapshotReads:0,snapshotOffline:false}
 state.workItems=(options.completeChecklist?DELIVERY_CHECKLIST:DELIVERY_CHECKLIST.slice(0,2)).map((title,i)=>({id:'w'+i,dealer_id:DEALER,vehicle_id:VEHICLE,title,category:'CONSEGNA',status:'DONE'}))
 if(options.seedHistory){state.checklistHistory.push({id:'before-existing',dealer_id:DEALER,vehicle_id:VEHICLE,work_item_id:'w0',title:DELIVERY_CHECKLIST[0],event_type:'COMPLETED',occurred_at:'2026-10-20T10:20:00Z',actor_name:'Operatore Demo',actor_role:'VENDITORE'})}
 if(options.delivered){state.contract.sale_stage='DELIVERED';state.vehicle.status='CONSEGNATA'}
 if(options.pendingChecklist)state.workItems.push({id:'pending-check',dealer_id:DEALER,vehicle_id:VEHICLE,title:DELIVERY_CHECKLIST[2],category:'CONSEGNA',status:'TODO'})
 await page.addInitScript(({dealer,role})=>localStorage.setItem('malu23-v2-session',JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:role==='ADMIN'?'admin':'seller'},dealer:{id:dealer,slug:'demo',display_name:'Autosalone Demo'},profile:{display_name:role,username:role.toLowerCase(),role,permissions:{}}})),{dealer:DEALER,role})
 await page.route(PROJECT+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method(),body=method==='GET'?null:req.postDataJSON() as any
  if(path==='/rest/v1/vehicles')return json(route,[state.vehicle])
  if(path==='/rest/v1/vehicle_media')return json(route,[{id:'media-1',dealer_id:DEALER,vehicle_id:VEHICLE,kind:'PHOTO',object_key:'vehicles/'+VEHICLE+'/photo.jpg',is_cover:true}])
  if(path==='/rest/v1/vehicle_work_items'){
   if(method==='GET'&&url.searchParams.get('category')==='eq.CONSEGNA'){
    state.snapshotReads++
    if(state.snapshotOffline)return route.fulfill({status:503,contentType:'application/json',body:'{"message":"Sincronizzazione non disponibile"}'})
    return json(route,state.workItems.filter(w=>w.dealer_id===DEALER&&w.vehicle_id===VEHICLE&&w.category==='CONSEGNA'))
   }
   if(method==='POST'){
    state.workItemPosts++
    const item={...body,id:'new-item-'+state.workItemPosts}
    if(item.dealer_id!==DEALER||item.vehicle_id!==VEHICLE)return route.fulfill({status:403,contentType:'application/json',body:'{}'})
    state.workItems.push(item)
    return json(route,[item])
   }
   if(method==='PATCH'){
    state.workItemPatches++
    const id=url.searchParams.get('id')?.replace('eq.','')
    const item=state.workItems.find(x=>x.id===id&&x.dealer_id===DEALER)
    if(!item)return json(route,[])
    if(body?.status==='TODO'){
     state.undoRequests.push(url.search)
     if(url.searchParams.get('dealer_id')!=='eq.'+DEALER||url.searchParams.get('vehicle_id')!=='eq.'+VEHICLE
      ||url.searchParams.get('category')!=='eq.CONSEGNA'||url.searchParams.get('status')!=='eq.DONE'
      ||url.searchParams.get('title')!=='eq.'+item.title||item.status!=='DONE')return json(route,[])
    }
    const wasDone=item.status==='DONE'
    Object.assign(item,body)
    if(wasDone!==(item.status==='DONE')&&item.category==='CONSEGNA'){
     state.checklistHistory.unshift({id:'audit-'+state.checklistHistory.length,dealer_id:DEALER,vehicle_id:VEHICLE,work_item_id:item.id,title:item.title,
      event_type:item.status==='DONE'?'COMPLETED':'CORRECTED',occurred_at:new Date(Date.now()+state.checklistHistory.length*1000).toISOString(),
      actor_user_id:'mock-actor',actor_name:role==='ADMIN'?'Supervisore Demo':'Addetto Vendite',actor_role:role})
    }
    return json(route,[item])
   }
   return json(route,state.workItems)
  }
  if(path==='/rest/v1/sale_checklist_events_v420'){
    state.historyReads.push(url.search)
    return json(route,state.checklistHistory)
  }
  if(path==='/rest/v1/customers')return json(route,[{id:CUSTOMER,dealer_id:DEALER,first_name:'Mario',last_name:'Rossi',status:'CLIENTE'}])
  if(path==='/rest/v1/customer_interactions'||path==='/rest/v1/customer_vehicle_interests')return json(route,[])
  if(path==='/rest/v1/calendar_events')return json(route,state.calendarEvents)
  if(path==='/rest/v1/contracts'){if(method==='PATCH'){Object.assign(state.contract,body,{delivered_at:body.sale_stage==='DELIVERED'?new Date().toISOString():state.contract.delivered_at});if(body.sale_stage==='DELIVERED'){state.vehicle.status='CONSEGNATA';state.calendarEvents.forEach(event=>{if(event.event_type==='DELIVERY'&&event.customer_id===CUSTOMER&&event.vehicle_id===VEHICLE&&event.status==='OPEN')event.status='DONE'})}return json(route,[state.contract])}return json(route,[state.contract])}
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
 await expect(page.getByTestId('sales-tab-active')).toContainText('0')
 await expect(page.getByTestId('sale-card')).toHaveCount(0)
 await page.getByTestId('sales-tab-delivered').click()
 await expect(page.getByTestId('sales-tab-delivered')).toContainText('1')
 await expect(page.getByTestId('sale-card')).toContainText('Consegnata')
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Oggi'}):page.locator('.sidebar nav button').filter({hasText:'Oggi'})).click()
 await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
 await expect(page.locator('.mini-stat').filter({hasText:'AUTO ATTIVE'})).toContainText('0')
 await expect(page.getByRole('button',{name:'Apri consegne da gestire'})).toContainText('0')
 expect(state.vehicle.status).toBe('CONSEGNATA')
 expect(state.calendarEvents[0].status).toBe('DONE')
 await page.getByRole('button',{name:'Apri centro scadenze'}).click()
 const center=page.getByTestId('deadline-page')
 await expect(center).toBeVisible()
 await expect(center.getByText('Consegna Audi A3')).toHaveCount(0)
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
test('Mod40: completa una sola voce assente, aggiorna 360 e gate senza chiudere la vendita',async({page})=>{
 const state=await boot(page,'ADMIN',{completeChecklist:false,paid:true})
 const gate=await openGate(page)
 await expect(page.getByTestId('sale360-checklist-count')).toHaveText('2/7')
 const target=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[2]})
 await target.getByRole('button',{name:'Completa '+DELIVERY_CHECKLIST[2]}).click()
 await expect(page.getByTestId('sale360-checklist-count')).toHaveText('3/7')
 await expect(target).toContainText('Completata')
 await expect(gate.locator('[data-gate-check="checklist"]')).toContainText('4 controlli mancanti')
 expect(state.workItemPosts).toBe(1)
 expect(state.workItemPatches).toBe(1)
 expect(state.workItems.find(item=>item.title===DELIVERY_CHECKLIST[2])?.status).toBe('DONE')
 expect(state.contract.sale_stage).toBe('READY')
 await expect(gate).toContainText('Consegna bloccata')
})
test('Mod40: voce già esistente viene completata senza inserire duplicati',async({page})=>{
 const state=await boot(page,'ADMIN',{pendingChecklist:true})
 await openGate(page)
 const target=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[2]})
 await target.getByRole('button',{name:'Completa '+DELIVERY_CHECKLIST[2]}).click()
 await expect(target).toContainText('Completata')
 expect(state.workItemPosts).toBe(0)
 expect(state.workItemPatches).toBe(1)
 expect(state.workItems.filter(item=>item.title===DELIVERY_CHECKLIST[2])).toHaveLength(1)
})
test('Mod40: venditore completa attività operativa senza leggere dati finanziari',async({page})=>{
 const state=await boot(page,'VENDITORE',{pendingChecklist:true})
 const gate=await openGate(page)
 await page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[2]}).getByRole('button',{name:'Completa '+DELIVERY_CHECKLIST[2]}).click()
 await expect(page.getByTestId('sale360-checklist-count')).toHaveText('3/7')
 await expect(gate.locator('[data-gate-check="finance"]')).toBeVisible()
 await expect(page.getByTestId('sale-360-finance')).toHaveCount(0)
 expect(state.financeRequests).toBe(0)
 expect(state.contract.sale_stage).toBe('READY')
})
test('Mod40: ruolo senza permesso Garage visualizza la checklist ma non può cambiarla',async({page})=>{
 const state=await boot(page,'AMMINISTRAZIONE',{pendingChecklist:true})
 await openGate(page)
 await expect(page.getByTestId('sale360-checklist-item')).toHaveCount(7)
 await expect(page.getByTestId('sale360-checklist-complete')).toHaveCount(0)
 await expect(page.getByTestId('sale360-checklist')).toContainText('Da verificare')
 expect(state.workItemPosts).toBe(0)
 expect(state.workItemPatches).toBe(0)
})

test('Mod41: conferma necessaria, annulla senza scrivere e corregge solo dopo la seconda azione',async({page})=>{
 const state=await boot(page,'ADMIN',{completeChecklist:true,paid:true})
 const gate=await openGate(page)
 await expect(gate).toContainText('TUTTO VERDE')
 const row=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[0]})
 await row.getByRole('button',{name:'Correggi '+DELIVERY_CHECKLIST[0]}).click()
 await expect(row.getByTestId('sale360-checklist-undo-confirm')).toContainText('bloccherà la consegna')
 expect(state.workItemPatches).toBe(0)
 await row.getByRole('button',{name:'Annulla'}).click()
 expect(state.workItemPatches).toBe(0)
 await expect(row.getByTestId('sale360-checklist-undo-confirm')).toHaveCount(0)
 await row.getByRole('button',{name:'Correggi '+DELIVERY_CHECKLIST[0]}).click()
 await row.getByTestId('sale360-checklist-undo-submit').click()
 await expect(page.getByTestId('sale360-checklist-count')).toHaveText('6/7')
 await expect(row).toContainText('Segna completata')
 await expect(gate.locator('[data-gate-check="checklist"]')).toContainText('1 controlli mancanti')
 await expect(gate).toContainText('Consegna bloccata')
 await expect(gate.getByRole('button',{name:/Consegna bloccata/})).toBeDisabled()
 expect(state.workItemPosts).toBe(0)
 expect(state.workItemPatches).toBe(1)
 expect(state.undoRequests).toHaveLength(1)
 expect(state.workItems[0].status).toBe('TODO')
 expect(state.workItems[0].completed_at).toBeNull()
 expect(state.contract.sale_stage).toBe('READY')
})
test('Mod41: venditore corregge la propria checklist senza accessi finanziari e può rifare il controllo',async({page})=>{
 const state=await boot(page,'VENDITORE',{completeChecklist:true,paid:true})
 const gate=await openGate(page)
 const row=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[1]})
 await row.getByRole('button',{name:'Correggi '+DELIVERY_CHECKLIST[1]}).click()
 await row.getByTestId('sale360-checklist-undo-submit').click()
 await expect(page.getByTestId('sale360-checklist-count')).toHaveText('6/7')
 await row.getByRole('button',{name:'Completa '+DELIVERY_CHECKLIST[1]}).click()
 await expect(page.getByTestId('sale360-checklist-count')).toHaveText('7/7')
 await expect(gate.locator('[data-gate-check="checklist"]')).toContainText('7 controlli operativi')
 expect(state.workItemPatches).toBe(2)
 expect(state.workItemPosts).toBe(0)
 expect(state.financeRequests).toBe(0)
 await expect(page.getByTestId('sale-360-finance')).toHaveCount(0)
})
test('Mod41: amministrazione senza garage_write può vedere spunte ma non correggerle',async({page})=>{
 const state=await boot(page,'AMMINISTRAZIONE',{completeChecklist:true,paid:true})
 await openGate(page)
 await expect(page.getByTestId('sale360-checklist-item')).toHaveCount(7)
 await expect(page.getByTestId('sale360-checklist-undo')).toHaveCount(0)
 await expect(page.getByTestId('sale360-checklist-undo-submit')).toHaveCount(0)
 expect(state.workItemPatches).toBe(0)
})
test('Mod41: vendite già consegnate non consentono di rimuovere verifiche',async({page})=>{
 const state=await boot(page,'ADMIN',{completeChecklist:true,paid:true,delivered:true})
 const mobile=(page.viewportSize()?.width||1200)<=760
 await (mobile?page.locator('.mobile-nav button').filter({hasText:'Vendite'}):page.locator('.sidebar nav button').filter({hasText:'Vendite'})).click()
 await page.getByTestId('sales-tab-delivered').click()
 await page.getByTestId('open-sale-360').click()
 await expect(page.getByTestId('sale360-checklist-item')).toHaveCount(7)
 await expect(page.getByTestId('sale360-checklist-undo')).toHaveCount(0)
 expect(state.workItemPatches).toBe(0)
})
 
test('Mod42: completamento e correzione scrivono uno storico cronologico con operatore e data',async({page})=>{
 const state=await boot(page,'ADMIN',{pendingChecklist:true,paid:true})
 await openGate(page)
 const history=page.getByTestId('sale-checklist-history')
 await expect(history.getByTestId('sale-checklist-history-empty')).toBeVisible()
 const row=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[2]})
 await row.getByRole('button',{name:'Completa '+DELIVERY_CHECKLIST[2]}).click()
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(1)
 await expect(history.getByTestId('sale-checklist-history-event').first()).toContainText('Verifica completata')
 await expect(history).toContainText('Supervisore Demo')
 await expect(history).toContainText(DELIVERY_CHECKLIST[2])
 await row.getByRole('button',{name:'Correggi '+DELIVERY_CHECKLIST[2]}).click()
 await row.getByTestId('sale360-checklist-undo-submit').click()
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(2)
 await expect(history.getByTestId('sale-checklist-history-event').first()).toContainText('Verifica corretta')
 await expect(history.getByTestId('sale-checklist-history-event').first()).toContainText('Supervisore Demo')
 expect(state.checklistHistory.map(x=>x.event_type)).toEqual(['CORRECTED','COMPLETED'])
 expect(state.historyReads.some(s=>s.includes('dealer_id=eq.'+DEALER)&&s.includes('vehicle_id=eq.'+VEHICLE))).toBe(true)
})
test('Mod42: lo storico esistente è visibile anche a ruoli senza garage_write, senza modifiche',async({page})=>{
 const state=await boot(page,'AMMINISTRAZIONE',{completeChecklist:true,seedHistory:true})
 await openGate(page)
 const history=page.getByTestId('sale-checklist-history')
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(1)
 await expect(history).toContainText('Operatore Demo')
 await expect(page.getByTestId('sale360-checklist-undo')).toHaveCount(0)
 expect(state.workItemPatches).toBe(0)
})
test('Mod42: venditore consulta e aggiorna lo storico ma non riceve dati finanziari',async({page})=>{
 const state=await boot(page,'VENDITORE',{pendingChecklist:true})
 await openGate(page)
 const row=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[2]})
 await row.getByRole('button',{name:'Completa '+DELIVERY_CHECKLIST[2]}).click()
 const history=page.getByTestId('sale-checklist-history')
 await expect(history).toContainText('Addetto Vendite')
 await history.getByTestId('sale-checklist-history-refresh').click()
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(1)
 expect(state.financeRequests).toBe(0)
 await expect(page.getByTestId('sale-360-finance')).toHaveCount(0)
})
test('Mod42: non mostra un evento restituito per errore da una concessionaria estranea',async({page})=>{
 const state=await boot(page,'ADMIN',{seedHistory:true})
 state.checklistHistory.push({id:'foreign',dealer_id:'other-dealer',vehicle_id:VEHICLE,title:DELIVERY_CHECKLIST[0],event_type:'COMPLETED',occurred_at:'2026-10-21T18:00:00Z',actor_name:'NON MOSTRARE-ALTRO-DEALER'})
 await openGate(page)
 const history=page.getByTestId('sale-checklist-history')
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(1)
 await expect(history).not.toContainText('NON MOSTRARE-ALTRO-DEALER')
 expect(state.historyReads.length).toBeGreaterThan(0)
})

test('Mod43: ogni verifica mostra operatore e data reale, senza inventare eventi passati',async({page})=>{
 const state=await boot(page,'ADMIN',{completeChecklist:true,seedHistory:true})
 await openGate(page)
 const first=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[0]})
 await expect(first.getByTestId('sale360-checklist-attribution')).toContainText('Completata · Operatore Demo · VENDITORE')
 await expect(first.getByTestId('sale360-checklist-attribution')).toContainText('20/10/2026')
 const old=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[1]})
 await expect(old.getByTestId('sale360-checklist-attribution')).toHaveText('Operatore e data non registrati nello storico')
 expect(state.historyReads.length).toBeGreaterThan(0)
 expect(state.historyReads.length).toBeLessThanOrEqual(2)
 expect(state.workItemPatches).toBe(0)
})
test('Mod43: correzione e nuova verifica aggiornano autore e orario direttamente sulla riga',async({page})=>{
 const state=await boot(page,'ADMIN',{pendingChecklist:true})
 await openGate(page)
 const row=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[2]})
 await expect(row.getByTestId('sale360-checklist-attribution')).toHaveCount(0)
 await row.getByRole('button',{name:'Completa '+DELIVERY_CHECKLIST[2]}).click()
 await expect(row.getByTestId('sale360-checklist-attribution')).toContainText('Completata · Supervisore Demo · ADMIN')
 await row.getByRole('button',{name:'Correggi '+DELIVERY_CHECKLIST[2]}).click()
 await row.getByTestId('sale360-checklist-undo-submit').click()
 await expect(row.getByTestId('sale360-checklist-attribution')).toContainText('Corretta · Supervisore Demo · ADMIN')
 await expect(page.getByTestId('sale-checklist-history-event')).toHaveCount(2)
 await row.getByRole('button',{name:'Completa '+DELIVERY_CHECKLIST[2]}).click()
 await expect(row.getByTestId('sale360-checklist-attribution')).toContainText('Completata · Supervisore Demo · ADMIN')
 expect(state.checklistHistory.map(e=>e.event_type)).toEqual(['COMPLETED','CORRECTED','COMPLETED'])
 expect(state.historyReads.length).toBeGreaterThanOrEqual(4)
 expect(state.historyReads.length).toBeLessThanOrEqual(8)
})
test('Mod43: un venditore legge attribuzioni ma non i dettagli finanziari',async({page})=>{
 const state=await boot(page,'VENDITORE',{seedHistory:true})
 await openGate(page)
 const row=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[0]})
 await expect(row.getByTestId('sale360-checklist-attribution')).toContainText('Operatore Demo')
 await expect(row.getByTestId('sale360-checklist-attribution')).toContainText('20/10/2026')
 await expect(page.getByTestId('sale-360-finance')).toHaveCount(0)
 expect(state.financeRequests).toBe(0)
})
test('Mod43: eventi di altro concessionario o altra voce non vengono attribuiti',async({page})=>{
 const state=await boot(page,'AMMINISTRAZIONE',{seedHistory:true})
 state.checklistHistory.push({id:'stranger',dealer_id:'foreign-dealer',vehicle_id:VEHICLE,work_item_id:'w1',
  title:DELIVERY_CHECKLIST[1],event_type:'COMPLETED',occurred_at:'2026-10-21T21:00:00Z',actor_name:'ESTRANEO'})
 state.checklistHistory.push({id:'stale',dealer_id:DEALER,vehicle_id:VEHICLE,work_item_id:'wrong-id',
  title:DELIVERY_CHECKLIST[1],event_type:'COMPLETED',occurred_at:'2026-10-21T21:00:00Z',actor_name:'ALTRO-ITEM'})
 await openGate(page)
 const row=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[1]})
 await expect(row.getByTestId('sale360-checklist-attribution')).toHaveText('Operatore e data non registrati nello storico')
 await expect(page.getByTestId('sale-360')).not.toContainText('ESTRANEO')
 await expect(row.getByTestId('sale360-checklist-attribution')).not.toContainText('ALTRO-ITEM')
 expect(state.financeRequests).toBeGreaterThanOrEqual(0)
})

test('Mod44: tocco sulla verifica apre solo il suo storico, senza nuovi GET',async({page})=>{
 const state=await boot(page,'ADMIN',{completeChecklist:true,seedHistory:true})
 state.checklistHistory.push({id:'other-check',dealer_id:DEALER,vehicle_id:VEHICLE,work_item_id:'w1',
  title:DELIVERY_CHECKLIST[1],event_type:'COMPLETED',occurred_at:'2026-10-21T18:00:00Z',actor_name:'Operatore Altro'})
 await openGate(page)
 const history=page.getByTestId('sale-checklist-history')
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(2)
 const reads=state.historyReads.length
 await page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[0]})
  .getByRole('button',{name:'Apri storico di '+DELIVERY_CHECKLIST[0]}).click()
 await expect(history).toBeFocused()
 await expect(history.getByTestId('sale-checklist-history-filter')).toContainText(DELIVERY_CHECKLIST[0])
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(1)
 await expect(history).toContainText('Operatore Demo')
 await expect(history).not.toContainText('Operatore Altro')
 expect(state.historyReads.length).toBe(reads)
 await history.getByTestId('sale-checklist-history-show-all').click()
 await expect(history.getByTestId('sale-checklist-history-filter')).toHaveCount(0)
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(2)
 expect(state.workItemPatches).toBe(0)
})
test('Mod44: una verifica senza eventi apre un messaggio contestuale e permette di tornare allo storico intero',async({page})=>{
 const state=await boot(page,'VENDITORE',{seedHistory:true})
 await openGate(page)
 const history=page.getByTestId('sale-checklist-history')
 await page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[6]})
  .getByRole('button',{name:'Apri storico di '+DELIVERY_CHECKLIST[6]}).click()
 await expect(history.getByTestId('sale-checklist-history-empty')).toContainText('Nessun evento registrato per questa verifica')
 await expect(history.getByTestId('sale-checklist-history-filter')).toContainText(DELIVERY_CHECKLIST[6])
 await history.getByTestId('sale-checklist-history-show-all').click()
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(1)
 expect(state.financeRequests).toBe(0)
 await expect(page.getByTestId('sale-360-finance')).toHaveCount(0)
})
test('Mod44: cambio rapido della verifica mantiene il filtro preciso e non scrive dati',async({page})=>{
 const state=await boot(page,'AMMINISTRAZIONE',{completeChecklist:true,seedHistory:true})
 state.checklistHistory.push({id:'second',dealer_id:DEALER,vehicle_id:VEHICLE,work_item_id:'w1',
  title:DELIVERY_CHECKLIST[1],event_type:'CORRECTED',occurred_at:'2026-10-22T07:00:00Z',actor_name:'Secondo Addetto'})
 state.checklistHistory.push({id:'foreign',dealer_id:'another-dealer',vehicle_id:VEHICLE,work_item_id:'w2',
  title:DELIVERY_CHECKLIST[2],event_type:'COMPLETED',occurred_at:'2026-10-22T07:05:00Z',actor_name:'OPERATORE ESTRANEO'})
 await openGate(page)
 const history=page.getByTestId('sale-checklist-history')
 await page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[1]})
  .getByRole('button',{name:'Apri storico di '+DELIVERY_CHECKLIST[1]}).click()
 await expect(history).toContainText('Secondo Addetto')
 await expect(history).not.toContainText('OPERATORE ESTRANEO')
 await page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[0]})
  .getByRole('button',{name:'Apri storico di '+DELIVERY_CHECKLIST[0]}).click()
 await expect(history).toContainText('Operatore Demo')
 await expect(history).not.toContainText('Secondo Addetto')
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(1)
 expect(state.workItemPatches).toBe(0)
 expect(state.workItemPosts).toBe(0)
})
test('Mod44: aprire lo storico dalla riga non altera completamento, correzione o blocco consegna',async({page})=>{
 const state=await boot(page,'ADMIN',{completeChecklist:true,paid:true,seedHistory:true})
 const gate=await openGate(page)
 const row=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[0]})
 await row.getByRole('button',{name:'Apri storico di '+DELIVERY_CHECKLIST[0]}).click()
 await expect(gate).toContainText('TUTTO VERDE')
 expect(state.workItemPatches).toBe(0)
 await row.getByRole('button',{name:'Correggi '+DELIVERY_CHECKLIST[0]}).click()
 await row.getByTestId('sale360-checklist-undo-submit').click()
 await expect(page.getByTestId('sale360-checklist-count')).toHaveText('6/7')
 await expect(gate).toContainText('Consegna bloccata')
 const history=page.getByTestId('sale-checklist-history')
 await expect(history.getByTestId('sale-checklist-history-event')).toHaveCount(2)
 await expect(history).toContainText('Verifica corretta')
 expect(state.workItemPatches).toBe(1)
})

test('Mod45: verifica modificata da altro operatore aggiorna checklist, gate e storico al ritorno in app',async({page})=>{
 const state=await boot(page,'ADMIN',{pendingChecklist:true,paid:true})
 const gate=await openGate(page)
 await expect(page.getByTestId('sale360-checklist-sync')).toContainText('Checklist sincronizzata')
 const reads=state.snapshotReads
 const target=state.workItems.find(item=>item.title===DELIVERY_CHECKLIST[2])!
 target.status='DONE';target.completed_at='2026-10-22T09:30:00Z';target.updated_at=target.completed_at
 state.checklistHistory.unshift({id:'remote-check',dealer_id:DEALER,vehicle_id:VEHICLE,work_item_id:target.id,
   title:target.title,event_type:'COMPLETED',occurred_at:target.completed_at,actor_name:'Collega Remoto',actor_role:'OPERATORE'})
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect(page.getByTestId('sale360-checklist-count')).toHaveText('3/7')
 await expect(page.getByTestId('sale360-checklist-sync')).toContainText('Checklist aggiornata da un altro dispositivo')
 await expect(page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[2]})).toContainText('Collega Remoto')
 await expect(gate.locator('[data-gate-check="checklist"]')).toContainText('4 controlli mancanti')
 expect(state.snapshotReads).toBeGreaterThan(reads)
 expect(state.workItemPatches).toBe(0)
})
test('Mod45: prima della consegna definitiva confronta il server e blocca una conferma obsoleta',async({page})=>{
 const state=await boot(page,'ADMIN',{completeChecklist:true,paid:true})
 const gate=await openGate(page)
 await expect(page.getByTestId('sale360-checklist-sync')).toContainText('Checklist sincronizzata')
 await expect(gate).toContainText('TUTTO VERDE')
 await gate.getByRole('button',{name:'Consegna veicolo'}).click()
 const target=state.workItems.find(item=>item.title===DELIVERY_CHECKLIST[0])!
 target.status='TODO';target.completed_at=null;target.updated_at='2026-10-22T09:31:00Z'
 await gate.getByRole('button',{name:'Conferma definitivamente'}).click()
 await expect(page.getByTestId('sale360-checklist-count')).toHaveText('6/7')
 await expect(gate).toContainText('Consegna bloccata')
 await expect(page.getByTestId('sale-360')).toBeVisible()
 expect(state.contract.sale_stage).toBe('READY')
 expect(state.workItemPatches).toBe(0)
})
test('Mod45: correzione di un dato già aggiornato altrove non sovrascrive la verifica recente',async({page})=>{
 const state=await boot(page,'ADMIN',{completeChecklist:true,paid:true})
 await openGate(page)
 await expect(page.getByTestId('sale360-checklist-sync')).toContainText('Checklist sincronizzata')
 const row=page.getByTestId('sale360-checklist-item').filter({hasText:DELIVERY_CHECKLIST[0]})
 await row.getByRole('button',{name:'Correggi '+DELIVERY_CHECKLIST[0]}).click()
 state.workItems[0].status='TODO';state.workItems[0].completed_at=null;state.workItems[0].updated_at='2026-10-22T09:32:00Z'
 await row.getByTestId('sale360-checklist-undo-submit').click()
 await expect(page.getByTestId('sale360-checklist-count')).toHaveText('6/7')
 await expect(page.getByTestId('sale360-checklist-sync')).toContainText('Checklist aggiornata da un altro dispositivo')
 expect(state.workItemPatches).toBe(0)
})
test('Mod45: rete interrotta viene segnalata senza scrivere né accedere a finanze; recupero manuale',async({page})=>{
 const state=await boot(page,'VENDITORE',{pendingChecklist:true})
 const gate=await openGate(page)
 await expect(page.getByTestId('sale360-checklist-sync')).toContainText('Checklist sincronizzata')
 state.snapshotOffline=true
 await page.getByTestId('sale360-checklist-sync-refresh').click()
 await expect(page.getByTestId('sale360-checklist-sync')).toContainText('Sincronizzazione non disponibile')
 await expect(page.getByTestId('sale360-checklist-complete').first()).toBeDisabled()
 expect(state.workItemPatches).toBe(0)
 state.snapshotOffline=false
 await page.getByTestId('sale360-checklist-sync-refresh').click()
 await expect(page.getByTestId('sale360-checklist-sync')).toContainText('Checklist sincronizzata')
 await expect(gate).toBeVisible()
 expect(state.financeRequests).toBe(0)
 await expect(page.getByTestId('sale-360-finance')).toHaveCount(0)
})
