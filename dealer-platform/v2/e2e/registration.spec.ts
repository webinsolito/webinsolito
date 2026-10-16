import {expect,test,type Page} from '@playwright/test'

const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co'
const REQUEST='99999999-9999-9999-9999-999999999999'
const DEALER='11111111-1111-1111-1111-111111111111'

test('Registrazione: richiesta senza password, approvazione e creazione accesso',async({page})=>{
  let approved=false
  let registrationBody:any=null
  let activationBody:any=null

  await page.route(`${PROJECT}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname
    if(path.endsWith('/functions/v1/dealer-registration/request')){
      registrationBody=req.postDataJSON()
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,request_id:REQUEST,claim_token:'claim-secret-long-enough-for-e2e-123456789',status:'PENDING',owner_notified:true})})
    }
    if(path.endsWith('/functions/v1/dealer-registration/status')){
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,status:approved?'APPROVED':'PENDING',dealer_name:'Autosalone Demo',dealer_slug:approved?'autosalone-demo':null,approved_at:approved?new Date().toISOString():null})})
    }
    if(path.endsWith('/functions/v1/dealer-registration/activate')){
      activationBody=req.postDataJSON()
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({access_token:'e2e',refresh_token:'e2e',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'admin-user',email:'mario@example.test'},dealer:{id:DEALER,slug:'autosalone-demo',display_name:'Autosalone Demo'},profile:{display_name:'Mario Rossi',username:'mario.rossi',role:'ADMIN',permissions:{}},registration_status:'ACTIVATED'})})
    }
    if(path.startsWith('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'})
    return route.fulfill({status:404,contentType:'application/json',body:'{}'})
  })

  await page.goto('/')
  await page.getByRole('button',{name:/Registra concessionaria/}).click()
  await page.getByLabel('NOME CONCESSIONARIA').fill('Autosalone Demo')
  await page.getByLabel('RAGIONE SOCIALE').fill('Autosalone Demo S.r.l.')
  await page.getByLabel('PARTITA IVA').fill('IT01234567890')
  await page.getByLabel('TELEFONO REGISTRAZIONE').fill('0301234567')
  await page.getByLabel('CITTÀ').fill('Brescia')
  await page.getByLabel('INDIRIZZO').fill('Via Roma 10')
  await page.getByLabel('NOME TITOLARE').fill('Mario Rossi')
  await page.getByLabel('EMAIL TITOLARE').fill('mario@example.test')
  await page.getByLabel('USERNAME REGISTRAZIONE').fill('mario.rossi')
  await page.getByRole('button',{name:'Invia richiesta'}).click()

  await expect(page.getByRole('heading',{name:'In attesa di approvazione'})).toBeVisible()
  expect(registrationBody.password).toBeUndefined()
  expect(registrationBody.dealer_name).toBe('Autosalone Demo')

  approved=true
  await page.reload()
  await expect(page.getByRole('heading',{name:'Ultimo passaggio'})).toBeVisible()
  await expect(page.getByText('autosalone-demo')).toBeVisible()

  await page.getByLabel('NUOVA PASSWORD REGISTRAZIONE').fill('PasswordSicura!2026')
  await page.getByLabel('CONFERMA PASSWORD REGISTRAZIONE').fill('PasswordSicura!2026')
  await page.getByRole('button',{name:'Crea accesso ed entra'}).click()

  await expect(page.getByRole('heading',{name:'Oggi'})).toBeVisible()
  expect(activationBody.password).toBe('PasswordSicura!2026')
  expect(activationBody.claim_token).toContain('claim-secret')
  expect(await page.evaluate(()=>localStorage.getItem('dealer-cockpit-registration'))).toBeNull()
  expect(await page.evaluate(()=>localStorage.getItem('dealer-platform-last-dealer'))).toBe('autosalone-demo')
})
