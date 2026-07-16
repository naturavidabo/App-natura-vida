// auth.js — V7 — Supabase Auth es la única identidad.
// No existe inicio de sesión offline ni usuario local alternativo.


async function sha256Hex(text) {
  const enc = new TextEncoder().encode(String(text || ''));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function permissionsForRole(roleName) {
  if (roleName === 'Administrador') return ['*'];
  return ['products:read', 'products:local_edit', 'clients:manage', 'quotes:manage',
          'sales:create', 'own_reports:read', 'orders:create'];
}

function roleCanonicalToDisplay(roleCanonical) {
  return String(roleCanonical || '').toLowerCase() === 'administrador' ? 'Administrador' : 'Representante';
}

function applyOnlineSession(user, profile) {
  const roleCanonical = String(profile.role || 'representante').toLowerCase();
  const roleName = roleCanonicalToDisplay(roleCanonical);
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
    roleId: roleCanonical === 'administrador' ? 'role_admin' : 'role_reseller',
    roleName,
    roleCanonical,
    statusCanonical,
    pendingApproval: statusCanonical === 'pendiente',
    permissions: permissionsForRole(roleName),
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
  return !!(AppState.session && AppState.session.roleName === 'Administrador');
}

function isReseller() {
  return !!(AppState.session && AppState.session.roleName !== 'Administrador');
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
