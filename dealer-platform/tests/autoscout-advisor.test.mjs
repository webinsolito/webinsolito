import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAutoScoutCopy,chooseAutoScoutPriority,stockDays,suggestAutoScoutPrice} from '../autoscout-advisor.js';

const now=new Date('2026-10-08T08:00:00Z');
const vehicles=[
  {id:'v1',brand:'Peugeot',model:'308',version:'GT',year:2018,mileage:92000,status:'IN_VENDITA',purchase_date:'2026-07-01',asking_price:12900},
  {id:'v2',brand:'Fiat',model:'500',status:'DA_CONSEGNARE',purchase_date:'2026-05-01',asking_price:10900}
];
const financials=[{vehicle_id:'v1',purchase_price:8500,minimum_price:10400}];
const costs=[{vehicle_id:'v1',amount:700}];

test('calcola anzianità stock senza valori negativi',()=>{
  assert.equal(stockDays(vehicles[0],now),99);
  assert.equal(stockDays({purchase_date:'2026-12-01'},now),0);
});

test('prezzo suggerito riduce lo stock anziano senza scendere sotto il minimo',()=>{
  const result=suggestAutoScoutPrice(vehicles[0],financials,costs,now);
  assert.equal(result.discount,.05);
  assert.equal(result.suggested,12300);
  assert.equal(result.margin,3100);
});

test('priorità ignora veicoli già prenotati o da consegnare',()=>{
  const result=chooseAutoScoutPriority({vehicles,financials,costs},now);
  assert.equal(result.vehicleId,'v1');
  assert.equal(result.kind,'urgent');
  assert.equal(result.action.kind,'prepare_listing');
});

test('export annuncio non espone targa o telaio e segnala ciò che manca',()=>{
  const advice=suggestAutoScoutPrice(vehicles[0],financials,costs,now);
  const copy=buildAutoScoutCopy({...vehicles[0],plate:'AB123CD',vin:'VF3SECRET'},advice,{photoCount:0});
  assert.match(copy.text,/Peugeot 308 GT/);
  assert.doesNotMatch(copy.text,/AB123CD|VF3SECRET/);
  assert.deepEqual(copy.missing,['foto']);
});
