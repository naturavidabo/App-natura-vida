/* db.js — Capa profesional de almacenamiento local IndexedDB para NATURA VIDA.
   Mantiene funcionamiento offline, amplía el modelo comercial y prepara sincronización futura. */

const DB_NAME = 'natura_vida_db';
const DB_VERSION = 7;
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
  'importedPackages',
  'purchaseOrders',
  'messages',
  'syncMeta'
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
  importedPackages: { keyPath: 'id', indexes: [['byPackageType', 'packageType'], ['byImportedAt', 'importedAt']] },
  purchaseOrders: { keyPath: 'id', indexes: [['byRepresentative', 'representativeId'], ['byCreatedAt', 'createdAt'], ['byStatus', 'status'], ['bySyncStatus', 'syncStatus']] },
  messages: { keyPath: 'id', indexes: [['byCreatedAt', 'createdAt'], ['byStatus', 'status'], ['byRecipientRole', 'recipientRole'], ['byRecipientUser', 'recipientUserId'], ['bySenderUser', 'senderUserId'], ['byType', 'type']] },
  syncMeta: { keyPath: 'id', indexes: [['byUpdatedAt', 'updatedAt']] }
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
    userId: AppState.session ? (AppState.session.onlineUserId || AppState.session.userId || 'unknown') : 'unknown',
    createdAt: Date.now()
  };
  await DB.put('auditLog', item, { silent: true });
  // V6.7: también registra en la tabla audit_log de Supabase para que el
  // administrador pueda ver el historial desde cualquier dispositivo.
  if (window.isOnlineConfigured && isOnlineConfigured && isOnlineConfigured() && window.getSupabaseClient) {
    try {
      const sb = getSupabaseClient();
      if (sb && AppState.session && AppState.session.onlineUserId) {
        await sb.rpc('log_audit_event', {
          p_action: String(action),
          p_table_name: String(entity),
          p_record_id: String(entityId || ''),
          p_details: afterValue || {}
        });
      }
    } catch (_) { /* log remoto es opcional, nunca debe bloquear */ }
  }
  return item;
}


function stripLargeBinaryFields(value) {
  if (!value || typeof value !== 'object') return value;
  const cloned = JSON.parse(JSON.stringify(value));
  // Las imágenes base64 NO deben viajar en respaldos ni payloads pesados.
  if (typeof cloned.photo === 'string' && cloned.photo.startsWith('data:image/')) {
    cloned.photo = null;
    cloned.photoStripped = true;
  }
  if (typeof cloned.logo === 'string' && cloned.logo.startsWith('data:image/')) {
    cloned.logo = null;
    cloned.logoStripped = true;
  }
  if (cloned.payload && typeof cloned.payload === 'object') {
    cloned.payload = stripLargeBinaryFields(cloned.payload);
  }
  return cloned;
}

function compactStoreNameAllowed(storeName) {
  return ['products','priceGroups','sales','clients','quotes','settings','users','purchaseOrders','messages','representatives'].includes(storeName);
}

async function exportCompactData() {
  const data = {};
  for (const s of STORES) {
    if (!compactStoreNameAllowed(s)) continue;
    const rows = await DB.getAll(s);
    data[s] = rows.map(stripLargeBinaryFields);
  }
  data._meta = {
    exportedAt: new Date().toISOString(),
    version: DB_VERSION,
    app: 'natura-vida',
    model: 'NATURA_VIDA_V5_COMPACT_BACKUP',
    compact: true,
    imagesExcluded: true,
    note: 'Las imágenes se manejan por URL/Supabase Storage y no se incluyen en el respaldo.'
  };
  return data;
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
    // CORRECCIÓN V6.5 (bug crítico encontrado en auditoría): 'messages' no
    // estaba en esta lista. inbox.js (desde V6.2) guarda mensajes nuevos con
    // DB.put('messages', msg) SIN {silent:true}, asumiendo que eso bastaba
    // para encolar y enviar a Supabase — pero como 'messages' no estaba aquí,
    // esa condición era siempre falsa: ningún mensaje nuevo llegaba a la
    // nube, ni de inmediato ni por la cola. Quedaba solo guardado en este
    // celular. Esto fue una regresión real introducida en V6.2, peor que el
    // comportamiento anterior a esa versión.
    if (!options.silent && ['products', 'sales', 'clients', 'quotes', 'inventoryMovements', 'users', 'commissions', 'purchaseOrders', 'messages'].includes(storeName)) {
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
    // Mismo motivo que en put(): se agrega 'messages' por consistencia.
    if (!options.silent && ['products', 'sales', 'clients', 'quotes', 'inventoryMovements', 'users', 'commissions', 'purchaseOrders', 'messages'].includes(storeName)) {
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
    return exportCompactData();
  },

  async exportCompact() {
    return exportCompactData();
  },

  async importAll(data, options = {}) {
    if (!data || typeof data !== 'object') throw new Error('Archivo de respaldo inválido');
    const db = await openDB();
    const replaceMode = !!(options.replace || (data._meta && data._meta.replace === true));
    const allowed = STORES.filter(s => Array.isArray(data[s]));
    for (const s of allowed) {
      const transaction = db.transaction(s, 'readwrite');
      const store = transaction.objectStore(s);
      if (replaceMode) store.clear();
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

async function ensureInitialAccessUsers() {
  const now = Date.now();
  const adminPasswordHash = await simpleHash('12345678');
  const sellerPasswordHash = await simpleHash('23456');

  async function upsertSeedUser(seed) {
    const all = await DB.getAll('users');
    const existing = all.find(u => u.seedSlot === seed.seedSlot || u.username === seed.username);
    if (existing) {
      const isStillInitial = existing.username === seed.username && existing.mustChangePassword !== false;
      existing.seedSlot = existing.seedSlot || seed.seedSlot;
      existing.roleId = existing.roleId || seed.roleId;
      existing.role = existing.role || seed.role;
      existing.status = existing.status || 'active';
      if (isStillInitial) {
        existing.passwordHash = seed.passwordHash;
        existing.fullName = seed.fullName;
        existing.mustChangePassword = true;
      }
      existing.updatedAt = now;
      await DB.put('users', existing, { silent: true });
      return existing;
    }
    await DB.put('users', seed, { silent: true });
    return seed;
  }

  await upsertSeedUser({
    id: 'user_admin_local',
    seedSlot: 'admin',
    username: 'admin',
    fullName: 'Administrador Natura Vida',
    roleId: 'role_admin',
    role: 'Administrador',
    passwordHash: adminPasswordHash,
    mustChangePassword: true,
    status: 'active',
    createdAt: now,
    updatedAt: now
  });

  // Acceso simple: un solo vendedor genérico para explicar por teléfono.
  await upsertSeedUser({
    id: 'user_vendedor_1',
    seedSlot: 'vendedor1',
    username: 'vendedor1',
    fullName: 'Vendedor 1',
    roleId: 'role_reseller',
    role: 'Revendedor',
    passwordHash: sellerPasswordHash,
    mustChangePassword: true,
    status: 'active',
    createdAt: now,
    updatedAt: now
  });

  // Limpieza segura de accesos genéricos antiguos vendedor2-vendedor20,
  // solo si nunca fueron personalizados. Si alguien ya cambió a su celular, se conserva.
  const users = await DB.getAll('users');
  for (const user of users) {
    const match = String(user.seedSlot || user.username || '').match(/^vendedor(\d+)$/i);
    const slot = match ? Number(match[1]) : null;
    if (slot && slot >= 2 && slot <= 20 && user.username === `vendedor${slot}` && user.mustChangePassword !== false) {
      await DB.delete('users', user.id, { silent: true });
    }
  }
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
      { id: 'perm_reseller_sales', roleId: 'role_reseller', actions: ['products:read', 'products:local_edit', 'clients:manage', 'quotes:manage', 'sales:create', 'own_reports:read', 'orders:create'], createdAt: Date.now() },
      { id: 'perm_supervisor_team', roleId: 'role_supervisor', actions: ['products:read', 'clients:read', 'quotes:read', 'sales:read', 'team_reports:read'], createdAt: Date.now() }
    ], { silent: true });
  }

  const resellerPerm = await DB.get('permissions', 'perm_reseller_sales').catch(() => null);
  if (resellerPerm) {
    const needed = ['products:read', 'products:local_edit', 'clients:manage', 'quotes:manage', 'sales:create', 'own_reports:read', 'orders:create'];
    resellerPerm.actions = Array.from(new Set([...(resellerPerm.actions || []), ...needed]));
    await DB.put('permissions', resellerPerm, { silent: true });
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


  await ensureInitialAccessUsers();


  const localUsersForSecurity = await DB.getAll('users');
  for (const u of localUsersForSecurity) {
    if ((u.username === 'admin' || /^vendedor\d{1,2}$/.test(u.username || '') || u.username === 'revendedor1') && u.mustChangePassword === undefined) {
      u.mustChangePassword = true;
      u.updatedAt = Date.now();
      await DB.put('users', u, { silent: true });
    }
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
window.stripLargeBinaryFields = stripLargeBinaryFields;
window.exportCompactData = exportCompactData;
window.queueSync = queueSync;
window.writeAudit = writeAudit;
