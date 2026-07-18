/* NATURA VIDA V7.7.1 — Centro de gestión organizado, buscador, favoritos y recientes. */
(() => {
  let activeCategory = '';
  let searchTerm = '';

  const esc = value => escapeHtml(String(value == null ? '' : value));
  const admin = () => window.isAdmin && isAdmin();
  const userKey = () => String(AppState.session.onlineUserId || AppState.session.userId || 'guest');
  const storeKey = name => `nv771_${name}_${userKey()}`;

  function readArray(name) {
    try { const data = JSON.parse(localStorage.getItem(storeKey(name)) || '[]'); return Array.isArray(data) ? data : []; }
    catch (_) { return []; }
  }
  function writeArray(name, values) { localStorage.setItem(storeKey(name), JSON.stringify(values.slice(0, 12))); }

  function actionRegistryV770() {
    const isAdminUser = admin();
    const canTeam = window.canOpenRolesV800 && canOpenRolesV800();
    const actions = [
      { id: 'catalogo', category: 'comercial', icon: '🌿', title: 'Catálogo comercial', subtitle: 'Productos, presentaciones y precios para ofrecer al cliente', handler: () => window.openCatalogPdfOptions ? openCatalogPdfOptions() : navigateTo('vender'), permission: 'catalog:use' },
      { id: 'vender', category: 'comercial', icon: '🛍️', title: 'Nueva venta', subtitle: 'Venta unitaria o mayorista', tab: 'vender', permission: 'sales:create' },
      { id: 'clientes', category: 'comercial', icon: '👥', title: 'Clientes', subtitle: 'Directorio, ubicación e historial', tab: 'clientes', permission: 'clients:manage' },
      { id: 'historial', category: 'comercial', icon: '🧾', title: 'Ventas y recibos', subtitle: 'Historial permanente de operaciones', tab: 'historial', permission: 'own_reports:read' },
      { id: 'centro-comercial', category: 'comercial', icon: '📈', title: 'Centro comercial', subtitle: 'Oportunidades y acciones recomendadas', tab: 'centro-comercial', permission: 'own_reports:read' },
      { id: 'estadisticas', category: 'comercial', icon: '📊', title: 'Estadísticas comerciales', subtitle: 'Productos, clientes y tendencias', tab: 'estadisticas', permission: 'own_reports:read' },
      { id: 'por-cobrar', category: 'comercial', icon: '💰', title: 'Ventas por cobrar', subtitle: 'Saldos y pagos parciales', tab: 'por-cobrar', permission: 'receivables:manage' },
      { id: 'cotizaciones', category: 'comercial', icon: '🏷️', title: 'Precios y cotizaciones', subtitle: 'Ofertas personalizadas', tab: 'cotizaciones', permission: 'quotes:manage' },
      { id: 'grupos', category: 'comercial', icon: '🎯', title: isAdminUser ? 'Grupos de precios centrales' : 'Mis grupos de precio', subtitle: isAdminUser ? 'Reglas para ventas y abastecimiento' : 'Reglas propias para tus clientes', tab: 'grupos', permission: 'sales:create' },
      { id: 'usuarios', category: 'comercial', icon: '🤝', title: 'Representantes', subtitle: 'Aprobación, condiciones y seguimiento', tab: 'usuarios', adminOnly: true },

      { id: 'inventario', category: 'operaciones', icon: '📦', title: isAdminUser ? 'Inventario central' : (AppState.session?.commercialRole==='field_seller'?'Stock asignado':'Mi inventario'), subtitle: AppState.session?.commercialRole==='field_seller'?'Consulta en solo lectura del stock que puedes vender':'Stock, movimientos y productos', tab: 'inventario', anyPermissions: ['inventory:own','inventory:operate','inventory:delegated_read'] },
      { id: 'puntos-stock', category: 'operaciones', icon: '📍', title: AppState.session?.commercialRole==='field_seller'?'Mi stock de trabajo':'Puntos de venta y custodia', subtitle: AppState.session?.commercialRole==='field_seller'?'Stock asignado y solicitudes de reposición':'Producto delegado a vendedores sin generar compra ni deuda', tab: 'puntos-stock', customVisible: () => AppState.session?.commercialRole==='field_seller' || isAdminUser || (window.canHoldStockV800&&canHoldStockV800()) || (window.canManageTeamV800&&canManageTeamV800()) },
      { id: 'regional', category: 'operaciones', icon: '🧭', title: isAdminUser ? 'Gestión regional' : 'Mi región comercial', subtitle: isAdminUser ? 'Stock, regiones y reposiciones' : 'Mi stock, equipo y solicitudes', tab: 'regional', permission: 'regional:manage' },
      { id: 'distribucion', category: 'operaciones', icon: '🚚', title: 'Distribución y rutas', subtitle: 'Rutas, entregas, GPS y evidencia', tab: 'distribucion', anyPermissions: ['routes:own','routes:manage','deliveries:manage'] },
      { id: 'produccion', category: 'operaciones', icon: '🌿', title: 'Producción e insumos', subtitle: 'Materia prima, lotes y costo real', tab: 'produccion', anyPermissions: ['production:operate'], adminAlso: true },
      { id: 'pedidos', category: 'operaciones', icon: '🛒', title: isAdminUser ? 'Pedidos de representantes' : 'Mis pedidos de reposición', subtitle: 'Solicitudes, recepción y seguimiento', tab: isAdminUser ? 'pedidos' : 'compra', anyPermissions: ['orders:create','orders:team_read'], adminAlso: true },

      { id: 'territorio', category: 'territorio', icon: '🗺️', title: 'Gestión territorial', subtitle: 'Prospectos, visitas, clientes, mapa y cobertura comercial', tab: 'territorio', anyPermissions: ['territory:manage','territory:team_read'], adminAlso: true },

      { id: 'personal', category: 'personal', icon: '🧑‍🌾', title: (window.canManageTeamV800&&canManageTeamV800()) ? 'Personal y funciones' : 'Mi trabajo', subtitle: (window.canManageTeamV800&&canManageTeamV800()) ? 'Equipo, tareas, asistencia y mano de obra' : 'Tareas, asistencia y actividad asignada', tab: 'personal', anyPermissions: ['workforce:manage','tasks:own','attendance:own'], adminAlso: true },
      { id: 'roles-estructura', category: 'personal', icon: '🪪', title: 'Roles y estructura funcional', subtitle: 'Función, región, responsable, proveedor y herramientas', tab: 'roles-estructura', customVisible: () => canTeam },

      { id: 'finanzas', category: 'finanzas', icon: '📒', title: 'Finanzas y egresos', subtitle: 'Gastos, ingresos y balance básico', tab: 'egresos', anyPermissions: ['finance:operate'], adminAlso: true },
      { id: 'cobros-finanzas', category: 'finanzas', icon: '💳', title: 'Cobranzas', subtitle: 'Saldos pendientes y pagos', tab: 'por-cobrar', permission: 'receivables:manage' },

      { id: 'perfil', category: 'administracion', icon: '👤', title: 'Mi perfil, función y QR', subtitle: 'Identidad, rol, datos comerciales y cobros', tab: 'perfil', always: true },
      { id: 'ajustes', category: 'administracion', icon: '⚙️', title: 'Configuración del negocio', subtitle: 'Marca, contacto y parámetros', tab: 'ajustes', adminOnly: true },
      { id: 'actualizaciones', category: 'administracion', icon: '🔄', title: 'Actualizaciones', subtitle: 'Versión, revisión y recarga segura', handler: () => window.openUpdateCenter ? openUpdateCenter() : showToast('El módulo de actualización no está disponible.', 'error'), always: true },
      { id: 'bandeja', category: 'administracion', icon: '🔔', title: 'Bandeja y actividad', subtitle: 'Avisos, aprobaciones y comprobantes', handler: () => openInboxPanel(), always: true }
    ];
    return actions.filter(action => {
      if (action.always) return true;
      if (action.adminOnly) return isAdminUser;
      if (action.adminAlso && isAdminUser) return true;
      if (action.customVisible) return !!action.customVisible();
      if (action.permission) return window.hasPermission && hasPermission(action.permission);
      if (action.anyPermissions) return action.anyPermissions.some(permission => window.hasPermission && hasPermission(permission));
      return false;
    });
  }

  function categoryRegistryV770() {
    const team = window.canManageTeamV800 && canManageTeamV800();
    return [
      { id: 'comercial', icon: '💼', title: admin() ? 'Comercial' : 'Mi actividad comercial', subtitle: 'Catálogo, clientes, ventas, precios y cobranzas', tone: 'green' },
      { id: 'operaciones', icon: '📦', title: admin() ? 'Operaciones' : 'Mi operación', subtitle: 'Inventario, custodia, producción, pedidos, regiones y rutas', tone: 'blue' },
      { id: 'territorio', icon: '🗺️', title: 'Territorio', subtitle: 'Prospectos, visitas, mapas y cobertura comercial', tone: 'lime' },
      { id: 'personal', icon: '👥', title: team ? 'Personal y funciones' : 'Mi trabajo', subtitle: team ? 'Equipo, roles, tareas, asistencia y mano de obra' : 'Tareas, asistencia y perfil operativo', tone: 'violet' },
      { id: 'finanzas', icon: '📒', title: admin() ? 'Finanzas' : 'Cobranzas y finanzas', subtitle: 'Cobros, egresos y control económico autorizado', tone: 'gold' },
      { id: 'administracion', icon: '⚙️', title: admin() ? 'Administración' : 'Configuración', subtitle: 'Perfil, función, bandeja y actualización', tone: 'slate' }
    ];
  }

  function favoriteIds() { return readArray('favorites'); }
  function recentIds() { return readArray('recents'); }

  function toggleFavorite(id) {
    const list = favoriteIds();
    const next = list.includes(id) ? list.filter(item => item !== id) : [id, ...list];
    writeArray('favorites', next);
    renderManagementCenterV770();
  }

  function trackRecent(id) {
    writeArray('recents', [id, ...recentIds().filter(item => item !== id)]);
  }

  function executeAction(action) {
    if (!action) return;
    trackRecent(action.id);
    if (typeof action.handler === 'function') action.handler();
    else if (action.tab && window.navigateTo) navigateTo(action.tab);
  }

  function actionButton(action, compact = false) {
    const favorite = favoriteIds().includes(action.id);
    return `<article class="v770ModuleAction ${compact ? 'compact' : ''}" data-action-id="${esc(action.id)}"><button class="v770ActionMain" data-open-action="${esc(action.id)}"><span class="v770ActionIcon">${action.icon}</span><span><strong>${esc(action.title)}</strong><small>${esc(action.subtitle)}</small></span><b>›</b></button><button class="v770Favorite ${favorite ? 'active' : ''}" data-favorite-action="${esc(action.id)}" aria-label="${favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}">${favorite ? '★' : '☆'}</button></article>`;
  }

  function renderFavorites(actions) {
    const map = new Map(actions.map(action => [action.id, action]));
    const favorites = favoriteIds().map(id => map.get(id)).filter(Boolean).slice(0, 6);
    if (!favorites.length) return `<div class="v770Hint"><span>☆</span><p>Marca con una estrella las funciones que uses con mayor frecuencia.</p></div>`;
    return `<div class="v770QuickGrid">${favorites.map(action => `<button data-open-action="${esc(action.id)}"><span>${action.icon}</span><strong>${esc(action.title)}</strong></button>`).join('')}</div>`;
  }

  function renderRecents(actions) {
    const map = new Map(actions.map(action => [action.id, action]));
    const recents = recentIds().map(id => map.get(id)).filter(Boolean).slice(0, 4);
    if (!recents.length) return '';
    return `<section class="v770Recent"><div class="v770SectionTitle"><span>Utilizado recientemente</span></div>${recents.map(action => `<button data-open-action="${esc(action.id)}"><span>${action.icon}</span><span><strong>${esc(action.title)}</strong><small>${esc(action.subtitle)}</small></span><b>›</b></button>`).join('')}</section>`;
  }

  function filteredActions(actions) {
    const term = searchTerm.trim().toLocaleLowerCase('es');
    if (!term) return [];
    return actions.filter(action => `${action.title} ${action.subtitle}`.toLocaleLowerCase('es').includes(term));
  }

  function renderCategoryView(category, actions) {
    const cat = categoryRegistryV770().find(item => item.id === category);
    const items = actions.filter(action => action.category === category);
    return `<section class="v770CenterHead category ${esc(cat?.tone || 'green')}"><div class="v770CenterGlow"></div><button class="v770Back" id="backManagementV770">← Centro de gestión</button><span class="v7Eyebrow">Área de trabajo</span><h1>${esc(cat?.title || 'Gestión')}</h1><p>${esc(cat?.subtitle || '')}</p></section><section class="v770ActionList">${items.map(action => actionButton(action)).join('') || '<div class="v7Empty"><span>🌿</span><h3>Sin funciones habilitadas</h3><p>Tu rol no tiene herramientas disponibles en esta área.</p></div>'}</section>`;
  }

  function renderMainView(actions) {
    const results = filteredActions(actions);
    const categories = categoryRegistryV770().filter(category => actions.some(action => action.category === category.id));
    return `<section class="v770CenterHead"><div class="v770CenterGlow"></div><div class="v770CenterGlow second"></div><span class="v7Eyebrow">Organización modular V8.0.1 XD</span><h1>Centro de gestión</h1><p>Encuentra cada herramienta por área, sin listas interminables ni funciones mezcladas con Configuración.</p><label class="v770ModuleSearch"><span>⌕</span><input id="managementSearchV770" value="${esc(searchTerm)}" placeholder="Buscar clientes, rutas, personal, egresos…"></label></section>
      ${searchTerm ? `<section class="v770SearchResults"><div class="v770SectionTitle"><span>Resultados</span><b>${results.length}</b></div>${results.map(action => actionButton(action, true)).join('') || '<div class="v770Hint"><span>⌕</span><p>No se encontró una función con ese nombre.</p></div>'}</section>` : `
      <section class="v770FavoriteSection"><div class="v770SectionTitle"><span>Favoritos</span><small>Accesos personalizados</small></div>${renderFavorites(actions)}</section>
      <section class="v770CategoryGrid">${categories.map(category => {
        const count = actions.filter(action => action.category === category.id).length;
        return `<button class="v770CategoryCard ${esc(category.tone)}" data-category="${esc(category.id)}"><span class="v770CategoryGlow"></span><i>${category.icon}</i><span><strong>${esc(category.title)}</strong><small>${esc(category.subtitle)}</small></span><em>${count}</em><b>›</b></button>`;
      }).join('')}</section>${renderRecents(actions)}`}
      <section class="v770SettingsSeparation"><span>⚙️</span><div><strong>Configuración está separada de la operación</strong><p>Los ajustes del negocio están dentro de Administración; ventas, catálogo, stock y rutas permanecen como herramientas de trabajo.</p></div></section>
      <button class="v7Logout" id="v770LogoutBtn">Cerrar sesión</button><div class="v7Version">Natura Vida V${esc(window.NATURA_APP_VERSION || '8.0.1')} · Núcleo modular XD · Supabase Realtime</div>`;
  }

  function bindCenterEvents(actions) {
    $('#managementSearchV770')?.addEventListener('input', event => { searchTerm = event.target.value; renderManagementCenterV770({ focusSearch: true }); });
    $all('[data-category]').forEach(button => button.addEventListener('click', () => { activeCategory = button.dataset.category; searchTerm = ''; renderManagementCenterV770(); }));
    $('#backManagementV770')?.addEventListener('click', () => { activeCategory = ''; renderManagementCenterV770(); });
    $all('[data-open-action]').forEach(button => button.addEventListener('click', () => executeAction(actions.find(action => action.id === button.dataset.openAction))));
    $all('[data-favorite-action]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); toggleFavorite(button.dataset.favoriteAction); }));
    $('#v770LogoutBtn')?.addEventListener('click', logoutSession);
  }

  function renderManagementCenterV770(options = {}) {
    $('#fabAdd').classList.add('hidden');
    const main = $('#mainArea');
    const actions = actionRegistryV770();
    main.innerHTML = activeCategory ? renderCategoryView(activeCategory, actions) : renderMainView(actions);
    bindCenterEvents(actions);
    if (options.focusSearch) {
      const input = $('#managementSearchV770');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
  }

  Object.assign(window, { renderManagementCenterV770, openManagementActionV770: executeAction, managementActionsV770: actionRegistryV770 });
})();
