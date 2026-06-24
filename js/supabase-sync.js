/* supabase-sync.js — Sincronización online para NATURA VIDA usando Supabase.
   Mantiene IndexedDB offline y agrega servidor gratuito para usuarios, productos y ventas. */

let _supabaseClient = null;
let _lastCloudSync = null;

function getSavedOnlineConfig() {
  try {
    const raw = localStorage.getItem('natura_vida_online_config');
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function effectiveOnlineConfig() {
  const base = window.NATURA_ONLINE_CONFIG || {};
  const saved = getSavedOnlineConfig() || {};
  return Object.assign({}, base, saved);
}

function getOnlineConfigValue(key) {
  const cfg = effectiveOnlineConfig();
  const value = cfg[key] || '';
  if (String(value).includes('PEGAR_AQUI')) return '';
  return value;
}

function saveOnlineConfig(cfg) {
  const clean = {
    enabled: !!cfg.enabled,
    supabaseUrl: String(cfg.supabaseUrl || '').trim(),
    supabaseAnonKey: String(cfg.supabaseAnonKey || '').trim()
  };
  localStorage.setItem('natura_vida_online_config', JSON.stringify(clean));
  _supabaseClient = null;
  return clean;
}

function isOnlineConfigured() {
  const cfg = effectiveOnlineConfig();
  const hasUrl = !!(cfg.supabaseUrl && !String(cfg.supabaseUrl).includes('PEGAR_AQUI'));
  const hasKey = !!(cfg.supabaseAnonKey && !String(cfg.supabaseAnonKey).includes('PEGAR_AQUI'));
  // Si el archivo trae URL/key reales, se considera conectado aunque el usuario no marque enabled en cada celular.
  return !!(hasUrl && hasKey && (cfg.enabled || hasUrl));
}

function getSupabaseClient() {
  if (!isOnlineConfigured()) return null;
  if (_supabaseClient) return _supabaseClient;
  if (!window.supabase || !window.supabase.createClient) {
    console.warn('Supabase JS no está cargado. Revisa el CDN en index.html.');
    return null;
  }
  const cfg = effectiveOnlineConfig();
  _supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });
  return _supabaseClient;
}

function isDataUrlImage(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  const meta = parts[0] || '';
  const b64 = parts[1] || '';
  const mime = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadProductPhotoIfNeeded(product) {
  const sb = getSupabaseClient();
  if (!sb || !product || !isDataUrlImage(product.photo)) return product && product.photo ? product.photo : null;
  const cfg = effectiveOnlineConfig();
  const bucket = cfg.productImagesBucket || 'product-images';
  const ext = product.photo.includes('image/png') ? 'png' : 'jpg';
  const safeId = String(product.id || uid('prod')).replace(/[^a-z0-9_-]/gi, '_');
  const path = `${safeId}/${Date.now()}.${ext}`;
  try {
    const blob = dataUrlToBlob(product.photo);
    const { error } = await sb.storage.from(bucket).upload(path, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data && data.publicUrl ? data.publicUrl : null;
  } catch (err) {
    console.warn('No se pudo subir imagen a Storage:', err.message);
    return null;
  }
}

function removeEmbeddedImagesFromProduct(product) {
  const p = Object.assign({}, product || {});
  if (isDataUrlImage(p.photo)) {
    p.photo = null;
    p.photoStripped = true;
  }
  if (p.payload && typeof p.payload === 'object') p.payload = removeEmbeddedImagesFromProduct(p.payload);
  return p;
}

async function getSyncMeta(key) {
  try {
    const row = window.DB ? await DB.get('syncMeta', key).catch(() => null) : null;
    if (row) return row.value || null;
  } catch (_) {}
  try { return localStorage.getItem('nv_sync_' + key); } catch (_) { return null; }
}

async function setSyncMeta(key, value) {
  try {
    if (window.DB) await DB.put('syncMeta', { id: key, value, updatedAt: Date.now() }, { silent: true }).catch(() => {});
  } catch (_) {}
  try { localStorage.setItem('nv_sync_' + key, String(value || '')); } catch (_) {}
}


function mapProductToCloud(product) {
  const p = window.normalizeLegacyProduct ? normalizeLegacyProduct(product) : product;
  const payload = removeEmbeddedImagesFromProduct(p);
  return {
    id: p.id,
    name: p.name,
    category: p.category || 'General',
    sku: p.sku || '',
    description: p.description || '',
    cost: Number(p.cost || 0),
    market_price: Number(p.marketPrice ?? p.wholesaleMarketPrice ?? p.marketPriceFixed ?? 0),
    reseller_price: Number(p.resellerPrice ?? p.wholesalePriceFixed ?? 0),
    public_price: Number(p.publicPrice ?? p.unitPriceFixed ?? 0),
    stock: Number(p.stock || 0),
    photo: isDataUrlImage(p.photo) ? null : (p.photo || null),
    photo_url: isDataUrlImage(p.photo) ? null : (p.photo || null),
    status: p.status || 'active',
    payload,
    updated_at: new Date().toISOString()
  };
}

async function mapProductToCloudAsync(product) {
  const p = window.normalizeLegacyProduct ? normalizeLegacyProduct(product) : product;
  let photoUrl = isDataUrlImage(p.photo) ? await uploadProductPhotoIfNeeded(p) : (p.photo || null);
  if (photoUrl && photoUrl !== p.photo) {
    // Actualiza caché local para que desde ahora sólo se use URL.
    const local = Object.assign({}, p, { photo: photoUrl, updatedAt: Date.now() });
    if (window.DB) await DB.put('products', local, { silent: true }).catch(() => {});
    const idx = (AppState.products || []).findIndex(x => x.id === p.id);
    if (idx >= 0) AppState.products[idx] = local;
  }
  const row = mapProductToCloud(Object.assign({}, p, { photo: photoUrl }));
  row.photo = photoUrl;
  row.photo_url = photoUrl;
  row.payload = removeEmbeddedImagesFromProduct(Object.assign({}, p, { photo: photoUrl }));
  return row;
}

function mapProductFromCloud(row) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return normalizeLegacyProduct(Object.assign({}, payload, {
    id: row.id,
    name: row.name,
    category: row.category || 'General',
    sku: row.sku || '',
    description: row.description || '',
    cost: Number(row.cost || 0),
    marketPrice: Number(row.market_price || row.reseller_price || 0),
    wholesaleMarketPrice: Number(row.market_price || row.reseller_price || 0),
    resellerPrice: Number(row.reseller_price || 0),
    publicPrice: Number(row.public_price || 0),
    marketPriceFixed: Number(row.market_price || row.reseller_price || 0),
    wholesalePriceFixed: Number(row.reseller_price || 0),
    unitPriceFixed: Number(row.public_price || 0),
    stock: Number(row.stock || 0),
    photo: row.photo_url || row.photo || null,
    status: row.status || 'active',
    syncStatus: 'cloud',
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  }));
}

async function onlineSignIn(email, password) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message || 'No se pudo iniciar sesión online.' };
  const profile = await fetchCurrentProfile(data.user.id);
  if (!profile || profile.status !== 'active') {
    await sb.auth.signOut();
    return { ok: false, message: 'Perfil no autorizado o inactivo.' };
  }
  return { ok: true, user: data.user, profile };
}

async function onlineSignOut() {
  const sb = getSupabaseClient();
  if (sb) await sb.auth.signOut().catch(() => {});
}

async function getOnlineSessionProfile() {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const user = data && data.session && data.session.user;
  if (!user) return null;
  const profile = await fetchCurrentProfile(user.id);
  if (!profile || profile.status !== 'active') return null;
  return { user, profile };
}

async function fetchCurrentProfile(userId) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (error) {
    console.warn('No se pudo leer perfil:', error.message);
    return null;
  }
  return data;
}

function productIdentityKey(product) {
  return normalizeSearch(`${product && product.name ? product.name : ''}|${product && product.category ? product.category : 'General'}`);
}

function preserveRepresentativeLocalFields(existing, cloud) {
  const local = existing || {};
  const preservedPhoto = cloud.photo || local.photo || null;
  return normalizeLegacyProduct(Object.assign({}, cloud, {
    photo: preservedPhoto,
    // INVENTARIO PROPIO DEL REPRESENTANTE: nunca se pisa con el servidor.
    stock: existing ? (Number(local.stock) || 0) : 0,
    adminStock: Number(cloud.stock || 0),
    resellerAdditionalCost: existing ? (Number(local.resellerAdditionalCost) || 0) : 0,
    resellerLocalUnitPrice: existing ? (Number(local.resellerLocalUnitPrice) || 0) : (publicPrice(cloud) || 0),
    resellerLocalWholesalePrice: existing ? (Number(local.resellerLocalWholesalePrice) || 0) : (marketPrice(cloud) || 0),
    resellerLocalNote: existing ? (local.resellerLocalNote || '') : '',
    resellerLocalUpdatedAt: existing ? (local.resellerLocalUpdatedAt || null) : null,
    previousLocalProductId: existing && existing.id !== cloud.id ? existing.id : (local.previousLocalProductId || null),
    syncStatus: 'cloud_safe_merge',
    updatedAt: Date.now()
  }));
}

async function createPreSyncLocalSnapshot(reason = 'cloud_sync') {
  try {
    const snapshot = {
      id: 'autosnapshot_' + Date.now(),
      type: 'auto_backup_before_sync',
      reason,
      createdAt: Date.now(),
      user: AppState.session ? {
        userId: AppState.session.userId,
        username: AppState.session.username,
        fullName: AppState.session.fullName,
        roleName: AppState.session.roleName
      } : null,
      products: AppState.products || [],
      clients: AppState.clients || [],
      sales: AppState.sales || [],
      quotes: AppState.quotes || [],
      priceGroups: AppState.priceGroups || [],
      settings: AppState.settings || {}
    };
    localStorage.setItem('natura_vida_last_presync_snapshot', JSON.stringify(snapshot));
    if (window.DB && DB.put) {
      await DB.put('reportsCache', {
        id: snapshot.id,
        type: 'auto_backup_before_sync',
        period: 'local',
        generatedAt: snapshot.createdAt,
        payload: snapshot
      }, { silent: true }).catch(() => {});
    }
    return snapshot;
  } catch (err) {
    console.warn('No se pudo crear respaldo previo a sincronización:', err.message);
    return null;
  }
}

function buildSafeProductMerge(cloudRows) {
  const cloudProducts = (cloudRows || []).map(mapProductFromCloud);
  const existingProducts = (AppState.products || []).filter(p => p && p.status !== 'archived');
  const byId = new Map(existingProducts.map(p => [p.id, p]));
  const byKey = new Map(existingProducts.map(p => [productIdentityKey(p), p]));
  const usedLocalIds = new Set();
  const obsoleteLocalIds = new Set();

  const mergedCloud = cloudProducts.map((cloud) => {
    const existing = byId.get(cloud.id) || byKey.get(productIdentityKey(cloud)) || null;
    if (existing) {
      usedLocalIds.add(existing.id);
      if (existing.id !== cloud.id) obsoleteLocalIds.add(existing.id);
    }
    if (window.isReseller && isReseller()) return preserveRepresentativeLocalFields(existing, cloud);
    // En administrador también se preserva stock local si el producto ya existía y el servidor no trae valor útil.
    return normalizeLegacyProduct(Object.assign({}, cloud, {
      photo: cloud.photo || (existing && existing.photo) || null,
      stock: Number.isFinite(Number(cloud.stock)) ? Number(cloud.stock || 0) : (existing ? Number(existing.stock || 0) : 0),
      syncStatus: 'cloud_safe_merge',
      updatedAt: Date.now()
    }));
  });

  // Productos locales que todavía no existen en la nube NO se eliminan.
  const cloudIds = new Set(cloudProducts.map(p => p.id));
  const cloudKeys = new Set(cloudProducts.map(productIdentityKey));
  const localOnly = existingProducts.filter(p => !usedLocalIds.has(p.id) && !cloudIds.has(p.id) && !cloudKeys.has(productIdentityKey(p)));
  const result = mergedCloud.concat(localOnly.map(p => normalizeLegacyProduct(Object.assign({}, p, { syncStatus: p.syncStatus || 'local_preserved' }))));
  result._obsoleteLocalIds = Array.from(obsoleteLocalIds);
  return result;
}

async function fetchCloudProductRows(options = {}) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  let query = sb.from('products').select('*').order('updated_at', { ascending: true });
  if (options.since) query = query.gt('updated_at', options.since);
  if (!options.includeArchived) query = query.neq('status', 'archived');
  const { data, error } = await query;
  if (error) return { ok: false, message: error.message };
  return { ok: true, rows: data || [] };
}

async function syncCloudProductsToLocal(options = {}) {
  const last = options.full ? null : await getSyncMeta('products_last_sync');
  const fetched = await fetchCloudProductRows({ since: last, includeArchived: true });
  if (!fetched.ok) return fetched;
  let rows = fetched.rows || [];

  // Primer uso o servidor recién configurado: si no hay cambios incrementales, intenta catálogo completo.
  if (!last && rows.length === 0) {
    const full = await fetchCloudProductRows({ includeArchived: true });
    if (!full.ok) return full;
    rows = full.rows || [];
  }

  if (rows.length === 0) {
    return { ok: true, count: 0, localCount: (AppState.products || []).length, message: 'No hay novedades nuevas en el servidor.' };
  }

  const activeRows = rows.filter(r => (r.status || 'active') !== 'archived');
  if (activeRows.length === 0 && (AppState.products || []).length === 0) {
    return { ok: false, blocked: true, message: 'El servidor no tiene productos activos. No se modificó el inventario local.' };
  }

  await createPreSyncLocalSnapshot('before_cloud_products_sync');
  const beforeCount = (AppState.products || []).length;
  const products = buildSafeProductMerge(activeRows);
  await DB.bulkPut('products', products, { silent: true });
  if (Array.isArray(products._obsoleteLocalIds)) {
    for (const oldId of products._obsoleteLocalIds) await DB.delete('products', oldId, { silent: true }).catch(() => {});
  }
  AppState.products = products;
  _lastCloudSync = Date.now();
  await setSyncMeta('products_last_sync', new Date().toISOString());
  return {
    ok: true,
    count: rows.length,
    localCount: products.length,
    beforeCount,
    preservedLocal: Math.max(0, products.length - rows.length),
    message: 'Catálogo actualizado sin borrar inventario local.'
  };
}

async function openSafeCloudSyncSheet() {
  const fetched = await fetchCloudProductRows();
  if (!fetched.ok) { showToast('No se pudo leer servidor: ' + fetched.message, 'error'); return; }
  const rows = fetched.rows || [];
  if (rows.length === 0) {
    showToast('Servidor sin productos publicados. No se tocó tu inventario.', 'error');
    openSheet(`
      <h2>Servidor sin catálogo <span class="x" id="closeSheet">✕</span></h2>
      <div class="banner dangerBanner">El servidor no tiene productos publicados. Para proteger tus datos locales, la app no actualizó ni borró nada.</div>
      <button class="btn block" id="closeSafeSync">Entendido</button>
    `, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#closeSafeSync', overlay).addEventListener('click', close);
    });
    return;
  }
  const mergedPreview = buildSafeProductMerge(rows);
  const currentCount = (AppState.products || []).length;
  const localOnly = Math.max(0, mergedPreview.length - rows.length);
  openSheet(`
    <h2>Recibir novedades <span class="x" id="closeSheet">✕</span></h2>
    <div class="safeSyncHero">
      <div class="readyMark">✓</div>
      <div>
        <div class="eyebrow">Sincronización segura</div>
        <h3>Se encontró catálogo online</h3>
        <p>Antes de actualizar se guardará un respaldo local automático.</p>
      </div>
    </div>
    <div class="miniStats safeSyncStats">
      <div><span>Servidor</span><strong>${rows.length}</strong></div>
      <div><span>Actual local</span><strong>${currentCount}</strong></div>
      <div><span>Se conservarán</span><strong>${localOnly}</strong></div>
    </div>
    <div class="banner">La actualización traerá nombres, fotos, descripciones y precios base del administrador. No borrará stock local, precios propios del representante, costos de envío, clientes ni ventas.</div>
    <button class="btn block" id="applySafeSync">Actualizar de forma segura</button>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#applySafeSync', overlay).addEventListener('click', async () => {
      const btn = $('#applySafeSync', overlay);
      btn.disabled = true;
      btn.textContent = 'Actualizando…';
      const res = await syncCloudProductsToLocal();
      if (res.ok) {
        if (window.sendAdminMessage && isReseller && isReseller()) {
          await sendAdminMessage('catalog_update', 'Representante recibió novedades', `${AppState.session.fullName || AppState.session.username} actualizó catálogo desde servidor.`, { count: res.count }).catch(() => {});
        }
        showToast(`Catálogo actualizado: ${res.count} producto(s).`);
        close();
        await loadAllState().catch(() => {});
        render();
      } else {
        btn.disabled = false;
        btn.textContent = 'Actualizar de forma segura';
        showToast(res.message || 'No se pudo actualizar.', 'error');
      }
    });
  });
}


async function pushLocalProductsToCloud() {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  if (!AppState.session || AppState.session.roleName !== 'Administrador') {
    return { ok: false, message: 'Solo el administrador puede publicar productos.' };
  }
  const activeProducts = AppState.products.filter(p => p.status !== 'archived');
  if (activeProducts.length === 0) return { ok: false, message: 'No hay productos activos para publicar.' };

  const rows = [];
  for (const p of activeProducts) rows.push(await mapProductToCloudAsync(p));

  let sent = 0;
  const chunkSize = 20;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb.from('products').upsert(chunk, { onConflict: 'id' });
    if (error) {
      let msg = error.message || 'Error desconocido de Supabase';
      if (/column|schema|relation|does not exist|permission|policy/i.test(msg)) {
        msg += ' — Ejecuta primero SUPABASE_MIGRACION_V5_1_ESTABLE.sql en Supabase > SQL Editor.';
      }
      return { ok: false, message: msg, sent };
    }
    sent += chunk.length;
  }
  await setSyncMeta('catalog_last_published_at', new Date().toISOString()).catch(() => {});
  return { ok: true, count: sent };
}

async function upsertCloudProduct(product) {
  const sb = getSupabaseClient();
  if (!sb || !AppState.session || AppState.session.roleName !== 'Administrador') return;
  const { error } = await sb.from('products').upsert(await mapProductToCloudAsync(product), { onConflict: 'id' });
  if (error) console.warn('No se pudo subir producto:', error.message);
}

async function deleteCloudProduct(productId) {
  const sb = getSupabaseClient();
  if (!sb || !AppState.session || AppState.session.roleName !== 'Administrador') return;
  const { error } = await sb.from('products').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', productId);
  if (error) console.warn('No se pudo archivar producto online:', error.message);
}

function mapSaleToCloud(sale) {
  return {
    id: sale.id,
    seller_user_id: AppState.session && AppState.session.onlineUserId ? AppState.session.onlineUserId : null,
    seller_name: sale.sellerName || (AppState.session ? AppState.session.fullName : null),
    client_name: sale.clientName || '',
    client_phone: sale.clientPhone || '',
    sale_type: sale.type || 'unit',
    total: Number(sale.total || 0),
    seller_profit: Number(sale.sellerProfit || 0),
    payload: sale,
    created_at: sale.date ? new Date(sale.date).toISOString() : new Date().toISOString()
  };
}

async function insertCloudSale(sale) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { error } = await sb.from('sales').insert(mapSaleToCloud(sale));
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}


function mapPurchaseOrderToCloud(order) {
  return {
    id: order.id,
    representative_user_id: AppState.session && AppState.session.onlineUserId ? AppState.session.onlineUserId : null,
    representative_name: order.representativeName || (AppState.session ? AppState.session.fullName : ''),
    status: order.status || 'pending',
    total: Number(order.total || 0),
    note: order.note || '',
    payload: order,
    created_at: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

async function insertCloudPurchaseOrder(order) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { error } = await sb.from('purchase_orders').insert(mapPurchaseOrderToCloud(order));
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

async function fetchCloudPurchaseOrders() {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { data, error } = await sb.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(120);
  if (error) return { ok: false, message: error.message };
  const orders = (data || []).map(row => Object.assign({}, (row.payload || {}), {
    id: row.id,
    representativeId: row.representative_user_id,
    representativeName: row.representative_name,
    status: row.status || 'pending',
    total: Number(row.total || 0),
    note: row.note || ((row.payload || {}).note || ''),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    syncStatus: 'cloud'
  }));
  return { ok: true, orders };
}

async function updateCloudPurchaseOrderStatus(orderId, status) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { error } = await sb.from('purchase_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}


function mapMessageToCloud(message) {
  const m = window.normalizeMessage ? normalizeMessage(message) : message;
  return {
    id: m.id,
    type: m.type || 'general',
    title: m.title || 'Mensaje',
    body: m.body || '',
    sender_user_id: AppState.session && AppState.session.onlineUserId ? AppState.session.onlineUserId : null,
    sender_name: m.senderName || (AppState.session ? AppState.session.fullName : ''),
    sender_role: m.senderRole || (AppState.session ? AppState.session.roleName : ''),
    recipient_role: m.recipientRole || 'Administrador',
    recipient_user_id: m.recipientUserId || null,
    status: m.status || 'unread',
    payload: m.payload || {},
    created_at: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function mapMessageFromCloud(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    senderUserId: row.sender_user_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    recipientRole: row.recipient_role,
    recipientUserId: row.recipient_user_id,
    status: row.status,
    payload: row.payload || {},
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  };
}

async function insertCloudMessage(message) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { error } = await sb.from('messages').upsert(mapMessageToCloud(message), { onConflict: 'id' });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

async function fetchCloudInboxMessages() {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { data, error } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(80);
  if (error) return { ok: false, message: error.message };
  return { ok: true, messages: (data || []).map(mapMessageFromCloud) };
}

async function markCloudMessageRead(messageId) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { error } = await sb.from('messages').update({ status: 'read', updated_at: new Date().toISOString() }).eq('id', messageId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

async function fetchCloudProfiles() {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) return { ok: false, message: error.message };
  return { ok: true, profiles: data || [] };
}

async function updateCloudProfileStatus(profileId, status) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  if (!isAdmin || !isAdmin()) return { ok: false, message: 'Solo administrador.' };
  const { error } = await sb.from('profiles').update({ status, updated_at: new Date().toISOString() }).eq('id', profileId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}


async function pushQueuedItem(item) {
  if (!item || !item.storeName) return { ok: true };
  if (item.operation === 'delete') {
    await cloudAfterDelete(item.storeName, item.recordId);
    return { ok: true };
  }
  if (item.operation === 'put') {
    await cloudAfterPut(item.storeName, item.payload);
    return { ok: true };
  }
  return { ok: true };
}

async function flushPendingSyncQueue(limit = 25) {
  if (!isOnlineConfigured() || !window.DB) return { ok: false, message: 'Servidor no configurado.' };
  const items = (await DB.getAll('syncQueue').catch(() => []))
    .filter(i => i.status === 'pending')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .slice(0, limit);
  let sent = 0;
  for (const item of items) {
    try {
      item.attempts = (item.attempts || 0) + 1;
      await pushQueuedItem(item);
      item.status = 'done';
      item.updatedAt = Date.now();
      await DB.put('syncQueue', item, { silent: true });
      sent++;
    } catch (err) {
      item.status = 'pending';
      item.lastError = err.message || 'Error desconocido';
      item.updatedAt = Date.now();
      await DB.put('syncQueue', item, { silent: true }).catch(() => {});
      break;
    }
  }
  return { ok: true, sent, pending: Math.max(0, items.length - sent) };
}

let _backgroundSyncStarted = false;
async function runBackgroundSyncOnce(reason = 'background') {
  if (!isOnlineConfigured()) return { ok: false, message: 'Servidor no configurado.' };
  await flushPendingSyncQueue().catch(() => {});
  const res = await syncCloudProductsToLocal({ reason }).catch(err => ({ ok: false, message: err.message }));
  if (res && res.ok && res.count > 0) {
    await loadAllState().catch(() => {});
    if (window.render) render();
    if (window.refreshInboxBadge) refreshInboxBadge({ silent: true }).catch(() => {});
  }
  // Buzón se actualiza sólo al abrirlo para evitar lag en Android.
  if (window.fetchAndCachePurchaseOrders && window.isAdmin && isAdmin()) await fetchAndCachePurchaseOrders().catch(() => {});
  return res;
}

function startBackgroundSync() {
  if (_backgroundSyncStarted) return;
  _backgroundSyncStarted = true;
  setTimeout(() => runBackgroundSyncOnce('startup').catch(() => {}), 2500);
  window.addEventListener('online', () => runBackgroundSyncOnce('online').catch(() => {}));
  setInterval(() => {
    if (document.visibilityState !== 'hidden') runBackgroundSyncOnce('timer').catch(() => {});
  }, 5 * 60 * 1000);
}

async function syncAfterLogin() {
  if (isOnlineConfigured()) startBackgroundSync();
  return { ok: true, mode: isOnlineConfigured() ? 'online_primary_cache_offline' : 'local' };
}

async function cloudAfterPut(storeName, record) {
  try {
    if (!isOnlineConfigured()) return;
    if (storeName === 'products') await upsertCloudProduct(record);
    if (storeName === 'sales') await insertCloudSale(record);
    if (storeName === 'purchaseOrders') await insertCloudPurchaseOrder(record);
    if (storeName === 'messages') await insertCloudMessage(record);
  } catch (err) {
    console.warn('Sincronización diferida:', err.message);
  }
}

async function cloudAfterDelete(storeName, id) {
  try {
    if (!isOnlineConfigured()) return;
    if (storeName === 'products') await deleteCloudProduct(id);
  } catch (err) {
    console.warn('Eliminación online diferida:', err.message);
  }
}


async function testOnlineConnection() {
  try {
    const sb = getSupabaseClient();
    if (!sb) return { ok: false, message: 'Configura URL y anon key.' };
    const { error } = await sb.from('products').select('id').limit(1);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || 'Error desconocido.' };
  }
}

window.getSavedOnlineConfig = getSavedOnlineConfig;
window.effectiveOnlineConfig = effectiveOnlineConfig;
window.getOnlineConfigValue = getOnlineConfigValue;
window.saveOnlineConfig = saveOnlineConfig;
window.isOnlineConfigured = isOnlineConfigured;
window.getSupabaseClient = getSupabaseClient;
window.onlineSignIn = onlineSignIn;
window.onlineSignOut = onlineSignOut;
window.getOnlineSessionProfile = getOnlineSessionProfile;
window.syncCloudProductsToLocal = syncCloudProductsToLocal;
window.openSafeCloudSyncSheet = openSafeCloudSyncSheet;
window.createPreSyncLocalSnapshot = createPreSyncLocalSnapshot;
window.pushLocalProductsToCloud = pushLocalProductsToCloud;
window.syncAfterLogin = syncAfterLogin;
window.cloudAfterPut = cloudAfterPut;
window.cloudAfterDelete = cloudAfterDelete;
window.testOnlineConnection = testOnlineConnection;
window.flushPendingSyncQueue = flushPendingSyncQueue;
window.runBackgroundSyncOnce = runBackgroundSyncOnce;
window.startBackgroundSync = startBackgroundSync;
window.uploadProductPhotoIfNeeded = uploadProductPhotoIfNeeded;
window.insertCloudMessage = insertCloudMessage;
window.fetchCloudInboxMessages = fetchCloudInboxMessages;
window.markCloudMessageRead = markCloudMessageRead;
window.fetchCloudProfiles = fetchCloudProfiles;
window.updateCloudProfileStatus = updateCloudProfileStatus;
window.insertCloudPurchaseOrder = insertCloudPurchaseOrder;
window.fetchCloudPurchaseOrders = fetchCloudPurchaseOrders;
window.updateCloudPurchaseOrderStatus = updateCloudPurchaseOrderStatus;
