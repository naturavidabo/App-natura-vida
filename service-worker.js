// NATURA VIDA V6.9 — Service Worker online-only.
// No almacena datos ni archivos para trabajo offline. Limpia cachés antiguas.

const VERSION = 'natura-vida-v6-9-online-only';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Todo va a la red. Sin internet, la navegación muestra un mensaje claro.
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).catch(() => {
      if (event.request.mode === 'navigate') {
        return new Response(
          '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sin internet</title><body style="font-family:system-ui;padding:32px;text-align:center"><h1>Natura Vida</h1><p>Se necesita conexión a internet para utilizar la aplicación y acceder a Supabase.</p><button onclick="location.reload()" style="padding:14px 22px;border:0;border-radius:12px;background:#087a3e;color:white;font-weight:700">Reintentar</button></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
      return new Response('Sin conexión a internet', { status: 503 });
    })
  );
});
