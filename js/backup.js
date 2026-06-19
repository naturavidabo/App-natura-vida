/* backup.js — Copia de seguridad local (descarga/restaura archivo .json) y placeholder de Google Drive. */

async function generateBackupFile() {
  const data = await DB.exportAll();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `naturavida_backup_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Copia de seguridad descargada');
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

/* ---- Google Drive: placeholder funcional, requiere Client ID propio del usuario ---- */
/* IMPORTANTE: GOOGLE_CLIENT_ID debe configurarse en js/settings.js (ver guía de instalación).
   Hasta entonces, este botón explica el paso pendiente en lugar de fallar en silencio. */

function isDriveConfigured() {
  return typeof window.GOOGLE_CLIENT_ID === 'string' && window.GOOGLE_CLIENT_ID.length > 10 && !window.GOOGLE_CLIENT_ID.includes('PEGA_AQUI');
}

async function backupToDrive() {
  if (!isDriveConfigured()) {
    openSheet(`
      <h2>Conectar Google Drive <span class="x" id="closeSheet">✕</span></h2>
      <div class="banner warn">
        Esta función necesita una clave de conexión propia (Client ID de Google Cloud) que aún no fue configurada.
        Por seguridad, esa clave debe generarla el propietario del negocio — no puede generarse automáticamente.
      </div>
      <p style="font-size:13px; color:var(--gray); line-height:1.6;">
        Mientras tanto, usa <b>"Descargar copia de seguridad"</b> y guarda el archivo manualmente en tu Google Drive,
        Dropbox, o donde prefieras — el efecto es el mismo: tu información queda respaldada fuera del celular.
      </p>
      <div class="actions"><button class="btn block" id="closeSheet2">Entendido</button></div>
    `, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#closeSheet2', overlay).addEventListener('click', close);
    });
    return;
  }
  // Si en el futuro se configura GOOGLE_CLIENT_ID, aquí se invoca el flujo real de Google Identity + Drive API.
  showToast('Conectando con Google Drive…');
}

window.generateBackupFile = generateBackupFile;
window.restoreBackupFromFile = restoreBackupFromFile;
window.backupToDrive = backupToDrive;
window.isDriveConfigured = isDriveConfigured;
