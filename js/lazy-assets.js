/* Natura Vida V9 — carga diferida de librerías pesadas no esenciales para el arranque. */
(() => {
  // La versión procede del script raíz ya actualizado; evita módulos PWA obsoletos.
  const ASSET_VERSION_V9 = (() => {
    try {
      const src = document.currentScript?.src ||
        document.querySelector('script[src*="js/lazy-assets.js"]')?.src || '';
      return src ? new URL(src, window.location.href).searchParams.get('v') || '10.1.10' : '10.1.10';
    } catch (_) { return '10.1.10'; }
  })();
  const localAssetV9 = path => path + '?v=' + encodeURIComponent(ASSET_VERSION_V9);
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

  function ensureLeafletCssV9() {
    if (document.querySelector('link[data-nv-leaflet-css="1"]')) return Promise.resolve(true);
    if (pending.has('LeafletCSS')) return pending.get('LeafletCSS');
    const sources = [
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'
    ];
    const promise = new Promise((resolve, reject) => {
      let index = 0;
      const attempt = () => {
        if (index >= sources.length) return reject(new Error('No se pudo cargar Leaflet CSS.'));
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sources[index++];
        link.crossOrigin = '';
        link.dataset.nvLeafletCss = '1';
        link.onload = () => resolve(true);
        link.onerror = () => { link.remove(); attempt(); };
        document.head.appendChild(link);
      };
      attempt();
    }).finally(() => pending.delete('LeafletCSS'));
    pending.set('LeafletCSS', promise);
    return promise;
  }

  window.ensureLeafletV9 = async () => {
    await ensureLeafletCssV9();
    return loadExternalScriptV9('Leaflet', [
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
    ], () => !!window.L);
  };

  function loadLocalModuleV9(key, src, ready) {
    return loadExternalScriptV9(key, src, ready);
  }

  window.ensureTerritoryModuleV9 = async () => {
    // Territorio usa L durante la inicialización; desde V9 Leaflet ya no forma
    // parte del arranque global, por lo que debe estar listo antes del módulo.
    await window.ensureLeafletV9();
    return loadLocalModuleV9('territorio',
      localAssetV9('js/v8-territory.js'), () => !!window.renderTerritoryV801);
  };

  window.ensureDistributionModuleV9 = () => loadLocalModuleV9('distribucion',
    localAssetV9('js/v7-distribution.js'), () => !!window.renderDistributionV760);

  window.ensureWorkforceModuleV9 = () => loadLocalModuleV9('personal',
    localAssetV9('js/v7-workforce.js'), () => !!window.renderWorkforceV770);

  window.ensureRegionalModuleV9 = () => loadLocalModuleV9('regional',
    localAssetV9('js/v7-regional.js'), () => !!window.renderRegionalManagementV750);

  window.ensureGovernanceModuleV9 = () => loadLocalModuleV9('gobernanza',
    localAssetV9('js/v8-governance.js'), () => !!window.NV804Governance);

  window.ensureQualityModuleV9 = async () => {
    await window.ensureGovernanceModuleV9();
    return loadLocalModuleV9('calidad',
      localAssetV9('js/v8-quality-assurance.js'), () => !!window.NV806QualityAssurance);
  };

  window.ensureFinancialAccountsModuleV9 = () => loadLocalModuleV9('cuentas-financieras',
    localAssetV9('js/v8-financial-accounts.js'), () => !!window.renderReceivablesV820);

  window.ensureSellerSettlementModuleV9 = () => loadLocalModuleV9('rendicion-caja',
    localAssetV9('js/v8-seller-settlement.js'), () => !!window.renderSellerSettlementV825);

  window.ensureLinkedStockModuleV9 = () => loadLocalModuleV9('puntos-stock',
    localAssetV9('js/v8-linked-stock.js'), () => !!window.renderLinkedStockV801);

  window.ensureRolesModuleV9 = async () => {
    await window.ensureLinkedStockModuleV9();
    return loadLocalModuleV9('roles-estructura',
      localAssetV9('js/v8-roles.js'), () => !!window.renderRolesStructureV800);
  };

  window.ensureCommercialCenterModuleV9 = () => loadLocalModuleV9('centro-comercial',
    localAssetV9('js/v7-commercial-center.js'), () => !!window.renderCommercialCenterV730);

  window.ensureCommercialRulesModuleV9 = () => loadLocalModuleV9('reglas-comerciales',
    localAssetV9('js/v8-commercial-rules.js'), () => !!window.renderCommercialRulesV807);

  window.ensureStatsModuleV9 = () => loadLocalModuleV9('estadisticas',
    localAssetV9('js/v7-stats.js'), () => !!window.renderCommercialStatsV7);

  window.ensureProfileModuleV9 = () => loadLocalModuleV9('perfil-usuarios',
    localAssetV9('js/v7-profile-users.js'), () => !!window.renderProfileV7);

  window.ensureManagementCenterModuleV9 = () => loadLocalModuleV9('centro-gestion',
    localAssetV9('js/v7-management-center.js'), () => !!window.renderManagementCenterV770);

  window.ensureLegacyFinanceModuleV9 = () => loadLocalModuleV9('finanzas-v7',
    localAssetV9('js/v7-finance.js'), () => !!window.renderFinanceV725);

  window.ensureOrdersV7ModuleV9 = () => loadLocalModuleV9('pedidos-v7',
    localAssetV9('js/v7-orders.js'), () => !!window.renderOrderRequestV7);

  window.ensureRepresentativeSalesModuleV9 = () => loadLocalModuleV9('inventario-ventas-v7',
    localAssetV9('js/v7-inventory-sales.js'), () => !!window.renderRepresentativeSalesV7);

  window.ensureProductionModuleV9 = () => loadLocalModuleV9('produccion',
    localAssetV9('js/v7-production.js'), () => !!window.renderProductionV740);

  window.ensureCatalogPdfModuleV9 = () => loadLocalModuleV9('catalogo-pdf',
    localAssetV9('js/catalog-pdf.js'), () => !!window.openCatalogPdfOptions);

  window.ensureDocumentsV7ModuleV9 = () => loadLocalModuleV9('documentos-v7',
    localAssetV9('js/v7-documents.js'), () => !!window.openV7ReceiptPreview);

  window.ensureIntegrationV771ModuleV9 = () => loadLocalModuleV9('integracion-v771',
    localAssetV9('js/v7-integration-v771.js'), () => !!window.profileAvatarUrlV771);

  window.ensureQuotesModuleV9 = () => loadLocalModuleV9('cotizaciones',
    localAssetV9('js/quotes.js'), () => !!window.renderQuotes);

  window.ensureJsPdfV9 = () => loadExternalScriptV9('jsPDF',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    () => !!(window.jspdf && window.jspdf.jsPDF)
  );
})();
