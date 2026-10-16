import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const BASE='11111111-1111-1111-1111-111111111111'
const CLIENT='22222222-2222-2222-2222-222222222222'
const OWNER='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

async function installBackend(page:Page){
  let registrationPending=true
  let supportActive=false
  await page.route(`${PROJECT}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname
    if(path.endsWith('/functions/v1/gestionalejo-router/auth/resolve-login'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'owner-e2e',refresh_token:'owner-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:OWNER,email:'owner@example.test'},dealer:{id:BASE,slug:'malu23',display_name:'MALÙ23 CARS'},profile:{display_name:'Owner Test',username:'owner',role:'ADMIN',permissions:{}}})})
    if(path.endsWith('/functions/v1/dealer-access-status'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,dealer:{id:BASE,slug:'malu23',display_name:'MALÙ23 CARS',status:'ACTIVE',access_expires_at:'2026-11-15T12:00:00Z'},profile:{display_name:'Owner Test',username:'owner',role:'ADMIN',permissions:{}},expired:false,force_password_change:false,days_remaining:30,renewal_available:false,active:true})})
    if(path.endsWith('/functions/v1/dealer-owner-console/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,owner:{label:'Owner Test'},user_id:OWNER})})
    if(path.endsWith('/functions/v1/dealer-owner-console/overview')){
      const registrations=registrationPending?[{id:'33333333-3333-3333-3333-333333333333',dealer_name:'Autosalone Nuovo',legal_name:'Autosalone Nuovo SRL',vat_number:'IT12345678901',city:'Brescia',address:'Via Test 1',phone:'0300000000',owner_display_name:'Mario Nuovo',email:'mario@example.test',username:'mario',status:'PENDING',created_at:'2026-10-16T10:00:00Z'}]:[]
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,owner:{label:'Owner Test'},dealers:[{id:BASE,slug:'malu23',display_name:'MALÙ23 CARS',legal_name:'MALÙ23 CARS',status:'ACTIVE',access_expires_at:'2026-11-15T12:00:00Z',members:{total:1,active:1,admins:1}},{id:CLIENT,slug:'autosalone-cliente',display_name:'Autosalone Cliente',legal_name:'Autosalone Cliente SRL',status:'ACTIVE',access_expires_at:'2026-10-20T12:00:00Z',members:{total:2,active:2,admins:1}}],registrations,renewals:[{id:'44444444-4444-4444-4444-444444444444',dealer_id:CLIENT,requested_by:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',status:'PENDING',previous_expires_at:'2026-10-20T12:00:00Z',requested_at:'2026-10-16T10:00:00Z'}],support_session:supportActive?{id:'55555555-5555-5555-5555-555555555555',dealer_id:CLIENT,reason:'Assistenza cliente',started_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString()}:null})})
    }
    if(path.endsWith('/functions/v1/dealer-owner-console/registration/approve')){registrationPending=false;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:{dealer_id:'66666666-6666-6666-6666-666666666666',slug:'autosalone-nuovo'}})})}
    if(path.endsWith('/functions/v1/dealer-owner-console/dealer/detail'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,dealer:{id:CLIENT,slug:'autosalone-cliente',display_name:'Autosalone Cliente',legal_name:'Autosalone Cliente SRL',status:'ACTIVE',access_expires_at:'2026-10-20T12:00:00Z',members:{total:2,active:2,admins:1}},members:[{user_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',username:'clienteadmin',role:'ADMIN',status:'ACTIVE',display_name:'Cliente Admin',email:'cliente@example.test',force_password_change:false,last_sign_in_at:'2026-10-16T09:00:00Z',permissions:{}}],audit_logs:[],owner_user_id:OWNER})})
    if(path.endsWith('/functions/v1/dealer-owner-console/support/start')){supportActive=true;return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,dealer:{id:CLIENT,slug:'autosalone-cliente',display_name:'Autosalone Cliente',status:'ACTIVE',access_expires_at:'2026-10-20T12:00:00Z'},support_session_id:'55555555-5555-5555-5555-555555555555',support_expires_at:new Date(Date.now()+3600000).toISOString(),profile:{display_name:'Owner Test',username:'owner-support',role:'ADMIN',permissions:{garage_write:true,customers_write:true,documents_write:true,invoices_view:true,invoices_write:true,finance_view:true,view_costs:true,costs_write:true,contracts_write:true,calendar_write:true,reports_view:true},force_password_change:false}})})}
    if(path.endsWith('/functions/v1/dealer-owner-console/support/end')){supportActive=false;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,ended:1})})}
    if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
  })
  return {get registrationPending(){return registrationPending},get supportActive(){return supportActive}}
}

async function login(page:Page){
  await page.goto('/')
  await page.getByLabel('CODICE CONCESSIONARIA').fill('malu23')
  await page.getByLabel('UTENTE O EMAIL').fill('owner')
  await page.getByLabel('PASSWORD').fill('OwnerPass!123')
  await page.getByRole('button',{name:'Entra',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
}

async function openMore(page:Page){
  const mobile=(page.viewportSize()?.width||1200)<=760
  await (mobile?page.locator('.mobile-nav button').filter({hasText:'Altro'}):page.locator('.sidebar nav button').filter({hasText:'Altro'})).click()
  await expect(page.getByRole('heading',{name:'Altro'})).toBeVisible()
}

test('OWNER approva clienti, vede utenti ed entra/esce dal supporto senza password cliente',async({page})=>{
  const state=await installBackend(page)
  await login(page)
  await openMore(page)
  await page.getByRole('button',{name:'Apri pannello proprietario'}).click()
  await expect(page.getByText('Pannello proprietario',{exact:true})).toBeVisible()
  await expect(page.getByText('Autosalone Nuovo',{exact:true})).toBeVisible()
  await expect(page.getByTestId('owner-dealer-autosalone-cliente')).toBeVisible()

  const request=page.locator('.owner-request').filter({hasText:'Autosalone Nuovo'})
  await request.getByRole('button',{name:'Approva'}).click()
  await expect.poll(()=>state.registrationPending).toBe(false)
  await expect(page.getByText('Autosalone Nuovo',{exact:true})).toHaveCount(0)

  const client=page.getByTestId('owner-dealer-autosalone-cliente')
  await client.getByRole('button',{name:'Dettagli'}).click()
  await expect(page.getByTestId('owner-member-clienteadmin')).toContainText('Cliente Admin')
  await page.getByRole('button',{name:'Chiudi dettaglio'}).click()

  await page.getByTestId('owner-dealer-autosalone-cliente').getByRole('button',{name:'Entra come supporto'}).click()
  await expect.poll(()=>state.supportActive).toBe(true)
  await expect(page.getByText(/SUPPORTO OWNER · Autosalone Cliente/)).toBeVisible()
  await expect(page.locator('.brand')).toContainText('Autosalone Cliente')

  await page.getByRole('button',{name:'Esci dal supporto'}).click()
  await expect.poll(()=>state.supportActive).toBe(false)
  await expect(page.getByText('Pannello proprietario',{exact:true})).toBeVisible()
  await expect(page.getByTestId('owner-dealer-autosalone-cliente')).toBeVisible()
})
