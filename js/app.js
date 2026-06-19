/* app.js — Router principal, navegación inferior, pantalla de Inicio (Modo Rápido), Resumen/Historial. */

function renderTopHeader() {
  $('#bizName').textContent = AppState.settings.businessName || 'Mi negocio';
  $('#bizLogo').innerHTML = AppState.settings.logo ? `<img src="${AppState.settings.logo}" alt="">` : '🏪';
}

function renderBottomNav() {
  const nav = $('#bottomNav');
  const groupsTab = AppState.settings.priceGroupsEnabled
    ? `<button data-tab="grupos"><span class="ic">🏷️</span>Grupos</button>` : '';
  nav.innerHTML = `
    <button data-tab="inicio"><span class="ic">⚡</span>Inicio</button>
    <button data-tab="inventario"><span class="ic">🗃️</span>Inventario</button>
    <button data-tab="vender"><span class="ic">💵</span>Vender</button>
    <button data-tab="cotizar"><span class="ic">📄</span>Cotizar</button>
    <button data-tab="mas"><span class="ic">⋯</span>Más</button>
  `;
  $all('button', nav).forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.tab)));
  highlightActiveTab();
}

function highlightActiveTab() {
  $all('#bottomNav button').forEach(b => b.classList.toggle('active', b.dataset.tab === AppState.currentTab));
}

function navigateTo(tab) {
  AppState.currentTab = tab;
  highlightActiveTab();
  render();
}

function render() {
  $('#fabAdd').classList.add('hidden');
  $('#fabAdd').onclick = null;
  switch (AppState.currentTab) {
    case 'inicio': renderInicio(); break;
    case 'inventario': renderInventario(); break;
    case 'vender': renderVender(); break;
    case 'cotizar': renderQuotes(); break;
    case 'grupos': renderPriceGroups(); break;
    case 'clientes': renderClients(); break;
    case 'resumen': renderResumen(); break;
    case 'ajustes': renderSettings(); break;
    case 'mas': renderMas(); break;
    default: renderInicio();
  }
}

function renderInicio() {
  const main = $('#mainArea');
  const lowStock = AppState.products.filter(p => p.stock <= AppState.settings.lowStockThreshold);
  const todaySales = AppState.sales.filter(s => fmtDate(s.date) === fmtDate(Date.now()));
  const todayTotal = todaySales.reduce((s, v) => s + v.total, 0);

  main.innerHTML = `
    <div class="quickGrid">
      <div class="quickBtn" id="qbSell"><span class="ic">💵</span><span>Realizar Venta</span></div>
      <div class="quickBtn" id="qbInv"><span class="ic">🗃️</span><span>Ver Inventario</span></div>
      <div class="quickBtn" id="qbQuote"><span class="ic">📄</span><span>Nueva Cotización</span></div>
      <div class="quickBtn" id="qbClients"><span class="ic">👤</span><span>Clientes</span></div>
    </div>

    <div class="statgrid" style="margin-top:18px;">
      <div class="statcard"><div class="lbl">Ventas de hoy</div><div class="val" style="color:var(--pine-mid)">${fmtMoney(todayTotal)}</div></div>
      <div class="statcard"><div class="lbl">Transacciones hoy</div><div class="val">${todaySales.length}</div></div>
    </div>

    ${lowStock.length > 0 ? `
    <div class="sectiontitle" style="color:var(--red);">⚠ Stock bajo</div>
    ${lowStock.map(p => `
      <div class="card"><div class="cardtop"><div class="photo">${p.photo ? `<img src="${p.photo}" alt="">` : '📦'}</div>
        <div class="info"><div class="name">${escapeHtml(p.name)}</div><div class="stockline"><span class="pill low">quedan ${p.stock}</span></div></div>
      </div></div>
    `).join('')}` : ''}
  `;

  $('#qbSell').addEventListener('click', () => navigateTo('vender'));
  $('#qbInv').addEventListener('click', () => navigateTo('inventario'));
  $('#qbQuote').addEventListener('click', () => navigateTo('cotizar'));
  $('#qbClients').addEventListener('click', () => navigateTo('clientes'));
}

function renderMas() {
  const main = $('#mainArea');
  main.innerHTML = `
    <div class="moreList">
      <div class="moreItem" id="moreClients"><span class="ic">👤</span><span>Directorio de clientes</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreGroups"><span class="ic">🏷️</span><span>Grupos de precio</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreResumen"><span class="ic">📊</span><span>Resumen e historial</span><span class="arrow">›</span></div>
      <div class="moreItem" id="moreSettings"><span class="ic">⚙️</span><span>Ajustes y respaldo</span><span class="arrow">›</span></div>
    </div>
  `;
  $('#moreClients').addEventListener('click', () => navigateTo('clientes'));
  $('#moreGroups').addEventListener('click', () => navigateTo('grupos'));
  $('#moreResumen').addEventListener('click', () => navigateTo('resumen'));
  $('#moreSettings').addEventListener('click', () => navigateTo('ajustes'));
}

let _histFilterType = 'all';
function renderResumen() {
  $('#fabAdd').classList.add('hidden');
  const main = $('#mainArea');

  const totalInvertido = AppState.products.reduce((s, p) => s + (grossCost(p) * p.stock), 0);
  const totalUnidades = AppState.products.reduce((s, p) => s + p.stock, 0);
  const totalVendidoMonto = AppState.sales.reduce((s, v) => s + v.total, 0);
  const stockBajo = AppState.products.filter(p => p.stock <= AppState.settings.lowStockThreshold).length;

  let ganancia = 0;
  AppState.sales.forEach(v => {
    const p = AppState.products.find(x => x.id === v.productId);
    const cost = p ? grossCost(p) : 0;
    const unidades = v.qty;
    ganancia += v.total - (cost * unidades);
  });

  const filteredSales = AppState.sales
    .filter(v => _histFilterType === 'all' || v.type === _histFilterType)
    .slice().reverse();

  let html = `
    <div class="statgrid">
      <div class="statcard"><div class="lbl">Productos</div><div class="val">${AppState.products.length}</div></div>
      <div class="statcard"><div class="lbl">Unidades en stock</div><div class="val">${totalUnidades}</div></div>
      <div class="statcard"><div class="lbl">Capital invertido</div><div class="val">${fmtMoney(totalInvertido)}</div></div>
      <div class="statcard"><div class="lbl">Stock bajo</div><div class="val" style="color:${stockBajo > 0 ? 'var(--red)' : 'inherit'}">${stockBajo}</div></div>
      <div class="statcard full"><div class="lbl">Total vendido</div><div class="val" style="color:var(--pine-mid)">${fmtMoney(totalVendidoMonto)} <span style="font-size:12px;color:var(--gray);">· ${AppState.sales.length} venta(s)</span></div></div>
      <div class="statcard full"><div class="lbl">Ganancia estimada</div><div class="val" style="color:${ganancia >= 0 ? 'var(--pine-mid)' : 'var(--red)'}">${fmtMoney(ganancia)}</div></div>
    </div>

    <div class="sectiontitle">Historial de ventas</div>
    <div class="saletoggle">
      <button data-f="all" class="${_histFilterType === 'all' ? 'active' : ''}">Todas</button>
      <button data-f="unit" class="${_histFilterType === 'unit' ? 'active' : ''}">Unitarias</button>
      <button data-f="wholesale" class="${_histFilterType === 'wholesale' ? 'active' : ''}">Por mayor</button>
    </div>
  `;

  if (filteredSales.length === 0) {
    html += `<div class="empty"><span class="ic">📭</span><h3>Sin ventas</h3></div>`;
  } else {
    html += filteredSales.slice(0, 60).map(v => `
      <div class="histitem">
        <div class="l">
          <div class="pname">${escapeHtml(v.productName)} ${v.groupName ? `<span class="tinytag">${escapeHtml(v.groupName)}</span>` : ''}</div>
          <div class="meta">${escapeHtml(v.clientName || '—')} · ${v.type === 'unit' ? 'Unitaria' : 'Por mayor'} · ${fmtDate(v.date)}</div>
        </div>
        <div class="r">+${fmtMoney(v.total)}</div>
      </div>
    `).join('');
  }

  main.innerHTML = html;
  $all('.saletoggle button').forEach(b => b.addEventListener('click', () => { _histFilterType = b.dataset.f; renderResumen(); }));
}

async function initApp() {
  await openDB();
  await loadAllState();
  renderTopHeader();
  renderBottomNav();
  render();

  $('#brandClickArea').addEventListener('click', () => navigateTo('ajustes'));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

window.navigateTo = navigateTo;
window.render = render;
window.renderTopHeader = renderTopHeader;
window.renderBottomNav = renderBottomNav;
document.addEventListener('DOMContentLoaded', initApp);
