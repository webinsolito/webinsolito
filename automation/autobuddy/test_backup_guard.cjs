const test = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../../autobuddy/backup-guard.js');
const old = {version:2,vehicles:[{id:1,plate:'OLD'}]};
const next = {version:2,vehicles:[{id:2,plate:'NEW'}]};
const json = JSON.stringify;
const normalize = x => ({...x,version:2,vehicles:x.vehicles,deadlines:x.deadlines||[],expenses:x.expenses||[],maintenance:x.maintenance||[],documents:x.documents||[],kmLog:x.kmLog||[]});
function store(){const m=new Map([['autobuddy.v2',json(old)]]);return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),map:m};}
test('import keeps snapshot and restores old Garage',()=>{
 const s=store();const r=guard.importBackup({text:json(next),storage:s,normalize});
 assert.equal(r.vehicles[0].plate,'NEW');
 assert.equal(JSON.parse(s.getItem(guard.RECOVERY_KEY)).vehicles[0].plate,'OLD');
 assert.equal(guard.restorePrevious({storage:s,normalize}).vehicles[0].plate,'OLD');
});
test('invalid JSON and duplicate ids never touch Garage',()=>{
 const s=store();for(const text of ['{bad',json({version:2,vehicles:[{id:1},{id:1}]})]){
  assert.throws(()=>guard.importBackup({text,storage:s,normalize}));
  assert.equal(s.getItem('autobuddy.v2'),json(old));
 }
});
test('cancellation does not create a snapshot',()=>{
 const s=store();assert.equal(guard.importBackup({text:json(next),storage:s,normalize,confirmImport:()=>false}),null);
 assert.equal(guard.hasRecovery(s),false);
});
test('quota error protects existing Garage',()=>{
 const s=store();s.setItem=(k,v)=>{if(k===guard.RECOVERY_KEY)throw Error('quota');s.map.set(k,v)};
 assert.throws(()=>guard.importBackup({text:json(next),storage:s,normalize}),/Spazio/);
 assert.equal(s.getItem('autobuddy.v2'),json(old));
});
test('orphan expense is rejected rather than silently dropped',()=>{
 const s=store(),b={...next,expenses:[{id:3,veh:999,amt:10}]};
 const sanitizing=x=>({...normalize(x),expenses:[]});
 assert.throws(()=>guard.importBackup({text:json(b),storage:s,normalize:sanitizing}),/perdita/);
 assert.equal(s.getItem('autobuddy.v2'),json(old));
});
test('oversized collection is rejected before truncation',()=>{
 const s=store(),b={version:2,vehicles:Array.from({length:1001},(_,i)=>({id:i+1}))};
 assert.throws(()=>guard.importBackup({text:json(b),storage:s,normalize}),/1000/);
});
