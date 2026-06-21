/* state.js — Estado en memoria compartido entre módulos y configuración del negocio. */

const AppState = {
  products: [],
  priceGroups: [],
  sales: [],
  clients: [],
  quotes: [],
  settings: {
    businessName: 'NATURA VIDA',
    businessSlogan: 'Te cuida por dentro y por fuera',
    logo: null,
    lowStockThreshold: 5,
    priceGroupsEnabled: true,
    currency: 'Bs',
    setupRequired: true,
    cloudSyncPrepared: true,
    apkPrepared: true,
    businessModel: 'Administrador → Revendedores → Clientes Finales'
  },
  currentTab: 'inicio',
  lastClient: null,
  session: {
    isAuthenticated: false,
    userId: null,
    username: null,
    fullName: null,
    roleId: null,
    roleName: null,
    permissions: []
  }
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
  AppState.products = products.map(p => window.normalizeLegacyProduct ? normalizeLegacyProduct(p) : p);
  AppState.priceGroups = priceGroups;
  AppState.sales = sales;
  AppState.clients = clients;
  AppState.quotes = quotes;

  const savedSettings = settingsRows.find(r => r.key === 'main');
  if (savedSettings && savedSettings.value) {
    AppState.settings = Object.assign({}, AppState.settings, savedSettings.value);
  } else {
    AppState.settings.logo = 'icons/icon-192.png';
    await saveSettings();
  }
}

async function saveSettings() {
  await DB.put('settings', { key: 'main', value: AppState.settings }, { silent: true });
}

function roundBs(n) {
  return Math.round(Number(n) || 0);
}

function fmtMoney(n) {
  n = roundBs(n);
  return AppState.settings.currency + ' ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function grossCost(product) {
  if (!product) return 0;
  const directCost = Number(product.cost ?? product.baseCost);
  if (Number.isFinite(directCost) && directCost > 0) return directCost;
  return (product.insumos || []).reduce((sum, i) => {
    const qty = Number(i.qtyUsed) || 0;
    const unitCost = Number(i.unitCost) || 0;
    return sum + (qty * unitCost);
  }, 0);
}

function priceForGroup(product, groupId) {
  const base = wholesalePrice(product);
  const g = AppState.priceGroups.find(pg => pg.id === groupId);
  if (!g) return base;
  if (g.mode === 'discount') return roundBs(Math.max(0, base - (base * (Number(g.percent) || 0) / 100)));
  return roundBs(base + (base * (Number(g.percent) || 0) / 100));
}

window.AppState = AppState;
window.loadAllState = loadAllState;
window.saveSettings = saveSettings;
window.fmtMoney = fmtMoney;
window.roundBs = roundBs;
window.grossCost = grossCost;
window.priceForGroup = priceForGroup;
