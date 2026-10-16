import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const BASE='11111111-1111-1111-1111-111111111111'
const OWNER='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

async function installBackend(page:Page){
  await page.route(`${PROJECT}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname
    if(path.endsWith('/functions/v1/gestionalejo-router/auth/resolve-login'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'owner-e2e',refresh_token:'owner-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:OWNER,email:'owner@example.test'},dealer:{id:BASE,slug:'malu23',display_name:'MALÙ23 CARS'},profile:{display_name:'Owner Test',username:'owner',role:'ADMIN',permissions:{}}})})
    if(path.endsWith('/functions/v1/dealer-access-status'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,dealer:{id:BASE,slug:'malu23',display_name:'MALÙ23 CARS',status:'ACTIVE',access_expires_at:'2026-11-30T12:00:00Z'},profile:{display_name:'Owner Test',username:'owner',role:'ADMIN',permissions:{}},expired:false,force_password_change:false,days_remaining:45,renewal_available:false,active:true})})
    if(path.endsWith('/functions/v1/dealer-owner-console/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,owner:{label:'Owner Test'},user_id:OWNER})})
    if(path.endsWith('/functions/v1/dealer-owner-console/overview'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,owner:{label:'Owner Test'},dealers:[
      {id:BASE,slug:'malu23',display_name:'MALÙ23 CARS',legal_name:'MALÙ23 CARS SRL',status:'ACTIVE',vat_number:'IT00112233445',contact_email:'info@malu23.test',phone:'0301111111',access_expires_at:'2026-11-30T12:00:00Z',members:{total:3,active:3,admins:1}},
      {id:'22222222-2222-2222-2222-222222222222',slug:'brescia-premium',display_name:'Brescia Premium Auto',legal_name:'Brescia Premium Auto SRL',status:'ACTIVE',vat_number:'IT00998877665',contact_email:'admin@bresciapremium.test',phone:'0302222222',access_expires_at:'2026-10-19T12:00:00Z',members:{total:2,active:2,admins:1}},
      {id:'33333333-3333-3333-3333-333333333333',slug:'torino-motors',display_name:'Torino Motors',legal_name:'Torino Motors SNC',status:'SUSPENDED',vat_number:'IT00776655443',contact_email:'contatti@torinomotors.test',phone:'0113333333',access_expires_at:'2026-11-15T12:00:00Z',members:{total:2,active:1,admins:1}}
    ],registrations:[],renewals:[],support_session:null})})
    if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
  })
}

async function loginAndOpenOwner(page:Page){
  await page.goto('/')
  await page.getByLabel('CODICE CONCESSIONARIA').fill('malu23')
  await page.getByLabel('UTENTE O EMAIL').fill('owner')
  await page.getByLabel('PASSWORD').fill('OwnerPass!123')
  await page.getByRole('button',{name:'Entra',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
  const mobile=(page.viewportSize()?.width||1200)<=760
  await (mobile?page.locator('.mobile-nav button').filter({hasText:'Altro'}):page.locator('.sidebar nav button').filter({hasText:'Altro'})).click()
  await page.getByRole('button',{name:'Apri pannello proprietario'}).click()
  await expect(page.getByText('Pannello proprietario',{exact:true})).toBeVisible()
}

test('OWNER cerca concessionarie e filtra attive, in scadenza e sospese',async({page})=>{
  await installBackend(page)
  await loginAndOpenOwner(page)

  const malu=page.getByTestId('owner-dealer-malu23')
  const brescia=page.getByTestId('owner-dealer-brescia-premium')
  const torino=page.getByTestId('owner-dealer-torino-motors')
  await expect(malu).toBeVisible()
  await expect(brescia).toBeVisible()
  await expect(torino).toBeVisible()

  const search=page.getByLabel('CERCA CONCESSIONARIA')
  await search.fill('torino')
  await expect(torino).toBeVisible()
  await expect(malu).toHaveCount(0)
  await expect(brescia).toHaveCount(0)

  await page.getByRole('button',{name:'Pulisci ricerca'}).click()
  await page.getByRole('button',{name:'In scadenza',exact:true}).click()
  await expect(brescia).toBeVisible()
  await expect(malu).toHaveCount(0)
  await expect(torino).toHaveCount(0)

  await page.getByRole('button',{name:'Sospese',exact:true}).click()
  await expect(torino).toBeVisible()
  await expect(brescia).toHaveCount(0)

  await page.getByRole('button',{name:'Tutte',exact:true}).click()
  await expect(malu).toBeVisible()
  await expect(brescia).toBeVisible()
  await expect(torino).toBeVisible()
  await expect(torino).toContainText('P.IVA IT00776655443')
})
