/* db.js — Capa profesional de almacenamiento local IndexedDB para NATURA VIDA.
   Mantiene funcionamiento offline, amplía el modelo comercial y prepara sincronización futura. */

const DB_NAME = 'natura_vida_db';
const DB_VERSION = 4;
const STORES = [
  'products',
  'priceGroups',
  'sales',
  'clients',
  'quotes',
  'settings',
  'users',
  'roles',
  'permissions',
  'inventoryMovements',
  'commissionRules',
  'commissions',
  'reportsCache',
  'syncQueue',
  'auditLog',
  'representatives',
  'dispatches',
  'representativeReports',
  'importedPackages'
];

const DB_SCHEMA = {
  products: {
    keyPath: 'id',
    indexes: [
      ['byName', 'name'],
      ['byCategory', 'category'],
      ['byStock', 'stock'],
      ['byUpdatedAt', 'updatedAt'],
      ['bySyncStatus', 'syncStatus']
    ]
  },
  priceGroups: { keyPath: 'id', indexes: [['byName', 'name']] },
  sales: { keyPath: 'id', indexes: [['byDate', 'date'], ['byClient', 'clientId'], ['bySeller', 'sellerId'], ['bySyncStatus', 'syncStatus']] },
  clients: { keyPath: 'id', indexes: [['byName', 'name'], ['byPhone', 'phone'], ['bySyncStatus', 'syncStatus']] },
  quotes: { keyPath: 'id', indexes: [['byExpiry', 'expiryDate'], ['byClient', 'clientId'], ['bySyncStatus', 'syncStatus']] },
  settings: { keyPath: 'key', indexes: [] },
  users: { keyPath: 'id', indexes: [['byUsername', 'username', { unique: true }], ['byRole', 'role'], ['byStatus', 'status']] },
  roles: { keyPath: 'id', indexes: [['byName', 'name', { unique: true }]] },
  permissions: { keyPath: 'id', indexes: [['byRole', 'roleId']] },
  inventoryMovements: { keyPath: 'id', indexes: [['byProduct', 'productId'], ['byDate', 'date'], ['byType', 'type'], ['bySyncStatus', 'syncStatus']] },
  commissionRules: { keyPath: 'id', indexes: [['byRole', 'role'], ['byActive', 'active']] },
  commissions: { keyPath: 'id', indexes: [['bySeller', 'sellerId'], ['bySale', 'saleId'], ['byDate', 'date'], ['byStatus', 'status']] },
  reportsCache: { keyPath: 'id', indexes: [['byType', 'type'], ['byPeriod', 'period'], ['byGeneratedAt', 'generatedAt']] },
  syncQueue: { keyPath: 'id', indexes: [['byStore', 'storeName'], ['byStatus', 'status'], ['byCreatedAt', 'createdAt']] },
  auditLog: { keyPath: 'id', indexes: [['byUser', 'userId'], ['byAction', 'action'], ['byCreatedAt', 'createdAt']] },
  representatives: { keyPath: 'id', indexes: [['byName', 'name'], ['byStatus', 'status'], ['byRegion', 'region']] },
  dispatches: { keyPath: 'id', indexes: [['byRepresentative', 'representativeId'], ['byDate', 'date'], ['byStatus', 'status']] },
  representativeReports: { keyPath: 'id', indexes: [['byRepresentative', 'representativeId'], ['byImportedAt', 'importedAt']] },
  importedPackages: { keyPath: 'id', indexes: [['byPackageType', 'packageType'], ['byImportedAt', 'importedAt']] }
};

let _db = null;
let _bootstrapDone = false;

function schemaFor(storeName) {
  return DB_SCHEMA[storeName] || { keyPath: 'id', indexes: [] };
}

function ensureStore(db, storeName) {
  const schema = schemaFor(storeName);
  if (!db.objectStoreNames.contains(storeName)) {
    return db.createObjectStore(storeName, { keyPath: schema.keyPath || 'id' });
  }
  return null;
}

function ensureIndexes(store, storeName) {
  const schema = schemaFor(storeName);
  (schema.indexes || []).forEach((def) => {
    const [indexName, keyPath, options] = def;
    if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, options || {});
  });
}

function normalizeLegacyProduct(product) {
  if (!product || typeof product !== 'object') return product;
  const insumoCost = Array.isArray(product.insumos)
    ? product.insumos.reduce((sum, i) => sum + ((Number(i.qtyUsed) || 0) * (Number(i.unitCost) || 0)), 0)
    : 0;
  const cost = Number(product.cost ?? product.baseCost ?? insumoCost) || 0;
  const resellerPrice = Number(product.resellerPrice ?? product.wholesalePriceFixed ?? 0) || 0;
  const publicPrice = Number(product.publicPrice ?? product.unitPriceFixed ?? 0) || 0;
  const now = Date.now();
  return Object.assign({}, product, {
    category: product.category || 'General',
    sku: product.sku || '',
    cost,
    resellerPrice,
    publicPrice,
    wholesalePriceFixed: resellerPrice,
    unitPriceFixed: publicPrice,
    stock: Math.max(0, parseInt(product.stock, 10) || 0),
    description: product.description || '',
    photo: product.photo || null,
    status: product.status || 'active',
    syncStatus: product.syncStatus || 'local',
    createdAt: product.createdAt || now,
    updatedAt: product.updatedAt || now
  });
}

function migrateStoreRecords(store, mapper) {
  if (!store) return;
  const cursorReq = store.openCursor();
  cursorReq.onsuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor) return;
    const updated = mapper(cursor.value);
    if (updated) cursor.update(updated);
    cursor.continue();
  };
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach((storeName) => ensureStore(db, storeName));

      STORES.forEach((storeName) => {
        const store = e.target.transaction.objectStore(storeName);
        ensureIndexes(store, storeName);
      });

      const productStore = e.target.transaction.objectStore('products');
      migrateStoreRecords(productStore, normalizeLegacyProduct);
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      _db.onversionchange = () => {
        _db.close();
        _db = null;
        showUpgradeNotice();
      };
      resolve(_db);
    };
    req.onerror = (e) => reject(e.target.error);
    req.onblocked = () => reject(new Error('La base local está bloqueada. Cierra otras pestañas de NATURA VIDA y vuelve a abrir la app.'));
  });
}

function showUpgradeNotice() {
  try { alert('NATURA VIDA se actualizó. Cierra y vuelve a abrir la app para completar la migración.'); } catch (_) {}
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => {
    if (!db.objectStoreNames.contains(storeName)) throw new Error(`Store inexistente: ${storeName}`);
    return db.transaction(storeName, mode).objectStore(storeName);
  });
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transacción cancelada'));
  });
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

async function queueSync(storeName, recordId, operation, payload) {
  const item = {
    id: uid('sync'),
    storeName,
    recordId,
    operation,
    payload: payload || null,
    status: 'pending',
    createdAt: Date.now(),
    attempts: 0
  };
  await DB.put('syncQueue', item, { silent: true });
  return item;
}

async function writeAudit(action, entity, entityId, beforeValue, afterValue) {
  const item = {
    id: uid('audit'),
    action,
    entity,
    entityId,
    beforeValue: beforeValue || null,
    afterValue: afterValue || null,
    userId: 'local-admin',
    createdAt: Date.now()
  };
  await DB.put('auditLog', item, { silent: true });
  return item;
}

const DB = {
  async getAll(storeName) {
    const store = await tx(storeName);
    return requestToPromise(store.getAll()).then((rows) => rows || []);
  },

  async get(storeName, id) {
    const store = await tx(storeName);
    return requestToPromise(store.get(id)).then((row) => row || null);
  },

  async getByIndex(storeName, indexName, value) {
    const store = await tx(storeName);
    if (!store.indexNames.contains(indexName)) return [];
    return requestToPromise(store.index(indexName).getAll(value)).then((rows) => rows || []);
  },

  async put(storeName, value, options = {}) {
    const db = await openDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const prepared = storeName === 'products' ? normalizeLegacyProduct(value) : value;
    store.put(prepared);
    await transactionPromise(transaction);
    if (!options.silent && ['products', 'sales', 'clients', 'quotes', 'inventoryMovements', 'users', 'commissions'].includes(storeName)) {
      queueSync(storeName, prepared.id, 'put', prepared).catch(() => {});
      if (window.cloudAfterPut) window.cloudAfterPut(storeName, prepared).catch(() => {});
    }
    return prepared;
  },

  async bulkPut(storeName, values, options = {}) {
    const db = await openDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    (values || []).forEach((value) => store.put(storeName === 'products' ? normalizeLegacyProduct(value) : value));
    await transactionPromise(transaction);
    if (!options.silent) {
      (values || []).forEach((value) => queueSync(storeName, value.id, 'put', value).catch(() => {}));
    }
    return values;
  },

  async delete(storeName, id, options = {}) {
    const db = await openDB();
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    await transactionPromise(transaction);
    if (!options.silent && ['products', 'sales', 'clients', 'quotes', 'inventoryMovements', 'users', 'commissions'].includes(storeName)) {
      queueSync(storeName, id, 'delete', null).catch(() => {});
      if (window.cloudAfterDelete) window.cloudAfterDelete(storeName, id).catch(() => {});
    }
    return true;
  },

  async clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    await requestToPromise(store.clear());
    return true;
  },

  async exportAll() {
    const data = {};
    for (const s of STORES) data[s] = await DB.getAll(s);
    data._meta = {
      exportedAt: new Date().toISOString(),
      version: DB_VERSION,
      app: 'natura-vida',
      model: 'NATURA_VIDA_PWA_V2_OFFLINE_FIRST'
    };
    return data;
  },

  async importAll(data) {
    if (!data || typeof data !== 'object') throw new Error('Archivo de respaldo inválido');
    const db = await openDB();
    for (const s of STORES) {
      if (!Array.isArray(data[s])) continue;
      const transaction = db.transaction(s, 'readwrite');
      const store = transaction.objectStore(s);
      store.clear();
      data[s].forEach((item) => store.put(s === 'products' ? normalizeLegacyProduct(item) : item));
      await transactionPromise(transaction);
    }
    return true;
  }
};

async function simpleHash(text) {
  const enc = new TextEncoder().encode(String(text || ''));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureBootstrapData() {
  if (_bootstrapDone) return true;
  await openDB();

  const roles = await DB.getAll('roles');
  if (roles.length === 0) {
    await DB.bulkPut('roles', [
      { id: 'role_admin', name: 'Administrador', level: 100, description: 'Control total del negocio, inventario, ventas, usuarios y reportes.', createdAt: Date.now() },
      { id: 'role_reseller', name: 'Revendedor', level: 40, description: 'Gestiona clientes, cotizaciones y ventas asignadas.', createdAt: Date.now() },
      { id: 'role_supervisor', name: 'Supervisor', level: 70, description: 'Rol preparado para supervisión comercial futura.', createdAt: Date.now() }
    ], { silent: true });
  }

  const permissions = await DB.getAll('permissions');
  if (permissions.length === 0) {
    await DB.bulkPut('permissions', [
      { id: 'perm_admin_all', roleId: 'role_admin', actions: ['*'], createdAt: Date.now() },
      { id: 'perm_reseller_sales', roleId: 'role_reseller', actions: ['products:read', 'clients:manage', 'quotes:manage', 'sales:create', 'own_reports:read'], createdAt: Date.now() },
      { id: 'perm_supervisor_team', roleId: 'role_supervisor', actions: ['products:read', 'clients:read', 'quotes:read', 'sales:read', 'team_reports:read'], createdAt: Date.now() }
    ], { silent: true });
  }

  const commissionRules = await DB.getAll('commissionRules');
  if (commissionRules.length === 0) {
    await DB.put('commissionRules', {
      id: 'rule_reseller_default',
      role: 'revendedor',
      name: 'Comisión revendedor base',
      type: 'percentage_of_profit',
      percent: 20,
      active: true,
      notes: 'Regla inicial editable en Fase 4: 20% sobre utilidad estimada.',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, { silent: true });
  }


  const users = await DB.getAll('users');
  if (users.length === 0) {
    const adminPasswordHash = await simpleHash('NaturaVida2026!');
    const resellerPasswordHash = await simpleHash('Revende2026!');
    await DB.bulkPut('users', [
      {
        id: 'user_admin_1',
        username: 'admin',
        fullName: 'Administrador Natura Vida',
        roleId: 'role_admin',
        role: 'Administrador',
        passwordHash: adminPasswordHash,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'user_reseller_1',
        username: 'revendedor1',
        fullName: 'Revendedor Demo',
        roleId: 'role_reseller',
        role: 'Revendedor',
        passwordHash: resellerPasswordHash,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ], { silent: true });
  }

  const savedSettings = await DB.get('settings', 'main');
  const current = savedSettings && savedSettings.value ? savedSettings.value : {};
  const nextSettings = Object.assign({
    setupRequired: true,
    cloudSyncPrepared: true,
    apkPrepared: true,
    defaultRole: 'Administrador',
    businessModel: 'Administrador → Revendedores → Clientes Finales',
    authEnabled: true
  }, current);
  await DB.put('settings', { key: 'main', value: nextSettings }, { silent: true });

  _bootstrapDone = true;
  return true;
}

window.DB = DB;
window.DB_VERSION = DB_VERSION;
window.DB_SCHEMA = DB_SCHEMA;
window.STORES = STORES;
window.uid = uid;
window.openDB = openDB;
window.ensureBootstrapData = ensureBootstrapData;
window.normalizeLegacyProduct = normalizeLegacyProduct;
window.queueSync = queueSync;
window.writeAudit = writeAudit;
