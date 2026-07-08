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

/* Lee un archivo de imagen (input file) y devuelve un dataURL, con manejo de errores.
   V7.1.2: también puede optimizar imágenes grandes sin destruir calidad.
   Para productos se usa alta calidad porque se reutilizan en catálogo PDF. */
function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo abrir la imagen'));
    img.src = dataUrl;
  });
}

function canvasToDataUrl(canvas, mimeType = 'image/jpeg', quality = 0.9) {
  try { return canvas.toDataURL(mimeType, quality); }
  catch (_) { return canvas.toDataURL('image/jpeg', quality); }
}

async function optimizeImageDataUrl(dataUrl, options = {}) {
  const maxEdge = Number(options.maxEdge || 1800);
  const quality = Number(options.quality || 0.9);
  const mimeType = options.mimeType || 'image/jpeg';
  const img = await imageFromDataUrl(dataUrl);
  const width = img.naturalWidth || img.width || 1;
  const height = img.naturalHeight || img.height || 1;
  const largest = Math.max(width, height);
  if (!options.force && largest <= maxEdge && String(dataUrl).length < 950000) {
    return { dataUrl, width, height, optimized: false };
  }
  const ratio = Math.min(1, maxEdge / largest);
  const targetW = Math.max(1, Math.round(width * ratio));
  const targetH = Math.max(1, Math.round(height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return { dataUrl: canvasToDataUrl(canvas, mimeType, quality), width: targetW, height: targetH, optimized: true };
}

function readImageFile(file, options = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Sin archivo'));
    if (!file.type.startsWith('image/')) return reject(new Error('No es una imagen'));
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = e.target.result;
        if (options && options.optimize) {
          const optimized = await optimizeImageDataUrl(raw, options);
          return resolve(optimized.dataUrl);
        }
        resolve(raw);
      } catch (error) { reject(error); }
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

async function readProductImageFile(file) {
  if (!file) throw new Error('Sin archivo');
  if (!file.type.startsWith('image/')) throw new Error('No es una imagen');
  if (file.size > 15 * 1024 * 1024) throw new Error('La imagen supera 15 MB. Usa una foto más liviana.');
  return readImageFile(file, { optimize: true, maxEdge: 1800, quality: 0.9, mimeType: 'image/jpeg' });
}

async function readLogoImageFile(file) {
  if (!file) throw new Error('Sin archivo');
  if (!file.type.startsWith('image/')) throw new Error('No es una imagen');
  return readImageFile(file, { optimize: true, maxEdge: 1200, quality: 0.92, mimeType: 'image/jpeg' });
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


/* Filtra tarjetas ya dibujadas sin reconstruir la pantalla.
   Evita que el teclado del celular se cierre mientras el usuario escribe. */
function bindStableSearch(inputOrSelector, cardSelector, onValue) {
  const input = typeof inputOrSelector === 'string' ? document.querySelector(inputOrSelector) : inputOrSelector;
  if (!input) return;
  const apply = () => {
    const value = String(input.value || '');
    if (typeof onValue === 'function') onValue(value);
    const query = normalizeSearch(value);
    document.querySelectorAll(cardSelector).forEach(card => {
      const searchable = normalizeSearch(card.getAttribute('data-search') || card.textContent || '');
      card.classList.toggle('searchHidden', Boolean(query) && !searchable.includes(query));
    });
  };
  input.addEventListener('input', apply);
  apply();
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
window.readProductImageFile = readProductImageFile;
window.readLogoImageFile = readLogoImageFile;
window.optimizeImageDataUrl = optimizeImageDataUrl;
window.matchesSearch = matchesSearch;
window.normalizeSearch = normalizeSearch;
window.bindStableSearch = bindStableSearch;

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
