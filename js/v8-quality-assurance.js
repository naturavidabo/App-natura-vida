/* NATURA VIDA V8.0.6 — respaldo verificable, auditoría y calidad de datos.
   Todas las correcciones sensibles requieren revisión humana. La validación de
   respaldos funciona como simulación: nunca restaura ni reemplaza Supabase. */
(() => {
  'use strict';

  const VERSION = '8.0.6';
  const BACKUP_SCHEMA = 'natura-vida-verified-backup';
  const BACKUP_HISTORY_KEY = 'nv806:backup-history';
  const DRAFT_KEY = 'nv805:safe-draft';
  const MAX_AUDIT_ROWS = 500;
  const EXPORT_STORES = [
    'products','priceGroups','sales','clients','quotes','messages','expenses',
    'receivablePayments','inventoryMovements','commissionRules','commissions',
    'representatives','dispatches','representativeReports','purchaseOrders',
    'rawMaterials','rawMaterialMovements','productionOrders','productionBatches'
  ];

  const esc = value => window.escapeHtml
    ? escapeHtml(String(value ?? ''))
    : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const digits = value => String(value || '').replace(/\D/g, '');
  const asNumber = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const timeValue = row => {
    const raw = row?.createdAt ?? row?.created_at ?? row?.date ?? row?.updatedAt ?? row?.updated_at ?? 0;
    const n = typeof raw === 'number' ? raw : new Date(raw).getTime();
    return Number.isFinite(n) ? n : 0;
  };
  const fmtDate = value => {
    if (!value) return 'Sin fecha';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('es-BO', { dateStyle:'short', timeStyle:'short' });
  };
  const fmtCount = value => Number(value || 0).toLocaleString('es-BO');

  function isCentralAdmin() {
    return Boolean(window.isAdmin && isAdmin());
  }

  function requireCentralAdmin() {
    if (isCentralAdmin()) return true;
    window.showToast?.('Solo el administrador central puede abrir este módulo.', 'error');
    return false;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  async function sha256(text) {
    if (window.crypto?.subtle) {
      const data = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
    }
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8,'0')}`;
  }

  function sanitizeForBackup(value, seen = new WeakSet()) {
    if (value === null || value === undefined) return value ?? null;
    if (typeof value !== 'object') return value;
    if (seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) return value.map(item => sanitizeForBackup(item, seen));
    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      if (/password|passwd|access_token|refresh_token|anon_key|service_role|secret/i.test(key)) return;
      if (typeof val === 'string' && val.startsWith('data:image/') && val.length > 150000) {
        result[key] = '[imagen embebida omitida por tamaño]';
        return;
      }
      result[key] = sanitizeForBackup(val, seen);
    });
    return result;
  }

  async function readStore(storeName) {
    if (storeName === 'rawMaterials') return AppState.rawMaterials || [];
    if (storeName === 'rawMaterialMovements') return AppState.rawMaterialMovements || [];
    if (storeName === 'productionOrders') return AppState.productionOrders || [];
    if (storeName === 'productionBatches') return AppState.productionBatches || [];
    if (Object.prototype.hasOwnProperty.call(AppState, storeName) && Array.isArray(AppState[storeName])) return AppState[storeName] || [];
    return window.DB?.getAll ? DB.getAll(storeName).catch(() => []) : [];
  }

  async function collectAuthorizedData() {
    const entries = await Promise.all(EXPORT_STORES.map(async store => [store, await readStore(store)]));
    const data = Object.fromEntries(entries);
    data.settings = sanitizeForBackup(AppState.settings || {});
    data.profiles = sanitizeForBackup(window.NV804Profiles || AppState.allProfiles || []);
    return sanitizeForBackup(data);
  }

  function dataCounts(data) {
    const counts = {};
    Object.entries(data || {}).forEach(([key, value]) => {
      counts[key] = Array.isArray(value) ? value.length : (value && typeof value === 'object' ? 1 : 0);
    });
    return counts;
  }

  function readBackupHistory() {
    try {
      const rows = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }

  function rememberBackup(meta) {
    const rows = [meta, ...readBackupHistory().filter(row => row.hash !== meta.hash)].slice(0, 20);
    try { localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(rows)); } catch (_) {}
    return rows;
  }

  function downloadBlob(filename, content, type = 'application/json') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function createVerifiedBackup() {
    if (!requireCentralAdmin()) return { ok:false };
    if (!navigator.onLine) {
      window.showToast?.('Se necesita conexión para generar una copia con datos actualizados.', 'error');
      return { ok:false, offline:true };
    }
    const data = await collectAuthorizedData();
    const payloadHash = await sha256(stableStringify(data));
    const counts = dataCounts(data);
    const exportedAt = new Date().toISOString();
    const pack = {
      schema: BACKUP_SCHEMA,
      version: VERSION,
      exportedAt,
      source: 'datos autorizados cargados desde Supabase',
      warning: 'Copia verificable para consulta y simulación. La restauración real debe ejecutarse mediante una función administrativa segura del servidor.',
      manifest: {
        business: AppState.settings?.businessName || 'NATURA VIDA',
        generatedBy: AppState.session?.fullName || AppState.session?.username || AppState.session?.onlineUserId || 'administrador',
        generatedByUserId: AppState.session?.onlineUserId || AppState.session?.userId || '',
        counts
      },
      integrity: { algorithm:'SHA-256', payloadHash },
      data
    };
    const text = JSON.stringify(pack, null, 2);
    const filename = `natura-vida-respaldo-verificado-v806-${exportedAt.slice(0,10)}.json`;
    downloadBlob(filename, text);
    rememberBackup({ exportedAt, hash:payloadHash, filename, counts, size:text.length });
    window.writeAudit?.('backup:verified_export', 'system', 'backup', null, { version:VERSION, hash:payloadHash, counts }).catch(() => {});
    window.showToast?.('Respaldo verificable descargado. Conserva el archivo en un lugar seguro.');
    return { ok:true, pack, filename };
  }

  function duplicateIds(rows) {
    const seen = new Set();
    const duplicates = new Set();
    (rows || []).forEach(row => {
      const id = String(row?.id ?? row?.recordId ?? row?.movementId ?? '').trim();
      if (!id) return;
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    });
    return [...duplicates];
  }

  async function validateBackupObject(pack) {
    const errors = [];
    const warnings = [];
    if (!pack || typeof pack !== 'object') errors.push('El archivo no contiene un objeto JSON válido.');
    if (pack?.schema !== BACKUP_SCHEMA) errors.push('El archivo no corresponde al formato de respaldo verificable de Natura Vida.');
    if (!pack?.version) errors.push('No se encontró la versión de origen.');
    if (!pack?.data || typeof pack.data !== 'object') errors.push('No existe el bloque de datos.');
    const major = String(pack?.version || '').split('.')[0];
    if (major && major !== '8') warnings.push(`El respaldo fue creado en la versión ${pack.version}; requiere una migración antes de restaurar.`);
    const sections = Object.keys(pack?.data || {});
    if (!sections.length) errors.push('El respaldo no contiene secciones.');
    const duplicateSummary = {};
    sections.forEach(section => {
      const value = pack.data[section];
      if (Array.isArray(value)) {
        const dups = duplicateIds(value);
        if (dups.length) duplicateSummary[section] = dups;
      }
    });
    if (Object.keys(duplicateSummary).length) warnings.push('El archivo contiene identificadores repetidos que deben revisarse antes de una restauración.');
    let calculatedHash = '';
    if (pack?.integrity?.payloadHash && pack?.data) {
      calculatedHash = await sha256(stableStringify(pack.data));
      if (calculatedHash !== pack.integrity.payloadHash) errors.push('La huella digital no coincide: el archivo pudo modificarse o dañarse.');
    } else warnings.push('El archivo no incluye una huella digital verificable.');
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      calculatedHash,
      counts:dataCounts(pack?.data || {}),
      duplicateSummary,
      pack
    };
  }

  async function validateBackupFile(file) {
    if (!file) return { ok:false, errors:['Selecciona un archivo JSON.'], warnings:[] };
    try {
      const text = await file.text();
      const pack = JSON.parse(text);
      const result = await validateBackupObject(pack);
      result.filename = file.name;
      result.size = file.size;
      return result;
    } catch (error) {
      return { ok:false, errors:[error?.message || 'No se pudo leer el archivo.'], warnings:[], filename:file.name };
    }
  }

  async function compareBackupWithCurrent(pack) {
    const current = await collectAuthorizedData();
    const rows = [];
    const sections = new Set([...Object.keys(current), ...Object.keys(pack?.data || {})]);
    sections.forEach(section => {
      const nowRows = Array.isArray(current[section]) ? current[section] : [];
      const backupRows = Array.isArray(pack?.data?.[section]) ? pack.data[section] : [];
      const currentIds = new Set(nowRows.map(row => String(row?.id ?? row?.recordId ?? row?.movementId ?? '')).filter(Boolean));
      const backupIds = new Set(backupRows.map(row => String(row?.id ?? row?.recordId ?? row?.movementId ?? '')).filter(Boolean));
      const newInBackup = [...backupIds].filter(id => !currentIds.has(id)).length;
      const existing = [...backupIds].filter(id => currentIds.has(id)).length;
      const absentFromBackup = [...currentIds].filter(id => !backupIds.has(id)).length;
      rows.push({ section, current:nowRows.length, backup:backupRows.length, newInBackup, existing, absentFromBackup });
    });
    return rows.sort((a,b) => b.backup - a.backup || a.section.localeCompare(b.section));
  }

  function issue(code, severity, area, title, detail, entityId = '', meta = {}) {
    return { code, severity, area, title, detail, entityId:String(entityId || ''), meta };
  }

  function groupBy(rows, keyFn) {
    const map = new Map();
    (rows || []).forEach(row => {
      const key = keyFn(row);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }

  function clientCoordinates(client) {
    const lat = asNumber(client?.latitude ?? client?.lat ?? client?.geoLat ?? client?.locationLat);
    const lng = asNumber(client?.longitude ?? client?.lng ?? client?.lon ?? client?.geoLng ?? client?.locationLng);
    return { lat, lng };
  }

  function inspectClients(clients) {
    const issues = [];
    const names = groupBy(clients, c => norm(c?.name || c?.businessName || c?.contactName));
    const phones = groupBy(clients, c => {
      const phone = digits(c?.phone || c?.whatsapp);
      return phone.length >= 7 ? phone : '';
    });
    names.forEach((rows, key) => {
      if (rows.length > 1 && key.length >= 4) issues.push(issue('client_duplicate_name','warning','Clientes','Nombres repetidos o muy similares', rows.map(r => r.name || r.businessName || 'Sin nombre').join(' / '), rows[0]?.id, { count:rows.length }));
    });
    phones.forEach((rows, phone) => {
      if (rows.length > 1) issues.push(issue('client_duplicate_phone','critical','Clientes','WhatsApp o teléfono repetido', `${phone} aparece en ${rows.length} fichas.`, rows[0]?.id, { count:rows.length }));
    });
    (clients || []).forEach(client => {
      const name = String(client?.name || client?.businessName || '').trim();
      const phone = digits(client?.phone || client?.whatsapp);
      const { lat, lng } = clientCoordinates(client);
      if (!name) issues.push(issue('client_missing_name','critical','Clientes','Cliente sin nombre','La ficha no tiene un nombre o negocio identificable.',client?.id));
      if (phone && phone.length < 7) issues.push(issue('client_invalid_phone','warning','Clientes','Teléfono incompleto',`${name || 'Cliente'} tiene ${phone.length} dígitos.`,client?.id));
      if ((lat === 0 && lng === 0) || (lat !== null && (lat < -90 || lat > 90)) || (lng !== null && (lng < -180 || lng > 180))) {
        issues.push(issue('client_invalid_location','critical','Clientes','Ubicación inválida',`${name || 'Cliente'} tiene coordenadas fuera de rango o 0,0.`,client?.id));
      } else if ((lat === null) !== (lng === null)) {
        issues.push(issue('client_partial_location','warning','Clientes','Ubicación incompleta',`${name || 'Cliente'} tiene solo una coordenada.`,client?.id));
      }
    });
    return issues;
  }

  function productPrice(product) {
    return asNumber(product?.publicPrice ?? product?.unitPriceFixed ?? product?.marketPrice ?? product?.resellerPrice ?? 0) ?? 0;
  }

  function inspectProducts(products) {
    const issues = [];
    const skuGroups = groupBy(products, p => norm(p?.sku));
    const nameGroups = groupBy(products, p => norm(p?.name));
    skuGroups.forEach((rows, sku) => {
      if (sku && rows.length > 1) issues.push(issue('product_duplicate_sku','critical','Productos','Código SKU repetido',`${sku} aparece en ${rows.length} productos.`,rows[0]?.id));
    });
    nameGroups.forEach((rows, name) => {
      if (name && rows.length > 1) issues.push(issue('product_duplicate_name','warning','Productos','Nombre de producto repetido',rows.map(r=>r.name).join(' / '),rows[0]?.id));
    });
    (products || []).forEach(product => {
      const name = product?.name || 'Producto sin nombre';
      const stock = asNumber(product?.stock);
      const cost = asNumber(product?.cost ?? product?.baseCost ?? 0);
      const price = productPrice(product);
      if (!String(product?.name || '').trim()) issues.push(issue('product_missing_name','critical','Productos','Producto sin nombre','Debe asignarse una denominación.',product?.id));
      if (stock === null) issues.push(issue('product_invalid_stock','critical','Inventario','Stock no numérico',`${name} no tiene una cantidad válida.`,product?.id));
      else if (stock < 0) issues.push(issue('product_negative_stock','critical','Inventario','Stock negativo',`${name}: ${stock}.`,product?.id));
      if (cost === null || cost < 0) issues.push(issue('product_invalid_cost','critical','Productos','Costo inválido',`${name} tiene un costo negativo o no numérico.`,product?.id));
      if (price < 0) issues.push(issue('product_invalid_price','critical','Productos','Precio inválido',`${name} tiene un precio negativo.`,product?.id));
      if ((cost || 0) > 0 && price > 0 && cost > price) issues.push(issue('product_price_below_cost','critical','Productos','Precio menor al costo',`${name}: costo ${cost}, precio ${price}.`,product?.id));
    });
    return issues;
  }

  function saleItems(sale) {
    return Array.isArray(sale?.items) ? sale.items : [];
  }

  function inspectSales(sales, products) {
    const issues = [];
    const productIds = new Set((products || []).map(p => String(p.id)));
    duplicateIds(sales).forEach(id => issues.push(issue('sale_duplicate_id','critical','Ventas','Identificador de venta repetido',`La venta ${id} aparece más de una vez.`,id)));
    const sorted = [...(sales || [])].sort((a,b) => timeValue(a)-timeValue(b));
    const fingerprints = new Map();
    sorted.forEach(sale => {
      const key = [norm(sale?.clientName || sale?.client?.name), Number(sale?.total || 0).toFixed(2), String(sale?.sellerId || sale?.seller_user_id || '')].join('|');
      const prior = fingerprints.get(key);
      if (prior && Math.abs(timeValue(sale)-timeValue(prior)) <= 120000 && String(sale.id) !== String(prior.id)) {
        issues.push(issue('sale_probable_duplicate','warning','Ventas','Posible venta duplicada',`${sale.clientName || 'Sin cliente'} · ${Number(sale.total || 0).toFixed(2)} · registros separados por menos de 2 minutos.`,sale.id,{ otherId:prior.id }));
      }
      fingerprints.set(key, sale);
      saleItems(sale).forEach((item, index) => {
        const qty = asNumber(item?.qty ?? item?.quantity);
        const productId = String(item?.productId ?? item?.product_id ?? '');
        if (qty === null || qty <= 0) issues.push(issue('sale_invalid_quantity','critical','Ventas','Cantidad inválida',`Venta ${sale.id || ''}, ítem ${index+1}.`,sale.id));
        if (productId && !productIds.has(productId)) issues.push(issue('sale_orphan_product','warning','Ventas','Producto no encontrado en catálogo',`Venta ${sale.id || ''} referencia ${productId}.`,sale.id));
      });
    });
    return issues;
  }

  function movementProductId(row) {
    return String(row?.productId ?? row?.product_id ?? row?.materialId ?? row?.material_id ?? '');
  }

  function movementQuantity(row) {
    return asNumber(row?.delta ?? row?.quantity ?? row?.qty ?? row?.amount ?? row?.stockDelta);
  }

  function beforeStock(row) {
    return asNumber(row?.stockBefore ?? row?.beforeStock ?? row?.previousStock ?? row?.stock_before);
  }

  function afterStock(row) {
    return asNumber(row?.stockAfter ?? row?.afterStock ?? row?.newStock ?? row?.stock_after ?? row?.centralStockAfter ?? row?.representativeStockAfter);
  }

  function inspectInventory(movements, products) {
    const issues = [];
    const productMap = new Map((products || []).map(p => [String(p.id), p]));
    duplicateIds(movements).forEach(id => issues.push(issue('movement_duplicate_id','critical','Inventario','Movimiento repetido',`El movimiento ${id} aparece más de una vez.`,id)));
    const byProduct = groupBy(movements, movementProductId);
    (movements || []).forEach(row => {
      const pid = movementProductId(row);
      const qty = movementQuantity(row);
      if (!pid) issues.push(issue('movement_missing_product','critical','Inventario','Movimiento sin producto','No puede conciliarse con el inventario.',row?.id));
      else if (!productMap.has(pid)) issues.push(issue('movement_orphan_product','warning','Inventario','Movimiento de producto inexistente',`Producto ${pid}.`,row?.id));
      if (qty === null || qty === 0) issues.push(issue('movement_invalid_quantity','warning','Inventario','Movimiento sin cantidad válida',`Movimiento ${row?.id || 'sin ID'}.`,row?.id));
    });
    byProduct.forEach((rows, pid) => {
      const ordered = [...rows].sort((a,b) => timeValue(a)-timeValue(b));
      let previousAfter = null;
      ordered.forEach(row => {
        const before = beforeStock(row);
        const after = afterStock(row);
        if (previousAfter !== null && before !== null && Math.abs(previousAfter-before) > 0.0001) {
          issues.push(issue('movement_sequence_gap','critical','Inventario','Ruptura en la secuencia de stock',`Producto ${productMap.get(pid)?.name || pid}: el stock anterior no coincide con el movimiento precedente.`,row?.id));
        }
        if (after !== null) previousAfter = after;
      });
      const current = asNumber(productMap.get(pid)?.stock);
      if (previousAfter !== null && current !== null && Math.abs(previousAfter-current) > 0.0001) {
        issues.push(issue('inventory_current_mismatch','critical','Inventario','Stock actual no coincide con el último movimiento',`${productMap.get(pid)?.name || pid}: último saldo ${previousAfter}, stock visible ${current}.`,pid));
      }
    });
    return issues;
  }

  function inspectProfiles(profiles) {
    const issues = [];
    (profiles || []).forEach(profile => {
      const classification = window.NV804Governance?.classifyProfile
        ? NV804Governance.classifyProfile(profile)
        : { demo:/demo|prueba|test/i.test([profile.full_name,profile.email].join(' ')), missing:[], activity:{total:0} };
      if (classification.demo) issues.push(issue('profile_demo','warning','Usuarios','Posible usuario demo',`${profile.full_name || profile.email || profile.id} · ${classification.activity.total} registros vinculados.`,profile.id,{ profile, activity:classification.activity.total }));
      if (classification.missing?.length) issues.push(issue('profile_incomplete','warning','Usuarios','Perfil incompleto',`${profile.full_name || profile.email || profile.id}: falta ${classification.missing.join(', ')}.`,profile.id,{ profile }));
    });
    return issues;
  }

  function inspectOfflineDraft() {
    const issues = [];
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) {
      issues.push(issue('draft_corrupt','warning','Borradores','Borrador local dañado','No puede interpretarse y debería descartarse desde Continuidad sin conexión.'));
      return issues;
    }
    if (!draft) return issues;
    const age = Date.now() - new Date(draft.savedAt || 0).getTime();
    if (!draft.savedAt || !Number.isFinite(age)) issues.push(issue('draft_missing_date','warning','Borradores','Borrador sin fecha','Debe revisarse antes de restaurar.'));
    else if (age > 7*24*60*60*1000) issues.push(issue('draft_old','warning','Borradores','Borrador antiguo',`Guardado ${fmtDate(draft.savedAt)}.`));
    if (draft.version && draft.version !== VERSION) issues.push(issue('draft_version','warning','Borradores','Borrador de una versión anterior',`Origen ${draft.version}; debe revisarse campo por campo antes de guardar.`));
    return issues;
  }

  async function buildQualityReport() {
    const [movements, profiles] = await Promise.all([
      readStore('inventoryMovements'),
      (async () => {
        if (window.NV804Governance?.collectProfiles && isCentralAdmin() && navigator.onLine) await NV804Governance.collectProfiles().catch(() => []);
        return window.NV804Profiles || AppState.allProfiles || [];
      })()
    ]);
    const issues = [
      ...inspectClients(AppState.clients || []),
      ...inspectProducts(AppState.products || []),
      ...inspectSales(AppState.sales || [], AppState.products || []),
      ...inspectInventory(movements || [], AppState.products || []),
      ...inspectProfiles(profiles),
      ...inspectOfflineDraft()
    ];
    const order = { critical:0, warning:1, info:2 };
    issues.sort((a,b) => (order[a.severity]??9)-(order[b.severity]??9) || a.area.localeCompare(b.area));
    return {
      generatedAt:new Date().toISOString(),
      issues,
      critical:issues.filter(x=>x.severity==='critical').length,
      warning:issues.filter(x=>x.severity==='warning').length,
      byArea:Object.fromEntries([...groupBy(issues, x=>x.area)].map(([area,rows])=>[area,rows.length])),
      profiles,
      movements
    };
  }

  function normalizeAuditRow(row, source = 'local') {
    const details = row?.details ?? row?.afterValue ?? row?.after_value ?? row?.payload ?? {};
    return {
      id:String(row?.id || `${source}-${timeValue(row)}-${row?.action || ''}`),
      action:String(row?.action || row?.event || 'actividad'),
      entity:String(row?.entity || row?.table_name || row?.entity_name || 'sistema'),
      entityId:String(row?.entityId || row?.record_id || row?.entity_id || ''),
      userId:String(row?.userId || row?.user_id || row?.actor_user_id || ''),
      createdAt:row?.createdAt || row?.created_at || row?.date || Date.now(),
      details,
      result:String(row?.result || row?.status || 'registrado'),
      source
    };
  }

  async function fetchAuditRows() {
    const local = window.DB?.getAll ? (await DB.getAll('auditLog').catch(() => [])).map(row=>normalizeAuditRow(row,'sesión')) : [];
    let remote = [];
    let remoteError = '';
    if (navigator.onLine && isCentralAdmin() && window.getSupabaseClient) {
      try {
        const sb = getSupabaseClient();
        const { data, error } = await sb.from('audit_log').select('*').order('created_at', { ascending:false }).limit(MAX_AUDIT_ROWS);
        if (error) throw error;
        remote = (data || []).map(row=>normalizeAuditRow(row,'Supabase'));
      } catch (error) { remoteError = error?.message || 'La tabla de auditoría no está disponible para lectura.'; }
    }
    const map = new Map();
    [...remote, ...local].forEach(row => {
      const key = row.id || [row.action,row.entity,row.entityId,new Date(row.createdAt).getTime()].join('|');
      if (!map.has(key)) map.set(key,row);
    });
    const rows = [...map.values()].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    return { rows, remoteError, source:remote.length ? 'Supabase + sesión' : 'Sesión actual' };
  }

  function csvEscape(value) {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    return `"${text.replace(/"/g,'""')}"`;
  }

  function exportIssuesCsv(report) {
    const head = ['severidad','area','codigo','titulo','detalle','registro'];
    const lines = [head.map(csvEscape).join(',')].concat(report.issues.map(row => [row.severity,row.area,row.code,row.title,row.detail,row.entityId].map(csvEscape).join(',')));
    downloadBlob(`natura-vida-calidad-datos-${new Date().toISOString().slice(0,10)}.csv`, '\uFEFF'+lines.join('\n'), 'text/csv;charset=utf-8');
    window.writeAudit?.('quality:export_csv','system','quality',null,{issues:report.issues.length}).catch(()=>{});
  }

  function exportAuditCsv(rows) {
    const head = ['fecha','usuario','accion','entidad','registro','resultado','origen','detalle'];
    const lines = [head.map(csvEscape).join(',')].concat(rows.map(row => [fmtDate(row.createdAt),row.userId,row.action,row.entity,row.entityId,row.result,row.source,row.details].map(csvEscape).join(',')));
    downloadBlob(`natura-vida-auditoria-${new Date().toISOString().slice(0,10)}.csv`, '\uFEFF'+lines.join('\n'), 'text/csv;charset=utf-8');
  }

  function severityLabel(severity) {
    return severity === 'critical' ? 'Crítico' : severity === 'warning' ? 'Revisar' : 'Informativo';
  }

  function renderIssueRows(issues) {
    if (!issues.length) return '<div class="nv806Empty"><strong>Sin observaciones en este filtro</strong><span>No se detectaron inconsistencias evidentes.</span></div>';
    return issues.slice(0,150).map(row => `
      <article class="nv806Issue ${esc(row.severity)}" data-area="${esc(row.area)}" data-severity="${esc(row.severity)}">
        <span class="nv806IssueMark"></span>
        <div><small>${esc(row.area)} · ${esc(row.code)}</small><strong>${esc(row.title)}</strong><p>${esc(row.detail)}</p></div>
        <em>${esc(severityLabel(row.severity))}</em>
      </article>`).join('');
  }

  function renderAuditRows(rows) {
    if (!rows.length) return '<div class="nv806Empty"><strong>Sin eventos visibles</strong><span>La auditoría remota puede depender de las políticas RLS del proyecto.</span></div>';
    return rows.slice(0,200).map(row => `
      <article class="nv806AuditRow" data-action="${esc(norm(row.action))}" data-entity="${esc(norm(row.entity))}" data-user="${esc(norm(row.userId))}">
        <span class="nv806AuditIcon">${esc((row.action || 'A').charAt(0).toUpperCase())}</span>
        <div><strong>${esc(row.action)}</strong><small>${esc(row.entity)}${row.entityId ? ' · '+esc(row.entityId) : ''}</small><p>${esc(fmtDate(row.createdAt))} · ${esc(row.userId || 'usuario no identificado')} · ${esc(row.source)}</p></div>
        <em>${esc(row.result)}</em>
      </article>`).join('');
  }

  function renderBackupHistory() {
    const history = readBackupHistory();
    if (!history.length) return '<div class="nv806Empty"><strong>Aún no hay respaldos registrados</strong><span>La aplicación conserva solo la fecha, tamaño y huella; el archivo queda bajo tu custodia.</span></div>';
    return history.map(row => `<div class="nv806HistoryRow"><div><strong>${esc(fmtDate(row.exportedAt))}</strong><small>${esc(row.filename || 'Respaldo')} · ${fmtCount(row.size)} bytes</small></div><code>${esc(String(row.hash || '').slice(0,16))}…</code></div>`).join('');
  }

  function renderValidationResult(result, comparison = []) {
    const box = document.querySelector('#nv806ValidationResult');
    if (!box) return;
    const state = result.ok ? 'ok' : 'bad';
    box.innerHTML = `
      <div class="nv806Validation ${state}">
        <strong>${result.ok ? 'Archivo íntegro para simulación' : 'Archivo no válido'}</strong>
        <span>${esc(result.filename || '')}${result.pack?.version ? ' · versión '+esc(result.pack.version) : ''}</span>
        ${result.errors?.map(x=>`<p class="bad">${esc(x)}</p>`).join('') || ''}
        ${result.warnings?.map(x=>`<p class="warn">${esc(x)}</p>`).join('') || ''}
      </div>
      ${comparison.length ? `<div class="nv806Compare"><div class="nv806CompareHead"><span>Sección</span><span>Actual</span><span>Copia</span><span>Nuevos</span></div>${comparison.slice(0,20).map(row=>`<div><strong>${esc(row.section)}</strong><span>${row.current}</span><span>${row.backup}</span><span>${row.newInBackup}</span></div>`).join('')}</div><div class="nv806SafeRestore"><strong>Restauración real bloqueada en el navegador</strong><span>La simulación no modificó ningún registro. Una restauración debe validarse y ejecutarse en el servidor con doble confirmación.</span></div>` : ''}`;
  }

  async function blockDemoProfile(profileId, report) {
    const issueRow = report.issues.find(row => row.code === 'profile_demo' && row.entityId === String(profileId));
    if (!issueRow) return;
    const profile = issueRow.meta?.profile || report.profiles.find(row=>String(row.id)===String(profileId));
    if (!profile) return;
    const activity = Number(issueRow.meta?.activity || 0);
    const message = activity
      ? `Este usuario tiene ${activity} registros vinculados. Bloqueará el acceso, pero conservará su historial. ¿Continuar?`
      : 'Este usuario no presenta actividad visible. Se bloqueará su acceso sin borrar la cuenta ni el historial. ¿Continuar?';
    if (!window.confirm(message)) return;
    const res = await window.adminBlockUser?.(profileId);
    if (res?.ok) {
      window.writeAudit?.('quality:block_demo_user','profiles',profileId,profile,{status:'bloqueado'}).catch(()=>{});
      window.showToast?.('Usuario demo bloqueado. No fue eliminado.');
      await renderDataControlCenterV806();
    } else window.showToast?.(res?.message || 'No se pudo bloquear el usuario.', 'error');
  }

  function bindQualityFilters(report) {
    const search = document.querySelector('#nv806IssueSearch');
    const area = document.querySelector('#nv806IssueArea');
    const severity = document.querySelector('#nv806IssueSeverity');
    const apply = () => {
      const query = norm(search?.value);
      const areaValue = area?.value || '';
      const severityValue = severity?.value || '';
      document.querySelectorAll('.nv806Issue').forEach(row => {
        const matchText = !query || norm(row.textContent).includes(query);
        const matchArea = !areaValue || row.dataset.area === areaValue;
        const matchSeverity = !severityValue || row.dataset.severity === severityValue;
        row.classList.toggle('hidden', !(matchText && matchArea && matchSeverity));
      });
    };
    search?.addEventListener('input', apply);
    area?.addEventListener('change', apply);
    severity?.addEventListener('change', apply);
    document.querySelector('#nv806ExportIssues')?.addEventListener('click', ()=>exportIssuesCsv(report));
  }

  function bindAuditFilters(audit) {
    const search = document.querySelector('#nv806AuditSearch');
    const entity = document.querySelector('#nv806AuditEntity');
    const apply = () => {
      const query = norm(search?.value);
      const entityValue = norm(entity?.value);
      document.querySelectorAll('.nv806AuditRow').forEach(row => {
        const text = norm(row.textContent);
        const matchText = !query || text.includes(query);
        const matchEntity = !entityValue || row.dataset.entity === entityValue;
        row.classList.toggle('hidden', !(matchText && matchEntity));
      });
    };
    search?.addEventListener('input', apply);
    entity?.addEventListener('change', apply);
    document.querySelector('#nv806ExportAudit')?.addEventListener('click', ()=>exportAuditCsv(audit.rows));
  }

  async function renderDataControlCenterV806() {
    if (!requireCentralAdmin()) return;
    document.querySelector('#fabAdd')?.classList.add('hidden');
    const main = document.querySelector('#mainArea');
    main.innerHTML = '<div class="loading">Analizando respaldo, auditoría y calidad de datos…</div>';
    const [report, audit] = await Promise.all([buildQualityReport(), fetchAuditRows()]);
    const areas = Object.keys(report.byArea).sort();
    const entities = [...new Set(audit.rows.map(row=>row.entity).filter(Boolean))].sort();
    const demoIssues = report.issues.filter(row=>row.code==='profile_demo');
    const backupHistory = readBackupHistory();

    main.innerHTML = `
      <section class="nv806Hero">
        <div><span class="eyebrow">Control administrativo V8.0.6</span><h1>Respaldo, auditoría y calidad</h1><p>Detecta riesgos, valida copias y conserva trazabilidad sin corregir ni eliminar datos automáticamente.</p></div>
        <span class="nv806Shield">QA</span>
      </section>
      <div class="nv806Metrics">
        <article><span>Críticos</span><strong>${report.critical}</strong><small>requieren atención</small></article>
        <article><span>Por revisar</span><strong>${report.warning}</strong><small>posibles inconsistencias</small></article>
        <article><span>Auditoría</span><strong>${audit.rows.length}</strong><small>${esc(audit.source)}</small></article>
        <article><span>Respaldos</span><strong>${backupHistory.length}</strong><small>registrados en este dispositivo</small></article>
      </div>

      <section class="dashboardPanel nv806Panel">
        <div class="panelHeader"><div><span class="eyebrow">Protección de información</span><h2>Respaldos verificables</h2></div><span class="nv806Pill">Sin restauración automática</span></div>
        <p class="nv806Intro">La copia incluye los datos autorizados cargados desde Supabase, un manifiesto de cantidades y una huella SHA-256. No contiene contraseña ni tokens de sesión.</p>
        <div class="nv806ActionGrid">
          <button class="btn block" id="nv806CreateBackup">Crear respaldo verificado</button>
          <label class="btn outline block nv806FileButton">Validar respaldo<input type="file" id="nv806BackupFile" accept="application/json,.json"></label>
        </div>
        <div id="nv806ValidationResult"></div>
        <div class="nv806Subhead"><strong>Historial local de copias</strong><small>Solo metadatos; los archivos descargados no se guardan dentro de la app.</small></div>
        <div id="nv806BackupHistory">${renderBackupHistory()}</div>
      </section>

      <section class="dashboardPanel nv806Panel">
        <div class="panelHeader"><div><span class="eyebrow">Revisión preventiva</span><h2>Calidad de datos</h2></div><button class="btn sm outline" id="nv806ExportIssues">Exportar CSV</button></div>
        <div class="nv806Filters">
          <input id="nv806IssueSearch" type="search" placeholder="Buscar observación…">
          <select id="nv806IssueArea"><option value="">Todas las áreas</option>${areas.map(x=>`<option>${esc(x)}</option>`).join('')}</select>
          <select id="nv806IssueSeverity"><option value="">Toda prioridad</option><option value="critical">Crítico</option><option value="warning">Revisar</option></select>
        </div>
        <div class="nv806IssueList">${renderIssueRows(report.issues)}</div>
      </section>

      ${demoIssues.length ? `<section class="dashboardPanel nv806Panel"><div class="panelHeader"><div><span class="eyebrow">Acceso seguro</span><h2>Posibles usuarios demo</h2></div><button class="btn sm outline" id="nv806OpenUsers">Ver todos</button></div><p class="nv806Intro">La V8.0.6 permite bloquear el acceso, no eliminar cuentas. Así se conserva la auditoría y cualquier operación relacionada.</p>${demoIssues.map(row=>{const p=row.meta?.profile||{};return `<div class="nv806UserRow"><div><strong>${esc(p.full_name||p.email||row.entityId)}</strong><small>${esc(p.email||'')} · ${row.meta?.activity||0} registros vinculados</small></div>${String(p.status||'').toLowerCase()==='bloqueado'?'<span class="nv806Blocked">Bloqueado</span>':`<button class="btn sm outline nv806BlockDemo" data-id="${esc(row.entityId)}">Bloquear acceso</button>`}</div>`;}).join('')}</section>` : ''}

      <section class="dashboardPanel nv806Panel">
        <div class="panelHeader"><div><span class="eyebrow">Trazabilidad</span><h2>Auditoría de operaciones</h2></div><button class="btn sm outline" id="nv806ExportAudit">Exportar CSV</button></div>
        ${audit.remoteError ? `<div class="nv806AuditNotice"><strong>Auditoría remota limitada</strong><span>${esc(audit.remoteError)} Se muestran los eventos disponibles en la sesión.</span></div>` : ''}
        <div class="nv806Filters two"><input id="nv806AuditSearch" type="search" placeholder="Usuario, acción o registro…"><select id="nv806AuditEntity"><option value="">Todas las entidades</option>${entities.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></div>
        <div class="nv806AuditList">${renderAuditRows(audit.rows)}</div>
      </section>

      <section class="dashboardPanel nv806Panel nv806FinalNotice"><strong>Ninguna observación fue corregida automáticamente</strong><p>Las diferencias de inventario, clientes duplicados, cuentas demo y demás hallazgos deben revisarse antes de aplicar cambios. La fuente oficial continúa siendo Supabase.</p><button class="btn outline block" id="nv806BackSettings">Volver a configuración</button></section>`;

    document.querySelector('#nv806CreateBackup')?.addEventListener('click', async event => {
      const btn = event.currentTarget; btn.disabled = true; btn.textContent = 'Generando y verificando…';
      await createVerifiedBackup().catch(error=>window.showToast?.(error?.message || 'No se pudo crear el respaldo.','error'));
      btn.disabled = false; btn.textContent = 'Crear respaldo verificado';
      const history = document.querySelector('#nv806BackupHistory'); if (history) history.innerHTML = renderBackupHistory();
    });
    document.querySelector('#nv806BackupFile')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      const result = await validateBackupFile(file);
      const comparison = result.ok ? await compareBackupWithCurrent(result.pack) : [];
      renderValidationResult(result, comparison);
      window.writeAudit?.('backup:validate_simulation','system','backup',null,{ok:result.ok,filename:file?.name||'',errors:result.errors?.length||0}).catch(()=>{});
    });
    document.querySelector('#nv806BackSettings')?.addEventListener('click', ()=>window.navigateTo ? navigateTo('ajustes') : renderSettings());
    document.querySelector('#nv806OpenUsers')?.addEventListener('click', ()=>window.navigateTo ? navigateTo('usuarios') : window.renderUsersFoundation?.());
    document.querySelectorAll('.nv806BlockDemo').forEach(button => button.addEventListener('click', ()=>blockDemoProfile(button.dataset.id, report)));
    bindQualityFilters(report);
    bindAuditFilters(audit);
  }

  Object.assign(window, {
    NV806QualityAssurance: {
      VERSION, BACKUP_SCHEMA, stableStringify, sha256, sanitizeForBackup,
      collectAuthorizedData, createVerifiedBackup, validateBackupObject,
      validateBackupFile, compareBackupWithCurrent, inspectClients,
      inspectProducts, inspectSales, inspectInventory, inspectProfiles,
      inspectOfflineDraft, buildQualityReport, fetchAuditRows,
      exportIssuesCsv, exportAuditCsv, renderDataControlCenterV806
    },
    renderDataControlCenterV806
  });
})();
