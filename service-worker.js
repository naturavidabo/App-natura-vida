// NATURA VIDA V7 — red obligatoria, sin base local ni caché persistente.
const VERSION = 'natura-vida-v7-online-only-20260705';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => {
    if (event.request.mode === 'navigate') {
      return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Natura Vida sin conexión</title><body style="margin:0;background:#f4fbf7;font-family:system-ui;color:#143326;display:grid;place-items:center;min-height:100vh;padding:24px"><main style="max-width:420px;background:white;border-radius:24px;padding:28px;text-align:center;box-shadow:0 16px 40px rgba(6,75,46,.12)"><div style="width:70px;height:70px;margin:auto;border-radius:22px;display:grid;place-items:center;background:linear-gradient(135deg,#064b2e,#10a963);color:white;font-weight:900">NV</div><h1>Natura Vida V7</h1><p>Se necesita conexión a internet. La aplicación trabaja directamente con Supabase y no guarda una base paralela en el celular.</p><button onclick="location.reload()" style="padding:14px 22px;border:0;border-radius:14px;background:#087044;color:white;font-weight:800">Reintentar</button></main></body></html>`, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return new Response('Sin conexión a internet', { status: 503 });
  }));
});
