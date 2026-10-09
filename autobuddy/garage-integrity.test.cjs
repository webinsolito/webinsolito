// Regression contract for AutoBuddy's local Garage persistence.
// Run from repository root: node --test autobuddy/garage-integrity.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, 'index.html'), 'utf8');
const saveSource = html.match(/function save\(\)\{[\s\S]*?\}function uid\(/)?.[0]?.replace(/function uid\($/, '');
assert.ok(saveSource, 'AutoBuddy save() must be present');
const baseline = {version:2, vehicles:[{id:1,plate:'AA111AA'}], deadlines:[], expenses:[], maintenance:[], documents:[], parking:null, activeVehicle:1, kmLog:[]};
function setup(quotaExceeded=false) {
  let persisted=JSON.stringify(baseline), alerts=[];
  const ctx={KEY:'autobuddy.v2',S:structuredClone(baseline),
    localStorage:{setItem(k,v){assert.equal(k,'autobuddy.v2');if(quotaExceeded)throw Error('QuotaExceededError');persisted=v;},getItem(){return persisted;}},
    load(){return JSON.parse(persisted);},render(){},alert(s){alerts.push(s);}};
  vm.createContext(ctx);vm.runInContext(saveSource,ctx);
  return {ctx,alerts,get stored(){return JSON.parse(persisted)}};
}
test('successful Garage write persists across reload',()=>{const x=setup();x.ctx.S.vehicles.push({id:2,plate:'BB222BB'});assert.equal(x.ctx.save(),true);assert.equal(x.stored.vehicles.length,2)});
test('storage quota failure keeps previous Garage state',()=>{const x=setup(true);x.ctx.S.vehicles.push({id:2,plate:'BB222BB'});assert.equal(x.ctx.save(),false);assert.equal(x.stored.vehicles.length,1);assert.equal(x.ctx.S.vehicles.length,1);assert.match(x.alerts[0],/Salvataggio non riuscito/)});
test('duplicate plate and Garage rollback protections exist',()=>{assert.match(html,/S\.vehicles\.some\(v=>v\.plate===plate\)/);assert.match(html,/if\(!save\(\)\)return;\[vPlate,vModel,vYear,vKm\]/)});
test('ServiceBook migration only marks complete after durable save',()=>{assert.match(html,/if\(!save\(\)\)return false;try\{localStorage\.setItem\(flag,'done'\)/)});
