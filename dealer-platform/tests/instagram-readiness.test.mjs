import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePublicMediaUrl,instagramContentHealth,browserEditableStatus} from '../instagram-readiness.js';

test('accetta solo media HTTPS pubblici',()=>{
  assert.equal(normalizePublicMediaUrl('https://cdn.example.com/car.jpg'),'https://cdn.example.com/car.jpg');
  assert.equal(normalizePublicMediaUrl('http://cdn.example.com/car.jpg'),null);
  assert.equal(normalizePublicMediaUrl('https://localhost/car.jpg'),null);
  assert.equal(normalizePublicMediaUrl('https://192.168.1.10/car.jpg'),null);
});

test('pronto richiede auto caption e media pubblico',()=>{
  const bad=instagramContentHealth({status:'READY',vehicle_id:'',caption:'corta',media_url:'http://localhost/x.jpg'});
  assert.deepEqual(bad.blocking,['MISSING_VEHICLE','CAPTION_TOO_SHORT','INVALID_MEDIA_URL']);
  const good=instagramContentHealth({status:'READY',vehicle_id:'v1',caption:'Auto disponibile, scrivici per maggiori informazioni.',media_url:'https://cdn.example.com/x.jpg'});
  assert.equal(good.ready,true);
});

test('programmazione deve essere futura',()=>{
  const now=new Date('2026-10-08T20:00:00Z');
  assert.ok(instagramContentHealth({status:'SCHEDULED',vehicle_id:'v1',caption:'Auto disponibile, scrivici per maggiori informazioni.',media_url:'https://cdn.example.com/x.jpg',scheduled_at:'2026-10-08T19:00:00Z'},now).blocking.includes('SCHEDULE_NOT_FUTURE'));
  assert.equal(instagramContentHealth({status:'SCHEDULED',vehicle_id:'v1',caption:'Auto disponibile, scrivici per maggiori informazioni.',media_url:'https://cdn.example.com/x.jpg',scheduled_at:'2026-10-09T19:00:00Z'},now).ready,true);
});

test('pubblicato richiede conferma Meta e non è stato editoriale manuale',()=>{
  assert.equal(browserEditableStatus('PUBLISHED'),false);
  assert.ok(instagramContentHealth({status:'PUBLISHED',published_at:new Date().toISOString()}).blocking.includes('UNVERIFIED_PUBLISHED'));
  assert.equal(instagramContentHealth({status:'PUBLISHED',published_at:new Date().toISOString(),meta_media_id:'1789'}).ready,true);
});
