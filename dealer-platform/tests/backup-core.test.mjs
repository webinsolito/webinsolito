import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKUP_SIGNATURE,BACKUP_STORES,BACKUP_VERSION,backupSummary,mergeForRestore,validateBackup} from '../backup-core.js';

function payload(overrides={}){return {signature:BACKUP_SIGNATURE,version:BACKUP_VERSION,dealer_id:'dealer-1',created_at:'2026-10-08T09:00:00Z',stores:Object.fromEntries(BACKUP_STORES.map(name=>[name,[]])),...overrides}}

test('valida un backup tenant e produce conteggi leggibili',()=>{const value=payload();value.stores.vehicles=[{id:'v1',dealer_id:'dealer-1'}];value.stores.customers=[{id:'c1',dealer_id:'dealer-1'}];const plan=validateBackup(value,'dealer-1');assert.equal(plan.total,2);assert.equal(backupSummary(plan),'2 elementi · 1 auto · 1 clienti · 0 documenti')});

test('rifiuta backup e righe appartenenti a un altro dealer',()=>{assert.throws(()=>validateBackup(payload({dealer_id:'dealer-2'}),'dealer-1'),/backup_wrong_dealer/);const mixed=payload();mixed.stores.vehicles=[{id:'v1',dealer_id:'dealer-2'}];assert.throws(()=>validateBackup(mixed,'dealer-1'),/backup_row_wrong_dealer/)});

test('rifiuta sezioni sconosciute o file non MALÙ23',()=>{const unsafe=payload();unsafe.stores.secrets=[];assert.throws(()=>validateBackup(unsafe,'dealer-1'),/backup_store_not_allowed/);assert.throws(()=>validateBackup({signature:'OTHER'},'dealer-1'),/backup_not_malu23/)});

test('ripristino merge conserva la versione locale più recente',()=>{const current=[{id:'a',updated_at:'2026-10-08T10:00:00Z',value:'locale'},{id:'b',updated_at:'2026-10-08T08:00:00Z',value:'vecchio'}],incoming=[{id:'a',updated_at:'2026-10-08T09:00:00Z',value:'backup'},{id:'b',updated_at:'2026-10-08T09:00:00Z',value:'backup'},{id:'c',dealer_id:'dealer-1',value:'nuovo'}],out=mergeForRestore(current,incoming);assert.equal(out.rows.find(x=>x.id==='a').value,'locale');assert.equal(out.rows.find(x=>x.id==='b').value,'backup');assert.equal(out.rows.find(x=>x.id==='c').value,'nuovo');assert.equal(out.restored,2);assert.equal(out.keptNewer,1)});
