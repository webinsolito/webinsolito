import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Worker Admin usa policy server-side e revoca Telegram alla sospensione',async()=>{
  const worker=await readFile(new URL('../worker/admin.js',import.meta.url),'utf8');
  assert.match(worker,/canAdministerDealer\(member\)/);
  assert.match(worker,/normalizeRolePermissions\(role,value\)/);
  assert.match(worker,/status!=='ACTIVE'/);
  assert.match(worker,/revokeTelegram\(env,auth\.dealerId,userId\)/);
  assert.match(worker,/passwordPolicy\(password\)\.ok/);
  assert.match(worker,/normalizeHttpsLogoUrl/);
});

test('password temporanea viene staged prima del boot e gate è offline-ready',async()=>{
  const config=await readFile(new URL('../config.js',import.meta.url),'utf8');
  const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(config,/dealer-platform-forced-session/);
  assert.match(config,/force_password_change===true/);
  assert.match(config,/localStorage\.removeItem\('dealer-platform-session'\)/);
  assert.match(config,/account-security\.js\?v=1\.6\.6/);
  assert.match(config,/admin-safety\.js\?v=1\.6\.6/);
  assert.match(sw,/admin-policy\.js\?v=1\.6\.6/);
  assert.match(sw,/account-security\.js\?v=1\.6\.6/);
  assert.match(sw,/admin-safety\.js\?v=1\.6\.6/);
});
