/* state.js — Estado en memoria compartido entre módulos y configuración del negocio. */

const AppState = {
  products: [],
  priceGroups: [],
  centralPriceGroups: [],
  sales: [],
  clients: [],
  quotes: [],
  messages: [],
  expenses: [],
  receivablePayments: [],
  historicalReceivables: [],
  financialDocuments: [],
  paymentPlans: [],
  rawMaterials: [],
  rawMaterialMovements: [],
  productionOrders: [],
  productionBatches: [],
  representatives: [],
  settings: {
    businessName: 'NATURA VIDA',
    businessSlogan: 'Te cuida por dentro y por fuera',
    logo: 'img/brand/natura-vida-logo.jpeg',
    lowStockThreshold: 5,
    priceGroupsEnabled: true,
    commercialRules: {
      enabled: false,
      enforcementMode: 'block',
      marginBasis: 'sale',
      minimumMarginPercent: 15,
      globalMaximumDiscountPercent: 30,
      requireReasonFromPercent: 1,
      allowCentralOverride: true,
      promotionsCanStack: false,
      roleDiscountLimits: {
        central_admin: 30,
        regional_admin: 15,
        regional_advanced: 12,
        commercial_representative: 10,
        field_seller: 5,
        delivery: 0,
        production: 0,
        inventory: 0,
        finance: 0,
        support: 0
      }
    },
    commercialPromotions: [],
    currency: 'Bs',
    setupRequired: true,
    cloudSyncPrepared: true,
    apkPrepared: true,
    businessModel: 'Administrador → Representantes → Clientes Finales',
    contactName: '',
    contactPhone: '',
    contactCity: '',
    catalogContact: '',
    catalogNote: 'Productos naturales para bienestar, belleza y cuidado integral. Consulta presentaciones disponibles y recomendaciones de uso.'
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
  const [products, priceGroups, sales, clients, quotes, messages, expenses, receivablePayments, historicalReceivables, financialDocuments, paymentPlans, rawMaterials, rawMaterialMovements, productionOrders, productionBatches, representatives, settingsRows] = await Promise.all([
    DB.getAll('products'),
    DB.getAll('priceGroups'),
    DB.getAll('sales'),
    DB.getAll('clients'),
    DB.getAll('quotes'),
    DB.getAll('messages').catch(() => []),
    DB.getAll('expenses').catch(() => []),
    DB.getAll('receivablePayments').catch(() => []),
    DB.getAll('historicalReceivables').catch(() => []),
    DB.getAll('financialDocuments').catch(() => []),
    DB.getAll('paymentPlans').catch(() => []),
    DB.getAll('rawMaterials').catch(() => []),
    DB.getAll('rawMaterialMovements').catch(() => []),
    DB.getAll('productionOrders').catch(() => []),
    DB.getAll('productionBatches').catch(() => []),
    DB.getAll('representatives').catch(() => []),
    DB.getAll('settings')
  ]);
  AppState.products = products.map(p => window.normalizeLegacyProduct ? normalizeLegacyProduct(p) : p);
  AppState.priceGroups = priceGroups;
  AppState.sales = sales;
  AppState.clients = clients;
  AppState.quotes = quotes;
  AppState.messages = messages || [];
  AppState.expenses = expenses || [];
  AppState.receivablePayments = receivablePayments || [];
  AppState.historicalReceivables = historicalReceivables || [];
  AppState.financialDocuments = financialDocuments || [];
  AppState.paymentPlans = paymentPlans || [];
  AppState.rawMaterials = rawMaterials || [];
  AppState.rawMaterialMovements = rawMaterialMovements || [];
  AppState.productionOrders = productionOrders || [];
  AppState.productionBatches = productionBatches || [];
  AppState.representatives = representatives || [];

  const savedSettings = settingsRows.find(r => r.key === 'main');
  if (savedSettings && savedSettings.value) {
    AppState.settings = Object.assign({}, AppState.settings, savedSettings.value);
    if (!AppState.settings.logo || AppState.settings.logo === 'icons/icon-192.png') {
      AppState.settings.logo = 'img/brand/natura-vida-logo.jpeg';
      await saveSettings();
    }
  } else {
    AppState.settings.logo = 'img/brand/natura-vida-logo.jpeg';
    await saveSettings();
  }
}

async function saveSettings() {
  const row = { key: 'main', value: AppState.settings, updatedAt: Date.now() };
  if (window.requireAuth && requireAuth()) {
    if (!navigator.onLine) throw new Error('Sin internet. Los ajustes no se guardaron.');
    if (!window.cloudAfterPut) throw new Error('Supabase no está disponible.');
    await cloudAfterPut('settings', row);
  }
  await DB.put('settings', row, { silent: true });
  return row;
}

function roundBs(n) {
  const value = Number(n) || 0;
  return Math.round(value * 100) / 100;
}

function fmtMoney(n) {
  n = roundBs(n);
  const decimals = Math.abs(n % 1) > 0.0001 ? 2 : 0;
  return AppState.settings.currency + ' ' + n.toLocaleString('es-BO', { minimumFractionDigits: decimals, maximumFractionDigits: 2 });
}

function grossCost(product) {
  if (!product) return 0;
  const insumoCost = (product.insumos || []).reduce((sum, i) => {
    const qty = Number(i.qtyUsed) || 0;
    const unitCost = Number(i.unitCost) || 0;
    return sum + (qty * unitCost);
  }, 0);
  if (insumoCost > 0) return roundBs(insumoCost);
  const directCost = Number(product.cost ?? product.baseCost);
  return Number.isFinite(directCost) ? roundBs(directCost) : 0;
}

function priceForGroup(product, groupId) {
  const base = window.marketPrice ? marketPrice(product) : wholesalePrice(product);
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
