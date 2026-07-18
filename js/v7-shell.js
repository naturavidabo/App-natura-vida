/* NATURA VIDA V7.7.1 — shell, navegación por rol y cabecera insignia. */

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
    $('#bizLogo').innerHTML = `<span class="nv771LogoHalo"></span><img src="${headerLogo}" alt="${escapeHtml(name)}">`;
    const subtitle = document.querySelector('header.top .bizsub');
    if (subtitle) subtitle.textContent = 'Te cuida por dentro y por fuera';

    const avatarBox = $('#topProfileAvatarV771');
    const avatarUrl = window.profileAvatarUrlV771 ? profileAvatarUrlV771(AppState.session || {}) : String(AppState.session?.avatarUrl || '');
    if (avatarBox) avatarBox.innerHTML = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="Mi fotografía" loading="lazy" decoding="async">`
      : `<b>${escapeHtml(displayInitialV7())}</b>`;
    const profileName = $('#topProfileNameV771');
    const profileRole = $('#topProfileRoleV771');
    if (profileName) profileName.textContent = requireAuth() ? displayNameV7() : 'Mi perfil';
    if (profileRole) profileRole.textContent = requireAuth() ? (AppState.session.roleShortName || AppState.session.roleName || (isAdmin() ? 'Administración central' : 'Representante')) : 'Natura Vida';
    const profileButton = $('#topProfileButtonV771');
    if (profileButton && !profileButton.dataset.bound) {
      profileButton.dataset.bound = '1';
      profileButton.addEventListener('click', () => { if (requireAuth()) navigateToV7('perfil'); });
    }
    if (window.installInboxButton) {
      installInboxButton();
      refreshInboxBadge({ silent: true }).catch(() => {});
    }
    updateCloudStatusBadgeV7(window.CloudConnection);
  }

  function navItemsV7() {
    const role = AppState.session?.commercialRole || (isAdmin() ? 'central_admin' : 'commercial_representative');
    if (role === 'central_admin') return [
      ['inicio', 'home', 'Inicio'],
      ['inventario', 'inventory', 'Inventario'],
      ['vender', 'sell', 'Ventas'],
      ['pedidos', 'orders', 'Pedidos'],
      ['mas', 'more', 'Más']
    ];
    if (['regional_admin','regional_advanced','commercial_representative'].includes(role)) return [
      ['inicio', 'home', 'Inicio'],
      ['vender', 'sell', 'Ventas'],
      ['compra', 'buy', 'Compra'],
      ['inventario', 'inventory', 'Mi stock'],
      ['mas', 'more', 'Más']
    ];
    if (role === 'field_seller') return [
      ['inicio','home','Inicio'],['vender','sell','Ventas'],['clientes','clients','Clientes'],['territorio','more','Territorio'],['mas','more','Más']
    ];
    if (role === 'delivery') return [
      ['inicio','home','Inicio'],['distribucion','orders','Rutas'],['personal','users','Mi trabajo'],['inbox','bell','Avisos'],['mas','more','Más']
    ];
    if (role === 'production') return [
      ['inicio','home','Inicio'],['produccion','inventory','Producción'],['personal','users','Mi trabajo'],['inbox','bell','Avisos'],['mas','more','Más']
    ];
    if (role === 'inventory') return [
      ['inicio','home','Inicio'],['inventario','inventory','Inventario'],['personal','users','Mi trabajo'],['inbox','bell','Avisos'],['mas','more','Más']
    ];
    if (role === 'finance') return [
      ['inicio','home','Inicio'],['por-cobrar','tag','Cobros'],['egresos','chart','Finanzas'],['inbox','bell','Avisos'],['mas','more','Más']
    ];
    return [['inicio','home','Inicio'],['personal','users','Mi trabajo'],['inbox','bell','Avisos'],['perfil','profile','Perfil'],['mas','more','Más']];
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
    const always = ['inicio','mas','perfil','inbox','actualizaciones'];
    if (always.includes(tab)) return true;
    if (isAdmin()) return !['compra','perfil-cambio'].includes(tab);
    const permissionMap = {
      vender:'sales:create', clientes:'clients:manage', historial:'own_reports:read', estadisticas:'own_reports:read',
      'centro-comercial':'own_reports:read', 'por-cobrar':'receivables:manage', cotizaciones:'quotes:manage',
      compra:'orders:create', inventario:'inventory:own', regional:'regional:manage', grupos:'sales:create',
      distribucion:'routes:own', personal:'tasks:own', produccion:'production:operate', egresos:'finance:operate',
      territorio:'territory:manage', 'roles-estructura':'workforce:manage', usuarios:'workforce:manage', pedidos:'orders:team_read'
    };
    if (tab === 'distribucion' && hasPermission('deliveries:manage')) return true;
    if (tab === 'personal' && (hasPermission('workforce:manage') || hasPermission('attendance:own'))) return true;
    if (tab === 'inventario' && (hasPermission('inventory:operate') || hasPermission('inventory:delegated_read'))) return true;
    if (tab === 'puntos-stock' && (AppState.session?.commercialRole==='field_seller' || (window.canHoldStockV800&&canHoldStockV800()) || (window.canManageTeamV800&&canManageTeamV800()))) return true;
    if (tab === 'roles-estructura' && window.canOpenRolesV800 && canOpenRolesV800()) return true;
    const permission = permissionMap[tab];
    return permission ? hasPermission(permission) : false;
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
      case 'estadisticas': window.renderCommercialStatsV7 ? renderCommercialStatsV7() : renderInicioV7(); break;
      case 'centro-comercial': window.renderCommercialCenterV730 ? renderCommercialCenterV730() : renderInicioV7(); break;
      case 'por-cobrar': window.renderReceivablesV725 ? renderReceivablesV725() : renderInicioV7(); break;
      case 'egresos': isAdmin() && window.renderFinanceV725 ? renderFinanceV725() : renderInicioV7(); break;
      case 'produccion': isAdmin() && window.renderProductionV740 ? renderProductionV740() : renderInicioV7(); break;
      case 'regional': window.renderRegionalManagementV750 ? renderRegionalManagementV750() : renderInicioV7(); break;
      case 'distribucion': window.renderDistributionV760 ? renderDistributionV760() : renderInicioV7(); break;
      case 'personal': window.renderWorkforceV770 ? renderWorkforceV770() : renderInicioV7(); break;
      case 'territorio': window.renderTerritoryV801 ? renderTerritoryV801() : (window.renderTerritoryV800 ? renderTerritoryV800() : renderInicioV7()); break;
      case 'puntos-stock': window.renderLinkedStockV801 ? renderLinkedStockV801() : renderInicioV7(); break;
      case 'roles-estructura': window.renderRolesStructureV800 ? renderRolesStructureV800() : renderInicioV7(); break;
      case 'cotizaciones': window.renderQuotes ? renderQuotes() : renderInicioV7(); break;
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
    const ownSales = sales.filter(s => window.saleVisibleToCurrentBusinessV801 ? saleVisibleToCurrentBusinessV801(s) : (isAdmin() || s.sellerId === AppState.session.userId));
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
        <span class="v7Eyebrow">${isAdmin() ? 'Centro de operaciones' : escapeHtml(AppState.session.roleShortName || 'Mi negocio Natura Vida')}</span>
        <h1>${escapeHtml(roleGreeting())}</h1>
        <p>${isAdmin()
          ? 'Controla productos, ventas, pedidos y representantes desde una sola base en tiempo real.'
          : 'Vende, compra reposición y administra tu inventario con datos oficiales de Supabase.'}</p>
        <div class="v7Identity"><span>${escapeHtml(AppState.session.roleName || (isAdmin() ? 'Administrador central' : 'Representante activo'))}</span><strong>${escapeHtml(name)}</strong></div>
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
    if (window.renderManagementCenterV770) return renderManagementCenterV770();
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
        ${moreItem('v7MoreCenter', 'chart', 'Centro Comercial', 'Alertas, oportunidades y acciones recomendadas')}
        ${moreItem('v7MoreStats', 'chart', 'Estadísticas comerciales', 'Productos, clientes, recargos y rebajas')}
        ${moreItem('v7MoreReceivables', 'tag', 'Ventas por cobrar', 'Saldos pendientes y pagos parciales')}
        ${moreItem('v7MoreQuotes', 'tag', 'Precios / cotizaciones', 'Ofertas personalizadas para clientes')}
        ${moreItem('v7MoreRegional', 'users', isAdmin() ? 'Gestión regional' : 'Mi región comercial', isAdmin() ? 'Regiones, stock y solicitudes de representantes' : 'Configuración y reposición de stock')}
        ${moreItem('v7MoreDistribution', 'orders', 'Distribución y rutas', isAdmin() ? 'Planifica rutas, entregas y control territorial' : 'Mis rutas, entregas, GPS y evidencia')}
        ${isAdmin() ? moreItem('v7MoreProduction', 'inventory', 'Producción e insumos', 'Materia prima, órdenes, lotes y costo real') : ''}
        ${isAdmin() ? moreItem('v7MoreFinance', 'chart', 'Finanzas y egresos', 'Gastos operativos, ingresos y balance básico') : ''}
        ${moreItem('v7MoreCatalog', 'tag', 'Catálogo PDF', 'Descargar o compartir con cualquier aplicación')}
        ${moreItem('v7MoreProfile', 'profile', 'Perfil comercial y QR', 'Datos para recibos y cobros')}
        ${isAdmin() ? moreItem('v7MoreUsers', 'users', 'Representantes', 'Aprobar, bloquear y personalizar descuento') : ''}
        ${moreItem('v7MoreGroups', 'tag', isAdmin() ? 'Grupos de precios' : 'Mis grupos de precio', isAdmin() ? 'Reglas centrales de precios' : 'Reglas propias para tus clientes')}
        ${isAdmin() ? moreItem('v7MoreSettings', 'settings', 'Configuración del negocio', 'Marca, contacto y parámetros') : ''}
        ${moreItem('v7MoreUpdates', 'settings', 'Actualizaciones', 'Versión instalada, revisión y recarga segura')}
      </section>
      <button class="v7Logout" id="v7LogoutBtn">Cerrar sesión</button>
      <div class="v7Version">Natura Vida V${escapeHtml(window.NATURA_APP_VERSION || '8.0.1')} · Supabase · Realtime</div>
    `;
    $('#v7MoreInbox').addEventListener('click', () => openInboxPanel());
    $('#v7MoreClients').addEventListener('click', () => navigateToV7('clientes'));
    $('#v7MoreHistory').addEventListener('click', () => navigateToV7('historial'));
    $('#v7MoreCenter').addEventListener('click', () => navigateToV7('centro-comercial'));
    $('#v7MoreStats').addEventListener('click', () => navigateToV7('estadisticas'));
    $('#v7MoreReceivables').addEventListener('click', () => navigateToV7('por-cobrar'));
    $('#v7MoreQuotes').addEventListener('click', () => navigateToV7('cotizaciones'));
    if ($('#v7MoreRegional')) $('#v7MoreRegional').addEventListener('click', () => navigateToV7('regional'));
    if ($('#v7MoreDistribution')) $('#v7MoreDistribution').addEventListener('click', () => navigateToV7('distribucion'));
    if ($('#v7MoreProduction')) $('#v7MoreProduction').addEventListener('click', () => navigateToV7('produccion'));
    if ($('#v7MoreFinance')) $('#v7MoreFinance').addEventListener('click', () => navigateToV7('egresos'));
    $('#v7MoreCatalog').addEventListener('click', () => openCatalogPdfOptions());
    $('#v7MoreProfile').addEventListener('click', () => navigateToV7('perfil'));
    if ($('#v7MoreUsers')) $('#v7MoreUsers').addEventListener('click', () => navigateToV7('usuarios'));
    if ($('#v7MoreGroups')) $('#v7MoreGroups').addEventListener('click', () => navigateToV7('grupos'));
    if ($('#v7MoreSettings')) $('#v7MoreSettings').addEventListener('click', () => navigateToV7('ajustes'));
    if ($('#v7MoreUpdates')) $('#v7MoreUpdates').addEventListener('click', () => window.openUpdateCenter ? openUpdateCenter() : showToast('El módulo de actualización no está disponible.', 'error'));
    $('#v7LogoutBtn').addEventListener('click', logoutSession);
  }

  function renderHistoryV7() {
    const sales = (AppState.sales || []).filter(s => window.saleVisibleToCurrentBusinessV801 ? saleVisibleToCurrentBusinessV801(s) : (isAdmin() || s.sellerId === AppState.session.userId)).slice().sort((a,b)=>b.date-a.date);
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
