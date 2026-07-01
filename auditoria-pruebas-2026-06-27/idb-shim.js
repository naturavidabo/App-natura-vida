'use strict';
// Shim mínimo de IndexedDB en memoria, suficiente para ejecutar el db.js
// REAL del proyecto bajo Node.js (sin npm, sin red). No es un IndexedDB
// completo: implementa exactamente lo que db.js usa (object stores, índices
// simples no-multiEntry, get/getAll/put/delete/clear, cursores, índices con
// getAll(value), transacciones simples siempre "exitosas" salvo error
// explícito). Es suficiente para probar la LÓGICA real de sincronización.

function microtask(fn) { Promise.resolve().then(fn); }

class FakeRequest {
  constructor() { this.onsuccess = null; this.onerror = null; this.result = undefined; this.error = null; }
  _succeed(result) { this.result = result; microtask(() => { if (this.onsuccess) this.onsuccess({ target: this }); }); }
  _fail(error) { this.error = error; microtask(() => { if (this.onerror) this.onerror({ target: this }); }); }
}

class FakeIndex {
  constructor(store, name, keyPath, options) {
    this.store = store; this.name = name; this.keyPath = keyPath; this.options = options || {};
  }
  getAll(value) {
    const req = new FakeRequest();
    microtask(() => {
      try {
        const rows = [...this.store._data.values()].filter(r => r && r[this.keyPath] === value);
        req._succeed(rows);
      } catch (e) { req._fail(e); }
    });
    return req;
  }
}

class FakeObjectStore {
  constructor(name, keyPath) {
    this.name = name; this.keyPath = keyPath; this._data = new Map();
    this._indexes = new Map();
    this.indexNames = { contains: (n) => this._indexes.has(n) };
  }
  createIndex(name, keyPath, options) { this._indexes.set(name, new FakeIndex(this, name, keyPath, options)); }
  index(name) { return this._indexes.get(name); }
  put(value) {
    const req = new FakeRequest();
    const key = value[this.keyPath];
    this._data.set(key, value);
    req._succeed(key);
    return req;
  }
  get(key) {
    const req = new FakeRequest();
    req._succeed(this._data.has(key) ? this._data.get(key) : undefined);
    return req;
  }
  getAll() {
    const req = new FakeRequest();
    req._succeed([...this._data.values()]);
    return req;
  }
  delete(key) {
    const req = new FakeRequest();
    this._data.delete(key);
    req._succeed(undefined);
    return req;
  }
  clear() {
    const req = new FakeRequest();
    this._data.clear();
    req._succeed(undefined);
    return req;
  }
  openCursor() {
    const req = new FakeRequest();
    const entries = [...this._data.values()];
    let i = 0;
    const makeCursor = () => {
      if (i >= entries.length) return null;
      const value = entries[i];
      return {
        value,
        update: (updated) => { this._data.set(value[this.keyPath], updated); },
        continue: () => { i++; microtask(() => req._succeed(makeCursor())); }
      };
    };
    microtask(() => req._succeed(makeCursor()));
    return req;
  }
}

class FakeTransaction {
  constructor(db, storeNames, mode) {
    this.db = db; this.mode = mode; this.oncomplete = null; this.onerror = null; this.onabort = null;
    this._storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    microtask(() => { if (this.oncomplete) this.oncomplete(); });
  }
  objectStore(name) { return this.db._stores.get(name); }
}

class FakeDB {
  constructor() { this._stores = new Map(); this.onversionchange = null; }
  get objectStoreNames() {
    return { contains: (n) => this._stores.has(n) };
  }
  createObjectStore(name, options) {
    const store = new FakeObjectStore(name, (options && options.keyPath) || 'id');
    this._stores.set(name, store);
    return store;
  }
  transaction(storeNames, mode) { return new FakeTransaction(this, storeNames, mode); }
  close() {}
}

function createFakeIndexedDB() {
  let dbInstance = null;
  return {
    open(name, version) {
      const req = new FakeRequest();
      microtask(() => {
        if (!dbInstance) {
          dbInstance = new FakeDB();
          const upgradeReq = { target: { result: dbInstance, transaction: null } };
          // Para que ensureStore/ensureIndexes puedan usar e.target.transaction.objectStore(name)
          // durante onupgradeneeded, exponemos una transacción que solo delega a los stores ya creados.
          upgradeReq.target.transaction = { objectStore: (n) => dbInstance._stores.get(n) };
          if (req.onupgradeneeded) req.onupgradeneeded(upgradeReq);
        }
        req._succeed(dbInstance);
      });
      return req;
    }
  };
}

module.exports = { createFakeIndexedDB };
