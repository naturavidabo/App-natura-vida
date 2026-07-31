const CACHE_NAME = 'good-king-v080-shell';
const CACHE_PREFIX = 'good-king-';
const LOCAL_SHELL = [
  './', './index.html', './styles.css?v=0.8.0', './config.js?v=0.8.0', './app.js?v=0.8.0',
  './v06.js?v=0.8.0', './v07.js?v=0.8.0', './v08.js?v=0.8.0', './manifest.webmanifest?v=0.8.0', './version.json',
  './assets/logo.jpg', './assets/icon-192.png', './assets/icon-512.png',
  './assets/icon-maskable-512.png', './assets/apple-touch-icon.png', './assets/favicon-64.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of LOCAL_SHELL) {
      try { await cache.add(new Request(url,{cache:'reload'})); }
      catch (error) { console.warn('[Good King] No se pudo precargar:',url,error); }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request,fallback='./index.html') {
  const cache=await caches.open(CACHE_NAME);
  try {
    const response=await fetch(request,{cache:'no-store'});
    if(response?.ok) await cache.put(request,response.clone());
    return response;
  } catch(error) {
    return (await cache.match(request,{ignoreSearch:true})) || (fallback ? await cache.match(fallback,{ignoreSearch:true}) : null) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache=await caches.open(CACHE_NAME);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached) return cached;
  try { const response=await fetch(request); if(response?.ok) await cache.put(request,response.clone()); return response; }
  catch(error) { return Response.error(); }
}

self.addEventListener('fetch', event => {
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  if(event.request.mode==='navigate') return event.respondWith(networkFirst(event.request));
  if(/\/(version\.json|config\.js|app\.js|v06\.js|v07\.js|v08\.js|styles\.css|manifest\.webmanifest)$/.test(url.pathname)) return event.respondWith(networkFirst(event.request,null));
  event.respondWith(cacheFirst(event.request));
});
