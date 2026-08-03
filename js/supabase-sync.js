/* Natura Vida V7 — Supabase único + Realtime.
   - Supabase Auth/PostgreSQL/Storage son la única fuente persistente.
   - No lee URL/key desde el teléfono.
   - No existe cola offline ni sincronización manual.
   - La memoria del navegador se repuebla desde Supabase al iniciar sesión
     y ante cada evento Realtime permitido por RLS. */

let _supabaseClient = null;
let _realtimeChannel = null;
let _realtimeRestartTimer = null;
let _backgroundStarted = false;
let _refreshInFlight = null;
let _deferredRenderPending = false;
let _authObserverSubscription = null;
const NV801_PROFILE_CACHE_PREFIX = 'nv801-profile-cache:';


// V8.4.0 — almacenamiento de autenticación persistente.
// Supabase continúa siendo el único gestor de tokens, pero utiliza un adaptador
// que mantiene una copia sincronizada en IndexedDB y localStorage. Esto protege
// la sesión frente a recargas, cambios de Service Worker y cierres normales de
// la PWA, sin copiar credenciales en archivos ni enviarlas a otro servicio.
const NV840_AUTH_STORAGE_KEY = 'nv7-auth';
const NV840_AUTH_DB_NAME = 'natura-vida-auth-v840';
const NV840_AUTH_STORE_NAME = 'auth';
const NV840_AUTH_REMOVED_PREFIX = 'nv840-auth-removed:';
const NV840_AUTH_RECOVERY_PREFIX = 'nv840-auth-recovery:';
const NV840_AUTH_EXPLICIT_UNTIL_KEY = 'nv840-auth-explicit-until';
const NV840_AUTH_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NV840_AUTH_MAX_RECOVERY_ATTEMPTS = 2;
let _nv840AuthDbPromise = null;
let _nv840AuthStorageReadyPromise = null;
const AuthStorageDiagnosticsV840 = {
  backend: 'initializing',
  indexedDbAvailable: typeof indexedDB !== 'undefined',
  localCopy: false,
  indexedDbCopy: false,
  persistentStorage: null,
  lastMirrorAt: 0,
  lastError: ''
};

function openAuthDbV840() {
  if (_nv840AuthDbPromise) return _nv840AuthDbPromise;
  _nv840AuthDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB no disponible'));
    const request = indexedDB.open(NV840_AUTH_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NV840_AUTH_STORE_NAME)) db.createObjectStore(NV840_AUTH_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB está bloqueado por otra ventana'));
  }).catch(error => {
    AuthStorageDiagnosticsV840.indexedDbAvailable = false;
    AuthStorageDiagnosticsV840.lastError = String(error?.message || error || 'IndexedDB no disponible');
    throw error;
  });
  return _nv840AuthDbPromise;
}

async function authIdbGetV840(key) {
  const db = await openAuthDbV840();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NV840_AUTH_STORE_NAME, 'readonly');
    const request = tx.objectStore(NV840_AUTH_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error('No se pudo leer IndexedDB'));
  });
}
async function authIdbSetV840(key, value) {
  const db = await openAuthDbV840();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NV840_AUTH_STORE_NAME, 'readwrite');
    tx.objectStore(NV840_AUTH_STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('No se pudo guardar IndexedDB'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB canceló el guardado'));
  });
}
async function authIdbRemoveV840(key) {
  const db = await openAuthDbV840();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NV840_AUTH_STORE_NAME, 'readwrite');
    tx.objectStore(NV840_AUTH_STORE_NAME).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('No se pudo limpiar IndexedDB'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB canceló la limpieza'));
  });
}
function authRemovalKeyV840(key) { return `${NV840_AUTH_REMOVED_PREFIX}${key}`; }
function authRecoveryKeyV840(key) { return `${NV840_AUTH_RECOVERY_PREFIX}${key}`; }
function readLocalStorageV840(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function writeLocalStorageV840(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
function removeLocalStorageV840(key) { try { localStorage.removeItem(key); return true; } catch (_) { return false; } }
function authRawFreshnessV840(raw) {
  try {
    const value = JSON.parse(String(raw || 'null')) || {};
    return Number(value.expires_at || value.expiresAt || value.currentSession?.expires_at || value.currentSession?.expiresAt || 0);
  } catch (_) { return 0; }
}
function authRawLooksRecoverableV840(raw) {
  try {
    const value = JSON.parse(String(raw || 'null')) || {};
    const candidate = value.currentSession || value;
    return !!(candidate && candidate.refresh_token && (candidate.user?.id || candidate.user));
  } catch (_) { return false; }
}
function explicitAuthRemovalV840() {
  let explicit = false;
  try { explicit = !!_explicitLogoutRequestedV833; } catch (_) {}
  try { explicit = explicit || !!sessionStorage.getItem(NV833_EXPLICIT_LOGOUT_KEY); } catch (_) {}
  const until = Number(readLocalStorageV840(NV840_AUTH_EXPLICIT_UNTIL_KEY) || 0);
  return explicit || until > Date.now();
}
async function readAuthRecoveryEnvelopeV840(key) {
  const recoveryKey = authRecoveryKeyV840(key);
  let localEnvelope = null;
  try { localEnvelope = JSON.parse(readLocalStorageV840(recoveryKey) || 'null'); } catch (_) {}
  let idbEnvelope = null;
  try { idbEnvelope = await authIdbGetV840(recoveryKey); } catch (_) {}
  const localSaved = Number(localEnvelope?.savedAt || 0);
  const idbSaved = Number(idbEnvelope?.savedAt || 0);
  return idbSaved > localSaved ? idbEnvelope : localEnvelope;
}
async function writeAuthRecoveryEnvelopeV840(key, raw, attempts = 1, reason = 'interrupción inesperada') {
  if (!authRawLooksRecoverableV840(raw)) return false;
  const envelope = { value: raw, savedAt: Date.now(), attempts: Math.max(1, Number(attempts || 1)), reason };
  writeLocalStorageV840(authRecoveryKeyV840(key), JSON.stringify(envelope));
  try { await authIdbSetV840(authRecoveryKeyV840(key), envelope); } catch (_) {}
  return true;
}
async function clearAuthRecoveryV840(key) {
  removeLocalStorageV840(authRecoveryKeyV840(key));
  try { await authIdbRemoveV840(authRecoveryKeyV840(key)); } catch (_) {}
}

const AuthStorageV840 = {
  async getItem(key) {
    let localValue = readLocalStorageV840(key);
    const removalMarker = readLocalStorageV840(authRemovalKeyV840(key));
    let idbEnvelope = null;
    try { idbEnvelope = await authIdbGetV840(key); }
    catch (_) { /* fallback local */ }
    let idbValue = typeof idbEnvelope === 'string' ? idbEnvelope : idbEnvelope?.value || null;
    const idbSavedAt = Number(idbEnvelope?.savedAt || 0);
    const removedAt = Number(removalMarker || 0);

    // Un cierre voluntario deja una marca. En ese caso jamás se resucita una
    // copia antigua. En una interrupción técnica sí se permite restaurar una
    // copia de recuperación limitada y auditada.
    if (!localValue && removedAt && removedAt >= idbSavedAt) {
      AuthStorageDiagnosticsV840.backend = 'signed-out';
      return null;
    }
    if (!localValue && !idbValue && !explicitAuthRemovalV840()) {
      const recovery = await readAuthRecoveryEnvelopeV840(key);
      const age = Date.now() - Number(recovery?.savedAt || 0);
      const attempts = Number(recovery?.attempts || 0);
      if (recovery?.value && age >= 0 && age <= NV840_AUTH_RECOVERY_TTL_MS && attempts <= NV840_AUTH_MAX_RECOVERY_ATTEMPTS && authRawLooksRecoverableV840(recovery.value)) {
        localValue = recovery.value;
        idbValue = recovery.value;
        writeLocalStorageV840(key, recovery.value);
        try { await authIdbSetV840(key, { value: recovery.value, savedAt: Date.now(), restoredFromRecovery: true }); } catch (_) {}
        AuthStorageDiagnosticsV840.recoveredFromBackup = true;
        AuthStorageDiagnosticsV840.recoveryAttempts = attempts;
      }
    }

    let chosen = localValue || idbValue || null;
    if (localValue && idbValue) {
      chosen = authRawFreshnessV840(idbValue) > authRawFreshnessV840(localValue) ? idbValue : localValue;
    }
    if (chosen) {
      if (localValue !== chosen) writeLocalStorageV840(key, chosen);
      try { await authIdbSetV840(key, { value: chosen, savedAt: Date.now() }); } catch (_) {}
      removeLocalStorageV840(authRemovalKeyV840(key));
    }
    AuthStorageDiagnosticsV840.localCopy = !!readLocalStorageV840(key);
    AuthStorageDiagnosticsV840.indexedDbCopy = !!chosen;
    AuthStorageDiagnosticsV840.backend = chosen ? (idbValue ? 'indexeddb + localStorage' : 'localStorage migrado') : 'sin sesión';
    AuthStorageDiagnosticsV840.lastMirrorAt = Date.now();
    return chosen;
  },
  async setItem(key, value) {
    removeLocalStorageV840(authRemovalKeyV840(key));
    removeLocalStorageV840(NV840_AUTH_EXPLICIT_UNTIL_KEY);
    const localOk = writeLocalStorageV840(key, value);
    let idbOk = false;
    try { idbOk = await authIdbSetV840(key, { value, savedAt: Date.now() }); }
    catch (error) { AuthStorageDiagnosticsV840.lastError = String(error?.message || error || 'No se pudo guardar la copia persistente'); }
    // Cada token renovado reemplaza también la copia de recuperación. Así la
    // reserva nunca queda más antigua que la sesión válida administrada por Auth.
    await writeAuthRecoveryEnvelopeV840(key, value, 1, 'copia sincronizada').catch(() => false);
    AuthStorageDiagnosticsV840.localCopy = localOk;
    AuthStorageDiagnosticsV840.indexedDbCopy = idbOk;
    AuthStorageDiagnosticsV840.backend = idbOk ? 'indexeddb + localStorage' : 'localStorage';
    AuthStorageDiagnosticsV840.lastMirrorAt = Date.now();
    AuthStorageDiagnosticsV840.recoveredFromBackup = false;
  },
  async removeItem(key) {
    const removedAt = Date.now();
    const explicit = explicitAuthRemovalV840();
    const localValue = readLocalStorageV840(key);
    let idbEnvelope = null;
    try { idbEnvelope = await authIdbGetV840(key); } catch (_) {}
    const currentValue = localValue || (typeof idbEnvelope === 'string' ? idbEnvelope : idbEnvelope?.value) || null;

    if (explicit) {
      removeLocalStorageV840(key);
      writeLocalStorageV840(authRemovalKeyV840(key), String(removedAt));
      await clearAuthRecoveryV840(key);
      try { await authIdbRemoveV840(key); } catch (_) {}
      try { await authIdbSetV840(authRemovalKeyV840(key), { removedAt, savedAt: removedAt }); } catch (_) {}
      AuthStorageDiagnosticsV840.backend = 'signed-out';
    } else {
      const previous = await readAuthRecoveryEnvelopeV840(key).catch(() => null);
      const attempts = Math.min(NV840_AUTH_MAX_RECOVERY_ATTEMPTS + 1, Number(previous?.attempts || 0) + 1);
      if (currentValue) await writeAuthRecoveryEnvelopeV840(key, currentValue, attempts, 'Supabase retiró temporalmente la sesión').catch(() => false);
      removeLocalStorageV840(key);
      removeLocalStorageV840(authRemovalKeyV840(key));
      try { await authIdbRemoveV840(key); } catch (_) {}
      AuthStorageDiagnosticsV840.backend = currentValue ? 'sesión en recuperación' : 'sin sesión';
      AuthStorageDiagnosticsV840.recoveryAttempts = attempts;
    }
    AuthStorageDiagnosticsV840.localCopy = false;
    AuthStorageDiagnosticsV840.indexedDbCopy = false;
    AuthStorageDiagnosticsV840.lastMirrorAt = removedAt;
  }
};

async function waitForAuthStorageV840() {
  if (!_nv840AuthStorageReadyPromise) {
    _nv840AuthStorageReadyPromise = AuthStorageV840.getItem(NV840_AUTH_STORAGE_KEY)
      .catch(() => readLocalStorageV840(NV840_AUTH_STORAGE_KEY))
      .then(value => ({ ok: true, hasSession: !!value }));
  }
  return _nv840AuthStorageReadyPromise;
}
async function mirrorAuthStorageV840() {
  const value = await AuthStorageV840.getItem(NV840_AUTH_STORAGE_KEY);
  if (value) await AuthStorageV840.setItem(NV840_AUTH_STORAGE_KEY, value);
  return { ok: !!value, hasSession: !!value };
}
async function requestPersistentStorageV840() {
  try {
    if (!navigator.storage?.persist) return false;
    const granted = await navigator.storage.persist();
    AuthStorageDiagnosticsV840.persistentStorage = !!granted;
    recordSessionContinuityV833({ persistentStorage: !!granted });
    return !!granted;
  } catch (error) {
    AuthStorageDiagnosticsV840.lastError = String(error?.message || error || 'No se pudo solicitar almacenamiento persistente');
    return false;
  }
}
async function getAuthStorageDiagnosticsV840() {
  const localValue = readLocalStorageV840(NV840_AUTH_STORAGE_KEY);
  let idbValue = null;
  try { idbValue = await authIdbGetV840(NV840_AUTH_STORAGE_KEY); } catch (_) {}
  let persisted = AuthStorageDiagnosticsV840.persistentStorage;
  try { if (navigator.storage?.persisted) persisted = await navigator.storage.persisted(); } catch (_) {}
  const recovery = await readAuthRecoveryEnvelopeV840(NV840_AUTH_STORAGE_KEY).catch(() => null);
  return Object.assign({}, AuthStorageDiagnosticsV840, {
    localCopy: !!localValue,
    indexedDbCopy: !!(typeof idbValue === 'string' ? idbValue : idbValue?.value),
    recoveryCopy: !!recovery?.value,
    recoveryAttempts: Number(recovery?.attempts || AuthStorageDiagnosticsV840.recoveryAttempts || 0),
    persistentStorage: persisted,
    storageKey: NV840_AUTH_STORAGE_KEY
  });
}


// V8.3.3 — continuidad de sesión. Solo conserva metadatos no sensibles;
// los tokens continúan administrados exclusivamente por Supabase Auth.
const NV833_SESSION_MARKER_KEY = 'nv833-session-marker';
const NV833_SESSION_DIAGNOSTICS_KEY = 'nv833-session-diagnostics';
const NV833_EXPLICIT_LOGOUT_KEY = 'nv833-explicit-logout';
let _explicitLogoutRequestedV833 = false;
let _sessionRecoveryPromiseV833 = null;
let _sessionRecoveryNoticeShownV833 = false;
let _sessionLifecycleInstalledV833 = false;
let _lastLifecycleCheckV833 = 0;
const SessionContinuityV833 = {
  state: 'initializing',
  lastAuthEvent: '',
  lastAuthEventAt: 0,
  lastRefreshAt: 0,
  lastRecoveryAt: 0,
  lastRecoveryResult: '',
  lastError: '',
  explicitLogout: false
};

function readJsonStorageV833(key, fallback = null) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (_) { return fallback; }
}
function writeJsonStorageV833(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (_) { return false; }
}
function sessionMarkerV833() { return readJsonStorageV833(NV833_SESSION_MARKER_KEY, null); }
function hasPriorSessionMarkerV833() {
  const marker = sessionMarkerV833();
  return !!(marker && marker.hadSession && !marker.explicitlySignedOut);
}
function recordSessionContinuityV833(patch = {}) {
  Object.assign(SessionContinuityV833, patch, { updatedAt: Date.now() });
  writeJsonStorageV833(NV833_SESSION_DIAGNOSTICS_KEY, SessionContinuityV833);
  window.dispatchEvent(new CustomEvent('nv:session-state', { detail: getSessionContinuityDiagnosticsV833() }));
  return SessionContinuityV833;
}
function rememberSessionPresenceV833(user, event = 'SESSION_PRESENT') {
  if (!user || !user.id) return;
  writeJsonStorageV833(NV833_SESSION_MARKER_KEY, {
    hadSession: true,
    explicitlySignedOut: false,
    userId: String(user.id),
    email: String(user.email || ''),
    lastSeenAt: Date.now(),
    lastEvent: event
  });
  try { sessionStorage.removeItem(NV833_EXPLICIT_LOGOUT_KEY); } catch (_) {}
  _explicitLogoutRequestedV833 = false;
  recordSessionContinuityV833({
    state: 'active',
    explicitLogout: false,
    lastAuthEvent: event,
    lastAuthEventAt: Date.now(),
    lastError: ''
  });
}
function markExplicitLogoutV833(value = true) {
  _explicitLogoutRequestedV833 = !!value;
  try {
    if (value) {
      sessionStorage.setItem(NV833_EXPLICIT_LOGOUT_KEY, String(Date.now()));
      localStorage.setItem(NV840_AUTH_EXPLICIT_UNTIL_KEY, String(Date.now() + 30000));
    } else {
      sessionStorage.removeItem(NV833_EXPLICIT_LOGOUT_KEY);
      localStorage.removeItem(NV840_AUTH_EXPLICIT_UNTIL_KEY);
    }
  } catch (_) {}
  recordSessionContinuityV833({ explicitLogout: !!value, state: value ? 'signing_out' : SessionContinuityV833.state });
}
function clearSessionMarkerV833() {
  try { localStorage.removeItem(NV833_SESSION_MARKER_KEY); } catch (_) {}
  // Se conserva brevemente la marca de cierre voluntario para absorber un
  // SIGNED_OUT que llegue después de que signOut() haya resuelto.
  _explicitLogoutRequestedV833 = true;
  recordSessionContinuityV833({ state: 'signed_out', explicitLogout: true, lastRecoveryResult: 'Cierre voluntario en este dispositivo' });
  setTimeout(() => {
    _explicitLogoutRequestedV833 = false;
    try { sessionStorage.removeItem(NV833_EXPLICIT_LOGOUT_KEY); localStorage.removeItem(NV840_AUTH_EXPLICIT_UNTIL_KEY); } catch (_) {}
    recordSessionContinuityV833({ explicitLogout: false });
  }, 30000);
}
function getSessionContinuityDiagnosticsV833() {
  const persisted = readJsonStorageV833(NV833_SESSION_DIAGNOSTICS_KEY, {});
  const marker = sessionMarkerV833();
  return Object.assign({}, persisted, SessionContinuityV833, {
    markerPresent: !!marker,
    rememberedUserId: marker?.userId || '',
    rememberedEmail: marker?.email || '',
    markerLastSeenAt: Number(marker?.lastSeenAt || 0),
    online: navigator.onLine,
    authenticatedInApp: !!(window.AppState?.session?.isAuthenticated)
  });
}

async function verifySessionV833(options = {}) {
  const interactive = options.interactive === true;
  const verifyServer = options.verifyServer !== false;
  const sb = getSupabaseClient();
  if (!sb) {
    const result = { ok: false, status: 'unavailable', message: 'Supabase no está disponible.' };
    recordSessionContinuityV833({ state: 'recovering', lastError: result.message, lastRecoveryResult: result.message });
    return result;
  }
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    const session = data?.session || null;
    if (!session?.user) {
      const result = { ok: false, status: 'missing', message: 'No se encontró una sesión local activa.' };
      recordSessionContinuityV833({ state: 'recovering', lastRecoveryAt: Date.now(), lastRecoveryResult: result.message });
      return result;
    }
    rememberSessionPresenceV833(session.user, 'SESSION_VERIFIED');

    // getUser valida la identidad contra Auth. Una falla de red no se interpreta
    // como cierre de sesión; la sesión local se conserva en modo degradado.
    if (verifyServer && navigator.onLine) {
      const { data: userData, error: userError } = await sb.auth.getUser();
      if (userError) {
        const message = messageFromError(userError, 'No se pudo validar la sesión en el servidor.');
        if (/failed to fetch|network|load failed|timeout/i.test(String(userError.message || userError))) {
          recordSessionContinuityV833({ state: 'recovering', lastError: message, lastRecoveryResult: 'Sesión local conservada; validación remota pendiente' });
          return { ok: true, status: 'degraded', session, user: session.user, message };
        }
        throw userError;
      }
      if (!userData?.user) throw new Error('Supabase no confirmó el usuario de la sesión.');
    }

    let current = null;
    try { current = await getOnlineSessionProfile(); } catch (_) {}
    if (current?.user && current?.profile && window.applyOnlineSession) {
      applyOnlineSession(current.user, Object.assign({}, current.profile, { __degraded: !!current.degraded }));
    }
    recordSessionContinuityV833({
      state: current?.degraded ? 'recovering' : 'active',
      lastRecoveryAt: Date.now(),
      lastRecoveryResult: current?.degraded ? 'Sesión conservada; perfil en reconexión' : 'Sesión activa y verificada',
      lastError: ''
    });
    if (interactive && window.showToast) showToast(current?.degraded ? 'La sesión continúa activa. El perfil está reconectando.' : 'Sesión activa y verificada.');
    return { ok: true, status: current?.degraded ? 'degraded' : 'active', session, user: session.user, profile: current?.profile || null };
  } catch (error) {
    const message = messageFromError(error, 'No se pudo verificar la sesión.');
    recordSessionContinuityV833({ state: 'recovering', lastRecoveryAt: Date.now(), lastRecoveryResult: 'Verificación pendiente', lastError: message });
    if (interactive && window.showToast) showToast(message, 'error');
    return { ok: false, status: 'error', message, error };
  }
}

async function recoverUnexpectedSignOutV833(reason = 'Interrupción de autenticación', options = {}) {
  if (_explicitLogoutRequestedV833) return { ok: false, status: 'explicit_logout' };
  if (_sessionRecoveryPromiseV833) return _sessionRecoveryPromiseV833;
  _sessionRecoveryPromiseV833 = (async () => {
    recordSessionContinuityV833({ state: 'recovering', lastRecoveryAt: Date.now(), lastRecoveryResult: reason, lastError: '' });
    if (window.AppState?.session) AppState.session.sessionDegraded = true;
    setCloudConnectionState(navigator.onLine ? 'connecting' : 'offline', 'Reconectando sesión · no cierres la aplicación');
    if (!_sessionRecoveryNoticeShownV833 && window.showToast) {
      _sessionRecoveryNoticeShownV833 = true;
      showToast('Reconectando la sesión. No necesitas volver a ingresar tu contraseña.');
    }

    const delays = options.quick ? [0, 500, 1200] : [250, 900, 1800, 3200];
    let last = null;
    for (const delay of delays) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      last = await verifySessionV833({ interactive: false, verifyServer: navigator.onLine });
      if (last.ok) {
        _sessionRecoveryNoticeShownV833 = false;
        if (window.AppState?.session) AppState.session.sessionDegraded = last.status === 'degraded';
        setCloudConnectionState(last.status === 'degraded' ? 'connecting' : 'online', last.status === 'degraded' ? 'Sesión conservada · validación pendiente' : 'Sesión recuperada');
        if (window.renderTopHeader) renderTopHeader();
        return last;
      }
      if (!navigator.onLine) break;
    }

    // No se borra AppState ni datos temporales. Se muestra una pantalla de
    // recuperación y el usuario decide si reintenta o cierra voluntariamente.
    recordSessionContinuityV833({ state: 'recovering', lastRecoveryResult: 'No se confirmó la sesión; esperando recuperación manual' });
    if (window.renderSessionRecoveryScreenV801) {
      renderSessionRecoveryScreenV801({ reason: last?.message || 'No se pudo confirmar la sesión todavía. Tus datos no fueron eliminados.' });
    }
    return last || { ok: false, status: 'recovering' };
  })().finally(() => { _sessionRecoveryPromiseV833 = null; });
  return _sessionRecoveryPromiseV833;
}


function isSessionWriteReadyV833() {
  const state = SessionContinuityV833.state;
  return !!(window.AppState?.session?.isAuthenticated) && !['recovering','signed_out','signing_out'].includes(state);
}
function installSessionLifecycleV833() {
  if (_sessionLifecycleInstalledV833) return;
  _sessionLifecycleInstalledV833 = true;
  const check = (reason) => {
    if (!hasPriorSessionMarkerV833() && !window.AppState?.session?.isAuthenticated) return;
    const now = Date.now();
    if (now - _lastLifecycleCheckV833 < 2500) return;
    _lastLifecycleCheckV833 = now;
    setTimeout(async () => {
      const result = await verifySessionV833({ interactive: false, verifyServer: navigator.onLine });
      if (!result.ok && !_explicitLogoutRequestedV833) recoverUnexpectedSignOutV833(reason, { quick: true }).catch(() => {});
    }, 0);
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check('La aplicación volvió del segundo plano'); });
  window.addEventListener('pageshow', () => check('La aplicación volvió a mostrarse'));
  window.addEventListener('focus', () => check('La aplicación recuperó el foco'));
  window.addEventListener('online', () => {
    if (SessionContinuityV833.state === 'recovering') recoverUnexpectedSignOutV833('Internet recuperado', { quick: true }).catch(() => {});
    else check('Internet recuperado');
  });
}

async function prepareSessionForUpdateV833() {
  await waitForAuthStorageV840().catch(() => null);
  await mirrorAuthStorageV840().catch(() => null);
  requestPersistentStorageV840().catch(() => {});
  const result = await verifySessionV833({ interactive: false, verifyServer: false });
  if (result.ok && result.user) rememberSessionPresenceV833(result.user, 'UPDATE_HANDOFF');
  try { sessionStorage.setItem('nv833-update-handoff', JSON.stringify({ at: Date.now(), userId: result.user?.id || sessionMarkerV833()?.userId || '' })); } catch (_) {}
  recordSessionContinuityV833({ lastRecoveryResult: result.ok ? 'Sesión protegida antes de actualizar' : 'Actualización iniciada con sesión pendiente de recuperación' });
  return result;
}

const CloudConnection = {
  state: navigator.onLine ? 'connecting' : 'offline',
  detail: '',
  updatedAt: Date.now()
};


function shouldDeferCloudRender() {
  if (window.V7_FORM_DIRTY) return true;
  const active = document.activeElement;
  if (!active) return false;
  const tag = String(active.tagName || '').toUpperCase();
  return ['INPUT','TEXTAREA','SELECT'].includes(tag) && !active.readOnly && !active.disabled;
}

function renderAfterCloudRefresh(context = {}) {
  if (shouldDeferCloudRender()) {
    _deferredRenderPending = true;
    return;
  }
  _deferredRenderPending = false;
  // V8.0.1: primero intenta una actualización localizada. La pantalla solo se
  // reconstruye cuando el módulo no dispone de un parche silencioso.
  if (window.nv801PatchCurrentView && nv801PatchCurrentView(context) === true) return;
  if (window.render) render();
}

function flushDeferredCloudRender() {
  if (!_deferredRenderPending || shouldDeferCloudRender()) return;
  _deferredRenderPending = false;
  if (window.render) render();
}

document.addEventListener('focusout', () => setTimeout(flushDeferredCloudRender, 180));
window.addEventListener('nv:form-saved', flushDeferredCloudRender);

function effectiveOnlineConfig() {
  return window.NATURA_ONLINE_CONFIG || {};
}

function getSavedOnlineConfig() { return null; }
function saveOnlineConfig() { return effectiveOnlineConfig(); }

function getOnlineConfigValue(key) {
  const value = effectiveOnlineConfig()[key] || '';
  return String(value).includes('PEGAR_AQUI') ? '' : value;
}

function isOnlineConfigured() {
  const cfg = effectiveOnlineConfig();
  return Boolean(
    cfg.enabled !== false &&
    cfg.supabaseUrl &&
    cfg.supabaseAnonKey &&
    !String(cfg.supabaseUrl).includes('PEGAR_AQUI') &&
    !String(cfg.supabaseAnonKey).includes('PEGAR_AQUI')
  );
}

function setCloudConnectionState(state, detail = '') {
  CloudConnection.state = state;
  CloudConnection.detail = detail || '';
  CloudConnection.updatedAt = Date.now();
  window.dispatchEvent(new CustomEvent('nv:connection', {
    detail: Object.assign({}, CloudConnection)
  }));
}

function getSupabaseClient() {
  if (!isOnlineConfigured()) return null;
  if (_supabaseClient) return _supabaseClient;
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    setCloudConnectionState('error', 'No cargó la librería de Supabase');
    return null;
  }
  const cfg = effectiveOnlineConfig();
  _supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: NV840_AUTH_STORAGE_KEY,
      storage: AuthStorageV840
    },
    realtime: { params: { eventsPerSecond: 10 } }
  });
  return _supabaseClient;
}

function appRedirectUrl() {
  const path = window.location.pathname.replace(/index\.html$/i, '');
  return `${window.location.origin}${path}`;
}

function messageFromError(error, fallback = 'No se pudo completar la operación.') {
  const raw = String((error && error.message) || error || fallback);
  if (/audit_log.*user_id|column ["']?user_id["']? of relation ["']?audit_log/i.test(raw)) {
    return 'La base de datos de ventas necesita la migración V7.2. La venta no fue registrada ni debe repetirse hasta aplicar el archivo SQL incluido.';
  }
  if (/invalid api key/i.test(raw)) return 'La Publishable key de Supabase no es válida o no pertenece a este proyecto.';
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(raw)) return 'Se perdió la conexión con Supabase. Se verificará si la operación alcanzó a guardarse antes de permitir reintentar.';
  if (/email not confirmed/i.test(raw)) return 'Confirma primero el mensaje enviado a tu Gmail.';
  if (/invalid login credentials/i.test(raw)) return 'Correo o contraseña incorrectos.';
  if (/row-level security|violates row level security|permission denied/i.test(raw)) return 'Supabase rechazó la operación por permisos. Revisa las políticas RLS de la migración V7.2.';
  if (/duplicate key|already exists/i.test(raw)) return 'La operación ya existe y no se volverá a registrar.';
  return raw.length > 220 ? fallback : raw;
}

async function requireClient() {
  if (!navigator.onLine) throw new Error('Sin internet. Natura Vida trabaja directamente con Supabase.');
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase no está configurado correctamente.');
  return sb;
}

// ---------------------------------------------------------------------------
// AUTH Y PERFILES
// ---------------------------------------------------------------------------
async function fetchCurrentProfile(userId) {
  const sb = await requireClient();
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(messageFromError(error));
  return data || null;
}

async function ensureSignedInProfile() {
  const sb = await requireClient();
  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError) throw new Error(messageFromError(sessionError));
  const user = sessionData && sessionData.session && sessionData.session.user;
  if (!user) return null;
  const { error: ensureError } = await sb.rpc('ensure_my_profile');
  if (ensureError) throw new Error(messageFromError(ensureError));
  const profile = await fetchCurrentProfile(user.id);
  return profile ? { user, profile } : null;
}

async function onlineSignIn(email, password) {
  try {
    const sb = await requireClient();
    setCloudConnectionState('connecting', 'Verificando acceso');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: messageFromError(error) };
    const { error: ensureError } = await sb.rpc('ensure_my_profile');
    if (ensureError) return { ok: false, message: messageFromError(ensureError) };
    const profile = await fetchCurrentProfile(data.user.id);
    if (profile) cacheOnlineProfileV801(data.user.id, profile);
    if (!profile) return { ok: false, message: 'La cuenta existe, pero su perfil no fue creado. Ejecuta la migración SQL de Natura Vida V7.' };
    if (String(profile.status).toLowerCase() === 'bloqueado') {
      markExplicitLogoutV833(true);
      await sb.auth.signOut({ scope: 'local' });
      clearSessionMarkerV833();
      return { ok: false, message: 'Esta cuenta está bloqueada. Contacta al administrador.' };
    }
    rememberSessionPresenceV833(data.user, 'SIGNED_IN');
    requestPersistentStorageV840().catch(() => {});
    setCloudConnectionState('online', 'Sesión autenticada');
    return { ok: true, user: data.user, profile };
  } catch (error) {
    setCloudConnectionState('error', messageFromError(error));
    return { ok: false, message: messageFromError(error) };
  }
}

async function onlineSignOut(options = {}) {
  stopRealtimeSubscriptions();
  const explicit = options.explicit !== false;
  const scope = options.scope || 'local';
  if (explicit) markExplicitLogoutV833(true);
  const sb = getSupabaseClient();
  if (sb) await sb.auth.signOut({ scope }).catch(() => {});
  if (explicit) clearSessionMarkerV833();
  setCloudConnectionState(navigator.onLine ? 'connecting' : 'offline', explicit ? 'Sesión cerrada en este dispositivo' : 'Sesión en reconexión');
}


function profileCacheKeyV801(userId) { return `${NV801_PROFILE_CACHE_PREFIX}${userId}`; }
function cacheOnlineProfileV801(userId, profile) {
  if (!userId || !profile) return;
  try { localStorage.setItem(profileCacheKeyV801(userId), JSON.stringify({ profile, cachedAt: Date.now() })); } catch (_) {}
}
function readCachedOnlineProfileV801(userId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(profileCacheKeyV801(userId)) || 'null');
    return parsed && parsed.profile ? parsed.profile : null;
  } catch (_) { return null; }
}

async function getOnlineSessionProfile() {
  const sb = getSupabaseClient();
  if (!sb) return { status: 'profile_unavailable', user: null, profile: null, reason: 'Supabase no está disponible.' };
  let sessionResult;
  try { sessionResult = await sb.auth.getSession(); }
  catch (error) {
    console.warn('No se pudo consultar la sesión:', messageFromError(error));
    return { status: 'profile_unavailable', user: null, profile: null, reason: messageFromError(error) };
  }
  if (sessionResult && sessionResult.error) {
    return { status: 'session_error', user: null, profile: null, reason: messageFromError(sessionResult.error) };
  }
  const session = sessionResult && sessionResult.data && sessionResult.data.session;
  const user = session && session.user;
  if (!user) return null;

  // La sesión existe. Una falla de red o de perfil no debe convertirse en un
  // falso cierre de sesión: se conserva la identidad y se usa la última ficha.
  const cachedProfile = readCachedOnlineProfileV801(user.id);
  if (!navigator.onLine) {
    return { user, profile: cachedProfile, status: 'profile_unavailable', degraded: true, reason: 'Sin conexión. Se conserva la sesión.' };
  }
  try {
    const { error: ensureError } = await sb.rpc('ensure_my_profile');
    if (ensureError) throw ensureError;
    const profile = await fetchCurrentProfile(user.id);
    if (!profile) throw new Error('El perfil todavía no está disponible.');
    cacheOnlineProfileV801(user.id, profile);
    return { user, profile, status: 'ready', degraded: false };
  } catch (error) {
    console.warn('Sesión conservada; perfil temporalmente no disponible:', messageFromError(error));
    return { user, profile: cachedProfile, status: 'profile_unavailable', degraded: true, reason: messageFromError(error) };
  }
}

function installAuthObserverV801() {
  const sb = getSupabaseClient();
  installSessionLifecycleV833();
  if (!sb || _authObserverSubscription) return;
  const listener = sb.auth.onAuthStateChange((event, session) => {
    recordSessionContinuityV833({
      lastAuthEvent: event,
      lastAuthEventAt: Date.now(),
      lastRefreshAt: event === 'TOKEN_REFRESHED' ? Date.now() : SessionContinuityV833.lastRefreshAt
    });

    // El callback se mantiene síncrono. Las verificaciones asíncronas se
    // programan fuera del evento para evitar bloquear el cliente de Auth.
    if (event === 'SIGNED_OUT') {
      const explicit = _explicitLogoutRequestedV833 || (() => { try { return !!sessionStorage.getItem(NV833_EXPLICIT_LOGOUT_KEY); } catch (_) { return false; } })();
      if (explicit) {
        clearSessionMarkerV833();
        return;
      }
      setTimeout(() => recoverUnexpectedSignOutV833('Supabase emitió SIGNED_OUT sin cierre voluntario').catch(() => {}), 0);
      return;
    }

    if (session?.user) rememberSessionPresenceV833(session.user, event);
    if (session && session.user && ['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)) {
      setCloudConnectionState('connecting', event === 'TOKEN_REFRESHED' ? 'Sesión renovada' : 'Verificando perfil');
      setTimeout(() => {
        getOnlineSessionProfile().then(current => {
          if (current && current.user && current.profile && window.applyOnlineSession) {
            applyOnlineSession(current.user, Object.assign({}, current.profile, { __degraded: !!current.degraded }));
            if (window.renderTopHeader) renderTopHeader();
            setCloudConnectionState(current.degraded ? 'connecting' : 'online', current.degraded ? 'Perfil en reconexión' : 'Sesión activa');
            recordSessionContinuityV833({ state: current.degraded ? 'recovering' : 'active', lastRecoveryResult: current.degraded ? 'Perfil en reconexión' : 'Sesión activa' });
          }
        }).catch(() => {});
      }, 0);
    }
  });
  _authObserverSubscription = listener && listener.data && listener.data.subscription;
}

async function resendSignupConfirmation(email) {
  try {
    const sb = await requireClient();
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return { ok: false, message: 'Ingresa el correo utilizado al registrarte.' };
    const { error } = await sb.auth.resend({
      type: 'signup',
      email: clean,
      options: { emailRedirectTo: appRedirectUrl() }
    });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, message: `Correo de confirmación reenviado a ${clean}.` };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function upsertCloudProfileForUser(userId, _username, profile = {}) {
  const sb = await requireClient();
  const current = await sb.auth.getUser();
  if (!current.data || !current.data.user || current.data.user.id !== userId) {
    return { ok: false, message: 'Solo puedes actualizar tu propio perfil.' };
  }
  const { data, error } = await sb.rpc('update_my_profile', {
    p_full_name: profile.fullName || profile.full_name || '',
    p_phone: profile.phone || '',
    p_city: profile.city || ''
  });
  return error ? { ok: false, message: messageFromError(error) } : { ok: true, profile: data };
}

async function signUpEmailAccount(email, password, fullName, extra = {}) {
  try {
    const sb = await requireClient();
    setCloudConnectionState('connecting', 'Creando cuenta');
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: appRedirectUrl(),
        data: {
          full_name: fullName || '',
          phone: extra.phone || '',
          city: extra.city || ''
        }
      }
    });
    if (error) return { ok: false, message: messageFromError(error) };
    if (!data || !data.user) return { ok: false, message: 'Supabase no devolvió el usuario creado.' };
    if (!data.session) {
      return {
        ok: true,
        user: data.user,
        needsEmailConfirmation: true,
        message: 'Cuenta creada. Revisa tu Gmail y confirma el correo antes de iniciar sesión.'
      };
    }
    const { error: ensureError } = await sb.rpc('ensure_my_profile');
    if (ensureError) return { ok: false, message: messageFromError(ensureError) };
    const profile = await fetchCurrentProfile(data.user.id);
    if (profile) cacheOnlineProfileV801(data.user.id, profile);
    setCloudConnectionState('online', 'Cuenta creada');
    return { ok: true, user: data.user, profile };
  } catch (error) {
    setCloudConnectionState('error', messageFromError(error));
    return { ok: false, message: messageFromError(error) };
  }
}

async function sendPasswordRecoveryEmail(email) {
  try {
    const sb = await requireClient();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appRedirectUrl() });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function waitForPasswordRecoverySession(timeoutMs = 7000) {
  const sb = getSupabaseClient();
  if (!sb) return false;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data } = await sb.auth.getSession();
    if (data && data.session) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

async function updateCurrentUserPassword(newPassword) {
  try {
    if (!newPassword || newPassword.length < 6) return { ok: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    const sb = await requireClient();
    const { error } = await sb.auth.updateUser({ password: newPassword });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, message: 'Contraseña actualizada correctamente.' };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function touchLastLogin() {
  try {
    const sb = await requireClient();
    const { error } = await sb.rpc('touch_last_login');
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function setProfileStatus(userId, statusCanonical) {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.rpc('admin_set_profile_status', {
      p_user_id: userId,
      p_status: statusCanonical
    });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, profile: data };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function fetchAllProfilesForAdmin() {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, profiles: data || [] };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

const fetchCloudProfiles = fetchAllProfilesForAdmin;
const updateCloudProfileStatus = setProfileStatus;

// ---------------------------------------------------------------------------
// FOTOS Y PRODUCTOS
// ---------------------------------------------------------------------------
function isDataUrlImage(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function dataUrlToBlob(dataUrl) {
  const [meta = '', encoded = ''] = String(dataUrl || '').split(',');
  const mime = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadProductPhotoIfNeeded(product) {
  if (!product || !isDataUrlImage(product.photo)) return product && product.photo ? product.photo : null;
  const sb = await requireClient();
  const bucket = effectiveOnlineConfig().productImagesBucket || 'product-images';
  const safeId = String(product.id || uid('prod')).replace(/[^a-z0-9_-]/gi, '_');
  const path = `${safeId}/main.jpg`;
  const blob = dataUrlToBlob(product.photo);
  const { error } = await sb.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '86400'
  });
  if (error) throw new Error(`No se pudo subir la imagen: ${messageFromError(error)}`);
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  if (!data || !data.publicUrl) throw new Error('Supabase Storage no devolvió la URL de la imagen.');
  return `${data.publicUrl}?v=${Date.now()}`;
}

function stripEmbeddedImages(value) {
  if (!value || typeof value !== 'object') return value;
  const result = JSON.parse(JSON.stringify(value));
  if (isDataUrlImage(result.photo)) result.photo = null;
  if (result.payload && typeof result.payload === 'object') result.payload = stripEmbeddedImages(result.payload);
  return result;
}

async function mapProductToCloud(product) {
  const p = normalizeLegacyProduct(product);
  const photoUrl = await uploadProductPhotoIfNeeded(p);
  const payload = stripEmbeddedImages(Object.assign({}, p, { photo: photoUrl }));
  return {
    id: p.id,
    name: p.name,
    category: p.category || 'General',
    sku: p.sku || '',
    description: p.description || '',
    cost: Number(p.cost || 0),
    market_price: Number(p.marketPrice ?? p.wholesaleMarketPrice ?? p.marketPriceFixed ?? 0),
    reseller_price: Number(p.resellerPrice ?? p.wholesalePriceFixed ?? 0),
    public_price: Number(p.publicPrice ?? p.unitPriceFixed ?? 0),
    stock: Number(p.stock || 0),
    photo_url: photoUrl,
    status: p.status || 'active',
    payload
  };
}

function mapProductFromCloud(row, repStockMap = null, repPrefsMap = null) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const centralStock = Number(row.stock || 0);
  const stockEntry = repStockMap && repStockMap.has(row.id) ? repStockMap.get(row.id) : null;
  const ownStock = stockEntry && typeof stockEntry === 'object' ? Number(stockEntry.stock || 0) : Number(stockEntry || 0);
  const acquisitionCost = stockEntry && typeof stockEntry === 'object' ? Number(stockEntry.acquisitionCost || 0) : 0;
  const prefs = repPrefsMap && repPrefsMap.has(row.id) ? repPrefsMap.get(row.id) : {};
  return normalizeLegacyProduct(Object.assign({}, payload, prefs, {
    id: row.id,
    name: row.name,
    category: row.category || 'General',
    sku: row.sku || '',
    description: row.description || '',
    cost: Number(row.cost || 0),
    marketPrice: Number(row.market_price || 0),
    wholesaleMarketPrice: Number(row.market_price || 0),
    resellerPrice: Number(row.reseller_price || 0),
    publicPrice: Number(row.public_price || 0),
    marketPriceFixed: Number(row.market_price || 0),
    wholesalePriceFixed: Number(row.reseller_price || 0),
    unitPriceFixed: Number(row.public_price || 0),
    stock: window.isReseller && isReseller() ? ownStock : centralStock,
    adminStock: centralStock,
    resellerAcquisitionCost: acquisitionCost || (AppState.session?.commercialRole === 'field_seller' ? 0 : Number(row.reseller_price || 0)),
    stockOwnerUserId: stockEntry && stockEntry.stockOwnerUserId || null,
    stockPointId: stockEntry && stockEntry.stockPointId || null,
    stockSourceLabel: stockEntry && stockEntry.stockSourceLabel || (window.isReseller && isReseller() ? 'Stock propio' : 'Stock central'),
    stockReadOnly: !!(stockEntry && stockEntry.readOnly),
    photo: row.photo_url || null,
    status: row.status || 'active',
    syncStatus: 'cloud',
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  }));
}

async function fetchRepresentativeStockMap() {
  if (!AppState.session || !AppState.session.onlineUserId) return new Map();
  const sb = await requireClient();
  if (AppState.session.commercialRole === 'field_seller') {
    const { data, error } = await sb.rpc('nv801_my_sellable_stock');
    if (error) throw new Error(messageFromError(error));
    return new Map((data || []).map(row => [row.product_id, {
      stock: Number(row.quantity || 0),
      acquisitionCost: 0,
      stockOwnerUserId: row.stock_owner_user_id || null,
      stockPointId: row.stock_point_id || null,
      stockSourceLabel: row.stock_source_label || 'Stock asignado',
      readOnly: true
    }]));
  }
  const { data, error } = await sb.from('representative_stock')
    .select('product_id,stock,acquisition_cost')
    .eq('representative_user_id', AppState.session.onlineUserId);
  if (error) throw new Error(messageFromError(error));
  return new Map((data || []).map(row => [row.product_id, {
    stock: Number(row.stock || 0),
    acquisitionCost: Number(row.acquisition_cost || 0),
    stockOwnerUserId: AppState.session.onlineUserId,
    stockPointId: null,
    stockSourceLabel: 'Stock propio',
    readOnly: false
  }]));
}

async function syncCloudProductsToLocal() {
  const sb = await requireClient();
  const { data, error } = await sb.from('products').select('*').eq('status', 'active').order('updated_at', { ascending: true });
  if (error) return { ok: false, message: messageFromError(error) };
  let repStockMap = null;
  let repPrefsMap = null;
  if (window.isReseller && isReseller()) {
    repStockMap = await fetchRepresentativeStockMap();
    if (AppState.session.commercialRole !== 'field_seller') {
      const { data: prefRows, error: prefError } = await sb.from('representative_product_preferences')
        .select('*').eq('representative_user_id', AppState.session.onlineUserId);
      if (prefError) return { ok: false, message: messageFromError(prefError) };
      repPrefsMap = new Map((prefRows || []).map(row => [row.product_id, {
        resellerAdditionalCost: Number(row.additional_cost || 0),
        resellerLocalUnitPrice: Number(row.unit_price || 0),
        resellerLocalWholesalePrice: Number(row.wholesale_price || 0),
        resellerLocalNote: row.note || '',
        resellerLocalUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
      }]));
    } else repPrefsMap = new Map();
  }
  const products = (data || []).map(row => mapProductFromCloud(row, repStockMap, repPrefsMap));
  await DB.clear('products');
  if (products.length) await DB.bulkPut('products', products, { silent: true });
  AppState.products = products;
  return { ok: true, count: products.length };
}

async function upsertCloudProduct(product) {
  try {
    if (!isAdmin()) return { ok: false, message: 'Solo el administrador puede modificar productos.' };
    const sb = await requireClient();
    const row = await mapProductToCloud(product);
    const { data, error } = await sb.from('products').upsert(row, { onConflict: 'id' }).select().single();
    if (error) return { ok: false, message: messageFromError(error) };
    return { ok: true, row: data };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function deleteCloudProduct(productId) {
  try {
    if (!isAdmin()) return { ok: false, message: 'Solo el administrador puede eliminar productos.' };
    const sb = await requireClient();
    const { error } = await sb.from('products').update({ status: 'archived' }).eq('id', productId);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function pushLocalProductsToCloud() {
  return { ok: false, message: 'La publicación manual fue eliminada. Cada producto se guarda directamente en Supabase.' };
}

function generateMovementId() {
  return crypto.randomUUID ? crypto.randomUUID() : `mov_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function adjustRepresentativeStockRemote(productId, delta, movementId = generateMovementId()) {
  try {
    const sb = await requireClient();
    const cleanDelta = Number(delta || 0);
    if (!Number.isFinite(cleanDelta) || cleanDelta === 0) return { ok: true, stock: null };
    const { data, error } = await sb.rpc('adjust_representative_stock', {
      p_movement_id: movementId,
      p_product_id: productId,
      p_delta: cleanDelta
    });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, stock: Number(data || 0), movementId };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function queueRepresentativeStockDelta(productId, delta) {
  // Nombre conservado para compatibilidad. Ya no existe cola: la operación
  // se confirma ahora mismo en Supabase o falla sin alterar la memoria.
  return adjustRepresentativeStockRemote(productId, delta, generateMovementId());
}

async function updateRepresentativeInventoryRemote(productId, delta, preferences = {}, movementId = generateMovementId()) {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.rpc('update_representative_inventory', {
      p_movement_id: movementId,
      p_product_id: productId,
      p_delta: Number(delta || 0),
      p_additional_cost: Number(preferences.additionalCost || 0),
      p_unit_price: Number(preferences.unitPrice || 0),
      p_wholesale_price: Number(preferences.wholesalePrice || 0),
      p_note: String(preferences.note || '')
    });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, stock: Number(data || 0), movementId };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

// ---------------------------------------------------------------------------
// CLIENTES, VENTAS Y REGISTROS MODULARES
// ---------------------------------------------------------------------------
function mapClientToCloud(client) {
  return {
    id: client.id,
    owner_user_id: client.ownerUserId || AppState.session.onlineUserId,
    name: client.name || '',
    phone: client.phone || '',
    price_group_id: client.priceGroupId || '',
    payload: client
  };
}

function mapClientFromCloud(row) {
  const payload = row.payload || {};
  return Object.assign({}, payload, {
    id: row.id,
    name: row.name || '',
    phone: row.phone || '',
    priceGroupId: row.price_group_id || '',
    ownerUserId: row.owner_user_id,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    syncStatus: 'cloud'
  });
}

async function upsertCloudClient(client) {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('clients').upsert(mapClientToCloud(client), { onConflict: 'id' });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function deleteCloudClient(clientId) {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('clients').delete().eq('id', clientId);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function syncCloudClientsToLocal() {
  const sb = await requireClient();
  const { data, error } = await sb.from('clients').select('*').order('updated_at', { ascending: true });
  if (error) return { ok: false, message: messageFromError(error) };
  const rows = (data || []).map(mapClientFromCloud);
  await DB.clear('clients');
  if (rows.length) await DB.bulkPut('clients', rows, { silent: true });
  AppState.clients = rows;
  return { ok: true, count: rows.length };
}

function mapSaleFromCloud(row) {
  const payload = row.payload || {};
  return Object.assign({}, payload, {
    id: row.id,
    sellerId: row.seller_user_id,
    sellerName: row.seller_name || '',
    clientName: row.client_name || '',
    clientPhone: row.client_phone || '',
    type: row.sale_type || 'unit',
    total: Number(row.total || 0),
    sellerProfit: Number(row.seller_profit || 0),
    stockOwnerUserId: row.stock_owner_user_id || payload.stockOwnerUserId || null,
    ownerUserId: row.stock_owner_user_id || payload.stockOwnerUserId || row.seller_user_id,
    stockPointId: row.stock_point_id || payload.stockPointId || null,
    regionName: row.region_name || payload.regionName || '',
    operationCity: row.operation_city || payload.operationCity || '',
    linkedSeller: !!payload.linkedSeller,
    date: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    syncStatus: 'cloud'
  });
}

async function syncCloudSalesToLocal() {
  const sb = await requireClient();
  const { data, error } = await sb.from('sales').select('*').order('created_at', { ascending: true });
  if (error) return { ok: false, message: messageFromError(error) };
  const rows = (data || []).map(mapSaleFromCloud);
  await DB.clear('sales');
  if (rows.length) await DB.bulkPut('sales', rows, { silent: true });
  AppState.sales = rows;
  return { ok: true, count: rows.length };
}

async function findCloudSaleById(saleId) {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.from('sales').select('*').eq('id', String(saleId)).maybeSingle();
    if (error) return { ok: false, message: messageFromError(error) };
    return { ok: true, sale: data || null };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function insertCloudSale(sale) {
  try {
    const sb = await requireClient();
    const items = (sale.items || []).map(item => ({
      product_id: item.productId,
      qty: Number(item.qty || 0)
    }));
    const rpcName = AppState.session?.commercialRole === 'field_seller'
      ? 'nv801_register_linked_sale_atomic'
      : 'register_sale_atomic';
    const enrichedSale = AppState.session?.commercialRole === 'field_seller'
      ? Object.assign({}, sale, {
          stockOwnerUserId: AppState.session.stockOwnerUserId || null,
          stockPointId: AppState.session.stockPointId || null,
          regionName: AppState.session.regionName || '',
          operationCity: AppState.session.operationCity || AppState.session.city || '',
          linkedSeller: true
        })
      : sale;
    const { data, error } = await sb.rpc(rpcName, {
      p_sale: enrichedSale,
      p_items: items
    });
    if (!error) return { ok: true, sale: data };

    // Una respuesta puede perderse después de que PostgreSQL confirmó la venta.
    // Antes de permitir un reintento se consulta el mismo ID, evitando duplicados.
    const uncertain = /failed to fetch|networkerror|load failed|fetch failed|timeout|duplicate key|already exists/i.test(String(error.message || error));
    if (uncertain && sale && sale.id && navigator.onLine) {
      await new Promise(resolve => setTimeout(resolve, 350));
      const check = await findCloudSaleById(sale.id);
      if (check.ok && check.sale) return { ok: true, sale: check.sale, recovered: true };
    }
    return { ok: false, message: messageFromError(error) };
  } catch (error) {
    if (sale && sale.id && navigator.onLine) {
      const check = await findCloudSaleById(sale.id);
      if (check.ok && check.sale) return { ok: true, sale: check.sale, recovered: true };
    }
    return { ok: false, message: messageFromError(error) };
  }
}

const CLOUD_GENERIC_STORES = [
  'priceGroups', 'quotes', 'settings', 'inventoryMovements',
  'commissions', 'commissionRules', 'representatives', 'dispatches',
  'representativeReports', 'expenses', 'receivablePayments', 'historicalReceivables', 'financialDocuments', 'paymentPlans'
];
const CLOUD_SHARED_STORES = new Set(['priceGroups', 'settings', 'commissionRules']);

function recordIdForStore(storeName, record) {
  return String(storeName === 'settings' ? (record.key || 'main') : (record.id || ''));
}

async function upsertGenericCloudRecord(storeName, record) {
  try {
    const sb = await requireClient();
    const ownerUserId = AppState.session && AppState.session.onlineUserId;
    const recordId = recordIdForStore(storeName, record);
    if (!ownerUserId || !recordId) return { ok: false, message: 'Registro sin usuario o identificador.' };
    const visibility = CLOUD_SHARED_STORES.has(storeName) && isAdmin() ? 'shared' : 'private';
    const scopedRecord = storeName === 'priceGroups'
      ? Object.assign({}, record, {
          scope: isAdmin() ? 'central' : 'representative_local',
          ownerUserId
        })
      : record;
    const { error } = await sb.from('app_records').upsert({
      store_name: storeName,
      record_id: recordId,
      owner_user_id: ownerUserId,
      visibility,
      payload: scopedRecord
    }, { onConflict: 'store_name,record_id,owner_user_id' });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function deleteGenericCloudRecord(storeName, recordId) {
  try {
    const sb = await requireClient();
    const ownerUserId = AppState.session && AppState.session.onlineUserId;
    const { error } = await sb.from('app_records').delete()
      .eq('store_name', storeName)
      .eq('record_id', String(recordId))
      .eq('owner_user_id', ownerUserId);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function syncGenericCloudRecordsToLocal() {
  const sb = await requireClient();
  const { data, error } = await sb.from('app_records').select('*')
    .in('store_name', CLOUD_GENERIC_STORES)
    .order('updated_at', { ascending: true });
  if (error) return { ok: false, message: messageFromError(error) };
  const grouped = new Map(CLOUD_GENERIC_STORES.map(name => [name, []]));
  const currentUserId = AppState.session && AppState.session.onlineUserId;
  const centralGroups = [];
  const ownRepresentativeGroups = [];
  (data || []).forEach(row => {
    if (!grouped.has(row.store_name) || !row.payload) return;
    const payload = Object.assign({}, row.payload, {
      _cloudOwnerUserId: row.owner_user_id,
      _cloudVisibility: row.visibility
    });
    if (row.store_name === 'priceGroups') {
      const isCentral = row.visibility === 'shared' || payload.scope === 'central';
      if (isCentral) centralGroups.push(payload);
      if (row.owner_user_id === currentUserId && !isCentral) ownRepresentativeGroups.push(payload);
      return;
    }
    grouped.get(row.store_name).push(payload);
  });
  grouped.set('priceGroups', isAdmin() ? centralGroups : ownRepresentativeGroups);
  AppState.centralPriceGroups = centralGroups;
  for (const [name, rows] of grouped) {
    await DB.clear(name);
    if (rows.length) await DB.bulkPut(name, rows, { silent: true });
  }
  return { ok: true, count: (data || []).length, centralPriceGroups: centralGroups.length, ownPriceGroups: ownRepresentativeGroups.length };
}

// ---------------------------------------------------------------------------
// PEDIDOS Y MENSAJES
// ---------------------------------------------------------------------------
function mapPurchaseOrderToCloud(order) {
  return {
    id: order.id,
    representative_user_id: AppState.session.onlineUserId,
    representative_name: order.representativeName || AppState.session.fullName || '',
    status: order.status || 'pending',
    total: Number(order.total || 0),
    note: order.note || '',
    supplier_user_id: order.supplierUserId || AppState.session.supplierUserId || null,
    supplier_name: order.supplierName || (window.profileNameV800 ? profileNameV800(order.supplierUserId || AppState.session.supplierUserId) : '') || 'Stock central Natura Vida',
    region_name: order.regionName || AppState.session.regionName || AppState.session.city || '',
    regional_manager_user_id: order.regionalManagerUserId || AppState.session.managerUserId || null,
    payload: Object.assign({}, order, {
      supplierUserId: order.supplierUserId || AppState.session.supplierUserId || null,
      regionName: order.regionName || AppState.session.regionName || AppState.session.city || '',
      regionalManagerUserId: order.regionalManagerUserId || AppState.session.managerUserId || null
    })
  };
}

async function insertCloudPurchaseOrder(order) {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('purchase_orders').upsert(mapPurchaseOrderToCloud(order), { onConflict: 'id' });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function fetchCloudPurchaseOrders() {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return { ok: false, message: messageFromError(error) };
    const orders = (data || []).map(row => Object.assign({}, row.payload || {}, {
      id: row.id,
      representativeId: row.representative_user_id,
      representativeName: row.representative_name,
      status: row.status,
      total: Number(row.total || 0),
      note: row.note || '',
      supplierUserId: row.supplier_user_id || (row.payload || {}).supplierUserId || null,
      supplierName: row.supplier_name || (row.payload || {}).supplierName || 'Stock central Natura Vida',
      regionName: row.region_name || (row.payload || {}).regionName || '',
      regionalManagerUserId: row.regional_manager_user_id || (row.payload || {}).regionalManagerUserId || null,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      syncStatus: 'cloud'
    }));
    return { ok: true, orders };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function updateCloudPurchaseOrderStatus(orderId, status) {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.rpc('admin_set_order_status', {
      p_order_id: orderId,
      p_status: status
    });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, order: data };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

function mapMessageToCloud(message) {
  const m = window.normalizeMessage ? normalizeMessage(message) : message;
  return {
    id: m.id,
    type: m.type || 'general',
    title: m.title || 'Mensaje',
    body: m.body || '',
    sender_user_id: AppState.session.onlineUserId,
    sender_name: m.senderName || AppState.session.fullName || '',
    sender_role: m.senderRole || AppState.session.roleName || '',
    recipient_role: m.recipientRole || 'Administrador',
    recipient_user_id: m.recipientUserId || null,
    status: m.status || 'unread',
    payload: m.payload || {}
  };
}

function mapMessageFromCloud(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    senderUserId: row.sender_user_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    recipientRole: row.recipient_role,
    recipientUserId: row.recipient_user_id,
    status: row.status,
    payload: row.payload || {},
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

async function insertCloudMessage(message) {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('messages').upsert(mapMessageToCloud(message), { onConflict: 'id' });
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function fetchCloudInboxMessages() {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(100);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, messages: (data || []).map(mapMessageFromCloud) };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function markCloudMessageRead(messageId) {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('messages').update({ status: 'read' }).eq('id', messageId);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}



async function fetchRepresentativeStockForAdminV725(userId) {
  try {
    const sb = await requireClient();
    const { data: stockRows, error } = await sb.from('representative_stock')
      .select('product_id,stock,acquisition_cost,updated_at')
      .eq('representative_user_id', userId);
    if (error) return { ok: false, message: messageFromError(error) };
    const productIds = (stockRows || []).map(r => r.product_id).filter(Boolean);
    let productMap = new Map();
    if (productIds.length) {
      const { data: products } = await sb.from('products').select('id,name,category,reseller_price,public_price,market_price,photo_url').in('id', productIds);
      productMap = new Map((products || []).map(p => [p.id, p]));
    }
    const rows = (stockRows || []).map(r => {
      const p = productMap.get(r.product_id) || {};
      return { productId: r.product_id, productName: p.name || r.product_id, category: p.category || 'General', stock: Number(r.stock || 0), acquisitionCost: Number(r.acquisition_cost || p.reseller_price || 0), updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(), photo: p.photo_url || '' };
    });
    return { ok: true, rows };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

async function fetchRepresentativeOrdersForAdminV725(userId) {
  try {
    const sb = await requireClient();
    const { data, error } = await sb.from('purchase_orders').select('*').eq('representative_user_id', userId).order('created_at', { ascending: false }).limit(50);
    if (error) return { ok: false, message: messageFromError(error) };
    return { ok: true, orders: (data || []).map(row => Object.assign({}, row.payload || {}, { id: row.id, status: row.status, total: Number(row.total || 0), createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now() })) };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

// ---------------------------------------------------------------------------
// ESCRITURA ÚNICA PARA EL ADAPTADOR DE MEMORIA
// ---------------------------------------------------------------------------
async function cloudAfterPut(storeName, record) {
  if (!navigator.onLine) throw new Error('Sin internet. El registro no fue guardado.');
  if (!AppState.session || AppState.session.pendingApproval || !canOperate()) throw new Error('La cuenta no está habilitada para operar.');
  let result;
  if (storeName === 'products') result = await upsertCloudProduct(record);
  else if (storeName === 'clients') result = await upsertCloudClient(record);
  else if (storeName === 'sales') result = await insertCloudSale(record);
  else if (storeName === 'purchaseOrders') result = await insertCloudPurchaseOrder(record);
  else if (storeName === 'messages') result = await insertCloudMessage(record);
  else if (CLOUD_GENERIC_STORES.includes(storeName)) result = await upsertGenericCloudRecord(storeName, record);
  else result = { ok: true, skipped: true };
  if (!result || result.ok === false) throw new Error((result && result.message) || 'Supabase rechazó el registro.');
  setCloudConnectionState('online', `Guardado en Supabase: ${storeName}`);
  return result;
}

async function cloudAfterDelete(storeName, id) {
  if (!navigator.onLine) throw new Error('Sin internet. No se eliminó el registro.');
  if (!AppState.session || AppState.session.pendingApproval || !canOperate()) throw new Error('La cuenta no está habilitada para operar.');
  let result;
  if (storeName === 'products') result = await deleteCloudProduct(id);
  else if (storeName === 'clients') result = await deleteCloudClient(id);
  else if (CLOUD_GENERIC_STORES.includes(storeName)) result = await deleteGenericCloudRecord(storeName, id);
  else result = { ok: true, skipped: true };
  if (!result || result.ok === false) throw new Error((result && result.message) || 'Supabase rechazó la eliminación.');
  setCloudConnectionState('online', `Eliminado en Supabase: ${storeName}`);
  return result;
}

// ---------------------------------------------------------------------------
// CARGA INICIAL + REALTIME
// ---------------------------------------------------------------------------
async function runBackgroundSyncOnce(reason = 'automatic') {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    if (!navigator.onLine) return { ok: false, message: 'Sin internet.' };
    if (!requireAuth()) return { ok: false, message: 'No hay sesión activa.' };
    if (AppState.session.pendingApproval) return { ok: true, restricted: true };
    setCloudConnectionState('connecting', reason);
    const tasks = [
      syncCloudProductsToLocal(),
      syncCloudClientsToLocal(),
      syncCloudSalesToLocal(),
      syncGenericCloudRecordsToLocal(),
      window.fetchAndCachePurchaseOrders ? fetchAndCachePurchaseOrders() : Promise.resolve({ ok: true }),
      window.syncInboxFromCloud ? syncInboxFromCloud() : Promise.resolve({ ok: true }),
      window.syncProductionCloudToLocalV740 ? syncProductionCloudToLocalV740() : Promise.resolve({ ok: true })
    ];
    const results = await Promise.all(tasks.map(p => Promise.resolve(p).catch(error => ({ ok: false, message: messageFromError(error) }))));
    await loadAllState();
    renderAfterCloudRefresh();
    if (window.refreshInboxBadge) refreshInboxBadge({ silent: true }).catch(() => {});
    const failed = results.filter(result => result && result.ok === false);
    if (failed.length) {
      const detail = failed.map(item => item.message).filter(Boolean).join(' | ');
      setCloudConnectionState('error', detail);
      return { ok: false, message: detail, results };
    }
    setCloudConnectionState('online', 'Datos actualizados desde Supabase');
    return { ok: true, results };
  })();
  try { return await _refreshInFlight; }
  finally { _refreshInFlight = null; }
}

async function refreshAfterEvent(table, payload = null) {
  try {
    if (table === 'products' || table === 'representative_product_preferences') await syncCloudProductsToLocal();
    else if (table === 'representative_stock') {
      await syncCloudProductsToLocal();
      if (window.handleRegionalRealtimeV771) handleRegionalRealtimeV771(table, payload);
      if (AppState.currentTab === 'usuarios' && window.hydrateRepresentativeCardsV730) {
        hydrateRepresentativeCardsV730(AppState.allProfiles || []);
      }
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (table === 'clients') await syncCloudClientsToLocal();
    else if (table === 'sales') {
      await syncCloudSalesToLocal();
      await loadAllState();
      if (AppState.currentTab === 'usuarios' && window.hydrateRepresentativeCardsV730) {
        hydrateRepresentativeCardsV730(AppState.allProfiles || []);
        setCloudConnectionState('online', `Realtime: ${table}`);
        return;
      }
    }
    else if (table === 'purchase_orders' && window.fetchAndCachePurchaseOrders) await fetchAndCachePurchaseOrders();
    else if (table === 'messages' && window.syncInboxFromCloud) await syncInboxFromCloud();
    else if (table === 'app_records') await syncGenericCloudRecordsToLocal();
    else if (['raw_materials','raw_material_movements','production_orders','production_batches'].includes(table) && window.syncProductionCloudToLocalV740) await syncProductionCloudToLocalV740();
    else if (['delivery_routes','route_stops','deliveries','geo_events','delivery_requests'].includes(table)) {
      if (window.handleDistributionRealtimeV770) handleDistributionRealtimeV770(table, payload);
      else if (window.refreshDistributionV760) await refreshDistributionV760();
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (['representative_regional_profiles','regional_restock_requests'].includes(table)) {
      if (window.handleRegionalRealtimeV771) handleRegionalRealtimeV771(table, payload);
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (['staff_members','staff_tasks','staff_attendance','labor_costs','staff_payments'].includes(table)) {
      if (window.handleWorkforceRealtimeV770) handleWorkforceRealtimeV770(table, payload);
      else if (window.refreshWorkforceV770) await refreshWorkforceV770();
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (['territory_prospects','territory_visits','territory_events'].includes(table)) {
      if (window.handleTerritoryRealtimeV801) handleTerritoryRealtimeV801(table, payload);
      else if (window.handleTerritoryRealtimeV800) handleTerritoryRealtimeV800(table, payload);
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (['stock_points','stock_point_balances','stock_point_movements','seller_restock_requests'].includes(table)) {
      if (window.handleLinkedStockRealtimeV801) handleLinkedStockRealtimeV801(table, payload);
      if (['stock_point_balances','stock_point_movements'].includes(table)) await syncCloudProductsToLocal();
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if (table === 'business_roles') {
      if (window.fetchRoleCatalogV800) await fetchRoleCatalogV800().catch(() => {});
      if (AppState.currentTab === 'roles-estructura' && window.renderRolesStructureV800) renderRolesStructureV800();
      setCloudConnectionState('online', `Realtime: ${table}`);
      return;
    }
    else if ((table === 'commercial_profiles' || table === 'profile_change_requests') && window.syncV7Context) await syncV7Context();
    await loadAllState();
    renderAfterCloudRefresh();
    if (window.refreshInboxBadge) refreshInboxBadge({ silent: true }).catch(() => {});
    setCloudConnectionState('online', `Realtime: ${table}`);
  } catch (error) {
    console.warn(`Realtime ${table}:`, error);
    setCloudConnectionState('error', messageFromError(error));
  }
}

function scheduleRealtimeRestart(detail = 'Reconectando Realtime') {
  clearTimeout(_realtimeRestartTimer);
  if (!navigator.onLine || !requireAuth()) return;
  setCloudConnectionState('connecting', detail);
  _realtimeRestartTimer = setTimeout(() => {
    startRealtimeSubscriptions();
    if (!AppState.session.pendingApproval) runBackgroundSyncOnce('reconexión').catch(() => {});
  }, 2500);
}

function stopRealtimeSubscriptions() {
  clearTimeout(_realtimeRestartTimer);
  const sb = getSupabaseClient();
  if (sb && _realtimeChannel) sb.removeChannel(_realtimeChannel).catch(() => {});
  _realtimeChannel = null;
}

function startRealtimeSubscriptions() {
  installAuthObserverV801();
  const sb = getSupabaseClient();
  if (!sb || !requireAuth()) return;
  stopRealtimeSubscriptions();
  setCloudConnectionState('connecting', 'Abriendo Realtime');

  let channel = sb.channel(`nv7-main-${AppState.session.onlineUserId}`);
  ['products', 'representative_stock', 'representative_product_preferences', 'clients', 'sales', 'purchase_orders', 'messages', 'app_records', 'commercial_profiles', 'profile_change_requests', 'raw_materials', 'raw_material_movements', 'production_orders', 'production_batches', 'delivery_routes', 'route_stops', 'deliveries', 'geo_events', 'delivery_requests', 'representative_regional_profiles', 'regional_restock_requests', 'staff_members', 'staff_tasks', 'staff_attendance', 'labor_costs', 'staff_payments', 'business_roles', 'territory_prospects', 'territory_visits', 'territory_events', 'stock_points', 'stock_point_balances', 'stock_point_movements', 'seller_restock_requests'].forEach(table => {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => refreshAfterEvent(table, payload));
  });
  channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async payload => {
    try {
      const row = payload.new || payload.old || {};
      if (row.id === AppState.session.onlineUserId && payload.new) {
        const wasPending = AppState.session.pendingApproval;
        const current = await getOnlineSessionProfile();
        if (current && current.user && current.profile) {
          applyOnlineSession(current.user, current.profile);
          if (wasPending && !AppState.session.pendingApproval && window.afterLoginSuccess) {
            showToast('Tu cuenta fue aprobada. Acceso habilitado.');
            await afterLoginSuccess({ ok: true, user: current.user });
            return;
          }
          if (AppState.session.statusCanonical === 'bloqueado') {
            showToast('La cuenta fue bloqueada por el administrador.', 'error');
            await logoutSession();
            return;
          }
        }
      }
      if (window.syncV7Context) await syncV7Context().catch(() => {});
      if (window.renderTopHeader) renderTopHeader();
      if (isAdmin() && AppState.currentTab === 'usuarios' && window.hydrateRepresentativeCardsV730) {
        hydrateRepresentativeCardsV730(AppState.allProfiles || []);
      } else if (AppState.currentTab === 'perfil' && !shouldDeferCloudRender() && window.renderProfileV7) {
        renderProfileV7();
      }
    } catch (error) { console.warn('Realtime profiles:', error); }
  });

  _realtimeChannel = channel.subscribe((status, error) => {
    if (status === 'SUBSCRIBED') setCloudConnectionState('online', 'Realtime conectado');
    else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
      setCloudConnectionState('error', messageFromError(error || status));
      scheduleRealtimeRestart(status);
    }
  });
}

function startBackgroundSync() {
  if (_backgroundStarted) return;
  _backgroundStarted = true;
  startRealtimeSubscriptions();
  window.addEventListener('online', () => {
    setCloudConnectionState('connecting', 'Internet recuperado');
    startRealtimeSubscriptions();
    if (requireAuth() && !AppState.session.pendingApproval) runBackgroundSyncOnce('internet recuperado').catch(() => {});
  });
  window.addEventListener('offline', () => setCloudConnectionState('offline', 'Sin internet'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine && requireAuth()) {
      startRealtimeSubscriptions();
      if (!AppState.session.pendingApproval) runBackgroundSyncOnce('aplicación visible').catch(() => {});
    }
  });
}

async function syncAfterLogin() {
  startBackgroundSync();
  startRealtimeSubscriptions();
  if (AppState.session && AppState.session.pendingApproval) return { ok: true, mode: 'restricted-realtime' };
  return runBackgroundSyncOnce('inicio de sesión');
}

async function runFullAdminSync() {
  return runBackgroundSyncOnce('lectura automática');
}

async function flushPendingSyncQueue() {
  return { ok: true, sent: 0, failed: 0, pending: 0, mode: 'disabled' };
}

async function testOnlineConnection() {
  try {
    const sb = await requireClient();
    const { error } = await sb.from('app_config').select('key').limit(1);
    return error ? { ok: false, message: messageFromError(error) } : { ok: true, message: 'Supabase responde correctamente.' };
  } catch (error) { return { ok: false, message: messageFromError(error) }; }
}

// Compatibilidad deliberada: las funciones antiguas ya no hacen respaldo,
// publicación masiva ni mezcla con datos locales.
async function createPreSyncLocalSnapshot() { return null; }
async function openSafeCloudSyncSheet() { showToast('La actualización es automática mediante Realtime.'); }

Object.assign(window, {
  CloudConnection,
  SessionContinuityV833,
  shouldDeferCloudRender,
  renderAfterCloudRefresh,
  flushDeferredCloudRender,
  effectiveOnlineConfig,
  getSavedOnlineConfig,
  getOnlineConfigValue,
  saveOnlineConfig,
  isOnlineConfigured,
  getSupabaseClient,
  setCloudConnectionState,
  onlineSignIn,
  onlineSignOut,
  getOnlineSessionProfile,
  verifySessionV833,
  recoverUnexpectedSignOutV833,
  prepareSessionForUpdateV833,
  getSessionContinuityDiagnosticsV833,
  hasPriorSessionMarkerV833,
  rememberSessionPresenceV833,
  markExplicitLogoutV833,
  clearSessionMarkerV833,
  isSessionWriteReadyV833,
  installSessionLifecycleV833,
  AuthStorageV840,
  waitForAuthStorageV840,
  mirrorAuthStorageV840,
  requestPersistentStorageV840,
  getAuthStorageDiagnosticsV840,
  upsertCloudProfileForUser,
  signUpEmailAccount,
  sendPasswordRecoveryEmail,
  waitForPasswordRecoverySession,
  updateCurrentUserPassword,
  touchLastLogin,
  setProfileStatus,
  fetchAllProfilesForAdmin,
  fetchCloudProfiles,
  updateCloudProfileStatus,
  uploadProductPhotoIfNeeded,
  syncCloudProductsToLocal,
  pushLocalProductsToCloud,
  adjustRepresentativeStockRemote,
  queueRepresentativeStockDelta,
  updateRepresentativeInventoryRemote,
  fetchRepresentativeStockForAdminV725,
  fetchRepresentativeOrdersForAdminV725,
  fetchRepresentativeStockMap,
  upsertCloudClient,
  deleteCloudClient,
  syncCloudClientsToLocal,
  syncCloudSalesToLocal,
  findCloudSaleById,
  syncGenericCloudRecordsToLocal,
  insertCloudMessage,
  fetchCloudInboxMessages,
  markCloudMessageRead,
  insertCloudPurchaseOrder,
  fetchCloudPurchaseOrders,
  updateCloudPurchaseOrderStatus,
  cloudAfterPut,
  cloudAfterDelete,
  runBackgroundSyncOnce,
  startRealtimeSubscriptions,
  stopRealtimeSubscriptions,
  startBackgroundSync,
  syncAfterLogin,
  runFullAdminSync,
  flushPendingSyncQueue,
  testOnlineConnection,
  createPreSyncLocalSnapshot,
  openSafeCloudSyncSheet
});

window.resendSignupConfirmation = resendSignupConfirmation;
window.installAuthObserverV801 = installAuthObserverV801;
window.readCachedOnlineProfileV801 = readCachedOnlineProfileV801;
