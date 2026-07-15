/* db.js — NATURA VIDA V7
   Almacenamiento TRANSITORIO en memoria.
   Supabase es la única fuente persistente de datos.
   No se usa IndexedDB, no hay cola offline y no se guardan inventarios,
   ventas, clientes ni pedidos en el teléfono. */

const DB_VERSION = 9;
const STORES = [
  'products','priceGroups','sales','clients','quotes','settings','users','roles',
  'permissions','inventoryMovements','commissionRules','commissions','reportsCache',
  'auditLog','representatives','dispatches','representativeReports',
  'importedPackages','purchaseOrders','messages','expenses','receivablePayments',
  'rawMaterials','rawMaterialMovements','productionOrders','productionBatches','syncMeta'
];

const INDEX_FIELDS = {
  products: { byName: 'name', byCategory: 'category', byStock: 'stock', byUpdatedAt: 'updatedAt', bySyncStatus: 'syncStatus' },
  priceGroups: { byName: 'name' },
  sales: { byDate: 'date', byClient: 'clientId', bySeller: 'sellerId', bySyncStatus: 'syncStatus' },
  clients: { byName: 'name', byPhone: 'phone', bySyncStatus: 'syncStatus' },
  quotes: { byExpiry: 'expiryDate', byClient: 'clientId', bySyncStatus: 'syncStatus' },
  users: { byUsername: 'username', byRole: 'role', byStatus: 'status' },
  inventoryMovements: { byProduct: 'productId', byDate: 'date', byType: 'type', bySyncStatus: 'syncStatus' },
  commissionRules: { byRole: 'role', byActive: 'active' },
  commissions: { bySeller: 'sellerId', bySale: 'saleId', byDate: 'date', byStatus: 'status' },
  reportsCache: { byType: 'type', byPeriod: 'period', byGeneratedAt: 'generatedAt' },
  auditLog: { byUser: 'userId', byAction: 'action', byCreatedAt: 'createdAt' },
  representatives: { byName: 'name', byStatus: 'status', byRegion: 'region' },
  dispatches: { byRepresentative: 'representativeId', byDate: 'date', byStatus: 'status' },
  representativeReports: { byRepresentative: 'representativeId', byImportedAt: 'importedAt' },
  importedPackages: { byPackageType: 'packageType', byImportedAt: 'importedAt' },
  purchaseOrders: { byRepresentative: 'representativeId', byCreatedAt: 'createdAt', byStatus: 'status', bySyncStatus: 'syncStatus' },
  messages: { byCreatedAt: 'createdAt', byStatus: 'status', byRecipientRole: 'recipientRole', byRecipientUser: 'recipientUserId', bySenderUser: 'senderUserId', byType: 'type' },
  expenses: { byDate: 'date', byCategory: 'category', byCreatedAt: 'createdAt' },
  receivablePayments: { bySale: 'saleId', byClient: 'clientId', byDate: 'date' },
  rawMaterials: { byName: 'name', byCategory: 'category', byStock: 'stock', byUpdatedAt: 'updatedAt' },
  rawMaterialMovements: { byMaterial: 'materialId', byType: 'movementType', byCreatedAt: 'createdAt' },
  productionOrders: { byProduct: 'productId', byStatus: 'status', byCreatedAt: 'createdAt' },
  productionBatches: { byProduct: 'productId', byOrder: 'orderId', byCreatedAt: 'createdAt' },
  syncMeta: { byUpdatedAt: 'updatedAt' }
};

const PERSISTED_CLOUD_STORES = new Set([
  'products','priceGroups','sales','clients','quotes','settings','inventoryMovements',
  'commissionRules','commissions','representatives','dispatches','representativeReports',
  'importedPackages','purchaseOrders','messages','expenses','receivablePayments'
]);

const _memory = new Map(STORES.map(name => [name, new Map()]));
let _legacyCleanupStarted = false;

function cloneValue(value) {
  if (value === undefined) return undefined;
  try { return structuredClone(value); }
  catch (_) { return JSON.parse(JSON.stringify(value)); }
}

function uid(prefix = 'id') {
  if (crypto && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLegacyProduct(product) {
  if (!product || typeof product !== 'object') return product;
  const insumoCost = Array.isArray(product.insumos)
    ? product.insumos.reduce((sum, i) => sum + ((Number(i.qtyUsed) || 0) * (Number(i.unitCost) || 0)), 0)
    : 0;
  const rawCost = insumoCost > 0 ? insumoCost : Number(product.cost ?? product.baseCost ?? 0);
  const cost = Math.round((rawCost || 0) * 100) / 100;
  const resellerPrice = Math.round((Number(product.resellerPrice ?? product.representativePrice ?? product.wholesalePriceFixed ?? 0) || 0) * 100) / 100;
  const marketPrice = Math.round((Number(product.marketPrice ?? product.wholesaleMarketPrice ?? product.marketPriceFixed ?? product.mayoristaPrice ?? product.wholesalePriceFixed ?? resellerPrice) || 0) * 100) / 100;
  const publicPrice = Math.round((Number(product.publicPrice ?? product.unitPriceFixed ?? 0) || 0) * 100) / 100;
  const now = Date.now();
  return Object.assign({}, product, {
    category: product.category || 'General',
    sku: product.sku || '',
    cost,
    marketPrice,
    wholesaleMarketPrice: marketPrice,
    marketPriceFixed: marketPrice,
    resellerPrice,
    representativePrice: resellerPrice,
    publicPrice,
    wholesalePriceFixed: resellerPrice,
    unitPriceFixed: publicPrice,
    stock: Math.max(0, Number(product.stock) || 0),
    description: product.description || '',
    photo: product.photo || null,
    status: product.status || 'active',
    syncStatus: 'cloud',
    createdAt: product.createdAt || now,
    updatedAt: product.updatedAt || now
  });
}

function stripLargeBinaryFields(value) {
  if (!value || typeof value !== 'object') return value;
  const cloned = cloneValue(value);
  if (typeof cloned.photo === 'string' && cloned.photo.startsWith('data:image/')) cloned.photo = null;
  if (typeof cloned.logo === 'string' && cloned.logo.startsWith('data:image/')) cloned.logo = null;
  if (cloned.payload && typeof cloned.payload === 'object') cloned.payload = stripLargeBinaryFields(cloned.payload);
  return cloned;
}

function keyFor(storeName, value) {
  if (storeName === 'settings') return String(value.key || 'main');
  return String(value.id || value.recordId || value.movementId || '');
}

function memoryStore(storeName) {
  if (!_memory.has(storeName)) _memory.set(storeName, new Map());
  return _memory.get(storeName);
}

function deleteLegacyIndexedDB() {
  return new Promise(resolve => {
    if (!('indexedDB' in window)) return resolve();
    try {
      const req = indexedDB.deleteDatabase('natura_vida_db');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch (_) { resolve(); }
  });
}

async function purgeLegacyLocalData() {
  if (_legacyCleanupStarted) return true;
  _legacyCleanupStarted = true;

  await deleteLegacyIndexedDB();

  // Elimina únicamente configuraciones y rastros propios de versiones viejas.
  // No toca la sesión de Supabase (clave sb-...-auth-token).
  try {
    const removable = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (
        key === 'natura_vida_online_config' ||
        key === 'nv_last_uid' ||
        key.startsWith('nv_sync_') ||
        key.startsWith('natura_vida_legacy_')
      ) removable.push(key);
    }
    removable.forEach(key => localStorage.removeItem(key));
  } catch (_) {}

  try {
    const names = await caches.keys();
    await Promise.all(names.filter(n => /natura[-_ ]?vida/i.test(n)).map(n => caches.delete(n)));
  } catch (_) {}
  return true;
}

async function openDB() {
  await purgeLegacyLocalData();
  return { mode: 'memory-only', version: DB_VERSION };
}

async function requireCloudWrite(storeName) {
  if (!PERSISTED_CLOUD_STORES.has(storeName)) return;
  if (!navigator.onLine) throw new Error('Sin internet. Este registro no se guardó. Natura Vida trabaja directamente con Supabase.');
  if (!window.isOnlineConfigured || !isOnlineConfigured()) throw new Error('Supabase no está configurado.');
  if (!window.requireAuth || !requireAuth()) throw new Error('La sesión no está activa. Vuelve a iniciar sesión.');
  if (window.canOperate && !canOperate()) throw new Error('La cuenta todavía no está habilitada para operar.');
}

const DB = {
  async getAll(storeName) {
    return Array.from(memoryStore(storeName).values()).map(cloneValue);
  },

  async get(storeName, id) {
    const value = memoryStore(storeName).get(String(id));
    return value === undefined ? null : cloneValue(value);
  },

  async getByIndex(storeName, indexName, value) {
    const field = INDEX_FIELDS[storeName] && INDEX_FIELDS[storeName][indexName];
    if (!field) return [];
    return (await this.getAll(storeName)).filter(row => row && row[field] === value);
  },

  async put(storeName, value, options = {}) {
    const prepared = storeName === 'products' ? normalizeLegacyProduct(value) : cloneValue(value);
    const id = keyFor(storeName, prepared);
    if (!id) throw new Error(`Registro sin identificador para ${storeName}.`);

    if (!options.silent && PERSISTED_CLOUD_STORES.has(storeName)) {
      await requireCloudWrite(storeName);
      if (!window.cloudAfterPut) throw new Error('El módulo de Supabase no está disponible.');
      await cloudAfterPut(storeName, prepared);
    }

    memoryStore(storeName).set(id, cloneValue(prepared));
    return cloneValue(prepared);
  },

  async bulkPut(storeName, values, options = {}) {
    const rows = values || [];
    if (!options.silent) {
      for (const value of rows) await this.put(storeName, value, options);
      return rows;
    }
    for (const value of rows) {
      const prepared = storeName === 'products' ? normalizeLegacyProduct(value) : cloneValue(value);
      const id = keyFor(storeName, prepared);
      if (id) memoryStore(storeName).set(id, cloneValue(prepared));
    }
    return rows;
  },

  async delete(storeName, id, options = {}) {
    if (!options.silent && PERSISTED_CLOUD_STORES.has(storeName)) {
      await requireCloudWrite(storeName);
      if (!window.cloudAfterDelete) throw new Error('El módulo de Supabase no está disponible.');
      await cloudAfterDelete(storeName, String(id));
    }
    memoryStore(storeName).delete(String(id));
    return true;
  },

  async clear(storeName) {
    memoryStore(storeName).clear();
    return true;
  },

  async exportAll() {
    throw new Error('Los respaldos locales están desactivados. La fuente oficial es Supabase.');
  },

  async exportCompact() {
    throw new Error('Los respaldos locales están desactivados. La fuente oficial es Supabase.');
  },

  async importAll() {
    throw new Error('La importación local está desactivada para evitar duplicados.');
  }
};

async function queueSync() {
  // Compatibilidad con módulos antiguos: no se crea ninguna cola local.
  return { ok: true, skipped: true, mode: 'supabase-only' };
}

async function writeAudit(action, entity, entityId, beforeValue, afterValue) {
  const item = {
    id: uid('audit'), action, entity, entityId,
    beforeValue: beforeValue || null,
    afterValue: afterValue || null,
    userId: window.AppState && AppState.session ? (AppState.session.onlineUserId || AppState.session.userId || 'unknown') : 'unknown',
    createdAt: Date.now()
  };
  memoryStore('auditLog').set(item.id, cloneValue(item));
  if (window.isOnlineConfigured && isOnlineConfigured() && window.getSupabaseClient && requireAuth()) {
    const sb = getSupabaseClient();
    const { error } = await sb.rpc('log_audit_event', {
      p_action: String(action),
      p_table_name: String(entity),
      p_record_id: String(entityId || ''),
      p_details: afterValue || {}
    });
    if (error) console.warn('No se pudo registrar auditoría:', error.message);
  }
  return item;
}

async function exportCompactData() {
  throw new Error('Exportación local desactivada.');
}

async function ensureBootstrapData() {
  await openDB();
  return true;
}

window.DB = DB;
window.DB_VERSION = DB_VERSION;
window.DB_SCHEMA = {};
window.STORES = STORES;
window.uid = uid;
window.openDB = openDB;
window.ensureBootstrapData = ensureBootstrapData;
window.normalizeLegacyProduct = normalizeLegacyProduct;
window.stripLargeBinaryFields = stripLargeBinaryFields;
window.exportCompactData = exportCompactData;
window.queueSync = queueSync;
window.writeAudit = writeAudit;
window.purgeLegacyLocalData = purgeLegacyLocalData;
