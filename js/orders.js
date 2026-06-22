/* orders.js — Pedido de representantes al administrador, preparado para online y offline. */

let _orderCart = {};
let _orderNote = '';

function orderCount() {
  return Object.values(_orderCart).reduce((s, q) => s + q, 0);
}

function orderTotalBase() {
  return Object.entries(_orderCart).reduce((sum, [id, qty]) => {
    const p = AppState.products.find(x => x.id === id);
    return sum + (p ? representativePrice(p) * qty : 0);
  }, 0);
}

function renderOrderRequest() {
  $('#fabAdd').classList.add('hidden');
  if (!isReseller()) {
    $('#mainArea').innerHTML = `<div class="empty"><span class="ic">📦</span><h3>Pedido de representantes</h3><p>Esta sección está pensada para representantes/revendedores.</p></div>`;
    return;
  }
  const products = AppState.products.filter(p => p.status !== 'archived' && matchesSearch(p.name + ' ' + (p.category || ''), _saleSearch || ''));
  $('#mainArea').innerHTML = `
    <section class="dashboardPanel orderHero">
      <div class="panelHeader"><div><span class="eyebrow">Pedido al administrador</span><h2>Solicitar reposición</h2></div></div>
      <div class="banner">Arma tu pedido con los productos del catálogo. Puedes enviarlo online si el servidor está activo o generar un archivo para compartir por WhatsApp.</div>
      <div class="miniStats">
        <div><span>Ítems</span><strong>${orderCount()}</strong></div>
        <div><span>Total base</span><strong>${fmtMoney(orderTotalBase())}</strong></div>
        <div><span>Modo</span><strong>${isOnlineConfigured() ? 'Online' : 'Offline'}</strong></div>
      </div>
    </section>
    <div class="field"><label>Nota para el administrador</label><textarea id="orderNote" placeholder="Ej.: Enviar a La Paz por flota / confirmar disponibilidad">${escapeHtml(_orderNote)}</textarea></div>
    <div class="catalogGrid orderGrid">
      ${products.map(p => {
        const qty = _orderCart[p.id] || 0;
        return `<div class="catalogCard orderProductCard">
          <div class="catalogPhoto">${p.photo ? `<img src="${p.photo}" alt="">` : '<span class="invPhotoFallback nvLeafMark">NV</span>'}</div>
          <div class="catalogBody">
            <div class="catalogMetaLine"><span>${escapeHtml(p.category || 'General')}</span></div>
            <div class="catalogName">${escapeHtml(p.name)}</div>
            <div class="catalogPrice">Base: ${fmtMoney(representativePrice(p))}</div>
            <div class="catalogStock">Stock central ref.: ${Number(p.adminStock ?? p.stock ?? 0)}</div>
            <div class="qtyStepper"><button class="orderMinus" data-id="${p.id}">−</button><span class="qtyVal">${qty}</span><button class="orderPlus" data-id="${p.id}">+</button></div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="stickyActions orderStickyActions">
      <button class="btn outline block" id="clearOrderBtn">Limpiar pedido</button>
      <button class="btn block" id="sendOrderBtn">Enviar / compartir pedido</button>
    </div>
  `;
  $('#orderNote').addEventListener('input', e => { _orderNote = e.target.value; });
  $all('.orderPlus').forEach(b => b.addEventListener('click', () => changeOrderQty(b.dataset.id, 1)));
  $all('.orderMinus').forEach(b => b.addEventListener('click', () => changeOrderQty(b.dataset.id, -1)));
  $('#clearOrderBtn').addEventListener('click', () => { _orderCart = {}; renderOrderRequest(); });
  $('#sendOrderBtn').addEventListener('click', submitOrderRequest);
}

function changeOrderQty(productId, delta) {
  const current = _orderCart[productId] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) delete _orderCart[productId];
  else _orderCart[productId] = next;
  renderOrderRequest();
}

function buildOrderPayload() {
  const items = Object.entries(_orderCart).map(([id, qty]) => {
    const p = AppState.products.find(x => x.id === id);
    if (!p) return null;
    const base = representativePrice(p);
    return { productId: p.id, productName: p.name, category: p.category || 'General', qty, unitPrice: base, subtotal: base * qty };
  }).filter(Boolean);
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  return {
    id: uid('order'),
    representativeId: AppState.session.userId,
    representativeName: AppState.session.fullName || AppState.session.username,
    representativeUsername: AppState.session.username,
    note: _orderNote || '',
    items,
    total,
    status: 'pending',
    createdAt: Date.now(),
    syncStatus: 'local'
  };
}

async function submitOrderRequest() {
  if (orderCount() === 0) { showToast('Selecciona productos para el pedido.', 'error'); return; }
  const order = buildOrderPayload();
  await DB.put('purchaseOrders', order, { silent: true }).catch(() => {});
  let onlineResult = null;
  if (isOnlineConfigured() && window.insertCloudPurchaseOrder) {
    onlineResult = await insertCloudPurchaseOrder(order).catch(err => ({ ok: false, message: err.message }));
  }
  const pkg = { _meta: basePackageMeta('purchase_order', 'admin', 'admin'), order };
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const filename = `NVB_PEDIDO_${(AppState.session.username || 'REP').toUpperCase()}_${packageStamp()}.json`;
  openPackageReadySheet(blob, filename, { packageType: onlineResult && onlineResult.ok ? 'purchase_order_online' : 'purchase_order' });
  showToast(onlineResult && onlineResult.ok ? 'Pedido enviado al servidor y archivo listo.' : 'Pedido generado. Compártelo por WhatsApp si no hay online.');
}

window.renderOrderRequest = renderOrderRequest;
window.submitOrderRequest = submitOrderRequest;
