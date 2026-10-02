const CACHE='webinsolito-v56-home24-direct-glb';
const CORE=[
  './index.html',
  './apps.json',
  './manifest.webmanifest',
  './assets/webinsolito-logo.svg',
  './assets/home-search-20260925.js',
  './assets/home-3d-v24.js',
  './assets/models/webinsolito-hero-v24.glb',
  './assets/category-page.css',
  './assets/category-page.js',
  './assets/microapp.css',
  './assets/microapp.js'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE.map(async url=>{
      const request=new Request(new URL(url,self.location.href));
      const response=await fetch(request,{cache:'reload',credentials:'same-origin'});
      if(cacheable(request,response))await cache.put(cacheKey(request),response.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('webinsolito-')&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

function cacheKey(request){
  const url=new URL(request.url);
  url.search='';
  url.hash='';
  return url.href;
}

function cacheable(request,response){
  if(!response||!response.ok||response.type!=='basic')return false;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||request.headers.has('range'))return false;
  const policy=(response.headers.get('cache-control')||'').toLowerCase();
  return !policy.includes('no-store')&&!policy.includes('private');
}

async function networkFirst(request){
  const cache=await caches.open(CACHE);
  const key=cacheKey(request);
  try{
    const response=await fetch(request,{cache:'no-store',credentials:'same-origin'});
    if(cacheable(request,response))await cache.put(key,response.clone());
    return response;
  }catch{
    const hit=await cache.match(key);
    if(hit)return hit;
    return new Response(
      request.mode==='navigate'
        ?'Questa pagina non è ancora disponibile offline. Riconnettiti e aprila una volta per salvarla.'
        :'Webinsolito non disponibile offline.',
      {status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}}
    );
  }
}

async function staleWhileRevalidate(request){
  const cache=await caches.open(CACHE);
  const key=cacheKey(request);
  const hit=await cache.match(key);
  const refresh=fetch(request,{cache:'no-cache',credentials:'same-origin'})
    .then(response=>{
      if(cacheable(request,response))cache.put(key,response.clone());
      return response;
    })
    .catch(()=>null);
  if(hit){refresh.catch(()=>{});return hit}
  const response=await refresh;
  return response||new Response('Webinsolito non disponibile offline.',{status:503});
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||request.headers.has('range'))return;
  const url=new URL(request.url);
  if((url.protocol!=='https:'&&url.protocol!=='http:')||url.origin!==self.location.origin)return;
  const fresh=request.mode==='navigate'||url.pathname.endsWith('/apps.json')||url.pathname.includes('/data/');
  event.respondWith(fresh?networkFirst(request):staleWhileRevalidate(request));
});