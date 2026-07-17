// auth.js — V7 — Supabase Auth es la única identidad.
// No existe inicio de sesión offline ni usuario local alternativo.


async function sha256Hex(text) {
  const enc = new TextEncoder().encode(String(text || ''));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ROLE_DEFINITIONS_V800 = {
  central_admin: {
    name: 'Administrador central', short: 'Administración central', level: 100,
    summary: 'Dirige y fiscaliza toda la operación de Natura Vida.',
    permissions: ['*']
  },
  regional_admin: {
    name: 'Administrador regional distribuidor', short: 'Administración regional', level: 80,
    summary: 'Vende y administra su región; el abastecimiento regional queda preparado para una fase controlada.',
    permissions: ['products:read','catalog:use','clients:manage','quotes:manage','sales:create','receivables:manage','orders:create','orders:team_read','inventory:own','inventory:team_read','regional:manage','routes:manage','territory:manage','territory:team_read','workforce:manage','own_reports:read','team_reports:read']
  },
  regional_advanced: {
    name: 'Representante regional avanzado', short: 'Representante regional', level: 70,
    summary: 'Vende, maneja stock propio y puede organizar un equipo comercial regional.',
    permissions: ['products:read','catalog:use','clients:manage','quotes:manage','sales:create','receivables:manage','orders:create','inventory:own','regional:manage','routes:manage','territory:manage','territory:team_read','workforce:manage','own_reports:read','team_reports:read']
  },
  commercial_representative: {
    name: 'Representante comercial', short: 'Representante', level: 60,
    summary: 'Vende y administra su stock, clientes, pedidos y actividad propia.',
    permissions: ['products:read','catalog:use','clients:manage','quotes:manage','sales:create','receivables:manage','orders:create','inventory:own','routes:own','territory:manage','own_reports:read']
  },
  field_seller: {
    name: 'Vendedor de campo', short: 'Vendedor', level: 40,
    summary: 'Registra prospectos, visitas, clientes y ventas en su territorio.',
    permissions: ['products:read','catalog:use','clients:manage','quotes:manage','sales:create','territory:manage','tasks:own','own_reports:read']
  },
  delivery: {
    name: 'Repartidor', short: 'Reparto', level: 35,
    summary: 'Ejecuta rutas, entregas, evidencias y cobranzas autorizadas.',
    permissions: ['products:read','routes:own','deliveries:manage','tasks:own','attendance:own']
  },
  production: {
    name: 'Operario de producción', short: 'Producción', level: 30,
    summary: 'Registra fabricación, consumo, lotes y mano de obra autorizada.',
    permissions: ['products:read','production:operate','tasks:own','attendance:own']
  },
  inventory: {
    name: 'Encargado de inventario', short: 'Inventario', level: 30,
    summary: 'Controla entradas, salidas, transferencias y conteos autorizados.',
    permissions: ['products:read','inventory:operate','tasks:own','attendance:own']
  },
  finance: {
    name: 'Caja y finanzas', short: 'Finanzas', level: 30,
    summary: 'Registra cobranzas, pagos y egresos dentro de su alcance.',
    permissions: ['products:read','receivables:manage','finance:operate','tasks:own']
  },
  support: {
    name: 'Personal de apoyo', short: 'Apoyo', level: 10,
    summary: 'Cumple tareas asignadas sin atribuciones administrativas.',
    permissions: ['tasks:own','attendance:own']
  }
};

function commercialRoleFromProfile(profile = {}) {
  const explicit = String(profile.commercial_role || profile.commercialRole || '').trim().toLowerCase();
  if (ROLE_DEFINITIONS_V800[explicit]) return explicit;
  return String(profile.role || '').toLowerCase() === 'administrador' ? 'central_admin' : 'commercial_representative';
}

function roleDefinitionV800(roleCode) {
  return ROLE_DEFINITIONS_V800[roleCode] || ROLE_DEFINITIONS_V800.commercial_representative;
}

function permissionsForRole(roleNameOrCode) {
  const code = ROLE_DEFINITIONS_V800[roleNameOrCode]
    ? roleNameOrCode
    : Object.keys(ROLE_DEFINITIONS_V800).find(key => ROLE_DEFINITIONS_V800[key].name === roleNameOrCode)
      || (roleNameOrCode === 'Administrador' ? 'central_admin' : 'commercial_representative');
  return [...roleDefinitionV800(code).permissions];
}

function roleCanonicalToDisplay(roleCanonical, commercialRole = '') {
  const code = commercialRole || (String(roleCanonical || '').toLowerCase() === 'administrador' ? 'central_admin' : 'commercial_representative');
  return roleDefinitionV800(code).name;
}

function applyOnlineSession(user, profile) {
  const roleCanonical = String(profile.role || 'representante').toLowerCase();
  const commercialRole = commercialRoleFromProfile(profile);
  const roleDef = roleDefinitionV800(commercialRole);
  const statusCanonical = String(profile.status || 'pendiente').toLowerCase();
  const meta = (user && user.user_metadata) || {};
  AppState.session = {
    isAuthenticated: true,
    online: true,
    onlineUserId: user.id,
    userId: user.id,
    email: profile.email || user.email || null,
    username: profile.email || user.email,
    fullName: profile.full_name || meta.full_name || user.email,
    phone: profile.phone || meta.phone || '',
    city: profile.city || meta.city || '',
    avatarUrl: profile.avatar_url || meta.avatar_url || '',
    avatar_url: profile.avatar_url || meta.avatar_url || '',
    operationalRole: '',
    operationalRoleLabel: '',
    linkedStaffId: '',
    roleId: `role_${commercialRole}`,
    roleName: roleDef.name,
    roleShortName: roleDef.short,
    roleSummary: roleDef.summary,
    roleCanonical,
    commercialRole,
    regionName: profile.region_name || profile.city || '',
    managerUserId: profile.manager_user_id || null,
    supplierUserId: profile.supplier_user_id || null,
    roleNote: profile.role_note || '',
    statusCanonical,
    pendingApproval: statusCanonical === 'pendiente',
    permissions: permissionsForRole(commercialRole),
    mustChangePassword: false
  };
}

function clearSession() {
  AppState.session = null;
}

async function restoreSession() {
  try {
    if (!window.isOnlineConfigured || !isOnlineConfigured()) return false;
    const online = await getOnlineSessionProfile().catch(() => null);
    if (online && online.user && online.profile) {
      applyOnlineSession(online.user, online.profile);
      return true;
    }
    return false;
  } catch (_) { return false; }
}

async function clearTransientSessionData() {
  const stores = ['products','priceGroups','sales','clients','quotes','settings','inventoryMovements',
    'commissionRules','commissions','representatives','dispatches','representativeReports',
    'purchaseOrders','messages','syncMeta'];
  if (window.DB) {
    for (const store of stores) await DB.clear(store).catch(() => {});
  }
  if (window.AppState) {
    AppState.products = []; AppState.priceGroups = []; AppState.centralPriceGroups = []; AppState.sales = []; AppState.clients = [];
    AppState.quotes = []; AppState.messages = []; AppState.purchaseOrders = [];
    AppState.commercialProfiles = []; AppState.profileChangeRequests = []; AppState.allProfiles = [];
  }
}

async function logoutSession() {
  if (window.stopRealtimeSubscriptions) stopRealtimeSubscriptions();
  if (window.stopV7Realtime) stopV7Realtime();
  if (window.isOnlineConfigured && isOnlineConfigured() && window.onlineSignOut) {
    await onlineSignOut().catch(() => {});
  }
  await clearTransientSessionData();
  clearSession();
  if (window.render) render();
}

function hasPermission(action) {
  const perms = AppState.session && AppState.session.permissions || [];
  return perms.includes('*') || perms.includes(action);
}

function requireAuth() {
  return !!(AppState.session && AppState.session.isAuthenticated);
}

function isAdmin() {
  return !!(AppState.session && AppState.session.commercialRole === 'central_admin');
}

function isReseller() {
  return !!(AppState.session && AppState.session.commercialRole !== 'central_admin');
}

function hasCommercialRoleV800(...roles) {
  return !!(AppState.session && roles.includes(AppState.session.commercialRole));
}

function canSellV800() {
  return hasPermission('sales:create') || isAdmin();
}

function canManageTeamV800() {
  return isAdmin() || hasCommercialRoleV800('regional_admin','regional_advanced');
}

function canUseTerritoryV800() {
  return isAdmin() || hasPermission('territory:manage') || hasPermission('territory:team_read');
}

function canUseWorkforceV800() {
  return isAdmin() || hasPermission('workforce:manage') || hasPermission('tasks:own') || hasPermission('attendance:own');
}

function canHoldStockV800() {
  return isAdmin() || hasCommercialRoleV800('regional_admin','regional_advanced','commercial_representative');
}

function canOperate() {
  return !!(AppState.session && AppState.session.isAuthenticated &&
            !AppState.session.pendingApproval &&
            AppState.session.statusCanonical !== 'bloqueado');
}

function isGmailAddress(email) {
  return /^[^\s@]+@gmail\.com$/i.test(String(email || '').trim());
}

async function registerNewAccount({ fullName, email, phone, city, password } = {}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName  = String(fullName || '').trim();
  const cleanPhone = String(phone || '').trim().replace(/\s+/g, '');
  const cleanCity  = String(city || '').trim();

  if (!isGmailAddress(cleanEmail))      return { ok: false, message: 'Ingresa un correo de Gmail válido (@gmail.com).' };
  if (!cleanName)                       return { ok: false, message: 'Ingresa tu nombre completo.' };
  if (!cleanPhone)                      return { ok: false, message: 'Ingresa tu número de celular.' };
  if (!cleanCity)                       return { ok: false, message: 'Ingresa tu ciudad.' };
  if (!password || password.length < 6) return { ok: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
  if (!window.isOnlineConfigured || !isOnlineConfigured()) {
    return { ok: false, message: 'Se necesita conexión a internet para crear una cuenta.' };
  }

  const res = await signUpEmailAccount(cleanEmail, password, cleanName, {
    phone: cleanPhone, city: cleanCity
  }).catch(err => ({ ok: false, message: err && err.message }));

  if (!res.ok) return res;
  if (res.needsEmailConfirmation) {
    return { ok: true, needsEmailConfirmation: true,
      message: 'Cuenta creada. Revisa tu Gmail para confirmar antes de iniciar sesión.' };
  }
  applyOnlineSession(res.user, res.profile);
  if (window.writeAudit) writeAudit('signup:gmail', 'user', res.user.id, null, { email: cleanEmail }).catch(() => {});
  return { ok: true, user: res.user, pendingApproval: AppState.session.pendingApproval };
}

async function loginWithEmail(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return { ok: false, message: 'Ingresa tu correo y tu contrasena.' };
  if (!window.isOnlineConfigured || !isOnlineConfigured()) {
    return { ok: false, message: 'Se necesita conexión a internet para iniciar sesión.' };
  }
  const res = await onlineSignIn(cleanEmail, password).catch(err => ({ ok: false, message: err && err.message }));
  if (!res.ok) return res;
  applyOnlineSession(res.user, res.profile);
  if (window.touchLastLogin) touchLastLogin(res.user.id).catch(() => {});
  if (window.writeAudit) writeAudit('login:gmail', 'user', res.user.id, null, { email: cleanEmail }).catch(() => {});
  return { ok: true, user: res.user, pendingApproval: AppState.session.pendingApproval };
}

async function requestPasswordRecovery(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isGmailAddress(cleanEmail)) return { ok: false, message: 'Ingresa tu correo de Gmail.' };
  if (!window.isOnlineConfigured || !isOnlineConfigured()) return { ok: false, message: 'Se necesita conexión a internet.' };
  if (!window.sendPasswordRecoveryEmail) return { ok: false, message: 'Función no disponible.' };
  const res = await sendPasswordRecoveryEmail(cleanEmail).catch(err => ({ ok: false, message: err && err.message }));
  if (!res.ok) return res;
  return { ok: true, message: 'Te enviamos un correo a ' + cleanEmail + ' con instrucciones para recuperar tu acceso.' };
}

async function adminApproveUser(userId) {
  if (!window.setProfileStatus) return { ok: false, message: 'Función no disponible.' };
  const res = await setProfileStatus(userId, 'activo').catch(err => ({ ok: false, message: err && err.message }));
  if (res.ok && window.writeAudit) writeAudit('admin:approve_user', 'profiles', userId, null, {}).catch(() => {});
  return res;
}
async function adminBlockUser(userId) {
  if (!window.setProfileStatus) return { ok: false, message: 'Función no disponible.' };
  const res = await setProfileStatus(userId, 'bloqueado').catch(err => ({ ok: false, message: err && err.message }));
  if (res.ok && window.writeAudit) writeAudit('admin:block_user', 'profiles', userId, null, {}).catch(() => {});
  return res;
}
async function adminUnblockUser(userId) {
  if (!window.setProfileStatus) return { ok: false, message: 'Función no disponible.' };
  const res = await setProfileStatus(userId, 'activo').catch(err => ({ ok: false, message: err && err.message }));
  if (res.ok && window.writeAudit) writeAudit('admin:unblock_user', 'profiles', userId, null, {}).catch(() => {});
  return res;
}

window.sha256Hex = sha256Hex;
window.applyOnlineSession = applyOnlineSession;
window.clearSession = clearSession;
window.restoreSession = restoreSession;
window.logoutSession = logoutSession;
window.clearTransientSessionData = clearTransientSessionData;
window.hasPermission = hasPermission;
window.requireAuth = requireAuth;
window.isAdmin = isAdmin;
window.isReseller = isReseller;
window.canOperate = canOperate;
window.isGmailAddress = isGmailAddress;
window.registerNewAccount = registerNewAccount;
window.loginWithEmail = loginWithEmail;
window.requestPasswordRecovery = requestPasswordRecovery;
window.adminApproveUser = adminApproveUser;
window.adminBlockUser = adminBlockUser;
window.adminUnblockUser = adminUnblockUser;
