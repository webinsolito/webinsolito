const CACHE='herbarium-v1-shell-1';
const CORE=[
  './','./index.html','./observe.html','./result.html','./collection.html','./book.html','./atlas.html','./academy.html',
  './styles.css','./app.js','./negative-gate.mjs','./local-detector.mjs','./image-security.mjs','./book-plates.js',
  './assets/botanical-sprig.svg',
  './species-bellis-demo.html','./immersive-demo.css','./plant3d-demo.js'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
      return response;
    }).catch(()=>caches.match(request).then(r=>r||caches.match('./index.html'))));
    return;
  }
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  }).catch(()=>caches.match(request)));
});
