/* settings.js — Pantalla de Ajustes: perfil del negocio, umbral de stock, grupos on/off, backup. */

// ⚠️ Configuración pendiente para Google Drive real (ver guía de instalación):
// Reemplaza el valor de abajo por tu propio Client ID de Google Cloud Console.
window.GOOGLE_CLIENT_ID = 'PEGA_AQUI_TU_GOOGLE_CLIENT_ID';

function renderSettings() {
  $('#fabAdd').classList.add('hidden');
  const main = $('#mainArea');

  main.innerHTML = `
    <div class="sectiontitle" style="margin-top:0;">Perfil del negocio</div>
    <div class="card" style="padding:14px;">
      <div class="field">
        <label>Logotipo</label>
        <label class="photopick small" id="logoPick">
          <input type="file" id="logoInput" accept="image/*">
          <img id="logoPreview" src="${AppState.settings.logo || ''}" alt="" class="${AppState.settings.logo ? '' : 'hidden'}">
          <span id="logoPlaceholder" class="${AppState.settings.logo ? 'hidden' : ''}">
            <span class="ic">🏪</span><span>Tocar para subir logo</span>
          </span>
        </label>
      </div>
      <div class="field">
        <label>Nombre del negocio</label>
        <input type="text" id="f_bizname" value="${escapeHtml(AppState.settings.businessName)}">
      </div>
      <div class="field">
        <label>Eslogan (aparece en el recibo)</label>
        <input type="text" id="f_bizslogan" value="${escapeHtml(AppState.settings.businessSlogan)}">
      </div>
      <button class="btn block" id="saveBizBtn">Guardar perfil</button>
    </div>

    <div class="sectiontitle">Inventario</div>
    <div class="card" style="padding:14px;">
      <div class="field">
        <label>Alertar cuando el stock sea menor o igual a</label>
        <input type="number" inputmode="numeric" id="f_lowstock" value="${AppState.settings.lowStockThreshold}">
      </div>
      <button class="btn block" id="saveStockBtn">Guardar umbral</button>
    </div>

    <div class="sectiontitle">Grupos de precio</div>
    <div class="card" style="padding:14px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div class="name" style="font-size:14px;">Activar grupos de precio</div>
        <div class="costline">Mercado, Tienda, Socios, etc.</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="f_groupsEnabled" ${AppState.settings.priceGroupsEnabled ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    </div>

    <div class="sectiontitle">Copia de seguridad</div>
    <div class="card" style="padding:14px;">
      <button class="btn block" id="exportBtn" style="margin-bottom:10px;">⬇️ Descargar copia de seguridad</button>
      <label class="btn outline block" id="importLabel" style="margin-bottom:10px;">
        ⬆️ Restaurar desde archivo
        <input type="file" id="importInput" accept=".json" style="display:none;">
      </label>
      <button class="btn outline block" id="driveBtn">☁️ Guardar en Google Drive</button>
    </div>

    <div class="sectiontitle">Acerca de</div>
    <div class="card" style="padding:14px;">
      <div class="costline">NATURA VIDA — App de gestión v1.0</div>
      <div class="costline">Funciona completamente sin conexión a internet.</div>
    </div>
  `;

  let newLogo = AppState.settings.logo;
  $('#logoInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      newLogo = await readImageFile(file);
      $('#logoPreview').src = newLogo;
      $('#logoPreview').classList.remove('hidden');
      $('#logoPlaceholder').classList.add('hidden');
    } catch (err) { showToast('⚠️ ' + err.message, 'error'); }
  });

  $('#saveBizBtn').addEventListener('click', async () => {
    AppState.settings.businessName = $('#f_bizname').value.trim() || 'Mi negocio';
    AppState.settings.businessSlogan = $('#f_bizslogan').value.trim();
    AppState.settings.logo = newLogo;
    await saveSettings();
    renderTopHeader();
    showToast('Perfil actualizado');
  });

  $('#saveStockBtn').addEventListener('click', async () => {
    AppState.settings.lowStockThreshold = parseInt($('#f_lowstock').value) || 0;
    await saveSettings();
    showToast('Umbral actualizado');
  });

  $('#f_groupsEnabled').addEventListener('change', async (e) => {
    AppState.settings.priceGroupsEnabled = e.target.checked;
    await saveSettings();
    showToast(e.target.checked ? 'Grupos de precio activados' : 'Grupos de precio desactivados');
    renderBottomNav();
  });

  $('#exportBtn').addEventListener('click', generateBackupFile);
  $('#driveBtn').addEventListener('click', backupToDrive);

  $('#importInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!confirmDialog('Restaurar reemplazará TODOS los datos actuales con los del archivo. ¿Continuar?')) return;
    try {
      await restoreBackupFromFile(file);
      renderTopHeader();
      render();
      showToast('Datos restaurados correctamente');
    } catch (err) {
      if (err.message !== 'Cancelado') showToast('⚠️ No se pudo restaurar: ' + err.message, 'error');
    }
  });
}

window.renderSettings = renderSettings;
