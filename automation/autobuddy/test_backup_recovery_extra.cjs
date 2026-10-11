const test = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../../autobuddy/backup-guard.js');
const normalize = x => ({...x,version:2,vehicles:x.vehicles||[],deadlines:x.deadlines||[],expenses:x.expenses||[],maintenance:x.maintenance||[],documents:x.documents||[],kmLog:x.kmLog||[]});
test('failed Garage write keeps old undo snapshot', () => {
 const old=JSON.stringify({version:2,vehicles:[{id:1,plate:'OLD'}]});
 const incoming=JSON.stringify({version:2,vehicles:[{id:2,plate:'NEW'}]});
 const undo=JSON.stringify({version:2,vehicles:[{id:3,plate:'UNDO'}]});
 const map=new Map([['autobuddy.v2',old],[guard.RECOVERY_KEY,undo]]);
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(k==='autobuddy.v2')throw Error('quota');map.set(k,v)},removeItem:k=>map.delete(k)};
 assert.throws(()=>guard.importBackup({text:incoming,storage,normalize}),/Spazio/);
 assert.equal(storage.getItem('autobuddy.v2'),old);
 assert.equal(storage.getItem(guard.RECOVERY_KEY),undo);
});

require('./test_storage_rollback.cjs');
