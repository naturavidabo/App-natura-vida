/* NATURA VIDA V8.0.6 — continuidad segura sin conexión.
   No existe cola offline ni envío automático. Se conserva la pantalla, se
   muestran datos ya cargados y los formularios se guardan únicamente como
   borradores locales para revisión humana al recuperar internet. */
(() => {
  const VERSION = '8.0.6';
  const LAST_SYNC_KEY = 'nv805:last-successful-sync';
  const DRAFT_KEY = 'nv805:safe-draft';
  const SNAPSHOT_KEY = 'nv805:readonly-snapshot';
  const MAX_DRAFT_AGE = 7 * 24 * 60 * 60 * 1000;
  let banner = null;
  let lastOnlineState = navigator.onLine;
  let inputTimer = null;
  let reconnectTimer = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const nowIso = () => new Date().toISOString();
  const formatDate = value => {
    if (!value) return 'sin actualización registrada';
    try { return new Date(value).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' }); }
    catch (_) { return value; }
  };

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function getLastSync() { return localStorage.getItem(LAST_SYNC_KEY) || ''; }
  function setLastSync(value = nowIso()) {
    try { localStorage.setItem(LAST_SYNC_KEY, value); } catch (_) {}
    updateBanner();
  }

  function makeReadonlySnapshot() {
    if (!window.AppState || !AppState.session) return;
    const snapshot = {
      savedAt: nowIso(),
      userId: AppState.session.onlineUserId || AppState.session.userId || '',
      currentTab: AppState.currentTab || 'home',
      products: (AppState.products || []).slice(0, 500),
      clients: (AppState.clients || []).slice(0, 1000),
      sales: (AppState.sales || []).slice(0, 300),
      orders: (AppState.orders || []).slice(0, 300),
      settings: AppState.settings || {},
      note: 'Copia local temporal de solo lectura. Supabase sigue siendo la fuente oficial.'
    };
    try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch (_) {}
  }

  function readSnapshot() {
    return safeParse(localStorage.getItem(SNAPSHOT_KEY), null);
  }

  function ensureBanner() {
    if (banner && document.body.contains(banner)) return banner;
    banner = document.createElement('div');
    banner.id = 'nv805ConnectivityBanner';
    banner.className = 'nv805ConnectivityBanner hidden';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = `
      <div class="nv805ConnectivityInner">
        <span class="nv805ConnectivityDot" aria-hidden="true"></span>
        <div class="nv805ConnectivityCopy"><strong id="nv805ConnectivityTitle"></strong><small id="nv805ConnectivityDetail"></small></div>
        <button type="button" class="nv805DraftReviewBtn hidden" id="nv805DraftReviewBtn">Revisar borrador</button>
      </div>`;
    document.body.prepend(banner);
    banner.querySelector('#nv805DraftReviewBtn').addEventListener('click', openDraftReview);
    return banner;
  }

  function readDraft() {
    const draft = safeParse(localStorage.getItem(DRAFT_KEY), null);
    if (!draft) return null;
    if (!draft.savedAt || Date.now() - new Date(draft.savedAt).getTime() > MAX_DRAFT_AGE) {
      try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
      return null;
    }
    return draft;
  }

  function updateBanner(customState = '') {
    const el = ensureBanner();
    const title = el.querySelector('#nv805ConnectivityTitle');
    const detail = el.querySelector('#nv805ConnectivityDetail');
    const review = el.querySelector('#nv805DraftReviewBtn');
    const draft = readDraft();
    review.classList.toggle('hidden', !draft);

    const state = customState || (navigator.onLine ? 'online' : 'offline');
    el.classList.remove('offline', 'reconnecting', 'online', 'hidden');
    el.classList.add(state);

    if (state === 'offline') {
      title.textContent = 'Sin conexión';
      detail.textContent = `Puedes revisar lo ya cargado. Última actualización: ${formatDate(getLastSync() || readSnapshot()?.savedAt)}.`;
      return;
    }
    if (state === 'reconnecting') {
      title.textContent = 'Conexión restablecida';
      detail.textContent = 'Reconectando con Supabase y Realtime sin cerrar tu pantalla…';
      return;
    }
    title.textContent = draft ? 'En línea · borrador pendiente' : 'Conexión restablecida';
    detail.textContent = draft ? 'Revisa y confirma manualmente el borrador. No se enviará solo.' : 'La información vuelve a actualizarse en tiempo real.';
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (navigator.onLine && !readDraft()) el.classList.add('hidden');
    }, 3600);
  }

  function fieldIdentity(el, index) {
    return el.id || el.name || `${el.tagName.toLowerCase()}-${index}`;
  }

  function serializeEditableContext() {
    const root = document.querySelector('.overlay:last-of-type, .sheet:last-of-type, #mainArea') || document.body;
    const fields = [...root.querySelectorAll('input, textarea, select')].filter(el => {
      if (el.disabled || el.readOnly || ['password','file','hidden'].includes(el.type)) return false;
      return true;
    });
    if (!fields.length) return null;
    const values = {};
    fields.forEach((el, index) => {
      values[fieldIdentity(el, index)] = {
        value: el.type === 'checkbox' || el.type === 'radio' ? Boolean(el.checked) : el.value,
        type: el.type || el.tagName.toLowerCase(),
        label: el.closest('.field')?.querySelector('label')?.textContent?.trim() || el.getAttribute('aria-label') || el.placeholder || ''
      };
    });
    return {
      version: VERSION,
      savedAt: nowIso(),
      userId: AppState?.session?.onlineUserId || AppState?.session?.userId || '',
      tab: AppState?.currentTab || '',
      title: root.querySelector('h2,h1,.sectiontitle')?.textContent?.replace('✕','').trim() || 'Formulario pendiente',
      values
    };
  }

  function saveCurrentDraft(reason = 'Edición conservada') {
    const draft = serializeEditableContext();
    if (!draft) return null;
    draft.reason = reason;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (_) {}
    updateBanner(navigator.onLine ? 'online' : 'offline');
    return draft;
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
    updateBanner();
  }

  function applyDraftToVisibleForm(draft = readDraft()) {
    if (!draft) return { ok: false, message: 'No existe borrador.' };
    const root = document.querySelector('.overlay:last-of-type, .sheet:last-of-type, #mainArea') || document.body;
    const fields = [...root.querySelectorAll('input, textarea, select')].filter(el => !el.disabled && !el.readOnly);
    let restored = 0;
    fields.forEach((el, index) => {
      const item = draft.values[fieldIdentity(el, index)];
      if (!item) return;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = Boolean(item.value);
      else el.value = item.value ?? '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      restored += 1;
    });
    return { ok: restored > 0, restored };
  }

  function openDraftReview() {
    const draft = readDraft();
    if (!draft) return window.showToast?.('No existe un borrador pendiente.');
    const fields = Object.values(draft.values || {}).filter(x => String(x.value ?? '').trim() || x.value === true);
    const summary = fields.slice(0, 8).map(x => `<div class="nv805DraftLine"><span>${esc(x.label || 'Dato')}</span><strong>${esc(typeof x.value === 'boolean' ? (x.value ? 'Sí' : 'No') : x.value)}</strong></div>`).join('');
    const html = `
      <h2>Borrador local seguro <span class="x" id="closeSheet">✕</span></h2>
      <div class="nv805SafeNotice"><strong>No es una cola offline.</strong><p>Este contenido no se envía automáticamente. Debes volver al formulario, revisarlo y confirmar con internet.</p></div>
      <div class="nv805DraftMeta"><span>${esc(draft.title)}</span><small>Guardado ${esc(formatDate(draft.savedAt))}</small></div>
      <div class="nv805DraftSummary">${summary || '<p>No hay datos visibles para mostrar.</p>'}</div>
      <div class="actions"><button class="btn outline block" id="discardNv805Draft">Descartar</button><button class="btn block" id="restoreNv805Draft">Restaurar en pantalla</button></div>`;
    if (window.openSheet) {
      openSheet(html, (overlay, close) => {
        overlay.querySelector('#closeSheet').addEventListener('click', close);
        overlay.querySelector('#discardNv805Draft').addEventListener('click', () => { clearDraft(); close(); window.showToast?.('Borrador descartado.'); });
        overlay.querySelector('#restoreNv805Draft').addEventListener('click', () => {
          close();
          setTimeout(() => {
            const result = applyDraftToVisibleForm(draft);
            window.showToast?.(result.ok ? `Se restauraron ${result.restored} campos. Revisa antes de guardar.` : 'Abre primero el formulario correspondiente y vuelve a pulsar Revisar borrador.', result.ok ? undefined : 'error');
          }, 120);
        });
      });
    }
  }

  function looksLikeSensitiveAction(target) {
    const el = target.closest('button, [role="button"], input[type="submit"]');
    if (!el) return false;
    if (el.closest('#nv805ConnectivityBanner')) return false;
    const text = `${el.textContent || ''} ${el.value || ''} ${el.id || ''} ${el.className || ''}`.toLowerCase();
    const harmless = /cancelar|cerrar|volver|revisar|buscar|filtrar|ver |detalle|descargar|compartir|ubicación|mapa|capas|continuar/.test(text);
    if (harmless) return false;
    return /guardar|crear|registrar|confirmar|enviar|eliminar|borrar|aprobar|actualizar|modificar|fusionar|anular|pagar|descontar|ajustar|finalizar/.test(text);
  }

  function blockOfflineMutation(event) {
    if (navigator.onLine || !looksLikeSensitiveAction(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const draft = saveCurrentDraft('Operación pendiente por falta de conexión');
    window.showToast?.(draft
      ? 'Sin internet. Conservamos el formulario como borrador. Se debe revisar y confirmar al reconectar.'
      : 'Esta operación requiere internet. No se realizó ningún cambio.', 'error');
  }

  function trackEditing(event) {
    const el = event.target;
    if (!el.matches?.('input, textarea, select') || el.type === 'password' || el.type === 'file') return;
    window.V7_FORM_DIRTY = true;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => {
      if (!navigator.onLine) saveCurrentDraft('Edición conservada sin conexión');
    }, 450);
  }

  function handleOnline() {
    lastOnlineState = true;
    updateBanner('reconnecting');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(async () => {
      try {
        if (window.syncAfterLogin && window.requireAuth?.()) await syncAfterLogin({ quiet: true });
        if (window.startRealtimeSubscriptions && window.requireAuth?.()) startRealtimeSubscriptions();
        setLastSync();
        makeReadonlySnapshot();
      } catch (_) {}
      updateBanner('online');
    }, 700);
  }

  function handleOffline() {
    lastOnlineState = false;
    saveCurrentDraft('Conexión interrumpida');
    makeReadonlySnapshot();
    updateBanner('offline');
  }

  function updateFromCloud(event) {
    const state = event.detail?.state;
    if (state === 'online') {
      setLastSync();
      makeReadonlySnapshot();
      if (navigator.onLine && !lastOnlineState) handleOnline();
    }
    if (state === 'offline' || !navigator.onLine) updateBanner('offline');
  }

  function openContinuityCenter() {
    const draft = readDraft();
    const snapshot = readSnapshot();
    const html = `
      <h2>Continuidad sin conexión <span class="x" id="closeSheet">✕</span></h2>
      <div class="nv805ContinuityStatus ${navigator.onLine ? 'online' : 'offline'}"><strong>${navigator.onLine ? 'Con conexión' : 'Sin conexión'}</strong><span>${navigator.onLine ? 'Supabase y Realtime pueden operar.' : 'Solo lectura y conservación local temporal.'}</span></div>
      <div class="cloudRule"><span>Última actualización confirmada</span><strong>${esc(formatDate(getLastSync() || snapshot?.savedAt))}</strong></div>
      <div class="cloudRule"><span>Borrador pendiente</span><strong>${draft ? 'Sí · requiere revisión' : 'No'}</strong></div>
      <div class="cloudRule"><span>Envío automático</span><strong>No existe</strong></div>
      <div class="cloudRule"><span>Fuente oficial</span><strong>Supabase</strong></div>
      <div class="nv805SafeNotice"><strong>Protección activa</strong><p>Sin internet se conserva la pantalla y el formulario. Ventas, pagos, inventario, precios y demás cambios permanecen bloqueados hasta recuperar conexión.</p></div>
      ${draft ? '<button class="btn block" id="reviewDraftCenter">Revisar borrador</button>' : ''}
      <button class="btn outline block" id="closeContinuityCenter">Cerrar</button>`;
    openSheet(html, (overlay, close) => {
      overlay.querySelector('#closeSheet').addEventListener('click', close);
      overlay.querySelector('#closeContinuityCenter').addEventListener('click', close);
      overlay.querySelector('#reviewDraftCenter')?.addEventListener('click', () => { close(); openDraftReview(); });
    });
  }

  function init() {
    ensureBanner();
    if (!navigator.onLine) updateBanner('offline');
    document.addEventListener('click', blockOfflineMutation, true);
    document.addEventListener('submit', blockOfflineMutation, true);
    document.addEventListener('input', trackEditing, true);
    document.addEventListener('change', trackEditing, true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('nv:connection', updateFromCloud);
    window.addEventListener('nv:form-saved', () => { clearDraft(); window.V7_FORM_DIRTY = false; });
    setInterval(() => {
      if (navigator.onLine && window.CloudConnection?.state === 'online') makeReadonlySnapshot();
    }, 90000);
  }

  Object.assign(window, {
    NV805OfflineContinuity: {
      init, readDraft, saveCurrentDraft, clearDraft, applyDraftToVisibleForm,
      openDraftReview, openContinuityCenter, readSnapshot, makeReadonlySnapshot,
      getLastSync, setLastSync
    },
    openOfflineContinuityCenterV805: openContinuityCenter
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
