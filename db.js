/* db.js — Capa de almacenamiento local con IndexedDB.
   Todo el funcionamiento offline depende de este módulo: nada aquí usa red. */

const DB_NAME = 'natura_vida_db';
const DB_VERSION = 1;
const STORES = ['products', 'priceGroups', 'sales', 'clients', 'quotes', 'settings'];

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('priceGroups')) {
        db.createObjectStore('priceGroups', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sales')) {
        const s = db.createObjectStore('sales', { keyPath: 'id' });
        s.createIndex('byDate', 'date');
        s.createIndex('byClient', 'clientId');
      }
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('quotes')) {
        const q = db.createObjectStore('quotes', { keyPath: 'id' });
        q.createIndex('byExpiry', 'expiryDate');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

const DB = {
  async getAll(storeName) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async get(storeName, id) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async put(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  async clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  async exportAll() {
    const data = {};
    for (const s of STORES) data[s] = await DB.getAll(s);
    data._meta = { exportedAt: new Date().toISOString(), version: DB_VERSION, app: 'natura-vida' };
    return data;
  },

  async importAll(data) {
    for (const s of STORES) {
      if (!Array.isArray(data[s])) continue;
      await DB.clear(s);
      const store = await tx(s, 'readwrite');
      for (const item of data[s]) store.put(item);
    }
    return true;
  }
};

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

window.DB = DB;
window.uid = uid;
window.openDB = openDB;
