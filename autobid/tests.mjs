import assert from 'node:assert/strict';
import {scan,classify,maxBid,fixtures,costEngine,offerModel} from './core.mjs';
const now=new Date('2026-09-30T00:00:00Z'),valid={id:'a',km:150000,registered:'2020-09-30',accident:false};
const r=scan(fixtures,now);assert.equal(r.duplicates,1);assert.equal(r.cars.length,6);assert.equal(r.cars.filter(c=>c.status==='shortlist').length,2);assert.equal(r.cars.filter(c=>c.status==='excluded').length,3);assert.equal(r.cars.filter(c=>c.status==='review').length,1);
assert.equal(classify(valid,now).status,'shortlist');
assert.equal(classify(valid,new Date('2026-09-30T23:59:00Z')).status,'shortlist');
for(const field of ['km','registered','accident'])assert.equal(classify({...valid,[field]:null},now).status,'review');
assert.equal(classify({...valid,km:150001},now).status,'excluded');
assert.equal(classify({...valid,registered:'2020-09-29'},now).status,'excluded');
assert.equal(classify({...valid,registered:'2026-02-30'},now).status,'review');
assert.equal(classify({...valid,registered:'2027-01-01'},now).status,'review');
assert.equal(scan([valid,{...valid,accident:true}],now).cars[0].status,'excluded');
assert.equal(scan([valid,{...valid,km:null}],now).cars[0].status,'review');
assert.equal(scan([{...valid,id:''}],now).cars[0].status,'review');
assert.equal(maxBid(22000,2000,2500),17500);
for(const unknown of [null,undefined,'',NaN,Infinity,-1])assert.equal(maxBid(22000,unknown,2500),null);
assert.equal(maxBid(22000,0,2500),19500);assert.equal(maxBid(100,200,0),0);
console.log('PASS: fixture → dedup → filters → shortlist → budget; unknown, boundaries, invalid dates, duplicate conflicts');


const fullCosts={fees:700,transport:900,documents:1300,repairs:800,risk:600};
assert.equal(costEngine(fullCosts).total,4300);
assert.deepEqual(costEngine({...fullCosts,risk:null}).unknown,['risk']);
assert.equal(costEngine({...fullCosts,risk:null}).total,null);
const offer=offerModel({...valid,name:'Test',status:'shortlist'},22000,fullCosts,2500);
assert.equal(offer.maxBid,15200);assert.equal(offer.complete,true);
const incomplete=offerModel({...valid,name:'Test',status:'shortlist'},22000,{...fullCosts,transport:null},2500);
assert.equal(incomplete.maxBid,null);assert.equal(incomplete.complete,false);
console.log('PASS: cost engine completo 4.300 EUR → max bid 15.200 EUR; UNKNOWN blocca report');
