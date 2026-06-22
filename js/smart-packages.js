/* smart-packages.js — Paquetes inteligentes offline para administradores y representantes.
   Permite exportar/importar actualizaciones parciales sin reemplazar toda la base. */

function packageStamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function packageId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

function basePackageMeta(type, targetRole = 'all', targetId = 'all') {
  return {
    app: 'NATURA_VIDA_BOLIVIA',
    schemaVersion: 1,
    packageType: type,
    packageId: packageId(type),
    createdAt: new Date().toISOString(),
    createdBy: AppState.session ? (AppState.session.fullName || AppState.session.username || 'local') : 'local',
    createdById: AppState.session ? AppState.session.userId : 'local',
    createdByRole: AppState.session ? AppState.session.roleName : 'Local',
    targetRole,
    targetId
  };
}

function downloadJsonPackage(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  openPackageReadySheet(blob, filename, data._meta || {});
  return { blob, filename };
}

function saveJsonPackage(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

async function shareJsonPackage(blob, filename, meta = {}) {
  const file = new File([blob], filename, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Archivo Natura Vida',
        text: `Archivo ${meta.packageType || ''} de Natura Vida`
      });
      return true;
    } catch (_) { return false; }
  }
  showToast('Este navegador no permite compartir archivo directo. Descárgalo y envíalo por WhatsApp como documento.', 'error');
  return false;
}

function openPackageReadySheet(blob, filename, meta = {}) {
  openSheet(`
    <h2>Archivo listo <span class="x" id="closeSheet">✕</span></h2>
    <div class="catalogReadyHero">
      <div class="readyMark">✓</div>
      <div>
        <div class="eyebrow">Paquete inteligente generado</div>
        <h3>${escapeHtml(filename)}</h3>
        <p>Tipo: ${escapeHtml(meta.packageType || 'archivo')} · Fecha: ${new Date().toLocaleString('es-BO')}</p>
      </div>
    </div>
    <div class="exportRow catalogExportRow">
      <div class="exportBtn primaryShare" id="sharePkg"><span class="ic">↗</span><span class="lbl">Compartir</span><span class="sub">WhatsApp / sistema</span></div>
      <div class="exportBtn" id="downloadPkg"><span class="ic">↓</span><span class="lbl">Descargar</span><span class="sub">Guardar archivo</span></div>
    </div>
    <div class="banner catalogShareNote">Usa <strong>Compartir</strong> para enviarlo por WhatsApp. Si tu celular no permite compartir directo, usa Descargar y adjúntalo como documento.</div>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#sharePkg', overlay).addEventListener('click', () => shareJsonPackage(blob, filename, meta));
    $('#downloadPkg', overlay).addEventListener('click', () => { saveJsonPackage(blob, filename); showToast('Archivo descargado.'); });
    if (navigator.canShare) {
      const file = new File([blob], filename, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) setTimeout(() => shareJsonPackage(blob, filename, meta), 450);
    }
  });
}

function safeCatalogProduct(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category || 'General',
    sku: p.sku || '',
    resellerPrice: Number(p.resellerPrice ?? p.wholesalePriceFixed ?? 0) || 0,
    publicPrice: Number(p.publicPrice ?? p.unitPriceFixed ?? 0) || 0,
    wholesalePriceFixed: Number(p.resellerPrice ?? p.wholesalePriceFixed ?? 0) || 0,
    unitPriceFixed: Number(p.publicPrice ?? p.unitPriceFixed ?? 0) || 0,
    stock: Number(p.stock || 0),
    description: p.description || '',
    photo: p.photo || null,
    status: p.status || 'active',
    updatedAt: p.updatedAt || Date.now()
  };
}

async function exportCatalogUpdatePackage() {
  if (!isAdmin()) {
    showToast('Solo el administrador puede exportar catálogo general.', 'error');
    return;
  }
  const payload = {
    _meta: basePackageMeta('catalog_update', 'representative', 'all'),
    products: AppState.products.filter(p => p.status !== 'archived').map(safeCatalogProduct)
  };
  const filename = `NVB_CATALOGO_GENERAL_${packageStamp()}.json`;
  downloadJsonPackage(payload, filename);
  showToast('Actualización de catálogo generada. Usa Compartir para enviarla.');
}

async function exportRepresentativeReportPackage() {
  if (!isReseller()) {
    showToast('Esta función es para representantes/revendedores.', 'error');
    return;
  }
  const sellerId = AppState.session.userId;
  const sales = AppState.sales.filter(s => !s.exportedInReportId && (!s.sellerId || s.sellerId === sellerId || s.type === 'reseller'));
  const payload = {
    _meta: basePackageMeta('representative_report', 'admin', 'admin'),
    representative: {
      id: sellerId,
      name: AppState.session.fullName || AppState.session.username,
      username: AppState.session.username
    },
    sales,
    stockReport: AppState.products.filter(p => p.status !== 'archived').map(p => ({
      productId: p.id,
      name: p.name,
      category: p.category || 'General',
      stock: Number(p.stock || 0),
      resellerPrice: wholesalePrice(p),
      publicPrice: publicPrice(p)
    })),
    clients: AppState.clients || []
  };
  const filename = `NVB_REPORTE_${(AppState.session.username || 'REP').toUpperCase()}_${packageStamp()}.json`;
  downloadJsonPackage(payload, filename);
  showToast('Reporte parcial generado. Usa Compartir para enviarlo.');
}

async function markImportedPackage(meta, summary) {
  await DB.put('importedPackages', {
    id: meta.packageId,
    packageId: meta.packageId,
    packageType: meta.packageType,
    createdAt: meta.createdAt,
    importedAt: Date.now(),
    source: meta.createdBy || '',
    summary: summary || {}
  }, { silent: true }).catch(() => {});
}

async function alreadyImported(packageId) {
  if (!packageId) return false;
  const row = await DB.get('importedPackages', packageId).catch(() => null);
  return !!row;
}

async function applyCatalogUpdatePackage(pkg) {
  const incoming = Array.isArray(pkg.products) ? pkg.products : [];
  let added = 0, updated = 0;
  for (const raw of incoming) {
    if (!raw || !raw.id) continue;
    const existing = AppState.products.find(p => p.id === raw.id);
    if (existing) {
      const preservedStock = isReseller() ? existing.stock : raw.stock;
      Object.assign(existing, normalizeLegacyProduct(Object.assign({}, existing, raw, {
        // Para representantes, actualizar catálogo/precios/foto, pero no pisar su stock propio.
        stock: preservedStock,
        cost: existing.cost || 0,
        updatedAt: Date.now()
      })));
      await DB.put('products', existing, { silent: true });
      updated++;
    } else {
      const prepared = normalizeLegacyProduct(Object.assign({}, raw, {
        cost: 0,
        stock: isReseller() ? 0 : Number(raw.stock || 0),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }));
      AppState.products.push(prepared);
      await DB.put('products', prepared, { silent: true });
      added++;
    }
  }
  await loadAllState();
  return { added, updated, total: incoming.length };
}

async function applyRepresentativeReportPackage(pkg) {
  if (!isAdmin()) throw new Error('Solo el administrador puede importar reportes de representantes.');
  const meta = pkg._meta || {};
  const reportId = meta.packageId || packageId('representative_report');
  const representative = pkg.representative || {};
  const incomingSales = Array.isArray(pkg.sales) ? pkg.sales : [];
  let importedSales = 0;

  for (const s of incomingSales) {
    if (!s || !s.id) continue;
    const exists = AppState.sales.find(x => x.id === s.id || x.importedOriginalId === s.id);
    if (exists) continue;
    const imported = Object.assign({}, s, {
      id: `imported_${s.id}`,
      importedOriginalId: s.id,
      importedFromRepresentative: representative.id || meta.createdById || 'representative',
      importedFromName: representative.name || meta.createdBy || 'Representante',
      importedReportId: reportId,
      importedAt: Date.now(),
      syncStatus: 'imported'
    });
    AppState.sales.push(imported);
    await DB.put('sales', imported, { silent: true });
    importedSales++;
  }

  const report = {
    id: reportId,
    representativeId: representative.id || meta.createdById || '',
    representativeName: representative.name || meta.createdBy || '',
    createdAt: meta.createdAt || new Date().toISOString(),
    importedAt: Date.now(),
    salesCount: incomingSales.length,
    importedSales,
    stockReport: Array.isArray(pkg.stockReport) ? pkg.stockReport : [],
    totalReported: incomingSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0)
  };
  await DB.put('representativeReports', report, { silent: true });
  await loadAllState();
  return { importedSales, salesCount: incomingSales.length, representativeName: report.representativeName };
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); }
      catch (err) { reject(new Error('El archivo no es JSON válido.')); }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsText(file);
  });
}

async function importSmartPackageFromFile(file) {
  const pkg = await readJsonFile(file);
  const meta = pkg._meta || {};
  if (meta.app !== 'NATURA_VIDA_BOLIVIA') {
    throw new Error('No es un paquete inteligente de NATURA VIDA.');
  }
  if (await alreadyImported(meta.packageId)) {
    throw new Error('Este paquete ya fue importado anteriormente.');
  }

  let summary;
  if (meta.packageType === 'catalog_update') {
    const msg = `Actualización de catálogo detectada\n\nOrigen: ${meta.createdBy}\nFecha: ${new Date(meta.createdAt).toLocaleString('es-BO')}\nProductos: ${(pkg.products || []).length}\n\nSe actualizarán precios, fotos y descripciones. En modo representante no se reemplazará tu stock propio.\n\n¿Aplicar actualización?`;
    if (!confirmDialog(msg)) throw new Error('Cancelado');
    summary = await applyCatalogUpdatePackage(pkg);
  } else if (meta.packageType === 'representative_report') {
    const msg = `Reporte parcial detectado\n\nRepresentante: ${(pkg.representative && pkg.representative.name) || meta.createdBy}\nFecha: ${new Date(meta.createdAt).toLocaleString('es-BO')}\nVentas reportadas: ${(pkg.sales || []).length}\n\n¿Incorporar al panel administrador?`;
    if (!confirmDialog(msg)) throw new Error('Cancelado');
    summary = await applyRepresentativeReportPackage(pkg);
  } else {
    throw new Error('Tipo de paquete no soportado todavía: ' + meta.packageType);
  }

  await markImportedPackage(meta, summary);
  return { meta, summary };
}

function openSmartPackagesPanel() {
  openSheet(`
    <h2>Intercambio inteligente <span class="x" id="closeSheet">✕</span></h2>
    <div class="banner">
      Usa archivos parciales para actualizar catálogo, importar reportes y evitar reemplazar toda la copia de seguridad.
    </div>
    ${isAdmin() ? `
      <button class="btn block" id="exportCatalogUpdate" style="margin-bottom:10px;">Exportar catálogo general para representantes</button>
      <label class="btn outline block" style="margin-bottom:10px;">
        Importar reporte/actualización inteligente
        <input type="file" id="smartImportInput" accept=".json" style="display:none;">
      </label>
    ` : `
      <label class="btn block" style="margin-bottom:10px;">
        Importar catálogo/despacho recibido
        <input type="file" id="smartImportInput" accept=".json" style="display:none;">
      </label>
      <button class="btn outline block" id="exportRepReport" style="margin-bottom:10px;">Exportar reporte parcial para administrador</button>
    `}
    <div class="formNotice">
      Nota: por seguridad del celular, la PWA no puede abrir automáticamente archivos de WhatsApp. Debes tocar importar y seleccionar el archivo recibido.
    </div>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    const expCat = $('#exportCatalogUpdate', overlay);
    if (expCat) expCat.addEventListener('click', exportCatalogUpdatePackage);
    const expRep = $('#exportRepReport', overlay);
    if (expRep) expRep.addEventListener('click', exportRepresentativeReportPackage);
    $('#smartImportInput', overlay).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const result = await importSmartPackageFromFile(file);
        showToast('Paquete aplicado correctamente.');
        close();
        render();
      } catch (err) {
        if (err.message !== 'Cancelado') showToast('⚠️ ' + err.message, 'error');
      }
    });
  });
}

window.exportCatalogUpdatePackage = exportCatalogUpdatePackage;
window.exportRepresentativeReportPackage = exportRepresentativeReportPackage;
window.importSmartPackageFromFile = importSmartPackageFromFile;
window.openSmartPackagesPanel = openSmartPackagesPanel;
