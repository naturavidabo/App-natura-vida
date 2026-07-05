// service-worker.js — NATURA VIDA V6.8
// Cachea solo la interfaz. Las solicitudes a Supabase nunca se almacenan.

const CACHE_NAME = 'natura-vida-v6-8-assets';

const STATIC_ASSETS = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/db.js', './js/state.js', './js/ui-helpers.js', './js/products.js',
  './js/pricegroups.js', './js/sales.js', './js/clients.js', './js/quotes.js',
  './js/receipt.js', './js/backup.js', './js/settings.js',
  './js/supabase-config.js', './js/supabase-sync.js', './js/auth.js',
  './js/catalog-pdf.js', './js/smart-packages.js', './js/orders.js',
  './js/inbox.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './img/brand/natura-vida-logo.jpeg'
];

const NEVER_CACHE_HOSTS = ['supabase.co', 'supabase.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return (await caches.match(request)) || (await caches.match('./index.html')) || new Response('Sin conexión', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const update = fetch(request, { cache: 'no-store' }).then(async (response) => {
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  return cached || (await update) || new Response('Sin conexión', { status: 503 });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (NEVER_CACHE_HOSTS.some((host) => url.hostname.includes(host))) return;
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});
