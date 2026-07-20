// NATURA VIDA V8.0.5 — continuidad segura, sin cola offline automática.
const VERSION = 'natura-vida-v8-0-5-continuidad-offline-segura';
const APP_CACHE = 'nv-app-shell-v805';
const IMAGE_CACHE = 'nv-images-v3';
const RUNTIME_CACHE = 'nv-runtime-v805';
const IMAGE_CACHE_LIMIT = 120;
const APP_SHELL = [
  './app-version.json',
  './css/app.css',
  './css/v7.css',
  './css/v8.css',
  './icons/icon-144.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-48.png',
  './icons/icon-512.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './index.html',
  './js/app-update.js',
  './js/app.js',
  './js/auth.js',
  './js/catalog-pdf.js',
  './js/clients.js',
  './js/db.js',
  './js/inbox.js',
  './js/orders.js',
  './js/pricegroups.js',
  './js/products.js',
  './js/quotes.js',
  './js/receipt.js',
  './js/sales.js',
  './js/settings.js',
  './js/state.js',
  './js/supabase-config.js',
  './js/supabase-sync.js',
  './js/ui-helpers.js',
  './js/v7-commercial-center.js',
  './js/v7-distribution.js',
  './js/v7-documents.js',
  './js/v7-finance.js',
  './js/v7-integration-v771.js',
  './js/v7-inventory-sales.js',
  './js/v7-management-center.js',
  './js/v7-orders.js',
  './js/v7-production.js',
  './js/v7-profile-users.js',
  './js/v7-regional.js',
  './js/v7-shell.js',
  './js/v7-stats.js',
  './js/v7-supabase.js',
  './js/v7-workforce.js',
  './js/v8-core.js',
  './js/v8-governance.js',
  './js/v8-linked-stock.js',
  './js/v8-offline-continuity.js',
  './js/v8-roles.js',
  './js/v8-stability.js',
  './js/v8-territory.js',
  './manifest.json',
];
const MAP_HOSTS = new Set(['tile.openstreetmap.org','a.basemaps.cartocdn.com','b.basemaps.cartocdn.com','c.basemaps.cartocdn.com','d.basemaps.cartocdn.com','nominatim.openstreetmap.org']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url)))));
  // La activación continúa controlada desde “Actualizar ahora”.
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => ![APP_CACHE, IMAGE_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function trimImageCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= IMAGE_CACHE_LIMIT) return;
  await Promise.all(keys.slice(0, keys.length - IMAGE_CACHE_LIMIT).map(key => cache.delete(key)));
}

async function imageResponse(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request, { cache: 'no-store' }).then(async response => {
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
      trimImageCache(cache).catch(() => {});
    }
    return response;
  });
  if (cached) { network.catch(() => {}); return cached; }
  return network;
}

async function appShellResponse(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request, { cache: 'no-store' }).then(async response => {
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  });
  if (cached) { network.catch(() => {}); return cached; }
  return network;
}

async function runtimeResponse(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && (response.ok || response.type === 'opaque')) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

function offlinePage() {
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Natura Vida sin conexión</title><body style="margin:0;background:#f4fbf7;font-family:system-ui;color:#143326;display:grid;place-items:center;min-height:100vh;padding:24px"><main style="max-width:420px;background:white;border-radius:24px;padding:28px;text-align:center;box-shadow:0 16px 40px rgba(6,75,46,.12)"><div style="width:70px;height:70px;margin:auto;border-radius:22px;display:grid;place-items:center;background:linear-gradient(135deg,#064b2e,#10a963,#a3d63c);color:white;font-weight:900">NV</div><h1>Natura Vida V8.0.5</h1><p>No se pudo abrir la copia instalada. Conéctate una vez para completar la instalación. La aplicación no enviará operaciones offline.</p><button onclick="location.reload()" style="padding:14px 22px;border:0;border-radius:14px;background:#087044;color:white;font-weight:800">Reintentar</button></main></body></html>`, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (MAP_HOSTS.has(url.hostname) || url.hostname.endsWith('.basemaps.cartocdn.com')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => new Response('', { status: 503, headers: { 'Cache-Control': 'no-store' } })));
    return;
  }

  if (event.request.destination === 'image') {
    event.respondWith(imageResponse(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && (event.request.mode === 'navigate' || ['script','style','font','manifest'].includes(event.request.destination))) {
    event.respondWith(appShellResponse(event.request).catch(async () => {
      if (event.request.mode === 'navigate') {
        const cache = await caches.open(APP_CACHE);
        return (await cache.match('./index.html', { ignoreSearch: true })) || offlinePage();
      }
      return new Response('Sin conexión a internet', { status: 503 });
    }));
    return;
  }

  // Librerías externas esenciales pueden reutilizarse si ya cargaron una vez.
  if (['script','style','font'].includes(event.request.destination)) {
    event.respondWith(runtimeResponse(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => new Response('Sin conexión a internet', { status: 503, headers: { 'Cache-Control': 'no-store' } })));
});
