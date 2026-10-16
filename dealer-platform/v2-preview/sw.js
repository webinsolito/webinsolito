const CACHE_PREFIX='dealer-cockpit-static-';
const CACHE=`${CACHE_PREFIX}v2`;
const LEGACY_PREFIXES=['malu23-v2-static-'];
const SCOPE_PATH=new URL(self.registration.scope).pathname;
const STATIC_FALLBACKS=['./manifest.webmanifest','./icon.svg'];

async function putIfCacheable(request,response){
  if(!response||!response.ok||response.type!=='basic')return response;
  const cache=await caches.open(CACHE);
  await cache.put(request,response.clone());
  return response;
}

async function networkFirst(request){
  try{
    const response=await fetch(request,{cache:'no-store'});
    return await putIfCacheable(request,response);
  }catch{
    const cached=await caches.match(request);
    if(cached)return cached;
    if(request.mode==='navigate'){
      const shell=await caches.match(new URL('./',self.registration.scope));
      if(shell)return shell;
    }
    throw new Error('offline_and_not_cached');
  }
}

async function cacheFirstImmutable(request){
  const cached=await caches.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  return putIfCacheable(request,response);
}

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(STATIC_FALLBACKS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>
        (key.startsWith(CACHE_PREFIX)&&key!==CACHE)||LEGACY_PREFIXES.some(prefix=>key.startsWith(prefix))
      ).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(SCOPE_PATH))return;
  if(url.pathname.includes('/api/')||url.pathname.includes('/auth/')||url.pathname.includes('/functions/v1/'))return;

  const isNavigation=request.mode==='navigate'||request.headers.get('accept')?.includes('text/html');
  const isMutableStatic=url.pathname.endsWith('/manifest.webmanifest')||url.pathname.endsWith('/icon.svg')||url.pathname.endsWith('/sw.js');
  const isHashedAsset=/\/assets\/[^/]+-[A-Za-z0-9_-]+\.(?:js|css|map|png|jpg|jpeg|webp|svg|woff2?)$/.test(url.pathname);

  if(isNavigation||isMutableStatic){
    event.respondWith(networkFirst(request));
    return;
  }
  if(isHashedAsset){
    event.respondWith(cacheFirstImmutable(request));
  }
});
