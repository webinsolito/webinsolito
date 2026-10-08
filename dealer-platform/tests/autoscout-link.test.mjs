import test from 'node:test';
import assert from 'node:assert/strict';
import {autoScoutListingHealth,normalizeAutoScoutUrl} from '../autoscout-link.js';

test('accepts only HTTPS AutoScout24 URLs',()=>{
  assert.equal(normalizeAutoScoutUrl('https://www.autoscout24.it/annunci/abc'),'https://www.autoscout24.it/annunci/abc');
  assert.equal(normalizeAutoScoutUrl('http://www.autoscout24.it/annunci/abc'),null);
  assert.equal(normalizeAutoScoutUrl('https://autoscout24.it.evil.example/abc'),null);
  assert.equal(normalizeAutoScoutUrl('https://example.com/annunci/abc'),null);
});

test('published listing must have url, id, date and price',()=>{
  const broken=autoScoutListingHealth({autoscout_status:'PUBLISHED',autoscout_url:'https://www.autoscout24.it/annunci/abc'});
  assert.deepEqual(broken.blocking.sort(),['MISSING_LISTING_ID','MISSING_PRICE','MISSING_PUBLISHED_AT'].sort());
  assert.equal(broken.verified,false);
  const ok=autoScoutListingHealth({autoscout_status:'PUBLISHED',autoscout_url:'https://www.autoscout24.it/annunci/abc',autoscout_listing_id:'123',autoscout_published_at:'2026-10-01T12:00:00Z',autoscout_price:15900},new Date('2026-10-08T12:00:00Z'));
  assert.equal(ok.verified,true);
  assert.equal(ok.daysOnline,7);
});

test('flags stale ads without making them invalid',()=>{
  const health=autoScoutListingHealth({autoscout_status:'PUBLISHED',autoscout_url:'https://www.autoscout24.it/annunci/abc',autoscout_listing_id:'123',autoscout_published_at:'2026-08-01T12:00:00Z',autoscout_price:15900},new Date('2026-10-08T12:00:00Z'));
  assert.equal(health.verified,true);
  assert.ok(health.warnings.includes('STALE_60'));
});
