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
  overlay.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${innerHtml}</div>`;
  const sheet = overlay.firstElementChild;
  document.body.appendChild(overlay);
  document.body.classList.add('nv-sheet-open');

  const viewport = window.visualViewport;
  let closed = false;
  const syncViewport = () => {
    const height = Math.max(320, Math.round(viewport ? viewport.height : window.innerHeight));
    const top = Math.max(0, Math.round(viewport ? viewport.offsetTop : 0));
    overlay.style.setProperty('--nv-visual-height', `${height}px`);
    overlay.style.transform = `translateY(${top}px)`;
    sheet.classList.toggle('keyboard-open', height < window.innerHeight * 0.82);
  };
  const keepFocusedVisible = event => {
    const target = event.target;
    if (!target || !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    setTimeout(() => {
      try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); }
      catch (_) { target.scrollIntoView(false); }
    }, 220);
  };
  const cleanup = () => {
    if (viewport) {
      viewport.removeEventListener('resize', syncViewport);
      viewport.removeEventListener('scroll', syncViewport);
    }
    overlay.removeEventListener('focusin', keepFocusedVisible);
    if (!document.querySelector('.overlay')) document.body.classList.remove('nv-sheet-open');
  };
  function close() {
    if (closed) return;
    closed = true;
    overlay.remove();
    cleanup();
  }

  syncViewport();
  if (viewport) {
    viewport.addEventListener('resize', syncViewport);
    viewport.addEventListener('scroll', syncViewport);
  }
  overlay.addEventListener('focusin', keepFocusedVisible);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  if (onMount) onMount(overlay, close);
  return { overlay, close, sheet };
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
  return readImageFile(file, { optimize: true, maxEdge: 1400, quality: 0.84, mimeType: 'image/jpeg' });
}

async function readLogoImageFile(file) {
  if (!file) throw new Error('Sin archivo');
  if (!file.type.startsWith('image/')) throw new Error('No es una imagen');
  return readImageFile(file, { optimize: true, maxEdge: 1200, quality: 0.92, mimeType: 'image/jpeg' });
}


/* Editor de encuadre reutilizable. Produce una imagen cuadrada optimizada
   para tarjetas, catálogo y PDF sin guardar capturas gigantes. */
function loadEditableImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!String(src || '').startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo abrir la imagen para encuadrarla.'));
    img.src = src;
  });
}

function drawCoverImage(canvas, image, zoom = 1, offsetX = 0, offsetY = 0, guide = true) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const width = canvas.width, height = canvas.height;
  ctx.fillStyle = '#f4faf6';
  ctx.fillRect(0, 0, width, height);
  const baseScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const scale = baseScale * zoom;
  const drawW = image.naturalWidth * scale;
  const drawH = image.naturalHeight * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, (width - drawW) / 2 + offsetX, (height - drawH) / 2 + offsetY, drawW, drawH);
  if (guide) {
    ctx.strokeStyle = 'rgba(16,169,99,.95)';
    ctx.lineWidth = Math.max(3, width / 180);
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(7, 7, width - 14, height - 14);
    ctx.setLineDash([]);
  }
}

async function openImageCropper(options = {}) {
  const src = options.src || '';
  if (!src) throw new Error('No hay una imagen para encuadrar.');
  const image = await loadEditableImage(src);
  const outputWidth = Math.max(480, Number(options.outputWidth || 1400));
  const outputHeight = Math.max(480, Number(options.outputHeight || 1400));
  const previewWidth = 720;
  const previewHeight = Math.round(previewWidth * outputHeight / outputWidth);
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;

  return new Promise(resolve => {
    openSheet(`
      <h2>${escapeHtml(options.title || 'Encuadrar fotografía')} <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CropHelp">Arrastra la fotografía para centrar el producto. El cuadro quedará completamente lleno; solo se recortarán los bordes necesarios.</div>
      <canvas class="v7ImageCropCanvas" id="imageCropCanvas" width="${previewWidth}" height="${previewHeight}"></canvas>
      <div class="field"><label>Acercar / alejar</label><input id="imageCropZoom" type="range" min="1" max="3.5" step="0.02" value="1"></div>
      <button class="btn ghost block" id="resetImageCrop">Centrar nuevamente</button>
      <button class="btn block" id="confirmImageCrop">Usar este encuadre</button>
    `, (overlay, close) => {
      const canvas = $('#imageCropCanvas', overlay);
      let dragging = false, lastX = 0, lastY = 0;
      const redraw = () => drawCoverImage(canvas, image, zoom, offsetX, offsetY, true);
      redraw();
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', event => {
        dragging = true; lastX = event.clientX; lastY = event.clientY;
        try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
      });
      canvas.addEventListener('pointermove', event => {
        if (!dragging) return;
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / Math.max(1, rect.width);
        offsetX += (event.clientX - lastX) * scale;
        offsetY += (event.clientY - lastY) * scale;
        lastX = event.clientX; lastY = event.clientY;
        redraw();
      });
      const stop = () => { dragging = false; };
      canvas.addEventListener('pointerup', stop);
      canvas.addEventListener('pointercancel', stop);
      $('#imageCropZoom', overlay).addEventListener('input', event => {
        zoom = Number(event.target.value || 1); redraw();
      });
      $('#resetImageCrop', overlay).addEventListener('click', () => {
        zoom = 1; offsetX = 0; offsetY = 0;
        $('#imageCropZoom', overlay).value = '1'; redraw();
      });
      $('#closeSheet', overlay).addEventListener('click', () => { close(); resolve(null); });
      $('#confirmImageCrop', overlay).addEventListener('click', () => {
        const output = document.createElement('canvas');
        output.width = outputWidth; output.height = outputHeight;
        const factorX = outputWidth / previewWidth;
        const factorY = outputHeight / previewHeight;
        drawCoverImage(output, image, zoom, offsetX * factorX, offsetY * factorY, false);
        const dataUrl = canvasToDataUrl(output, 'image/jpeg', Number(options.quality || 0.84));
        close();
        resolve(dataUrl);
      });
    });
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
window.openImageCropper = openImageCropper;
window.drawCoverImage = drawCoverImage;
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
