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

    ${window.isAdmin && isAdmin() ? `<div class="sectiontitle">Reglas comerciales</div>
    <div class="card settingsCard nv807SettingsCard">
      <div class="name">Márgenes, descuentos y promociones</div>
      <div class="costline">Configura costo real, margen mínimo, precio mínimo, descuento máximo, promociones y autorizaciones por rol. Incluye simulador de utilidad.</div>
      <button class="btn block" id="openCommercialRulesV807Btn">Abrir reglas comerciales</button>
    </div>` : ''}

    ${window.isAdmin && isAdmin() ? `<div class="sectiontitle">Motor de inteligencia artificial</div>
    <div class="card settingsCard nv821AiSettingsCard">
      <div class="name">Asistente híbrido seguro</div>
      <div class="costline">Usa cálculos locales verificables y, cuando la Edge Function esté configurada, Gemini interpreta un resumen sin teléfonos, direcciones ni correos. Las claves nunca se guardan en el navegador.</div>
      <div class="field-row"><button class="btn block" id="openAiAssistantV821Btn">Abrir asistente</button><button class="btn outline block" id="checkAiEngineV821Btn">Comprobar motor</button></div>
    </div>` : ''}

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

    <div class="sectiontitle">Continuidad sin conexión</div>
    <div class="card settingsCard">
      <div class="name">Modo seguro de continuidad</div>
      <div class="costline">Conserva la pantalla y formularios como borradores cuando falta internet. No envía operaciones automáticamente ni reemplaza a Supabase.</div>
      <button class="btn outline block" id="openOfflineContinuityBtn">Ver estado y borradores</button>
    </div>

    <div class="sectiontitle">Saneamiento y seguridad</div>
    <div class="card settingsCard">
      <div class="name">Estado del sistema y calidad de datos</div>
      <div class="costline">Revisa conexión, sesión, posibles clientes duplicados, inconsistencias básicas de inventario, usuarios demo y perfiles incompletos. No modifica datos automáticamente.</div>
      <button class="btn outline block" id="openGovernanceBtn">Abrir diagnóstico rápido</button>
    </div>

    ${window.isAdmin && isAdmin() ? `<div class="sectiontitle">Respaldo y auditoría</div>
    <div class="card settingsCard nv806SettingsCard">
      <div class="name">Control administrativo V8.0.7</div>
      <div class="costline">Crea respaldos verificables, valida archivos sin restaurarlos, revisa auditoría, detecta movimientos repetidos y controla la calidad de clientes, productos, ventas, inventario y usuarios demo.</div>
      <button class="btn block" id="openQualityControlV806Btn">Abrir respaldo, auditoría y calidad</button>
    </div>` : ''}

    <div class="sectiontitle">Acerca de</div>
    <div class="card settingsCard">
      <div class="costline">NATURA VIDA — V8.2.2 · Supabase + Realtime + IA híbrida</div>
      <div class="costline">Sin cola offline automática. Incluye continuidad segura, control financiero, auditoría, reglas comerciales y motor IA protegido por Edge Function.</div>
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

  $('#openCommercialRulesV807Btn')?.addEventListener('click', () => {
    if (window.navigateTo) navigateTo('reglas-comerciales');
    else if (window.renderCommercialRulesV807) renderCommercialRulesV807();
  });

  $('#openAiAssistantV821Btn')?.addEventListener('click', () => {
    if (window.navigateTo) navigateTo('asistente-ia');
  });

  $('#checkAiEngineV821Btn')?.addEventListener('click', async () => {
    const btn = $('#checkAiEngineV821Btn');
    btn.disabled = true; btn.textContent = 'Comprobando…';
    try {
      const state = await window.__nvAiV821?.checkEngine?.(true);
      showToast(state?.message || 'Comprobación del motor terminada.', state?.mode === 'external' ? undefined : 'error');
    } catch (err) { showToast(err.message || 'No se pudo comprobar el motor IA.', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Comprobar motor'; }
  });

  $('#openOfflineContinuityBtn').addEventListener('click', () => {
    if (window.openOfflineContinuityCenterV805) openOfflineContinuityCenterV805();
  });

  $('#openGovernanceBtn').addEventListener('click', async () => {
    const btn = $('#openGovernanceBtn'); btn.disabled = true; btn.textContent = 'Preparando diagnóstico…';
    if (window.NV804Governance) await NV804Governance.collectProfiles().catch(() => []);
    if (window.renderGovernanceCenter) renderGovernanceCenter();
  });

  $('#openQualityControlV806Btn')?.addEventListener('click', async () => {
    const btn = $('#openQualityControlV806Btn');
    btn.disabled = true; btn.textContent = 'Preparando control administrativo…';
    if (window.NV804Governance) await NV804Governance.collectProfiles().catch(() => []);
    if (window.renderDataControlCenterV806) await renderDataControlCenterV806();
    else { btn.disabled = false; btn.textContent = 'Abrir respaldo, auditoría y calidad'; showToast('El módulo V8.0.7 no está disponible.', 'error'); }
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
