'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { createFakeIndexedDB } = require('./idb-shim');
const { createFakeBackend, makeFakeSupabaseSdk } = require('./supabase-mock');

const PROJECT = '/home/claude/proyecto/natura-vida-pwa-v2-fase1/js/';
const FILES_FOR_LOGIC = [
  'db.js', 'ui-helpers.js', 'state.js', 'products.js', 'pricegroups.js', 'clients.js',
  'sales.js', 'quotes.js', 'receipt.js', 'backup.js', 'settings.js',
  'supabase-sync.js', 'auth.js', 'catalog-pdf.js', 'smart-packages.js', 'orders.js', 'inbox.js'
];

function loadSource(file) {
  return fs.readFileSync(path.join(PROJECT, file), 'utf8');
}

// Crea un "dispositivo" nuevo: su propio almacenamiento local (IndexedDB,
// localStorage) y su propia instancia de cliente Supabase (cada device real
// tiene la suya), pero compartiendo el mismo "backend" (las tablas) que los
// demás devices que se le pase — así se simula correctamente "dos celulares
// del mismo representante" o "admin y representante usando el mismo proyecto".
function createDevice(backend, { online = true } = {}) {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.console = console;
  sandbox.Promise = Promise;
  sandbox.Date = Date;
  sandbox.Math = Math;
  sandbox.JSON = JSON;
  sandbox.Array = Array;
  sandbox.Object = Object;
  sandbox.Map = Map;
  sandbox.Set = Set;
  sandbox.Number = Number;
  sandbox.String = String;
  sandbox.Boolean = Boolean;
  sandbox.Error = Error;
  sandbox.TextEncoder = TextEncoder;
  sandbox.TextDecoder = TextDecoder;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.setInterval = () => 0;
  sandbox.clearInterval = () => {};
  // startBackgroundSync usa window.addEventListener('online', ...) y
  // document.visibilityState — ambos necesitan existir en el entorno de pruebas.
  const _listeners = {};
  sandbox.addEventListener = (type, fn) => { if (!_listeners[type]) _listeners[type] = []; _listeners[type].push(fn); };
  sandbox.removeEventListener = (type, fn) => { if (_listeners[type]) _listeners[type] = _listeners[type].filter(f => f !== fn); };
  sandbox._triggerEvent = (type) => (_listeners[type] || []).forEach(fn => fn());

  sandbox.navigator = { onLine: online };
  sandbox.indexedDB = createFakeIndexedDB();

  const localStorageData = new Map();
  sandbox.localStorage = {
    getItem: (k) => (localStorageData.has(k) ? localStorageData.get(k) : null),
    setItem: (k, v) => localStorageData.set(k, String(v)),
    removeItem: (k) => localStorageData.delete(k),
    clear: () => localStorageData.clear()
  };

  sandbox.alert = () => {};
  sandbox.confirm = () => true;

  // Shim mínimo del DOM: alcanza para que funciones como refreshInboxBadge()
  // no truenen al no encontrar elementos (devuelven null y el código ya
  // tiene sus propios "if (!el) return"). No se usa para probar UI.
  function fakeEl() {
    return {
      style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
      addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
      setAttribute() {}, getAttribute() { return null; }, textContent: '', innerHTML: ''
    };
  }
  sandbox.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => fakeEl(),
    addEventListener() {},
    body: fakeEl(),
    visibilityState: 'visible'
  };

  // crypto.subtle.digest (usado por sha256Hex en auth.js) y randomUUID
  // (usado por generateMovementId en supabase-sync.js) respaldados por el
  // módulo nativo 'crypto' de Node.
  sandbox.crypto = {
    randomUUID: () => crypto.randomUUID(),
    subtle: {
      digest: async (_alg, data) => {
        const buf = Buffer.from(data);
        const hash = crypto.createHash('sha256').update(buf).digest();
        return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
      }
    }
  };

  // SDK de Supabase simulado: cada device crea su PROPIA instancia de
  // cliente (con su propia sesión auth), igual que en un navegador real.
  sandbox.window.supabase = makeFakeSupabaseSdk(backend);
  sandbox.window.NATURA_ONLINE_CONFIG = {
    enabled: true,
    supabaseUrl: 'https://fake-project.supabase.co',
    supabaseAnonKey: 'fake-anon-key',
    productImagesBucket: 'product-images'
  };

  const context = vm.createContext(sandbox);
  for (const file of FILES_FOR_LOGIC) {
    const src = loadSource(file);
    vm.runInContext(src, context, { filename: file });
  }

  return context; // context.DB, context.authenticateUser, etc. ya disponibles
}

module.exports = { createDevice, createFakeBackend };
