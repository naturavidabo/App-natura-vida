/* Natura Vida V9 — carga diferida de librerías pesadas no esenciales para el arranque. */
(() => {
  const pending = new Map();

  function loadExternalScriptV9(key, sources, ready) {
    if (ready()) return Promise.resolve(true);
    if (pending.has(key)) return pending.get(key);
    const urls = Array.isArray(sources) ? sources : [sources];
    const promise = new Promise((resolve, reject) => {
      let index = 0;
      const attempt = () => {
        if (ready()) return resolve(true);
        if (index >= urls.length) return reject(new Error(`No se pudo cargar ${key}.`));
        const script = document.createElement('script');
        script.src = urls[index++];
        script.async = true;
        script.onload = () => ready() ? resolve(true) : attempt();
        script.onerror = () => { script.remove(); attempt(); };
        document.head.appendChild(script);
      };
      attempt();
    }).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }

  window.ensureLeafletV9 = () => loadExternalScriptV9('Leaflet', [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
  ], () => !!window.L);

  window.ensureJsPdfV9 = () => loadExternalScriptV9('jsPDF',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    () => !!(window.jspdf && window.jspdf.jsPDF)
  );
})();
