/* app-update.js — actualización visible y controlada para GitHub Pages/PWA. */

(() => {
  const CURRENT_VERSION = '8.2.4';
  const BUILD_ID = '2026-07-23-v824-autocompletado-intuitivo-chat-organizado-motor-ia-corregido';
  let registration = null;
  let updateAvailable = false;
  let updateRequested = false;
  let lastRemoteInfo = null;

  function versionParts(value) {
    return String(value || '0').split('.').map(n => Number.parseInt(n, 10) || 0);
  }

  function compareVersions(a, b) {
    const aa = versionParts(a), bb = versionParts(b);
    for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
      const av = aa[i] || 0, bv = bb[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  function updateStatusText() {
    if (!navigator.onLine) return 'Sin internet: no se puede comprobar ahora.';
    if (updateAvailable || (registration && registration.waiting)) return 'Hay una versión nueva lista para instalar.';
    if (lastRemoteInfo && compareVersions(lastRemoteInfo.version, CURRENT_VERSION) > 0) return `Versión ${lastRemoteInfo.version} detectada.`;
    return 'La aplicación está actualizada.';
  }

  function emitUpdateState() {
    window.dispatchEvent(new CustomEvent('nv:update-state', {
      detail: { currentVersion: CURRENT_VERSION, build: BUILD_ID, updateAvailable, remote: lastRemoteInfo }
    }));
  }

  async function fetchRemoteVersion() {
    const response = await fetch(`./app-version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo leer la versión publicada.');
    const info = await response.json();
    lastRemoteInfo = info || null;
    if (info && compareVersions(info.version, CURRENT_VERSION) > 0) updateAvailable = true;
    emitUpdateState();
    return info;
  }

  function watchRegistration(reg) {
    if (!reg) return;
    if (reg.waiting) {
      updateAvailable = true;
      emitUpdateState();
    }
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          updateAvailable = true;
          emitUpdateState();
          showToast('Nueva versión disponible. Ábrela desde Más → Actualizaciones.');
        }
      });
    });
  }

  async function installAppUpdateManager() {
    if (!('serviceWorker' in navigator)) return { ok: false, unsupported: true };
    registration = await navigator.serviceWorker.register('./service-worker.js?v=8.2.4', { updateViaCache: 'none' });
    watchRegistration(registration);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!updateRequested) return;
      window.location.reload();
    });
    setTimeout(() => registration.update().catch(() => {}), 1500);
    setInterval(() => registration && registration.update().catch(() => {}), 30 * 60 * 1000);
    return { ok: true, registration };
  }

  async function checkForAppUpdate(options = {}) {
    const interactive = options.interactive !== false;
    if (!navigator.onLine) {
      if (interactive) showToast('No hay internet para comprobar actualizaciones.', 'error');
      return { ok: false, offline: true };
    }
    try {
      const info = await fetchRemoteVersion();
      if (registration) await registration.update();
      await new Promise(resolve => setTimeout(resolve, 450));
      if (registration && registration.waiting) updateAvailable = true;
      emitUpdateState();
      if (interactive) showToast(updateAvailable ? `Versión ${info.version || 'nueva'} disponible.` : 'Ya tienes la última versión.');
      return { ok: true, available: updateAvailable, info };
    } catch (error) {
      if (interactive) showToast(error.message || 'No se pudo comprobar la actualización.', 'error');
      return { ok: false, message: error.message };
    }
  }

  async function clearAppCaches() {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }

  async function activateAppUpdate() {
    if (!navigator.onLine) return showToast('Se necesita internet para actualizar.', 'error');
    updateRequested = true;
    const waiting = registration && registration.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    await clearAppCaches().catch(() => {});
    const url = new URL(window.location.href);
    url.searchParams.set('nv-update', Date.now().toString());
    window.location.replace(url.toString());
  }

  function openUpdateCenter() {
    const remoteVersion = lastRemoteInfo && lastRemoteInfo.version ? lastRemoteInfo.version : 'No comprobada';
    openSheet(`
      <h2>Actualizaciones <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7UpdateHero">
        <div class="v7UpdateMark">↻</div>
        <div><span>Versión instalada</span><strong>V${CURRENT_VERSION}</strong><small>${escapeHtml(BUILD_ID)}</small></div>
      </div>
      <div class="v7UpdateStatus" id="v7UpdateStatus">${escapeHtml(updateStatusText())}</div>
      <div class="v7UpdateGrid">
        <div><span>Publicada</span><strong id="v7RemoteVersion">${escapeHtml(remoteVersion)}</strong></div>
        <div><span>Canal</span><strong>Estable</strong></div>
      </div>
      <button class="btn outline block" id="checkUpdateNow">Buscar actualización</button>
      <button class="btn block" id="installUpdateNow" ${updateAvailable || (registration && registration.waiting) ? '' : 'disabled'}>Actualizar ahora</button>
      <button class="btn ghost block" id="forceReloadNow">Recargar archivos de la aplicación</button>
      <div class="v7CashNotice">Esta acción actualiza los archivos de GitHub Pages. No elimina la cuenta, el inventario ni las ventas guardadas en Supabase.</div>
    `, (overlay, close) => {
      const refreshUi = () => {
        const status = $('#v7UpdateStatus', overlay);
        const remote = $('#v7RemoteVersion', overlay);
        const install = $('#installUpdateNow', overlay);
        if (status) status.textContent = updateStatusText();
        if (remote) remote.textContent = lastRemoteInfo && lastRemoteInfo.version ? lastRemoteInfo.version : 'No comprobada';
        if (install) install.disabled = !(updateAvailable || (registration && registration.waiting));
      };
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#checkUpdateNow', overlay).addEventListener('click', async event => {
        const btn = event.currentTarget;
        btn.disabled = true; btn.textContent = 'Comprobando…';
        await checkForAppUpdate({ interactive: false });
        btn.disabled = false; btn.textContent = 'Buscar actualización';
        refreshUi();
      });
      $('#installUpdateNow', overlay).addEventListener('click', activateAppUpdate);
      $('#forceReloadNow', overlay).addEventListener('click', activateAppUpdate);
      window.addEventListener('nv:update-state', refreshUi, { once: true });
      checkForAppUpdate({ interactive: false }).then(refreshUi);
    });
  }

  Object.assign(window, {
    NATURA_APP_VERSION: CURRENT_VERSION,
    NATURA_BUILD_ID: BUILD_ID,
    installAppUpdateManager,
    checkForAppUpdate,
    activateAppUpdate,
    openUpdateCenter
  });
})();
