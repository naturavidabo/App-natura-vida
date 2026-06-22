/* backup.js — Copia de seguridad manual por archivo .json.
   No hay sincronización automática a la nube: el usuario decide cuándo generar el archivo
   y dónde lo guarda (Drive, Mega, WhatsApp, etc., usando el propio sistema de Android).
   Este mismo archivo permite restaurar todos los datos en cualquier dispositivo, incluso
   uno nuevo que nunca abrió la app antes. */

async function shareOrDownloadBackup(blob, filename) {
  if (window.shareBlobFile) {
    return shareBlobFile(blob, filename, 'text/plain', 'Copia Natura Vida', 'Copia de seguridad Natura Vida. Adjunta este archivo por WhatsApp o Drive.');
  }
  downloadBackupBlob(blob, filename);
  showToast('Archivo descargado. Adjunta el archivo en WhatsApp como documento.');
  return false;
}

function downloadBackupBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function generateBackupFile() {
  const data = await DB.exportAll();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'text/plain' });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `naturavida_backup_${stamp}.json`;
  openSheet(`
    <h2>Copia generada <span class="x" id="closeSheet">✕</span></h2>
    <div class="catalogReadyHero">
      <div class="readyMark">✓</div>
      <div><div class="eyebrow">Respaldo completo</div><h3>${escapeHtml(filename)}</h3><p>Comparte o descarga el archivo para conservarlo fuera del celular.</p></div>
    </div>
    <div class="exportRow catalogExportRow">
      <div class="exportBtn primaryShare" id="shareBackup"><span class="ic">↗</span><span class="lbl">Compartir</span><span class="sub">WhatsApp / Drive</span></div>
      <div class="exportBtn" id="downloadBackup"><span class="ic">↓</span><span class="lbl">Descargar</span><span class="sub">Guardar archivo</span></div>
    </div>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#shareBackup', overlay).addEventListener('click', async () => { await shareOrDownloadBackup(blob, filename); });
    $('#downloadBackup', overlay).addEventListener('click', () => { downloadBackupBlob(blob, filename); showToast('Copia descargada.'); });
    if (navigator.canShare) {
      const file = new File([blob], filename, { type: 'text/plain' });
      if (navigator.canShare({ files: [file] })) setTimeout(() => shareOrDownloadBackup(blob, filename), 450);
    }
  });
}

function restoreBackupFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data._meta || data._meta.app !== 'natura-vida') {
          if (!confirmDialog('Este archivo no parece ser una copia de NATURA VIDA. ¿Intentar restaurar de todas formas?')) {
            return reject(new Error('Cancelado'));
          }
        }
        await DB.importAll(data);
        await loadAllState();
        resolve(true);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsText(file);
  });
}

/* ---- Detección automática al abrir sin datos ----
   Si la app arranca completamente vacía (sin productos ni ventas ni clientes), es probable
   que sea un dispositivo nuevo (ej. el celular de un familiar/vendedor) que necesita cargar
   un respaldo existente. En ese caso, se ofrece la opción de restaurar antes de continuar. */
function isAppEmpty() {
  return AppState.products.length === 0 && AppState.sales.length === 0 && AppState.clients.length === 0;
}

function offerRestoreIfEmpty() {
  if (!isAppEmpty()) return;
  const alreadyDismissed = sessionStorage.getItem('nv_restore_dismissed');
  if (alreadyDismissed) return;

  openSheet(`
    <h2>¿Tienes una copia de seguridad? <span class="x" id="closeSheet">✕</span></h2>
    <div class="banner">
      Esta app está vacía — parece un dispositivo nuevo. Si ya tienes un archivo de copia
      de seguridad (productos, ventas, clientes) de otro celular, puedes cargarlo ahora.
    </div>
    <label class="btn block" id="restoreNowLabel" style="margin-bottom:10px;">
      📂 Elegir archivo de copia de seguridad
      <input type="file" id="restoreNowInput" accept=".json" style="display:none;">
    </label>
    <button class="btn outline block" id="skipRestoreBtn">Empezar desde cero</button>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', () => { sessionStorage.setItem('nv_restore_dismissed', '1'); close(); });
    $('#skipRestoreBtn', overlay).addEventListener('click', () => { sessionStorage.setItem('nv_restore_dismissed', '1'); close(); });
    $('#restoreNowInput', overlay).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await restoreBackupFromFile(file);
        sessionStorage.setItem('nv_restore_dismissed', '1');
        close();
        renderTopHeader();
        render();
        showToast('Datos restaurados correctamente');
      } catch (err) {
        if (err.message !== 'Cancelado') showToast('⚠️ No se pudo restaurar: ' + err.message, 'error');
      }
    });
  });
}

window.generateBackupFile = generateBackupFile;
window.restoreBackupFromFile = restoreBackupFromFile;
window.offerRestoreIfEmpty = offerRestoreIfEmpty;
