/* app-update.js — V8.4.0: actualización segura con sesión persistente. */

(() => {
  const CURRENT_VERSION = '8.4.0';
  const BUILD_ID = '2026-08-02-v840-director-administrativo-sesion-persistente';
  const UPDATE_DIAG_KEY = 'nv833-update-diagnostics';
  const RELOAD_GUARD_KEY = 'nv833-controller-reload';
  let registration = null;
  let updateAvailable = false;
  let updateRequested = false;
  let lastRemoteInfo = null;
  let updateBusy = false;
  let controllerReloaded = false;

  function readDiag() { try { return JSON.parse(localStorage.getItem(UPDATE_DIAG_KEY) || '{}'); } catch (_) { return {}; } }
  function recordUpdate(patch = {}) {
    const next = Object.assign({}, readDiag(), patch, { updatedAt: Date.now() });
    try { localStorage.setItem(UPDATE_DIAG_KEY, JSON.stringify(next)); } catch (_) {}
    emitUpdateState();
    return next;
  }
  function versionParts(value) { return String(value || '0').split('.').map(n => Number.parseInt(n, 10) || 0); }
  function compareVersions(a, b) {
    const aa = versionParts(a), bb = versionParts(b);
    for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
      const av = aa[i] || 0, bv = bb[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }
  function workerState() {
    if (!registration) return 'No registrado';
    if (registration.waiting) return 'Nueva versión lista';
    if (registration.installing) return 'Instalando archivos';
    if (registration.active) return registration.active.state === 'activated' ? 'Activo' : 'Activándose';
    return 'Registrado';
  }
  function sessionStateLabelV840(state) {
    return state === 'active' ? 'Activa y protegida' :
      state === 'recovering' ? 'Recuperándose' :
      state === 'signed_out' ? 'Cerrada voluntariamente' :
      state === 'signing_out' ? 'Cerrando sesión' : 'Sin comprobar';
  }
  function updateStatusText() {
    if (!navigator.onLine) return 'Sin internet: no se puede comprobar ahora.';
    if (updateBusy) return 'Protegiendo la sesión e instalando la actualización…';
    if (updateAvailable || registration?.waiting) return 'Hay una versión nueva lista para instalar.';
    if (lastRemoteInfo && compareVersions(lastRemoteInfo.version, CURRENT_VERSION) > 0) return `Versión ${lastRemoteInfo.version} detectada.`;
    return 'La aplicación está actualizada.';
  }
  function diagnostics() {
    return {
      currentVersion: CURRENT_VERSION,
      build: BUILD_ID,
      updateAvailable,
      remote: lastRemoteInfo,
      workerState: workerState(),
      updateBusy,
      last: readDiag()
    };
  }
  function emitUpdateState() {
    window.dispatchEvent(new CustomEvent('nv:update-state', { detail: diagnostics() }));
  }
  async function fetchRemoteVersion() {
    const url = new URL('./app-version.json', window.location.href);
    url.searchParams.set('nv-check', Date.now().toString());
    const response = await fetch(url.toString(), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store, max-age=0' } });
    if (!response.ok) throw new Error('No se pudo leer la versión publicada.');
    const info = await response.json();
    lastRemoteInfo = info || null;
    updateAvailable = !!(info && compareVersions(info.version, CURRENT_VERSION) > 0) || !!registration?.waiting;
    recordUpdate({ lastCheckAt: Date.now(), lastRemoteVersion: info?.version || '', lastStatus: updateAvailable ? 'available' : 'current' });
    return info;
  }
  function canReloadSafelyV840() {
    const dirty = window.hasMeaningfulDirtyFormV840 ? hasMeaningfulDirtyFormV840() : !!window.V7_FORM_DIRTY;
    if (dirty) {
      window.showToast?.('Guarda o descarta primero el formulario que estás editando. La sesión no se cerrará.', 'error');
      return false;
    }
    if (window.clearMeaningfulDirtyV840) clearMeaningfulDirtyV840('safe-reload');
    else window.V7_FORM_DIRTY = false;
    return true;
  }
  function safeReload(reason = 'reload') {
    if (!canReloadSafelyV840()) return false;
    recordUpdate({ lastReloadAt: Date.now(), lastStatus: reason });
    const url = new URL(window.location.href);
    url.searchParams.set('nv-safe-reload', Date.now().toString());
    window.location.replace(url.toString());
    return true;
  }
  function waitForWaitingWorker(reg, timeout = 12000) {
    return new Promise(resolve => {
      if (!reg) return resolve(null);
      if (reg.waiting) return resolve(reg.waiting);
      let done = false;
      const finish = worker => { if (done) return; done = true; clearTimeout(timer); resolve(worker || null); };
      const observe = worker => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (reg.waiting) finish(reg.waiting);
          else if (worker.state === 'activated') finish(worker);
          else if (worker.state === 'redundant') finish(null);
        });
      };
      observe(reg.installing);
      const onFound = () => observe(reg.installing);
      reg.addEventListener('updatefound', onFound, { once: true });
      const timer = setTimeout(() => finish(reg.waiting || null), timeout);
    });
  }
  function watchRegistration(reg) {
    if (!reg) return;
    if (reg.waiting) { updateAvailable = true; emitUpdateState(); }
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      recordUpdate({ lastStatus: 'installing', installStartedAt: Date.now() });
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        recordUpdate({ workerState: worker.state, lastStatus: worker.state });
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          updateAvailable = true;
          emitUpdateState();
          if (!updateRequested && window.showToast) showToast('Nueva versión disponible. Ábrela desde Más → Actualizaciones.');
        }
      });
    });
  }
  async function installAppUpdateManager() {
    if (!('serviceWorker' in navigator)) return { ok: false, unsupported: true };
    registration = await navigator.serviceWorker.register('./service-worker.js?v=8.4.0', { updateViaCache: 'none' });
    watchRegistration(registration);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!updateRequested || controllerReloaded) return;
      controllerReloaded = true;
      try {
        if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      } catch (_) {}
      recordUpdate({ lastStatus: 'controller-changed', controllerChangedAt: Date.now() });
      setTimeout(() => safeReload('updated'), 180);
    });
    setTimeout(() => registration.update().catch(() => {}), 1500);
    setInterval(() => registration?.update().catch(() => {}), 30 * 60 * 1000);
    recordUpdate({ lastStatus: 'manager-ready', workerState: workerState() });
    return { ok: true, registration };
  }
  async function checkForAppUpdate(options = {}) {
    const interactive = options.interactive !== false;
    if (!navigator.onLine) {
      if (interactive && window.showToast) showToast('No hay internet para comprobar actualizaciones.', 'error');
      return { ok: false, offline: true };
    }
    try {
      const info = await fetchRemoteVersion();
      if (registration) await registration.update();
      await new Promise(resolve => setTimeout(resolve, 500));
      if (registration?.waiting) updateAvailable = true;
      emitUpdateState();
      if (interactive && window.showToast) showToast(updateAvailable ? `Versión ${info.version || 'nueva'} disponible.` : 'Ya tienes la última versión.');
      return { ok: true, available: updateAvailable, info };
    } catch (error) {
      recordUpdate({ lastStatus: 'check-error', lastError: error.message || String(error) });
      if (interactive && window.showToast) showToast(error.message || 'No se pudo comprobar la actualización.', 'error');
      return { ok: false, message: error.message };
    }
  }
  async function protectSessionBeforeUpdate() {
    if (window.mirrorAuthStorageV840) await mirrorAuthStorageV840().catch(() => null);
    if (window.requestPersistentStorageV840) requestPersistentStorageV840().catch(() => {});
    if (window.prepareSessionForUpdateV833) return prepareSessionForUpdateV833();
    return { ok: !!window.AppState?.session?.isAuthenticated };
  }
  async function activateAppUpdate() {
    if (updateBusy) return;
    if (!navigator.onLine) return window.showToast?.('Se necesita internet para actualizar.', 'error');
    updateBusy = true; updateRequested = true; emitUpdateState();
    try {
      recordUpdate({ lastAttemptAt: Date.now(), lastStatus: 'protecting-session', lastError: '' });
      const protectedSession = await protectSessionBeforeUpdate();
      if (window.AppState?.session?.isAuthenticated && !protectedSession?.ok) throw new Error('No se confirmó la copia persistente de la sesión. La actualización fue detenida para evitar cerrar tu cuenta.');
      if (!registration && 'serviceWorker' in navigator) {
        registration = await navigator.serviceWorker.getRegistration('./') || await navigator.serviceWorker.register('./service-worker.js?v=8.4.0', { updateViaCache: 'none' });
        watchRegistration(registration);
      }
      recordUpdate({ lastStatus: 'checking-worker' });
      await registration?.update();
      let waiting = registration?.waiting || await waitForWaitingWorker(registration, 12000);
      if (registration?.waiting) waiting = registration.waiting;
      if (waiting && waiting.state === 'installed') {
        recordUpdate({ lastStatus: 'activating-worker' });
        waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => {
          if (!controllerReloaded) safeReload('activation-timeout-reload');
        }, 7000);
        return;
      }
      // Si la versión publicada es la misma, no se recarga innecesariamente.
      // Una recarga repetida era molesta y podía coincidir con la renovación del token.
      const remoteIsNewer = !!(lastRemoteInfo && compareVersions(lastRemoteInfo.version, CURRENT_VERSION) > 0);
      if (!remoteIsNewer) {
        updateBusy = false; updateRequested = false; updateAvailable = false;
        recordUpdate({ lastStatus: 'already-current' }); emitUpdateState();
        window.showToast?.('Ya tienes la versión más reciente. No fue necesario reiniciar.');
        return;
      }
      recordUpdate({ lastStatus: 'safe-reload-no-waiting-worker' });
      if (!safeReload('safe-update-reload')) {
        updateBusy = false; updateRequested = false; emitUpdateState();
      }
    } catch (error) {
      updateBusy = false; updateRequested = false;
      recordUpdate({ lastStatus: 'update-error', lastError: error.message || String(error) });
      emitUpdateState();
      window.showToast?.(error.message || 'No se pudo iniciar la actualización.', 'error');
    }
  }
  async function clearOwnedCaches() {
    if (!('caches' in window)) return [];
    const keys = await caches.keys();
    const owned = keys.filter(key => /^(nv-|natura-vida)/i.test(key));
    await Promise.all(owned.map(key => caches.delete(key)));
    return owned;
  }
  async function repairAppInstallationV833() {
    if (updateBusy) return;
    if (!navigator.onLine) return window.showToast?.('Se necesita internet para reparar la instalación.', 'error');
    const accepted = window.confirm ? window.confirm('Esta reparación volverá a instalar los archivos de Natura Vida. Tu sesión y tus datos de Supabase no serán eliminados. ¿Continuar?') : true;
    if (!accepted) return;
    updateBusy = true; updateRequested = true; emitUpdateState();
    try {
      await protectSessionBeforeUpdate();
      recordUpdate({ lastAttemptAt: Date.now(), lastStatus: 'repairing' });
      await clearOwnedCaches();
      registration = await navigator.serviceWorker.getRegistration('./') || await navigator.serviceWorker.register(`./service-worker.js?v=8.4.0&repair=${Date.now()}`, { updateViaCache: 'none' });
      await registration.update().catch(() => {});
      recordUpdate({ lastStatus: 'repair-complete' });
      if (!safeReload('repair-complete')) { updateBusy = false; updateRequested = false; emitUpdateState(); }
    } catch (error) {
      updateBusy = false; updateRequested = false;
      recordUpdate({ lastStatus: 'repair-error', lastError: error.message || String(error) });
      emitUpdateState();
      window.showToast?.(error.message || 'No se pudo reparar la instalación.', 'error');
    }
  }
  function formatDate(value) {
    if (!value) return 'No registrada';
    try { return new Date(value).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' }); } catch (_) { return 'No registrada'; }
  }
  function openUpdateCenter() {
    const remoteVersion = lastRemoteInfo?.version || 'No comprobada';
    const diag = readDiag();
    const sessionDiag = window.getSessionContinuityDiagnosticsV833?.() || {};
    openSheet(`
      <h2>Actualizaciones seguras <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7UpdateHero"><div class="v7UpdateMark">↻</div><div><span>Versión instalada</span><strong>V${CURRENT_VERSION}</strong><small>${escapeHtml(BUILD_ID)}</small></div></div>
      <div class="v7UpdateStatus" id="v7UpdateStatus">${escapeHtml(updateStatusText())}</div>
      <div class="v7UpdateGrid">
        <div><span>Publicada</span><strong id="v7RemoteVersion">${escapeHtml(remoteVersion)}</strong></div>
        <div><span>Service Worker</span><strong id="v833WorkerState">${escapeHtml(workerState())}</strong></div>
        <div><span>Sesión</span><strong id="v833SessionState">${escapeHtml(sessionStateLabelV840(sessionDiag.state))}</strong></div>
        <div><span>Almacenamiento</span><strong id="v840AuthStorage">Comprobando…</strong></div>
        <div><span>Último intento</span><strong id="v833LastAttempt">${escapeHtml(formatDate(diag.lastAttemptAt))}</strong></div>
      </div>
      <button class="btn outline block" id="checkUpdateNow">Buscar actualización</button>
      <button class="btn block" id="installUpdateNow" ${updateAvailable || registration?.waiting ? '' : 'disabled'}>Actualizar ahora</button>
      <button class="btn ghost block" id="safeReloadNow">Recargar interfaz</button>
      <button class="btn outline block" id="repairUpdateNow">Reparar actualización</button>
      <div class="v7CashNotice">La actualización normal no borra cachés, no desregistra la PWA y no cierra la sesión. La reparación solo actúa sobre los archivos de Natura Vida.</div>
    `, (overlay, close) => {
      const refreshUi = async () => {
        const d = readDiag(); const sd = window.getSessionContinuityDiagnosticsV833?.() || {};
        const status = $('#v7UpdateStatus', overlay), remote = $('#v7RemoteVersion', overlay), install = $('#installUpdateNow', overlay);
        if (status) status.textContent = updateStatusText();
        if (remote) remote.textContent = lastRemoteInfo?.version || 'No comprobada';
        if ($('#v833WorkerState', overlay)) $('#v833WorkerState', overlay).textContent = workerState();
        if ($('#v833SessionState', overlay)) $('#v833SessionState', overlay).textContent = sessionStateLabelV840(sd.state);
        if ($('#v833LastAttempt', overlay)) $('#v833LastAttempt', overlay).textContent = formatDate(d.lastAttemptAt);
        const storageEl = $('#v840AuthStorage', overlay);
        if (storageEl && window.getAuthStorageDiagnosticsV840) {
          const authStorage = await getAuthStorageDiagnosticsV840().catch(() => null);
          if (authStorage) storageEl.textContent = authStorage.indexedDbCopy && authStorage.localCopy ? `Persistente${authStorage.persistentStorage ? ' reforzada' : ''}` : authStorage.localCopy ? 'Local' : authStorage.recoveryCopy ? 'Reserva de recuperación' : 'Sin copia';
        }
        if (install) { install.disabled = updateBusy || !(updateAvailable || registration?.waiting); install.textContent = updateBusy ? 'Actualizando…' : 'Actualizar ahora'; }
      };
      const updateListener=()=>refreshUi();
      const cleanupAndClose=()=>{window.removeEventListener('nv:update-state',updateListener);window.removeEventListener('nv:session-state',updateListener);close();};
      $('#closeSheet', overlay).addEventListener('click', cleanupAndClose);
      $('#checkUpdateNow', overlay).addEventListener('click', async event => { const btn=event.currentTarget;btn.disabled=true;btn.textContent='Comprobando…';await checkForAppUpdate({interactive:false});btn.disabled=false;btn.textContent='Buscar actualización';refreshUi(); });
      $('#installUpdateNow', overlay).addEventListener('click', activateAppUpdate);
      $('#safeReloadNow', overlay).addEventListener('click', async event => { const btn=event.currentTarget;btn.disabled=true;btn.textContent='Protegiendo sesión…';const result=await protectSessionBeforeUpdate();if(window.AppState?.session?.isAuthenticated&&!result?.ok){btn.disabled=false;btn.textContent='Recargar interfaz';return window.showToast?.('No se pudo proteger la sesión. No se recargó la aplicación.','error');}if(!safeReload('manual-safe-reload')){btn.disabled=false;btn.textContent='Recargar interfaz';} });
      $('#repairUpdateNow', overlay).addEventListener('click', repairAppInstallationV833);
      window.addEventListener('nv:update-state',updateListener); window.addEventListener('nv:session-state',updateListener);
      checkForAppUpdate({interactive:false}).then(refreshUi);
    });
  }
  Object.assign(window, {
    NATURA_APP_VERSION: CURRENT_VERSION,
    NATURA_BUILD_ID: BUILD_ID,
    installAppUpdateManager,
    checkForAppUpdate,
    activateAppUpdate,
    repairAppInstallationV833,
    getAppUpdateDiagnosticsV833: diagnostics,
    openUpdateCenter,
    canReloadSafelyV840
  });
})();
