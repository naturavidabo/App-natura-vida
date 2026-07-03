// service-worker.js — V6.7
// SOLO cachea assets estaticos (HTML, CSS, JS, iconos).
// NUNCA cachea datos de negocio ni llamadas a Supabase.

const CACHE_NAME = 'natura-vida-v6-7-assets';

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

const NEVER_CACHE_HOSTS = ['supabase.co', 'supabase.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (NEVER_CACHE_HOSTS.some(h => url.hostname.includes(h))) return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('Sin conexion', { status: 503 }));
    })
  );
});
