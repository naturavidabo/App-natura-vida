// NATURA VIDA V7.2 — red obligatoria, actualización controlada e imágenes rápidas.
const VERSION = 'natura-vida-v7-2-6-base-modular-xd';
const IMAGE_CACHE = 'nv-images-v1';
const IMAGE_CACHE_LIMIT = 120;

self.addEventListener('install', () => {
  // La nueva versión queda en espera cuando ya existe una versión activa.
  // El usuario puede activarla desde el botón "Actualizar ahora".
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== IMAGE_CACHE).map(key => caches.delete(key))))
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
  const network = fetch(request).then(async response => {
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
      trimImageCache(cache).catch(() => {});
    }
    return response;
  });
  // Muestra inmediatamente la copia disponible y actualiza en segundo plano.
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  return network;
}

function offlinePage() {
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Natura Vida sin conexión</title><body style="margin:0;background:#f4fbf7;font-family:system-ui;color:#143326;display:grid;place-items:center;min-height:100vh;padding:24px"><main style="max-width:420px;background:white;border-radius:24px;padding:28px;text-align:center;box-shadow:0 16px 40px rgba(6,75,46,.12)"><div style="width:70px;height:70px;margin:auto;border-radius:22px;display:grid;place-items:center;background:linear-gradient(135deg,#064b2e,#10a963);color:white;font-weight:900">NV</div><h1>Natura Vida V7.2</h1><p>Se necesita conexión a internet. La aplicación trabaja directamente con Supabase y no registra ventas sin conexión.</p><button onclick="location.reload()" style="padding:14px 22px;border:0;border-radius:14px;background:#087044;color:white;font-weight:800">Reintentar</button></main></body></html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Las fotografías y logotipos sí se conservan para no descargarlos en cada pantalla.
  if (event.request.destination === 'image') {
    event.respondWith(imageResponse(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // HTML, JavaScript, CSS y datos siempre se consultan en red para evitar versiones viejas.
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).catch(() => {
      if (event.request.mode === 'navigate') return offlinePage();
      return new Response('Sin conexión a internet', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    })
  );
});
