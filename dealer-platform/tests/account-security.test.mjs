import test from 'node:test';
import assert from 'node:assert/strict';
import {forcedPasswordSession,updateForcedPasswordSession} from '../account-security.js';

function memoryStorage(seed={}){const map=new Map(Object.entries(seed));return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),read:k=>map.get(k)}}

test('sessione con password temporanea viene riconosciuta',()=>{
  const session={access_token:'x',dealer:{id:'d1'},profile:{force_password_change:true}};
  const storage=memoryStorage({'dealer-platform-session':JSON.stringify(session)});
  assert.equal(forcedPasswordSession(storage)?.dealer?.id,'d1');
});

test('dopo cambio password la sessione locale perde il flag obbligatorio',()=>{
  const session={access_token:'x',profile:{role:'VENDITORE',force_password_change:true}};
  const storage=memoryStorage();
  const next=updateForcedPasswordSession(storage,session);
  assert.equal(next.profile.force_password_change,false);
  assert.equal(JSON.parse(storage.read('dealer-platform-session')).profile.force_password_change,false);
});

test('sessione normale non apre il gate',()=>{
  const storage=memoryStorage({'dealer-platform-session':JSON.stringify({profile:{force_password_change:false}})});
  assert.equal(forcedPasswordSession(storage),null);
});
