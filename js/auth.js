/* auth.js — Autenticación offline local + autenticación online opcional Supabase. */

const NATURA_ADMIN_ACTIVATION_CODE = '27121961';
const NATURA_ADMIN_ACTIVATION_CODES = ['27121961'];

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(String(text || ''));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function permissionsForRole(roleName) {
  if (roleName === 'Administrador') return ['*'];
  if (roleName === 'Supervisor') return ['products:read', 'clients:read', 'quotes:read', 'sales:read', 'team_reports:read'];
  return ['products:read', 'products:local_edit', 'clients:manage', 'quotes:manage', 'sales:create', 'own_reports:read', 'orders:create'];
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

function toSyntheticEmail(username) {
  const clean = String(username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return `${clean || 'usuario'}@natura-vida-app.local`;
}

async function authenticateUser(username, password) {
  const cleanUser = String(username || '').trim().toLowerCase().replace(/\s+/g, '');
  const hash = await sha256Hex(password);

  // CORRECCIÓN V6.2 — UNIFICACIÓN DE AUTENTICACIÓN:
  // Antes el acceso local (IndexedDB de este celular) tenía prioridad
  // absoluta, y el intento de login online solo se hacía si NO existía un
  // usuario local con ese nombre — y además se llamaba con el username tal
  // cual como si fuera un correo, algo que Supabase Auth nunca acepta. En la
  // práctica, el login online nunca llegaba a funcionar de verdad.
  //
  // Ahora, si hay servidor configurado, Supabase es la fuente PRINCIPAL de
  // autenticación: se intenta primero. El acceso local solo se usa como
  // respaldo para modo sin conexión, o para cuentas creadas antes de esta
  // versión que todavía no se migraron a Supabase (ver migrateLegacyUserToCloud).
  const onlineReady = window.isOnlineConfigured && isOnlineConfigured();

  if (onlineReady && window.onlineSignIn) {
    const email = toSyntheticEmail(cleanUser);
    const online = await onlineSignIn(email, password).catch(err => ({ ok: false, message: err && err.message, networkError: true }));
    if (online.ok) {
      applyOnlineSession(online.user, online.profile);
      await cacheLocalLoginFallback(cleanUser, hash, online.profile).catch(() => {});
      await writeAudit('login:online', 'user', online.user.id, null, { username: cleanUser }).catch(() => {});
      return { ok: true, user: online.user, online: true };
    }
    // Si Supabase respondió "credenciales inválidas" (no un problema de red),
    // de todas formas se intenta el acceso local: cubre cuentas activadas
    // antes de esta versión y que todavía no tienen cuenta en Supabase.
  }

  const localRows = await DB.getByIndex('users', 'byUsername', cleanUser);
  const localUser = (localRows || []).find(u => u.status === 'active');

  async function startLocalSession(user, forceActivation = false) {
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
      mustChangePassword: forceActivation ? true : !!user.mustChangePassword
    };
    localStorage.setItem('natura_vida_session', JSON.stringify({ userId: user.id }));
    await writeAudit('login:local', 'user', user.id, null, { username: cleanUser }).catch(() => {});
    return { ok: true, user, online: false };
  }

  if (localUser) {
    if (hash !== localUser.passwordHash) return { ok: false, message: 'Contraseña incorrecta.' };
    const result = await startLocalSession(localUser);
    // MIGRACIÓN AUTOMÁTICA (silenciosa, no bloquea el ingreso): si esta
    // cuenta ya está personalizada (no es el acceso genérico inicial) y aún
    // no tiene cuenta vinculada en Supabase, se intenta crear/vincular ahora
    // en segundo plano, usando la contraseña que la persona acaba de
    // escribir (es la única vez que la tenemos en texto plano).
    if (onlineReady && !localUser.mustChangePassword && !localUser.cloudLinked) {
      migrateLegacyUserToCloud(localUser, password).catch(() => {});
    }
    return result;
  }

  // Acceso inicial permanente y simple por dispositivo:
  // admin / 12345678 y vendedor1 / 23456. Si el usuario ya cambió a celular,
  // estas claves solo vuelven a abrir la pantalla de identificación/activación.
  if ((cleanUser === 'admin' && hash === await sha256Hex('12345678')) ||
      (cleanUser === 'vendedor1' && hash === await sha256Hex('23456'))) {
    const allUsers = await DB.getAll('users');
    const seedSlot = cleanUser === 'admin' ? 'admin' : 'vendedor1';
    const roleName = cleanUser === 'admin' ? 'Administrador' : 'Revendedor';
    const seedUser = allUsers.find(u => u.seedSlot === seedSlot) || allUsers.find(u => u.role === roleName);
    if (seedUser && seedUser.status === 'active') {
      return startLocalSession(seedUser, true);
    }
  }

  return { ok: false, message: 'Usuario no encontrado o inactivo.' };
}

// Guarda/actualiza una copia local mínima de la cuenta para que el ingreso
// offline siga funcionando después de haber iniciado sesión online al menos
// una vez en este celular.
async function cacheLocalLoginFallback(username, passwordHash, profile) {
  if (!window.DB || !profile) return;
  const existingRows = await DB.getByIndex('users', 'byUsername', username).catch(() => []);
  const existing = (existingRows || [])[0] || null;
  const user = Object.assign({ id: existing ? existing.id : 'user_' + (profile.id || username) }, existing, {
    username,
    passwordHash,
    fullName: profile.full_name || username,
    role: profile.role || (existing && existing.role) || 'Revendedor',
    roleId: profile.role_id || (existing && existing.roleId) || 'role_reseller',
    status: profile.status === 'inactive' ? 'inactive' : 'active',
    mustChangePassword: false,
    cloudLinked: true,
    cloudUserId: profile.id,
    updatedAt: Date.now()
  });
  await DB.put('users', user, { silent: true }).catch(() => {});
}

// Crea o vincula la cuenta en Supabase para un usuario que hasta ahora solo
// existía en el almacenamiento local de este celular.
async function migrateLegacyUserToCloud(user, plainPassword) {
  if (!window.createOrLinkCloudAccount) return;
  const res = await createOrLinkCloudAccount(user.username, plainPassword, {
    fullName: user.fullName,
    roleName: user.role,
    roleId: user.roleId,
    phone: user.phone,
    city: user.city,
    documentId: user.documentId
  }).catch(err => ({ ok: false, message: err && err.message }));
  if (res && res.ok && res.user) {
    user.cloudLinked = true;
    user.cloudUserId = res.user.id;
    user.updatedAt = Date.now();
    await DB.put('users', user, { silent: true }).catch(() => {});
  }
  return res;
}

async function restoreSession() {
  try {
    // CORRECCIÓN V6.2: antes se restauraba primero la sesión LOCAL (marcador
    // en localStorage), y la sesión online de Supabase solo se consultaba si
    // no había marcador local. Ahora que Supabase es la fuente principal, se
    // invierte el orden: si hay servidor configurado y existe una sesión de
    // Supabase válida (con perfil activo), esa es la que se usa siempre que
    // sea posible — así el estado de "activo/inactivo" del administrador
    // manda incluso si este celular tenía una sesión local guardada de antes.
    if (window.isOnlineConfigured && isOnlineConfigured()) {
      const online = await getOnlineSessionProfile().catch(() => null);
      if (online && online.user && online.profile) {
        applyOnlineSession(online.user, online.profile);
        return true;
      }
    }

    // Respaldo sin conexión (o servidor no configurado): sesión local guardada.
    const raw = localStorage.getItem('natura_vida_session');
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.userId) {
        const user = await DB.get('users', saved.userId);
        if (user && user.status === 'active') {
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
        }
      }
    }

    return false;
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
window.toSyntheticEmail = toSyntheticEmail;
window.restoreSession = restoreSession;
window.logoutSession = logoutSession;
window.hasPermission = hasPermission;
window.requireAuth = requireAuth;
window.isAdmin = isAdmin;
window.isReseller = isReseller;
window.updateLocalPassword = updateLocalPassword;


async function updateLocalPassword(userId, newPassword, profileData = {}) {
  if (!userId || !newPassword || newPassword.length < 6) {
    // CORRECCIÓN V6.2: el mínimo sube de 4 a 6 caracteres porque Supabase
    // Auth exige 6 como mínimo por defecto. Con 4, la cuenta local se podía
    // crear pero la cuenta en la nube fallaba siempre al intentar vincularla.
    return { ok: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
  }
  const user = await DB.get('users', userId);
  if (!user) return { ok: false, message: 'Usuario local no encontrado.' };

  const isAdminUser = user.role === 'Administrador' || user.roleId === 'role_admin';
  if (isAdminUser && String(profileData.activationCode || '').trim() !== NATURA_ADMIN_ACTIVATION_CODE) {
    return { ok: false, message: 'Código de activación de administrador incorrecto.' };
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

  // CORRECCIÓN V6.2 — UNIFICACIÓN DE AUTENTICACIÓN: al activar su celular
  // (poner su número y su contraseña personal), la persona ahora también
  // queda registrada con una cuenta real en Supabase, no solo en este
  // dispositivo. Esto es lo que permite que el mismo representante pueda
  // entrar después desde un segundo celular, y que el administrador vea a
  // todos los representantes reales en un solo lugar (panel "Usuarios").
  // Si por algún motivo falla (sin conexión justo en ese momento, por
  // ejemplo), la cuenta local igual queda lista y se reintentará vincular
  // automáticamente en el próximo inicio de sesión exitoso.
  let cloud = { ok: false, attempted: false };
  if (window.isOnlineConfigured && isOnlineConfigured() && window.createOrLinkCloudAccount) {
    cloud = await createOrLinkCloudAccount(user.username, newPassword, {
      fullName: user.fullName,
      roleName: user.role,
      roleId: user.roleId,
      phone: user.phone,
      city: user.city,
      documentId: user.documentId
    }).catch(err => ({ ok: false, message: err && err.message }));
    cloud.attempted = true;
    if (cloud.ok && cloud.user) {
      user.cloudLinked = true;
      user.cloudUserId = cloud.user.id;
      await DB.put('users', user, { silent: true });
      if (cloud.session) {
        // Ya hay una sesión real de Supabase activa: se adopta de inmediato
        // en vez de seguir en modo local, ya que la persona está literalmente
        // terminando de crear su cuenta en este instante.
        applyOnlineSession(cloud.user, {
          id: cloud.user.id,
          username: user.username,
          full_name: user.fullName,
          role: user.role,
          role_id: user.roleId,
          status: 'active'
        });
      }
    }
  }

  return { ok: true, user, cloud };
}


window.NATURA_ADMIN_ACTIVATION_CODE = NATURA_ADMIN_ACTIVATION_CODE;
window.NATURA_ADMIN_ACTIVATION_CODES = NATURA_ADMIN_ACTIVATION_CODES;
