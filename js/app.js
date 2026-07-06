/* app.js — Router principal, navegación inferior, dashboard comercial y reportes base. */

function updateCloudStatusBadge(status) {
  const badge = document.getElementById('cloudStatusBadge');
  if (!badge) return;
  const state = (status && status.state) || (!navigator.onLine ? 'offline' : 'connecting');
  const labels = {
    online: 'En línea',
    connecting: 'Conectando',
    offline: 'Sin internet',
    error: 'Reconectando'
  };
  badge.className = 'cloudBadge ' + state;
  const text = badge.querySelector('b');
  if (text) text.textContent = labels[state] || 'Conectando';
  badge.title = (status && status.detail) || labels[state] || '';
}

function renderTopHeader() {
  $('#bizName').textContent = AppState.settings.businessName || 'NATURA VIDA';
  $('#bizLogo').innerHTML = AppState.settings.logo ? `<img src="${AppState.settings.logo}" alt="">` : '🌿';
  const subtitle = document.querySelector('header.top .bizsub');
  if (subtitle) {
    subtitle.textContent = requireAuth()
      ? `${AppState.session.fullName || AppState.session.username} · ${AppState.session.roleName}`
      : (AppState.settings.businessModel || 'Administrador → Representantes → Clientes');
  }
  if (window.installInboxButton) {
    installInboxButton();
    refreshInboxBadge({ silent: true }).catch(() => {});
  }
  updateCloudStatusBadge(window.CloudConnection || { state: navigator.onLine ? 'connecting' : 'offline' });
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
  // V6.7: pantalla unica con tres modos. Flujo legacy (usuario/telefono) ELIMINADO.
  function showMode(mode) {
    $('#mainArea').innerHTML = `
      <section class="loginShell">
        <div class="loginCard">
          <div class="loginBrand">
            <h1>Natura Vida</h1>
          </div>
          ${mode === 'login' ? `
            <h2>Iniciar sesión</h2>
            <form id="loginForm" class="loginForm" autocomplete="on">
              <div class="field"><label>Correo Gmail</label>
                <input type="email" id="lEmail" autocomplete="email" inputmode="email" placeholder="tucorreo@gmail.com" required></div>
              <div class="field"><label>Contraseña</label>
                <input type="password" id="lPass" autocomplete="current-password" placeholder="Contraseña" required></div>
              <button class="btn block" type="submit">Entrar</button>
            </form>
            <div class="loginLinks">
              <button class="secondaryActionBtn" id="goRegister">Crear cuenta nueva</button>
              <button class="secondaryActionBtn subtle" id="goRecover">Olvidé mi contraseña</button>
            </div>
          ` : mode === 'register' ? `
            <h2>Crear cuenta</h2>
            <form id="regForm" class="loginForm" autocomplete="on">
              <div class="field"><label>Nombre completo</label>
                <input type="text" id="rName" autocomplete="name" placeholder="Tu nombre completo" required></div>
              <div class="field"><label>Correo Gmail</label>
                <input type="email" id="rEmail" autocomplete="email" inputmode="email" placeholder="tucorreo@gmail.com" required></div>
              <div class="field"><label>Celular</label>
                <input type="tel" id="rPhone" autocomplete="tel" inputmode="numeric" placeholder="Ej.: 70700000" required></div>
              <div class="field"><label>Ciudad</label>
                <input type="text" id="rCity" placeholder="Ej.: La Paz, Santa Cruz" required></div>
              <div class="field"><label>Contraseña</label>
                <input type="password" id="rPass" autocomplete="new-password" placeholder="Mínimo 6 caracteres" required minlength="6"></div>
              <p class="loginHint">El administrador se reconoce por el correo principal configurado en Supabase. Los demás usuarios quedan pendientes de aprobación.</p>
              <button class="btn block" type="submit">Crear cuenta</button>
            </form>
            <div class="loginLinks">
              <button class="secondaryActionBtn" id="goLogin">Ya tengo cuenta</button>
            </div>
          ` : `
            <h2>Recuperar acceso</h2>
            <p class="loginHint">Te enviaremos un enlace a tu Gmail para restablecer tu contraseña.</p>
            <form id="recoverForm" class="loginForm">
              <div class="field"><label>Correo Gmail</label>
                <input type="email" id="recEmail" inputmode="email" placeholder="tucorreo@gmail.com" required></div>
              <button class="btn block" type="submit">Enviar enlace</button>
            </form>
            <div class="loginLinks">
              <button class="secondaryActionBtn" id="goLogin">Volver a iniciar sesión</button>
            </div>
          `}
        </div>
      </section>
    `;
    $('#goLogin') && $('#goLogin').addEventListener('click', () => showMode('login'));
    $('#goRegister') && $('#goRegister').addEventListener('click', () => showMode('register'));
    $('#goRecover') && $('#goRecover').addEventListener('click', () => showMode('recover'));

    if (mode === 'login') {
      $('#loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Ingresando...';
        const result = await loginWithEmail($('#lEmail').value.trim(), $('#lPass').value);
        btn.disabled = false; btn.textContent = 'Entrar';
        if (!result.ok) { showToast(result.message || 'No se pudo iniciar sesion.', 'error'); return; }
        await afterLoginSuccess(result);
      });
    }
    if (mode === 'register') {
      $('#regForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Creando cuenta...';
        const result = await registerNewAccount({
          fullName: $('#rName').value.trim(),
          email: $('#rEmail').value.trim(),
          phone: $('#rPhone').value.trim(),
          city: $('#rCity').value.trim(),
          password: $('#rPass').value
        });
        btn.disabled = false; btn.textContent = 'Crear cuenta';
        if (!result.ok) { showToast(result.message || 'No se pudo crear la cuenta.', 'error'); return; }
        if (result.needsEmailConfirmation) { showToast(result.message); showMode('login'); return; }
        await afterLoginSuccess(result);
      });
    }
    if (mode === 'recover') {
      $('#recoverForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Enviando...';
        const result = await requestPasswordRecovery($('#recEmail').value.trim());
        btn.disabled = false; btn.textContent = 'Enviar enlace';
        showToast(result.message, result.ok ? undefined : 'error');
        if (result.ok) showMode('login');
      });
    }
  }
  showMode('login');
}

function isPasswordRecoveryRedirect() {
  const raw = (window.location.hash || '') + '&' + (window.location.search || '');
  return /type=recovery|access_token=|code=/.test(raw) && !!(window.updateCurrentUserPassword);
}

function renderPasswordResetScreen() {
  $('#bottomNav').innerHTML = '';
  $('#fabAdd').classList.add('hidden');
  $('#mainArea').innerHTML = `
    <section class="loginShell">
      <div class="loginCard">
        <div class="loginBrand"><h1>Natura Vida</h1></div>
        <h2>Crear nueva contraseña</h2>
        <p class="loginHint">Ingresa tu nueva contraseña para recuperar el acceso a tu cuenta.</p>
        <form id="resetPassForm" class="loginForm">
          <div class="field"><label>Nueva contraseña</label>
            <input type="password" id="newPass" autocomplete="new-password" placeholder="Mínimo 6 caracteres" required minlength="6"></div>
          <div class="field"><label>Confirmar contraseña</label>
            <input type="password" id="newPass2" autocomplete="new-password" placeholder="Repite la contraseña" required minlength="6"></div>
          <button class="btn block" type="submit">Guardar contraseña</button>
        </form>
      </div>
    </section>`;
  $('#resetPassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = $('#newPass').value;
    const p2 = $('#newPass2').value;
    if (p1 !== p2) { showToast('Las contraseñas no coinciden.', 'error'); return; }
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    const result = await updateCurrentUserPassword(p1);
    btn.disabled = false; btn.textContent = 'Guardar contraseña';
    showToast(result.message, result.ok ? undefined : 'error');
    if (result.ok) {
      if (window.history && window.history.replaceState) window.history.replaceState({}, document.title, window.location.pathname);
      await logoutSession();
      renderLoginScreen();
    }
  });
}

async function afterLoginSuccess(result) {
  await loadAllState();
  renderTopHeader();
  if (AppState.session && AppState.session.pendingApproval) {
    $('#mainArea').innerHTML = `
      <section class="loginShell">
        <div class="loginCard pendingApprovalCard">
          <div class="livePulse" aria-hidden="true"></div>
          <h2>Cuenta pendiente de aprobación</h2>
          <p>El administrador debe aprobar tu cuenta. No necesitas actualizar ni presionar ningún botón: Natura Vida recibirá la aprobación automáticamente mediante Realtime.</p>
          <div class="cloudStatus online"><span class="cloudDot"></span><div><strong>Realtime activo</strong><small>Esperando aprobación desde Supabase</small></div></div>
          <button class="secondaryActionBtn" id="pendingLogout">Cerrar sesión</button>
        </div>
      </section>
    `;
    if (window.startBackgroundSync) startBackgroundSync();
    if (window.startRealtimeSubscriptions) startRealtimeSubscriptions();
    $('#pendingLogout').addEventListener('click', () => logoutSession());
    return;
  }
  showToast('Sesión iniciada. Cargando datos oficiales de Supabase…');
  renderBottomNav();
  AppState.currentTab = 'inicio';
  if (window.syncAfterLogin) {
    const syncResult = await syncAfterLogin().catch(err => ({ ok: false, message: err.message }));
    if (syncResult && syncResult.ok === false) {
      showToast(syncResult.message || 'No se pudieron cargar los datos oficiales de Supabase.', 'error');
    }
  }
  await loadAllState();
  render();
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
      <div class="eyebrow">Plataforma comercial online-first</div>
      <h1>Natura Vida Bolivia</h1>
      <p>Sesión activa: <strong>${escapeHtml(AppState.session.fullName || '')}</strong> · ${escapeHtml(AppState.session.roleName || '')}. Supabase es la única base oficial. Los cambios se actualizan automáticamente en tiempo real.</p>
      <div class="dashActions">
        <button class="btn" id="qbSell">Registrar venta</button>
        <button class="btn outline" id="qbInv">Inventario</button>
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
        ${isReseller && isReseller() ? `<div class="quickBtn" id="qbOrder"><span class="ic svgic">${icon('box')}</span><span>Pedido al administrador</span></div>` : ''}
      </div>
      <div class="systemBadges">
        <span>Supabase oficial</span><span>Realtime activo</span><span>Sin base local</span><span>PWA online</span><span>${pendingQuotes} cotización(es)</span>
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
  $('#goInventory').addEventListener('click', () => navigateTo('inventario'));
  $('#goReports').addEventListener('click', () => navigateTo('resumen'));
  $('#qbQuote').addEventListener('click', () => navigateTo('cotizar'));
  $('#qbClients').addEventListener('click', () => navigateTo('clientes'));
  $('#qbUsers').addEventListener('click', () => navigateTo('usuarios'));
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
        <div><span>Datos</span><strong>Supabase</strong></div>
      </div>
    </section>
    <div class="moreList proMore">
      <div class="moreItem" id="moreClients"><span class="ic svgic">${icon('clients')}</span><span>Directorio de clientes</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreGroups"><span class="ic svgic">${icon('tag')}</span><span>Grupos de precio</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreCatalogPdf"><span class="ic svgic">${icon('quote')}</span><span>Catálogo PDF para compartir</span><span class="tagSoon">PDF</span><span class="arrow">›</span></div>
      ${isReseller && isReseller() ? `<div class="moreItem" id="moreOrder"><span class="ic svgic">${icon('box')}</span><span>Pedido online al administrador</span><span class="tagSoon">Nuevo</span><span class="arrow">›</span></div>` : ''}
      <div class="moreItem" id="moreUsers"><span class="ic svgic">${icon('users')}</span><span>Usuarios, roles y permisos</span><span class="tagSoon">Activo</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreReports"><span class="ic svgic">${icon('reports')}</span><span>Reportes comerciales</span><span class="tagSoon">Base</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreResumen"><span class="ic svgic">${icon('home')}</span><span>Resumen e historial</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreSettings"><span class="ic svgic">${icon('settings')}</span><span>Ajustes y conexión</span><span class="arrow">›</span></div>
      <div class="moreItem dangerItem" id="moreLogout"><span class="ic svgic">${icon('logout')}</span><span>Cerrar sesión</span><span class="arrow">›</span></div>
    </div>
  `;
  const moreInbox = $('#moreInbox');
  if (moreInbox) moreInbox.addEventListener('click', () => openInboxPanel(true));
  $('#moreClients').addEventListener('click', () => navigateTo('clientes'));
  $('#moreGroups').addEventListener('click', () => navigateTo('grupos'));
  $('#moreCatalogPdf').addEventListener('click', () => openCatalogPdfOptions());
  const moreOrder = $('#moreOrder');
  if (moreOrder) moreOrder.addEventListener('click', () => navigateTo('pedido'));
  $('#moreUsers').addEventListener('click', () => navigateTo('usuarios'));
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
  $('#mainArea').innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted)">Cargando usuarios...</div>`;

  let profiles = [];
  if (isAdmin() && window.fetchAllProfilesForAdmin) {
    const res = await fetchAllProfilesForAdmin().catch(() => ({ ok: false }));
    if (res && res.ok) profiles = res.profiles || [];
  }

  const statusIcon = (s) => s === 'activo' ? '🟢' : s === 'pendiente' ? '🟡' : '🔴';
  const statusLabel = (s) => s === 'activo' ? 'Activo' : s === 'pendiente' ? 'Pendiente' : 'Bloqueado';

  $('#mainArea').innerHTML = `
    <section class="dashboardPanel">
      <div class="panelHeader">
        <div><span class="eyebrow">Gestion de acceso</span><h2>Usuarios</h2></div>
        <span class="livePill">Actualización automática</span>
      </div>
      <div class="miniStats">
        <div><span>🟢 Activos</span><strong>${profiles.filter(p => p.status === 'activo').length}</strong></div>
        <div><span>🟡 Pendientes</span><strong>${profiles.filter(p => p.status === 'pendiente').length}</strong></div>
        <div><span>🔴 Bloqueados</span><strong>${profiles.filter(p => p.status === 'bloqueado').length}</strong></div>
      </div>
    </section>

    ${profiles.length ? profiles.map(p => `
      <div class="histitem userRow" data-uid="${p.id}">
        <div class="l">
          <div class="pname">${statusIcon(p.status)} ${escapeHtml(p.full_name || p.email || p.id)}</div>
          <div class="meta">${escapeHtml(p.email || '')} · ${escapeHtml(p.role || '')} · ${statusLabel(p.status)}${p.phone ? ' · ' + escapeHtml(p.phone) : ''}</div>
        </div>
        <div class="r userActions">
          ${p.status === 'pendiente' ? `<button class="btn sm" data-action="approve" data-id="${p.id}">Aprobar</button>` : ''}
          ${p.status !== 'bloqueado' ? `<button class="btn sm outline" data-action="block" data-id="${p.id}">Bloquear</button>` : `<button class="btn sm outline" data-action="unblock" data-id="${p.id}">Desbloquear</button>`}
        </div>
      </div>
    `).join('') : `<div class="empty compact"><h3>Sin usuarios registrados</h3><p>Los usuarios apareceran aqui cuando se registren con su Gmail.</p></div>`}
  `;


  $all('[data-action]').forEach(btn => btn.addEventListener('click', async () => {
    const { action, id } = btn.dataset;
    btn.disabled = true;
    let res;
    if (action === 'approve') res = await adminApproveUser(id);
    else if (action === 'block') res = await adminBlockUser(id);
    else if (action === 'unblock') res = await adminUnblockUser(id);
    if (res && res.ok) {
      const label = action === 'approve' ? 'Usuario aprobado correctamente' :
                    action === 'block'   ? 'Usuario bloqueado correctamente' :
                                          'Usuario desbloqueado correctamente';
      showToast(label);
      renderUsersFoundation();
    } else {
      showToast((res && res.message) || 'No se pudo actualizar el usuario.', 'error');
      btn.disabled = false;
    }
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
  $('#mainArea').innerHTML = `
    <section class="dashboardPanel">
      <div class="panelHeader"><div><span class="eyebrow">Fase 5 preparada</span><h2>Reportes profesionales</h2></div></div>
      <div class="miniStats">
        <div><span>Ventas</span><strong>${AppState.sales.length}</strong></div>
        <div><span>Clientes</span><strong>${AppState.clients.length}</strong></div>
        <div><span>Conexión</span><strong>Realtime</strong></div>
      </div>
      <div class="banner">Los reportes se alimentan directamente con los datos oficiales de Supabase.</div>
    </section>
  `;
}

async function initApp() {
  // V7: elimina rastros locales antiguos y utiliza memoria transitoria.
  // Supabase es la única fuente persistente.
  await openDB();
  await loadAllState();
  renderTopHeader();
  if (isPasswordRecoveryRedirect()) {
    if (window.waitForPasswordRecoverySession) await waitForPasswordRecoverySession().catch(() => false);
    renderPasswordResetScreen();
    return;
  }
  const sessionOk = await restoreSession();
  if (sessionOk && requireAuth()) {
    if (AppState.session && AppState.session.pendingApproval) {
      await afterLoginSuccess({ ok: true, pendingApproval: true });
    } else {
      renderBottomNav();
      if (window.syncAfterLogin) await syncAfterLogin().catch(() => {});
      await loadAllState();
      if (window.refreshInboxBadge) refreshInboxBadge({ silent: true }).catch(() => {});
      render();
    }
  } else {
    renderLoginScreen();
  }

  $('#brandClickArea') && $('#brandClickArea').addEventListener('click', () => {
    if (requireAuth()) navigateTo('ajustes');
  });

  window.addEventListener('nv:connection', (event) => updateCloudStatusBadge(event.detail));
  updateCloudStatusBadge(window.CloudConnection || { state: navigator.onLine ? 'connecting' : 'offline' });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js?v=7.0.0', { updateViaCache: 'none' }).catch(() => {});
  }
}

window.updateCloudStatusBadge = updateCloudStatusBadge;
window.navigateTo = navigateTo;
window.render = render;
window.renderTopHeader = renderTopHeader;
window.renderBottomNav = renderBottomNav;
window.afterLoginSuccess = afterLoginSuccess;
window.renderUsersFoundation = renderUsersFoundation;
document.addEventListener('DOMContentLoaded', initApp);
