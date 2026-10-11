import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSyncConflict,syncIssueLabel} from '../sync-conflict.js';

test('server più recente del baseline genera conflitto',()=>{
  const result=assessSyncConflict({expectedUpdatedAt:'2026-10-11T10:00:00Z',mutationCreatedAt:'2026-10-11T11:00:00Z',serverRow:{updated_at:'2026-10-11T10:30:00Z'}});
  assert.deepEqual(result,{conflict:true,code:'sync_conflict_newer_server'});
  assert.match(syncIssueLabel(result.code),/più recente/);
});

test('server uguale o più vecchio non blocca il sync',()=>{
  assert.equal(assessSyncConflict({expectedUpdatedAt:'2026-10-11T10:00:00Z',serverRow:{updated_at:'2026-10-11T10:00:00Z'}}).conflict,false);
  assert.equal(assessSyncConflict({expectedUpdatedAt:'2026-10-11T10:00:00Z',serverRow:{updated_at:'2026-10-11T09:59:00Z'}}).conflict,false);
});

test('record eliminato sul server genera conflitto se esisteva un baseline',()=>{
  assert.deepEqual(assessSyncConflict({expectedUpdatedAt:'2026-10-11T10:00:00Z',serverRow:null}),{conflict:true,code:'sync_conflict_deleted_server'});
});

test('nuovo record locale senza baseline può essere creato',()=>{
  assert.equal(assessSyncConflict({expectedUpdatedAt:null,mutationCreatedAt:'2026-10-11T10:00:00Z',serverRow:null}).conflict,false);
});

test('fallback protegge una modifica server successiva alla mutazione legacy',()=>{
  assert.equal(assessSyncConflict({mutationCreatedAt:'2026-10-11T10:00:00Z',serverRow:{updated_at:'2026-10-11T10:05:00Z'}}).conflict,true);
});
