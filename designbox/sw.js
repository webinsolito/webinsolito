/* DesignBox offline-first: nessuna chiamata ad API esterne. */
const CACHE='designbox-static-v1.5.0';
const CORE=["./","./index.html","./loader.js","./polish.js","./polish.css","./adaptive.css","./adaptive.js","./manifest.webmanifest","./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-icon.png","./payload/p0.txt","./payload/p1.txt","./payload/p2.txt","./payload/p3.txt","./payload/p4.txt","./payload/p5.txt"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('designbox-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const match=await cache.match(req,{ignoreSearch:true});if(match)return match;
 try{const response=await fetch(req);if(response.ok&&response.type==='basic')await cache.put(req,response.clone());return response}
 catch(err){if(req.mode==='navigate'){const fallback=await cache.match('./index.html');if(fallback)return fallback}return Response.error()}})());
});