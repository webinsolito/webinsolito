import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const ADMIN='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SELLER='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

type Member={user_id:string;username:string;role:string;status:string;display_name:string;email:string;force_password_change:boolean;last_sign_in_at:string|null;telegram_linked:boolean;permissions:Record<string,boolean>}

async function installBackend(page:Page,role='ADMIN'){
  let financeRequests=0
  const members:Member[]=[
    {user_id:ADMIN,username:'titolare',role:'ADMIN',status:'ACTIVE',display_name:'Mario Rossi',email:'mario@example.test',force_password_change:false,last_sign_in_at:'2026-10-16T10:00:00Z',telegram_linked:true,permissions:{}},
    {user_id:SELLER,username:'luca',role:'VENDITORE',status:'ACTIVE',display_name:'Luca Bianchi',email:'luca@example.test',force_password_change:false,last_sign_in_at:null,telegram_linked:false,permissions:{garage_write:true,customers_write:true}}
  ]
  await page.route(`${PROJECT}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname
    if(path.endsWith('/functions/v1/gestionalejo-router/auth/resolve-login'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:role==='ADMIN'?ADMIN:SELLER,email:'user@example.test'},dealer:{id:DEALER,slug:'autosalone-demo',display_name:'Autosalone Demo'},profile:{display_name:role==='ADMIN'?'Mario Rossi':'Luca Bianchi',username:role==='ADMIN'?'titolare':'luca',role,permissions:{}}})})
    if(path.endsWith('/functions/v1/dealer-access-status'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,dealer:{id:DEALER,slug:'autosalone-demo',display_name:'Autosalone Demo',status:'ACTIVE',access_expires_at:'2026-11-15T12:00:00Z'},profile:{display_name:'Mario Rossi',username:'titolare',role,permissions:{}},expired:false,force_password_change:false,days_remaining:30,renewal_available:false,active:true})})
    if(path.endsWith('/functions/v1/gestionalejo-router/admin/overview'))return route.fulfill({status:role==='ADMIN'?200:403,contentType:'application/json',body:JSON.stringify(role==='ADMIN'?{ok:true,dealer:{id:DEALER,slug:'autosalone-demo',display_name:'Autosalone Demo'},members,audit_logs:[],current_user_id:ADMIN}:{ok:false,error:'admin_required'})})
    if(path.endsWith('/functions/v1/gestionalejo-router/admin/member/create')){
      const b=req.postDataJSON() as any
      const row:Member={user_id:'cccccccc-cccc-cccc-cccc-cccccccccccc',username:b.username,role:b.role,status:'ACTIVE',display_name:b.display_name,email:b.email,force_password_change:true,last_sign_in_at:null,telegram_linked:false,permissions:{}}
      members.push(row)
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,user_id:row.user_id,temp_password:'M23-Temporary!2026'})})
    }
    if(path.endsWith('/functions/v1/gestionalejo-router/admin/member/update')){
      const b=req.postDataJSON() as any,row=members.find(m=>m.user_id===b.user_id)
      if(row)Object.assign(row,{display_name:b.display_name,role:b.role,status:b.status})
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})})
    }
    if(path.endsWith('/functions/v1/gestionalejo-router/admin/member/reset-password')){
      const b=req.postDataJSON() as any,row=members.find(m=>m.user_id===b.user_id);if(row)row.force_password_change=true
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,temp_password:'M23-Reset!2026'})})
    }
    if(path.startsWith('/rest/v1/')){
      if(['vehicle_financials','vehicle_costs','invoices'].some(t=>path.includes(`/${t}`)))financeRequests++
      return route.fulfill({status:200,contentType:'application/json',body:'[]'})
    }
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
  })
  return {members,getFinanceRequests:()=>financeRequests}
}

async function login(page:Page){
  await page.goto('/')
  await page.getByLabel('CODICE CONCESSIONARIA').fill('autosalone-demo')
  await page.getByLabel('UTENTE O EMAIL').fill('titolare')
  await page.getByLabel('PASSWORD').fill('demo')
  await page.getByRole('button',{name:'Entra',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
}

async function openMore(page:Page){
  const mobile=(page.viewportSize()?.width||1200)<=760
  await (mobile?page.locator('.mobile-nav button').filter({hasText:'Altro'}):page.locator('.sidebar nav button').filter({hasText:'Altro'})).click()
  await expect(page.getByRole('heading',{name:'Altro'})).toBeVisible()
}

test('Admin gestisce dipendenti: crea, cambia ruolo, sospende e resetta accesso',async({page})=>{
  const state=await installBackend(page,'ADMIN')
  await login(page)
  await openMore(page)
  await page.getByRole('button',{name:'Apri gestione dipendenti'}).click()
  await expect(page.getByRole('heading',{name:'Dipendenti'})).toBeVisible()
  await expect(page.getByTestId('member-luca')).toContainText('Luca Bianchi')

  await page.getByRole('button',{name:'Nuovo dipendente'}).click()
  await page.getByLabel('NOME DIPENDENTE').fill('Anna Verdi')
  await page.getByLabel('EMAIL DIPENDENTE').fill('anna@example.test')
  await page.getByLabel('USERNAME DIPENDENTE').fill('anna')
  await page.getByLabel('RUOLO DIPENDENTE').selectOption('OPERATORE')
  await page.getByRole('button',{name:'Crea accesso'}).click()
  await expect(page.getByTestId('temporary-credentials')).toContainText('M23-Temporary!2026')
  await expect(page.getByTestId('member-anna')).toContainText('Anna Verdi')
  expect(state.members.find(m=>m.username==='anna')?.role).toBe('OPERATORE')

  const anna=page.getByTestId('member-anna')
  await anna.getByLabel('RUOLO anna').selectOption('AMMINISTRAZIONE')
  await anna.getByRole('button',{name:'Salva'}).click()
  await expect.poll(()=>state.members.find(m=>m.username==='anna')?.role).toBe('AMMINISTRAZIONE')

  page.once('dialog',d=>d.accept())
  await anna.getByRole('button',{name:'Sospendi'}).click()
  await expect.poll(()=>state.members.find(m=>m.username==='anna')?.status).toBe('SUSPENDED')
  await expect(page.getByTestId('member-anna')).toContainText('SOSPESO')

  const luca=page.getByTestId('member-luca')
  page.once('dialog',d=>d.accept())
  await luca.getByRole('button',{name:'Reimposta accesso'}).click()
  await expect(page.getByTestId('temporary-credentials')).toContainText('M23-Reset!2026')
  await expect(page.getByTestId('member-luca')).toContainText('Deve cambiare password')
  expect(state.getFinanceRequests()).toBe(0)
})

test('Venditore non vede la gestione dipendenti',async({page})=>{
  await installBackend(page,'VENDITORE')
  await login(page)
  await openMore(page)
  await expect(page.getByRole('button',{name:'Apri gestione dipendenti'})).toHaveCount(0)
})
