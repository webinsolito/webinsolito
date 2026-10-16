import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='11111111-1111-1111-1111-111111111111'
const OLD_PASSWORD='OldPass!12345'

async function installBackend(page:Page){
  let renewalApproved=false
  let loginCount=0
  let changedPassword=''
  await page.route(`${PROJECT}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname
    if(path.endsWith('/functions/v1/gestionalejo-router/auth/resolve-login')){
      loginCount++
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:`e2e-${loginCount}`,refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'admin-user',email:'admin@example.test'},dealer:{id:DEALER,slug:'autosalone-demo',display_name:'Autosalone Demo'},profile:{display_name:'Admin Test',username:'admin',role:'ADMIN',permissions:{},force_password_change:renewalApproved}})})
    }
    if(path.endsWith('/functions/v1/dealer-access-status')){
      const expired=!renewalApproved
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,dealer:{id:DEALER,slug:'autosalone-demo',display_name:'Autosalone Demo',status:'ACTIVE',access_expires_at:expired?'2026-10-15T10:00:00Z':'2026-11-15T10:00:00Z'},profile:{display_name:'Admin Test',username:'admin',role:'ADMIN',force_password_change:renewalApproved},expired,force_password_change:renewalApproved,days_remaining:expired?0:30,renewal_available:expired,active:!expired&&!renewalApproved})})
    }
    if(path.endsWith('/functions/v1/dealer-renewal/request'))return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,request_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',claim_token:'claim-token-with-more-than-thirty-characters-123',status:'PENDING',access_expires_at:'2026-10-15T10:00:00Z',owner_notified:true})})
    if(path.endsWith('/functions/v1/dealer-renewal/status')){
      renewalApproved=true
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,status:'APPROVED',dealer_name:'Autosalone Demo',dealer_slug:'autosalone-demo',access_expires_at:'2026-11-15T10:00:00Z',approved_at:new Date().toISOString()})})
    }
    if(path.endsWith('/functions/v1/gestionalejo-router/account/change-password')){
      changedPassword=(req.postDataJSON() as {password:string}).password
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})})
    }
    if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
  })
  return {get changedPassword(){return changedPassword}}
}

async function login(page:Page,password=OLD_PASSWORD){
  await page.getByLabel('CODICE CONCESSIONARIA').fill('autosalone-demo')
  await page.getByLabel('UTENTE O EMAIL').fill('admin')
  await page.getByLabel('PASSWORD').fill(password)
  await page.getByRole('button',{name:'Entra',exact:true}).click()
}

test('Rinnovo mensile: blocca, richiede approvazione e forza una password nuova',async({page})=>{
  const state=await installBackend(page)
  await page.goto('/')
  await login(page)
  await expect(page.getByRole('heading',{name:'Accesso scaduto'})).toBeVisible()
  await expect(page.getByText(/Nessuna auto, cliente, documento o storico viene eliminato/)).toBeVisible()

  await page.getByRole('button',{name:'Richiedi rinnovo',exact:true}).click()
  await expect(page.getByRole('heading',{name:'La concessionaria, organizzata.'})).toBeVisible()

  await login(page)
  await expect(page.getByRole('heading',{name:'Crea una nuova password'})).toBeVisible()
  await page.getByLabel('NUOVA PASSWORD MENSILE').fill(OLD_PASSWORD)
  await page.getByLabel('CONFERMA PASSWORD MENSILE').fill(OLD_PASSWORD)
  await page.getByRole('button',{name:'Cambia password e continua'}).click()
  await expect(page.getByText('La nuova password deve essere diversa da quella precedente.')).toBeVisible()

  await page.getByLabel('NUOVA PASSWORD MENSILE').fill('NewPass!67890')
  await page.getByLabel('CONFERMA PASSWORD MENSILE').fill('NewPass!67890')
  await page.getByRole('button',{name:'Cambia password e continua'}).click()
  await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
  expect(state.changedPassword).toBe('NewPass!67890')
})
