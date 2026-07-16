/* Natura Vida V7.3 — Centro Comercial, ficha avanzada de representantes y beneficios de clientes. */
(() => {
  const DAY = 86400000;

  function currentUserIdV730() {
    return AppState.session && (AppState.session.onlineUserId || AppState.session.userId || '');
  }

  function repProfileByIdV730(userId, profiles = AppState.allProfiles || []) {
    return profiles.find(p => p.id === userId) || {};
  }

  function repConfigV730(userId) {
    return (AppState.representatives || []).find(r => r.id === userId || r.userId === userId) || null;
  }

  async function saveRepresentativeConfigV730(userId, patch = {}, profile = null) {
    const existing = repConfigV730(userId) || {};
    const p = profile || repProfileByIdV730(userId);
    const row = Object.assign({}, existing, patch, {
      id: userId,
      userId,
      name: patch.name || existing.name || p.full_name || p.email || 'Representante',
      phone: patch.phone ?? existing.phone ?? p.phone ?? '',
      city: patch.city ?? existing.city ?? p.city ?? '',
      priceGroupId: patch.priceGroupId ?? existing.priceGroupId ?? '',
      discountPercent: Number(patch.discountPercent ?? existing.discountPercent ?? p.representative_discount_percent ?? 0),
      createdAt: existing.createdAt || Date.now(),
      updatedAt: Date.now(),
      updatedBy: currentUserIdV730()
    });
    await DB.put('representatives', row);
    const idx = (AppState.representatives || []).findIndex(r => r.id === userId || r.userId === userId);
    if (idx >= 0) AppState.representatives[idx] = row;
    else AppState.representatives.push(row);
    if (window.writeAudit) await writeAudit('representative:configuration', 'representatives', userId, existing, row).catch(() => {});
    return row;
  }

  function repSalesV730(userId) {
    return (AppState.sales || []).filter(s => s.sellerId === userId && !s.deletedAt);
  }

  function topProductRowsV730(sales, limit = 5) {
    const map = new Map();
    sales.forEach(s => (s.items || []).forEach(i => {
      const key = i.productId || normalizeSearch(i.productName || 'Producto');
      const row = map.get(key) || { name: i.productName || 'Producto', units: 0, total: 0 };
      row.units += Number(i.qty || 0);
      row.total += Number(i.subtotal || i.subtotalFinal || 0);
      map.set(key, row);
    }));
    return Array.from(map.values()).sort((a,b) => b.units - a.units || b.total - a.total).slice(0, limit);
  }

  function latestActivityV730(parts) {
    return Math.max(0, ...parts.flat().map(x => Number(x.updatedAt || x.createdAt || x.date || 0)).filter(Boolean));
  }

  async function fetchRepresentativeMovementsV730(userId) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.from('stock_movements_v7')
        .select('id,product_id,order_id,movement_type,quantity,central_stock_after,representative_stock_after,created_at,metadata')
        .eq('representative_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) return { ok: false, message: error.message || String(error), rows: [] };
      const products = new Map((AppState.products || []).map(p => [p.id, p]));
      return { ok: true, rows: (data || []).map(r => ({
        id: r.id,
        productId: r.product_id,
        productName: (r.metadata && r.metadata.productName) || (products.get(r.product_id) || {}).name || r.product_id,
        orderId: r.order_id || '',
        movementType: r.movement_type || '',
        quantity: Number(r.quantity || 0),
        stockAfter: Number(r.representative_stock_after || 0),
        createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
        metadata: r.metadata || {}
      })) };
    } catch (error) { return { ok: false, message: error.message || String(error), rows: [] }; }
  }

  async function representativeDashboardV730(userId, profiles = AppState.allProfiles || []) {
    const profile = repProfileByIdV730(userId, profiles);
    const [stockRes, ordersRes, movementsRes] = await Promise.all([
      fetchRepresentativeStockForAdminV725(userId),
      fetchRepresentativeOrdersForAdminV725(userId),
      fetchRepresentativeMovementsV730(userId)
    ]);
    const stock = stockRes.ok ? stockRes.rows || [] : [];
    const orders = ordersRes.ok ? ordersRes.orders || [] : [];
    const movements = movementsRes.ok ? movementsRes.rows || [] : [];
    const sales = repSalesV730(userId);
    const stockUnits = stock.reduce((s, r) => s + Number(r.stock || 0), 0);
    const stockValue = stock.reduce((s, r) => s + Number(r.stock || 0) * Number(r.acquisitionCost || 0), 0);
    const salesTotal = sales.reduce((s, r) => s + Number(r.total || 0), 0);
    const salesUnits = sales.reduce((s, r) => s + (r.items || []).reduce((n, i) => n + Number(i.qty || 0), 0), 0);
    const openOrders = orders.filter(o => !['paid','cancelled','rejected'].includes(String(o.status || '').toLowerCase()));
    const lowStock = stock.filter(r => Number(r.stock || 0) <= Number(AppState.settings.lowStockThreshold || 5));
    const storedConfig = repConfigV730(userId) || {};
    const config = Object.assign({ priceGroupId: profile.representative_price_group_id || '', discountPercent: Number(profile.representative_discount_percent || 0) }, storedConfig);
    return {
      userId, profile, config, stock, orders, movements, sales,
      stockUnits, stockValue: roundBs(stockValue), salesTotal: roundBs(salesTotal), salesUnits,
      salesCount: sales.length, openOrders: openOrders.length, lowStock: lowStock.length,
      topProducts: topProductRowsV730(sales),
      lastActivity: latestActivityV730([stock, orders, movements, sales])
    };
  }

  function repStatusLabelV730(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'activo') return ['Activo', 'success'];
    if (s === 'bloqueado') return ['Bloqueado', 'danger'];
    return ['Pendiente', 'warning'];
  }

  function movementLabelV730(type) {
    const labels = {
      payment_confirmed_transfer: 'Ingreso por compra confirmada',
      representative_sale: 'Salida por venta',
      admin_adjustment: 'Ajuste administrativo',
      stock_correction: 'Corrección de stock'
    };
    return labels[type] || String(type || 'Movimiento').replace(/_/g, ' ');
  }

  function repDetailHtmlV730(d) {
    const [status, tone] = repStatusLabelV730(d.profile.status);
    const group = AppState.priceGroups.find(g => g.id === d.config.priceGroupId);
    return `
      <div class="repDetailHeroV730">
        <div class="v7Avatar large">${escapeHtml((d.profile.full_name || d.profile.email || 'R').charAt(0).toUpperCase())}</div>
        <div><h3>${escapeHtml(d.profile.full_name || 'Representante')}</h3><span>${escapeHtml(d.profile.email || '')}</span><small>${escapeHtml([d.profile.city, d.profile.phone].filter(Boolean).join(' · '))}</small></div>
        <em class="v7Status ${tone}">${status}</em>
      </div>
      <section class="v7MetricGrid compact repMetricGridV730">
        <article class="v7MetricCard primary"><span>Stock propio</span><strong>${d.stockUnits}</strong><small>${fmtMoney(d.stockValue)} valor de adquisición</small></article>
        <article class="v7MetricCard"><span>Ventas registradas</span><strong>${d.salesCount}</strong><small>${fmtMoney(d.salesTotal)}</small></article>
        <article class="v7MetricCard"><span>Pedidos abiertos</span><strong>${d.openOrders}</strong><small>${d.orders.length} pedido(s) total</small></article>
        <article class="v7MetricCard"><span>Última actividad</span><strong>${d.lastActivity ? fmtDate(d.lastActivity) : '—'}</strong><small>${d.lowStock} producto(s) con stock bajo</small></article>
      </section>
      <section class="v7Panel">
        <div class="v7PanelHead"><div><span class="v7Eyebrow">Configuración comercial</span><h2>Precios de compra</h2></div><button class="btn sm outline" id="editRepConfigV730">Editar</button></div>
        <div class="priceLine"><span>Grupo de precios</span><b>${escapeHtml(group ? group.name : 'Sin grupo fijo')}</b></div>
        <div class="priceLine"><span>Descuento personal</span><b>${Number(d.config.discountPercent ?? d.profile.representative_discount_percent ?? 0)}%</b></div>
      </section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Inventario regional</span><h2>Stock actual</h2></div><span class="v7BadgeCount">${d.stock.length}</span></div>
        ${d.stock.length ? d.stock.map(r => `<div class="repStockLineV730"><span>${r.photo ? `<img src="${r.photo}" loading="lazy" decoding="async" alt="">` : '<i>NV</i>'}<span><strong>${escapeHtml(r.productName)}</strong><small>${escapeHtml(r.category || 'General')} · costo ${fmtMoney(r.acquisitionCost)}</small></span></span><b>${Number(r.stock || 0)}</b></div>`).join('') : '<div class="v7Empty small"><span>📦</span><p>Este representante todavía no tiene stock confirmado.</p></div>'}
      </section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Rotación</span><h2>Productos más movidos</h2></div></div>
        ${d.topProducts.length ? d.topProducts.map((r, i) => `<div class="priceLine"><span>${i + 1}. ${escapeHtml(r.name)}</span><b>${r.units} u. · ${fmtMoney(r.total)}</b></div>`).join('') : '<div class="v7Empty small"><span>📈</span><p>Aún no hay ventas suficientes para calcular rotación.</p></div>'}
      </section>
      <details class="v7Panel repDetailsV730" open><summary>Movimientos recientes (${d.movements.length})</summary>
        ${d.movements.slice(0,20).map(m => `<div class="repMovementV730"><span><strong>${escapeHtml(m.productName)}</strong><small>${escapeHtml(movementLabelV730(m.movementType))} · ${fmtDateTime(m.createdAt)}</small></span><b class="${m.quantity >= 0 ? 'positive' : 'negative'}">${m.quantity >= 0 ? '+' : ''}${m.quantity}</b></div>`).join('') || '<div class="v7Empty small"><p>Sin movimientos registrados.</p></div>'}
      </details>
      <details class="v7Panel repDetailsV730"><summary>Pedidos (${d.orders.length})</summary>
        ${d.orders.slice(0,15).map(o => `<div class="priceLine"><span>${escapeHtml(o.orderNumber || o.id || 'Pedido')}<small>${fmtDateTime(o.createdAt)} · ${escapeHtml(o.status || 'pendiente')}</small></span><b>${fmtMoney(o.total)}</b></div>`).join('') || '<div class="v7Empty small"><p>Sin pedidos.</p></div>'}
      </details>
      <details class="v7Panel repDetailsV730"><summary>Ventas (${d.sales.length})</summary>
        ${d.sales.slice().sort((a,b)=>Number(b.date||0)-Number(a.date||0)).slice(0,15).map(s => `<div class="priceLine"><span>${escapeHtml(s.clientName || 'Cliente')}<small>${fmtDateTime(s.date)} · ${escapeHtml(s.documentNumber || 'Venta')}</small></span><b>${fmtMoney(s.total)}</b></div>`).join('') || '<div class="v7Empty small"><p>Sin ventas registradas.</p></div>'}
      </details>`;
  }

  function openRepresentativeConfigV730(userId, profile, onSaved) {
    const cfg = Object.assign({ priceGroupId: profile.representative_price_group_id || '', discountPercent: Number(profile.representative_discount_percent || 0) }, repConfigV730(userId) || {});
    openSheet(`
      <h2>Configurar representante <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CashNotice">El grupo define el precio base de compra. El descuento personal se registra como beneficio adicional del representante.</div>
      <div class="field"><label>Grupo de precios</label><select id="repGroupV730"><option value="">Sin grupo fijo</option>${(AppState.priceGroups || []).map(g => `<option value="${g.id}" ${cfg.priceGroupId === g.id ? 'selected' : ''}>${escapeHtml(g.name)} (${g.mode === 'discount' ? '−' : '+'}${g.percent}%)</option>`).join('')}</select></div>
      <div class="field"><label>Descuento personal de compra</label><input id="repDiscountV730" type="number" min="0" max="100" step="0.5" value="${Number(cfg.discountPercent ?? profile.representative_discount_percent ?? 0)}"></div>
      <button class="btn block" id="saveRepConfigV730">Guardar configuración</button>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#saveRepConfigV730', overlay).addEventListener('click', async () => {
        const btn = $('#saveRepConfigV730', overlay);
        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          const discount = Math.max(0, Math.min(100, Number($('#repDiscountV730', overlay).value || 0)));
          const priceGroupId = $('#repGroupV730', overlay).value || '';
          const res = await setRepresentativePricingV730(userId, priceGroupId, discount);
          if (!res.ok) throw new Error(res.message || 'No se pudo guardar la configuración.');
          await saveRepresentativeConfigV730(userId, { priceGroupId, discountPercent: discount }, profile);
          if (res.groupPendingMigration) showToast(res.message, 'error');
          close(); showToast('Grupo y descuento actualizados.');
          if (typeof onSaved === 'function') onSaved();
        } catch (error) { btn.disabled = false; btn.textContent = 'Reintentar'; showToast(error.message || 'No se pudo guardar.', 'error'); }
      });
    });
  }

  function openRepresentativeDetailV730(userId, profiles = AppState.allProfiles || []) {
    const profile = repProfileByIdV730(userId, profiles);
    const sheet = openSheet(`<h2>Ficha del representante <span class="x" id="closeSheet">✕</span></h2><div id="repDetailBodyV730"><div class="loading">Consultando stock, ventas y movimientos…</div></div>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
    });
    representativeDashboardV730(userId, profiles).then(d => {
      const body = $('#repDetailBodyV730', sheet.overlay);
      if (!body) return;
      body.innerHTML = repDetailHtmlV730(d);
      $('#editRepConfigV730', sheet.overlay)?.addEventListener('click', () => openRepresentativeConfigV730(userId, profile, () => {
        sheet.close(); setTimeout(() => openRepresentativeDetailV730(userId, profiles), 50);
      }));
    }).catch(error => {
      const body = $('#repDetailBodyV730', sheet.overlay);
      if (body) body.innerHTML = `<div class="v7Empty"><span>⚠</span><h3>No se pudo cargar la ficha</h3><p>${escapeHtml(error.message || String(error))}</p></div>`;
    });
  }

  async function hydrateRepresentativeCardsV730(profiles = AppState.allProfiles || []) {
    if (!isAdmin()) return;
    const reps = profiles.filter(p => String(p.role || '').toLowerCase() !== 'administrador');
    try {
      const sb = await requireClient();
      const { data, error } = await sb.from('representative_stock').select('representative_user_id,stock,acquisition_cost,updated_at');
      if (error) throw error;
      const map = new Map();
      (data || []).forEach(r => {
        const row = map.get(r.representative_user_id) || { units: 0, value: 0, last: 0 };
        row.units += Number(r.stock || 0);
        row.value += Number(r.stock || 0) * Number(r.acquisition_cost || 0);
        row.last = Math.max(row.last, r.updated_at ? new Date(r.updated_at).getTime() : 0);
        map.set(r.representative_user_id, row);
      });
      reps.forEach(p => {
        const row = map.get(p.id) || { units: 0, value: 0, last: 0 };
        const sales = repSalesV730(p.id);
        const unitsEl = document.querySelector(`[data-rep-stock-units="${p.id}"]`);
        const salesEl = document.querySelector(`[data-rep-sales-total="${p.id}"]`);
        const activityEl = document.querySelector(`[data-rep-last-activity="${p.id}"]`);
        if (unitsEl) unitsEl.textContent = `${row.units} u. · ${fmtMoney(row.value)}`;
        if (salesEl) salesEl.textContent = `${sales.length} venta(s) · ${fmtMoney(sales.reduce((s,x)=>s+Number(x.total||0),0))}`;
        if (activityEl) activityEl.textContent = row.last ? fmtDate(row.last) : (sales.length ? fmtDate(Math.max(...sales.map(s=>Number(s.date||0)))) : 'Sin actividad');
      });
    } catch (error) { console.warn('No se pudo hidratar representantes:', error.message || error); }
  }

  function clientBenefitActiveV730(client) {
    if (!client) return false;
    if (!client.benefitUntil) return true;
    const end = new Date(`${client.benefitUntil}T23:59:59`).getTime();
    return Number.isFinite(end) && end >= Date.now();
  }

  function clientBenefitLabelV730(client) {
    if (!client) return '';
    const group = AppState.priceGroups.find(g => g.id === client.priceGroupId);
    const parts = [];
    if (group) parts.push(group.name);
    if (Number(client.customDiscountPercent || 0) > 0) parts.push(`${Number(client.customDiscountPercent)}% personal`);
    if (client.benefitUntil) parts.push(`hasta ${fmtDate(client.benefitUntil)}`);
    return parts.join(' · ');
  }

  function openClientBenefitV730(clientId) {
    const client = (AppState.clients || []).find(c => c.id === clientId);
    if (!client) return;
    openSheet(`
      <h2>Beneficio comercial <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CashNotice"><strong>${escapeHtml(client.name || 'Cliente')}</strong><br>Asigna precios preferenciales sin modificar los precios generales.</div>
      <div class="field"><label>Grupo de precios</label><select id="benefitGroupV730"><option value="">Sin grupo</option>${(AppState.priceGroups || []).map(g => `<option value="${g.id}" ${client.priceGroupId === g.id ? 'selected' : ''}>${escapeHtml(g.name)} (${g.mode === 'discount' ? '−' : '+'}${g.percent}%)</option>`).join('')}</select></div>
      <div class="field"><label>Descuento personal adicional (%)</label><input id="benefitDiscountV730" type="number" min="0" max="100" step="0.5" value="${Number(client.customDiscountPercent || 0)}"></div>
      <div class="field"><label>Vigencia opcional</label><input id="benefitUntilV730" type="date" value="${escapeHtml(client.benefitUntil || '')}"></div>
      <div class="field"><label>Nota interna</label><input id="benefitNoteV730" value="${escapeHtml(client.benefitNote || '')}" placeholder="Ej.: cliente frecuente, recuperación, promoción"></div>
      <button class="btn block" id="saveBenefitV730">Guardar beneficio</button>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#saveBenefitV730', overlay).addEventListener('click', async () => {
        const btn = $('#saveBenefitV730', overlay); btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          const before = Object.assign({}, client);
          const updated = buildClientRecordV723(client, {
            priceGroupId: $('#benefitGroupV730', overlay).value || '',
            customDiscountPercent: Math.max(0, Math.min(100, Number($('#benefitDiscountV730', overlay).value || 0))),
            benefitUntil: $('#benefitUntilV730', overlay).value || '',
            benefitNote: $('#benefitNoteV730', overlay).value.trim()
          });
          await saveClientV723(updated);
          if (window.writeAudit) await writeAudit('client:benefit', 'clients', client.id, before, updated).catch(() => {});
          close(); showToast('Beneficio comercial actualizado.');
          if (AppState.currentTab === 'clientes') renderClients();
        } catch (error) { btn.disabled = false; btn.textContent = 'Reintentar'; showToast(error.message || 'No se pudo guardar.', 'error'); }
      });
    });
  }

  function clientActivityV730(client) {
    const sales = window.clientSalesV723 ? clientSalesV723(client) : (AppState.sales || []).filter(s => s.clientId === client.id);
    const last = sales.length ? Math.max(...sales.map(s => Number(s.date || 0))) : 0;
    const total = sales.reduce((s,x)=>s+Number(x.total||0),0);
    return { client, sales, last, total, days: last ? Math.floor((Date.now()-last)/DAY) : 9999 };
  }

  function quoteFollowupsV730() {
    return (AppState.quotes || []).filter(q => {
      const created = Number(q.createdAt || 0);
      if (!created || Date.now() - created < 3 * DAY) return false;
      return !(AppState.sales || []).some(s => (q.clientId && s.clientId === q.clientId) && Number(s.date || 0) > created);
    }).slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,10);
  }

  function risingClientsV730() {
    const now = Date.now();
    return (AppState.clients || []).map(c => {
      const sales = window.clientSalesV723 ? clientSalesV723(c) : [];
      const current = sales.filter(s => now - Number(s.date||0) <= 30*DAY).reduce((x,s)=>x+Number(s.total||0),0);
      const previous = sales.filter(s => now - Number(s.date||0) > 30*DAY && now - Number(s.date||0) <= 60*DAY).reduce((x,s)=>x+Number(s.total||0),0);
      return { client:c, current, previous, growth: current - previous };
    }).filter(x => x.current > 0 && x.growth > 0).sort((a,b)=>b.growth-a.growth).slice(0,8);
  }

  function renderCommercialCenterV730() {
    $('#fabAdd').classList.add('hidden');
    const clients = (AppState.clients || []).map(clientActivityV730);
    const inactive = clients.filter(x => x.sales.length && x.days >= 30).sort((a,b)=>b.total-a.total).slice(0,10);
    const rising = risingClientsV730();
    const low = (AppState.products || []).filter(p => Number(p.stock||0) <= Number(AppState.settings.lowStockThreshold || 5)).sort((a,b)=>Number(a.stock||0)-Number(b.stock||0)).slice(0,12);
    const receivables = window.receivableSalesV725 ? receivableSalesV725().slice(0,10) : [];
    const quotes = quoteFollowupsV730();
    const reps = isAdmin() ? (AppState.allProfiles || []).filter(p => String(p.role||'').toLowerCase() !== 'administrador') : [];
    $('#mainArea').innerHTML = `
      <section class="v7PageHead"><span class="v7Eyebrow">Decisiones accionables</span><h1>Centro Comercial</h1><p>Clientes para recuperar, oportunidades, stock crítico, cotizaciones pendientes y representantes.</p></section>
      <section class="v7MetricGrid compact">
        <article class="v7MetricCard primary"><span>Clientes por contactar</span><strong>${inactive.length}</strong><small>30 días o más sin compra</small></article>
        <article class="v7MetricCard"><span>En crecimiento</span><strong>${rising.length}</strong><small>mejoraron últimos 30 días</small></article>
        <article class="v7MetricCard"><span>Stock crítico</span><strong>${low.length}</strong><small>productos bajo mínimo</small></article>
        <article class="v7MetricCard"><span>Saldos pendientes</span><strong>${receivables.length}</strong><small>ventas por cobrar</small></article>
      </section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Recuperación</span><h2>Clientes para volver a contactar</h2></div><button class="btn sm outline" id="goClientsV730">Ver clientes</button></div>
        ${inactive.length ? inactive.map(x => `<div class="commercialActionV730"><span><strong>${escapeHtml(x.client.name)}</strong><small>${x.days} días sin compra · histórico ${fmtMoney(x.total)}</small></span><span>${x.client.phone ? `<button class="waIconBtnV723 contactClientV730" data-id="${x.client.id}" title="Contactar por WhatsApp"><span class="waLogoV730">◉</span></button>` : ''}<button class="btn sm outline quoteClientV730" data-id="${x.client.id}">Precios</button></span></div>`).join('') : '<div class="v7Empty small"><span>✓</span><p>No hay clientes relevantes inactivos.</p></div>'}
      </section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Tendencia</span><h2>Clientes que están creciendo</h2></div></div>
        ${rising.length ? rising.map(x => `<div class="priceLine"><span>${escapeHtml(x.client.name)}<small>Últimos 30 días ${fmtMoney(x.current)}</small></span><b>+${fmtMoney(x.growth)}</b></div>`).join('') : '<div class="v7Empty small"><span>📈</span><p>Aún no hay comparación suficiente.</p></div>'}
      </section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Seguimiento</span><h2>Cotizaciones sin venta posterior</h2></div><button class="btn sm outline" id="goQuotesV730">Ver cotizaciones</button></div>
        ${quotes.length ? quotes.map(q => `<div class="commercialActionV730"><span><strong>${escapeHtml(q.clientName || 'Cliente')}</strong><small>${fmtDate(q.createdAt)} · ${q.items ? q.items.length : 0} producto(s)</small></span><button class="btn sm outline openQuoteV730" data-id="${q.id}">Abrir</button></div>`).join('') : '<div class="v7Empty small"><span>💬</span><p>No hay cotizaciones pendientes de seguimiento.</p></div>'}
      </section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Inventario</span><h2>Productos próximos a agotarse</h2></div><button class="btn sm outline" id="goInventoryV730">Inventario</button></div>
        ${low.length ? low.map(p => `<div class="priceLine"><span>${escapeHtml(p.name)}<small>${escapeHtml(p.category || 'General')}</small></span><b>${Number(p.stock||0)} u.</b></div>`).join('') : '<div class="v7Empty small"><span>📦</span><p>No hay stock crítico.</p></div>'}
      </section>
      ${isAdmin() ? `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Red comercial</span><h2>Representantes</h2></div><button class="btn sm outline" id="goRepsV730">Gestionar</button></div>${reps.slice(0,8).map(p => `<button class="commercialRepRowV730" data-id="${p.id}"><span><strong>${escapeHtml(p.full_name || p.email)}</strong><small>${escapeHtml(p.city || '')}</small></span><b>Ver ficha ›</b></button>`).join('') || '<div class="v7Empty small"><p>Sin representantes.</p></div>'}</section>` : ''}`;

    $('#goClientsV730')?.addEventListener('click', () => navigateToV7('clientes'));
    $('#goQuotesV730')?.addEventListener('click', () => navigateToV7('cotizaciones'));
    $('#goInventoryV730')?.addEventListener('click', () => navigateToV7('inventario'));
    $('#goRepsV730')?.addEventListener('click', () => navigateToV7('usuarios'));
    $all('.contactClientV730').forEach(b => b.addEventListener('click', () => { const c=AppState.clients.find(x=>x.id===b.dataset.id); if(c) openWhatsAppV723(c.phone,c.name); }));
    $all('.quoteClientV730').forEach(b => b.addEventListener('click', () => { const c=AppState.clients.find(x=>x.id===b.dataset.id); if(c) openQuoteForm({client:c, priceGroupId:c.priceGroupId||''}); }));
    $all('.openQuoteV730').forEach(b => b.addEventListener('click', () => openQuotePreview(b.dataset.id)));
    $all('.commercialRepRowV730').forEach(b => b.addEventListener('click', () => openRepresentativeDetailV730(b.dataset.id, AppState.allProfiles || [])));
  }

  Object.assign(window, {
    saveRepresentativeConfigV730,
    saveRepresentativeConfigV725: saveRepresentativeConfigV730,
    openRepresentativeDetailV730,
    openRepresentativeDetailV725: openRepresentativeDetailV730,
    hydrateRepresentativeCardsV730,
    openClientBenefitV730,
    openClientBenefitV725: openClientBenefitV730,
    clientBenefitActiveV730,
    clientBenefitLabelV730,
    renderCommercialCenterV730,
    representativeDashboardV730
  });
})();
