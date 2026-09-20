const CACHE="lab6-v11";
self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"){return}
  if(u.pathname.endsWith("/data.json")){
    e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match("./data.json"))); return;
  }
  if(e.request.mode==="navigate" || u.pathname.endsWith("/index.html")){
    e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match("./index.html"))); return;
  }
});