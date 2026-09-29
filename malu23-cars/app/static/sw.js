const CACHE='malu23-cars-v1.13.1';
const ASSETS=['/','/install','/static/style.css','/static/app.js','/static/install.css','/static/install.js','/static/icon-192.png','/static/icon-512.png','/static/brand/malu23_logo.png','/static/brand/malu23_logo_transparent.png','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),
  self.clients.claim()
])));
self.addEventListener('fetch',e=>{
  if(e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
self.addEventListener('push',e=>{
  let data={title:'Malù23 Cars',body:'Hai una nuova attività.',url:'/?view=today'};
  try{ if(e.data) data={...data,...e.data.json()}; }catch(_){ if(e.data) data.body=e.data.text(); }
  const options={
    body:data.body||'',
    icon:'/static/icon-192.png',
    badge:'/static/icon-192.png',
    tag:data.notification_id?`malu23-${data.notification_id}`:'malu23-task',
    renotify:true,
    data:{url:data.url||'/?view=today',notification_id:data.notification_id||null},
    actions:[{action:'open',title:'Apri Malù23 Cars'}]
  };
  e.waitUntil(self.registration.showNotification(data.title||'Malù23 Cars',options));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=e.notification.data?.url||'/?view=today';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){ if('focus' in client){ client.navigate(url); return client.focus(); } }
    return clients.openWindow?clients.openWindow(url):undefined;
  }));
});
