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
    renderAdminOrdersInbox();
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


async function renderAdminOrdersInbox() {
  $('#fabAdd').classList.add('hidden');
  if (isOnlineConfigured() && window.fetchCloudPurchaseOrders) {
    const cloud = await fetchCloudPurchaseOrders().catch(err => ({ ok: false, message: err.message }));
    if (cloud && cloud.ok && Array.isArray(cloud.orders) && cloud.orders.length) {
      await DB.bulkPut('purchaseOrders', cloud.orders, { silent: true }).catch(() => {});
    }
  }
  const orders = (await DB.getAll('purchaseOrders').catch(() => []))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  $('#mainArea').innerHTML = `
    <section class="dashboardPanel orderHero">
      <div class="panelHeader"><div><span class="eyebrow">Pedidos de representantes</span><h2>Recepción de pedidos</h2></div><button class="btn sm outline" id="refreshAdminOrders">Actualizar</button></div>
      <div class="banner">Los pedidos online y los pedidos importados por archivo aparecerán aquí y también en el buzón.</div>
      <div class="miniStats">
        <div><span>Total pedidos</span><strong>${orders.length}</strong></div>
        <div><span>Pendientes</span><strong>${orders.filter(o => o.status === 'pending').length}</strong></div>
        <div><span>Total base</span><strong>${fmtMoney(orders.reduce((s,o)=>s+(Number(o.total)||0),0))}</strong></div>
      </div>
    </section>
    ${orders.length ? orders.map(o => `
      <div class="histitem orderAdminCard">
        <div class="l">
          <div class="pname">${escapeHtml(o.representativeName || o.representativeUsername || 'Representante')}</div>
          <div class="meta">${(o.items || []).length} producto(s) · ${fmtDate(o.createdAt || Date.now())} · ${escapeHtml(o.status || 'pending')}</div>
          ${o.note ? `<div class="catalogDesc">${escapeHtml(o.note)}</div>` : ''}
          ${(o.items || []).slice(0,4).map(it => `<div class="meta">• ${escapeHtml(it.productName)} × ${it.qty}</div>`).join('')}
        </div>
        <div class="r"><strong>${fmtMoney(o.total || 0)}</strong>
          ${o.status === 'pending' ? `<button class="btn sm approveOrder" data-id="${o.id}">Aprobar</button><button class="btn sm outline rejectOrder" data-id="${o.id}">Rechazar</button>` : ''}
        </div>
      </div>
    `).join('') : `<div class="empty compact"><span class="ic">📭</span><h3>Sin pedidos recibidos</h3><p>Cuando un representante envíe pedido, aparecerá aquí.</p></div>`}
  `;
  $('#refreshAdminOrders').addEventListener('click', () => renderAdminOrdersInbox());
  $all('.approveOrder').forEach(b => b.addEventListener('click', () => setOrderStatus(b.dataset.id, 'approved')));
  $all('.rejectOrder').forEach(b => b.addEventListener('click', () => setOrderStatus(b.dataset.id, 'rejected')));
}

async function setOrderStatus(orderId, status) {
  const order = await DB.get('purchaseOrders', orderId).catch(() => null);
  if (!order) return;
  order.status = status;
  order.updatedAt = Date.now();
  await DB.put('purchaseOrders', order, { silent: true });
  if (window.updateCloudPurchaseOrderStatus) await updateCloudPurchaseOrderStatus(orderId, status).catch(() => {});
  if (window.sendAdminMessage) {
    await sendAdminMessage('order_status', `Pedido ${status === 'approved' ? 'aprobado' : 'rechazado'}`, `El administrador marcó un pedido como ${status}.`, { orderId, status }).catch(() => {});
  }
  showToast(status === 'approved' ? 'Pedido aprobado.' : 'Pedido rechazado.');
  renderAdminOrdersInbox();
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
  // CORRECCIÓN V6: antes se guardaba con {silent:true} y el envío a Supabase
  // dependía solo de la llamada manual de abajo. Si el representante estaba
  // sin conexión en ese momento, el pedido jamás se reintentaba después.
  // Ahora se guarda sin "silent" para que, además del intento inmediato,
  // quede en la cola duradera de sincronización.
  await DB.put('purchaseOrders', order).catch(() => {});
  let onlineResult = null;
  if (isOnlineConfigured() && window.insertCloudPurchaseOrder) {
    onlineResult = await insertCloudPurchaseOrder(order).catch(err => ({ ok: false, message: err.message }));
  }
  if (window.sendAdminMessage) {
    await sendAdminMessage(
      'purchase_order',
      'Nuevo pedido de representante',
      `${order.representativeName || 'Representante'} envió un pedido por ${fmtMoney(order.total)} con ${order.items.length} producto(s).`,
      { orderId: order.id, total: order.total, items: order.items, note: order.note, online: !!(onlineResult && onlineResult.ok) }
    ).catch(() => {});
  }
  const pkg = { _meta: basePackageMeta('purchase_order', 'admin', 'admin'), order };
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const filename = `NVB_PEDIDO_${(AppState.session.username || 'REP').toUpperCase()}_${packageStamp()}.json`;
  openPackageReadySheet(blob, filename, { packageType: onlineResult && onlineResult.ok ? 'purchase_order_online' : 'purchase_order' });
  showToast(onlineResult && onlineResult.ok ? 'Pedido enviado al servidor y archivo listo.' : 'Pedido generado. Compártelo por WhatsApp si no hay online.');
}

window.renderOrderRequest = renderOrderRequest;
window.renderAdminOrdersInbox = renderAdminOrdersInbox;
window.submitOrderRequest = submitOrderRequest;
window.setOrderStatus = setOrderStatus;

async function fetchAndCachePurchaseOrders() {
  if (!isOnlineConfigured() || !window.fetchCloudPurchaseOrders) return { ok: true, count: 0 };
  const cloud = await fetchCloudPurchaseOrders().catch(err => ({ ok: false, message: err.message }));
  if (cloud && cloud.ok && Array.isArray(cloud.orders) && cloud.orders.length) {
    await DB.bulkPut('purchaseOrders', cloud.orders, { silent: true }).catch(() => {});
    return { ok: true, count: cloud.orders.length };
  }
  return cloud || { ok: true, count: 0 };
}
window.fetchAndCachePurchaseOrders = fetchAndCachePurchaseOrders;
