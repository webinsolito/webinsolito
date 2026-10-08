import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const migration=read('supabase/migrations/0013_security_hardening_v18.sql');
const gateway=read('supabase/functions/gestionalejo-gateway/index.ts');
const router=read('supabase/functions/gestionalejo-router/index.ts');
const telegram=read('supabase/functions/gestionalejo-telegram/index.ts');
const documents=read('supabase/functions/gestionalejo-documents/index.ts');
const session=read('session-security.js');
const config=read('config.js');
const sw=read('sw.js');

test('database revoca privilegi browser larghi e protegge tabelle server-only',()=>{
  assert.match(migration,/revoke all privileges on all tables in schema public from anon/i);
  assert.match(migration,/revoke all privileges on all tables in schema public from authenticated/i);
  assert.match(migration,/revoke all on public\.activation_keys, public\.telegram_links, public\.audit_logs from authenticated, anon/i);
  assert.match(migration,/activation_keys_deny_all/);
  assert.match(migration,/security_rate_limits_deny_all/);
  assert.match(migration,/security_events_deny_all/);
});

test('ruoli database non possono auto-elevare costi fatture o admin',()=>{
  assert.match(migration,/memberships_sensitive_permissions_guard/);
  assert.match(migration,/role <> 'ADMIN'.*admin_manage/s);
  assert.match(migration,/role in \('VENDITORE','OPERATORE'\)/);
  assert.match(migration,/m\.role in \('ADMIN','AMMINISTRAZIONE'\).*view_costs/s);
  assert.match(migration,/m\.role in \('ADMIN','AMMINISTRAZIONE'\).*invoices_view/s);
});

test('sessioni e brute force sono controllati server-side',()=>{
  assert.match(migration,/security_session_active/);
  assert.match(migration,/auth\.sessions/);
  assert.match(migration,/security_rate_limit/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(gateway,/security_session_active/);
  assert.match(gateway,/security_rate_limit/);
  assert.match(gateway,/too_many_attempts/);
  assert.doesNotMatch(gateway,/permissions\?\.admin_manage/);
});

test('gateway riduce enumerazione account e impone password forte',()=>{
  assert.match(gateway,/invalid_credentials/);
  assert.match(gateway,/passwordPolicy/);
  assert.match(gateway,/payload_too_large/);
  assert.match(gateway,/role!=='ADMIN'/);
  assert.match(gateway,/telegram_links.*method:'DELETE'/s);
});

test('Telegram rispetta ruoli economici anche usando service role',()=>{
  assert.match(telegram,/canSeeFinance/);
  assert.match(telegram,/canSeeInvoices/);
  assert.match(telegram,/invoiceAccess\?serviceRest/);
  assert.match(telegram,/security_session_active/);
  assert.match(telegram,/x-telegram-bot-api-secret-token/);
  assert.match(telegram,/Math\.abs\(now-authDate\)>600/);
});

test('documenti verificano firma reale, tenant e sessione',()=>{
  assert.match(documents,/detectedMime/);
  assert.match(documents,/file_signature_not_allowed/);
  assert.match(documents,/file_type_mismatch/);
  assert.match(documents,/private\/\$\{dealerId\}\/\$\{documentId\}/);
  assert.match(documents,/security_session_active/);
  assert.doesNotMatch(documents,/image\/svg\+xml/);
});

test('router usa allowlist stretta di rotte, metodi, origini e dimensioni',()=>{
  assert.match(router,/const ROUTES=new Map/);
  assert.match(router,/method_not_allowed/);
  assert.match(router,/origin_not_allowed/);
  assert.match(router,/payload_too_large/);
  assert.doesNotMatch(router,/access-control-allow-origin['"]\s*:\s*['"]\*['"]/);
});

test('logout e cambio account eliminano cache tenant e mutazioni',()=>{
  assert.match(session,/purgeAllCachedTenants/);
  assert.match(session,/OfflineDB\.clearTenant/);
  assert.match(session,/OfflineDB\.list\('mutations',dealerId\)/);
  assert.match(session,/switched/);
  assert.match(config,/session-security\.js\?v=1\.8\.0/);
  assert.match(sw,/dealer-platform-v1\.8\.0-security-hardening/);
  assert.match(sw,/session-security\.js\?v=1\.8\.0/);
});
