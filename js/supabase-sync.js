/* Natura Vida V7 — Supabase único + Realtime.
   - Supabase Auth/PostgreSQL/Storage son la única fuente persistente.
   - No lee URL/key desde el teléfono.
   - No existe cola offline ni sincronización manual.
   - La memoria del navegador se repuebla desde Supabase al iniciar sesión
     y ante cada evento Realtime permitido por RLS. */

let _supabaseClient = null;
let _realtimeChannel = null;
let _realtimeRestartTimer = null;
let _backgroundStarted = false;
let _refreshInFlight = null;
let _deferredRenderPending = false;

const CloudConnection = {
  state: navigator.onLine ? 'connecting' : 'offline',
  detail: '',
  updatedAt: Date.now()
};


function shouldDeferCloudRender() {
  if (window.V7_FORM_DIRTY) return true;
  const active = document.activeElement;
  if (!active) return false;
  const tag = String(active.tagName || '').toUpperCase();
  return ['INPUT','TEXTAREA','SELECT'].includes(tag) && !active.readOnly && !active.disabled;
}

function renderAfterCloudRefresh() {
  if (!window.render) return;
  if (shouldDeferCloudRender()) {
    _deferredRenderPending = true;
    return;
  }
  _deferredRenderPending = false;
  render();
}

function flushDeferredCloudRender() {
  if (!_deferredRenderPending || shouldDeferCloudRender()) return;
  _deferredRenderPending = false;
  if (window.render) render();
}

document.addEventListener('focusout', () => setTimeout(flushDeferredCloudRender, 180));
window.addEventListener('nv:form-saved', flushDeferredCloudRender);

function effectiveOnlineConfig() {
  return window.NATURA_ONLINE_CONFIG || {};
}

function getSavedOnlineConfig() { return null; }
function saveOnlineConfig() { return effectiveOnlineConfig(); }

function getOnlineConfigValue(key) {
  const value = effectiveOnlineConfig()[key] || '';
  return String(value).includes('PEGAR_AQUI') ? '' : value;
}

function isOnlineConfigured() {
  const cfg = effectiveOnlineConfig();
  return Boolean(
    cfg.enabled !== false &&
    cfg.supabaseUrl &&
    cfg.supabaseAnonKey &&
    !String(cfg.supabaseUrl).includes('PEGAR_AQUI') &&
    !String(cfg.supabaseAnonKey).includes('PEGAR_AQUI')
  );
}

function setCloudConnectionState(state, detail = '') {
  CloudConnection.state = state;
  CloudConnection.detail = detail || '';
  CloudConnection.updatedAt = Date.now();
  window.dispatchEvent(new CustomEvent('nv:connection', {
    detail: Object.assign({}, CloudConnection)
  }));
}

function getSupabaseClient() {
  if (!isOnlineConfigured()) return null;
  if (_supabaseClient) return _supabaseClient;
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    setCloudConnectionState('error', 'No cargó la librería de Supabase');
    return null;
  }
  const cfg = effectiveOnlineConfig();
  _supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'nv7-auth'
    },
    realtime: { params: { eventsPerSecond: 10 } }
  });
  return _supabaseClient;
}

function appRedirectUrl() {
  const path = window.location.pathname.replace(/index\.html$/i, '');
  return `${window.location.origin}${path}`;
}

function messageFromError(error, fallback = 'No se pudo completar la operación.') {
  const raw = String((error && error.message) || error || fallback);
  if (/audit_log.*user_id|column ["']?user_id["']? of relation ["']?audit_log/i.test(raw)) {
    return 'La base de datos de ventas necesita la migración V7.2. La venta no fue registrada ni debe repetirse hasta aplicar el archivo SQL incluido.';
  }
  if (/invalid api key/i.test(raw)) return 'La Publishable key de Supabase no es válida o no pertenece a este proyecto.';
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(raw)) return 'Se perdió la conexión con Supabase. Se verificará si la operación alcanzó a guardarse antes de permitir reintentar.';
  if (/email not confirmed/i.test(raw)) return 'Confirma primero el mensaje enviado a tu Gmail.';
  if (/invalid login credentials/i.test(raw)) return 'Correo o contraseña incorrectos.';
  if (/row-level security|violates row level security|permission denied/i.test(raw)) return 'Supabase rechazó la operación por permisos. Revisa las políticas RLS de la migración V7.2.';
  if (/duplicate key|already exists/i.test(raw)) return 'La operación ya existe y no se volverá a registrar.';
  return raw.length > 220 ? fallback : raw;
}

async function requireClient() {
  if (!navigator.onLine) throw new Error('Sin internet. Natura Vida trabaja directamente con Supabase.');
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase no está configurado correctamente.');
  return sb;
}

// ---------------------------------------------------------------------------
// AUTH Y PERFILES
// ---------------------------------------------------------------------------
async function fetchCurrentProfile(userId) {
  const sb = await requireClient();
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(messageFromError(error));
  return data || null;
}

async function ensureSignedInProfile() {
  const sb = await requireClient();
  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError) throw new Error(messageFromError(sessionError));
  const user = sessionData && sessionData.session && sessionData.session.user;
  if (!user) return null;
  const { error: ensureError } = await sb.rpc('ensure_my_profile');
  if (ensureError) throw new Error(messageFromError(ensureError));
  const profile = await fetchCurrentProfile(user.id);
  return profile ? { user, profile } : null;
}

async function onlineSignIn(email, password) {
  try {
    const sb = await requireClient();
    setCloudConnectionState('connecting', 'Verificando acceso');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: messageFromError(error) };
    const { error: ensureError } = await sb.rpc('ensure_my_profile');
    if (ensureError) return { ok: false, message: messageFromError(ensureError) };
    const profile = await fetchCurrentProfile(data.user.id);
    if (!profile) return { ok: false, message: 'La cuenta existe, pero su perfil no fue creado. Ejecuta la migración SQL de Natura Vida V7.' };
    if (String(profile.status).toLowerCase() === 'bloqueado') {
      await sb.auth.signOut();
      return { ok: false, message: 'Esta cuenta está bloqueada. Contacta al administrador.' };
    }
    setCloudConnectionState('online', 'Sesión autenticada');
    return { ok: true, user: data.user, profile };
  } catch (error) {
    setCloudConnectionState('error', messageFromError(error));
    return { ok: false, message: messageFromError(error) };
  }
}

async function onlineSignOut() {
  stopRealtimeSubscriptions();
  const sb = getSupabaseClient();
  if (sb) await sb.auth.signOut().catch(() => {});
  setCloudConnectionState(navigator.onLine ? 'connecting' : 'offline', 'Sesión cerrada');
}

async function getOnlineSessionProfile() {
  try { return await ensureSignedInProfile(); }
  catch (error) {
    console.warn('No se pudo restaurar sesión:', messageFromError(error));
    return null;
  }
}

async function upsertCloudProfileForUser(userId, _username, profile = {}) {
  const sb = await requireClient();
  const current = await sb.auth.getUser();
  if (!current.data || !current.data.user || current.data.user.id !== userId) {
    return { ok: false, message: 'Solo puedes actualizar tu propio perfil.' };
  }
  const { data, error } = await sb.rpc('update_my_profile', {
    p_full_name: profile.fullName || profile.full_name || '',
    p_phone: profile.phone || '',
    p_city: profile.city || ''
  });
  return error ? { ok: false, message: messageFromError(error) } : { ok: true, profile: data };
}

async function signUpEmailAccount(email, password, fullName, extra = {}) {
  try {
    const sb = await requireClient();
    setCloudConnectionState('connecting', 'Creando cuenta');
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: appRedirectUrl(),
        data: {
          full_name: fullName || '',
          phone: extra.phone || '',
          city: extra.city || ''
        }
      }
    });
    if (error) return { ok: false, message: messageFromError(error) };
    if (!data || !data.user) return { ok: false, message: 'Supabase no devolvió el usuario creado.' };
    if (!data.session) {
      return {
        ok: true,
        user: data.user,
        needsEmailConfirmation: true,
        message: 'Cuenta creada. Revisa tu Gmail y confirma el correo antes de iniciar sesión.'
      };
    }
    const { error: ensureError } = await sb.rpc('ensure_my_profile');
    if (ensureError) return { ok: false, message: messageFromError(ensureError) };
    const profile = await fetchCurrentProfile(data.user.id);
    setCloudConnectionState('online', 'Cuenta creada');
    return { ok: true, user: data.user, profile };
  } catch (error) {
    setCloudConnectionState('error', messageFromError(error));
    return { ok: false, message: messageFromError(error) };
  }
}

async function sendPasswordRecoveryEmail(email) {
  try {
    const sb = await requireClient();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appRedirectUrl() });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function waitForPasswordRecoverySession(timeoutMs = 7000) {
  const sb = getSupabaseClient();
  if (!sb) return false;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data } = await sb.auth.getSession();
    if (data && data.session) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

async function updateCurrentUserPassword(newPassword) {
  try {
    if (!newPassword || newPassword.length < 6) return { ok: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    const sb = await requireClient();
    const { error } = await sb.auth.updateUser({ password: newPassword });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, message: 'Contraseña actualizada correctamente.' };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function touchLastLogin() {
  try {
    const sb = await requireClient();
    const { error } = await sb.rpc('touch_last_login');
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function setProfileStatus(userId, statusCanonical) {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.rpc('admin_set_profile_status', {
      p_user_id: userId,
      p_status: statusCanonical
    });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, profile: data };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function fetchAllProfilesForAdmin() {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, profiles: data || [] };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

const fetchCloudProfiles = fetchAllProfilesForAdmin;
const updateCloudProfileStatus = setProfileStatus;

// ---------------------------------------------------------------------------
// FOTOS Y PRODUCTOS
// ---------------------------------------------------------------------------
function isDataUrlImage(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function dataUrlToBlob(dataUrl) {
  const [meta = '', encoded = ''] = String(dataUrl || '').split(',');
  const mime = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadProductPhotoIfNeeded(product) {
  if (!product || !isDataUrlImage(product.photo)) return product && product.photo ? product.photo : null;
  const sb = await requireClient();
  const bucket = effectiveOnlineConfig().productImagesBucket || 'product-images';
  const safeId = String(product.id || uid('prod')).replace(/[^a-z0-9_-]/gi, '_');
  const path = `${safeId}/main.jpg`;
  const blob = dataUrlToBlob(product.photo);
  const { error } = await sb.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '86400'
  });
  if (error) throw new Error(`No se pudo subir la imagen: ${messageFromError(error)}`);
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  if (!data || !data.publicUrl) throw new Error('Supabase Storage no devolvió la URL de la imagen.');
  return `${data.publicUrl}?v=${Date.now()}`;
}

function stripEmbeddedImages(value) {
  if (!value || typeof value !== 'object') return value;
  const result = JSON.parse(JSON.stringify(value));
  if (isDataUrlImage(result.photo)) result.photo = null;
  if (result.payload && typeof result.payload === 'object') result.payload = stripEmbeddedImages(result.payload);
  return result;
}

async function mapProductToCloud(product) {
  const p = normalizeLegacyProduct(product);
  const photoUrl = await uploadProductPhotoIfNeeded(p);
  const payload = stripEmbeddedImages(Object.assign({}, p, { photo: photoUrl }));
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
    photo_url: photoUrl,
    status: p.status || 'active',
    payload
  };
}

function mapProductFromCloud(row, repStockMap = null, repPrefsMap = null) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const centralStock = Number(row.stock || 0);
  const stockEntry = repStockMap && repStockMap.has(row.id) ? repStockMap.get(row.id) : null;
  const ownStock = stockEntry && typeof stockEntry === 'object' ? Number(stockEntry.stock || 0) : Number(stockEntry || 0);
  const acquisitionCost = stockEntry && typeof stockEntry === 'object' ? Number(stockEntry.acquisitionCost || 0) : 0;
  const prefs = repPrefsMap && repPrefsMap.has(row.id) ? repPrefsMap.get(row.id) : {};
  return normalizeLegacyProduct(Object.assign({}, payload, prefs, {
    id: row.id,
    name: row.name,
    category: row.category || 'General',
    sku: row.sku || '',
    description: row.description || '',
    cost: Number(row.cost || 0),
    marketPrice: Number(row.market_price || 0),
    wholesaleMarketPrice: Number(row.market_price || 0),
    resellerPrice: Number(row.reseller_price || 0),
    publicPrice: Number(row.public_price || 0),
    marketPriceFixed: Number(row.market_price || 0),
    wholesalePriceFixed: Number(row.reseller_price || 0),
    unitPriceFixed: Number(row.public_price || 0),
    stock: window.isReseller && isReseller() ? ownStock : centralStock,
    adminStock: centralStock,
    resellerAcquisitionCost: acquisitionCost || Number(row.reseller_price || 0),
    photo: row.photo_url || null,
    status: row.status || 'active',
    syncStatus: 'cloud',
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  }));
}

async function fetchRepresentativeStockMap() {
  if (!AppState.session || !AppState.session.onlineUserId) return new Map();
  const sb = await requireClient();
  const { data, error } = await sb.from('representative_stock')
    .select('product_id,stock,acquisition_cost')
    .eq('representative_user_id', AppState.session.onlineUserId);
  if (error) throw new Error(messageFromError(error));
  return new Map((data || []).map(row => [row.product_id, {
    stock: Number(row.stock || 0),
    acquisitionCost: Number(row.acquisition_cost || 0)
  }]));
}

async function syncCloudProductsToLocal() {
  const sb = await requireClient();
  const { data, error } = await sb.from('products').select('*').eq('status', 'active').order('updated_at', { ascending: true });
  if (error) return { ok: false, message: messageFromError(error) };
  let repStockMap = null;
  let repPrefsMap = null;
  if (window.isReseller && isReseller()) {
    repStockMap = await fetchRepresentativeStockMap();
    const { data: prefRows, error: prefError } = await sb.from('representative_product_preferences')
      .select('*').eq('representative_user_id', AppState.session.onlineUserId);
    if (prefError) return { ok: false, message: messageFromError(prefError) };
    repPrefsMap = new Map((prefRows || []).map(row => [row.product_id, {
      resellerAdditionalCost: Number(row.additional_cost || 0),
      resellerLocalUnitPrice: Number(row.unit_price || 0),
      resellerLocalWholesalePrice: Number(row.wholesale_price || 0),
      resellerLocalNote: row.note || '',
      resellerLocalUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
    }]));
  }
  const products = (data || []).map(row => mapProductFromCloud(row, repStockMap, repPrefsMap));
  await DB.clear('products');
  if (products.length) await DB.bulkPut('products', products, { silent: true });
  AppState.products = products;
  return { ok: true, count: products.length };
}

async function upsertCloudProduct(product) {
  try {
    if (!isAdmin()) return { ok: false, message: 'Solo el administrador puede modificar productos.' };
    const sb = await requireClient();
    const row = await mapProductToCloud(product);
    const { data, error } = await sb.from('products').upsert(row, { onConflict: 'id' }).select().single();
    if (error) return { ok: false, message: messageFromError(error) };
    return { ok: true, row: data };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function deleteCloudProduct(productId) {
  try {
    if (!isAdmin()) return { ok: false, message: 'Solo el administrador puede eliminar productos.' };
    const sb = await requireClient();
    const { error } = await sb.from('products').update({ status: 'archived' }).eq('id', productId);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function pushLocalProductsToCloud() {
  return { ok: false, message: 'La publicación manual fue eliminada. Cada producto se guarda directamente en Supabase.' };
}

function generateMovementId() {
  return crypto.randomUUID ? crypto.randomUUID() : `mov_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function adjustRepresentativeStockRemote(productId, delta, movementId = generateMovementId()) {
  try {
    const sb = await requireClient();
    const cleanDelta = Number(delta || 0);
    if (!Number.isFinite(cleanDelta) || cleanDelta === 0) return { ok: true, stock: null };
    const { data, error } = await sb.rpc('adjust_representative_stock', {
      p_movement_id: movementId,
      p_product_id: productId,
      p_delta: cleanDelta
    });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, stock: Number(data || 0), movementId };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function queueRepresentativeStockDelta(productId, delta) {
  // Nombre conservado para compatibilidad. Ya no existe cola: la operación
  // se confirma ahora mismo en Supabase o falla sin alterar la memoria.
  return adjustRepresentativeStockRemote(productId, delta, generateMovementId());
}

async function updateRepresentativeInventoryRemote(productId, delta, preferences = {}, movementId = generateMovementId()) {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.rpc('update_representative_inventory', {
      p_movement_id: movementId,
      p_product_id: productId,
      p_delta: Number(delta || 0),
      p_additional_cost: Number(preferences.additionalCost || 0),
      p_unit_price: Number(preferences.unitPrice || 0),
      p_wholesale_price: Number(preferences.wholesalePrice || 0),
      p_note: String(preferences.note || '')
    });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, stock: Number(data || 0), movementId };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

// ---------------------------------------------------------------------------
// CLIENTES, VENTAS Y REGISTROS MODULARES
// ---------------------------------------------------------------------------
function mapClientToCloud(client) {
  return {
    id: client.id,
    owner_user_id: client.ownerUserId || AppState.session.onlineUserId,
    name: client.name || '',
    phone: client.phone || '',
    price_group_id: client.priceGroupId || '',
    payload: client
  };
}

function mapClientFromCloud(row) {
  const payload = row.payload || {};
  return Object.assign({}, payload, {
    id: row.id,
    name: row.name || '',
    phone: row.phone || '',
    priceGroupId: row.price_group_id || '',
    ownerUserId: row.owner_user_id,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    syncStatus: 'cloud'
  });
}

async function upsertCloudClient(client) {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('clients').upsert(mapClientToCloud(client), { onConflict: 'id' });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function deleteCloudClient(clientId) {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('clients').delete().eq('id', clientId);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function syncCloudClientsToLocal() {
  const sb = await requireClient();
  const { data, error } = await sb.from('clients').select('*').order('updated_at', { ascending: true });
  if (error) return { ok: false, message: messageFromError(error) };
  const rows = (data || []).map(mapClientFromCloud);
  await DB.clear('clients');
  if (rows.length) await DB.bulkPut('clients', rows, { silent: true });
  AppState.clients = rows;
  return { ok: true, count: rows.length };
}

function mapSaleFromCloud(row) {
  const payload = row.payload || {};
  return Object.assign({}, payload, {
    id: row.id,
    sellerId: row.seller_user_id,
    sellerName: row.seller_name || '',
    clientName: row.client_name || '',
    clientPhone: row.client_phone || '',
    type: row.sale_type || 'unit',
    total: Number(row.total || 0),
    sellerProfit: Number(row.seller_profit || 0),
    date: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    syncStatus: 'cloud'
  });
}

async function syncCloudSalesToLocal() {
  const sb = await requireClient();
  const { data, error } = await sb.from('sales').select('*').order('created_at', { ascending: true });
  if (error) return { ok: false, message: messageFromError(error) };
  const rows = (data || []).map(mapSaleFromCloud);
  await DB.clear('sales');
  if (rows.length) await DB.bulkPut('sales', rows, { silent: true });
  AppState.sales = rows;
  return { ok: true, count: rows.length };
}

async function findCloudSaleById(saleId) {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.from('sales').select('*').eq('id', String(saleId)).maybeSingle();
    if (error) return { ok: false, message: messageFromError(error) };
    return { ok: true, sale: data || null };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function insertCloudSale(sale) {
  try {
    const sb = await requireClient();
    const items = (sale.items || []).map(item => ({
      product_id: item.productId,
      qty: Number(item.qty || 0)
    }));
    const { data, error } = await sb.rpc('register_sale_atomic', {
      p_sale: sale,
      p_items: items
    });
    if (!error) return { ok: true, sale: data };

    // Una respuesta puede perderse después de que PostgreSQL confirmó la venta.
    // Antes de permitir un reintento se consulta el mismo ID, evitando duplicados.
    const uncertain = /failed to fetch|networkerror|load failed|fetch failed|timeout|duplicate key|already exists/i.test(String(error.message || error));
    if (uncertain && sale && sale.id && navigator.onLine) {
      await new Promise(resolve => setTimeout(resolve, 350));
      const check = await findCloudSaleById(sale.id);
      if (check.ok && check.sale) return { ok: true, sale: check.sale, recovered: true };
    }
    return { ok: false, message: messageFromError(error) };
  } catch (error) {
    if (sale && sale.id && navigator.onLine) {
      const check = await findCloudSaleById(sale.id);
      if (check.ok && check.sale) return { ok: true, sale: check.sale, recovered: true };
    }
    return { ok: false, message: messageFromError(error) };
  }
}

const CLOUD_GENERIC_STORES = [
  'priceGroups', 'quotes', 'settings', 'inventoryMovements',
  'commissions', 'commissionRules', 'representatives', 'dispatches',
  'representativeReports', 'expenses', 'receivablePayments'
];
const CLOUD_SHARED_STORES = new Set(['priceGroups', 'settings', 'commissionRules']);

function recordIdForStore(storeName, record) {
  return String(storeName === 'settings' ? (record.key || 'main') : (record.id || ''));
}

async function upsertGenericCloudRecord(storeName, record) {
  try {
    const sb = await requireClient();
    const ownerUserId = AppState.session && AppState.session.onlineUserId;
    const recordId = recordIdForStore(storeName, record);
    if (!ownerUserId || !recordId) return { ok: false, message: 'Registro sin usuario o identificador.' };
    const visibility = CLOUD_SHARED_STORES.has(storeName) && isAdmin() ? 'shared' : 'private';
    const scopedRecord = storeName === 'priceGroups'
      ? Object.assign({}, record, {
          scope: isAdmin() ? 'central' : 'representative_local',
          ownerUserId
        })
      : record;
    const { error } = await sb.from('app_records').upsert({
      store_name: storeName,
      record_id: recordId,
      owner_user_id: ownerUserId,
      visibility,
      payload: scopedRecord
    }, { onConflict: 'store_name,record_id,owner_user_id' });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function deleteGenericCloudRecord(storeName, recordId) {
  try {
    const sb = await requireClient();
    const ownerUserId = AppState.session && AppState.session.onlineUserId;
    const { error } = await sb.from('app_records').delete()
      .eq('store_name', storeName)
      .eq('record_id', String(recordId))
      .eq('owner_user_id', ownerUserId);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function syncGenericCloudRecordsToLocal() {
  const sb = await requireClient();
  const { data, error } = await sb.from('app_records').select('*')
    .in('store_name', CLOUD_GENERIC_STORES)
    .order('updated_at', { ascending: true });
  if (error) return { ok: false, message: messageFromError(error) };
  const grouped = new Map(CLOUD_GENERIC_STORES.map(name => [name, []]));
  const currentUserId = AppState.session && AppState.session.onlineUserId;
  const centralGroups = [];
  const ownRepresentativeGroups = [];
  (data || []).forEach(row => {
    if (!grouped.has(row.store_name) || !row.payload) return;
    const payload = Object.assign({}, row.payload, {
      _cloudOwnerUserId: row.owner_user_id,
      _cloudVisibility: row.visibility
    });
    if (row.store_name === 'priceGroups') {
      const isCentral = row.visibility === 'shared' || payload.scope === 'central';
      if (isCentral) centralGroups.push(payload);
      if (row.owner_user_id === currentUserId && !isCentral) ownRepresentativeGroups.push(payload);
      return;
    }
    grouped.get(row.store_name).push(payload);
  });
  grouped.set('priceGroups', isAdmin() ? centralGroups : ownRepresentativeGroups);
  AppState.centralPriceGroups = centralGroups;
  for (const [name, rows] of grouped) {
    await DB.clear(name);
    if (rows.length) await DB.bulkPut(name, rows, { silent: true });
  }
  return { ok: true, count: (data || []).length, centralPriceGroups: centralGroups.length, ownPriceGroups: ownRepresentativeGroups.length };
}

// ---------------------------------------------------------------------------
// PEDIDOS Y MENSAJES
// ---------------------------------------------------------------------------
function mapPurchaseOrderToCloud(order) {
  return {
    id: order.id,
    representative_user_id: AppState.session.onlineUserId,
    representative_name: order.representativeName || AppState.session.fullName || '',
    status: order.status || 'pending',
    total: Number(order.total || 0),
    note: order.note || '',
    supplier_user_id: order.supplierUserId || AppState.session.supplierUserId || null,
    supplier_name: order.supplierName || (window.profileNameV800 ? profileNameV800(order.supplierUserId || AppState.session.supplierUserId) : '') || 'Stock central Natura Vida',
    region_name: order.regionName || AppState.session.regionName || AppState.session.city || '',
    regional_manager_user_id: order.regionalManagerUserId || AppState.session.managerUserId || null,
    payload: Object.assign({}, order, {
      supplierUserId: order.supplierUserId || AppState.session.supplierUserId || null,
      regionName: order.regionName || AppState.session.regionName || AppState.session.city || '',
      regionalManagerUserId: order.regionalManagerUserId || AppState.session.managerUserId || null
    })
  };
}

async function insertCloudPurchaseOrder(order) {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('purchase_orders').upsert(mapPurchaseOrderToCloud(order), { onConflict: 'id' });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function fetchCloudPurchaseOrders() {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return { ok: false, message: messageFromError(error) };
    const orders = (data || []).map(row => Object.assign({}, row.payload || {}, {
      id: row.id,
      representativeId: row.representative_user_id,
      representativeName: row.representative_name,
      status: row.status,
      total: Number(row.total || 0),
      note: row.note || '',
      supplierUserId: row.supplier_user_id || (row.payload || {}).supplierUserId || null,
      supplierName: row.supplier_name || (row.payload || {}).supplierName || 'Stock central Natura Vida',
      regionName: row.region_name || (row.payload || {}).regionName || '',
      regionalManagerUserId: row.regional_manager_user_id || (row.payload || {}).regionalManagerUserId || null,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      syncStatus: 'cloud'
    }));
    return { ok: true, orders };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function updateCloudPurchaseOrderStatus(orderId, status) {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.rpc('admin_set_order_status', {
      p_order_id: orderId,
      p_status: status
    });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, order: data };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

function mapMessageToCloud(message) {
  const m = window.normalizeMessage ? normalizeMessage(message) : message;
  return {
    id: m.id,
    type: m.type || 'general',
    title: m.title || 'Mensaje',
    body: m.body || '',
    sender_user_id: AppState.session.onlineUserId,
    sender_name: m.senderName || AppState.session.fullName || '',
    sender_role: m.senderRole || AppState.session.roleName || '',
    recipient_role: m.recipientRole || 'Administrador',
    recipient_user_id: m.recipientUserId || null,
    status: m.status || 'unread',
    payload: m.payload || {}
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
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

async function insertCloudMessage(message) {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('messages').upsert(mapMessageToCloud(message), { onConflict: 'id' });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function fetchCloudInboxMessages() {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(100);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, messages: (data || []).map(mapMessageFromCloud) };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function markCloudMessageRead(messageId) {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('messages').update({ status: 'read' }).eq('id', messageId);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}



async function fetchRepresentativeStockForAdminV725(userId) {
  try {
    const sb = await requireClient();
    const { data: stockRows, error } = await sb.from('representative_stock')
      .select('product_id,stock,acquisition_cost,updated_at')
      .eq('representative_user_id', userId);
    if (error) return { ok: false, message: messageFromError(error) };
    const productIds = (stockRows || []).map(r => r.product_id).filter(Boolean);
    let productMap = new Map();
    if (productIds.length) {
      const { data: products } = await sb.from('products').select('id,name,category,reseller_price,public_price,market_price,photo_url').in('id', productIds);
      productMap = new Map((products || []).map(p => [p.id, p]));
    }
    const rows = (stockRows || []).map(r => {
      const p = productMap.get(r.product_id) || {};
      return { productId: r.product_id, productName: p.name || r.product_id, category: p.category || 'General', stock: Number(r.stock || 0), acquisitionCost: Number(r.acquisition_cost || p.reseller_price || 0), updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(), photo: p.photo_url || '' };
    });
    return { ok: true, rows };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function fetchRepresentativeOrdersForAdminV725(userId) {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.from('purchase_orders').select('*').eq('representative_user_id', userId).order('created_at', { ascending: false }).limit(50);
    if (error) return { ok: false, message: messageFromError(error) };
    return { ok: true, orders: (data || []).map(row => Object.assign({}, row.payload || {}, { id: row.id, status: row.status, total: Number(row.total || 0), createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now() })) };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

// ---------------------------------------------------------------------------
// ESCRITURA ÚNICA PARA EL ADAPTADOR DE MEMORIA
// ---------------------------------------------------------------------------
async function cloudAfterPut(storeName, record) {
  if (!navigator.onLine) throw new Error('Sin internet. El registro no fue guardado.');
  if (!AppState.session || AppState.session.pendingApproval || !canOperate()) throw new Error('La cuenta no está habilitada para operar.');
  let result;
  if (storeName === 'products') result = await upsertCloudProduct(record);
  else if (storeName === 'clients') result = await upsertCloudClient(record);
  else if (storeName === 'sales') result = await insertCloudSale(record);
  else if (storeName === 'purchaseOrders') result = await insertCloudPurchaseOrder(record);
  else if (storeName === 'messages') result = await insertCloudMessage(record);
  else if (CLOUD_GENERIC_STORES.includes(storeName)) result = await upsertGenericCloudRecord(storeName, record);
  else result = { ok: true, skipped: true };
  if (!result || result.ok === false) throw new Error((result && result.message) || 'Supabase rechazó el registro.');
  setCloudConnectionState('online', `Guardado en Supabase: ${storeName}`);
  return result;
}

async function cloudAfterDelete(storeName, id) {
  if (!navigator.onLine) throw new Error('Sin internet. No se eliminó el registro.');
  if (!AppState.session || AppState.session.pendingApproval || !canOperate()) throw new Error('La cuenta no está habilitada para operar.');
  let result;
  if (storeName === 'products') result = await deleteCloudProduct(id);
  else if (storeName === 'clients') result = await deleteCloudClient(id);
  else if (CLOUD_GENERIC_STORES.includes(storeName)) result = await deleteGenericCloudRecord(storeName, id);
  else result = { ok: true, skipped: true };
  if (!result || result.ok === false) throw new Error((result && result.message) || 'Supabase rechazó la eliminación.');
  setCloudConnectionState('online', `Eliminado en Supabase: ${storeName}`);
  return result;
}

// ---------------------------------------------------------------------------
// CARGA INICIAL + REALTIME
// ---------------------------------------------------------------------------
async function runBackgroundSyncOnce(reason = 'automatic') {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    if (!navigator.onLine) return { ok: false, message: 'Sin internet.' };
    if (!requireAuth()) return { ok: false, message: 'No hay sesión activa.' };
    if (AppState.session.pendingApproval) return { ok: true, restricted: true };
    setCloudConnectionState('connecting', reason);
    const tasks = [
      syncCloudProductsToLocal(),
      syncCloudClientsToLocal(),
      syncCloudSalesToLocal(),
      syncGenericCloudRecordsToLocal(),
      window.fetchAndCachePurchaseOrders ? fetchAndCachePurchaseOrders() : Promise.resolve({ ok: true }),
      window.syncInboxFromCloud ? syncInboxFromCloud() : Promise.resolve({ ok: true }),
      window.syncProductionCloudToLocalV740 ? syncProductionCloudToLocalV740() : Promise.resolve({ ok: true })
    ];
    const results = await Promise.all(tasks.map(p => Promise.resolve(p).catch(error => ({ ok: false, message: messageFromError(error) }))));
    await loadAllState();
    renderAfterCloudRefresh();
    if (window.refreshInboxBadge) refreshInboxBadge({ silent: true }).catch(() => {});
    const failed = results.filter(result => result && result.ok === false);
    if (failed.length) {
      const detail = failed.map(item => item.message).filter(Boolean).join(' | ');
      setCloudConnectionState('error', detail);
      return { ok: false, message: detail, results };
    }
    setCloudConnectionState('online', 'Datos actualizados desde Supabase');
    return { ok: true, results };
  })();
  try { return await _refreshInFlight; }
  finally { _refreshInFlight = null; }
}

async function refreshAfterEvent(table, payload = null) {
  try {
    if (table === 'products' || table === 'representative_product_preferences') await syncCloudProductsToLocal();
    else if (table === 'representative_stock') {
      await syncCloudProductsToLocal();
      if (window.handleRegionalRealtimeV771) handleRegionalRealtimeV771(table, payload);
      if (AppState.currentTab === 'usuarios' && window.hydrateRepresentativeCardsV730) {
        hydrateRepresentativeCardsV730(AppState.allProfiles || []);
      }
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (table === 'clients') await syncCloudClientsToLocal();
    else if (table === 'sales') {
      await syncCloudSalesToLocal();
      await loadAllState();
      if (AppState.currentTab === 'usuarios' && window.hydrateRepresentativeCardsV730) {
        hydrateRepresentativeCardsV730(AppState.allProfiles || []);
        setCloudConnectionState('online', `Realtime: ${table}`);
        return;
      }
    }
    else if (table === 'purchase_orders' && window.fetchAndCachePurchaseOrders) await fetchAndCachePurchaseOrders();
    else if (table === 'messages' && window.syncInboxFromCloud) await syncInboxFromCloud();
    else if (table === 'app_records') await syncGenericCloudRecordsToLocal();
    else if (['raw_materials','raw_material_movements','production_orders','production_batches'].includes(table) && window.syncProductionCloudToLocalV740) await syncProductionCloudToLocalV740();
    else if (['delivery_routes','route_stops','deliveries','geo_events','delivery_requests'].includes(table)) {
      if (window.handleDistributionRealtimeV770) handleDistributionRealtimeV770(table, payload);
      else if (window.refreshDistributionV760) await refreshDistributionV760();
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (['representative_regional_profiles','regional_restock_requests'].includes(table)) {
      if (window.handleRegionalRealtimeV771) handleRegionalRealtimeV771(table, payload);
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (['staff_members','staff_tasks','staff_attendance','labor_costs','staff_payments'].includes(table)) {
      if (window.handleWorkforceRealtimeV770) handleWorkforceRealtimeV770(table, payload);
      else if (window.refreshWorkforceV770) await refreshWorkforceV770();
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (['territory_prospects','territory_visits','territory_events'].includes(table)) {
      if (window.handleTerritoryRealtimeV800) handleTerritoryRealtimeV800(table, payload);
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (table === 'business_roles') {
      if (window.fetchRoleCatalogV800) await fetchRoleCatalogV800().catch(() => {});
      if (AppState.currentTab === 'roles-estructura' && window.renderRolesStructureV800) renderRolesStructureV800();
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if ((table === 'commercial_profiles' || table === 'profile_change_requests') && window.syncV7Context) await syncV7Context();
    await loadAllState();
    renderAfterCloudRefresh();
    if (window.refreshInboxBadge) refreshInboxBadge({ silent: true }).catch(() => {});
    setCloudConnectionState('online', `Realtime: ${table}`);
  } catch (error) {
    console.warn(`Realtime ${table}:`, error);
    setCloudConnectionState('error', messageFromError(error));
  }
}

function scheduleRealtimeRestart(detail = 'Reconectando Realtime') {
  clearTimeout(_realtimeRestartTimer);
  if (!navigator.onLine || !requireAuth()) return;
  setCloudConnectionState('connecting', detail);
  _realtimeRestartTimer = setTimeout(() => {
    startRealtimeSubscriptions();
    if (!AppState.session.pendingApproval) runBackgroundSyncOnce('reconexión').catch(() => {});
  }, 2500);
}

function stopRealtimeSubscriptions() {
  clearTimeout(_realtimeRestartTimer);
  const sb = getSupabaseClient();
  if (sb && _realtimeChannel) sb.removeChannel(_realtimeChannel).catch(() => {});
  _realtimeChannel = null;
}

function startRealtimeSubscriptions() {
  const sb = getSupabaseClient();
  if (!sb || !requireAuth()) return;
  stopRealtimeSubscriptions();
  setCloudConnectionState('connecting', 'Abriendo Realtime');

  let channel = sb.channel(`nv7-main-${AppState.session.onlineUserId}`);
  ['products', 'representative_stock', 'representative_product_preferences', 'clients', 'sales', 'purchase_orders', 'messages', 'app_records', 'commercial_profiles', 'profile_change_requests', 'raw_materials', 'raw_material_movements', 'production_orders', 'production_batches', 'delivery_routes', 'route_stops', 'deliveries', 'geo_events', 'delivery_requests', 'representative_regional_profiles', 'regional_restock_requests', 'staff_members', 'staff_tasks', 'staff_attendance', 'labor_costs', 'staff_payments', 'business_roles', 'territory_prospects', 'territory_visits', 'territory_events'].forEach(table => {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => refreshAfterEvent(table, payload));
  });
  channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async payload => {
    try {
      const row = payload.new || payload.old || {};
      if (row.id === AppState.session.onlineUserId && payload.new) {
        const wasPending = AppState.session.pendingApproval;
        const current = await getOnlineSessionProfile();
        if (current && current.user && current.profile) {
          applyOnlineSession(current.user, current.profile);
          if (wasPending && !AppState.session.pendingApproval && window.afterLoginSuccess) {
            showToast('Tu cuenta fue aprobada. Acceso habilitado.');
            await afterLoginSuccess({ ok: true, user: current.user });
            return;
          }
          if (AppState.session.statusCanonical === 'bloqueado') {
            showToast('La cuenta fue bloqueada por el administrador.', 'error');
            await logoutSession();
            return;
          }
        }
      }
      if (window.syncV7Context) await syncV7Context().catch(() => {});
      if (window.renderTopHeader) renderTopHeader();
      if (isAdmin() && AppState.currentTab === 'usuarios' && window.hydrateRepresentativeCardsV730) {
        hydrateRepresentativeCardsV730(AppState.allProfiles || []);
      } else if (AppState.currentTab === 'perfil' && !shouldDeferCloudRender() && window.renderProfileV7) {
        renderProfileV7();
      }
    } catch (error) { console.warn('Realtime profiles:', error); }
  });

  _realtimeChannel = channel.subscribe((status, error) => {
    if (status === 'SUBSCRIBED') setCloudConnectionState('online', 'Realtime conectado');
    else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
      setCloudConnectionState('error', messageFromError(error || status));
      scheduleRealtimeRestart(status);
    }
  });
}

function startBackgroundSync() {
  if (_backgroundStarted) return;
  _backgroundStarted = true;
  startRealtimeSubscriptions();
  window.addEventListener('online', () => {
    setCloudConnectionState('connecting', 'Internet recuperado');
    startRealtimeSubscriptions();
    if (requireAuth() && !AppState.session.pendingApproval) runBackgroundSyncOnce('internet recuperado').catch(() => {});
  });
  window.addEventListener('offline', () => setCloudConnectionState('offline', 'Sin internet'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine && requireAuth()) {
      startRealtimeSubscriptions();
      if (!AppState.session.pendingApproval) runBackgroundSyncOnce('aplicación visible').catch(() => {});
    }
  });
}

async function syncAfterLogin() {
  startBackgroundSync();
  startRealtimeSubscriptions();
  if (AppState.session && AppState.session.pendingApproval) return { ok: true, mode: 'restricted-realtime' };
  return runBackgroundSyncOnce('inicio de sesión');
}

async function runFullAdminSync() {
  return runBackgroundSyncOnce('lectura automática');
}

async function flushPendingSyncQueue() {
  return { ok: true, sent: 0, failed: 0, pending: 0, mode: 'disabled' };
}

async function testOnlineConnection() {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('app_config').select('key').limit(1);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, message: 'Supabase responde correctamente.' };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

// Compatibilidad deliberada: las funciones antiguas ya no hacen respaldo,
// publicación masiva ni mezcla con datos locales.
async function createPreSyncLocalSnapshot() { return null; }
async function openSafeCloudSyncSheet() { showToast('La actualización es automática mediante Realtime.'); }

Object.assign(window, {
  CloudConnection,
  shouldDeferCloudRender,
  renderAfterCloudRefresh,
  flushDeferredCloudRender,
  effectiveOnlineConfig,
  getSavedOnlineConfig,
  getOnlineConfigValue,
  saveOnlineConfig,
  isOnlineConfigured,
  getSupabaseClient,
  setCloudConnectionState,
  onlineSignIn,
  onlineSignOut,
  getOnlineSessionProfile,
  upsertCloudProfileForUser,
  signUpEmailAccount,
  sendPasswordRecoveryEmail,
  waitForPasswordRecoverySession,
  updateCurrentUserPassword,
  touchLastLogin,
  setProfileStatus,
  fetchAllProfilesForAdmin,
  fetchCloudProfiles,
  updateCloudProfileStatus,
  uploadProductPhotoIfNeeded,
  syncCloudProductsToLocal,
  pushLocalProductsToCloud,
  adjustRepresentativeStockRemote,
  queueRepresentativeStockDelta,
  updateRepresentativeInventoryRemote,
  fetchRepresentativeStockForAdminV725,
  fetchRepresentativeOrdersForAdminV725,
  fetchRepresentativeStockMap,
  upsertCloudClient,
  deleteCloudClient,
  syncCloudClientsToLocal,
  syncCloudSalesToLocal,
  syncGenericCloudRecordsToLocal,
  insertCloudMessage,
  fetchCloudInboxMessages,
  markCloudMessageRead,
  insertCloudPurchaseOrder,
  fetchCloudPurchaseOrders,
  updateCloudPurchaseOrderStatus,
  cloudAfterPut,
  cloudAfterDelete,
  runBackgroundSyncOnce,
  startRealtimeSubscriptions,
  stopRealtimeSubscriptions,
  startBackgroundSync,
  syncAfterLogin,
  runFullAdminSync,
  flushPendingSyncQueue,
  testOnlineConnection,
  createPreSyncLocalSnapshot,
  openSafeCloudSyncSheet
});
