/* ui-helpers.js — Utilidades de interfaz reutilizadas por todos los módulos. */

function $(sel, ctx) { return (ctx || document).querySelector(sel); }
function $all(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

function escapeHtml(s) {
  return (s || '').toString().replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showToast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind === 'error' ? ' toast-error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function openSheet(innerHtml, onMount) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="sheet">${innerHtml}</div>`;
  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  if (onMount) onMount(overlay, close);
  return { overlay, close };
}

function confirmDialog(message) {
  return window.confirm(message);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(isoOrTimestamp) {
  const d = typeof isoOrTimestamp === 'number' ? new Date(isoOrTimestamp) : new Date(isoOrTimestamp);
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

/* Lee un archivo de imagen (input file) y devuelve un dataURL, con manejo de errores. */
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Sin archivo'));
    if (!file.type.startsWith('image/')) return reject(new Error('No es una imagen'));
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

/* Búsqueda predictiva simple: filtra por substring, sin distinción de mayúsculas/acentos básicos. */
function normalizeSearch(s) {
  return (s || '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function matchesSearch(haystack, needle) {
  if (!needle) return true;
  return normalizeSearch(haystack).includes(normalizeSearch(needle));
}

window.$ = $;
window.$all = $all;
window.escapeHtml = escapeHtml;
window.showToast = showToast;
window.openSheet = openSheet;
window.confirmDialog = confirmDialog;
window.todayISO = todayISO;
window.fmtDate = fmtDate;
window.fmtDateTime = fmtDateTime;
window.readImageFile = readImageFile;
window.matchesSearch = matchesSearch;
window.normalizeSearch = normalizeSearch;

/* Comparte un archivo mediante el menú nativo del dispositivo.
   Si no está disponible, descarga el archivo sin forzar ninguna aplicación. */
async function shareBlobFile(blob, filename, mimeType, title, text) {
  const safeTitle = title || 'Archivo Natura Vida';
  const safeText = text || 'Archivo generado desde Natura Vida.';
  const file = new File([blob], filename, { type: mimeType || blob.type || 'application/octet-stream' });

  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title: safeTitle, text: safeText });
      return { ok: true, method: 'native-share' };
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false, cancelled: true, method: 'native-share' };
    }
  }

  downloadGenericBlob(blob, filename);
  openSheet(`
    <h2>Archivo descargado <span class="x" id="closeSheet">✕</span></h2>
    <div class="catalogReadyHero">
      <div class="readyMark">✓</div>
      <div>
        <div class="eyebrow">Compartir libremente</div>
        <h3>${escapeHtml(filename)}</h3>
        <p>El navegador no permitió abrir el menú nativo. El archivo fue descargado y puedes adjuntarlo desde WhatsApp, Gmail, Telegram, Drive o cualquier aplicación compatible.</p>
      </div>
    </div>
    <button class="btn block" id="closeManualShare">Entendido</button>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#closeManualShare', overlay).addEventListener('click', close);
  });
  return { ok: false, method: 'download-fallback' };
}

function downloadGenericBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

window.shareBlobFile = shareBlobFile;
window.downloadGenericBlob = downloadGenericBlob;
