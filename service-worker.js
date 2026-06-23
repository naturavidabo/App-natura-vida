const CACHE_NAME = 'natura-vida-v5-0-supabase-cache-offline';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './SUPABASE_MIGRACION_V5_NO_BORRA_DATOS.sql',
  './CAMBIOS_V5_0_SUPABASE_CACHE_OFFLINE.md',
  './css/app.css',
  './js/db.js',
  './js/state.js',
  './js/ui-helpers.js',
  './js/products.js',
  './js/pricegroups.js',
  './js/sales.js',
  './js/clients.js',
  './js/quotes.js',
  './js/receipt.js',
  './js/backup.js',
  './js/settings.js',
  './js/supabase-config.js',
  './js/supabase-sync.js',
  './js/auth.js',
  './js/catalog-pdf.js',
  './js/smart-packages.js',
  './js/orders.js',
  './js/inbox.js',
  './js/app.js',
  './icons/icon-48.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-144.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './img/brand/natura-vida-logo.jpeg',
  './img/brand/natura-vida-perfil-hojas.jpeg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
