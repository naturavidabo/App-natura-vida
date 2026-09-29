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
        script.onload = () => {
          if (ready()) return resolve(true);
          script.remove();
          attempt();
        };
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

  function loadLocalModuleV9(key, src, ready) {
    return loadExternalScriptV9(key, src, ready);
  }

  window.ensureTerritoryModuleV9 = () => loadLocalModuleV9('territorio',
    'js/v8-territory.js?v=8.4.0', () => !!window.renderTerritoryV801);

  window.ensureDistributionModuleV9 = () => loadLocalModuleV9('distribucion',
    'js/v7-distribution.js?v=8.4.0', () => !!window.renderDistributionV760);

  window.ensureWorkforceModuleV9 = () => loadLocalModuleV9('personal',
    'js/v7-workforce.js?v=8.4.0', () => !!window.renderWorkforceV770);

  window.ensureRegionalModuleV9 = () => loadLocalModuleV9('regional',
    'js/v7-regional.js?v=8.4.0', () => !!window.renderRegionalManagementV750);

  window.ensureGovernanceModuleV9 = () => loadLocalModuleV9('gobernanza',
    'js/v8-governance.js?v=8.4.0', () => !!window.NV804Governance);

  window.ensureQualityModuleV9 = async () => {
    await window.ensureGovernanceModuleV9();
    return loadLocalModuleV9('calidad',
      'js/v8-quality-assurance.js?v=8.4.0', () => !!window.NV806QualityAssurance);
  };

  window.ensureJsPdfV9 = () => loadExternalScriptV9('jsPDF',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    () => !!(window.jspdf && window.jspdf.jsPDF)
  );
})();
