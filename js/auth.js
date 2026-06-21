/* auth.js — Autenticación local offline-first con sesión persistente y control básico por rol. */

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(String(text || ''));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function authenticateUser(username, password) {
  const users = await DB.getByIndex('users', 'byUsername', String(username || '').trim().toLowerCase());
  const user = users.find(u => u.status === 'active');
  if (!user) return { ok: false, message: 'Usuario no encontrado o inactivo.' };
  const hash = await sha256Hex(password);
  if (hash !== user.passwordHash) return { ok: false, message: 'Contraseña incorrecta.' };
  const permissionsRows = await DB.getByIndex('permissions', 'byRole', user.roleId);
  const permissions = permissionsRows.flatMap(p => Array.isArray(p.actions) ? p.actions : []);
  AppState.session = {
    isAuthenticated: true,
    userId: user.id,
    username: user.username,
    fullName: user.fullName || user.username,
    roleId: user.roleId,
    roleName: user.role || 'Usuario',
    permissions
  };
  localStorage.setItem('natura_vida_session', JSON.stringify({ userId: user.id }));
  await writeAudit('login', 'user', user.id, null, { username: user.username });
  return { ok: true, user };
}

async function restoreSession() {
  try {
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
      userId: user.id,
      username: user.username,
      fullName: user.fullName || user.username,
      roleId: user.roleId,
      roleName: user.role || 'Usuario',
      permissions
    };
    return true;
  } catch (_) {
    return false;
  }
}

function logoutSession() {
  localStorage.removeItem('natura_vida_session');
  AppState.session = {
    isAuthenticated: false,
    userId: null,
    username: null,
    fullName: null,
    roleId: null,
    roleName: null,
    permissions: []
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

window.sha256Hex = sha256Hex;
window.authenticateUser = authenticateUser;
window.restoreSession = restoreSession;
window.logoutSession = logoutSession;
window.hasPermission = hasPermission;
window.requireAuth = requireAuth;
