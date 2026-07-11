/* settings.js — NATURA VIDA V7
   Ajustes funcionales guardados en Supabase. Sin importación, respaldo local
   ni edición de credenciales desde el celular. */

function renderSettings() {
  $('#fabAdd').classList.add('hidden');
  const main = $('#mainArea');
  const conn = window.CloudConnection || { state: navigator.onLine ? 'connecting' : 'offline' };
  const connLabel = conn.state === 'online' ? 'Conectado en tiempo real' :
                    conn.state === 'offline' ? 'Sin conexión a internet' :
                    conn.state === 'error' ? 'Reconectando con Supabase' : 'Conectando con Supabase';

  main.innerHTML = `
    <div class="sectiontitle" style="margin-top:0;">Perfil del negocio</div>
    <div class="card settingsCard">
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
      <div class="field"><label>Nombre del negocio</label><input type="text" id="f_bizname" value="${escapeHtml(AppState.settings.businessName)}"></div>
      <div class="field"><label>Eslogan</label><input type="text" id="f_bizslogan" value="${escapeHtml(AppState.settings.businessSlogan)}"></div>
      <div class="field-row">
        <div class="field"><label>Nombre de contacto</label><input type="text" id="f_contactname" value="${escapeHtml(AppState.settings.contactName || '')}"></div>
        <div class="field"><label>WhatsApp</label><input type="tel" id="f_contactphone" value="${escapeHtml(AppState.settings.contactPhone || '')}"></div>
      </div>
      <div class="field"><label>Ciudad / zona</label><input type="text" id="f_contactcity" value="${escapeHtml(AppState.settings.contactCity || '')}"></div>
      <button class="btn block" id="saveBizBtn">Guardar perfil en Supabase</button>
    </div>

    <div class="sectiontitle">Inventario</div>
    <div class="card settingsCard">
      <div class="field"><label>Alertar cuando el stock sea menor o igual a</label><input type="number" inputmode="numeric" id="f_lowstock" value="${AppState.settings.lowStockThreshold}"></div>
      <button class="btn block" id="saveStockBtn">Guardar umbral</button>
    </div>

    <div class="sectiontitle">Grupos de precio</div>
    <div class="card settingsSwitchCard">
      <div><div class="name">Activar grupos de precio</div><div class="costline">Mercado, tienda, socios y otros.</div></div>
      <label class="switch"><input type="checkbox" id="f_groupsEnabled" ${AppState.settings.priceGroupsEnabled ? 'checked' : ''}><span class="slider"></span></label>
    </div>

    <div class="sectiontitle">Conexión del sistema</div>
    <div class="card cloudOfficialCard">
      <div class="cloudStatus ${escapeHtml(conn.state || 'connecting')}">
        <span class="cloudDot"></span>
        <div><strong>${connLabel}</strong><small>Los datos se leen y guardan directamente en Supabase.</small></div>
      </div>
      <div class="cloudRule"><span>Base oficial</span><strong>Supabase PostgreSQL</strong></div>
      <div class="cloudRule"><span>Actualización</span><strong>Realtime automática</strong></div>
      <div class="cloudRule"><span>Datos en el celular</span><strong>Solo memoria temporal de la pantalla</strong></div>
      <div class="cloudRule"><span>Sin internet</span><strong>No permite registrar cambios</strong></div>
      <button class="btn outline block" id="testOnlineBtn">Comprobar conexión ahora</button>
    </div>

    <div class="sectiontitle">Acerca de</div>
    <div class="card settingsCard">
      <div class="costline">NATURA VIDA — V7 · Supabase + Realtime</div>
      <div class="costline">Sin IndexedDB, sin cola offline, sin sincronización manual y sin bases separadas por celular.</div>
    </div>
  `;

  let newLogo = AppState.settings.logo;
  $('#logoInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      newLogo = await readLogoImageFile(file);
      $('#logoPreview').src = newLogo;
      $('#logoPreview').classList.remove('hidden');
      $('#logoPlaceholder').classList.add('hidden');
    } catch (err) { showToast('⚠️ ' + err.message, 'error'); }
  });

  $('#saveBizBtn').addEventListener('click', async () => {
    const before = Object.assign({}, AppState.settings);
    AppState.settings.businessName = $('#f_bizname').value.trim() || 'NATURA VIDA';
    AppState.settings.businessSlogan = $('#f_bizslogan').value.trim();
    AppState.settings.contactName = $('#f_contactname').value.trim();
    AppState.settings.contactPhone = $('#f_contactphone').value.trim();
    AppState.settings.contactCity = $('#f_contactcity').value.trim();
    AppState.settings.logo = newLogo;
    try {
      await saveSettings();
      renderTopHeader();
      showToast('Perfil guardado en Supabase.');
    } catch (err) {
      AppState.settings = before;
      showToast(err.message || 'No se pudo guardar.', 'error');
    }
  });

  $('#saveStockBtn').addEventListener('click', async () => {
    const old = AppState.settings.lowStockThreshold;
    AppState.settings.lowStockThreshold = parseInt($('#f_lowstock').value, 10) || 0;
    try { await saveSettings(); showToast('Umbral guardado en Supabase.'); }
    catch (err) { AppState.settings.lowStockThreshold = old; showToast(err.message || 'No se pudo guardar.', 'error'); }
  });

  $('#f_groupsEnabled').addEventListener('change', async (e) => {
    const old = AppState.settings.priceGroupsEnabled;
    AppState.settings.priceGroupsEnabled = e.target.checked;
    try {
      await saveSettings();
      showToast(e.target.checked ? 'Grupos activados.' : 'Grupos desactivados.');
      renderBottomNav();
    } catch (err) {
      AppState.settings.priceGroupsEnabled = old;
      e.target.checked = old;
      showToast(err.message || 'No se pudo guardar.', 'error');
    }
  });

  $('#testOnlineBtn').addEventListener('click', async () => {
    const btn = $('#testOnlineBtn');
    btn.disabled = true; btn.textContent = 'Comprobando…';
    const res = await testOnlineConnection().catch(err => ({ ok: false, message: err.message }));
    btn.disabled = false; btn.textContent = 'Comprobar conexión ahora';
    showToast(res.ok ? 'Supabase responde correctamente.' : ('Conexión fallida: ' + res.message), res.ok ? undefined : 'error');
  });
}

window.renderSettings = renderSettings;
