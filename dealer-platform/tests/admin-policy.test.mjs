import test from 'node:test';
import assert from 'node:assert/strict';
import {canAdministerDealer,normalizeRolePermissions,passwordPolicy,normalizeHttpsLogoUrl} from '../admin-policy.js';

test('solo un ADMIN attivo può amministrare la concessionaria',()=>{
  assert.equal(canAdministerDealer({role:'ADMIN',status:'ACTIVE'}),true);
  assert.equal(canAdministerDealer({role:'VENDITORE',status:'ACTIVE',permissions:{admin_manage:true}}),false);
  assert.equal(canAdministerDealer({role:'ADMIN',status:'SUSPENDED'}),false);
});

test('il Venditore non può ricevere permessi economici o fatture complete',()=>{
  const permissions=normalizeRolePermissions('VENDITORE',{garage_write:true,customers_write:true,invoices_view:true,invoices_write:true,finance_view:true,view_costs:true,reports_view:true,admin_manage:true});
  assert.deepEqual(permissions,{garage_write:true,customers_write:true});
});

test('ADMIN riceve il set completo noto senza permessi arbitrari',()=>{
  const permissions=normalizeRolePermissions('ADMIN',{evil_permission:true});
  assert.equal(permissions.garage_write,true);
  assert.equal(permissions.finance_view,true);
  assert.equal(permissions.reports_view,true);
  assert.equal('evil_permission' in permissions,false);
  assert.equal('admin_manage' in permissions,false);
});

test('password personale richiede 12 caratteri, maiuscola, minuscola, numero e simbolo',()=>{
  assert.equal(passwordPolicy('sololettereminuscole').ok,false);
  assert.equal(passwordPolicy('Malu23-sicura!').ok,true);
});

test('logo concessionaria accetta solo HTTPS senza credenziali',()=>{
  assert.equal(normalizeHttpsLogoUrl(''),null);
  assert.throws(()=>normalizeHttpsLogoUrl('http://example.com/logo.png'),/invalid_logo_url/);
  assert.throws(()=>normalizeHttpsLogoUrl('https://user:pass@example.com/logo.png'),/invalid_logo_url/);
  assert.equal(normalizeHttpsLogoUrl('https://cdn.example.com/logo.png'),'https://cdn.example.com/logo.png');
});
