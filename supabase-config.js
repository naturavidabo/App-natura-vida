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
  // CORRECCIÓN V6.6: el modelo único de usuario usa ahora 'pendiente' /
  // 'activo' / 'bloqueado' (antes era 'active'/'inactive'). Solo 'bloqueado'
  // impide iniciar sesión; 'pendiente' SÍ puede entrar (queda con permisos
  // restringidos, ver AppState.session.pendingApproval), tal como pide la
  // orden de refactorización V6 ("mientras esté pendiente no puede vender ni
  // sincronizar, pero igual puede entrar a ver su estado").
  const status = String((profile && profile.status) || '').toLowerCase();
  if (!profile || status === 'bloqueado' || status === 'inactive') {
    await sb.auth.signOut();
    return { ok: false, message: 'Esta cuenta está bloqueada. Contacta al administrador.' };
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
  const status = String((profile && profile.status) || '').toLowerCase();
  if (!profile || status === 'bloqueado' || status === 'inactive') return null;
  return { user, profile };
}

async function upsertCloudProfileForUser(userId, username, profile = {}) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return { ok: false };
  // CORRECCIÓN V6.6: status y role ya no quedan fijos en 'active'/'Revendedor'.
  // Quien llama a esta función decide (los representantes que activan su
  // celular bajo el flujo legacy siguen entrando como 'activo', para no
  // cortarles el acceso que ya tenían; las cuentas NUEVAS creadas con el
  // flujo de "Crear cuenta" entran como 'pendiente' hasta que el
  // administrador las apruebe, según la orden de refactorización V6).
  const roleCanonical = String(profile.roleCanonical || (profile.roleName === 'Administrador' ? 'administrador' : 'representante')).toLowerCase();
  const row = {
    id: userId,
    username: String(username || '').toLowerCase(),
    email: profile.email || null,
    full_name: profile.fullName || '',
    role: roleCanonical,
    role_id: profile.roleId || (roleCanonical === 'administrador' ? 'role_admin' : 'role_reseller'),
    status: profile.statusCanonical || 'activo',
    phone: profile.phone || '',
    city: profile.city || '',
    document_id: profile.documentId || '',
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('profiles').upsert(row, { onConflict: 'id' });
  if (error) { console.warn('No se pudo guardar perfil online:', error.message); return { ok: false, message: error.message }; }
  return { ok: true, row };
}

// ============================================================================
// MODELO ÚNICO DE USUARIO POR CORREO (Orden de Refactorización V6, fase 1)
// ----------------------------------------------------------------------------
// A diferencia de createOrLinkCloudAccount (V6.2, pensado para activar un
// celular con número de teléfono y correo sintético), estas funciones son
// para el flujo NUEVO: "Crear cuenta" con correo real, "Ya tengo cuenta" y
// "Recuperar acceso". Supabase es la única fuente de verdad: no se crea
// ningún registro local en paralelo.
// ============================================================================

async function signUpEmailAccount(email, password, fullName, extra = {}) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, message: error.message };
  if (!data || !data.user) return { ok: false, message: 'No se pudo crear la cuenta.' };

  // ¿Es la primera cuenta de todo el proyecto? => admin automático.
  const countRes = await sb.from('profiles').select('id', { count: 'exact', head: true }).catch(() => ({ count: null }));
  const isFirstEverUser = !countRes || !countRes.count;

  // Código de activación: si es correcto => administrador; vacío/incorrecto => representante.
  const activationOk = String(extra.activationCode || '').trim() === window.NATURA_ADMIN_ACTIVATION_CODE;
  const roleCanonical = (isFirstEverUser || activationOk) ? 'administrador' : 'representante';
  const statusCanonical = (isFirstEverUser || activationOk) ? 'activo' : 'pendiente';

  const profileResult = await upsertCloudProfileForUser(data.user.id, email, {
    fullName, email,
    roleCanonical, statusCanonical,
    phone: extra.phone || '',
    city: extra.city || ''
  });

  const profile = (profileResult && profileResult.row) || {
    id: data.user.id, email, full_name: fullName,
    role: roleCanonical, status: statusCanonical,
    phone: extra.phone || '', city: extra.city || ''
  };

  return {
    ok: true,
    user: data.user,
    session: data.session || null,
    needsEmailConfirmation: !data.session,
    profile
  };
}

async function sendPasswordRecoveryEmail(email) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { error } = await sb.auth.resetPasswordForEmail(email);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

async function touchLastLogin(userId) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return;
  await sb.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', userId).catch(() => {});
}

// Cambiar el estado de un usuario (aprobar / bloquear / desbloquear). Solo el
// administrador puede hacerlo — ver sección "BLOQUEO DE USUARIOS" de la orden.
async function setProfileStatus(userId, statusCanonical) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  if (!AppState.session || AppState.session.roleCanonical !== 'administrador') {
    return { ok: false, message: 'Solo un administrador puede cambiar el estado de un usuario.' };
  }
  const validStatuses = ['pendiente', 'activo', 'bloqueado'];
  if (!validStatuses.includes(statusCanonical)) return { ok: false, message: 'Estado no válido.' };
  const { error } = await sb.from('profiles').update({ status: statusCanonical, updated_at: new Date().toISOString() }).eq('id', userId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// Lista completa de usuarios para el panel del administrador (sección
// "BLOQUEO DE USUARIOS" / "APROBACIÓN DE NUEVOS USUARIOS").
async function fetchAllProfilesForAdmin() {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) return { ok: false, message: error.message };
  return { ok: true, profiles: data || [] };
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

function preserveRepresentativeLocalFields(existing, cloud, repStockMap) {
  const local = existing || {};
  const preservedPhoto = cloud.photo || local.photo || null;
  // V6.3: si ya hay un valor de stock propio guardado en la nube para este
  // representante y este producto, ese pasa a ser el valor correcto (es el
  // mismo en todos sus celulares). Si todavía no existe en la nube (cuenta
  // no vinculada, o producto nunca antes sincronizado), se conserva el
  // comportamiento anterior: el stock local de este dispositivo.
  const cloudStock = repStockMap && repStockMap.has(cloud.id) ? Number(repStockMap.get(cloud.id)) : null;
  const stock = cloudStock !== null ? cloudStock : (existing ? (Number(local.stock) || 0) : 0);
  return normalizeLegacyProduct(Object.assign({}, cloud, {
    photo: preservedPhoto,
    stock,
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

function buildSafeProductMerge(cloudRows, repStockMap) {
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
    if (window.isReseller && isReseller()) return preserveRepresentativeLocalFields(existing, cloud, repStockMap);
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
  // CORRECCIÓN V6.5 (bug crítico encontrado en auditoría): antes, si la
  // consulta a Supabase fallaba por falta de conexión justo en ese momento
  // (muy probable para un representante en la calle), esta función LANZABA
  // una excepción en vez de devolver {ok:false}. Como quien la llama
  // (openSafeCloudSyncSheet, el botón "Recibir novedades") no esperaba eso,
  // el botón quedaba colgado en "Actualizando…" para siempre, sin ningún
  // mensaje de error, y en la consola del navegador quedaba una promesa
  // rechazada sin manejar. Ahora cualquier error de red también se atrapa
  // aquí y se devuelve como {ok:false, message}, igual que un error normal
  // de Supabase.
  try {
    let query = sb.from('products').select('*').order('updated_at', { ascending: true });
    if (options.since) query = query.gt('updated_at', options.since);
    if (!options.includeArchived) query = query.neq('status', 'archived');
    const { data, error } = await query;
    if (error) return { ok: false, message: error.message };
    return { ok: true, rows: data || [] };
  } catch (err) {
    return { ok: false, message: (err && err.message) || 'Error de conexión con el servidor.' };
  }
}

async function syncCloudProductsToLocal(options = {}) {
  // CORRECCIÓN V6.5: toda la función queda protegida con try/catch. Aunque
  // fetchCloudProductRows ya no lanza excepciones por error de red, esto es
  // una protección adicional para que ningún otro fallo inesperado deje un
  // botón "Actualizando…" colgado para siempre sin mensaje de error.
  try {
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
    // V6.3: si quien sincroniza es un representante con cuenta vinculada a
    // Supabase, se trae primero su propio stock guardado en la nube, para que
    // el merge de abajo lo use en vez del valor local de este celular.
    let repStockMap = null;
    if (window.isReseller && isReseller()) {
      repStockMap = await fetchRepresentativeStockMap().catch(() => null);
    }
    const products = buildSafeProductMerge(activeRows, repStockMap);
    await DB.bulkPut('products', products, { silent: true });
    if (Array.isArray(products._obsoleteLocalIds)) {
      for (const oldId of products._obsoleteLocalIds) await DB.delete('products', oldId, { silent: true }).catch(() => {});
    }
    AppState.products = products;
    _lastCloudSync = Date.now();
    // CORRECCIÓN V6 (bug crítico): antes se guardaba new Date().toISOString(),
    // es decir, la hora del RELOJ DEL CELULAR que sincroniza. Si ese reloj
    // está adelantado aunque sea por segundos (común en celulares Android sin
    // hora exacta), el punto de corte queda por delante de cualquier producto
    // futuro, y la sincronización incremental deja de traer novedades PARA
    // SIEMPRE, sin ningún error visible — encaja exactamente con "el POST
    // devuelve 201 pero el otro dispositivo nunca lo descarga". Ahora el punto
    // de corte se calcula a partir del updated_at más reciente que realmente
    // vino del servidor (dato confiable, no depende del reloj de este celular).
    const maxUpdatedAt = rows.reduce((max, r) => {
      const t = r && r.updated_at ? new Date(r.updated_at).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    if (maxUpdatedAt > 0) {
      await setSyncMeta('products_last_sync', new Date(maxUpdatedAt).toISOString());
    }
    return {
      ok: true,
      count: rows.length,
      localCount: products.length,
      beforeCount,
      preservedLocal: Math.max(0, products.length - rows.length),
      message: 'Catálogo actualizado sin borrar inventario local.'
    };
  } catch (err) {
    return { ok: false, message: (err && err.message) || 'Error inesperado al sincronizar el catálogo.' };
  }
}

async function openSafeCloudSyncSheet() {
  // CORRECCIÓN V6: antes este botón solo traía catálogo nuevo. Ahora primero
  // intenta enviar lo que el representante tenga pendiente (ventas, pedidos),
  // así "Recibir novedades" también sirve como su sincronización completa.
  await flushPendingSyncQueue().catch(() => {});
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
      // CORRECCIÓN V6: se fuerza descarga completa (full:true) en lugar de
      // incremental. Antes, la vista previa de arriba mostraba TODOS los
      // productos del servidor (fetchCloudProductRows sin filtro), pero al
      // aplicar el cambio se usaba la versión incremental (con cursor) — si
      // el cursor de este celular estaba desincronizado, la vista previa
      // podía mostrar productos nuevos que luego, al aplicar, no se
      // descargaban realmente. Forzar full:true aquí garantiza que lo que
      // se ve en la vista previa es exactamente lo que se aplica.
      const res = await syncCloudProductsToLocal({ full: true });
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
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  if (!AppState.session || AppState.session.roleName !== 'Administrador') return { ok: true, skipped: true };
  const { error } = await sb.from('products').upsert(await mapProductToCloudAsync(product), { onConflict: 'id' });
  if (error) { console.warn('No se pudo subir producto:', error.message); return { ok: false, message: error.message }; }
  return { ok: true };
}

async function deleteCloudProduct(productId) {
  const sb = getSupabaseClient();
  if (!sb || !AppState.session || AppState.session.roleName !== 'Administrador') return { ok: true, skipped: true };
  const { error } = await sb.from('products').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', productId);
  if (error) { console.warn('No se pudo archivar producto online:', error.message); return { ok: false, message: error.message }; }
  return { ok: true };
}

// ============================================================================
// STOCK PROPIO DEL REPRESENTANTE — SINCRONIZADO EN LA NUBE (V6.3 / V6.4)
// ----------------------------------------------------------------------------
// Cada representante sigue teniendo SU PROPIO stock por producto (no es el
// inventario centralizado del administrador, eso sigue siendo
// product.stock / adminStock). Ese stock propio vive en Supabase, en la
// tabla "representative_stock", ligado al UUID real de la cuenta del
// representante. Así, si esa misma persona entra desde un segundo celular,
// ve el mismo número.
//
// CORRECCIÓN V6.4 (antes el celular mandaba "mi stock final es X"; ahora
// manda "aplica este ajuste de Y unidades", positivo o negativo):
// si dos celulares del mismo representante mandaban un valor absoluto casi
// al mismo tiempo, el que llegaba último pisaba completamente al anterior —
// se podía perder el efecto de una venta hecha en el otro celular. Ahora el
// ajuste se aplica de forma ATÓMICA dentro de Supabase (función RPC
// adjust_representative_stock, ver SUPABASE_MIGRACION_V6_4_STOCK_ATOMICO_RLS.sql),
// que suma/resta sobre el valor más reciente sin pisar nada. Además, cada
// ajuste tiene un identificador propio (movementId) que se reutiliza en
// cada reintento, así un reintento por falta de conexión nunca aplica el
// mismo cambio dos veces.
//
// Requiere que el representante ya tenga cuenta vinculada en Supabase
// (AppState.session.onlineUserId) — ver la unificación de autenticación V6.2.
// Si todavía no se vinculó (por ejemplo, está usando la app sin conexión por
// primera vez), su stock sigue funcionando 100% local como antes, sin error,
// hasta que la cuenta quede vinculada.
// ============================================================================

function generateMovementId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  // Respaldo simple por si el navegador no soporta crypto.randomUUID (poco
  // probable en un celular moderno, pero mejor no romper el flujo por eso).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Aplica el ajuste de forma atómica en Supabase llamando a la función RPC.
// delta puede ser negativo (venta) o positivo (recepción de mercadería).
async function adjustRepresentativeStockRemote(productId, delta, movementId) {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  if (!AppState.session || !AppState.session.onlineUserId) {
    return { ok: false, message: 'Esta cuenta todavía no está vinculada a Supabase.' };
  }
  const { data, error } = await sb.rpc('adjust_representative_stock', {
    p_movement_id: movementId,
    p_product_id: productId,
    p_delta: Math.trunc(Number(delta) || 0)
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, stock: data };
}

// Pone en la cola duradera el ajuste de stock propio (se reintenta solo si
// no hay conexión justo en este momento, siempre con el mismo movementId)
// y, de paso, intenta enviarlo ya.
async function queueRepresentativeStockDelta(productId, delta) {
  if (!window.isReseller || !isReseller()) return;
  if (!AppState.session || !AppState.session.onlineUserId) return;
  if (!isOnlineConfigured()) return;
  const cleanDelta = Math.trunc(Number(delta) || 0);
  if (!cleanDelta) return; // nada que ajustar
  const movementId = generateMovementId();
  if (window.queueSync) await queueSync('representativeStockDelta', productId, 'put', { productId, delta: cleanDelta, movementId }).catch(() => {});
  if (window.flushPendingSyncQueue) flushPendingSyncQueue(5).catch(() => {});
}

// Trae, para el representante con sesión actual, su propio stock de todos
// los productos ya guardado en la nube. Devuelve un Map productId -> stock.
async function fetchRepresentativeStockMap() {
  const sb = getSupabaseClient();
  if (!sb || !AppState.session || !AppState.session.onlineUserId) return null;
  const { data, error } = await sb.from('representative_stock').select('product_id, stock').eq('representative_user_id', AppState.session.onlineUserId);
  if (error) { console.warn('No se pudo leer stock propio en la nube:', error.message); return null; }
  const map = new Map();
  (data || []).forEach(row => map.set(row.product_id, Number(row.stock) || 0));
  return map;
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
  // CORRECCIÓN V6: antes usaba insert(), que fallaba con error de llave duplicada
  // si la venta se reintentaba (por ejemplo tras recuperar conexión). Ese error
  // detenía TODA la cola de sincronización (ver flushPendingSyncQueue). upsert
  // hace que reintentar la misma venta sea seguro.
  const { error } = await sb.from('sales').upsert(mapSaleToCloud(sale), { onConflict: 'id' });
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
  // CORRECCIÓN V6: upsert en lugar de insert, por la misma razón que insertCloudSale.
  const { error } = await sb.from('purchase_orders').upsert(mapPurchaseOrderToCloud(order), { onConflict: 'id' });
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
    if (item.storeName === 'representativeStockDelta') {
      const res = await adjustRepresentativeStockRemote(item.payload.productId, item.payload.delta, item.payload.movementId);
      if (!res.ok) throw new Error(res.message || 'No se pudo ajustar el stock del representante.');
      return { ok: true };
    }
    await cloudAfterPut(item.storeName, item.payload);
    return { ok: true };
  }
  return { ok: true };
}

async function flushPendingSyncQueue(limit = 25) {
  if (!isOnlineConfigured() || !window.DB) return { ok: false, message: 'Servidor no configurado.' };
  const MAX_ATTEMPTS = 8;
  const items = (await DB.getAll('syncQueue').catch(() => []))
    .filter(i => i.status === 'pending')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .slice(0, limit);
  let sent = 0;
  let failed = 0;
  // CORRECCIÓN V6 (bug crítico): antes, si UN solo elemento de la cola fallaba
  // (por ejemplo una venta duplicada), el "break" detenía el envío de TODOS los
  // elementos siguientes en la cola — productos, ventas, pedidos y mensajes
  // quedaban pendientes para siempre, incluso después de recuperar conexión.
  // Esto explica por qué la mensajería y los pedidos "funcionaban al principio
  // y luego dejaban de funcionar": bastaba un solo error para trabar todo lo
  // que viniera después. Ahora se usa "continue": un elemento con error se
  // reintenta más tarde, pero no bloquea a los demás.
  for (const item of items) {
    try {
      item.attempts = (item.attempts || 0) + 1;
      await pushQueuedItem(item);
      item.status = 'done';
      item.updatedAt = Date.now();
      await DB.put('syncQueue', item, { silent: true });
      sent++;
    } catch (err) {
      item.lastError = err.message || 'Error desconocido';
      item.updatedAt = Date.now();
      if ((item.attempts || 0) >= MAX_ATTEMPTS) {
        // Tras varios intentos fallidos (ej.: falta ejecutar una migración SQL,
        // o un registro con datos inválidos) se marca como "failed" para dejar
        // de reintentarlo indefinidamente y no acumular ruido en la cola.
        item.status = 'failed';
        failed++;
      } else {
        item.status = 'pending';
      }
      await DB.put('syncQueue', item, { silent: true }).catch(() => {});
      // Ya no se hace "break": se continúa con el resto de la cola.
      continue;
    }
  }
  return { ok: true, sent, failed, pending: Math.max(0, items.length - sent - failed) };
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

// Suscripciones Realtime activas (se guardan para poder limpiarlas si hace falta)
let _realtimeChannels = [];

// V6.7 — REALTIME (sección 5 de la Orden de Refactorización V6):
// Reemplaza el polling cada 5 minutos por suscripciones en tiempo real.
// El intervalo de 5 min se mantiene SOLO como respaldo de reconexión (no
// como mecanismo principal), tal como pide la sección 9 de la orden anterior
// ("conservar sincronización automática en segundo plano"). Así, si la
// conexión WebSocket de Realtime se cae momentáneamente (común en campo),
// el intervalo la recupera sin que el representante tenga que hacer nada.
function startRealtimeSubscriptions() {
  const sb = getSupabaseClient();
  if (!sb || !sb.channel) return; // SDK sin soporte Realtime (versión vieja)

  // Limpiamos suscripciones anteriores si las hubiera
  _realtimeChannels.forEach(ch => { try { sb.removeChannel(ch); } catch (_) {} });
  _realtimeChannels = [];

  // Productos: cuando el admin guarda uno, todos los representantes
  // lo ven sin tener que presionar "Actualizar".
  const chProducts = sb.channel('realtime:products')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
      await syncCloudProductsToLocal({ full: false }).catch(() => {});
      await loadAllState().catch(() => {});
      if (window.render) render();
    })
    .subscribe();

  // Pedidos: el admin ve los pedidos nuevos de representantes en vivo.
  const chOrders = sb.channel('realtime:purchase_orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, async () => {
      if (window.fetchAndCachePurchaseOrders) await fetchAndCachePurchaseOrders().catch(() => {});
      if (window.refreshInboxBadge) refreshInboxBadge({ silent: true }).catch(() => {});
    })
    .subscribe();

  // Mensajes: bandeja de mensajes en vivo.
  const chMessages = sb.channel('realtime:messages')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async () => {
      if (window.refreshInboxBadge) refreshInboxBadge({ silent: true }).catch(() => {});
    })
    .subscribe();

  // Perfiles: el representante ve su propio cambio de estado (pendiente->activo)
  // sin tener que cerrar y volver a abrir la app.
  const chProfiles = sb.channel('realtime:profiles')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: AppState.session && AppState.session.onlineUserId
          ? `id=eq.${AppState.session.onlineUserId}` : undefined }, async (payload) => {
      if (!payload || !payload.new) return;
      const newStatus = String(payload.new.status || '').toLowerCase();
      if (AppState.session) {
        AppState.session.statusCanonical = newStatus;
        AppState.session.pendingApproval = newStatus === 'pendiente';
      }
      if (window.render) render();
    })
    .subscribe();

  _realtimeChannels = [chProducts, chOrders, chMessages, chProfiles];
}

function startBackgroundSync() {
  if (_backgroundSyncStarted) return;
  _backgroundSyncStarted = true;

  // Intento inmediato al arrancar
  setTimeout(() => runBackgroundSyncOnce('startup').catch(() => {}), 2500);

  // Reconexión tras recuperar red
  window.addEventListener('online', () => runBackgroundSyncOnce('online').catch(() => {}));

  // Iniciar suscripciones Realtime (reemplaza el polling como mecanismo principal)
  startRealtimeSubscriptions();

  // Respaldo: cada 5 min, solo si la app está visible.
  // Sirve para reconectar Realtime si el websocket cayó, y para vaciar la cola.
  setInterval(() => {
    if (document.visibilityState !== 'hidden') runBackgroundSyncOnce('timer_fallback').catch(() => {});
  }, 5 * 60 * 1000);
}

async function syncAfterLogin() {
  if (!isOnlineConfigured()) return { ok: true, mode: 'local' };
  // CORRECCIÓN V6.2 — SUPABASE COMO FUENTE PRINCIPAL: en vez de solo
  // programar la sincronización en segundo plano (que esperaba 2.5s y
  // luego usaba descarga incremental), ahora se hace una descarga COMPLETA
  // inmediatamente al iniciar sesión, antes de mostrar el panel principal.
  // Así la información que ve la persona justo después de entrar viene
  // siempre de Supabase, no de lo que haya quedado guardado en este
  // celular de una sesión anterior.
  await flushPendingSyncQueue().catch(() => {});
  const pulled = await syncCloudProductsToLocal({ full: true }).catch(err => ({ ok: false, message: err.message }));
  if (pulled && pulled.ok) {
    await loadAllState().catch(() => {});
    if (window.render) render();
  }
  startBackgroundSync();
  return { ok: true, mode: 'online_primary_cache_offline', pulled };
}

async function cloudAfterPut(storeName, record) {
  if (!isOnlineConfigured()) return { ok: true, skipped: true };
  // CORRECCIÓN V6.5 (bug crítico encontrado en auditoría): antes esta
  // función atrapaba CUALQUIER error y solo lo mostraba con console.warn,
  // sin avisarle a quien la llamó (pushQueuedItem) que algo había fallado.
  // Como pushQueuedItem hacía "return {ok:true}" sin más después de
  // llamarla, un elemento de la cola se marcaba "done" (enviado) aunque en
  // realidad NUNCA hubiera llegado a Supabase — por ejemplo, ante un error
  // de validación del servidor o una caída de red en ese momento exacto.
  // El dato quedaba perdido para Supabase sin ningún reintento ni aviso.
  // Ahora se revisa el resultado de cada función de envío y, si falló, se
  // relanza el error para que pushQueuedItem / flushPendingSyncQueue lo
  // detecten y reintenten como corresponde.
  try {
    let res = { ok: true };
    if (storeName === 'products') res = await upsertCloudProduct(record);
    if (storeName === 'sales') res = await insertCloudSale(record);
    if (storeName === 'purchaseOrders') res = await insertCloudPurchaseOrder(record);
    if (storeName === 'messages') res = await insertCloudMessage(record);
    if (res && res.ok === false) throw new Error(res.message || 'No se pudo sincronizar con Supabase.');
    return { ok: true };
  } catch (err) {
    console.warn('Sincronización diferida:', err.message);
    throw err;
  }
}

async function cloudAfterDelete(storeName, id) {
  if (!isOnlineConfigured()) return { ok: true, skipped: true };
  try {
    let res = { ok: true };
    if (storeName === 'products') res = await deleteCloudProduct(id);
    if (res && res.ok === false) throw new Error(res.message || 'No se pudo eliminar en Supabase.');
    return { ok: true };
  } catch (err) {
    console.warn('Eliminación online diferida:', err.message);
    throw err;
  }
}


async function runFullAdminSync() {
  // CORRECCIÓN V6 (bug crítico): el botón "Actualizar" del administrador antes
  // SOLO publicaba (push) lo que hubiera en el celular hacia Supabase, pero
  // nunca traía (pull) lo que otro dispositivo o el propio Supabase tuvieran
  // de nuevo. Por eso, dos celulares con la cuenta de administrador divergían
  // para siempre: cada uno solo subía su propia versión, ninguno bajaba la
  // del otro. Ahora el botón hace las tres cosas en orden:
  //   1) Envía lo que esté pendiente en la cola (ventas, pedidos, mensajes).
  //   2) Trae del servidor los productos más nuevos (incluye cambios hechos
  //      desde OTRO celular o directamente en Supabase).
  //   3) Publica hacia el servidor los productos locales (por si este celular
  //      tiene productos nuevos que el servidor todavía no tiene).
  if (!isOnlineConfigured()) return { ok: false, message: 'Servidor online no configurado.' };
  const flush = await flushPendingSyncQueue().catch(err => ({ ok: false, message: err.message }));
  const pulled = await syncCloudProductsToLocal({ full: true }).catch(err => ({ ok: false, message: err.message }));
  if (pulled && pulled.ok) {
    await loadAllState().catch(() => {});
  }
  const pushed = await pushLocalProductsToCloud().catch(err => ({ ok: false, message: err.message }));
  return { ok: true, flush, pulled, pushed };
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
window.runFullAdminSync = runFullAdminSync;
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
window.upsertCloudProfileForUser = upsertCloudProfileForUser;
window.adjustRepresentativeStockRemote = adjustRepresentativeStockRemote;
window.queueRepresentativeStockDelta = queueRepresentativeStockDelta;
window.fetchRepresentativeStockMap = fetchRepresentativeStockMap;
window.signUpEmailAccount = signUpEmailAccount;
window.sendPasswordRecoveryEmail = sendPasswordRecoveryEmail;
window.touchLastLogin = touchLastLogin;
window.setProfileStatus = setProfileStatus;
window.fetchAllProfilesForAdmin = fetchAllProfilesForAdmin;
