/* NATURA VIDA V7 — shell, navegación por rol y panel moderno. */

(() => {
  const oldRenderMas = window.renderMas;
  const oldRenderResumen = window.renderResumen;
  const oldRenderReports = window.renderReportsFoundation;

  const BRAND_MAIN_LOGO = 'icons/icon-192.png';

  function displayNameV7() {
    const session = AppState.session || {};
    const raw = String(session.fullName || session.email || session.username || '').trim();
    if (!raw) return 'Usuario Natura Vida';
    if (raw.includes('@')) {
      const local = raw.split('@')[0].replace(/[._-]+/g, ' ').trim();
      if (local) return local.replace(/\b\w/g, c => c.toUpperCase());
    }
    return raw;
  }

  function displayInitialV7() {
    return String(displayNameV7()).trim().charAt(0).toUpperCase() || 'N';
  }

  function v7Icon(name) {
    const paths = {
      home: '<path d="M4 10.8 12 4l8 6.8V20a1 1 0 0 1-1 1h-4.7v-5.4H9.7V21H5a1 1 0 0 1-1-1z"/>',
      sell: '<path d="M5 5h10l4 4v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M14 5v5h5M7 14h8M7 17h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      buy: '<path d="M4 5h2l1.3 9.2a2 2 0 0 0 2 1.8h7.4a2 2 0 0 0 2-1.6L20 8H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>',
      inventory: '<path d="M12 2.8 3.7 7v10L12 21.2 20.3 17V7z"/><path d="m4 7 8 4 8-4M12 11v10" fill="none" stroke="#fff" stroke-width="1.4" opacity=".7"/>',
      orders: '<path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 8h8M8 12h8M8 16h5" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".75"/>',
      more: '<circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/>',
      bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 21h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      profile: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      users: '<path d="M9 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm6 1a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 15 12z"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0M13 21a5.5 5.5 0 0 1 9 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      clients: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      tag: '<path d="M3 11V5a2 2 0 0 1 2-2h6l10 10-8 8z"/><circle cx="8" cy="8" r="1.5" fill="#fff"/>',
      chart: '<path d="M5 20V10M12 20V4M19 20v-7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
      settings: '<circle cx="12" cy="12" r="3.5"/><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.6-1.4l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.4-.6L10.5 3h-3l-.7 2a7 7 0 0 0-1.4.6l-1.9-.9-2.1 2.1.9 1.9a7 7 0 0 0-.6 1.4l-2 .7v3l2 .7a7 7 0 0 0 .6 1.4l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.4.6l.7 2h3l.7-2a7 7 0 0 0 1.4-.6l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .6-1.4z" fill="none" stroke="currentColor" stroke-width="1.3"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.more}</svg>`;
  }

  function updateCloudStatusBadgeV7(status) {
    const badge = document.getElementById('cloudStatusBadge');
    if (!badge) return;
    const state = !navigator.onLine ? 'offline' : ((status && status.state) || 'connecting');
    const normalized = state === 'error' ? 'reconnecting' : state;
    const labels = { online: 'En línea', connecting: 'Conectando', reconnecting: 'Reconectando', offline: 'Sin internet' };
    badge.className = `cloudBadge v7Cloud ${normalized}`;
    const text = badge.querySelector('b');
    if (text) text.textContent = labels[normalized] || 'Conectando';
    badge.title = (status && status.detail) || labels[normalized] || '';
  }

  function renderTopHeaderV7() {
    const name = AppState.settings.businessName || 'NATURA VIDA';
    const headerLogo = AppState.settings.logo || BRAND_MAIN_LOGO;
    $('#bizName').textContent = name;
    $('#bizLogo').innerHTML = `<img src="${headerLogo}" alt="${escapeHtml(name)}">`;
    const subtitle = document.querySelector('header.top .bizsub');
    if (subtitle) {
      subtitle.textContent = requireAuth()
        ? `${displayNameV7()} · ${isAdmin() ? 'Administración' : 'Representante'}`
        : 'Te cuida por dentro y por fuera';
    }
    if (window.installInboxButton) {
      installInboxButton();
      refreshInboxBadge({ silent: true }).catch(() => {});
    }
    updateCloudStatusBadgeV7(window.CloudConnection);
  }

  function navItemsV7() {
    if (isAdmin()) return [
      ['inicio', 'home', 'Inicio'],
      ['inventario', 'inventory', 'Inventario'],
      ['vender', 'sell', 'Ventas'],
      ['pedidos', 'orders', 'Pedidos'],
      ['mas', 'more', 'Más']
    ];
    return [
      ['inicio', 'home', 'Inicio'],
      ['vender', 'sell', 'Ventas'],
      ['compra', 'buy', 'Compra'],
      ['inventario', 'inventory', 'Mi stock'],
      ['mas', 'more', 'Más']
    ];
  }

  function renderBottomNavV7() {
    const nav = $('#bottomNav');
    if (!nav || !requireAuth()) return;
    nav.innerHTML = navItemsV7().map(([tab, iconName, label]) => `
      <button data-tab="${tab}" aria-label="${label}">
        <span class="ic">${v7Icon(iconName)}</span><span class="tx">${label}</span>
      </button>`).join('');
    $all('button', nav).forEach(btn => btn.addEventListener('click', () => navigateToV7(btn.dataset.tab)));
    highlightActiveV7();
  }

  function highlightActiveV7() {
    $all('#bottomNav button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === AppState.currentTab));
  }

  function canAccessV7(tab) {
    if (!requireAuth()) return false;
    if (isAdmin()) return !['compra', 'perfil-cambio'].includes(tab);
    return ['inicio', 'vender', 'compra', 'inventario', 'mas', 'clientes', 'inbox', 'perfil', 'historial', 'ajustes'].includes(tab);
  }

  function navigateToV7(tab) {
    // Compatibilidad con botones antiguos: el módulo se llama distinto según el rol.
    if (tab === 'pedido') tab = isAdmin() ? 'pedidos' : 'compra';
    if (tab === 'cotizar' && !isAdmin()) tab = 'vender';
    if (!canAccessV7(tab)) return;
    if (tab === 'ajustes' && !isAdmin()) tab = 'perfil';
    if (window.V7_FORM_DIRTY && tab !== AppState.currentTab) {
      const leave = window.confirm('Hay cambios sin guardar en esta pantalla. ¿Salir y descartarlos?');
      if (!leave) return;
    }
    window.V7_FORM_DIRTY = false;
    AppState.currentTab = tab;
    highlightActiveV7();
    renderV7();
  }

  function renderV7() {
    if (!requireAuth()) {
      renderLoginScreen();
      return;
    }
    $('#fabAdd').classList.add('hidden');
    $('#fabAdd').onclick = null;
    const cartBar = $('#cartBar');
    if (cartBar && !['vender', 'compra'].includes(AppState.currentTab)) cartBar.classList.add('hidden');
    switch (AppState.currentTab) {
      case 'inicio': renderInicioV7(); break;
      case 'inventario': renderInventario(); break;
      case 'vender': renderVender(); break;
      case 'compra': renderOrderRequest(); break;
      case 'pedidos': renderAdminOrdersInbox(); break;
      case 'clientes': renderClients(); break;
      case 'inbox': openInboxPanel(); break;
      case 'perfil': renderProfileV7(); break;
      case 'historial': renderHistoryV7(); break;
      case 'grupos': renderPriceGroups(); break;
      case 'usuarios': renderUsersFoundation(); break;
      case 'resumen': oldRenderResumen ? oldRenderResumen() : renderInicioV7(); break;
      case 'reportes-pro': oldRenderReports ? oldRenderReports() : renderInicioV7(); break;
      case 'ajustes': isAdmin() ? renderSettings() : renderProfileV7(); break;
      case 'mas': renderMasV7(); break;
      default: renderInicioV7();
    }
  }

  function roleGreeting() {
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    const firstName = String(displayNameV7()).trim().split(/\s+/)[0] || 'bienvenido';
    return `${greet}, ${firstName}`;
  }

  function pendingOrderCount() {
    return (AppState.purchaseOrders || []).filter(o => !['paid', 'cancelled', 'rejected'].includes(o.status)).length;
  }

  async function getOrdersMemoryV7() {
    const rows = await DB.getAll('purchaseOrders').catch(() => []);
    AppState.purchaseOrders = rows;
    return rows;
  }

  async function renderInicioV7() {
    const main = $('#mainArea');
    const orders = await getOrdersMemoryV7();
    const sales = AppState.sales || [];
    const ownSales = isAdmin() ? sales : sales.filter(s => s.sellerId === AppState.session.userId);
    const todayKey = new Date().toDateString();
    const todaySales = ownSales.filter(s => new Date(s.date).toDateString() === todayKey);
    const todayTotal = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const unread = (AppState.messages || []).filter(m => messageVisibleForCurrentUser(m) && m.status !== 'read').length;
    const ownOrders = isAdmin() ? orders : orders.filter(o => o.representativeId === AppState.session.userId);
    const ownStock = AppState.products.reduce((sum, p) => sum + Number(p.stock || 0), 0);
    const name = displayNameV7();

    main.innerHTML = `
      <section class="v7Hero">
        <div class="v7HeroGlow"></div>
        <span class="v7Eyebrow">${isAdmin() ? 'Centro de operaciones' : 'Mi negocio Natura Vida'}</span>
        <h1>${escapeHtml(roleGreeting())}</h1>
        <p>${isAdmin()
          ? 'Controla productos, ventas, pedidos y representantes desde una sola base en tiempo real.'
          : 'Vende, compra reposición y administra tu inventario con datos oficiales de Supabase.'}</p>
        <div class="v7Identity"><span>${isAdmin() ? 'Administrador principal' : 'Representante activo'}</span><strong>${escapeHtml(name)}</strong></div>
      </section>

      <section class="v7MetricGrid">
        <article class="v7MetricCard primary"><span>Ventas hoy</span><strong>${fmtMoney(todayTotal)}</strong><small>${todaySales.length} operación(es)</small></article>
        <article class="v7MetricCard"><span>${isAdmin() ? 'Pedidos abiertos' : 'Mis pedidos'}</span><strong>${isAdmin() ? orders.filter(o => !['paid','cancelled','rejected'].includes(o.status)).length : ownOrders.length}</strong><small>actualización automática</small></article>
        <article class="v7MetricCard"><span>${isAdmin() ? 'Productos activos' : 'Unidades propias'}</span><strong>${isAdmin() ? AppState.products.length : ownStock}</strong><small>${isAdmin() ? 'catálogo central' : 'inventario disponible'}</small></article>
        <article class="v7MetricCard notification"><span>Notificaciones</span><strong>${unread}</strong><small>pendientes de lectura</small></article>
      </section>

      <section class="v7Panel">
        <div class="v7PanelHead"><div><span class="v7Eyebrow">Actividad reciente</span><h2>Todo bajo control</h2></div><span class="v7LiveChip">Realtime</span></div>
        ${(AppState.messages || []).filter(messageVisibleForCurrentUser).slice().sort((a,b)=>b.createdAt-a.createdAt).slice(0,4).map(m => `
          <button class="v7ActivityRow" data-open-inbox="1"><span class="v7ActivityIcon">${m.type === 'purchase_order' ? '🛒' : m.type.includes('profile') ? '👤' : '✓'}</span><span><strong>${escapeHtml(m.title)}</strong><small>${escapeHtml(m.body)} · ${fmtDateTime(m.createdAt)}</small></span><b>›</b></button>
        `).join('') || `<div class="v7EmptyInline"><span>🌿</span><div><strong>Aún no hay actividad</strong><small>Los movimientos aparecerán automáticamente.</small></div></div>`}
      </section>

      <section class="v7Panel v7NaturePanel">
        <div><span class="v7Eyebrow">Natura Vida V7</span><h2>Simple por fuera. Potente por dentro.</h2><p>Una sola base oficial, actualización automática y operaciones únicamente al contado.</p></div>
        <div class="v7NatureMark">NV</div>
      </section>
    `;
    $all('[data-open-inbox]', main).forEach(b => b.addEventListener('click', () => openInboxPanel()));
  }

  function moreItem(id, iconName, title, subtitle = '', badge = '') {
    return `<button class="v7MoreItem" id="${id}"><span class="v7MoreIcon">${v7Icon(iconName)}</span><span><strong>${title}</strong>${subtitle ? `<small>${subtitle}</small>` : ''}</span>${badge ? `<em>${badge}</em>` : ''}<b>›</b></button>`;
  }

  function renderMasV7() {
    const main = $('#mainArea');
    const cp = window.myCommercialProfile ? myCommercialProfile() : {};
    main.innerHTML = `
      <section class="v7PageHead"><span class="v7Eyebrow">Configuración y herramientas</span><h1>Más opciones</h1><p>Solo se muestran funciones disponibles para tu rol.</p></section>
      <section class="v7ProfileSummary">
        <div class="v7Avatar">${escapeHtml(displayInitialV7())}</div>
        <div><strong>${escapeHtml(displayNameV7())}</strong><span>${escapeHtml(AppState.session.email || '')}</span><small>${isAdmin() ? 'Administrador principal' : (cp.businessName || 'Representante Natura Vida')}</small></div>
      </section>
      <section class="v7MoreList">
        ${moreItem('v7MoreInbox', 'bell', 'Bandeja y actividad', 'Avisos, aprobaciones y comprobantes')}
        ${moreItem('v7MoreClients', 'clients', 'Clientes', 'Directorio e historial de compras')}
        ${moreItem('v7MoreHistory', 'chart', 'Ventas y recibos', 'Historial permanente de operaciones')}
        ${moreItem('v7MoreCatalog', 'tag', 'Catálogo PDF', 'Descargar o compartir con cualquier aplicación')}
        ${moreItem('v7MoreProfile', 'profile', 'Perfil comercial y QR', 'Datos para recibos y cobros')}
        ${isAdmin() ? moreItem('v7MoreUsers', 'users', 'Representantes', 'Aprobar, bloquear y personalizar descuento') : ''}
        ${isAdmin() ? moreItem('v7MoreGroups', 'tag', 'Grupos de precios', 'Reglas generales de precios') : ''}
        ${isAdmin() ? moreItem('v7MoreSettings', 'settings', 'Configuración del negocio', 'Marca, contacto y parámetros') : ''}
        ${moreItem('v7MoreUpdates', 'settings', 'Actualizaciones', 'Versión instalada, revisión y recarga segura')}
      </section>
      <button class="v7Logout" id="v7LogoutBtn">Cerrar sesión</button>
      <div class="v7Version">Natura Vida V${escapeHtml(window.NATURA_APP_VERSION || '7.2.0')} · Supabase · Realtime</div>
    `;
    $('#v7MoreInbox').addEventListener('click', () => openInboxPanel());
    $('#v7MoreClients').addEventListener('click', () => navigateToV7('clientes'));
    $('#v7MoreHistory').addEventListener('click', () => navigateToV7('historial'));
    $('#v7MoreCatalog').addEventListener('click', () => openCatalogPdfOptions());
    $('#v7MoreProfile').addEventListener('click', () => navigateToV7('perfil'));
    if ($('#v7MoreUsers')) $('#v7MoreUsers').addEventListener('click', () => navigateToV7('usuarios'));
    if ($('#v7MoreGroups')) $('#v7MoreGroups').addEventListener('click', () => navigateToV7('grupos'));
    if ($('#v7MoreSettings')) $('#v7MoreSettings').addEventListener('click', () => navigateToV7('ajustes'));
    if ($('#v7MoreUpdates')) $('#v7MoreUpdates').addEventListener('click', () => window.openUpdateCenter ? openUpdateCenter() : showToast('El módulo de actualización no está disponible.', 'error'));
    $('#v7LogoutBtn').addEventListener('click', logoutSession);
  }

  function renderHistoryV7() {
    const sales = (AppState.sales || []).filter(s => isAdmin() || s.sellerId === AppState.session.userId).slice().sort((a,b)=>b.date-a.date);
    $('#mainArea').innerHTML = `
      <section class="v7PageHead"><span class="v7Eyebrow">Registro permanente</span><h1>Ventas y recibos</h1><p>Todas las operaciones confirmadas al contado.</p></section>
      <section class="v7HistoryList">
        ${sales.map(s => `<button class="v7HistoryCard" data-sale-id="${s.id}"><span><strong>${escapeHtml(s.documentNumber || s.receiptNumber || 'Venta')}</strong><small>${escapeHtml(s.clientName || 'Cliente')} · ${fmtDateTime(s.date)}</small></span><span><b>${fmtMoney(s.total)}</b><small>${s.type && s.type.includes('wholesale') ? 'Mayorista' : 'Unitaria'}</small></span></button>`).join('') || `<div class="v7Empty"><span>🧾</span><h3>Sin ventas registradas</h3><p>Los recibos aparecerán aquí al confirmar ventas.</p></div>`}
      </section>`;
    $all('[data-sale-id]').forEach(btn => btn.addEventListener('click', () => {
      const sale = sales.find(s => s.id === btn.dataset.saleId);
      if (sale) openV7ReceiptPreview(sale, 'sale');
    }));
  }

  Object.assign(window, {
    v7Icon,
    displayNameV7,
    displayInitialV7,
    updateCloudStatusBadge: updateCloudStatusBadgeV7,
    renderTopHeader: renderTopHeaderV7,
    renderBottomNav: renderBottomNavV7,
    navigateTo: navigateToV7,
    render: renderV7,
    renderInicio: renderInicioV7,
    renderMas: renderMasV7,
    renderHistoryV7,
    canAccessTab: canAccessV7
  });
})();
