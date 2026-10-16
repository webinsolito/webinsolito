import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const DEALER='aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb'

async function installBackend(page:Page){
  const state={completed:false,vehicleCount:0,companySaves:0,imports:[] as any[],completedCalls:0}
  await page.route(`${PROJECT}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method()
    if(path.endsWith('/functions/v1/gestionalejo-router/auth/resolve-login'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'admin-user',email:'admin@example.test'},dealer:{id:DEALER,slug:'nuova-auto',display_name:'Nuova Auto',legal_name:'Nuova Auto S.r.l.'},profile:{display_name:'Admin',username:'admin',role:'ADMIN',permissions:{}}})})
    if(path.endsWith('/functions/v1/dealer-onboarding/status'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,completed:state.completed,dealer:{id:DEALER,slug:'nuova-auto',display_name:'Nuova Auto',legal_name:'Nuova Auto S.r.l.',vat_number:null,contact_email:null,phone:null},primary_branch:{id:'branch-1',name:'Sede principale',city:null,address:null,is_primary:true},vehicle_count:state.vehicleCount,member_count:1})})
    if(path.endsWith('/functions/v1/dealer-onboarding/company')&&method==='POST'){state.companySaves++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})})}
    if(path.endsWith('/functions/v1/dealer-onboarding/import')&&method==='POST'){const body=req.postDataJSON() as {rows:any[]};state.imports.push(...body.rows);state.vehicleCount+=body.rows.length;return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,inserted:body.rows.length,skipped:[],errors:[]})})}
    if(path.endsWith('/functions/v1/dealer-onboarding/complete')&&method==='POST'){state.completed=true;state.completedCalls++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,completed_at:new Date().toISOString()})})}
    if(path.includes('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
  })
  return state
}

async function login(page:Page){await page.goto('/');await page.getByLabel('CODICE CONCESSIONARIA').fill('nuova-auto');await page.getByLabel('UTENTE O EMAIL').fill('admin');await page.getByLabel('PASSWORD').fill('Demo-Password!1');await page.getByRole('button',{name:'Entra',exact:true}).click()}

test('new dealer completes company, CSV stock import and first-run onboarding',async({page})=>{
  const state=await installBackend(page);await login(page)
  await expect(page.getByRole('heading',{name:'Mettiamo tutto a posto.'})).toBeVisible()
  await page.getByPlaceholder('IT01234567890').fill('IT01234567890')
  await page.getByPlaceholder('info@autosalone.it').fill('info@nuova-auto.test')
  await page.getByPlaceholder('Brescia').fill('Brescia')
  await page.getByPlaceholder('Via Roma 1').fill('Via Milano 10')
  await page.getByTestId('onboarding-company-next').click()
  await expect.poll(()=>state.companySaves).toBe(1)
  await expect(page.getByRole('heading',{name:'Porta dentro il parco auto'})).toBeVisible()
  const csv='Marca;Modello;Targa;Telaio;Anno;Km;Prezzo vendita;Prezzo acquisto;Fornitore;Regime IVA\nVolkswagen;Golf;AB123CD;WVWZZZ12345678901;2022;48000;21900;17500;Fornitore Uno;MARGINE\nFiat;500;CD456EF;;2021;31000;14900;11000;Fornitore Due;IVA_ESPOSTA\n'
  await page.getByTestId('onboarding-import-file').setInputFiles({name:'parco-auto.csv',mimeType:'text/csv',buffer:Buffer.from(csv)})
  await expect(page.getByText('2 righe lette')).toBeVisible()
  await expect(page.getByText('Volkswagen Golf')).toBeVisible()
  await page.getByTestId('onboarding-import-submit').click()
  await expect.poll(()=>state.imports.length).toBe(2)
  expect(state.imports[0].plate).toBe('AB123CD');expect(state.imports[0].purchase_price).toBe(17500);expect(state.imports[1].vat_regime).toBe('IVA_ESPOSTA')
  await expect(page.getByText('2 auto importate')).toBeVisible()
  await page.getByRole('button',{name:/Continua alla fine/}).click()
  await expect(page.getByText('2',{exact:true}).last()).toBeVisible()
  await page.getByTestId('onboarding-complete').click()
  await expect.poll(()=>state.completedCalls).toBe(1)
  await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
})
