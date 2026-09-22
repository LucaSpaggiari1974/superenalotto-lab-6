const CACHE="lab6-v17";
const ASSETS=["./","./index.html","./lab-engine.js","./manifest.webmanifest","./data.json"];

async function notify(type,percent,text){
  const clientsList=await self.clients.matchAll({includeUncontrolled:true,type:"window"});
  clientsList.forEach(c=>c.postMessage({type,percent,text}));
}
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(let i=0;i<ASSETS.length;i++){
      try{ await cache.add(ASSETS[i]); }catch(e){ console.warn("Cache asset",ASSETS[i],e); }
      await notify("UPDATE_PROGRESS",Math.round(((i+1)/ASSETS.length)*85),"Scaricamento aggiornamento…");
    }
    await notify("UPDATE_READY",96,"Aggiornamento scaricato…");
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
    .then(()=>notify("UPDATE_COMPLETE",100,"Aggiornamento completato"))
));
self.addEventListener("message",event=>{
  if(event.data&&event.data.type==="SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch",event=>{
  const u=new URL(event.request.url);
  if(event.request.method!=="GET") return;
  if(u.pathname.endsWith("/data.json")){
    event.respondWith(fetch(event.request,{cache:"no-store"}).then(async r=>{
      const cache=await caches.open(CACHE); cache.put(event.request,r.clone()); return r;
    }).catch(()=>caches.match("./data.json")));
    return;
  }
  if(event.request.mode==="navigate" || u.pathname.endsWith("/index.html")){
    event.respondWith(fetch(event.request,{cache:"no-store"}).then(r=>{
      caches.open(CACHE).then(c=>c.put("./index.html",r.clone())); return r;
    }).catch(()=>caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});