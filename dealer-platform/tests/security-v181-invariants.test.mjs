import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const migration=read('supabase/migrations/0014_session_revocation_v181.sql');
const gateway=read('supabase/functions/gestionalejo-gateway/index.ts');
const api=read('api.js');
const config=read('config.js');
const sw=read('sw.js');

test('password reset blocca direttamente tutte le tabelle operative',()=>{
  assert.match(migration,/account_security_gate/);
  assert.match(migration,/as restrictive for all to authenticated/i);
  assert.match(migration,/force_password_change,false\)=false/);
  for(const table of ['vehicles','vehicle_financials','vehicle_costs','customers','documents','contracts','invoices'])assert.match(migration,new RegExp(`'${table}'`));
});

test('RPC sensibili sono solo service-role',()=>{
  assert.match(migration,/security_user_id_by_email/);
  assert.match(migration,/security_revoke_user_sessions/);
  assert.match(migration,/revoke all on function public\.security_user_id_by_email\(text\) from public,anon,authenticated/i);
  assert.match(migration,/revoke all on function public\.security_revoke_user_sessions\(uuid,uuid\) from public,anon,authenticated/i);
  assert.match(migration,/auth\.refresh_tokens/);
  assert.match(migration,/delete from auth\.sessions/);
});

test('login email e username passano entrambi dal gateway rate-limited',()=>{
  assert.match(api,/\/auth\/resolve-login/);
  assert.match(api,/identifier:String\(identifier\|\|''\)\.trim\(\)/);
  assert.doesNotMatch(api,/grant_type=password/);
  assert.doesNotMatch(api,/hydrateEmailSession/);
  assert.match(gateway,/identifier=String\(b\.identifier\|\|b\.username/);
  assert.match(gateway,/security_user_id_by_email/);
  assert.match(gateway,/rate\('LOGIN',subject,'CHECK'\)/);
});

test('sospensione e reset password revocano sessioni e Telegram',()=>{
  assert.match(gateway,/status!=='ACTIVE'.*revokeSessions\(userId\)/s);
  assert.match(gateway,/resetPassword.*force_password_change:true.*revokeSessions\(userId\).*telegram_links/s);
  assert.match(gateway,/changeOwnPassword.*revokeSessions\(a\.user\.id,a\.user\._session_id\|\|null\)/s);
});

test('runtime 1.8.1 forza cache nuova',()=>{
  assert.match(config,/version: '1\.8\.1'/);
  assert.match(sw,/dealer-platform-v1\.8\.1-session-containment/);
  assert.match(sw,/config\.js\?v=1\.8\.1/);
});
