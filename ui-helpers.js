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
