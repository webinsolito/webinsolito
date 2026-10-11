const test=require('node:test');
const assert=require('node:assert/strict');
const guard=require('../../autobuddy/backup-guard.js');
const normalize=x=>({...x,version:2,vehicles:x.vehicles||[],deadlines:x.deadlines||[],expenses:x.expenses||[],maintenance:x.maintenance||[],documents:x.documents||[],kmLog:x.kmLog||[]});
test('rejects malformed canonical values before normalization',()=>{
  const bad=[
    {vehicles:[{id:2,plate:{text:'AA111AA'}}]},
    {vehicles:[{id:2}],expenses:[{id:3,veh:2,amt:true}]},
    {vehicles:[{id:2}],documents:[{id:3,veh:2,data:{blob:'bad'}}]},
    {vehicles:[{id:2}],parking:{lat:{n:45},lng:10.2}}
  ];
  for(const value of bad) assert.throws(()=>guard.parseBackup(JSON.stringify({version:2,...value}),normalize));
});
test('accepts numeric strings in canonical backup',()=>{
  const b={version:2,vehicles:[{id:2,km:'12000'}],expenses:[{id:3,veh:2,amt:'12.50'}]};
  assert.equal(Number(guard.parseBackup(JSON.stringify(b),normalize).expenses[0].amt),12.5);
});
