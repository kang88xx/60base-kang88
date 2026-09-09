const CACHE = 'momjit-frontend-20260909-service-v3';
const SHELL = [
  '/', '/index.html', '/styles.css', '/main.js',
  '/studio/', '/studio/index.html', '/studio/studio.css', '/studio/studio.js',
  '/app/', '/app/index.html', '/app/app.css', '/app/app.js', '/app/manifest.webmanifest',
  '/app/icons/icon.svg', '/app/icons/icon-192.png', '/app/icons/icon-512.png',
  '/shared/service-store.js', '/shared/service-ui.js', '/shared/service.css',
  '/shared/base.css', '/shared/capture.css', '/shared/data.js', '/shared/store.js', '/shared/ui.js', '/shared/capture.js',
];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); });
self.addEventListener('activate', event => { event.waitUntil((async () => { const keys = await caches.keys(); await Promise.all(keys.filter(key => key.startsWith('momjit-frontend-') && key !== CACHE).map(key => caches.delete(key))); await self.clients.claim(); })()); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try { const response = await fetch(event.request); if (response.ok) await cache.put(url.pathname, response.clone()); return response; }
    catch { const cached = await cache.match(url.pathname); return cached || new Response('오프라인 화면을 준비하지 못했어요. 연결 후 다시 열어주세요.', { status:503, headers:{'Content-Type':'text/plain;charset=utf-8'} }); }
  })());
});
