const CACHE='60base-app-20261011-ego-symbol-v2';
const SHELL=[
  "/app/",
  "/app/index.html",
  "/app/app.js",
  "/app/account-deletion.js",
  "/app/native.js",
  "/app/app.css",
  "/app/launch.js",
  "/app/launch.css",
  "/app/catalog.js",
  "/app/service.js",
  "/app/install.js",
  "/app/preparation.js",
  "/app/preparation.css",
  "/app/device-settings.js",
  "/app/device-settings.css",
  "/app/manifest.webmanifest",
  "/app/icons/icon.svg",
  "/app/icons/symbol.svg",
  "/app/icons/favicon-32.png",
  "/app/icons/icon-192.png",
  "/app/icons/icon-512.png",
  "/shared/base.css",
  "/shared/data.js",
  "/shared/store.js",
  "/shared/ui.js",
  "/shared/service-store.js",
  "/studio/online.css",
  "/studio/online.js",
  "/studio/online-api.js",
  "/studio/access.js",
  "/studio/cloud-account.js",
  "/studio/cloud-account-ui.js",
  "/studio/account-menu.js",
  "/studio/support-faq.js",
  "/studio/copy.svg",
  "/studio/local-records.js",
  "/studio/camera.js",
  "/studio/camera.css",
  "/studio/firebase-config.js",
  "/fonts/PretendardVariable.woff2",
  "/fonts/inter-tight/inter-tight-latin-variable.woff2",
  "/assets/brand/ego-clay-20261010/ego-clay-original.svg",
  "/assets/brand/google-signin-g.png",
  "/app/icons/phosphor/arrow-clockwise.svg",
  "/app/icons/phosphor/arrow-left.svg",
  "/app/icons/phosphor/arrow-right.svg",
  "/app/icons/phosphor/bed.svg",
  "/app/icons/phosphor/broom.svg",
  "/app/icons/phosphor/camera.svg",
  "/app/icons/phosphor/car.svg",
  "/app/icons/phosphor/caret-right.svg",
  "/app/icons/phosphor/check-circle.svg",
  "/app/icons/phosphor/check.svg",
  "/app/icons/phosphor/clock.svg",
  "/app/icons/phosphor/cloud-check.svg",
  "/app/icons/phosphor/cooking-pot.svg",
  "/app/icons/phosphor/device-mobile.svg",
  "/app/icons/phosphor/dots-three.svg",
  "/app/icons/phosphor/download-simple.svg",
  "/app/icons/phosphor/envelope.svg",
  "/app/icons/phosphor/fork-knife.svg",
  "/app/icons/phosphor/gear.svg",
  "/app/icons/phosphor/house.svg",
  "/app/icons/phosphor/magnifying-glass.svg",
  "/app/icons/phosphor/plant.svg",
  "/app/icons/phosphor/play.svg",
  "/app/icons/phosphor/plus.svg",
  "/app/icons/phosphor/question.svg",
  "/app/icons/phosphor/shield-check.svg",
  "/app/icons/phosphor/sign-out.svg",
  "/app/icons/phosphor/squares-four.svg",
  "/app/icons/phosphor/t-shirt.svg",
  "/app/icons/phosphor/upload-simple.svg",
  "/app/icons/phosphor/user.svg",
  "/app/icons/phosphor/video-camera.svg",
  "/app/icons/phosphor/wallet.svg",
  "/app/icons/phosphor/warning-circle.svg",
  "/app/icons/phosphor/x.svg",
  "/assets/videos/collection/dishwashing.jpg",
  "/assets/videos/collection/folding-clothes.jpg",
  "/assets/videos/collection/cutting-vegetables.jpg",
  "/assets/videos/collection/vacuuming.jpg",
  "/assets/videos/collection/folding-towels.jpg",
  "/assets/videos/collection/dishwashing-2.jpg"
];

self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(key=>key.startsWith('60base-app-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim();})());});
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')void self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Private APIs, auth providers and recorded video are never cached.
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.includes(url.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const saved=await cache.match(url.pathname);
  if(saved)return saved;
  try{const response=await fetch(event.request);if(response.ok)await cache.put(url.pathname,response.clone());return response;}
  catch{const saved=await cache.match(url.pathname);return saved||new Response('연결 후 다시 열어주세요.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}
 })());
});
