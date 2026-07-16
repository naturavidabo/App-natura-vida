/* NATURA VIDA V7.5.0 — Gestión regional de representantes. */
(() => {
  const esc = value => escapeHtml(String(value ?? ''));
  const sb = () => {
    if (!window.getSupabaseClient) throw new Error('Supabase no está disponible.');
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase no está configurado.');
    return client;
  };
  const msg = e => (e && (e.message || e.details)) || String(e || 'Error inesperado');

  async function loadRegionalDataV750() {
    const userId = AppState.session.onlineUserId || AppState.session.userId;
    const admin = isAdmin();
    const profilesPromise = admin && window.fetchAllProfilesV7 ? fetchAllProfilesV7() : Promise.resolve({ ok: true, profiles: [AppState.session] });
    const regionalQuery = sb().from('representative_regional_profiles').select('*').order('updated_at', { ascending: false });
    const requestsQuery = sb().from('regional_restock_requests').select('*').order('created_at', { ascending: false }).limit(200);
    if (!admin) {
      regionalQuery.eq('representative_user_id', userId);
      requestsQuery.eq('representative_user_id', userId);
    }
    const stockQuery = sb().from('representative_stock').select('representative_user_id,product_id,stock,acquisition_cost');
    if (!admin) stockQuery.eq('representative_user_id', userId);
    const [profilesRes, regionalRes, requestsRes, stockRes] = await Promise.all([profilesPromise, regionalQuery, requestsQuery, stockQuery]);
    if (regionalRes.error) throw new Error(msg(regionalRes.error));
    if (requestsRes.error) throw new Error(msg(requestsRes.error));
    if (stockRes.error) throw new Error(msg(stockRes.error));
    return {
      profiles: profilesRes && profilesRes.ok ? (profilesRes.profiles || []) : [],
      regional: regionalRes.data || [],
      requests: requestsRes.data || [],
      stock: stockRes.data || []
    };
  }

  function aggregateStock(rows, userId) {
    return rows.filter(r => r.representative_user_id === userId).reduce((a, r) => ({ units: a.units + Number(r.stock || 0), value: a.value + Number(r.stock || 0) * Number(r.acquisition_cost || 0) }), { units: 0, value: 0 });
  }

  function statusLabel(status) {
    return ({ active: 'Activo', suspended: 'Suspendido', inactive: 'Inactivo', pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', fulfilled: 'Atendida' })[status] || status || 'Pendiente';
  }

  async function renderRegionalManagementV750() {
    $('#fabAdd').classList.add('hidden');
    const main = $('#mainArea');
    main.innerHTML = '<div class="loading">Cargando gestión regional…</div>';
    try {
      const data = await loadRegionalDataV750();
      const admin = isAdmin();
      const reps = data.profiles.filter(p => String(p.role || '').toLowerCase() !== 'administrador');
      const ownId = AppState.session.onlineUserId || AppState.session.userId;
      const visible = admin ? reps : reps.filter(p => p.id === ownId);
      const totalUnits = data.stock.reduce((s, r) => s + Number(r.stock || 0), 0);
      const pending = data.requests.filter(r => r.status === 'pending').length;
      main.innerHTML = `
        <section class="v7RegionalHero">
          <span class="v7Eyebrow">Natura Vida V7.5.0</span>
          <h1>${admin ? 'Gestión regional' : 'Mi región comercial'}</h1>
          <p>${admin ? 'Representantes, regiones, stock y solicitudes de reposición bajo control central.' : 'Consulta tu configuración regional y solicita reposición de productos.'}</p>
        </section>
        <section class="v7MetricGrid compact v750Metrics">
          <article class="v7MetricCard"><span>Representantes</span><strong>${visible.length}</strong><small>con ficha visible</small></article>
          <article class="v7MetricCard"><span>Stock regional</span><strong>${totalUnits}</strong><small>unidades registradas</small></article>
          <article class="v7MetricCard"><span>Reposiciones</span><strong>${pending}</strong><small>pendientes</small></article>
        </section>
        ${admin ? `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Mapa operativo</span><h2>Representantes regionales</h2></div></div><div class="v750RegionalGrid">${visible.map(p => {
          const reg = data.regional.find(r => r.representative_user_id === p.id) || {};
          const stock = aggregateStock(data.stock, p.id);
          const reqs = data.requests.filter(r => r.representative_user_id === p.id && r.status === 'pending').length;
          return `<article class="v750RegionalCard"><div class="v750RepTop"><div class="v7Avatar">${esc((p.full_name || p.email || 'R').charAt(0).toUpperCase())}</div><div><strong>${esc(p.full_name || 'Sin nombre')}</strong><span>${esc(reg.region_name || p.city || 'Región sin definir')}</span><small>${esc(reg.city || p.city || '')}</small></div><em>${statusLabel(reg.operational_status || 'active')}</em></div><div class="v750RepStats"><span><b>${stock.units}</b><small>unidades</small></span><span><b>${fmtMoney(stock.value)}</b><small>valor stock</small></span><span><b>${reqs}</b><small>solicitudes</small></span></div><div class="v750CardActions"><button class="btn sm editRegionV750" data-id="${p.id}">Editar ficha</button><button class="btn sm outline viewRequestsV750" data-id="${p.id}">Reposiciones</button></div></article>`;
        }).join('') || '<div class="v7Empty"><h3>Sin representantes</h3><p>Aprueba primero las cuentas del equipo comercial.</p></div>'}</div></section>` : ''}
        <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Abastecimiento</span><h2>Solicitudes de reposición</h2></div>${!admin ? '<button class="btn sm" id="newRestockV750">Nueva solicitud</button>' : ''}</div><div class="v750RequestList">${data.requests.map(r => `<article class="v750RequestCard"><div><strong>${esc(r.request_code || 'Solicitud')}</strong><span>${esc(r.representative_name || 'Representante')} · ${new Date(r.created_at).toLocaleDateString('es-BO')}</span><small>${Array.isArray(r.items) ? r.items.map(i => `${esc(i.productName || i.product_name)} × ${Number(i.quantity || 0)}`).join(' · ') : 'Sin detalle'}</small></div><div><em class="v750Status ${esc(r.status)}">${statusLabel(r.status)}</em>${admin && r.status === 'pending' ? `<button class="btn sm approveRestockV750" data-id="${r.id}">Aprobar</button><button class="btn sm outline rejectRestockV750" data-id="${r.id}">Rechazar</button>` : ''}</div></article>`).join('') || '<div class="v7Empty"><span>📦</span><h3>Sin solicitudes</h3><p>Las solicitudes de reposición aparecerán aquí.</p></div>'}</div></section>`;

      $all('.editRegionV750').forEach(b => b.addEventListener('click', () => openRegionEditorV750(b.dataset.id, data)));
      $all('.viewRequestsV750').forEach(b => b.addEventListener('click', () => { const card = main.querySelector(`.v750RequestCard`); if (card) card.scrollIntoView({ behavior: 'smooth' }); }));
      if ($('#newRestockV750')) $('#newRestockV750').addEventListener('click', () => openRestockRequestV750(data));
      $all('.approveRestockV750').forEach(b => b.addEventListener('click', () => updateRestockStatusV750(b.dataset.id, 'approved')));
      $all('.rejectRestockV750').forEach(b => b.addEventListener('click', () => updateRestockStatusV750(b.dataset.id, 'rejected')));
    } catch (error) {
      main.innerHTML = `<div class="v7Empty"><span>⚠️</span><h3>No se pudo cargar</h3><p>${esc(msg(error))}</p><button class="btn" id="retryRegionalV750">Reintentar</button></div>`;
      if ($('#retryRegionalV750')) $('#retryRegionalV750').onclick = renderRegionalManagementV750;
    }
  }

  function openRegionEditorV750(userId, data) {
    const p = data.profiles.find(x => x.id === userId) || {};
    const r = data.regional.find(x => x.representative_user_id === userId) || {};
    openSheet(`<h2>Ficha regional <span class="x" id="closeSheet">✕</span></h2><div class="v7CashNotice">${esc(p.full_name || p.email || 'Representante')}</div><div class="field"><label>Región / zona</label><input id="rRegion" value="${esc(r.region_name || '')}" placeholder="Ej: Santa Cruz Norte"></div><div class="field-row"><div class="field"><label>Ciudad</label><input id="rCity" value="${esc(r.city || p.city || '')}"></div><div class="field"><label>Estado</label><select id="rStatus"><option value="active">Activo</option><option value="suspended" ${r.operational_status === 'suspended' ? 'selected' : ''}>Suspendido</option><option value="inactive" ${r.operational_status === 'inactive' ? 'selected' : ''}>Inactivo</option></select></div></div><div class="field-row"><div class="field"><label>Meta mensual (Bs)</label><input id="rGoal" type="number" min="0" value="${Number(r.monthly_goal || 0)}"></div><div class="field"><label>Límite de deuda (Bs)</label><input id="rLimit" type="number" min="0" value="${Number(r.debt_limit || 0)}"></div></div><div class="field"><label>Observaciones</label><textarea id="rNote">${esc(r.notes || '')}</textarea></div><div class="stickyActions"><button class="btn block" id="saveRegionV750">Guardar ficha regional</button></div>`, (overlay, close) => {
      $('#closeSheet', overlay).onclick = close;
      $('#saveRegionV750', overlay).onclick = async () => {
        const btn = $('#saveRegionV750', overlay); btn.disabled = true; btn.textContent = 'Guardando…';
        const row = { representative_user_id: userId, representative_name: p.full_name || p.email || '', region_name: $('#rRegion', overlay).value.trim(), city: $('#rCity', overlay).value.trim(), operational_status: $('#rStatus', overlay).value, monthly_goal: Number($('#rGoal', overlay).value || 0), debt_limit: Number($('#rLimit', overlay).value || 0), notes: $('#rNote', overlay).value.trim(), updated_by: AppState.session.onlineUserId || AppState.session.userId };
        const { error } = await sb().from('representative_regional_profiles').upsert(row, { onConflict: 'representative_user_id' });
        if (error) { btn.disabled = false; btn.textContent = 'Reintentar'; return showToast(msg(error), 'error'); }
        close(); showToast('Ficha regional actualizada.'); renderRegionalManagementV750();
      };
    });
  }

  function openRestockRequestV750() {
    const products = (AppState.products || []).filter(p => p.status !== 'archived');
    openSheet(`<h2>Solicitar reposición <span class="x" id="closeSheet">✕</span></h2><div class="field"><label>Producto</label><select id="rrProduct">${products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label>Cantidad</label><input id="rrQty" type="number" min="1" value="1"></div><div class="field"><label>Prioridad</label><select id="rrPriority"><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div><div class="field"><label>Observación</label><textarea id="rrNote"></textarea></div><div class="stickyActions"><button class="btn block" id="saveRestockV750">Enviar solicitud</button></div>`, (overlay, close) => {
      $('#closeSheet', overlay).onclick = close;
      $('#saveRestockV750', overlay).onclick = async () => {
        const product = products.find(p => p.id === $('#rrProduct', overlay).value);
        const qty = Number($('#rrQty', overlay).value || 0);
        if (!product || qty <= 0) return showToast('Selecciona producto y cantidad válida.', 'error');
        const uidValue = AppState.session.onlineUserId || AppState.session.userId;
        const row = { id: uid('rr'), request_code: `REP-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`, representative_user_id: uidValue, representative_name: AppState.session.fullName || AppState.session.email || '', items: [{ productId: product.id, productName: product.name, quantity: qty }], priority: $('#rrPriority', overlay).value, note: $('#rrNote', overlay).value.trim(), status: 'pending', created_by: uidValue };
        const { error } = await sb().from('regional_restock_requests').insert(row);
        if (error) return showToast(msg(error), 'error');
        close(); showToast('Solicitud enviada.'); renderRegionalManagementV750();
      };
    });
  }

  async function updateRestockStatusV750(id, status) {
    const { error } = await sb().from('regional_restock_requests').update({ status, reviewed_by: AppState.session.onlineUserId || AppState.session.userId, reviewed_at: new Date().toISOString() }).eq('id', id);
    if (error) return showToast(msg(error), 'error');
    showToast(status === 'approved' ? 'Solicitud aprobada.' : 'Solicitud rechazada.');
    renderRegionalManagementV750();
  }

  window.renderRegionalManagementV750 = renderRegionalManagementV750;
})();
