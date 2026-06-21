/* supabase-sync.js — Sincronización online para NATURA VIDA usando Supabase.
   Mantiene IndexedDB offline y agrega servidor gratuito para usuarios, productos y ventas. */

let _supabaseClient = null;
let _lastCloudSync = null;

function isOnlineConfigured() {
  const cfg = window.NATURA_ONLINE_CONFIG || {};
  return !!(cfg.enabled && cfg.supabaseUrl && cfg.supabaseAnonKey && !String(cfg.supabaseUrl).includes('PEGAR_AQUI'));
}

function getSupabaseClient() {
  if (!isOnlineConfigured()) return null;
  if (_supabaseClient) return _supabaseClient;
  if (!window.supabase || !window.supabase.createClient) {
    console.warn('Supabase JS no está cargado. Revisa el CDN en index.html.');
    return null;
  }
  const cfg = window.NATURA_ONLINE_CONFIG;
  _supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });
  return _supabaseClient;
}

function mapProductToCloud(product) {
  const p = window.normalizeLegacyProduct ? normalizeLegacyProduct(product) : product;
  return {
    id: p.id,
    name: p.name,
    category: p.category || 'General',
    sku: p.sku || '',
    description: p.description || '',
    cost: Number(p.cost || 0),
    reseller_price: Number(p.resellerPrice ?? p.wholesalePriceFixed ?? 0),
    public_price: Number(p.publicPrice ?? p.unitPriceFixed ?? 0),
    stock: Number(p.stock || 0),
    photo: p.photo || null,
    status: p.status || 'active',
    payload: p,
    updated_at: new Date().toISOString()
  };
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
    resellerPrice: Number(row.reseller_price || 0),
    publicPrice: Number(row.public_price || 0),
    wholesalePriceFixed: Number(row.reseller_price || 0),
    unitPriceFixed: Number(row.public_price || 0),
    stock: Number(row.stock || 0),
    photo: row.photo || null,
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

async function syncCloudProductsToLocal() {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  const { data, error } = await sb.from('products').select('*').neq('status', 'archived').order('name', { ascending: true });
  if (error) return { ok: false, message: error.message };
  const products = (data || []).map(mapProductFromCloud);
  await DB.bulkPut('products', products, { silent: true });
  AppState.products = products;
  _lastCloudSync = Date.now();
  return { ok: true, count: products.length };
}

async function pushLocalProductsToCloud() {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, message: 'Servidor online no configurado.' };
  if (!AppState.session || AppState.session.roleName !== 'Administrador') {
    return { ok: false, message: 'Solo el administrador puede publicar productos.' };
  }
  const rows = AppState.products.filter(p => p.status !== 'archived').map(mapProductToCloud);
  if (rows.length === 0) return { ok: true, count: 0 };
  const { error } = await sb.from('products').upsert(rows, { onConflict: 'id' });
  if (error) return { ok: false, message: error.message };
  return { ok: true, count: rows.length };
}

async function upsertCloudProduct(product) {
  const sb = getSupabaseClient();
  if (!sb || !AppState.session || AppState.session.roleName !== 'Administrador') return;
  const { error } = await sb.from('products').upsert(mapProductToCloud(product), { onConflict: 'id' });
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

async function syncAfterLogin() {
  if (!isOnlineConfigured()) return { ok: true, mode: 'local' };
  const result = await syncCloudProductsToLocal();
  return result;
}

async function cloudAfterPut(storeName, record) {
  try {
    if (!isOnlineConfigured()) return;
    if (storeName === 'products') await upsertCloudProduct(record);
    if (storeName === 'sales') await insertCloudSale(record);
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

window.isOnlineConfigured = isOnlineConfigured;
window.getSupabaseClient = getSupabaseClient;
window.onlineSignIn = onlineSignIn;
window.onlineSignOut = onlineSignOut;
window.getOnlineSessionProfile = getOnlineSessionProfile;
window.syncCloudProductsToLocal = syncCloudProductsToLocal;
window.pushLocalProductsToCloud = pushLocalProductsToCloud;
window.syncAfterLogin = syncAfterLogin;
window.cloudAfterPut = cloudAfterPut;
window.cloudAfterDelete = cloudAfterDelete;
