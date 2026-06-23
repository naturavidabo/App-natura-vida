/* app.js — Router principal, navegación inferior, dashboard comercial y reportes base. */

function renderTopHeader() {
  $('#bizName').textContent = AppState.settings.businessName || 'NATURA VIDA';
  $('#bizLogo').innerHTML = AppState.settings.logo ? `<img src="${AppState.settings.logo}" alt="">` : '🌿';
  const subtitle = document.querySelector('header.top .bizsub');
  if (subtitle) {
    subtitle.textContent = requireAuth()
      ? `${AppState.session.fullName || AppState.session.username} · ${AppState.session.roleName}`
      : (AppState.settings.businessModel || 'Administrador → Revendedores → Clientes');
  }
  if (window.installInboxButton) {
    installInboxButton();
    refreshInboxBadge({ silent: true }).catch(() => {});
  }
}


function icon(name) {
  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.8v-5.2h-4.4V21H5a1 1 0 0 1-1-1z" fill="currentColor"/></svg>',
    box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3.5 6.2v11.6L12 22l8.5-4.2V6.2zM12 4.3l5.8 2.8L12 10 6.2 7.1zm-6.5 4 5.5 2.7v8.1l-5.5-2.7zm7.5 10.8V11l5.5-2.7v8.1z" fill="currentColor"/></svg>',
    sale: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 1.5V10h4.5" fill="currentColor"/><path d="M8 15.5h8M8 12.5h4.5" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".65"/></svg>',
    quote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l5 5v12.5A1.5 1.5 0 0 1 18.5 22h-12A1.5 1.5 0 0 1 5 20.5v-16A1.5 1.5 0 0 1 6.5 3z" fill="currentColor"/><path d="M14 3v5h5M8 12h8M8 15.5h8M8 8.5h3.5" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".68"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2.1" fill="currentColor"/><circle cx="12" cy="12" r="2.1" fill="currentColor"/><circle cx="19" cy="12" r="2.1" fill="currentColor"/></svg>',
    clients: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-6.5 8a6.5 6.5 0 0 1 13 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 9 11zm6 1.5A3 3 0 1 0 12 9.5a3 3 0 0 0 3 3zm-9 7a5 5 0 0 1 10 0M13.5 19a4.5 4.5 0 0 1 9 0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    commission: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 9.2 8.6 3 9.5l4.5 4.4-1 6.1 5.5-2.9 5.5 2.9-1-6.1L21 9.5l-6.2-.9z" fill="currentColor"/></svg>',
    reports: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V9m7 11V4m7 16v-7" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M3 20h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".55"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 3.8 3.8A3.8 3.8 0 0 0 12 8.2zm8.1 4.5-1.8-.4a6.6 6.6 0 0 0-.5-1.3l1-1.5a.9.9 0 0 0-.1-1.1l-1.1-1.1a.9.9 0 0 0-1.1-.1l-1.5 1a6.6 6.6 0 0 0-1.3-.5l-.4-1.8A.9.9 0 0 0 12.4 4h-1.6a.9.9 0 0 0-.9.7l-.4 1.8a6.6 6.6 0 0 0-1.3.5l-1.5-1a.9.9 0 0 0-1.1.1L4.5 7.2a.9.9 0 0 0-.1 1.1l1 1.5a6.6 6.6 0 0 0-.5 1.3l-1.8.4A.9.9 0 0 0 2.4 13v1.6a.9.9 0 0 0 .7.9l1.8.4a6.6 6.6 0 0 0 .5 1.3l-1 1.5a.9.9 0 0 0 .1 1.1l1.1 1.1a.9.9 0 0 0 1.1.1l1.5-1a6.6 6.6 0 0 0 1.3.5l.4 1.8a.9.9 0 0 0 .9.7h1.6a.9.9 0 0 0 .9-.7l.4-1.8a6.6 6.6 0 0 0 1.3-.5l1.5 1a.9.9 0 0 0 1.1-.1l1.1-1.1a.9.9 0 0 0 .1-1.1l-1-1.5a6.6 6.6 0 0 0 .5-1.3l1.8-.4a.9.9 0 0 0 .7-.9V13a.9.9 0 0 0-.7-.9z" fill="currentColor"/></svg>',
    tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5V5a2 2 0 0 1 2-2h6.5L21 12.5 12.5 21 3 11.5z" fill="currentColor"/><circle cx="8" cy="8" r="1.6" fill="#fff" opacity=".8"/></svg>',
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 16l4-4-4-4M18 12H9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  return icons[name] || '';
}

function renderLoginScreen() {
  $('#bottomNav').innerHTML = '';
  $('#fabAdd').classList.add('hidden');
  $('#mainArea').innerHTML = `
    <section class="loginShell">
      <div class="loginCard">
        <div class="loginBadge">Ingreso simple</div>
        <h1>Ingresar a Natura Vida</h1>
        <p>Para facilitar el acceso remoto, usa el usuario inicial asignado. Después podrás registrar tu celular como usuario personal.</p>
        <form id="loginForm" class="loginForm">
          <div class="field">
            <label>Usuario</label>
            <input type="text" id="loginUser" autocomplete="username" placeholder="admin / vendedor1 / vendedor2..." required>
          </div>
          <div class="field">
            <label>Contraseña</label>
            <input type="password" id="loginPass" autocomplete="current-password" placeholder="Contraseña" required>
          </div>
          <button class="btn block" type="submit">Ingresar</button>
        </form>
        <div class="loginAccessBox">
          <strong>Datos iniciales de ingreso</strong>
          <div><span>Administrador</span><b>admin / 12345678</b></div>
          <div><span>Vendedores</span><b>vendedor1 al vendedor20 / 23456</b></div>
          <small>Luego del primer ingreso se registran nombre, celular y contraseña personal. El código de activación solo se pide al administrador.</small>
        </div>
      </div>
    </section>
  `;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#loginUser').value.trim();
    const password = $('#loginPass').value;
    const result = await authenticateUser(username, password);
    if (!result.ok) {
      showToast(result.message || 'No se pudo iniciar sesión.', 'error');
      return;
    }
    if (window.syncAfterLogin) {
      const sync = await syncAfterLogin();
      if (sync && sync.ok && sync.count !== undefined) showToast(`Precios actualizados: ${sync.count} producto(s).`);
      if (sync && !sync.ok) showToast('Entraste, pero no se pudo sincronizar: ' + sync.message, 'error');
    }
    await loadAllState();
    renderTopHeader();
    if (AppState.session.mustChangePassword) {
      renderMandatoryPasswordChange();
      return;
    }
    showToast('Sesión iniciada correctamente.');
    renderBottomNav();
    AppState.currentTab = 'inicio';
    render();
  });
}

function renderMandatoryPasswordChange() {
  $('#bottomNav').innerHTML = '';
  $('#fabAdd').classList.add('hidden');
  const roleLabel = AppState.session.roleName === 'Administrador' ? 'Administrador' : 'Vendedor / Representante';
  $('#mainArea').innerHTML = `
    <section class="loginShell">
      <div class="loginCard">
        <div class="loginBadge">Activación inicial</div>
        <h1>Configura tu acceso</h1>
        <p>Completa datos básicos. Desde ahora tu usuario será tu número de celular y tendrás tu propia contraseña.</p>
        <div class="activationRoleBox">
          <span>Tipo de acceso</span>
          <strong>${escapeHtml(roleLabel)}</strong>
        </div>
        <form id="changePassForm" class="loginForm">
          <div class="field"><label>Nombre completo</label><input type="text" id="cp_name" value="${escapeHtml(AppState.session.fullName || '')}" required></div>
          <div class="field"><label>Celular / WhatsApp — será tu usuario</label><input type="tel" id="cp_phone" inputmode="numeric" placeholder="Ej.: 70700000" required></div>
          <div class="field"><label>Ciudad / Departamento</label><input type="text" id="cp_city" placeholder="Ej.: La Paz, Santa Cruz, Beni"></div>
          <div class="field"><label>C.I. / Documento</label><input type="text" id="cp_doc" placeholder="Opcional"></div>
          ${AppState.session.roleName === 'Administrador' ? `<div class="field"><label>Código de activación administrador</label><input type="password" id="cp_activation" inputmode="numeric" placeholder="Solo administrador" required></div>` : `<div class="activationInfoBox">Registro de vendedor: no necesitas código. Solo completa tus datos para identificarte y recibir novedades/pedidos.</div>`}
          <div class="field"><label>Nueva contraseña personal</label><input type="password" id="cp_pass1" minlength="4" required></div>
          <div class="field"><label>Confirmar contraseña</label><input type="password" id="cp_pass2" minlength="4" required></div>
          <button class="btn block" type="submit">Guardar y continuar</button>
        </form>
        <div class="loginHint secureHint">Después de guardar, ya no usarás el usuario inicial. Entrarás con tu celular y tu nueva contraseña.</div>
      </div>
    </section>
  `;
  $('#changePassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = $('#cp_phone').value.trim().replace(/\s+/g, '');
    const p1 = $('#cp_pass1').value;
    const p2 = $('#cp_pass2').value;
    if (!/^\d{6,12}$/.test(phone)) { showToast('Ingresa un número de celular válido.', 'error'); return; }
    if (p1 !== p2) { showToast('Las contraseñas no coinciden.', 'error'); return; }
    const result = await updateLocalPassword(AppState.session.userId, p1, {
      username: phone,
      fullName: $('#cp_name').value.trim(),
      phone,
      city: $('#cp_city').value.trim(),
      documentId: $('#cp_doc').value.trim(),
      activationCode: $('#cp_activation') ? $('#cp_activation').value.trim() : ''
    });
    if (!result.ok) { showToast(result.message, 'error'); return; }
    AppState.settings.contactName = $('#cp_name').value.trim();
    AppState.settings.contactPhone = phone;
    AppState.settings.contactCity = $('#cp_city').value.trim();
    await saveSettings();
    showToast('Acceso actualizado correctamente.');
    renderTopHeader();
    renderBottomNav();
    AppState.currentTab = 'inicio';
    render();
  });
}

function renderBottomNav() {
  const nav = $('#bottomNav');
  nav.innerHTML = `
    <button data-tab="inicio" aria-label="Inicio"><span class="ic">${icon('home')}</span><span class="tx">Inicio</span></button>
    <button data-tab="inventario" aria-label="Inventario"><span class="ic">${icon('box')}</span><span class="tx">Inventario</span></button>
    <button data-tab="vender" aria-label="Vender"><span class="ic">${icon('sale')}</span><span class="tx">Vender</span></button>
    <button data-tab="cotizar" aria-label="Cotizar"><span class="ic">${icon('quote')}</span><span class="tx">Cotizar</span></button>
    <button data-tab="mas" aria-label="Más opciones"><span class="ic">${icon('more')}</span><span class="tx">Más</span></button>
  `;
  $all('button', nav).forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.tab)));
  highlightActiveTab();
}

function highlightActiveTab() {
  $all('#bottomNav button').forEach(b => b.classList.toggle('active', b.dataset.tab === AppState.currentTab));
}

function canAccessTab(tab) {
  if (!requireAuth()) return false;
  const role = AppState.session.roleName;
  if (role === 'Administrador') return true;
  const accessMap = {
    inicio: true,
    vender: hasPermission('sales:create'),
    cotizar: hasPermission('quotes:manage'),
    clientes: hasPermission('clients:manage') || hasPermission('clients:read'),
    grupos: true,
    inventario: hasPermission('products:read'),
    resumen: hasPermission('own_reports:read') || hasPermission('team_reports:read'),
    ajustes: true,
    pedido: true,
    inbox: true,
    usuarios: false,
    comisiones: false,
    'reportes-pro': false,
    mas: true
  };
  return !!accessMap[tab];
}

function navigateTo(tab) {
  if (!canAccessTab(tab)) {
    showToast('No tienes permisos para abrir este módulo.', 'error');
    return;
  }
  AppState.currentTab = tab;
  highlightActiveTab();
  render();
}

function render() {
  if (!requireAuth()) {
    renderLoginScreen();
    return;
  }
  if (AppState.session.mustChangePassword) {
    renderMandatoryPasswordChange();
    return;
  }
  $('#fabAdd').classList.add('hidden');
  $('#fabAdd').onclick = null;
  if (AppState.currentTab !== 'vender') {
    const bar = document.getElementById('cartBar');
    if (bar) bar.classList.add('hidden');
  }
  switch (AppState.currentTab) {
    case 'inicio': renderInicio(); break;
    case 'inventario': renderInventario(); break;
    case 'vender': renderVender(); break;
    case 'cotizar': renderQuotes(); break;
    case 'grupos': renderPriceGroups(); break;
    case 'pedido': renderOrderRequest(); break;
    case 'inbox': openInboxPanel(true); break;
    case 'clientes': renderClients(); break;
    case 'resumen': renderResumen(); break;
    case 'ajustes': renderSettings(); break;
    case 'usuarios': renderUsersFoundation(); break;
    case 'comisiones': renderCommissionsFoundation(); break;
    case 'reportes-pro': renderReportsFoundation(); break;
    case 'mas': renderMas(); break;
    default: renderInicio();
  }
}

function getTodaySales() {
  return AppState.sales.filter(s => (!sellerMode || !sellerMode() || s.sellerId === AppState.session.userId) && fmtDate(s.date) === fmtDate(Date.now()));
}

function getMonthSales() {
  const now = new Date();
  return AppState.sales.filter(s => {
    if (sellerMode && sellerMode() && s.sellerId !== AppState.session.userId) return false;
    const d = new Date(s.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
}

function saleProfit(sale) {
  if ((sale.type === 'reseller' || sale.type === 'reseller_unit' || sale.type === 'reseller_wholesale' || sale.role === 'Revendedor') && Number.isFinite(Number(sale.sellerProfit))) {
    return Number(sale.sellerProfit) || 0;
  }
  return (sale.items || []).reduce((sum, item) => {
    const product = AppState.products.find(p => p.id === item.productId);
    const cost = Number(item.unitCost ?? (product ? grossCost(product) : 0)) || 0;
    const price = Number(item.unitPrice) || 0;
    const qty = Number(item.qty) || 0;
    return sum + ((price - cost) * qty);
  }, 0);
}

function topProducts(limit = 4) {
  const map = new Map();
  AppState.sales.filter(s => !sellerMode || !sellerMode() || s.sellerId === AppState.session.userId).forEach(sale => {
    (sale.items || []).forEach(item => {
      const current = map.get(item.productId) || { name: item.productName, qty: 0, total: 0 };
      current.qty += Number(item.qty) || 0;
      current.total += Number(item.subtotal) || 0;
      map.set(item.productId, current);
    });
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, limit);
}

function renderInicio() {
  const main = $('#mainArea');
  const metrics = productMetrics ? productMetrics() : { count: AppState.products.length, units: 0, costValue: 0, publicValue: 0, lowStock: 0 };
  const todaySales = getTodaySales();
  const monthSales = getMonthSales();
  const todayTotal = todaySales.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const monthTotal = monthSales.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const monthProfit = monthSales.reduce((s, v) => s + saleProfit(v), 0);
  const pendingQuotes = AppState.quotes.filter(q => !q.convertedSaleId).length;
  const lowStock = AppState.products.filter(p => p.status !== 'archived' && p.stock <= AppState.settings.lowStockThreshold);
  const top = topProducts();

  main.innerHTML = `
    <section class="dashHero">
      <div class="eyebrow">Plataforma comercial offline-first</div>
      <h1>Natura Vida Bolivia</h1>
      <p>Sesión activa: <strong>${escapeHtml(AppState.session.fullName || '')}</strong> · ${escapeHtml(AppState.session.roleName || '')}. Plataforma comercial offline preparada para crecimiento y sincronización futura.</p>
      <div class="dashActions">
        <button class="btn" id="qbSell">Registrar venta</button>
        <button class="btn outline" id="qbInv">Inventario</button>
        <button class="btn outline" id="qbSync">${isAdmin && isAdmin() ? 'Publicar catálogo' : 'Recibir novedades'}</button>
      </div>
    </section>

    <div class="kpiGrid dashboardKpis">
      <div class="kpiCard accent"><span class="lbl">Ventas hoy</span><strong>${fmtMoney(todayTotal)}</strong><small>${todaySales.length} transacción(es)</small></div>
      <div class="kpiCard"><span class="lbl">Ventas mes</span><strong>${fmtMoney(monthTotal)}</strong><small>${monthSales.length} venta(s)</small></div>
      <div class="kpiCard"><span class="lbl">Utilidad estimada mes</span><strong>${fmtMoney(monthProfit)}</strong><small>según costo registrado</small></div>
      <div class="kpiCard ${metrics.lowStock ? 'dangerSoft' : ''}"><span class="lbl">Stock bajo</span><strong>${metrics.lowStock}</strong><small>${metrics.units} unidades totales</small></div>
    </div>

    <section class="dashboardPanel">
      <div class="panelHeader"><div><span class="eyebrow">Inventario</span><h2>Valor comercial actual</h2></div><button class="btn sm outline" id="goInventory">Ver todo</button></div>
      <div class="miniStats">
        <div><span>SKU activos</span><strong>${metrics.count}</strong></div>
        <div><span>Costo stock</span><strong>${fmtMoney(metrics.costValue)}</strong></div>
        <div><span>Valor público</span><strong>${fmtMoney(metrics.publicValue)}</strong></div>
      </div>
    </section>

    <section class="dashboardPanel">
      <div class="panelHeader"><div><span class="eyebrow">Ventas</span><h2>Más vendidos</h2></div><button class="btn sm outline" id="goReports">Resumen</button></div>
      ${top.length ? top.map((item, idx) => `
        <div class="rankRow"><span class="rank">${idx + 1}</span><div><strong>${escapeHtml(item.name || 'Producto')}</strong><small>${item.qty} unid. · ${fmtMoney(item.total)}</small></div></div>
      `).join('') : `<div class="empty compact"><span class="ic">📭</span><h3>Sin ventas registradas</h3><p>Cuando vendas, aquí aparecerán los productos con mejor desempeño.</p></div>`}
    </section>

    <section class="dashboardPanel">
      <div class="panelHeader"><div><span class="eyebrow">Operación</span><h2>Accesos rápidos</h2></div></div>
      <div class="quickGrid modernQuick">
        <div class="quickBtn" id="qbQuote"><span class="ic svgic">${icon('quote')}</span><span>Nueva cotización</span></div>
        <div class="quickBtn" id="qbClients"><span class="ic svgic">${icon('clients')}</span><span>Clientes (${AppState.clients.length})</span></div>
        <div class="quickBtn" id="qbUsers"><span class="ic svgic">${icon('users')}</span><span>Usuarios y roles</span></div>
        <div class="quickBtn" id="qbCommissions"><span class="ic svgic">${icon('commission')}</span><span>Comisiones</span></div>
        ${isReseller && isReseller() ? `<div class="quickBtn" id="qbOrder"><span class="ic svgic">${icon('box')}</span><span>Pedido al administrador</span></div>` : ''}
      </div>
      <div class="systemBadges">
        <span>Offline IndexedDB</span><span>PWA</span><span>Preparada nube</span><span>APK futuro</span><span>${pendingQuotes} cotización(es)</span>
      </div>
    </section>

    ${lowStock.length > 0 ? `
    <section class="dashboardPanel alertPanel">
      <div class="panelHeader"><div><span class="eyebrow">Atención</span><h2>Productos con stock bajo</h2></div></div>
      ${lowStock.slice(0, 6).map(p => `
        <div class="stockAlertRow"><div class="thumb">${p.photo ? `<img src="${p.photo}" alt="">` : '🌿'}</div><div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.category || 'General')} · quedan ${p.stock}</small></div></div>
      `).join('')}
    </section>` : ''}
  `;

  $('#qbSell').addEventListener('click', () => navigateTo('vender'));
  $('#qbInv').addEventListener('click', () => navigateTo('inventario'));
  $('#qbSync').addEventListener('click', async () => {
    if (!isOnlineConfigured()) { showToast('Configura el servidor online en Ajustes.', 'error'); navigateTo('ajustes'); return; }
    let res;
    if (isAdmin && isAdmin() && window.pushLocalProductsToCloud) {
      res = await pushLocalProductsToCloud();
      if (res.ok) showToast(`Catálogo publicado: ${res.count} producto(s).`);
      else showToast('No se pudo publicar: ' + res.message, 'error');
    } else if (window.openSafeCloudSyncSheet) {
      await openSafeCloudSyncSheet();
    } else if (window.syncCloudProductsToLocal) {
      res = await syncCloudProductsToLocal();
      if (res.ok) { showToast(`Catálogo actualizado: ${res.count} producto(s).`); render(); }
      else showToast('No se pudo sincronizar: ' + res.message, 'error');
    }
  });
  $('#goInventory').addEventListener('click', () => navigateTo('inventario'));
  $('#goReports').addEventListener('click', () => navigateTo('resumen'));
  $('#qbQuote').addEventListener('click', () => navigateTo('cotizar'));
  $('#qbClients').addEventListener('click', () => navigateTo('clientes'));
  $('#qbUsers').addEventListener('click', () => navigateTo('usuarios'));
  $('#qbCommissions').addEventListener('click', () => navigateTo('comisiones'));
  const qbOrder = $('#qbOrder');
  if (qbOrder) qbOrder.addEventListener('click', () => navigateTo('pedido'));
}

function renderMas() {
  const main = $('#mainArea');
  main.innerHTML = `
    <section class="dashboardPanel sessionPanel">
      <div class="panelHeader"><div><span class="eyebrow">Sesión activa</span><h2>${escapeHtml(AppState.session.fullName || '')}</h2></div></div>
      <div class="miniStats">
        <div><span>Usuario</span><strong>${escapeHtml(AppState.session.username || '')}</strong></div>
        <div><span>Rol</span><strong>${escapeHtml(AppState.session.roleName || '')}</strong></div>
        <div><span>Modo</span><strong>${AppState.session.online ? 'Online' : 'Offline'}</strong></div>
      </div>
    </section>
    <div class="moreList proMore">
      <div class="moreItem" id="moreClients"><span class="ic svgic">${icon('clients')}</span><span>Directorio de clientes</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreGroups"><span class="ic svgic">${icon('tag')}</span><span>Grupos de precio</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreCatalogPdf"><span class="ic svgic">${icon('quote')}</span><span>Catálogo PDF para WhatsApp</span><span class="tagSoon">PDF</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreSmartPackages"><span class="ic svgic">${icon('reports')}</span><span>Intercambio inteligente</span><span class="tagSoon">V4</span><span class="arrow">›</span></div>
      ${isReseller && isReseller() ? `<div class="moreItem" id="moreOrder"><span class="ic svgic">${icon('box')}</span><span>Pedido online al administrador</span><span class="tagSoon">Nuevo</span><span class="arrow">›</span></div>` : ''}
      <div class="moreItem" id="moreUsers"><span class="ic svgic">${icon('users')}</span><span>Usuarios, roles y permisos</span><span class="tagSoon">Activo</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreCommissions"><span class="ic svgic">${icon('commission')}</span><span>Comisiones revendedor</span><span class="tagSoon">Base</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreReports"><span class="ic svgic">${icon('reports')}</span><span>Reportes comerciales</span><span class="tagSoon">Base</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreResumen"><span class="ic svgic">${icon('home')}</span><span>Resumen e historial</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreSettings"><span class="ic svgic">${icon('settings')}</span><span>Ajustes y respaldo</span><span class="arrow">›</span></div>
      <div class="moreItem dangerItem" id="moreLogout"><span class="ic svgic">${icon('logout')}</span><span>Cerrar sesión</span><span class="arrow">›</span></div>
    </div>
  `;
  const moreInbox = $('#moreInbox');
  if (moreInbox) moreInbox.addEventListener('click', () => openInboxPanel(true));
  $('#moreClients').addEventListener('click', () => navigateTo('clientes'));
  $('#moreGroups').addEventListener('click', () => navigateTo('grupos'));
  $('#moreCatalogPdf').addEventListener('click', () => openCatalogPdfOptions());
  $('#moreSmartPackages').addEventListener('click', () => openSmartPackagesPanel());
  const moreOrder = $('#moreOrder');
  if (moreOrder) moreOrder.addEventListener('click', () => navigateTo('pedido'));
  $('#moreUsers').addEventListener('click', () => navigateTo('usuarios'));
  $('#moreCommissions').addEventListener('click', () => navigateTo('comisiones'));
  $('#moreReports').addEventListener('click', () => navigateTo('reportes-pro'));
  $('#moreResumen').addEventListener('click', () => navigateTo('resumen'));
  $('#moreSettings').addEventListener('click', () => navigateTo('ajustes'));
  $('#moreLogout').addEventListener('click', async () => {
    logoutSession();
    renderTopHeader();
    renderLoginScreen();
    showToast('Sesión cerrada correctamente.');
  });
}

let _histFilterType = 'all';
function saleTypeLabel(type) {
  return {
    unit: 'Venta unitaria',
    wholesale: 'Venta revendedor',
    market: 'Mayorista',
    representative_transfer: 'Despacho a representante',
    reseller: 'Venta representante',
    reseller_unit: 'Venta unitaria rep.',
    reseller_wholesale: 'Venta mayorista rep.'
  }[type] || 'Venta';
}
function renderResumen() {
  $('#fabAdd').classList.add('hidden');
  const main = $('#mainArea');
  const metrics = productMetrics();
  const visibleSales = AppState.sales.filter(s => !sellerMode || !sellerMode() || s.sellerId === AppState.session.userId);
  const totalVendidoMonto = visibleSales.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const ganancia = visibleSales.reduce((s, v) => s + saleProfit(v), 0);

  const filteredSales = visibleSales
    .filter(v => _histFilterType === 'all' || v.type === _histFilterType)
    .slice().reverse();

  let html = `
    <section class="dashboardPanel summaryPanel">
      <div class="panelHeader"><div><span class="eyebrow">Resumen general</span><h2>Historial comercial</h2></div></div>
      <div class="kpiGrid">
        <div class="kpiCard"><span class="lbl">Productos</span><strong>${metrics.count}</strong></div>
        <div class="kpiCard"><span class="lbl">Unidades stock</span><strong>${metrics.units}</strong></div>
        <div class="kpiCard"><span class="lbl">Capital invertido</span><strong>${fmtMoney(metrics.costValue)}</strong></div>
        <div class="kpiCard ${metrics.lowStock ? 'dangerSoft' : ''}"><span class="lbl">Stock bajo</span><strong>${metrics.lowStock}</strong></div>
        <div class="kpiCard wide accent"><span class="lbl">Total vendido</span><strong>${fmtMoney(totalVendidoMonto)}</strong><small>${visibleSales.length} venta(s)</small></div>
        <div class="kpiCard wide"><span class="lbl">Ganancia estimada</span><strong>${fmtMoney(ganancia)}</strong><small>usa costo histórico si la venta lo tiene</small></div>
      </div>
    </section>

    <div class="sectiontitle">Historial de ventas</div>
    <div class="saletoggle">
      <button data-f="all" class="${_histFilterType === 'all' ? 'active' : ''}">Todas</button>
      <button data-f="unit" class="${_histFilterType === 'unit' ? 'active' : ''}">Unitaria</button>
      <button data-f="market" class="${_histFilterType === 'market' ? 'active' : ''}">Mayorista</button>
      <button data-f="representative_transfer" class="${_histFilterType === 'representative_transfer' ? 'active' : ''}">Representante</button>
      <button data-f="reseller_unit" class="${_histFilterType === 'reseller_unit' ? 'active' : ''}">Rep. unitaria</button>
      <button data-f="reseller_wholesale" class="${_histFilterType === 'reseller_wholesale' ? 'active' : ''}">Rep. mayorista</button>
    </div>
  `;

  if (filteredSales.length === 0) {
    html += `<div class="empty"><span class="ic">📭</span><h3>Sin ventas</h3></div>`;
  } else {
    html += filteredSales.slice(0, 80).map(v => {
      const items = v.items || [];
      const summary = items.length === 1 ? items[0].productName : `${items[0] ? items[0].productName : ''} +${items.length - 1} más`;
      const totalUnits = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
      const profit = saleProfit(v);
      return `
      <div class="histitem histitem-clickable" data-saleid="${v.id}">
        <div class="l">
          <div class="pname">${escapeHtml(summary)} ${v.groupName ? `<span class="tinytag">${escapeHtml(v.groupName)}</span>` : ''}</div>
          <div class="meta">${escapeHtml(v.clientName || '—')} · ${saleTypeLabel(v.type)} · ${totalUnits} unid. · ${fmtDate(v.date)}</div>
        </div>
        <div class="r">
          <div>+${fmtMoney(v.total)}</div>
          <div class="histReceiptHint">Utilidad ${fmtMoney(profit)} · Ver recibo</div>
        </div>
      </div>`;
    }).join('');
  }

  main.innerHTML = html;
  $all('.saletoggle button').forEach(b => b.addEventListener('click', () => { _histFilterType = b.dataset.f; renderResumen(); }));
  $all('.histitem-clickable').forEach(el => el.addEventListener('click', () => {
    const sale = AppState.sales.find(s => s.id === el.dataset.saleid);
    if (sale) openReceiptPreview(sale);
  }));
}

async function renderUsersFoundation() {
  $('#fabAdd').classList.add('hidden');
  const roles = await DB.getAll('roles');
  const users = await DB.getAll('users');
  let cloudProfiles = [];
  if (isAdmin() && window.fetchCloudProfiles) {
    const res = await fetchCloudProfiles().catch(err => ({ ok: false, message: err.message }));
    if (res && res.ok) cloudProfiles = res.profiles || [];
  }
  $('#mainArea').innerHTML = `
    <section class="dashboardPanel">
      <div class="panelHeader"><div><span class="eyebrow">Control de acceso</span><h2>Usuarios activos</h2></div><button class="btn sm outline" id="refreshUsersBtn">Actualizar</button></div>
      <div class="banner">Aquí puedes revisar usuarios locales y, cuando el servidor esté configurado, perfiles online. Si alguien no corresponde, márcalo como inactivo/bloqueado desde Supabase o desde este panel si está disponible.</div>
      <div class="miniStats">
        <div><span>Roles base</span><strong>${roles.length}</strong></div>
        <div><span>Usuarios locales</span><strong>${users.length}</strong></div>
        <div><span>Online</span><strong>${cloudProfiles.length}</strong></div>
      </div>
    </section>

    <div class="sectiontitle">Usuarios locales iniciales</div>
    ${users.map(u => `<div class="histitem userRow">
      <div class="l"><div class="pname">${escapeHtml(u.fullName || u.username)}</div><div class="meta">${escapeHtml(u.username)} · ${escapeHtml(u.role || '')} · ${escapeHtml(u.status || 'active')}${u.phone ? ' · ' + escapeHtml(u.phone) : ''}</div></div>
      <div class="r">${u.mustChangePassword ? '<span class="tinytag">Inicial</span>' : '<span class="tinytag">Personal</span>'}</div>
    </div>`).join('')}

    ${isAdmin() ? `
      <div class="sectiontitle">Perfiles online Supabase</div>
      ${cloudProfiles.length ? cloudProfiles.map(p => `<div class="histitem userRow">
        <div class="l"><div class="pname">${escapeHtml(p.full_name || p.username || p.id)}</div><div class="meta">${escapeHtml(p.username || '')} · ${escapeHtml(p.role || '')} · ${escapeHtml(p.status || '')}</div></div>
        <div class="r">${p.status === 'active' ? `<button class="btn sm outline blockUserBtn" data-id="${p.id}">Bloquear</button>` : `<button class="btn sm outline activeUserBtn" data-id="${p.id}">Activar</button>`}</div>
      </div>`).join('') : `<div class="empty compact"><span class="ic">☁️</span><h3>Sin perfiles online cargados</h3><p>Configura Supabase y crea perfiles en la tabla profiles.</p></div>`}
    ` : ''}
  `;
  $('#refreshUsersBtn').addEventListener('click', () => renderUsersFoundation());
  $all('.blockUserBtn').forEach(b => b.addEventListener('click', async () => {
    if (!window.updateCloudProfileStatus) return showToast('Función online no disponible.', 'error');
    const res = await updateCloudProfileStatus(b.dataset.id, 'inactive');
    if (res.ok) { showToast('Usuario bloqueado.'); renderUsersFoundation(); }
    else showToast(res.message || 'No se pudo bloquear.', 'error');
  }));
  $all('.activeUserBtn').forEach(b => b.addEventListener('click', async () => {
    if (!window.updateCloudProfileStatus) return showToast('Función online no disponible.', 'error');
    const res = await updateCloudProfileStatus(b.dataset.id, 'active');
    if (res.ok) { showToast('Usuario activado.'); renderUsersFoundation(); }
    else showToast(res.message || 'No se pudo activar.', 'error');
  }));
}

async function renderCommissionsFoundation() {
  $('#fabAdd').classList.add('hidden');
  const rules = await DB.getAll('commissionRules');
  $('#mainArea').innerHTML = `
    <section class="dashboardPanel">
      <div class="panelHeader"><div><span class="eyebrow">Fase 4 preparada</span><h2>Comisiones automáticas</h2></div></div>
      <div class="banner">La estructura de reglas y comisiones ya existe. Las ventas ya guardan costo unitario para calcular utilidad histórica, requisito clave para comisiones reales.</div>
      ${rules.map(r => `<div class="rankRow"><span class="rank">💎</span><div><strong>${escapeHtml(r.name)}</strong><small>${r.percent}% · ${escapeHtml(r.type)} · ${r.active ? 'activa' : 'inactiva'}</small></div></div>`).join('')}
    </section>
  `;
}

async function renderReportsFoundation() {
  $('#fabAdd').classList.add('hidden');
  const queue = await DB.getAll('syncQueue');
  $('#mainArea').innerHTML = `
    <section class="dashboardPanel">
      <div class="panelHeader"><div><span class="eyebrow">Fase 5 preparada</span><h2>Reportes profesionales</h2></div></div>
      <div class="miniStats">
        <div><span>Ventas</span><strong>${AppState.sales.length}</strong></div>
        <div><span>Clientes</span><strong>${AppState.clients.length}</strong></div>
        <div><span>Cola sync</span><strong>${queue.length}</strong></div>
      </div>
      <div class="banner">La app ya registra datos suficientes para reportes por producto, cliente, fecha, utilidad, stock bajo y futura sincronización.</div>
    </section>
  `;
}

async function initApp() {
  await openDB();
  if (window.ensureBootstrapData) await ensureBootstrapData();
  await loadAllState();
  await restoreSession();
  renderTopHeader();
  if (requireAuth()) {
    if (window.syncAfterLogin) await syncAfterLogin().catch(() => {});
    await loadAllState();
    renderTopHeader();
    renderBottomNav();
    if (window.refreshInboxBadge) refreshInboxBadge({ silent: true }).catch(() => {});
    render();
    offerRestoreIfEmpty();
  } else {
    renderLoginScreen();
  }

  $('#brandClickArea').addEventListener('click', () => {
    if (requireAuth()) navigateTo('ajustes');
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

window.navigateTo = navigateTo;
window.render = render;
window.renderTopHeader = renderTopHeader;
window.renderBottomNav = renderBottomNav;
document.addEventListener('DOMContentLoaded', initApp);
