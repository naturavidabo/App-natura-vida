/* settings.js — Pantalla de Ajustes: perfil del negocio, umbral de stock, grupos on/off, backup. */

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
        <label>Eslogan (aparece en recibos y catálogos)</label>
        <input type="text" id="f_bizslogan" value="${escapeHtml(AppState.settings.businessSlogan)}">
      </div>
      <div class="field-row">
        <div class="field">
          <label>Nombre de contacto</label>
          <input type="text" id="f_contactname" value="${escapeHtml(AppState.settings.contactName || '')}" placeholder="Ej.: Diego Lazo">
        </div>
        <div class="field">
          <label>WhatsApp</label>
          <input type="tel" id="f_contactphone" value="${escapeHtml(AppState.settings.contactPhone || '')}" placeholder="Ej.: 70700000">
        </div>
      </div>
      <div class="field">
        <label>Ciudad / zona</label>
        <input type="text" id="f_contactcity" value="${escapeHtml(AppState.settings.contactCity || '')}" placeholder="Ej.: Santa Cruz, Bolivia">
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
      <p style="font-size:11.5px; color:var(--gray); margin:0 0 12px; line-height:1.6;">
        Descarga un archivo con todo tu negocio (productos, ventas, clientes, cotizaciones).
        Guárdalo donde prefieras — Google Drive, Mega, WhatsApp — usando el botón
        "Compartir" de tu celular sobre ese archivo. Para restaurarlo en otro dispositivo
        (por ejemplo, el celular de un familiar), usa "Restaurar desde archivo" ahí.
      </p>
      <button class="btn block" id="exportBtn" style="margin-bottom:10px;">⬇️ Descargar copia de seguridad</button>
      <label class="btn outline block" id="importLabel">
        ⬆️ Restaurar desde archivo
        <input type="file" id="importInput" accept=".json" style="display:none;">
      </label>
    </div>

    <div class="sectiontitle">Servidor online</div>
    <div class="card onlineConfigCard" style="padding:14px;">
      <p style="font-size:11.5px; color:var(--gray); margin:0 0 12px; line-height:1.6;">
        Configura Supabase para publicar productos y permitir que los representantes actualicen precios desde internet. Si no lo configuras, la app sigue funcionando offline.
      </p>
      <label class="switchRow">
        <span>Activar servidor online</span>
        <label class="switch"><input type="checkbox" id="online_enabled" ${isOnlineConfigured && isOnlineConfigured() ? 'checked' : ''}><span class="slider"></span></label>
      </label>
      <div class="field"><label>Supabase Project URL</label><input type="url" id="online_url" placeholder="https://xxxx.supabase.co" value="${escapeHtml(getOnlineConfigValue ? getOnlineConfigValue('supabaseUrl') : '')}"></div>
      <div class="field"><label>Supabase anon public key</label><input type="password" id="online_key" placeholder="eyJ..." value="${escapeHtml(getOnlineConfigValue ? getOnlineConfigValue('supabaseAnonKey') : '')}"></div>
      <div class="field-row">
        <button class="btn block" id="saveOnlineBtn">Guardar online</button>
        <button class="btn outline block" id="testOnlineBtn">Probar conexión</button>
      </div>
      <div class="formNotice" style="margin-top:10px;">Después de guardar, vuelve a iniciar sesión con el correo creado en Supabase. El botón “Publicar catálogo” usará estos datos.</div>
    </div>

    <div class="sectiontitle">Acerca de</div>
    <div class="card" style="padding:14px;">
      <div class="costline">NATURA VIDA — App de gestión v4.3</div>
      <div class="costline">Funciona offline y puede sincronizar con servidor online configurado.</div>
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
    AppState.settings.contactName = $('#f_contactname').value.trim();
    AppState.settings.contactPhone = $('#f_contactphone').value.trim();
    AppState.settings.contactCity = $('#f_contactcity').value.trim();
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


  $('#saveOnlineBtn').addEventListener('click', async () => {
    if (!window.saveOnlineConfig) { showToast('Módulo online no disponible.', 'error'); return; }
    saveOnlineConfig({
      enabled: $('#online_enabled').checked,
      supabaseUrl: $('#online_url').value.trim(),
      supabaseAnonKey: $('#online_key').value.trim()
    });
    showToast('Configuración online guardada.');
  });

  $('#testOnlineBtn').addEventListener('click', async () => {
    if (!window.saveOnlineConfig || !window.testOnlineConnection) { showToast('Módulo online no disponible.', 'error'); return; }
    saveOnlineConfig({
      enabled: $('#online_enabled').checked,
      supabaseUrl: $('#online_url').value.trim(),
      supabaseAnonKey: $('#online_key').value.trim()
    });
    const res = await testOnlineConnection();
    showToast(res.ok ? 'Conexión online correcta.' : ('No se pudo conectar: ' + res.message), res.ok ? undefined : 'error');
  });

  $('#exportBtn').addEventListener('click', generateBackupFile);

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
