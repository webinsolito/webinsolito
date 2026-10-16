import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const OWNER='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

async function installBackend(page:Page){
  let dealerAccessCalls=0
  await page.route(`${PROJECT}/**`,async route=>{
    const path=new URL(route.request().url()).pathname
    if(path.endsWith('/functions/v1/dealer-owner-auth'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'owner-direct-e2e',refresh_token:'owner-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:OWNER,email:'owner@example.test'},dealer:{id:'11111111-1111-1111-1111-111111111111',slug:'malu23',display_name:'MALÙ23 CARS',status:'SUSPENDED'},profile:{display_name:'Owner Test',username:'owner',role:'ADMIN',permissions:{},force_password_change:false}})})
    if(path.endsWith('/functions/v1/dealer-owner-console/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,owner:{label:'Owner Test'},user_id:OWNER})})
    if(path.endsWith('/functions/v1/dealer-owner-console/overview'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,owner:{label:'Owner Test'},dealers:[{id:'22222222-2222-2222-2222-222222222222',slug:'cliente-sospeso',display_name:'Cliente Sospeso',legal_name:'Cliente Sospeso SRL',status:'SUSPENDED',access_expires_at:'2026-10-01T12:00:00Z',members:{total:2,active:2,admins:1}}],registrations:[],renewals:[],support_session:null})})
    if(path.endsWith('/functions/v1/dealer-access-status')){dealerAccessCalls++;return route.fulfill({status:423,contentType:'application/json',body:JSON.stringify({ok:false,error:'dealer_access_locked'})})}
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
  })
  return {get dealerAccessCalls(){return dealerAccessCalls}}
}

test('OWNER entra senza codice concessionaria anche se il dealer base è sospeso',async({page})=>{
  const state=await installBackend(page)
  await page.goto('/')
  await page.getByRole('button',{name:'Accesso proprietario'}).click()
  await expect(page.getByRole('heading',{name:'Accesso proprietario.'})).toBeVisible()
  await page.getByLabel('EMAIL PROPRIETARIO').fill('owner@example.test')
  await page.getByLabel('PASSWORD PROPRIETARIO').fill('OwnerPass!123')
  await page.getByRole('button',{name:'Entra come proprietario'}).click()
  await expect(page.getByText('Pannello proprietario',{exact:true})).toBeVisible()
  await expect(page.getByTestId('owner-dealer-cliente-sospeso')).toContainText('Cliente Sospeso')
  expect(state.dealerAccessCalls).toBe(0)
})
