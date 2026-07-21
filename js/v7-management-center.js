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
      { id: 'reglas-comerciales', category: 'comercial', icon: '📐', title: 'Reglas, márgenes y descuentos', subtitle: 'Costo real, precio mínimo, promociones y simulador de utilidad', tab: 'reglas-comerciales', adminOnly: true },
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
      { id: 'asistente-ia', category: 'administracion', icon: '<span class="nvAiMenuFace" aria-hidden="true"></span>', title: 'Asistente IA', subtitle: 'Análisis comercial, clientes, inventario y márgenes', tab: 'asistente-ia', adminOnly: true },
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
      { id: 'administracion', icon: '⚙️', title: admin() ? 'Administración' : 'Configuración', subtitle: 'Perfil, asistente, bandeja y actualización', tone: 'slate' }
    ];
  }

  function categoryArtV802(id) {
    const common = 'viewBox="0 0 180 150" aria-hidden="true" focusable="false"';
    const art = {
      comercial: `<svg ${common}><defs><linearGradient id="cg" x1="0" x2="1"><stop stop-color="#0b7149"/><stop offset="1" stop-color="#66cf8c"/></linearGradient></defs><circle cx="52" cy="57" r="39" fill="rgba(255,255,255,.20)"/><path d="M39 53h78l-7 64H46z" fill="url(#cg)" stroke="rgba(255,255,255,.75)" stroke-width="4"/><path d="M62 55c0-20 10-31 24-31s24 11 24 31" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><circle cx="68" cy="85" r="8" fill="#ddf77b"/><circle cx="94" cy="85" r="8" fill="#ddf77b"/><path d="M60 108c18 10 37 10 55-1" fill="none" stroke="rgba(255,255,255,.86)" stroke-width="5" stroke-linecap="round"/></svg>`,
      operaciones: `<svg ${common}><defs><linearGradient id="og" x1="0" x2="1"><stop stop-color="#286e9b"/><stop offset="1" stop-color="#75bdd8"/></linearGradient></defs><path d="M28 52 86 23l61 30-61 31z" fill="url(#og)" stroke="rgba(255,255,255,.8)" stroke-width="4"/><path d="M28 52v55l58 30V84zM147 53v54l-61 30V84z" fill="rgba(255,255,255,.24)" stroke="rgba(255,255,255,.72)" stroke-width="4"/><path d="m61 36 60 31M86 84v53" stroke="#fff" stroke-width="5" opacity=".8"/><path d="M108 101h26M108 114h19" stroke="#dff57e" stroke-width="6" stroke-linecap="round"/></svg>`,
      territorio: `<svg ${common}><defs><linearGradient id="tg" x1="0" x2="1"><stop stop-color="#0b7d50"/><stop offset="1" stop-color="#b9df45"/></linearGradient></defs><path d="m20 37 42-14 55 16 43-14v93l-43 14-55-16-42 14z" fill="rgba(255,255,255,.22)" stroke="rgba(255,255,255,.8)" stroke-width="4"/><path d="M62 23v93M117 39v93" stroke="#fff" stroke-width="4" opacity=".65"/><path d="M37 98c27-45 49 20 76-23 12-20 24-18 35-9" fill="none" stroke="url(#tg)" stroke-width="8" stroke-linecap="round"/><path d="M91 33c-15 0-27 12-27 27 0 22 27 49 27 49s27-27 27-49c0-15-12-27-27-27Z" fill="#fff"/><circle cx="91" cy="60" r="10" fill="#15955c"/></svg>`,
      personal: `<svg ${common}><defs><linearGradient id="pg" x1="0" x2="1"><stop stop-color="#67518d"/><stop offset="1" stop-color="#b28bd1"/></linearGradient></defs><circle cx="65" cy="48" r="25" fill="#fff"/><circle cx="120" cy="56" r="20" fill="rgba(255,255,255,.82)"/><path d="M22 125c3-38 22-57 46-57s43 19 46 57" fill="url(#pg)" stroke="rgba(255,255,255,.75)" stroke-width="4"/><path d="M91 126c3-31 18-47 37-47 17 0 29 12 34 36" fill="rgba(255,255,255,.3)" stroke="rgba(255,255,255,.68)" stroke-width="4"/><path d="M51 95h31M51 108h42" stroke="#efff9c" stroke-width="6" stroke-linecap="round"/></svg>`,
      finanzas: `<svg ${common}><defs><linearGradient id="fg" x1="0" x2="1"><stop stop-color="#a56d10"/><stop offset="1" stop-color="#edbd55"/></linearGradient></defs><rect x="25" y="35" width="129" height="88" rx="23" fill="url(#fg)" stroke="rgba(255,255,255,.78)" stroke-width="4"/><path d="M25 58h129" stroke="#fff" stroke-width="6" opacity=".72"/><rect x="91" y="72" width="63" height="37" rx="14" fill="rgba(255,255,255,.32)"/><circle cx="115" cy="91" r="9" fill="#fff"/><circle cx="55" cy="99" r="20" fill="#f5e58b"/><path d="M55 87v24M47 94c0-5 4-8 9-8 6 0 10 3 10 7 0 11-20 4-20 14 0 5 4 8 10 8 5 0 9-2 11-6" fill="none" stroke="#8b5c0b" stroke-width="4" stroke-linecap="round"/></svg>`,
      administracion: `<svg ${common}><defs><linearGradient id="ag" x1="0" x2="1"><stop stop-color="#496b67"/><stop offset="1" stop-color="#8fb6ae"/></linearGradient></defs><rect x="29" y="24" width="122" height="106" rx="24" fill="rgba(255,255,255,.25)" stroke="rgba(255,255,255,.78)" stroke-width="4"/><path d="M53 51h73M53 72h46M53 105h72" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".78"/><circle cx="123" cy="72" r="22" fill="url(#ag)"/><circle cx="123" cy="72" r="8" fill="#fff"/><path d="M123 42v9M123 93v9M93 72h9M144 72h9M102 51l7 7M137 86l7 7M144 51l-7 7M109 86l-7 7" stroke="#e9ff9d" stroke-width="5" stroke-linecap="round"/></svg>`
    };
    return art[id] || art.administracion;
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
    return `<section class="v770CenterHead"><div class="v770CenterGlow"></div><div class="v770CenterGlow second"></div><span class="v7Eyebrow">Centro de gestión V8.1.1</span><h1>Todo organizado por área</h1><p>Accede más rápido a las herramientas comerciales, operativas y administrativas de tu función.</p><label class="v770ModuleSearch"><span>⌕</span><input id="managementSearchV770" value="${esc(searchTerm)}" placeholder="Buscar clientes, rutas, personal, egresos…"></label></section>
      ${searchTerm ? `<section class="v770SearchResults"><div class="v770SectionTitle"><span>Resultados</span><b>${results.length}</b></div>${results.map(action => actionButton(action, true)).join('') || '<div class="v770Hint"><span>⌕</span><p>No se encontró una función con ese nombre.</p></div>'}</section>` : `
      <section class="v770FavoriteSection"><div class="v770SectionTitle"><span>Favoritos</span><small>Accesos personalizados</small></div>${renderFavorites(actions)}</section>
      <section class="v770CategoryGrid">${categories.map(category => {
        const count = actions.filter(action => action.category === category.id).length;
        return `<button class="v770CategoryCard v802CategoryCard ${esc(category.tone)}" data-category="${esc(category.id)}" aria-label="Abrir ${esc(category.title)}"><span class="v770CategoryGlow"></span><span class="v802CategoryArt">${categoryArtV802(category.id)}</span><span class="v802CategoryCopy"><strong>${esc(category.title)}</strong><small>${esc(category.subtitle)}</small><u>Ver funciones <b>›</b></u></span><em>${count}</em></button>`;
      }).join('')}</section>${renderRecents(actions)}`}
      <section class="v770SettingsSeparation"><span>⚙️</span><div><strong>Configuración está separada de la operación</strong><p>Los ajustes del negocio están dentro de Administración; ventas, catálogo, stock y rutas permanecen como herramientas de trabajo.</p></div></section>
      <button class="v7Logout" id="v770LogoutBtn">Cerrar sesión</button><div class="v7Version">Natura Vida V${esc(window.NATURA_APP_VERSION || '8.1.1')} · Centro modular · Supabase Realtime</div>`;
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
