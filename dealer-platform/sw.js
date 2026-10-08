const CACHE='dealer-platform-v1.6.1-import-quality';
const CORE=['./','./index.html','./manifest.webmanifest','./config.js?v=1.6.1','./app.js?v=1.6.1','./today-priority.js?v=1.6.1','./delivery-readiness.js?v=1.6.1','./client-followup.js?v=1.6.1','./calendar-priority.js?v=1.6.1','./clients.js?v=1.6.1','./calendar.js?v=1.6.1','./documents.js?v=1.6.1','./contracts.js?v=1.6.1','./invoices.js?v=1.6.1','./sales.js?v=1.6.1','./finances.js?v=1.6.1','./autoscout-advisor.js?v=1.6.1','./autoscout.js?v=1.6.1','./instagram.js?v=1.6.1','./reports.js?v=1.6.1','./admin.js?v=1.6.1','./backup-core.js?v=1.6.1','./backup.js?v=1.6.1','./data-quality.js?v=1.6.2','./api.js','./offline.js'];
const APP_SCOPE=new URL('./',self.location.href).pathname;

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('dealer-platform-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(req.mode==='navigate'&&url.pathname.startsWith(APP_SCOPE)){
    event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));return res}).catch(()=>caches.match('./index.html')));return;
  }
  if(url.origin===self.location.origin&&url.pathname.startsWith(APP_SCOPE)){
    event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res})));return;
  }
  event.respondWith(fetch(req).then(res=>{if(res.ok&&res.type!=='opaque'){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res}).catch(()=>caches.match(req)));
});

self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});

