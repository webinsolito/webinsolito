import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const {validateTelegramInitData,buildDashboardMessage,buildTelegramKeyboard,appViewUrl}=await import(new URL('../worker/index.js',import.meta.url));

function signedInitData(token,{user={id:123,first_name:'Luca'},authDate=Math.floor(Date.now()/1000)}={}){
  const params=new URLSearchParams({auth_date:String(authDate),query_id:'AAEAA',user:JSON.stringify(user)});
  const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  params.set('hash',createHmac('sha256',secret).update(check).digest('hex'));
  return params.toString();
}

test('validazione Telegram accetta firma autentica e rifiuta manomissioni',async()=>{
  const token='123456:TEST_TOKEN';
  const valid=await validateTelegramInitData(signedInitData(token),token);
  assert.equal(valid.ok,true);
  assert.equal(valid.user.id,123);
  const tampered=signedInitData(token).replace('Luca','Mario');
  assert.equal((await validateTelegramInitData(tampered,token)).ok,false);
});

test('initData scaduto viene rifiutato',async()=>{
  const token='123456:TEST_TOKEN';
  const expired=signedInitData(token,{authDate:Math.floor(Date.now()/1000)-3600});
  assert.deepEqual(await validateTelegramInitData(expired,token),{ok:false,reason:'expired'});
});

test('dashboard Telegram espone una CTA primaria, incassi, moduli operativi e callback stato',()=>{
  const env={APP_URL:'https://example.test/dealer-platform/'};
  const ctx={dealer:{slug:'malu23',display_name:'MALÙ23 CARS'},profile:{display_name:'Luca'},vehicleCount:42,callbacks:3,deliveries:1,openWorks:4,appointments:2,receivables:12500,overdueInvoices:2,oldStock:3};
  const text=buildDashboardMessage(ctx,'');
  assert.match(text,/3 richiami/);assert.match(text,/1 consegne/);assert.match(text,/4 lavori/);
  assert.match(text,/12\.500/);assert.match(text,/2 scadute/);assert.match(text,/3 auto oltre 60 giorni/);
  const keyboard=buildTelegramKeyboard(env,ctx).inline_keyboard;
  assert.equal(keyboard[0][0].text,'APRI OGGI');
  assert.equal(new URL(keyboard[1][0].web_app.url).searchParams.get('view'),'garage');
  assert.equal(new URL(keyboard[2][0].web_app.url).searchParams.get('view'),'vendite');
  assert.equal(new URL(keyboard[2][1].web_app.url).searchParams.get('view'),'fatture');
  assert.equal(new URL(keyboard[3][1].web_app.url).searchParams.get('view'),'documenti');
  assert.equal(new URL(keyboard[4][0].web_app.url).searchParams.get('view'),'autoscout');
  assert.equal(new URL(keyboard[4][1].web_app.url).searchParams.get('view'),'finanze');
  assert.equal(keyboard.at(-1)[0].callback_data,'dealer:status');
  assert.equal(new URL(appViewUrl(env,'malu23','clients')).searchParams.get('dealer'),'malu23');
});

test('Mini App mantiene solo destinazioni autorizzate nel contratto UI',async()=>{
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  const config=await readFile(new URL('../config.js',import.meta.url),'utf8');
  const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const featureModules=await Promise.all(['sales.js','finances.js','admin.js','backup.js'].map(name=>readFile(new URL(`../${name}`,import.meta.url),'utf8')));
  assert.match(app,/TELEGRAM_VIEWS=new Set\(\['today','garage','clients','calendar','documenti','vendite','fatture','finanze','autoscout'\]\)/);
  assert.match(app,/BackButton\?\.onClick/);
  assert.match(app,/openRequestedView\(\)/);
  assert.match(app,/Riapri la Mini App dal bot/);
  assert.match(config,/version: '1\.8\.1'/);
  assert.match(config,/sales\.js\?v=1\.6\.1/);
  assert.match(config,/autoscout\.js\?v=1\.6\.2/);
  assert.match(config,/backup\.js\?v=1\.6\.1/);
  assert.match(sw,/const CACHE='dealer-platform-v1\.[^']+'/);
  assert.match(sw,/autoscout-safety\.js\?v=1\.6\.3/);
  assert.match(sw,/backup-core\.js\?v=1\.6\.1/);
  assert.match(html,/V1\.6\.1 · Backup sicuro/);
  assert.match(html,/app\.js\?v=1\.6\.1/);
  assert.doesNotMatch(featureModules.join('\n'),/brand\.textContent='V/);
});

