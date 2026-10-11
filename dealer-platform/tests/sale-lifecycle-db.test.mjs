import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261011174721_sale_lifecycle_integrity_v191.sql');
const api=read('api.js');
const sw=read('sw.js');

test('database normalizza stato pagamento dagli importi reali',()=>{
  assert.match(migration,/malu23_normalize_invoice_payment/);
  assert.match(migration,/when v_paid >= v_total then 'PAID'/);
  assert.match(migration,/invoices_normalize_payment_v191/);
});

test('database blocca consegna senza contratto firmato saldo e checklist',()=>{
  assert.match(migration,/sale_contract_not_signed/);
  assert.match(migration,/sale_balance_open/);
  assert.match(migration,/sale_financing_not_paid/);
  assert.match(migration,/sale_checklist_incomplete/);
  assert.match(migration,/contracts_sale_lifecycle_v191/);
  assert.match(migration,/vehicles_delivery_guard_v191/);
});

test('guard privilegiati restano nel private schema e non sono eseguibili dal browser',()=>{
  assert.match(migration,/create or replace function private\.malu23_guard_sale_lifecycle/);
  assert.match(migration,/security definer/);
  assert.match(migration,/revoke all on function private\.malu23_guard_sale_lifecycle\(\) from public, anon, authenticated/);
  assert.match(migration,/auth\.uid\(\) is null/);
});

test('offline applica gli stessi blocchi prima di accodare la mutazione',()=>{
  assert.match(api,/enforceBusinessInvariant/);
  assert.match(api,/saleDeliveryGate/);
  assert.match(api,/normalizeInvoicePayment/);
  assert.match(api,/vehicle_delivery_contract_required/);
  assert.match(sw,/sale-lifecycle\.js/);
});
