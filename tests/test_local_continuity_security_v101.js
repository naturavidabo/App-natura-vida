// Pruebas de seguridad del almacenamiento temporal de Natura Vida V10.1.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../js/v8-offline-continuity.js'), 'utf8');
const authSource = fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8');
const saved = new Map();
const localStorage = {
  getItem: key => saved.has(key) ? saved.get(key) : null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key),
};
const AppState = {
  session: { onlineUserId: 'usuario-A', isAuthenticated: true },
  currentTab: 'ventas',
  products: [{ name: 'Producto privado' }],
  clients: [{ phone: '123-PRIVADO' }],
  sales: [{ total: 12345 }],
};
const window = { AppState };
const document = { readyState: 'loading', addEventListener: () => {} };
vm.runInNewContext(source, { window, AppState, localStorage, document, navigator: { onLine: true }, console });
const api = window.NV805OfflineContinuity;
assert.ok(api, 'Debe existir el modulo de continuidad');

// 1. Solo se guardan metadatos: ninguna venta ni dato de cliente.
api.makeReadonlySnapshot();
let snapshot = JSON.parse(localStorage.getItem('nv805:readonly-snapshot'));
assert.deepEqual(Object.keys(snapshot).sort(), ['currentTab', 'savedAt', 'userId']);
assert.equal(snapshot.userId, 'usuario-A');
assert.ok(!localStorage.getItem('nv805:readonly-snapshot').includes('123-PRIVADO'));

// 2. Migracion: las copias heredadas sensibles se compactan.
localStorage.setItem('nv805:readonly-snapshot', JSON.stringify({
  savedAt: new Date().toISOString(), userId: 'usuario-A', currentTab: 'ventas',
  clients: [{ phone: 'CELULAR-LEGADO' }], sales: [{ total: 999 }],
  products: [{ name: 'privado' }], settings: { cost: 100 }
}));
assert.equal(api.readSnapshot().userId, 'usuario-A');
assert.ok(!localStorage.getItem('nv805:readonly-snapshot').includes('CELULAR-LEGADO'));
assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem('nv805:readonly-snapshot'))).sort(), ['currentTab', 'savedAt', 'userId']);

// 3. Un usuario diferente o una sesion no autenticada no puede recuperar la copia.
AppState.session.onlineUserId = 'usuario-B';
assert.equal(api.readSnapshot(), null);
AppState.session.onlineUserId = 'usuario-A';
AppState.session.isAuthenticated = false;
assert.equal(api.readSnapshot(), null);
AppState.session.isAuthenticated = true;
AppState.session.onlineUserId = 'usuario-B';

// 4. Un borrador de A no se restaura desde B y se elimina de la copia local.
const draft = {
  userId: 'usuario-A', savedAt: new Date().toISOString(),
  values: { clientPhone: { value: '123-PRIVADO', type: 'tel' } }
};
localStorage.setItem('nv805:safe-draft', JSON.stringify(draft));
assert.equal(api.readDraft(), null);
assert.equal(localStorage.getItem('nv805:safe-draft'), null);
assert.equal(api.applyDraftToVisibleForm(draft).ok, false);

// 5. El cierre de sesion limpia datos temporales, sin borrar credenciales de autenticacion.
localStorage.setItem('nv805:safe-draft', JSON.stringify({ ...draft, userId: 'usuario-B' }));
localStorage.setItem('nv805:last-successful-sync', new Date().toISOString());
localStorage.setItem('nv7-auth', 'valor reservado a Supabase');
api.clearSensitiveLocalContinuityV101();
for (const key of ['nv805:readonly-snapshot', 'nv805:safe-draft', 'nv805:last-successful-sync']) {
  assert.equal(localStorage.getItem(key), null, key + ' debe desaparecer');
}
assert.equal(localStorage.getItem('nv7-auth'), 'valor reservado a Supabase');
assert.match(authSource, /NV805OfflineContinuity\?\.clearSensitiveLocalContinuityV101\?\.\(\)/);

console.log('OK: 5 verificaciones de aislamiento, migracion, autorizacion de borradores y limpieza local.');
