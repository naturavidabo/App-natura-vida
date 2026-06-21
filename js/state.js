/* state.js — Estado en memoria compartido entre módulos, y configuración del negocio. */

const AppState = {
  products: [],
  priceGroups: [],
  sales: [],
  clients: [],
  quotes: [],
  settings: {
    businessName: 'NATURA VIDA',
    businessSlogan: 'Te cuida por dentro y por fuera',
    logo: null, // se carga desde icons/icon-192.png por defecto en primer arranque
    lowStockThreshold: 5,
    priceGroupsEnabled: true,
    currency: 'Bs'
  },
  currentTab: 'inicio',
  lastClient: null // recuerda último cliente para ventas consecutivas
};

async function loadAllState() {
  const [products, priceGroups, sales, clients, quotes, settingsRows] = await Promise.all([
    DB.getAll('products'),
    DB.getAll('priceGroups'),
    DB.getAll('sales'),
    DB.getAll('clients'),
    DB.getAll('quotes'),
    DB.getAll('settings')
  ]);
  AppState.products = products;
  AppState.priceGroups = priceGroups;
  AppState.sales = sales;
  AppState.clients = clients;
  AppState.quotes = quotes;

  const savedSettings = settingsRows.find(r => r.key === 'main');
  if (savedSettings && savedSettings.value) {
    AppState.settings = Object.assign({}, AppState.settings, savedSettings.value);
  } else {
    // Primer arranque: usar el logo embebido como default
    AppState.settings.logo = 'icons/icon-192.png';
    await saveSettings();
  }
}

async function saveSettings() {
  await DB.put('settings', { key: 'main', value: AppState.settings });
}

function fmtMoney(n) {
  n = Number(n) || 0;
  return AppState.settings.currency + ' ' + n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function grossCost(product) {
  return (product.insumos || []).reduce((sum, i) => {
    const qty = Number(i.qtyUsed) || 0;
    const unitCost = Number(i.unitCost) || 0;
    return sum + (qty * unitCost);
  }, 0);
}

/* Modelo de precios:
   1) unitPrice — costo neto + % ganancia unitaria (independiente)
   2) wholesalePrice — costo neto + % ganancia por mayor (independiente, ver products.js)
   3) priceForGroup — el grupo ajusta ADEMÁS sobre el precio mayor ya calculado */

function priceForGroup(product, groupId) {
  const base = wholesalePrice(product);
  const g = AppState.priceGroups.find(pg => pg.id === groupId);
  if (!g) return base;
  if (g.mode === 'discount') return Math.max(0, base - (base * (Number(g.percent) || 0) / 100));
  return base + (base * (Number(g.percent) || 0) / 100);
}

window.AppState = AppState;
window.loadAllState = loadAllState;
window.saveSettings = saveSettings;
window.fmtMoney = fmtMoney;
window.grossCost = grossCost;
window.priceForGroup = priceForGroup;
