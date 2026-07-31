'use strict';

const APP_ID = 'good-king';
const APP_VERSION = '0.8.0';
const PUBLIC_CONFIG = window.GOOD_KING_CONFIG || {};
const OFFICIAL_SUPABASE_URL = String(PUBLIC_CONFIG.supabaseUrl || '').trim();
const OFFICIAL_SUPABASE_PUBLISHABLE_KEY = String(PUBLIC_CONFIG.supabasePublishableKey || '').replace(/\s+/g,'');
const OFFICIAL_SUPABASE_PROJECT_REF = PUBLIC_CONFIG.supabaseProjectRef || 'iufpbpwkvrrvbolfnptw';
const LEGACY_WRONG_SUPABASE_URLS = new Set(['https://iufpbpwkvnvbolfnptw.supabase.co']);
let runtimeSupabaseConfig = {url:OFFICIAL_SUPABASE_URL,anonKey:OFFICIAL_SUPABASE_PUBLISHABLE_KEY,enabled:true,managed:true};
const ADMIN_EMAIL = PUBLIC_CONFIG.administratorEmail || 'goodking.bo@gmail.com';
const OWNER_EMAIL = PUBLIC_CONFIG.ownerEmail || 'gloria.msg27@gmail.com';
const DB_NAME = 'goodKingDB';
const DB_VERSION = 7;
const VERSION_ENDPOINT = './version.json';
const NETWORK_TIMEOUT_MS = 12000;
const STORE_NAMES = ['settings', 'cashSessions', 'sales', 'movements', 'syncQueue', 'auditLogs', 'backups', 'appMeta', 'clients', 'clientPayments', 'productCatalog', 'appErrors', 'remoteSnapshots', 'inventoryIngredients', 'inventoryMovementsLocal', 'purchasesLocal', 'purchaseItemsLocal', 'recipesLocal', 'recipeItemsLocal', 'marketListsLocal', 'marketListItemsLocal', 'expensesLocal'];
const EXPORT_STORES = ['settings', 'cashSessions', 'sales', 'movements', 'syncQueue', 'auditLogs', 'appMeta', 'clients', 'clientPayments', 'productCatalog', 'appErrors', 'remoteSnapshots', 'inventoryIngredients', 'inventoryMovementsLocal', 'purchasesLocal', 'purchaseItemsLocal', 'recipesLocal', 'recipeItemsLocal', 'marketListsLocal', 'marketListItemsLocal', 'expensesLocal'];
const moneyFormatter = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DEFAULT_PRODUCTS = [
  {id:'hamb-simple',category:'Menú',name:'Hamburguesa simple',price:18,emoji:'🍔',desc:'Carne, mozzarella, ensalada y papas',badge:'Más pedida'},
  {id:'hamb-double',category:'Menú',name:'Hamburguesa doble',price:25,emoji:'🍔',desc:'Doble carne, doble mozzarella y papas',badge:'Doble'},
  {id:'broaster-eco',category:'Menú',name:'Broaster económico',price:18,emoji:'🍗',desc:'Una presa, arroz y papas',badge:'1 presa'},
  {id:'cuarto-pierna',category:'Menú',name:'Cuarto pierna y contra',price:26,emoji:'🍗',desc:'Dos presas, arroz y papas',badge:'Bs 26'},
  {id:'cuarto-mixto',category:'Menú',name:'Cuarto mixto',price:27,emoji:'🍗',desc:'Combinación mixta, arroz y papas',badge:'Bs 27'},
  {id:'cuarto-pecho',category:'Menú',name:'Cuarto pecho y ala',price:28,emoji:'🍗',desc:'Pecho y ala, arroz y papas',badge:'Bs 28'},
  {id:'salchipapa',category:'Menú',name:'Salchipapa',price:15,emoji:'🍟',desc:'Porción grande de papas y salchicha',badge:'Clásica'},
  {id:'salchicarne',category:'Menú',name:'Salchicarne',price:22,emoji:'🥩',desc:'Papas, salchicha y carne picada',badge:'Completa'},
  {id:'lomo',category:'Menú',name:'Lomo montado',price:28,emoji:'🥩',desc:'Bife, huevo, arroz, papa y ensalada',badge:'Especial'},
  {id:'coca-mini',category:'Bebidas',name:'Coca-Cola mini',price:3,emoji:'🥤',desc:'Presentación mini',badge:'Mini'},
  {id:'coca-pop',category:'Bebidas',name:'Coca-Cola popular',price:5,emoji:'🥤',desc:'Presentación popular',badge:'Popular'},
  {id:'coca-2l',category:'Bebidas',name:'Coca-Cola 2 litros',price:14,emoji:'🍾',desc:'Botella de 2 litros',badge:'2 L'},
  {id:'coca-3l',category:'Bebidas',name:'Coca-Cola 3 litros',price:18,emoji:'🍾',desc:'Botella de 3 litros',badge:'3 L'},
  {id:'jugo',category:'Bebidas',name:'Jugo embotellado',price:6,emoji:'🧃',desc:'Sabor según disponibilidad',badge:'Frío'},
  {id:'limonada',category:'Bebidas',name:'Limonada',price:7,emoji:'🍋',desc:'Preparación de la casa',badge:'Casa'},
  {id:'extra-arroz',category:'Extras',name:'Porción de arroz',price:5,emoji:'🍚',desc:'Porción adicional',badge:'Extra'},
  {id:'extra-papa',category:'Extras',name:'Porción de papa',price:7,emoji:'🍟',desc:'Porción adicional',badge:'Extra'},
  {id:'extra-salchi',category:'Extras',name:'Porción de salchicha',price:6,emoji:'🌭',desc:'Porción adicional',badge:'Extra'},
  {id:'extra-ensalada',category:'Extras',name:'Porción de ensalada',price:5,emoji:'🥗',desc:'Porción adicional',badge:'Extra'},
  {id:'extra-huevo',category:'Extras',name:'Huevo adicional',price:3,emoji:'🍳',desc:'Una unidad',badge:'Extra'}
];

const DEFAULT_QUICK_NOTES = ['Solo papa','Solo arroz','Papa y arroz','Sin arroz','Sin papa','Sin ensalada','Salsas aparte','Sin picante','Presa específica'];
const modules = [
  ['orders','▤','Pedidos','Consulta, reimpresión y anulación con historial.'],
  ['cash','▣','Caja','Apertura, cierre, movimientos y fondo del día siguiente.'],
  ['clients','👤','Clientes y fiados','Clientes autorizados, saldos y abonos.'],
  ['products','🍔','Productos','Platos, bebidas, extras, fotos y precios.'],
  ['recipes','◫','Recetas y costos','Ingredientes, porciones y costo estimado.'],
  ['inventory','▦','Inventario','Stock referencial, alertas, ajustes y mermas.'],
  ['market','✓','Lista de mercado','Ayuda memoria y sugerencias de faltantes.'],
  ['purchases','🛍','Compras','Ingreso de compras y actualización de stock.'],
  ['expenses','↘','Gastos','Servicios, sueldos, gas, transporte y otros.'],
  ['reports','▥','Reportes','Resumen diario, mensual y documentos imprimibles.'],
  ['users','♙','Usuarios','Administrador, propietaria y ayudante.'],
  ['settings','⚙','Configuración','Respaldo, verificación, almacenamiento y futura sincronización.']
];

let db;
let products = [];
let quickNotes = [...DEFAULT_QUICK_NOTES];
let cart = [];
let currentCategory = 'Menú';
let orderType = 'Para la mesa';
let payment = 'Efectivo';
let selectedNotes = new Set();
let currentCash = null;
let isSaving = false;
let fallbackLock = false;
let backupTimer = null;
let broadcastChannel = null;
let deferredInstallPrompt = null;
let swRegistration = null;
let updateReady = false;
let reloadAfterUpdate = false;
let currentModuleKey = 'sales';
let supabaseClient = null;
let supabaseClientSignature = '';
let authSession = null;
let authContext = null;
let authSubscription = null;
let remoteCategoryMap = null;
let syncInProgress = false;

const $ = id => document.getElementById(id);
const money = value => `Bs ${moneyFormatter.format(Number(value || 0))}`;
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const nowIso = () => new Date().toISOString();
const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const requestPromise = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const transactionPromise = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('Error en la transacción local.'));
  transaction.onabort = () => reject(transaction.error || new Error('La transacción fue cancelada.'));
});

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const database = request.result;
      const transaction = request.transaction;
      STORE_NAMES.forEach(name => {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' });
      });
      const sales = transaction.objectStore('sales');
      if (!sales.indexNames.contains('date')) sales.createIndex('date', 'date', { unique: false });
      if (!sales.indexNames.contains('status')) sales.createIndex('status', 'status', { unique: false });
      const queues = transaction.objectStore('syncQueue');
      if (!queues.indexNames.contains('status')) queues.createIndex('status', 'status', { unique: false });
      const expenses = transaction.objectStore('expensesLocal');
      if (!expenses.indexNames.contains('date')) expenses.createIndex('date', 'date', { unique: false });
      if (!expenses.indexNames.contains('category')) expenses.createIndex('category', 'category', { unique: false });
      const backups = transaction.objectStore('backups');
      if (!backups.indexNames.contains('createdAt')) backups.createIndex('createdAt', 'createdAt', { unique: false });
      const clientsStore = transaction.objectStore('clients');
      if (!clientsStore.indexNames.contains('phone')) clientsStore.createIndex('phone', 'phone', { unique: false });
      const clientPaymentsStore = transaction.objectStore('clientPayments');
      if (!clientPaymentsStore.indexNames.contains('clientId')) clientPaymentsStore.createIndex('clientId', 'clientId', { unique: false });
      if (!clientPaymentsStore.indexNames.contains('date')) clientPaymentsStore.createIndex('date', 'date', { unique: false });
      const catalogStore = transaction.objectStore('productCatalog');
      if (!catalogStore.indexNames.contains('category')) catalogStore.createIndex('category', 'category', { unique: false });
      const errorStore = transaction.objectStore('appErrors');
      if (!errorStore.indexNames.contains('createdAt')) errorStore.createIndex('createdAt', 'createdAt', { unique: false });
      const remoteStore = transaction.objectStore('remoteSnapshots');
      if (!remoteStore.indexNames.contains('updatedAt')) remoteStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      const recipeItemsStore = transaction.objectStore('recipeItemsLocal');
      if (!recipeItemsStore.indexNames.contains('recipeId')) recipeItemsStore.createIndex('recipeId', 'recipeId', { unique: false });
      if (!recipeItemsStore.indexNames.contains('ingredientId')) recipeItemsStore.createIndex('ingredientId', 'ingredientId', { unique: false });
      const marketItemsStore = transaction.objectStore('marketListItemsLocal');
      if (!marketItemsStore.indexNames.contains('marketListId')) marketItemsStore.createIndex('marketListId', 'marketListId', { unique: false });
      if (!marketItemsStore.indexNames.contains('ingredientId')) marketItemsStore.createIndex('ingredientId', 'ingredientId', { unique: false });
      transaction.objectStore('appMeta').put({
        id: 'schema',
        appId: APP_ID,
        schemaVersion: DB_VERSION,
        upgradedAt: nowIso(),
        previousVersion: event.oldVersion
      });
    };
    request.onsuccess = () => {
      db = request.result;
      db.onversionchange = () => {
        db.close();
        alert('Good King fue actualizado en otra pestaña. Recarga esta página para continuar.');
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('La actualización está bloqueada por otra pestaña abierta.'));
  });
}

async function getRecord(storeName, id) {
  return requestPromise(db.transaction(storeName, 'readonly').objectStore(storeName).get(id));
}

async function getAllRecords(storeName) {
  return requestPromise(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

async function putRecord(storeName, value) {
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await transactionPromise(transaction);
  return value;
}

async function countRecords(storeName) {
  return requestPromise(db.transaction(storeName, 'readonly').objectStore(storeName).count());
}

async function withAppLock(name, callback) {
  if (navigator.locks?.request) return navigator.locks.request(`good-king-${name}`, callback);
  if (fallbackLock) throw new Error('Hay otra operación en proceso. Espera un momento.');
  fallbackLock = true;
  try { return await callback(); } finally { fallbackLock = false; }
}

function toast(message, duration = 2400) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(element._timer);
  element._timer = setTimeout(() => element.classList.remove('show'), duration);
}

function setSaving(value) {
  isSaving = value;
  const button = $('confirmSaleBtn');
  button.disabled = value;
  button.textContent = value ? 'Guardando…' : 'Confirmar pedido';
}

async function writeAudit(action, entity, entityId, details = {}) {
  const record = { id: uid(), action, entity, entityId, details, createdAt: nowIso(), appVersion: APP_VERSION };
  await putRecord('auditLogs', record);
}

function queueRecord(entity, payload, operation = 'upsert') {
  return {
    id: uid(),
    entity,
    entityId: payload.id,
    operation,
    payload,
    status: 'pending',
    attempts: 0,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}


async function ensureDefaultCatalog() {
  const existing = await getAllRecords('productCatalog');
  if (!existing.length) {
    const transaction = db.transaction('productCatalog', 'readwrite');
    const store = transaction.objectStore('productCatalog');
    DEFAULT_PRODUCTS.forEach((item, index) => store.put({
      ...item, active:true, status:'available', sortOrder:index + 1,
      createdAt:nowIso(), updatedAt:nowIso(), appVersion:APP_VERSION
    }));
    await transactionPromise(transaction);
  }
  products = (await getAllRecords('productCatalog'))
    .sort((a,b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));
  const notes = await getRecord('settings', 'quick-notes');
  quickNotes = Array.isArray(notes?.value) && notes.value.length ? notes.value : [...DEFAULT_QUICK_NOTES];
}

async function getDeviceId() {
  let record = await getRecord('settings', 'device-id');
  if (!record?.value) {
    record = { id:'device-id', value:uid(), createdAt:nowIso(), updatedAt:nowIso() };
    await putRecord('settings', record);
  }
  return record.value;
}

async function logAppError(source, error, context = {}) {
  try {
    if (!db) return;
    const record = {
      id:uid(), source, message:String(error?.message || error || 'Error desconocido'),
      stack:String(error?.stack || ''), context, createdAt:nowIso(), appVersion:APP_VERSION
    };
    await putRecord('appErrors', record);
    await putRecord('appMeta', { id:'last-app-error', ...record });
  } catch (loggingError) {
    console.warn('No se pudo registrar el error localmente', loggingError);
  }
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updateInstallUI() {
  const button = $('installAppBtn');
  if (!button) return;
  const installed = isStandalone();
  button.hidden = installed;
  button.textContent = deferredInstallPrompt ? 'Instalar app' : 'Cómo instalar';
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallUI();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallUI();
  toast('Good King se instaló correctamente.');
});


async function prepareV05MigrationQueue() {
  const migration = await getRecord('appMeta','v05-core-sync-migration');
  if (migration?.completedAt) return;
  const sources = [
    ['cashSessions','cashSessions'],
    ['sales','sales'],
    ['clients','clients'],
    ['clientPayments','clientPayments'],
    ['productCatalog','productCatalog']
  ];
  const transaction = db.transaction(['syncQueue','appMeta',...sources.map(([store])=>store)],'readwrite');
  const queueStore = transaction.objectStore('syncQueue');
  let queued = 0;
  for (const [storeName,entity] of sources) {
    const records = await requestPromise(transaction.objectStore(storeName).getAll());
    for (const record of records) {
      queueStore.put({...queueRecord(entity,record),migration:'v0.5-real-tables'});
      queued++;
    }
  }
  transaction.objectStore('appMeta').put({id:'v05-core-sync-migration',queued,completedAt:nowIso(),appVersion:APP_VERSION});
  await transactionPromise(transaction);
}

async function ensureMetadata() {
  const schema = await getRecord('appMeta', 'schema');
  await putRecord('appMeta', {
    ...(schema || {}),
    id: 'schema',
    appId: APP_ID,
    schemaVersion: DB_VERSION,
    appVersion: APP_VERSION,
    lastOpenedAt: nowIso()
  });
}

async function repairOrderCounters() {
  const sales = await getAllRecords('sales');
  const maximums = new Map();
  sales.forEach(sale => {
    if (!sale.date || !Number.isFinite(Number(sale.orderNumber))) return;
    maximums.set(sale.date, Math.max(maximums.get(sale.date) || 0, Number(sale.orderNumber)));
  });
  const transaction = db.transaction('settings', 'readwrite');
  const store = transaction.objectStore('settings');
  for (const [date, maximum] of maximums) {
    const id = `order-counter-${date}`;
    const existing = await requestPromise(store.get(id));
    if (!existing || Number(existing.value || 0) < maximum) store.put({ id, value: maximum, updatedAt: nowIso() });
  }
  await transactionPromise(transaction);
}

async function nextOrderPreview() {
  const date = localDateKey();
  const counter = await getRecord('settings', `order-counter-${date}`);
  if (counter) return Number(counter.value || 0) + 1;
  const sales = (await getAllRecords('sales')).filter(sale => sale.date === date);
  return Math.max(0, ...sales.map(sale => Number(sale.orderNumber || 0))) + 1;
}

async function refreshOrderNumber() {
  const number = await nextOrderPreview();
  $('orderNumber').textContent = `N.º ${String(number).padStart(3, '0')}`;
}

function getCartQuantity(id) {
  return cart.find(item => item.id === id)?.qty || 0;
}

function renderCategories() {
  const categories = ['Menú', 'Bebidas', 'Extras'];
  $('categoryTabs').innerHTML = categories.map(category =>
    `<button class="${category === currentCategory ? 'active' : ''}" data-cat="${escapeHTML(category)}">${escapeHTML(category)}</button>`
  ).join('');
  $('categoryTabs').querySelectorAll('button').forEach(button => {
    button.onclick = () => {
      currentCategory = button.dataset.cat;
      renderCategories();
      renderProducts();
    };
  });
}

function renderProducts() {
  const query = $('searchInput').value.trim().toLowerCase();
  const list = products.filter(product => product.active !== false && product.category === currentCategory && (!query || product.name.toLowerCase().includes(query)));
  $('productGrid').innerHTML = list.map(product => {
    const quantity = getCartQuantity(product.id);
    const soldOut = product.status === 'soldout';
    const low = product.status === 'low';
    return `<article class="product-card ${soldOut ? 'soldout' : ''} ${low ? 'low-stock' : ''}">
      <div class="product-visual"><span class="product-badge">${escapeHTML(soldOut ? 'Agotado' : low ? 'Poco stock' : product.badge)}</span><span class="food-emoji">${escapeHTML(product.emoji || '🍽️')}</span></div>
      <div class="product-body">
        <h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.desc || '')}</p>
        <div class="product-price"><strong>${money(product.price)}</strong><small>${soldOut ? 'No disponible temporalmente' : 'Precio unitario'}</small></div>
        <div class="product-stepper" aria-label="Cantidad de ${escapeHTML(product.name)}">
          <button data-id="${escapeHTML(product.id)}" data-delta="-1" ${quantity === 0 ? 'disabled' : ''}>−</button>
          <b>${quantity}</b>
          <button data-id="${escapeHTML(product.id)}" data-delta="1" ${soldOut ? 'disabled' : ''}>＋</button>
        </div>
      </div>
    </article>`;
  }).join('') || '<div class="empty-state">No se encontraron productos.</div>';
  $('productGrid').querySelectorAll('.product-stepper button').forEach(button => {
    button.onclick = () => changeProductQuantity(button.dataset.id, Number(button.dataset.delta));
  });
}

function changeProductQuantity(id, delta) {
  const product = products.find(item => item.id === id);
  if (!product) return;
  if (delta > 0 && product.status === 'soldout') return toast('Este producto está marcado como agotado.');
  const line = cart.find(item => item.id === id);
  if (line) {
    line.qty += delta;
    if (line.qty <= 0) cart = cart.filter(item => item.id !== id);
  } else if (delta > 0) {
    cart.push({ ...product, qty: 1 });
  }
  renderProducts();
  renderCart();
  if (delta > 0) toast(`${product.name} agregado`);
}

function changeCartQuantity(id, delta) {
  changeProductQuantity(id, delta);
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const total = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
  $('floatingCount').textContent = `${count} ${count === 1 ? 'producto' : 'productos'}`;
  $('floatingTotal').textContent = money(total);
  $('cartTotal').textContent = money(total);
  $('cartItems').innerHTML = cart.length ? cart.map(item =>
    `<div class="cart-line"><div><strong>${escapeHTML(item.name)}</strong><small>${money(item.price)} c/u · ${money(item.price * item.qty)}</small></div><div class="qty"><button data-id="${escapeHTML(item.id)}" data-delta="-1">−</button><b>${item.qty}</b><button data-id="${escapeHTML(item.id)}" data-delta="1">＋</button></div></div>`
  ).join('') : '<div class="empty-cart">🛒<br><b>El pedido está vacío</b><br><small>Agrega productos desde el menú.</small></div>';
  $('cartItems').querySelectorAll('.qty button').forEach(button => {
    button.onclick = () => changeCartQuantity(button.dataset.id, Number(button.dataset.delta));
  });
}

function openCart() {
  $('cartPanel').classList.add('open');
  $('cartBackdrop').classList.add('show');
  $('cartPanel').setAttribute('aria-hidden', 'false');
}

function closeCart() {
  $('cartPanel').classList.remove('open');
  $('cartBackdrop').classList.remove('show');
  $('cartPanel').setAttribute('aria-hidden', 'true');
}

function renderQuickNotes() {
  $('quickNotes').innerHTML = quickNotes.map(note =>
    `<button data-note="${escapeHTML(note)}" class="${selectedNotes.has(note) ? 'active' : ''}">${escapeHTML(note)}</button>`
  ).join('');
  $('quickNotes').querySelectorAll('button').forEach(button => {
    button.onclick = () => {
      selectedNotes.has(button.dataset.note) ? selectedNotes.delete(button.dataset.note) : selectedNotes.add(button.dataset.note);
      renderQuickNotes();
    };
  });
}

function setupSegment(id, setter) {
  $(id).querySelectorAll('button').forEach(button => {
    button.onclick = () => {
      $(id).querySelectorAll('button').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      setter(button.dataset.value);
    };
  });
}

async function loadCash() {
  const date = localDateKey();
  const sessions = await getAllRecords('cashSessions');
  currentCash = sessions
    .filter(session => session.date === date && !session.closedAt)
    .sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)))[0] || null;
  const lastClosed = sessions.filter(session => session.closedAt && Number.isFinite(Number(session.nextFund))).sort((a,b) => String(b.closedAt).localeCompare(String(a.closedAt)))[0];
  if (lastClosed && !currentCash) $('openingAmount').value = Number(lastClosed.nextFund || 0);
  updateCashUI();
}

function updateCashUI() {
  if (currentCash) {
    $('cashStatus').innerHTML = '<i style="background:#58d09a"></i> Caja abierta';
    $('openCashBtn').textContent = 'Caja abierta';
  } else {
    $('cashStatus').innerHTML = '<i></i> Caja cerrada';
    $('openCashBtn').textContent = 'Abrir caja';
  }
}

async function openCash() {
  if (currentCash) {
    await showSummary();
    return;
  }
  const sessions = await getAllRecords('cashSessions');
  const closedToday = sessions.some(session => session.date === localDateKey() && session.closedAt);
  if (closedToday) {
    toast('La caja de hoy ya fue cerrada. No se abrirá otra jornada por seguridad.', 4200);
    return;
  }
  $('cashDialog').showModal();
}

async function confirmOpenCash(event) {
  event.preventDefault();
  const amount = Number($('openingAmount').value);
  if (!Number.isFinite(amount) || amount < 0) return toast('Ingresa un monto inicial válido.');
  try {
    await withAppLock('cash', async () => {
      const sessions = await getAllRecords('cashSessions');
      if (sessions.some(session => session.date === localDateKey() && !session.closedAt)) throw new Error('La caja ya fue abierta en otra pestaña.');
      const session = {
        id: uid(), date: localDateKey(), openedAt: nowIso(), openingAmount: amount,
        closedAt: null, closingAmount: null, nextFund: null, status: 'open', appVersion: APP_VERSION
      };
      const transaction = db.transaction(['cashSessions','syncQueue','auditLogs'], 'readwrite');
      transaction.objectStore('cashSessions').put(session);
      transaction.objectStore('syncQueue').put(queueRecord('cashSessions', session));
      transaction.objectStore('auditLogs').put({id:uid(),action:'cash_opened',entity:'cashSessions',entityId:session.id,details:{openingAmount:amount},createdAt:nowIso(),appVersion:APP_VERSION});
      await transactionPromise(transaction);
      currentCash = session;
    });
    $('cashDialog').close();
    updateCashUI();
    await refreshStatus();
    scheduleAutoBackup('apertura de caja');
    notifyOtherTabs('cash-changed');
    toast('Caja abierta y guardada correctamente.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo abrir la caja.', 4200);
  }
}

async function saveSaleAtomically(saleDraft) {
  return withAppLock('sale', async () => {
    const date = localDateKey();
    const counterId = `order-counter-${date}`;
    const transaction = db.transaction(['settings','sales','movements','syncQueue','auditLogs'], 'readwrite');
    const settingsStore = transaction.objectStore('settings');
    const existingCounter = await requestPromise(settingsStore.get(counterId));
    let currentNumber = Number(existingCounter?.value || 0);
    if (!existingCounter) {
      const allSales = await requestPromise(transaction.objectStore('sales').getAll());
      currentNumber = Math.max(0, ...allSales.filter(sale => sale.date === date).map(sale => Number(sale.orderNumber || 0)));
    }
    const orderNumber = currentNumber + 1;
    const sale = {
      ...saleDraft,
      id: uid(),
      date,
      orderNumber,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: 'confirmed',
      cashSessionId: currentCash.id,
      appVersion: APP_VERSION
    };
    settingsStore.put({ id: counterId, value: orderNumber, updatedAt: nowIso() });
    transaction.objectStore('sales').put(sale);
    transaction.objectStore('movements').put({
      id: uid(), date, createdAt: nowIso(), type: 'sale', method: sale.payment,
      amount: sale.total, saleId: sale.id, cashSessionId: sale.cashSessionId, status: 'active'
    });
    transaction.objectStore('syncQueue').put(queueRecord('sales', sale));
    transaction.objectStore('auditLogs').put({
      id: uid(), action: 'sale_created', entity: 'sales', entityId: sale.id,
      details: { orderNumber, total: sale.total, payment: sale.payment }, createdAt: nowIso(), appVersion: APP_VERSION
    });
    await transactionPromise(transaction);
    return sale;
  });
}

async function confirmSale() {
  if (isSaving) return;
  if (!currentCash) {
    toast('Primero debes abrir la caja.');
    $('cashDialog').showModal();
    return;
  }
  if (!cart.length) return toast('Agrega al menos un producto.');
  if (payment === 'QR' && !confirm('¿Confirmas que el pago QR ya fue verificado?')) return;
  const items = cart.map(item => ({ id:item.id, name:item.name, qty:item.qty, price:item.price }));
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const note = [...selectedNotes, $('customNote').value.trim()].filter(Boolean).join(' · ');
  setSaving(true);
  try {
    const sale = await saveSaleAtomically({ items, orderType, payment, note, total });
    showPrint(sale, 'Pedido registrado');
    cart = [];
    selectedNotes.clear();
    $('customNote').value = '';
    renderQuickNotes();
    renderProducts();
    renderCart();
    await refreshOrderNumber();
    closeCart();
    await refreshStatus();
    scheduleAutoBackup(`pedido ${sale.orderNumber}`);
    notifyOtherTabs('sale-changed');
    toast(`Pedido ${String(sale.orderNumber).padStart(3,'0')} guardado.`);
  } catch (error) {
    console.error(error);
    toast(`No se guardó el pedido: ${error.message || 'error local'}`, 5200);
  } finally {
    setSaving(false);
  }
}

function showPrint(sale, title = 'Pedido registrado') {
  const items = sale.items.map(item => `<div>${Number(item.qty)} × ${escapeHTML(item.name)}</div>`).join('');
  $('printDialogTitle').textContent = title;
  $('printContent').innerHTML = `<div class="ticket-stack">
    <div class="ticket"><h3>GOOD KING · COCINA</h3><div class="order-big">PEDIDO ${String(sale.orderNumber).padStart(3,'0')}</div><p><b>${escapeHTML(sale.orderType)}</b> · ${new Date(sale.createdAt).toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'})}</p><hr>${items}${sale.note ? `<hr><b>INDICACIONES:</b><div>${escapeHTML(sale.note)}</div>` : ''}${sale.status === 'cancelled' ? '<hr><b>VENTA ANULADA</b>' : ''}</div>
    <div class="ticket"><h3>GOOD KING</h3><div class="order-big">N.º ${String(sale.orderNumber).padStart(3,'0')}</div><p style="text-align:center">Monto pagado</p><div class="order-big">${money(sale.total)}</div></div>
  </div>`;
  $('printDialog').showModal();
}

async function salesForDate(date = localDateKey(), includeCancelled = false) {
  const sales = (await getAllRecords('sales')).filter(sale => sale.date === date);
  return includeCancelled ? sales : sales.filter(sale => sale.status === 'confirmed');
}

async function showSummary() {
  const sales = await salesForDate();
  const cancelled = (await salesForDate(localDateKey(), true)).filter(sale => sale.status === 'cancelled').length;
  const total = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const cash = sales.filter(sale => sale.payment === 'Efectivo').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const qr = sales.filter(sale => sale.payment === 'QR').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  $('summaryContent').innerHTML = `<div class="summary-grid">
    <div class="summary-metric"><span>Pedidos válidos</span><strong>${sales.length}</strong></div>
    <div class="summary-metric"><span>Total vendido</span><strong>${money(total)}</strong></div>
    <div class="summary-metric"><span>Efectivo</span><strong>${money(cash)}</strong></div>
    <div class="summary-metric"><span>QR</span><strong>${money(qr)}</strong></div>
    <div class="summary-metric"><span>Fondo inicial</span><strong>${money(currentCash?.openingAmount || 0)}</strong></div>
    <div class="summary-metric"><span>Efectivo esperado</span><strong>${money((currentCash?.openingAmount || 0) + cash)}</strong></div>
    <div class="summary-metric"><span>Anulaciones</span><strong>${cancelled}</strong></div>
    <div class="summary-metric"><span>Guardado</span><strong>Local seguro</strong></div>
  </div>`;
  $('closeCashBtn').style.display = currentCash ? 'inline-block' : 'none';
  $('summaryDialog').showModal();
}

async function prepareCloseCash() {
  if (!currentCash) return toast('No hay una caja abierta.');
  const sales = await salesForDate();
  const cashTotal = sales.filter(sale => sale.payment === 'Efectivo').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const expected = Number(currentCash.openingAmount || 0) + cashTotal;
  $('expectedCashText').textContent = `Efectivo esperado: ${money(expected)}`;
  $('countedCash').value = expected.toFixed(2);
  $('nextDayFund').value = '80.00';
  $('closeCashDialog').dataset.expected = String(expected);
  updateCashDifference();
  $('summaryDialog').close();
  $('closeCashDialog').showModal();
}

function updateCashDifference() {
  const expected = Number($('closeCashDialog').dataset.expected || 0);
  const counted = Number($('countedCash').value || 0);
  const difference = counted - expected;
  $('cashDifference').textContent = `Diferencia: ${money(difference)}`;
  $('cashDifference').className = `difference-box ${Math.abs(difference) < 0.01 ? 'ok' : difference < 0 ? 'negative' : 'positive'}`;
}

async function confirmCloseCash(event) {
  event.preventDefault();
  if (!currentCash) return toast('La caja ya está cerrada.');
  const counted = Number($('countedCash').value);
  const nextFund = Number($('nextDayFund').value);
  const expected = Number($('closeCashDialog').dataset.expected || 0);
  if (![counted, nextFund].every(value => Number.isFinite(value) && value >= 0)) return toast('Revisa los montos ingresados.');
  try {
    await withAppLock('cash', async () => {
      const closed = {
        ...currentCash,
        closedAt: nowIso(),
        closingAmount: counted,
        expectedAmount: expected,
        difference: counted - expected,
        nextFund,
        status: 'closed',
        updatedAt: nowIso()
      };
      const transaction = db.transaction(['cashSessions','syncQueue','auditLogs'], 'readwrite');
      transaction.objectStore('cashSessions').put(closed);
      transaction.objectStore('syncQueue').put(queueRecord('cashSessions', closed));
      transaction.objectStore('auditLogs').put({id:uid(),action:'cash_closed',entity:'cashSessions',entityId:closed.id,details:{counted,expected,nextFund,difference:counted-expected},createdAt:nowIso(),appVersion:APP_VERSION});
      await transactionPromise(transaction);
      currentCash = null;
      $('openingAmount').value = nextFund;
    });
    $('closeCashDialog').close();
    updateCashUI();
    await createAutoBackup('cierre de caja');
    await refreshStatus();
    notifyOtherTabs('cash-changed');
    toast('Caja cerrada. Se creó un respaldo automático.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo cerrar la caja.', 4200);
  }
}

async function annulSale(id) {
  const sale = await getRecord('sales', id);
  if (!sale || sale.status === 'cancelled') return toast('La venta ya está anulada o no existe.');
  const reason = prompt(`Motivo para anular el pedido ${String(sale.orderNumber).padStart(3,'0')}:`, 'Error en el pedido');
  if (!reason?.trim()) return;
  if (!confirm(`¿Anular el pedido ${String(sale.orderNumber).padStart(3,'0')} por ${money(sale.total)}?\nLa operación quedará registrada.`)) return;
  try {
    await withAppLock('sale', async () => {
      const updated = { ...sale, status:'cancelled', cancelledAt:nowIso(), cancellationReason:reason.trim(), updatedAt:nowIso() };
      const transaction = db.transaction(['sales','movements','syncQueue','auditLogs'], 'readwrite');
      transaction.objectStore('sales').put(updated);
      transaction.objectStore('movements').put({id:uid(),date:sale.date,createdAt:nowIso(),type:'sale_reversal',method:sale.payment,amount:-Number(sale.total),saleId:sale.id,cashSessionId:sale.cashSessionId,status:'active',reason:reason.trim()});
      transaction.objectStore('syncQueue').put(queueRecord('sales', updated));
      transaction.objectStore('auditLogs').put({id:uid(),action:'sale_cancelled',entity:'sales',entityId:sale.id,details:{orderNumber:sale.orderNumber,total:sale.total,reason:reason.trim()},createdAt:nowIso(),appVersion:APP_VERSION});
      await transactionPromise(transaction);
    });
    scheduleAutoBackup(`anulación pedido ${sale.orderNumber}`);
    await refreshStatus();
    notifyOtherTabs('sale-changed');
    toast('Venta anulada y registrada.');
    await renderModule('orders');
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo anular la venta.', 4200);
  }
}

async function buildBackupPayload(reason = 'manual') {
  const data = {};
  for (const store of EXPORT_STORES) data[store] = await getAllRecords(store);
  return {
    appId: APP_ID,
    appVersion: APP_VERSION,
    schemaVersion: DB_VERSION,
    exportedAt: nowIso(),
    reason,
    data
  };
}

async function sha256(text) {
  if (!crypto.subtle) return null;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function packageBackup(reason = 'manual') {
  const payload = await buildBackupPayload(reason);
  const checksum = await sha256(JSON.stringify(payload));
  return { ...payload, checksum };
}

async function createAutoBackup(reason = 'automático') {
  const packaged = await packageBackup(reason);
  const record = { id:uid(), createdAt:packaged.exportedAt, reason, checksum:packaged.checksum, payload:packaged };
  await putRecord('backups', record);
  const backups = (await getAllRecords('backups')).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (backups.length > 5) {
    const transaction = db.transaction('backups','readwrite');
    backups.slice(5).forEach(item => transaction.objectStore('backups').delete(item.id));
    await transactionPromise(transaction);
  }
  return record;
}

function scheduleAutoBackup(reason) {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => createAutoBackup(reason).catch(error => console.error('No se pudo crear respaldo automático', error)), 800);
}

async function exportBackup() {
  try {
    const backup = await packageBackup('exportación manual');
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `good-king-respaldo-${localDateKey()}-${new Date().toTimeString().slice(0,5).replace(':','')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    await createAutoBackup('exportación manual');
    toast('Respaldo descargado correctamente.');
    if ($('moduleView').classList.contains('active')) await renderModule('settings');
  } catch (error) {
    console.error(error);
    toast('No se pudo crear el respaldo.', 4200);
  }
}

function validateBackupShape(backup) {
  if (!backup || backup.appId !== APP_ID || !backup.data || typeof backup.data !== 'object') throw new Error('El archivo no corresponde a Good King.');
  if (Number(backup.schemaVersion || 0) > DB_VERSION) throw new Error('El respaldo fue creado con una versión más nueva de Good King.');
  for (const store of EXPORT_STORES) {
    if (backup.data[store] !== undefined && !Array.isArray(backup.data[store])) throw new Error(`La sección ${store} no es válida.`);
  }
}

async function restoreBackupFile(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    validateBackupShape(backup);
    if (backup.checksum) {
      const { checksum, ...payload } = backup;
      const calculated = await sha256(JSON.stringify(payload));
      if (calculated && calculated !== checksum) throw new Error('El respaldo está alterado o incompleto.');
    }
    if (!confirm(`Se restaurará el respaldo del ${new Date(backup.exportedAt).toLocaleString('es-BO')}.\nLos datos actuales serán reemplazados. Antes se creará una copia de seguridad interna.`)) return;
    await createAutoBackup('antes de restaurar archivo');
    const transaction = db.transaction(EXPORT_STORES, 'readwrite');
    for (const storeName of EXPORT_STORES) {
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const record of (backup.data[storeName] || [])) store.put(record);
    }
    await transactionPromise(transaction);
    toast('Respaldo restaurado. La aplicación se reiniciará.', 3500);
    setTimeout(() => location.reload(), 1300);
  } catch (error) {
    console.error(error);
    toast(`No se restauró: ${error.message}`, 5200);
  } finally {
    $('restoreFileInput').value = '';
  }
}

async function verifyDataIntegrity() {
  const [sales, sessions, movements, queues] = await Promise.all([
    getAllRecords('sales'), getAllRecords('cashSessions'), getAllRecords('movements'), getAllRecords('syncQueue')
  ]);
  const errors = [];
  const warnings = [];
  const orderKeys = new Set();
  const sessionIds = new Set(sessions.map(item => item.id));
  sales.forEach(sale => {
    const orderKey = `${sale.date}-${sale.orderNumber}`;
    if (orderKeys.has(orderKey)) errors.push(`Número de pedido duplicado: ${orderKey}.`);
    orderKeys.add(orderKey);
    const calculated = (sale.items || []).reduce((sum,item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
    if (Math.abs(calculated - Number(sale.total || 0)) > 0.01) errors.push(`El total del pedido ${sale.orderNumber} no coincide con sus productos.`);
    if (sale.status === 'confirmed' && !sessionIds.has(sale.cashSessionId)) errors.push(`El pedido ${sale.orderNumber} no tiene una sesión de caja válida.`);
    if (!['confirmed','cancelled'].includes(sale.status)) warnings.push(`El pedido ${sale.orderNumber} tiene un estado no reconocido.`);
  });
  const openByDate = new Map();
  sessions.filter(item => !item.closedAt).forEach(item => openByDate.set(item.date, (openByDate.get(item.date) || 0) + 1));
  for (const [date, count] of openByDate) if (count > 1) errors.push(`Hay ${count} cajas abiertas en la fecha ${date}.`);
  const invalidQueues = queues.filter(item => !item.entity || !item.payload || !item.status);
  if (invalidQueues.length) warnings.push(`${invalidQueues.length} registro(s) de sincronización necesitan revisión.`);
  const pending = queues.filter(item => item.status === 'pending').length;
  if (pending) warnings.push(`${pending} cambio(s) están pendientes de sincronizar con Supabase cuando se conecte.`);
  if (!movements.length && sales.length) warnings.push('Hay ventas antiguas sin movimientos de caja; corresponden a la migración inicial y no se eliminaron.');
  const clients = await getAllRecords('clients');
  const clientMovements = await getAllRecords('clientPayments');
  for (const client of clients) {
    const calculated = clientMovements.filter(item=>item.clientId===client.id).reduce((sum,item)=>sum + (item.type==='charge'?Number(item.amount||0):-Number(item.amount||0)),0);
    if (Math.abs(calculated - Number(client.balance||0)) > 0.01) warnings.push(`El saldo de ${client.name} no coincide con su historial.`);
  }
  const catalog = await getAllRecords('productCatalog');
  const ids = new Set();
  catalog.forEach(item=>{ if(ids.has(item.id)) errors.push(`Producto duplicado: ${item.id}.`); ids.add(item.id); if(!Number.isFinite(Number(item.price))) errors.push(`Precio inválido en ${item.name}.`); });
  await repairOrderCounters();
  const report = { checkedAt:nowIso(), errors, warnings, counts:{sales:sales.length,sessions:sessions.length,movements:movements.length,queues:queues.length} };
  await putRecord('appMeta', { id:'last-health-check', ...report });
  return report;
}

async function showHealthReport() {
  toast('Verificando datos…');
  const report = await verifyDataIntegrity();
  const status = report.errors.length ? 'Se encontraron observaciones importantes' : 'La estructura local está íntegra';
  const errorList = report.errors.length ? `<div class="health-section danger"><h3>Errores</h3>${report.errors.map(item => `<p>• ${escapeHTML(item)}</p>`).join('')}</div>` : '<div class="health-section success"><h3>Sin errores críticos</h3><p>No se detectaron duplicaciones ni totales inconsistentes.</p></div>';
  const warningList = report.warnings.length ? `<div class="health-section warning"><h3>Advertencias</h3>${report.warnings.map(item => `<p>• ${escapeHTML(item)}</p>`).join('')}</div>` : '';
  $('healthContent').innerHTML = `<div class="health-summary"><strong>${escapeHTML(status)}</strong><span>${report.counts.sales} ventas · ${report.counts.sessions} cajas · ${report.counts.queues} eventos de sincronización</span></div>${errorList}${warningList}`;
  $('healthDialog').showModal();
  if ($('moduleView').classList.contains('active')) await renderModule('settings');
}

async function storageState() {
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
  return { persisted, usage:estimate.usage || 0, quota:estimate.quota || 0 };
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return toast('Este navegador no permite solicitar protección adicional.');
  const granted = await navigator.storage.persist();
  await updateStorageStatus();
  toast(granted ? 'El navegador protegió el almacenamiento local.' : 'El navegador no concedió protección permanente. Mantén respaldos descargados.', 4600);
  if ($('moduleView').classList.contains('active')) await renderModule('settings');
}

async function updateStorageStatus() {
  const state = await storageState();
  $('storageStatus').textContent = state.persisted ? 'Protección local: activa' : 'Protección local: normal';
}

async function refreshStatus() {
  const queue=await getAllRecords('syncQueue');
  const pending=queue.filter(item=>item.status==='pending'||item.status==='error').length;
  const network=navigator.onLine?'En línea':'Sin internet';
  const remote=authContext ? (authContext.offline?'sesión local':`${roleLabel(authContext.role)} conectado`) : 'sin sesión';
  $('syncStatus').textContent=`● ${network} · ${remote} · ${pending} pendiente${pending===1?'':'s'}`;
  $('syncStatus').className=navigator.onLine?'online':'offline';
  updateAuthenticatedUI();
}

function notifyOtherTabs(type) {
  broadcastChannel?.postMessage({ type, at:nowIso() });
}

function showSideMenu() {
  $('sideMenu').classList.add('open');
  $('menuBackdrop').classList.add('show');
}

function closeSideMenu() {
  $('sideMenu').classList.remove('open');
  $('menuBackdrop').classList.remove('show');
}

function renderSideLinks() {
  const restricted = new Set(['clients','products','recipes','inventory','market','purchases','expenses','reports','users','settings']);
  const visibleModules = authContext?.role === 'helper' ? modules.filter(module => !restricted.has(module[0])) : modules;
  $('sideLinks').innerHTML = `<button data-module="sales"><i>⌂</i>Venta rápida</button>` + visibleModules.map(module =>
    `<button data-module="${escapeHTML(module[0])}"><i>${module[1]}</i>${escapeHTML(module[2])}</button>`
  ).join('');
  $('sideLinks').querySelectorAll('button').forEach(button => {
    button.onclick = () => { navigate(button.dataset.module); closeSideMenu(); };
  });
}

function navigate(module) {
  const restricted = new Set(['clients','products','recipes','inventory','market','purchases','expenses','reports','users','settings']);
  if (authContext?.role === 'helper' && restricted.has(module)) return toast('Este módulo requiere autorización de la propietaria o del administrador.');
  currentModuleKey = module;
  if (history.replaceState) history.replaceState(null, '', module === 'sales' ? '#sales' : `#${module}`);
  document.querySelectorAll('.bottom-nav button').forEach(button => button.classList.toggle('active', button.dataset.module === module));
  if (module === 'sales') {
    $('moduleView').classList.remove('active');
    $('salesView').classList.add('active');
    return;
  }
  if (module === 'more') return showSideMenu();
  renderModule(module).catch(error => {
    console.error(error);
    toast('No se pudo abrir el módulo.', 3800);
  });
}

async function renderOrdersModule() {
  const sales = (await salesForDate(localDateKey(), true)).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!sales.length) return '<div class="module-card"><h3>Aún no hay pedidos hoy</h3><p>Los pedidos confirmados aparecerán aquí.</p></div>';
  return `<div class="orders-list">${sales.map(sale => `<article class="order-row ${sale.status === 'cancelled' ? 'cancelled' : ''}">
    <div class="order-main"><span class="status-chip ${sale.status}">${sale.status === 'cancelled' ? 'Anulado' : 'Confirmado'}</span><b>Pedido ${String(sale.orderNumber).padStart(3,'0')}</b><small>${new Date(sale.createdAt).toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'})} · ${escapeHTML(sale.orderType)} · ${escapeHTML(sale.payment)}</small></div>
    <strong>${money(sale.total)}</strong>
    <div class="order-actions"><button class="button-light reprint-sale" data-id="${sale.id}">Reimprimir</button>${sale.status === 'confirmed' ? `<button class="danger-button annul-sale" data-id="${sale.id}">Anular</button>` : ''}</div>
  </article>`).join('')}</div>`;
}


async function renderClientsModule() {
  const clients = (await getAllRecords('clients')).sort((a,b) => String(a.name).localeCompare(String(b.name), 'es'));
  const payments = await getAllRecords('clientPayments');
  const totalDebt = clients.reduce((sum,item) => sum + Number(item.balance || 0), 0);
  const rows = clients.length ? clients.map(client => {
    const historyCount = payments.filter(item => item.clientId === client.id).length;
    return `<article class="client-row">
      <div class="client-avatar">${escapeHTML((client.name || '?').slice(0,1).toUpperCase())}</div>
      <div class="client-main"><b>${escapeHTML(client.name)}</b><small>${escapeHTML(client.phone || 'Sin teléfono')} · ${client.creditAllowed ? 'Fiado autorizado' : 'Sin autorización de fiado'}</small><span>${historyCount} movimiento(s)</span></div>
      <div class="client-balance"><small>Saldo</small><strong>${money(client.balance || 0)}</strong></div>
      <div class="client-actions"><button class="button-light edit-client" data-id="${client.id}">Editar</button>${client.creditAllowed ? `<button class="secondary-action charge-client" data-id="${client.id}">Consumo fiado</button>` : ''}<button class="primary-action pay-client" data-id="${client.id}" ${Number(client.balance || 0) <= 0 ? 'disabled' : ''}>Registrar abono</button></div>
    </article>`;
  }).join('') : '<div class="empty-state">Todavía no hay clientes registrados.</div>';
  return `<div class="module-summary"><div><small>Clientes registrados</small><strong>${clients.length}</strong></div><div><small>Deuda total</small><strong>${money(totalDebt)}</strong></div><button id="newClientBtn" class="primary-action">＋ Nuevo cliente</button></div><div class="clients-list">${rows}</div>`;
}

function openClientDialog(client = null) {
  $('clientDialogTitle').textContent = client ? 'Editar cliente' : 'Nuevo cliente';
  $('clientId').value = client?.id || '';
  $('clientName').value = client?.name || '';
  $('clientPhone').value = client?.phone || '';
  $('clientNote').value = client?.note || '';
  $('clientCreditAllowed').checked = Boolean(client?.creditAllowed);
  $('clientDialog').showModal();
}

async function saveClient(event) {
  event.preventDefault();
  if (!canManageBusiness()) return toast('Solo la propietaria o el administrador pueden modificar clientes.');
  const id = $('clientId').value || uid();
  const existing = await getRecord('clients', id);
  const client = {
    ...(existing || {}), id, name:$('clientName').value.trim(), phone:$('clientPhone').value.trim(),
    note:$('clientNote').value.trim(), creditAllowed:$('clientCreditAllowed').checked,
    balance:Number(existing?.balance || 0), active:true,
    createdAt:existing?.createdAt || nowIso(), updatedAt:nowIso(), appVersion:APP_VERSION
  };
  if (!client.name) return toast('Ingresa el nombre del cliente.');
  const transaction = db.transaction(['clients','syncQueue','auditLogs'], 'readwrite');
  transaction.objectStore('clients').put(client);
  transaction.objectStore('syncQueue').put(queueRecord('clients', client));
  transaction.objectStore('auditLogs').put({id:uid(),action:existing?'client_updated':'client_created',entity:'clients',entityId:id,details:{name:client.name,creditAllowed:client.creditAllowed},createdAt:nowIso(),appVersion:APP_VERSION});
  await transactionPromise(transaction);
  $('clientDialog').close();
  scheduleAutoBackup('actualización de clientes');
  await renderModule('clients');
  await refreshStatus();
  toast('Cliente guardado correctamente.');
}

async function openClientTransaction(clientId, type) {
  if (!canManageBusiness()) return toast('Este movimiento requiere autorización de la propietaria o del administrador.');
  const client = await getRecord('clients', clientId);
  if (!client) return toast('No se encontró al cliente.');
  if (type === 'charge' && !client.creditAllowed) return toast('Este cliente no está autorizado para fiado.');
  $('clientTxnClientId').value = client.id;
  $('clientTxnType').value = type;
  $('clientTxnTitle').textContent = type === 'charge' ? `Consumo fiado · ${client.name}` : `Registrar abono · ${client.name}`;
  $('clientTxnBalanceText').textContent = `Saldo actual: ${money(client.balance || 0)}`;
  $('clientTxnAmount').value = '';
  $('clientTxnDetail').value = '';
  $('clientTxnMethodLabel').hidden = type === 'charge';
  $('clientTxnDialog').showModal();
}

async function saveClientTransaction(event) {
  event.preventDefault();
  if (!canManageBusiness()) return toast('Este movimiento requiere autorización de la propietaria o del administrador.');
  const clientId = $('clientTxnClientId').value;
  const type = $('clientTxnType').value;
  const amount = Number($('clientTxnAmount').value);
  if (!Number.isFinite(amount) || amount <= 0) return toast('Ingresa un monto válido.');
  await withAppLock('client-account', async () => {
    const transaction = db.transaction(['clients','clientPayments','syncQueue','auditLogs'], 'readwrite');
    const clientsStore = transaction.objectStore('clients');
    const client = await requestPromise(clientsStore.get(clientId));
    if (!client) throw new Error('El cliente ya no existe.');
    if (type === 'charge' && !client.creditAllowed) throw new Error('El cliente no está autorizado para fiado.');
    const currentBalance = Number(client.balance || 0);
    const applied = type === 'payment' ? Math.min(amount, currentBalance) : amount;
    if (type === 'payment' && currentBalance <= 0) throw new Error('El cliente no tiene saldo pendiente.');
    client.balance = type === 'charge' ? currentBalance + applied : currentBalance - applied;
    client.updatedAt = nowIso();
    const movement = {
      id:uid(), clientId, type, amount:applied, requestedAmount:amount,
      method:type === 'payment' ? $('clientTxnMethod').value : 'Fiado',
      detail:$('clientTxnDetail').value.trim(), date:localDateKey(), createdAt:nowIso(), appVersion:APP_VERSION
    };
    clientsStore.put(client);
    transaction.objectStore('clientPayments').put(movement);
    transaction.objectStore('syncQueue').put(queueRecord('clients', client));
    transaction.objectStore('syncQueue').put(queueRecord('clientPayments', movement));
    transaction.objectStore('auditLogs').put({id:uid(),action:type === 'charge' ? 'credit_charge_created':'client_payment_created',entity:'clients',entityId:clientId,details:{amount:applied,balance:client.balance},createdAt:nowIso(),appVersion:APP_VERSION});
    await transactionPromise(transaction);
  });
  $('clientTxnDialog').close();
  scheduleAutoBackup('movimiento de cliente');
  await renderModule('clients');
  await refreshStatus();
  toast(type === 'charge' ? 'Consumo fiado registrado.' : 'Abono registrado correctamente.');
}

async function renderProductsAdminModule() {
  const rows = products.map(product => `<article class="admin-product-row ${product.active === false ? 'inactive' : ''}">
    <div class="admin-product-icon">${escapeHTML(product.emoji || '🍽️')}</div><div><b>${escapeHTML(product.name)}</b><small>${escapeHTML(product.category)} · ${product.status === 'soldout' ? 'Agotado' : product.status === 'low' ? 'Poco stock' : 'Disponible'}${product.active === false ? ' · Oculto' : ''}</small></div><strong>${money(product.price)}</strong><button class="button-light edit-product" data-id="${product.id}">Editar</button>
  </article>`).join('');
  return `<div class="module-summary"><div><small>Productos configurados</small><strong>${products.length}</strong></div><div><small>Visibles en venta</small><strong>${products.filter(item=>item.active!==false).length}</strong></div><button id="newProductBtn" class="primary-action">＋ Nuevo producto</button></div><div class="admin-products-list">${rows}</div>`;
}

function slugifyProduct(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40) || `producto-${Date.now()}`;
}

function openProductDialog(product = null) {
  $('productDialogTitle').textContent = product ? 'Editar producto' : 'Nuevo producto';
  $('productId').value = product?.id || '';
  $('productName').value = product?.name || '';
  $('productPrice').value = Number(product?.price || 0);
  $('productCategory').value = product?.category || 'Menú';
  $('productDesc').value = product?.desc || '';
  $('productBadge').value = product?.badge || '';
  $('productEmoji').value = product?.emoji || '🍽️';
  $('productStatus').value = product?.status || 'available';
  $('productActive').checked = product?.active !== false;
  $('productDialog').showModal();
}

async function saveProduct(event) {
  event.preventDefault();
  if (!canManageBusiness()) return toast('Solo la propietaria o el administrador pueden modificar productos.');
  const name = $('productName').value.trim();
  if (!name) return toast('Ingresa el nombre del producto.');
  const requestedId = $('productId').value;
  const id = requestedId || `${slugifyProduct(name)}-${Date.now().toString(36)}`;
  const existing = await getRecord('productCatalog', id);
  const maxOrder = Math.max(0, ...products.map(item => Number(item.sortOrder || 0)));
  const product = {
    ...(existing || {}), id, name, price:Number($('productPrice').value || 0), category:$('productCategory').value,
    desc:$('productDesc').value.trim(), badge:$('productBadge').value.trim() || 'Good King',
    emoji:$('productEmoji').value.trim() || '🍽️', status:$('productStatus').value,
    active:$('productActive').checked, sortOrder:existing?.sortOrder || maxOrder + 1,
    createdAt:existing?.createdAt || nowIso(), updatedAt:nowIso(), appVersion:APP_VERSION
  };
  const transaction = db.transaction(['productCatalog','syncQueue','auditLogs'], 'readwrite');
  transaction.objectStore('productCatalog').put(product);
  transaction.objectStore('syncQueue').put(queueRecord('productCatalog', product));
  transaction.objectStore('auditLogs').put({id:uid(),action:existing?'product_updated':'product_created',entity:'productCatalog',entityId:id,details:{name,price:product.price,status:product.status},createdAt:nowIso(),appVersion:APP_VERSION});
  await transactionPromise(transaction);
  await ensureDefaultCatalog();
  $('productDialog').close();
  renderProducts();
  await renderModule('products');
  await refreshStatus();
  scheduleAutoBackup('actualización de productos');
  toast('Producto guardado correctamente.');
}


function roleLabel(role) {
  return ({admin:'Administrador', owner:'Propietaria', helper:'Ayudante'})[role] || 'Usuario';
}

function canManageBusiness() {
  return ['admin','owner'].includes(authContext?.role);
}

function setAuthPanel(panel) {
  ['connectionSetupForm','loginForm','authLoadingPanel'].forEach(id => { if ($(id)) $(id).hidden = id !== panel; });
}

function showAuthGate(message = 'Inicia sesión para continuar.') {
  $('authMessage').textContent = message;
  $('authGate').classList.remove('hidden');
  $('app').setAttribute('aria-hidden','true');
}

function hideAuthGate() {
  $('authGate').classList.add('hidden');
  $('app').removeAttribute('aria-hidden');
}


function fetchWithTimeout(url, options = {}, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {...options, cache: options.cache || 'no-store', signal: controller.signal})
    .finally(() => clearTimeout(timer));
}

function isFetchFailure(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return error?.name === 'AbortError' || text.includes('failed to fetch') || text.includes('network') || text.includes('load failed');
}

function friendlyConnectionError(error) {
  if (error?.name === 'AbortError') return `Supabase no respondió dentro de 12 segundos. Proyecto: ${runtimeSupabaseConfig.projectRef || OFFICIAL_SUPABASE_PROJECT_REF}.`;
  if (isFetchFailure(error)) return `No se pudo llegar a ${activeSupabaseUrl()}. Usa “Restablecer conexión oficial” y vuelve a probar.`;
  return String(error?.message || error || 'Error de conexión desconocido.');
}

async function checkSupabaseHealth() {
  const url = activeSupabaseUrl();
  const key = activeSupabaseKey();
  if (!url || !key) throw new Error('La URL o la clave pública de Supabase no están configuradas.');
  const startedAt = performance.now();
  const response = await fetchWithTimeout(`${url}/auth/v1/health`, {
    method:'GET',
    headers:{apikey:key,Accept:'application/json'}
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = {raw:text.slice(0,240)}; }
  if (!response.ok) throw new Error(`Supabase respondió HTTP ${response.status}. ${payload?.message || payload?.msg || ''}`.trim());
  return {ok:true,status:response.status,latencyMs:Math.round(performance.now()-startedAt),payload};
}

async function directPasswordLogin(email, password) {
  const url = activeSupabaseUrl();
  const key = activeSupabaseKey();
  const response = await fetchWithTimeout(`${url}/auth/v1/token?grant_type=password`, {
    method:'POST',
    headers:{apikey:key,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({email,password})
  });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(payload?.msg || payload?.message || payload?.error_description || `Supabase respondió HTTP ${response.status}.`);
  if (!payload?.access_token || !payload?.refresh_token) throw new Error('Supabase respondió sin una sesión válida.');
  const client = createSupabaseClient();
  const {data,error} = await client.auth.setSession({access_token:payload.access_token,refresh_token:payload.refresh_token});
  if (error) throw error;
  return data;
}

async function runConnectionDiagnostic({showToast=true} = {}) {
  const target = $('authDiagnosticResult');
  if (target) { target.hidden=false; target.className='connection-result'; target.textContent='Comprobando el dominio de Supabase…'; }
  try {
    const health = await checkSupabaseHealth();
    const message = `Conexión correcta con Supabase (${health.latencyMs} ms). Auth: ${health.payload?.name || 'disponible'} ${health.payload?.version || ''}`.trim();
    if (target) { target.textContent=message; target.className='connection-result success'; }
    if (showToast) toast('Conexión con Supabase correcta.');
    await putRecord('appMeta',{id:'last-supabase-health',checkedAt:nowIso(),...health});
    return health;
  } catch (error) {
    const message = friendlyConnectionError(error);
    if (target) { target.textContent=message; target.className='connection-result error'; }
    if (showToast) toast(message,6200);
    await logAppError('supabase-health',error,{url:activeSupabaseUrl(),projectRef:runtimeSupabaseConfig.projectRef});
    throw error;
  }
}

function versionParts(version) {
  return String(version || '0').split('.').map(part => Number.parseInt(part,10) || 0);
}

function compareVersions(a,b) {
  const left=versionParts(a), right=versionParts(b);
  for(let i=0;i<Math.max(left.length,right.length);i++) {
    const diff=(left[i]||0)-(right[i]||0);
    if(diff) return diff;
  }
  return 0;
}

async function getPublishedVersion() {
  const response = await fetchWithTimeout(`${VERSION_ENDPOINT}?t=${Date.now()}`, {cache:'no-store'}, 10000);
  if (!response.ok) throw new Error(`No se pudo consultar la versión publicada (HTTP ${response.status}).`);
  return response.json();
}

async function checkForAppUpdate({interactive=true,apply=false} = {}) {
  if (interactive) toast('Buscando actualización…');
  try {
    if ('serviceWorker' in navigator) {
      swRegistration = swRegistration || await navigator.serviceWorker.getRegistration('./');
      await swRegistration?.update();
      if (swRegistration?.waiting) revealUpdateReady(swRegistration);
    }
    const published = await getPublishedVersion();
    const newer = compareVersions(published.version,APP_VERSION) > 0;
    if (newer || swRegistration?.waiting) {
      updateReady=true;
      $('updateAppBtn').hidden=false;
      const message=`Versión ${published.version || 'nueva'} disponible.`;
      if (interactive) toast(`${message} Presiona Actualizar.`,5200);
      if (apply) await applyAppUpdate();
      return {updateAvailable:true,published};
    }
    if (interactive) toast(`Good King está actualizado (V${APP_VERSION}).`);
    return {updateAvailable:false,published};
  } catch (error) {
    if (interactive) toast(`No se pudo comprobar la actualización: ${friendlyConnectionError(error)}`,6200);
    await logAppError('update-check',error);
    return {updateAvailable:false,error};
  }
}

async function forceAppRefresh() {
  if (!confirm('Se reparará la actualización sin borrar ventas, caja, clientes ni IndexedDB. ¿Continuar?')) return;
  try {
    if (db) await createAutoBackup('antes de reparar actualización').catch(()=>{});
    const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    await Promise.all(registrations.map(registration=>registration.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('good-king-')).map(key=>caches.delete(key)));
    const next = new URL('./index.html',location.href);
    next.searchParams.set('actualizar',Date.now());
    location.replace(next.href);
  } catch (error) {
    await logAppError('force-update-repair',error);
    toast(`No se pudo reparar la actualización: ${error.message || error}`,6200);
  }
}

async function seedSupabaseConfig() {
  const current = await getRecord('settings','supabase-config');
  const normalized = normalizeSupabaseConfig(current?.value || {url:OFFICIAL_SUPABASE_URL,anonKey:OFFICIAL_SUPABASE_PUBLISHABLE_KEY,enabled:true,managed:true});
  // Saneamiento V0.5.2: corrige la URL mal escrita de V0.5/V0.5.1 sin borrar una configuración futura válida.
  const originalUrl = String(current?.value?.url || '').trim().replace(/\/+$/, '');
  const wasWrong = !originalUrl || LEGACY_WRONG_SUPABASE_URLS.has(originalUrl);
  const finalConfig = wasWrong ? normalizeSupabaseConfig({...normalized,url:OFFICIAL_SUPABASE_URL,anonKey:OFFICIAL_SUPABASE_PUBLISHABLE_KEY,managed:true,migratedFromBadUrl:Boolean(originalUrl),migratedAt:nowIso()}) : normalized;
  setRuntimeSupabaseConfig(finalConfig);
  const changed = !current || current.value?.url !== finalConfig.url || normalizeSupabaseKey(current.value?.anonKey) !== finalConfig.anonKey || Boolean(current.value?.enabled) !== Boolean(finalConfig.enabled);
  if (changed) await putRecord('settings', {id:'supabase-config', value:{...finalConfig,updatedAt:nowIso()}, updatedAt:nowIso()});
  return finalConfig;
}

function createSupabaseClient() {
  const config = validateSupabaseConfig(runtimeSupabaseConfig);
  const signature = `${config.url}|${config.anonKey}`;
  if (supabaseClient && supabaseClientSignature === signature) return supabaseClient;
  if (!window.supabase?.createClient) throw new Error('No se pudo cargar el cliente de Supabase. Comprueba la conexión y vuelve a abrir Good King.');
  supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'good-king-auth-v052'}
  });
  supabaseClientSignature = signature;
  return supabaseClient;
}

async function cacheAuthContext(context) {
  await putRecord('settings',{id:'auth-context',value:{...context,cachedAt:nowIso()},updatedAt:nowIso()});
  await putRecord('settings',{id:'offline-auth-disabled',value:false,updatedAt:nowIso()});
}

async function getCachedAuthContext() {
  return (await getRecord('settings','auth-context'))?.value || null;
}

async function loadRemoteUserContext(session, allowCache = true) {
  if (!session?.user?.id) throw new Error('La sesión de usuario no es válida.');
  try {
    const client = createSupabaseClient();
    const {data:member,error:memberError} = await client.from('business_members').select('business_id, role, active').eq('user_id',session.user.id).eq('active',true).maybeSingle();
    if (memberError) throw memberError;
    if (!member) throw new Error('El usuario no está asignado al negocio Good King.');
    const [{data:business,error:businessError},{data:profile,error:profileError}] = await Promise.all([
      client.from('businesses').select('id,name,slug,timezone,currency_code,active').eq('id',member.business_id).single(),
      client.from('profiles').select('id,display_name,phone,active').eq('id',session.user.id).single()
    ]);
    if (businessError) throw businessError;
    if (profileError) throw profileError;
    if (!business?.active || !profile?.active) throw new Error('El acceso está deshabilitado.');
    const context = {userId:session.user.id,email:session.user.email,businessId:business.id,businessName:business.name,businessSlug:business.slug,role:member.role,displayName:profile.display_name || session.user.email,timezone:business.timezone,currency:business.currency_code,verifiedAt:nowIso(),offline:false};
    await cacheAuthContext(context);
    return context;
  } catch (error) {
    const cached = allowCache ? await getCachedAuthContext() : null;
    if (cached?.userId === session.user.id && (!navigator.onLine || String(error.message || '').toLowerCase().includes('fetch'))) return {...cached,offline:true};
    throw error;
  }
}

async function registerRemoteDevice() {
  if (!supabaseClient || !authSession || !authContext || !navigator.onLine) return;
  const id = await getDeviceId();
  let nameRecord = await getRecord('settings','device-name');
  if (!nameRecord?.value) {
    const platform = /android/i.test(navigator.userAgent) ? 'Celular Android' : /windows/i.test(navigator.userAgent) ? 'Computadora Windows' : 'Dispositivo Good King';
    nameRecord={id:'device-name',value:platform,updatedAt:nowIso()};
    await putRecord('settings',nameRecord);
  }
  const row={id,business_id:authContext.businessId,user_id:authContext.userId,device_name:nameRecord.value,platform:navigator.userAgent.slice(0,180),app_version:APP_VERSION,active:true,last_seen_at:nowIso(),updated_at:nowIso()};
  const {error}=await supabaseClient.from('devices').upsert(row,{onConflict:'id'});
  if (error) throw error;
}

function updateAuthenticatedUI() {
  const label = authContext ? `${authContext.displayName} · ${roleLabel(authContext.role)}` : 'Sin sesión';
  $('userStatus').textContent = label;
  $('userStatus').className = `user-status ${authContext?.offline ? 'offline' : 'online'}`;
  $('sideUserText').textContent = label;
  $('logoutBtn').hidden = !authSession && !authContext;
  renderSideLinks();
}

async function completeAuthentication(session, options={}) {
  authSession=session;
  authContext=await loadRemoteUserContext(session,options.allowCache !== false);
  updateAuthenticatedUI();
  hideAuthGate();
  if (navigator.onLine && !authContext.offline) {
    await registerRemoteDevice().catch(error=>logAppError('device-register',error));
    syncPendingRecords().catch(console.error);
  }
}

async function bootstrapAuthentication() {
  showAuthGate('Verificando sesión y permisos…');
  setAuthPanel('authLoadingPanel');
  await seedSupabaseConfig();
  try {
    const client=createSupabaseClient();
    if (authSubscription) authSubscription.unsubscribe?.();
    const {data:sub}=client.auth.onAuthStateChange((event,session)=>{
      if (event==='SIGNED_OUT') {
        authSession=null; authContext=null; updateAuthenticatedUI(); showAuthGate('La sesión fue cerrada.'); setAuthPanel('loginForm');
      }
    });
    authSubscription=sub.subscription;
    const {data:{session},error}=await client.auth.getSession();
    if (error) throw error;
    if (session) {
      await completeAuthentication(session);
      return;
    }
    const cached=await getCachedAuthContext();
    const disabled=(await getRecord('settings','offline-auth-disabled'))?.value === true;
    $('offlineAccessBtn').hidden=!cached || disabled || navigator.onLine;
    $('loginEmail').value=(await getRecord('settings','last-login-email'))?.value || ADMIN_EMAIL;
    showAuthGate('Ingresa con uno de los usuarios autorizados.');
    setAuthPanel('loginForm');
  } catch (error) {
    await logAppError('auth-bootstrap',error);
    const cached=await getCachedAuthContext();
    const disabled=(await getRecord('settings','offline-auth-disabled'))?.value === true;
    if (cached && !disabled) {
      authContext={...cached,offline:true}; authSession=null; updateAuthenticatedUI();
      $('offlineAccessBtn').hidden=false;
      showAuthGate(navigator.onLine ? 'No se pudo verificar en línea. Puedes continuar con el último acceso verificado.' : 'Sin internet. Puedes continuar con el último acceso verificado.'); setAuthPanel('loginForm');
    } else {
      $('loginResult').textContent=error.message || 'No se pudo verificar la sesión.';
      $('loginResult').className='connection-result error';
      showAuthGate('No se pudo completar la verificación.'); setAuthPanel('loginForm');
    }
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email=$('loginEmail').value.trim().toLowerCase();
  const password=$('loginPassword').value;
  const button=$('loginBtn');
  if (!email || !password) return;
  button.disabled=true; button.textContent='Ingresando…';
  $('loginResult').textContent='Verificando usuario y negocio…'; $('loginResult').className='connection-result';
  try {
    const client=createSupabaseClient();
    let data=null;
    try {
      const result=await client.auth.signInWithPassword({email,password});
      if (result.error) throw result.error;
      data=result.data;
    } catch (firstError) {
      if (!isFetchFailure(firstError)) throw firstError;
      await runConnectionDiagnostic({showToast:false});
      data=await directPasswordLogin(email,password);
    }
    if (!data?.session) throw new Error('Supabase no devolvió una sesión válida.');
    await putRecord('settings',{id:'last-login-email',value:email,updatedAt:nowIso()});
    await completeAuthentication(data.session,{allowCache:false});
    $('loginPassword').value='';
    $('loginResult').textContent='Acceso correcto.'; $('loginResult').className='connection-result success';
    toast(`Bienvenido, ${authContext.displayName}.`);
  } catch (error) {
    const message=isFetchFailure(error) ? friendlyConnectionError(error) : (error.message || 'No se pudo iniciar sesión.');
    $('loginResult').textContent=message; $('loginResult').className='connection-result error';
    await logAppError('auth-login',error,{email});
  } finally {button.disabled=false;button.textContent='Ingresar';}
}

async function continueOffline() {
  const cached=await getCachedAuthContext();
  if (!cached) return toast('No existe un acceso verificado en este dispositivo.');
  authContext={...cached,offline:true}; authSession=null; updateAuthenticatedUI(); hideAuthGate();
  toast('Modo sin conexión: los cambios quedarán pendientes de sincronización.',4200);
}

async function logoutUser() {
  if (!confirm('¿Cerrar la sesión de Good King en este dispositivo?')) return;
  await putRecord('settings',{id:'offline-auth-disabled',value:true,updatedAt:nowIso()});
  try { if (supabaseClient) await supabaseClient.auth.signOut(); } catch (_) {}
  authSession=null;authContext=null;updateAuthenticatedUI();showAuthGate('Sesión cerrada.');setAuthPanel('loginForm');
}

async function ensureAuthSession() {
  if (authSession?.access_token) return authSession;
  if (!supabaseClient) return null;
  const {data:{session}}=await supabaseClient.auth.getSession();
  authSession=session;
  return session;
}

async function getRemoteCategoryMap() {
  if (remoteCategoryMap) return remoteCategoryMap;
  const {data,error}=await supabaseClient.from('product_categories').select('id,code,name').eq('business_id',authContext.businessId).eq('active',true);
  if (error) throw error;
  remoteCategoryMap=Object.fromEntries((data||[]).map(item=>[item.code,item.id]));
  return remoteCategoryMap;
}

function categoryCode(category) {
  return category==='Bebidas'?'drinks':category==='Extras'?'extras':'menu';
}

async function ensureProductRemoteId(product) {
  if (product.remoteId) return product;
  const updated={...product,remoteId:uid(),updatedAt:nowIso()};
  await putRecord('productCatalog',updated);
  products=products.map(item=>item.id===updated.id?updated:item);
  return updated;
}

async function ensureSaleItemRemoteIds(sale) {
  let changed=false;
  const items=(sale.items||[]).map(item=>{if(item.remoteId)return item;changed=true;return {...item,remoteId:uid()};});
  if (!changed) return sale;
  const updated={...sale,items,updatedAt:sale.updatedAt||nowIso()};
  await putRecord('sales',updated);
  return updated;
}

async function pushQueueItem(item, deviceId) {
  const client=supabaseClient, businessId=authContext.businessId, userId=authContext.userId;
  let payload=item.payload;
  if (item.entity==='cashSessions') {
    const row={id:payload.id,business_id:businessId,business_date:payload.date,opening_amount:Number(payload.openingAmount||0),expected_cash:payload.expectedAmount==null?null:Number(payload.expectedAmount),counted_cash:payload.closingAmount==null?null:Number(payload.closingAmount),difference:payload.difference==null?null:Number(payload.difference),next_fund:payload.nextFund==null?null:Number(payload.nextFund),status:payload.status||'open',opened_by:userId,closed_by:payload.status==='closed'?userId:null,device_id:deviceId,opened_at:payload.openedAt,closed_at:payload.closedAt||null,payload:{app_version:payload.appVersion||APP_VERSION},updated_at:payload.updatedAt||nowIso()};
    const {error}=await client.from('cash_sessions').upsert(row,{onConflict:'id'}); if(error)throw error;
  } else if (item.entity==='sales') {
    payload=await ensureSaleItemRemoteIds(payload);
    item.payload=payload;
    const row={id:payload.id,business_id:businessId,cash_session_id:payload.cashSessionId||null,customer_id:payload.customerId||null,business_date:payload.date,order_number:Number(payload.orderNumber),order_type:payload.orderType==='Para llevar'?'takeaway':'table',payment_method:payload.payment==='QR'?'qr':payload.payment==='Fiado'?'credit':'cash',subtotal:Number(payload.total||0),total:Number(payload.total||0),estimated_cost:Number(payload.estimatedCost||0),inventory_consumption:Array.isArray(payload.inventoryConsumption)?payload.inventoryConsumption:[],status:payload.status==='cancelled'?'cancelled':'confirmed',notes:payload.note||null,quick_notes:Array.isArray(payload.quickNotes)?payload.quickNotes:[],cancelled_reason:payload.cancellationReason||null,cancelled_at:payload.cancelledAt||null,created_by:userId,cancelled_by:payload.status==='cancelled'?userId:null,device_id:deviceId,created_at:payload.createdAt,updated_at:payload.updatedAt||nowIso()};
    let {error}=await client.from('sales').upsert(row,{onConflict:'id'}); if(error)throw error;
    const itemRows=(payload.items||[]).map(line=>({id:line.remoteId,business_id:businessId,sale_id:payload.id,product_id:null,product_name:line.name,quantity:Number(line.qty),unit_price:Number(line.price),line_total:Number(line.qty)*Number(line.price),payload:{local_product_id:line.id},updated_at:payload.updatedAt||nowIso()}));
    if(itemRows.length){({error}=await client.from('sale_items').upsert(itemRows,{onConflict:'id'}));if(error)throw error;}
  } else if (item.entity==='clients') {
    const row={id:payload.id,business_id:businessId,name:payload.name,phone:payload.phone||null,notes:payload.note||null,credit_allowed:Boolean(payload.creditAllowed),balance:Number(payload.balance||0),active:payload.active!==false,created_by:userId,device_id:deviceId,created_at:payload.createdAt||nowIso(),updated_at:payload.updatedAt||nowIso()};
    const {error}=await client.from('customers').upsert(row,{onConflict:'id'});if(error)throw error;
  } else if (item.entity==='clientPayments') {
    const row={id:payload.id,business_id:businessId,customer_id:payload.clientId,sale_id:payload.saleId||null,movement_type:payload.type==='charge'?'charge':'payment',amount:Number(payload.amount),payment_method:payload.type==='payment'?(payload.method==='QR'?'qr':'cash'):null,detail:payload.detail||null,created_by:userId,device_id:deviceId,created_at:payload.createdAt||nowIso(),updated_at:payload.updatedAt||nowIso()};
    const {error}=await client.from('customer_credit_movements').upsert(row,{onConflict:'id'});if(error)throw error;
  } else if (item.entity==='productCatalog') {
    payload=await ensureProductRemoteId(payload); item.payload=payload;
    const categories=await getRemoteCategoryMap();
    const row={id:payload.remoteId,business_id:businessId,category_id:categories[categoryCode(payload.category)]||null,name:payload.name,description:payload.desc||null,price:Number(payload.price||0),icon:payload.emoji||null,availability:payload.status==='soldout'?'sold_out':payload.status==='low'?'low_stock':'available',sort_order:Number(payload.sortOrder||0),active:payload.active!==false,payload:{local_id:payload.id,badge:payload.badge||''},created_by:userId,device_id:deviceId,created_at:payload.createdAt||nowIso(),updated_at:payload.updatedAt||nowIso()};
    const {error}=await client.from('products').upsert(row,{onConflict:'id'});if(error)throw error;
  }
  const eventRow={id:item.id,business_id:businessId,device_id:deviceId,user_id:userId,entity:item.entity,entity_id:String(item.entityId),operation:item.operation||'upsert',payload:item.payload||{},sync_status:'processed',created_at:item.createdAt||nowIso(),updated_at:nowIso()};
  const {error:eventError}=await client.from('sync_events').upsert(eventRow,{onConflict:'id'});if(eventError)throw eventError;
}

async function pushUnsyncedAudits(deviceId) {
  if (!canManageBusiness() && authContext?.role!=='helper') return 0;
  const audits=(await getAllRecords('auditLogs')).filter(a=>!a.remoteSyncedAt).slice(0,100);
  let count=0;
  for(const audit of audits){
    const row={id:audit.id,business_id:authContext.businessId,user_id:authContext.userId,device_id:deviceId,action:audit.action,entity:audit.entity,entity_id:String(audit.entityId||''),details:audit.details||{},created_at:audit.createdAt||nowIso()};
    const {error}=await supabaseClient.from('audit_logs').insert(row);
    if(error && error.code!=='23505') throw error;
    audit.remoteSyncedAt=nowIso(); await putRecord('auditLogs',audit); count++;
  }
  return count;
}

async function pullRemoteCoreData() {
  if (!supabaseClient || !authContext || !navigator.onLine) return {pulled:0};
  const pendingIds=new Set((await getAllRecords('syncQueue')).filter(q=>q.status!=='synced').map(q=>`${q.entity}:${q.entityId}`));
  let pulled=0;
  const [{data:cash,error:cashError},{data:sales,error:salesError},{data:customers,error:customersError},{data:credits,error:creditsError},{data:remoteProducts,error:productsError}] = await Promise.all([
    supabaseClient.from('cash_sessions').select('*').eq('business_id',authContext.businessId),
    supabaseClient.from('sales').select('*, sale_items(*)').eq('business_id',authContext.businessId).order('created_at',{ascending:false}).limit(1000),
    supabaseClient.from('customers').select('*').eq('business_id',authContext.businessId),
    supabaseClient.from('customer_credit_movements').select('*').eq('business_id',authContext.businessId).order('created_at',{ascending:false}).limit(1000),
    supabaseClient.from('products').select('*, product_categories(code,name)').eq('business_id',authContext.businessId)
  ]);
  const firstError=[cashError,salesError,customersError,creditsError,productsError].find(Boolean); if(firstError)throw firstError;
  for(const row of cash||[]){if(pendingIds.has(`cashSessions:${row.id}`))continue;await putRecord('cashSessions',{id:row.id,date:row.business_date,openedAt:row.opened_at,openingAmount:Number(row.opening_amount||0),closedAt:row.closed_at,closingAmount:row.counted_cash==null?null:Number(row.counted_cash),expectedAmount:row.expected_cash==null?null:Number(row.expected_cash),difference:row.difference==null?null:Number(row.difference),nextFund:row.next_fund==null?null:Number(row.next_fund),status:row.status,updatedAt:row.updated_at,appVersion:APP_VERSION,remote:true});pulled++;}
  for(const row of sales||[]){if(pendingIds.has(`sales:${row.id}`))continue;await putRecord('sales',{id:row.id,date:row.business_date,orderNumber:Number(row.order_number),orderType:row.order_type==='takeaway'?'Para llevar':'Para la mesa',payment:row.payment_method==='qr'?'QR':row.payment_method==='credit'?'Fiado':'Efectivo',note:row.notes||'',total:Number(row.total||0),estimatedCost:Number(row.estimated_cost||0),inventoryConsumption:Array.isArray(row.inventory_consumption)?row.inventory_consumption:[],status:row.status==='cancelled'?'cancelled':'confirmed',cashSessionId:row.cash_session_id,customerId:row.customer_id,createdAt:row.created_at,updatedAt:row.updated_at,cancelledAt:row.cancelled_at,cancellationReason:row.cancelled_reason,items:(row.sale_items||[]).filter(i=>!i.deleted_at).map(i=>({id:i.payload?.local_product_id||i.product_id||i.id,remoteId:i.id,name:i.product_name,qty:Number(i.quantity),price:Number(i.unit_price)})),appVersion:APP_VERSION,remote:true});pulled++;}
  for(const row of customers||[]){if(pendingIds.has(`clients:${row.id}`))continue;await putRecord('clients',{id:row.id,name:row.name,phone:row.phone||'',note:row.notes||'',creditAllowed:Boolean(row.credit_allowed),balance:Number(row.balance||0),active:row.active!==false,createdAt:row.created_at,updatedAt:row.updated_at,appVersion:APP_VERSION,remote:true});pulled++;}
  for(const row of credits||[]){if(pendingIds.has(`clientPayments:${row.id}`))continue;await putRecord('clientPayments',{id:row.id,clientId:row.customer_id,type:row.movement_type==='charge'?'charge':'payment',amount:Number(row.amount),method:row.payment_method==='qr'?'QR':row.movement_type==='charge'?'Fiado':'Efectivo',detail:row.detail||'',date:String(row.created_at).slice(0,10),createdAt:row.created_at,updatedAt:row.updated_at,appVersion:APP_VERSION,remote:true});pulled++;}
  for(const row of remoteProducts||[]){const localId=row.payload?.local_id||`remote-${row.id}`;if(pendingIds.has(`productCatalog:${localId}`))continue;const category=row.product_categories?.code==='drinks'?'Bebidas':row.product_categories?.code==='extras'?'Extras':'Menú';await putRecord('productCatalog',{id:localId,remoteId:row.id,name:row.name,price:Number(row.price||0),category,desc:row.description||'',badge:row.payload?.badge||'Good King',emoji:row.icon||'🍽️',status:row.availability==='sold_out'?'soldout':row.availability==='low_stock'?'low':'available',active:row.active!==false,sortOrder:Number(row.sort_order||0),createdAt:row.created_at,updatedAt:row.updated_at,appVersion:APP_VERSION,remote:true});pulled++;}
  await ensureDefaultCatalog(); renderProducts();
  await putRecord('remoteSnapshots',{id:'last-pull',updatedAt:nowIso(),counts:{cash:(cash||[]).length,sales:(sales||[]).length,customers:(customers||[]).length,credits:(credits||[]).length,products:(remoteProducts||[]).length}});
  await loadCash(); await repairOrderCounters(); await refreshOrderNumber();
  return {pulled};
}

function normalizeSupabaseUrl(url) {
  let value = String(url || '').trim().replace(/\s+/g,'').replace(/\/+$/, '');
  if (LEGACY_WRONG_SUPABASE_URLS.has(value)) value = OFFICIAL_SUPABASE_URL;
  return value;
}

function normalizeSupabaseKey(key) {
  return String(key || '').replace(/\s+/g,'').trim();
}

function normalizeSupabaseConfig(raw = {}) {
  const url = normalizeSupabaseUrl(raw.url || OFFICIAL_SUPABASE_URL);
  const anonKey = normalizeSupabaseKey(raw.anonKey || raw.publishableKey || OFFICIAL_SUPABASE_PUBLISHABLE_KEY);
  let projectRef = '';
  try { projectRef = new URL(url).hostname.split('.')[0] || ''; } catch (_) {}
  return {
    ...raw,
    url,
    anonKey,
    enabled: raw.enabled !== false,
    managed: raw.managed !== false,
    projectRef
  };
}

function validateSupabaseConfig(config) {
  const normalized = normalizeSupabaseConfig(config);
  if (!normalized.url || !normalized.anonKey) throw new Error('Completa la URL y la clave pública.');
  let parsed;
  try { parsed = new URL(normalized.url); } catch (_) { throw new Error('La URL de Supabase no tiene un formato válido.'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) throw new Error('La URL debe ser HTTPS y terminar en .supabase.co.');
  if (!(normalized.anonKey.startsWith('sb_publishable_') || normalized.anonKey.split('.').length === 3)) throw new Error('La clave no parece una publishable key ni una anon key válida.');
  return normalized;
}

function setRuntimeSupabaseConfig(config, {resetClient=true} = {}) {
  runtimeSupabaseConfig = normalizeSupabaseConfig(config);
  if (resetClient) {
    supabaseClient = null;
    supabaseClientSignature = '';
    remoteCategoryMap = null;
  }
  return runtimeSupabaseConfig;
}

function activeSupabaseUrl() {
  return normalizeSupabaseUrl(runtimeSupabaseConfig.url || OFFICIAL_SUPABASE_URL);
}

function activeSupabaseKey() {
  return normalizeSupabaseKey(runtimeSupabaseConfig.anonKey || OFFICIAL_SUPABASE_PUBLISHABLE_KEY);
}

async function getSupabaseConfig() {
  const stored = (await getRecord('settings', 'supabase-config'))?.value;
  const normalized = normalizeSupabaseConfig(stored || runtimeSupabaseConfig || {url:OFFICIAL_SUPABASE_URL,anonKey:OFFICIAL_SUPABASE_PUBLISHABLE_KEY,enabled:true,managed:true});
  setRuntimeSupabaseConfig(normalized,{resetClient:false});
  return normalized;
}

async function testSupabaseConnection(config = null) {
  const normalized = validateSupabaseConfig(config || await getSupabaseConfig());
  const startedAt=performance.now();
  const response = await fetchWithTimeout(`${normalized.url}/auth/v1/health`, {
    method:'GET', headers:{apikey:normalized.anonKey,Accept:'application/json'}
  });
  const text = await response.text();
  let payload={};
  try { payload=text?JSON.parse(text):{}; } catch (_) { payload={raw:text.slice(0,240)}; }
  if (!response.ok) throw new Error(`Supabase respondió HTTP ${response.status}: ${payload?.message || payload?.msg || 'verifica URL y clave'}.`);
  return {ok:true,checkedAt:nowIso(),status:response.status,latencyMs:Math.round(performance.now()-startedAt),version:payload?.version || null,projectRef:normalized.projectRef,url:normalized.url};
}

async function saveSupabaseConfig(event) {
  event.preventDefault();
  const previous = await getSupabaseConfig();
  let config;
  try {
    config = validateSupabaseConfig({
      ...previous,
      url:$('supabaseUrl').value,
      anonKey:$('supabaseAnonKey').value,
      enabled:$('supabaseEnabled').checked,
      managed:false,
      updatedAt:nowIso()
    });
    if (config.enabled) config.lastTest = await testSupabaseConnection(config);
  } catch (error) {
    $('supabaseTestResult').textContent=friendlyConnectionError(error);
    $('supabaseTestResult').className='connection-result error';
    await logAppError('supabase-config-save',error,{url:normalizeSupabaseUrl($('supabaseUrl').value)});
    return toast(`No se guardó la conexión: ${friendlyConnectionError(error)}`,6200);
  }
  setRuntimeSupabaseConfig(config);
  await putRecord('settings', {id:'supabase-config', value:config, updatedAt:nowIso()});
  await writeAudit('supabase_config_updated','settings','supabase-config',{enabled:config.enabled,url:config.url,projectRef:config.projectRef});
  $('supabaseDialog').close();
  await refreshStatus();
  if (authContext) await renderModule('settings');
  toast('Conexión de Supabase guardada y verificada.');
  if (config.enabled && navigator.onLine && authContext) syncPendingRecords().catch(console.error);
}

async function openSupabaseDialog() {
  const config = await getSupabaseConfig();
  $('supabaseUrl').value = config.url;
  $('supabaseAnonKey').value = config.anonKey;
  $('supabaseEnabled').checked = Boolean(config.enabled);
  $('supabaseProjectHint').textContent = `Proyecto detectado: ${config.projectRef || 'sin referencia'} · Oficial: ${OFFICIAL_SUPABASE_PROJECT_REF}`;
  $('supabaseTestResult').textContent = config.lastTest?.ok ? `Última prueba correcta: ${new Date(config.lastTest.checkedAt).toLocaleString('es-BO')} · HTTP ${config.lastTest.status}` : 'Todavía no se probó la conexión guardada.';
  $('supabaseTestResult').className = config.lastTest?.ok ? 'connection-result success' : 'connection-result';
  $('supabaseDialog').showModal();
}

async function handleSupabaseTest() {
  const button = $('testSupabaseBtn');
  const result = $('supabaseTestResult');
  button.disabled = true;
  result.textContent = 'Validando URL, clave y servicio Auth…';
  result.className='connection-result';
  try {
    const config = validateSupabaseConfig({url:$('supabaseUrl').value,anonKey:$('supabaseAnonKey').value,enabled:$('supabaseEnabled').checked});
    const test = await testSupabaseConnection(config);
    result.textContent = `Conexión correcta · proyecto ${test.projectRef} · HTTP ${test.status} · ${test.latencyMs} ms.`;
    result.className = 'connection-result success';
  } catch (error) {
    result.textContent = friendlyConnectionError(error);
    result.className = 'connection-result error';
    await logAppError('supabase-test', error,{url:normalizeSupabaseUrl($('supabaseUrl').value)});
  } finally { button.disabled = false; }
}

async function resetOfficialSupabaseConfig() {
  const config = normalizeSupabaseConfig({url:OFFICIAL_SUPABASE_URL,anonKey:OFFICIAL_SUPABASE_PUBLISHABLE_KEY,enabled:true,managed:true,resetAt:nowIso()});
  $('supabaseUrl').value=config.url;
  $('supabaseAnonKey').value=config.anonKey;
  $('supabaseEnabled').checked=true;
  $('supabaseProjectHint').textContent=`Proyecto oficial restaurado: ${OFFICIAL_SUPABASE_PROJECT_REF}`;
  $('supabaseTestResult').textContent='Conexión oficial cargada. Presiona Probar conexión o Guardar configuración.';
  $('supabaseTestResult').className='connection-result';
  toast('Se restauró la URL oficial de Good King.');
}

async function saveAuthConnectionSetup(event) {
  event.preventDefault();
  try {
    const config=validateSupabaseConfig({url:$('authSupabaseUrl').value,anonKey:$('authSupabaseKey').value,enabled:true,managed:false});
    config.lastTest=await testSupabaseConnection(config);
    setRuntimeSupabaseConfig(config);
    await putRecord('settings',{id:'supabase-config',value:{...config,updatedAt:nowIso()},updatedAt:nowIso()});
    setAuthPanel('loginForm');
    $('loginResult').textContent='Conexión guardada. Ya puedes iniciar sesión.';
    $('loginResult').className='connection-result success';
  } catch(error) {
    $('authMessage').textContent=friendlyConnectionError(error);
  }
}

async function syncPendingRecords() {
  if (syncInProgress) return {synced:0,failed:0,pulled:0,busy:true};
  const config=await getSupabaseConfig();
  if (!config.enabled || !navigator.onLine || !authContext || authContext.offline) return {synced:0,failed:0,pulled:0};
  const session=await ensureAuthSession();
  if (!session) return {synced:0,failed:0,pulled:0};
  syncInProgress=true;
  const queue=(await getAllRecords('syncQueue')).filter(item=>item.status==='pending'||item.status==='error').sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).slice(0,200);
  const deviceId=await getDeviceId();
  let synced=0,failed=0,pulled=0;
  try {
    await registerRemoteDevice();
    for(const item of queue){
      if (authContext.role === 'helper' && ['clients','clientPayments','productCatalog'].includes(item.entity)) continue;
      try {
        await pushQueueItem(item,deviceId);
        item.status='synced';item.syncedAt=nowIso();item.updatedAt=nowIso();item.lastError=null;
        await putRecord('syncQueue',item);synced++;
      } catch(error){
        item.status='error';item.attempts=Number(item.attempts||0)+1;item.lastError=String(error.message||error);item.updatedAt=nowIso();
        await putRecord('syncQueue',item);await logAppError('supabase-sync',error,{queueId:item.id,entity:item.entity});failed++;
        if(!navigator.onLine)break;
      }
    }
    try { await pushUnsyncedAudits(deviceId); } catch(error) { await logAppError('audit-sync',error); }
    if(!failed){const result=await pullRemoteCoreData();pulled=result.pulled||0;}
    await putRecord('appMeta',{id:'last-sync',synced,failed,pulled,checkedAt:nowIso(),userId:authContext.userId,businessId:authContext.businessId});
  } finally {
    syncInProgress=false;await refreshStatus();if(currentModuleKey==='settings')await renderModule('settings');
  }
  return {synced,failed,pulled};
}

async function getPwaDiagnostics() {
  const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
  const cachesList = 'caches' in window ? await caches.keys() : [];
  return {
    secureContext:window.isSecureContext,
    standalone:isStandalone(),
    serviceWorkerSupported:'serviceWorker' in navigator,
    controlled:Boolean(navigator.serviceWorker?.controller),
    registrationCount:registrations.length,
    waiting:Boolean(swRegistration?.waiting),
    installPrompt:Boolean(deferredInstallPrompt),
    caches:cachesList.filter(item=>item.startsWith('good-king-'))
  };
}

async function showInstallDialog() {
  const diag = await getPwaDiagnostics();
  const canPrompt = Boolean(deferredInstallPrompt);
  $('installDialogContent').innerHTML = isStandalone()
    ? '<div class="install-state success"><b>Good King ya está instalada</b><p>Se está ejecutando como aplicación independiente.</p></div>'
    : `<div class="install-state"><b>${canPrompt ? 'Instalación automática disponible' : 'Instalación desde el navegador'}</b><p>${canPrompt ? 'Presiona “Instalar ahora” y confirma el mensaje de Android.' : 'En Chrome abre el menú de tres puntos y selecciona “Instalar aplicación” o “Agregar a pantalla principal”.'}</p></div><div class="diagnostic-mini"><span>HTTPS <b>${diag.secureContext ? 'Correcto':'No disponible'}</b></span><span>Service Worker <b>${diag.controlled ? 'Activo':'Preparando'}</b></span><span>Caché <b>${diag.caches.length}</b></span></div>`;
  $('installPrimaryBtn').disabled = isStandalone();
  $('installPrimaryBtn').textContent = canPrompt ? 'Instalar ahora' : 'Ver instrucciones';
  $('installDialog').showModal();
}

async function requestAppInstall() {
  if (!deferredInstallPrompt) return showInstallDialog();
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  try {
    await promptEvent.prompt();
    await promptEvent.userChoice;
  } catch (error) {
    await logAppError('pwa-install', error);
    toast('Android no pudo abrir el instalador. Usa Reparar instalación y vuelve a intentar.', 5200);
  }
  updateInstallUI();
  if ($('installDialog').open) $('installDialog').close();
}

async function repairPwaInstallation() {
  if (!confirm('Se reiniciará únicamente la instalación y la caché de la app. Las ventas y la base IndexedDB NO se borrarán. ¿Continuar?')) return;
  try {
    const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    await Promise.all(registrations.map(item => item.unregister()));
    const keys = 'caches' in window ? await caches.keys() : [];
    await Promise.all(keys.filter(key=>key.startsWith('good-king-')).map(key=>caches.delete(key)));
    await writeAudit('pwa_repaired','appMeta','pwa',{registrations:registrations.length,caches:keys.length});
    toast('Instalación reparada. Recargando sin borrar datos…', 3500);
    setTimeout(()=>location.reload(),900);
  } catch (error) {
    await logAppError('pwa-repair', error);
    toast(`No se pudo reparar: ${error.message}`, 5200);
  }
}

function revealUpdateReady(registration) {
  swRegistration = registration;
  updateReady = Boolean(registration?.waiting);
  $('updateAppBtn').hidden = !updateReady;
}

async function applyAppUpdate() {
  if (!swRegistration?.waiting) return toast('No hay una actualización pendiente.');
  reloadAfterUpdate = true;
  swRegistration.waiting.postMessage({type:'SKIP_WAITING'});
}

async function exportDiagnostics() {
  const diagnostics = {
    appVersion:APP_VERSION, schemaVersion:DB_VERSION, generatedAt:nowIso(),
    pwa:await getPwaDiagnostics(), storage:await storageState(), health:await verifyDataIntegrity(),
    lastError:await getRecord('appMeta','last-app-error'), supabase:{...(await getSupabaseConfig()),anonKey:'[OCULTA]'}
  };
  const blob = new Blob([JSON.stringify(diagnostics,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`good-king-diagnostico-${localDateKey()}.json`; a.click(); URL.revokeObjectURL(url);
  toast('Diagnóstico descargado.');
}

async function renderSettingsModule() {
  const counts = {};
  for (const store of ['sales','cashSessions','movements','syncQueue','auditLogs','backups','clients','clientPayments','productCatalog','inventoryIngredients','purchasesLocal','expensesLocal','recipesLocal','marketListsLocal','appErrors']) counts[store] = await countRecords(store);
  const backups = (await getAllRecords('backups')).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const health = await getRecord('appMeta','last-health-check');
  const storage = await storageState();
  const pwa = await getPwaDiagnostics();
  const supabase = await getSupabaseConfig();
  const lastSync = await getRecord('appMeta','last-sync');
  const queue = await getAllRecords('syncQueue');
  const pending = queue.filter(item=>item.status==='pending' || item.status==='error').length;
  const usageMb = (storage.usage / 1024 / 1024).toFixed(2);
  const quotaMb = (storage.quota / 1024 / 1024).toFixed(0);
  const lastBackup = backups[0] ? new Date(backups[0].createdAt).toLocaleString('es-BO') : 'Todavía no existe';
  return `<div class="maintenance-grid">
    <section class="maintenance-card featured"><h3>Respaldo de seguridad</h3><p>Descarga caja, pedidos, clientes, catálogo y auditoría. La restauración valida integridad antes de reemplazar datos.</p><div class="button-row"><button id="exportBackupBtn" class="primary-action">Descargar respaldo</button><button id="restoreBackupBtn" class="button-light">Restaurar respaldo</button></div><small>Último respaldo interno: ${escapeHTML(lastBackup)} · Se conservan los 5 más recientes.</small></section>
    <section class="maintenance-card"><h3>Instalación y actualización</h3><p>${pwa.standalone ? 'Good King está instalada como aplicación.' : 'Instala la PWA o repara caché y Service Worker sin borrar IndexedDB.'}</p><div class="button-row"><button id="settingsInstallBtn" class="secondary-action">${pwa.standalone ? 'Ver instalación':'Instalar app'}</button><button id="settingsCheckUpdateBtn" class="secondary-action">Buscar actualización</button><button id="settingsRepairPwaBtn" class="button-light">Reparar instalación</button><button id="settingsForceUpdateBtn" class="button-light">Forzar actualización</button></div><small>Versión actual: V${APP_VERSION} · HTTPS: ${pwa.secureContext?'sí':'no'} · SW: ${pwa.controlled?'activo':'preparando'} · cachés: ${pwa.caches.length}</small></section>
    <section class="maintenance-card"><h3>Supabase y acceso remoto</h3><p>${authContext ? `${escapeHTML(authContext.displayName)} · ${escapeHTML(roleLabel(authContext.role))} · ${authContext.offline ? 'modo local':'sesión autenticada'}` : 'Sin sesión autenticada.'}</p><div class="button-row"><button id="configureSupabaseBtn" class="secondary-action">Ver conexión</button><button id="syncNowBtn" class="button-light" ${!supabase.enabled || !authContext || authContext.offline ? 'disabled':''}>Sincronizar ahora</button></div><small>${pending} evento(s) por enviar · ${lastSync?.checkedAt ? `última sincronización ${new Date(lastSync.checkedAt).toLocaleString('es-BO')}` : 'todavía no se sincronizó en esta versión'}</small></section>
    <section class="maintenance-card"><h3>Verificación integral</h3><p>Revisa duplicados, totales, cajas, clientes, catálogo y cola de sincronización.</p><div class="button-row"><button id="verifyDataBtn" class="secondary-action">Verificar ahora</button><button id="exportDiagnosticsBtn" class="button-light">Descargar diagnóstico</button></div><small>${health ? `Última revisión: ${new Date(health.checkedAt).toLocaleString('es-BO')} · ${health.errors.length} error(es)` : 'Todavía no se realizó una revisión.'}</small></section>
    <section class="maintenance-card"><h3>Protección del navegador</h3><p>${storage.persisted ? 'El almacenamiento está marcado como persistente.' : 'Solicita protección y conserva copias descargadas.'}</p><button id="persistStorageBtn" class="secondary-action">Solicitar protección</button><small>Uso: ${usageMb} MB de ${quotaMb} MB estimados.</small></section>
    <section class="maintenance-card"><h3>Estado de registros</h3><div class="record-counts"><span>Ventas <b>${counts.sales}</b></span><span>Cajas <b>${counts.cashSessions}</b></span><span>Clientes <b>${counts.clients}</b></span><span>Catálogo <b>${counts.productCatalog}</b></span><span>Inventario <b>${counts.inventoryIngredients}</b></span><span>Compras <b>${counts.purchasesLocal}</b></span><span>Gastos <b>${counts.expensesLocal}</b></span><span>Recetas <b>${counts.recipesLocal}</b></span><span>Listas mercado <b>${counts.marketListsLocal}</b></span><span>Pendientes sync <b>${pending}</b></span><span>Errores registrados <b>${counts.appErrors}</b></span></div></section>
  </div>`;
}

async function renderModule(key) {
  const module = modules.find(item => item[0] === key) || ['more','•','Módulo',''];
  $('salesView').classList.remove('active');
  $('moduleView').classList.add('active');
  let body = '';
  if (key === 'orders') {
    body = await renderOrdersModule();
  } else if (key === 'cash') {
    const sales = await salesForDate();
    body = `<div class="module-grid"><div class="module-card"><h3>Estado</h3><p>${currentCash ? `Caja abierta desde ${new Date(currentCash.openedAt).toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'})}` : 'Caja cerrada'}</p><strong>${sales.length} pedidos válidos hoy</strong></div><div class="module-card"><h3>Fondo inicial</h3><p>Monto disponible al iniciar la jornada.</p><strong>${money(currentCash?.openingAmount || 0)}</strong></div><div class="module-card"><h3>Resumen</h3><p>Consulta efectivo, QR, anulaciones y monto esperado.</p><button id="cashSummaryModuleBtn" class="secondary-action">Ver resumen</button></div></div>`;
  } else if (key === 'clients') {
    body = await renderClientsModule();
  } else if (key === 'products') {
    body = await renderProductsAdminModule();
  } else if (key === 'settings') {
    body = await renderSettingsModule();
  } else if (key === 'market') {
    body = `<div class="module-grid"><div class="module-card"><h3>Lista de mercado</h3><p>Este módulo se implementará después de estabilizar ventas y caja.</p><strong>Datos protegidos desde la base</strong></div><div class="module-card"><h3>Sugerencias automáticas</h3><p>Se calcularán según stock mínimo e historial de consumo.</p><strong>Previsto en la arquitectura</strong></div><div class="module-card"><h3>Ingreso a inventario</h3><p>Las compras confirmadas aumentarán el stock mediante movimientos auditables.</p><strong>Próxima fase funcional</strong></div></div>`;
  } else {
    body = `<div class="module-grid"><div class="module-card"><h3>Estructura preparada</h3><p>${escapeHTML(module[3])}</p><strong>No se habilitarán botones ficticios.</strong></div><div class="module-card"><h3>Persistencia local</h3><p>El módulo utilizará IndexedDB y movimientos auditables.</p><strong>Base local y remota estabilizada en V0.5</strong></div><div class="module-card"><h3>Sincronización autenticada</h3><p>Los cambios se guardan primero localmente y después se envían a Supabase.</p><strong>Sin depender de internet para operar</strong></div></div>`;
  }
  $('moduleContent').innerHTML = `<div class="module-hero"><p class="eyebrow" style="color:#ffd54d">Good King V0.8.0</p><h1>${escapeHTML(module[2])}</h1><p>${escapeHTML(module[3])}</p></div>${body}`;

  $('moduleContent').querySelectorAll('.reprint-sale').forEach(button => button.onclick = async () => {
    const sale = await getRecord('sales', button.dataset.id);
    if (sale) showPrint(sale, 'Reimpresión de pedido');
  });
  $('moduleContent').querySelectorAll('.annul-sale').forEach(button => button.onclick = () => annulSale(button.dataset.id));
  $('cashSummaryModuleBtn')?.addEventListener('click', showSummary);
  $('exportBackupBtn')?.addEventListener('click', exportBackup);
  $('restoreBackupBtn')?.addEventListener('click', () => $('restoreFileInput').click());
  $('verifyDataBtn')?.addEventListener('click', showHealthReport);
  $('persistStorageBtn')?.addEventListener('click', requestPersistentStorage);
  $('newClientBtn')?.addEventListener('click', () => openClientDialog());
  $('moduleContent').querySelectorAll('.edit-client').forEach(button => button.onclick = async () => openClientDialog(await getRecord('clients',button.dataset.id)));
  $('moduleContent').querySelectorAll('.charge-client').forEach(button => button.onclick = () => openClientTransaction(button.dataset.id,'charge'));
  $('moduleContent').querySelectorAll('.pay-client').forEach(button => button.onclick = () => openClientTransaction(button.dataset.id,'payment'));
  $('newProductBtn')?.addEventListener('click', () => openProductDialog());
  $('moduleContent').querySelectorAll('.edit-product').forEach(button => button.onclick = () => openProductDialog(products.find(item=>item.id===button.dataset.id)));
  $('settingsInstallBtn')?.addEventListener('click', showInstallDialog);
  $('settingsCheckUpdateBtn')?.addEventListener('click', () => checkForAppUpdate({interactive:true}));
  $('settingsRepairPwaBtn')?.addEventListener('click', repairPwaInstallation);
  $('settingsForceUpdateBtn')?.addEventListener('click', forceAppRefresh);
  $('configureSupabaseBtn')?.addEventListener('click', openSupabaseDialog);
  $('syncNowBtn')?.addEventListener('click', async () => { toast('Sincronizando…'); const result=await syncPendingRecords(); toast(`${result.synced} enviado(s) · ${result.pulled || 0} recibido(s) · ${result.failed} error(es)`,4800); });
  $('exportDiagnosticsBtn')?.addEventListener('click', exportDiagnostics);
}

function updateClock() {
  $('clockText').textContent = new Date().toLocaleString('es-BO', { weekday:'short', hour:'2-digit', minute:'2-digit' });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    updateInstallUI();
    return;
  }
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js?v=0.8.0', { scope:'./', updateViaCache:'none' });
    if (swRegistration.waiting) revealUpdateReady(swRegistration);
    swRegistration.addEventListener('updatefound', () => {
      const worker = swRegistration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          revealUpdateReady(swRegistration);
          toast('Nueva versión preparada. Presiona Actualizar cuando termines el pedido.', 6200);
        }
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadAfterUpdate) location.reload();
    });
    setTimeout(() => checkForAppUpdate({interactive:false}), 2200);
  } catch (error) {
    console.warn('Service Worker no disponible', error);
    await logAppError('service-worker-register', error);
  } finally {
    updateInstallUI();
  }
}

function setupBroadcastChannel() {
  if (typeof window.BroadcastChannel !== 'function') return;
  broadcastChannel = new window.BroadcastChannel('good-king-events');
  broadcastChannel.onmessage = async event => {
    if (!event.data?.type) return;
    await loadCash();
    await refreshOrderNumber();
    await refreshStatus();
    if ($('moduleView').classList.contains('active')) {
      const activeBottom = document.querySelector('.bottom-nav button.active')?.dataset.module;
      if (activeBottom && activeBottom !== 'sales' && activeBottom !== 'more') await renderModule(activeBottom);
    }
    toast('Información actualizada desde otra pestaña.');
  };
}

async function init() {
  await openDB();
  await ensureMetadata();
  await seedSupabaseConfig();
  await ensureDefaultCatalog();
  await prepareV05MigrationQueue();
  await getDeviceId();
  await repairOrderCounters();
  renderCategories();
  renderProducts();
  renderCart();
  renderQuickNotes();
  renderSideLinks();
  await loadCash();
  await refreshOrderNumber();
  await refreshStatus();
  await updateStorageStatus();
  updateClock();
  setInterval(updateClock, 30000);

  $('searchInput').oninput = renderProducts;
  $('floatingCart').onclick = openCart;
  $('closeCartBtn').onclick = closeCart;
  $('cartBackdrop').onclick = closeCart;
  $('menuBtn').onclick = showSideMenu;
  $('closeMenuBtn').onclick = closeSideMenu;
  $('menuBackdrop').onclick = closeSideMenu;
  $('openCashBtn').onclick = openCash;
  $('cashForm').onsubmit = confirmOpenCash;
  $('cancelOpenCash').onclick = () => $('cashDialog').close();
  $('todayBtn').onclick = showSummary;
  $('confirmSaleBtn').onclick = confirmSale;
  $('closeCashBtn').onclick = prepareCloseCash;
  $('closeCashForm').onsubmit = confirmCloseCash;
  $('cancelCloseCash').onclick = () => $('closeCashDialog').close();
  $('countedCash').oninput = updateCashDifference;
  $('printBtn').onclick = () => window.print();
  $('dismissPrint').onclick = () => $('printDialog').close();
  $('printDoneBtn').onclick = () => $('printDialog').close();
  $('dismissSummary').onclick = () => $('summaryDialog').close();
  $('summaryCloseButton').onclick = () => $('summaryDialog').close();
  $('dismissHealth').onclick = () => $('healthDialog').close();
  $('healthDoneBtn').onclick = () => $('healthDialog').close();
  $('restoreFileInput').onchange = event => restoreBackupFile(event.target.files?.[0]);
  $('installAppBtn').onclick = showInstallDialog;
  $('updateAppBtn').onclick = applyAppUpdate;
  $('dismissInstall').onclick = () => $('installDialog').close();
  $('installPrimaryBtn').onclick = requestAppInstall;
  $('repairInstallBtn').onclick = repairPwaInstallation;
  $('clientForm').onsubmit = saveClient;
  $('dismissClient').onclick = $('cancelClient').onclick = () => $('clientDialog').close();
  $('clientTxnForm').onsubmit = saveClientTransaction;
  $('dismissClientTxn').onclick = $('cancelClientTxn').onclick = () => $('clientTxnDialog').close();
  $('productForm').onsubmit = saveProduct;
  $('dismissProduct').onclick = $('cancelProduct').onclick = () => $('productDialog').close();
  $('supabaseForm').onsubmit = saveSupabaseConfig;
  $('connectionSetupForm').onsubmit = saveAuthConnectionSetup;
  $('loginForm').onsubmit = handleLogin;
  $('offlineAccessBtn').onclick = continueOffline;
  $('logoutBtn').onclick = logoutUser;
  $('changeConnectionBtn').onclick = openSupabaseDialog;
  $('authDiagnosticBtn').onclick = () => runConnectionDiagnostic({showToast:true}).catch(()=>{});
  $('authCheckUpdateBtn').onclick = () => checkForAppUpdate({interactive:true});
  $('authForceUpdateBtn').onclick = forceAppRefresh;
  document.querySelectorAll('[data-login-email]').forEach(button => button.onclick = () => { $('loginEmail').value = button.dataset.loginEmail; $('loginPassword').focus(); });
  $('dismissSupabase').onclick = () => $('supabaseDialog').close();
  $('resetSupabaseBtn').onclick = resetOfficialSupabaseConfig;
  $('testSupabaseBtn').onclick = handleSupabaseTest;
  $('backToSales').onclick = () => navigate('sales');
  setupSegment('orderTypeGroup', value => orderType = value);
  setupSegment('paymentGroup', value => payment = value);
  document.querySelectorAll('.bottom-nav button').forEach(button => button.onclick = () => navigate(button.dataset.module));

  window.addEventListener('online', async () => { await refreshStatus(); if(authSession||authContext){try{const session=await ensureAuthSession();if(session&&!authContext?.offline)await completeAuthentication(session);}catch(error){await logAppError('online-auth-refresh',error);}syncPendingRecords().catch(console.error);} });
  window.addEventListener('offline', refreshStatus);
  window.addEventListener('beforeunload', event => {
    if (!isSaving) return;
    event.preventDefault();
    event.returnValue = '';
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await loadCash();
      await refreshStatus();
      await refreshOrderNumber();
      checkForAppUpdate({interactive:false}).catch(()=>{});
    }
  });

  setupBroadcastChannel();
  await registerServiceWorker();
  await bootstrapAuthentication();
  const initialModule = location.hash.replace('#','');
  if (initialModule && initialModule !== 'sales') setTimeout(()=>navigate(initialModule),200);
  setTimeout(() => createAutoBackup('migración e inicio de V0.8.0').catch(console.error), 1800);
  setTimeout(() => syncPendingRecords().catch(console.error), 3200);
}

window.addEventListener('error', event => logAppError('window-error', event.error || event.message, {filename:event.filename,line:event.lineno}).catch(()=>{}));
window.addEventListener('unhandledrejection', event => logAppError('unhandled-rejection', event.reason).catch(()=>{}));

init().catch(error => {
  console.error(error);
  alert(`No se pudo iniciar la base local de Good King. No borres los datos del sitio. Cierra otras pestañas y vuelve a cargar. Detalle: ${error.message || error}`);
});
