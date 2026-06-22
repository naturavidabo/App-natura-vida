/* auth.js — Autenticación offline local + autenticación online opcional Supabase. */

const NATURA_ADMIN_ACTIVATION_CODE = '2721971';

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(String(text || ''));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function permissionsForRole(roleName) {
  if (roleName === 'Administrador') return ['*'];
  if (roleName === 'Supervisor') return ['products:read', 'clients:read', 'quotes:read', 'sales:read', 'team_reports:read'];
  return ['products:read', 'clients:manage', 'quotes:manage', 'sales:create', 'own_reports:read'];
}

function applyOnlineSession(user, profile) {
  const roleName = profile.role || 'Revendedor';
  AppState.session = {
    isAuthenticated: true,
    online: true,
    onlineUserId: user.id,
    userId: user.id,
    username: profile.username || user.email,
    fullName: profile.full_name || profile.username || user.email,
    roleId: profile.role_id || roleName.toLowerCase(),
    roleName,
    permissions: permissionsForRole(roleName),
    mustChangePassword: false
  };
}

async function authenticateUser(username, password) {
  const cleanUser = String(username || '').trim().toLowerCase().replace(/\s+/g, '');

  if (window.isOnlineConfigured && isOnlineConfigured()) {
    const online = await onlineSignIn(cleanUser, password);
    if (online.ok) {
      applyOnlineSession(online.user, online.profile);
      await writeAudit('login:online', 'user', online.user.id, null, { username: cleanUser }).catch(() => {});
      return { ok: true, user: online.user, online: true };
    }
    return online;
  }

  const users = await DB.getByIndex('users', 'byUsername', cleanUser.toLowerCase());
  const user = users.find(u => u.status === 'active');
  if (!user) return { ok: false, message: 'Usuario no encontrado o inactivo.' };
  const hash = await sha256Hex(password);
  if (hash !== user.passwordHash) return { ok: false, message: 'Contraseña incorrecta.' };
  const permissionsRows = await DB.getByIndex('permissions', 'byRole', user.roleId);
  const permissions = permissionsRows.flatMap(p => Array.isArray(p.actions) ? p.actions : []);
  AppState.session = {
    isAuthenticated: true,
    online: false,
    userId: user.id,
    username: user.username,
    fullName: user.fullName || user.username,
    roleId: user.roleId,
    roleName: user.role || 'Usuario',
    permissions,
    mustChangePassword: !!user.mustChangePassword
  };
  localStorage.setItem('natura_vida_session', JSON.stringify({ userId: user.id }));
  await writeAudit('login:local', 'user', user.id, null, { username: user.username }).catch(() => {});
  return { ok: true, user, online: false };
}

async function restoreSession() {
  try {
    if (window.isOnlineConfigured && isOnlineConfigured()) {
      const online = await getOnlineSessionProfile();
      if (online && online.user && online.profile) {
        applyOnlineSession(online.user, online.profile);
        return true;
      }
    }

    const raw = localStorage.getItem('natura_vida_session');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || !saved.userId) return false;
    const user = await DB.get('users', saved.userId);
    if (!user || user.status !== 'active') return false;
    const permissionsRows = await DB.getByIndex('permissions', 'byRole', user.roleId);
    const permissions = permissionsRows.flatMap(p => Array.isArray(p.actions) ? p.actions : []);
    AppState.session = {
      isAuthenticated: true,
      online: false,
      userId: user.id,
      username: user.username,
      fullName: user.fullName || user.username,
      roleId: user.roleId,
      roleName: user.role || 'Usuario',
      permissions,
      mustChangePassword: !!user.mustChangePassword
    };
    return true;
  } catch (_) {
    return false;
  }
}

async function logoutSession() {
  localStorage.removeItem('natura_vida_session');
  if (window.onlineSignOut) await onlineSignOut().catch(() => {});
  AppState.session = {
    isAuthenticated: false,
    online: false,
    userId: null,
    username: null,
    fullName: null,
    roleId: null,
    roleName: null,
    permissions: [],
    mustChangePassword: false
  };
}

function hasPermission(action) {
  const perms = AppState.session && Array.isArray(AppState.session.permissions) ? AppState.session.permissions : [];
  if (perms.includes('*')) return true;
  return perms.includes(action);
}

function requireAuth() {
  return !!(AppState.session && AppState.session.isAuthenticated);
}

function isAdmin() {
  return requireAuth() && AppState.session.roleName === 'Administrador';
}

function isReseller() {
  return requireAuth() && AppState.session.roleName === 'Revendedor';
}

window.sha256Hex = sha256Hex;
window.authenticateUser = authenticateUser;
window.restoreSession = restoreSession;
window.logoutSession = logoutSession;
window.hasPermission = hasPermission;
window.requireAuth = requireAuth;
window.isAdmin = isAdmin;
window.isReseller = isReseller;
window.updateLocalPassword = updateLocalPassword;


async function updateLocalPassword(userId, newPassword, profileData = {}) {
  if (!userId || !newPassword || newPassword.length < 4) {
    return { ok: false, message: 'La contraseña debe tener al menos 4 caracteres.' };
  }
  const user = await DB.get('users', userId);
  if (!user) return { ok: false, message: 'Usuario local no encontrado.' };

  if (profileData.activationCode !== NATURA_ADMIN_ACTIVATION_CODE) {
    return { ok: false, message: 'Código de activación incorrecto.' };
  }

  const requestedUsername = String(profileData.username || '').trim().toLowerCase();
  if (requestedUsername) {
    const existing = await DB.getByIndex('users', 'byUsername', requestedUsername);
    const collision = existing.find(u => u.id !== user.id);
    if (collision) return { ok: false, message: 'Ese número de celular ya está registrado como usuario.' };
    user.username = requestedUsername;
  }

  user.passwordHash = await sha256Hex(newPassword);
  user.mustChangePassword = false;
  user.fullName = profileData.fullName || user.fullName;
  user.phone = profileData.phone || user.phone || requestedUsername || '';
  user.documentId = profileData.documentId || user.documentId || '';
  user.city = profileData.city || user.city || '';
  user.activatedAt = user.activatedAt || Date.now();
  user.updatedAt = Date.now();
  await DB.put('users', user, { silent: true });
  AppState.session.username = user.username;
  AppState.session.fullName = user.fullName || AppState.session.fullName;
  AppState.session.mustChangePassword = false;
  return { ok: true, user };
}


window.NATURA_ADMIN_ACTIVATION_CODE = NATURA_ADMIN_ACTIVATION_CODE;
