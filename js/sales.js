/* sales.js — Catálogo-carrito de venta: foto + nombre + precio + selector −/cantidad/+ en cada
   tarjeta. Permite agregar varios productos a la vez (carrito) y confirmar todo en una sola
   venta con un solo recibo. Precios: unitario o mayor (+ grupo opcional) según el toggle activo. */

let _saleType = 'unit';
let _saleSelectedGroup = null;
let _saleSearch = '';
let _cart = {}; // { productId: qty }

function cartCount() {
  return Object.values(_cart).reduce((s, q) => s + q, 0);
}

function priceForCurrentMode(p) {
  if (_saleType === 'unit') return unitPrice(p);
  if (AppState.settings.priceGroupsEnabled && _saleSelectedGroup) return priceForGroup(p, _saleSelectedGroup);
  return wholesalePrice(p);
}

function renderVender() {
  $('#fabAdd').classList.add('hidden');
  const main = $('#mainArea');

  if (AppState.products.length === 0) {
    main.innerHTML = `<div class="empty"><span class="ic">💵</span><h3>No hay productos</h3><p>Agrega productos en Inventario antes de registrar ventas.</p></div>`;
    return;
  }

  const groupsEnabled = AppState.settings.priceGroupsEnabled && AppState.priceGroups.length > 0;

  let html = `
    <div class="saletoggle">
      <button data-type="unit" class="${_saleType === 'unit' ? 'active' : ''}">Venta público</button>
      <button data-type="wholesale" class="${_saleType === 'wholesale' ? 'active' : ''}">Venta revendedor</button>
    </div>

    ${_saleType === 'wholesale' && groupsEnabled ? `
    <div class="field" style="margin-bottom:14px;">
      <label>Grupo / zona de venta (opcional, ajusta todos los precios)</label>
      <select id="s_group">
        <option value="">Sin grupo (precio revendedor general)</option>
        ${AppState.priceGroups.map(g => `<option value="${g.id}" ${_saleSelectedGroup === g.id ? 'selected' : ''}>${escapeHtml(g.name)} (${g.mode === 'discount' ? '−' : '+'}${g.percent}%)</option>`).join('')}
      </select>
    </div>` : ''}

    <div class="toolrow">
      <input type="text" id="searchInput" placeholder="Buscar producto..." value="${escapeHtml(_saleSearch)}">
    </div>

    <div class="catalogGrid" id="catalogGrid"></div>
  `;
  main.innerHTML = html;

  $all('.saletoggle button').forEach(b => b.addEventListener('click', () => {
    _saleType = b.dataset.type;
    renderVender();
  }));
  const groupSel = $('#s_group');
  if (groupSel) groupSel.addEventListener('change', () => { _saleSelectedGroup = groupSel.value || null; renderVender(); });
  $('#searchInput').addEventListener('input', e => { _saleSearch = e.target.value; renderCatalogGrid(); });

  renderCatalogGrid();
  renderCartBar();
}

function renderCatalogGrid() {
  const grid = $('#catalogGrid');
  if (!grid) return;
  const filtered = AppState.products.filter(p => matchesSearch(p.name, _saleSearch));

  grid.innerHTML = filtered.map(p => {
    const price = priceForCurrentMode(p);
    const qty = _cart[p.id] || 0;
    const low = p.stock <= AppState.settings.lowStockThreshold;
    return `
    <div class="catalogCard" data-id="${p.id}">
      <div class="catalogPhoto">${p.photo ? `<img src="${p.photo}" alt="">` : '<span class="invPhotoFallback">🌿</span>'}</div>
      <div class="catalogBody">
        <div class="catalogName">${escapeHtml(p.name)}</div>
        <div class="catalogPrice">${fmtMoney(price)}</div>
        <div class="catalogStock ${low ? 'low' : ''}">stock: ${p.stock}</div>
        <div class="qtyStepper">
          <button class="qtyMinus" data-id="${p.id}">−</button>
          <span class="qtyVal" data-id="${p.id}">${qty}</span>
          <button class="qtyPlus" data-id="${p.id}">+</button>
        </div>
      </div>
    </div>`;
  }).join('');

  $all('.qtyPlus', grid).forEach(b => b.addEventListener('click', () => changeQty(b.dataset.id, 1)));
  $all('.qtyMinus', grid).forEach(b => b.addEventListener('click', () => changeQty(b.dataset.id, -1)));
}

function changeQty(productId, delta) {
  const p = AppState.products.find(x => x.id === productId);
  if (!p) return;
  const current = _cart[productId] || 0;
  let next = current + delta;
  if (next < 0) next = 0;
  if (next > p.stock) { showToast(`⚠️ Solo hay ${p.stock} en stock`, 'error'); next = p.stock; }
  if (next === 0) delete _cart[productId];
  else _cart[productId] = next;

  const valEl = document.querySelector(`.qtyVal[data-id="${productId}"]`);
  if (valEl) valEl.textContent = _cart[productId] || 0;
  renderCartBar();
}

function renderCartBar() {
  let bar = $('#cartBar');
  const count = cartCount();
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cartBar';
    bar.className = 'cartBar';
    document.getElementById('app').appendChild(bar);
  }
  if (count === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  const total = Object.entries(_cart).reduce((s, [id, qty]) => {
    const p = AppState.products.find(x => x.id === id);
    return s + (p ? priceForCurrentMode(p) * qty : 0);
  }, 0);
  bar.innerHTML = `
    <div class="cartBarInfo">
      <span class="cartCount">${count} ítem(s)</span>
      <span class="cartTotal">${fmtMoney(total)}</span>
    </div>
    <button class="btn" id="goToCheckout">Continuar</button>
  `;
  $('#goToCheckout', bar).addEventListener('click', openCheckoutSheet);
}

function openCheckoutSheet() {
  const items = Object.entries(_cart).map(([id, qty]) => {
    const p = AppState.products.find(x => x.id === id);
    return { product: p, qty, price: priceForCurrentMode(p) };
  }).filter(i => i.product);

  const total = items.reduce((s, i) => s + (i.price * i.qty), 0);

  const html = `
    <h2>Confirmar venta <span class="x" id="closeSheet">✕</span></h2>

    <div class="sectiontitle2"><span>Productos (${items.length})</span></div>
    ${items.map(i => `
      <div class="histitem">
        <div class="l"><div class="pname">${escapeHtml(i.product.name)}</div><div class="meta">${i.qty} × ${fmtMoney(i.price)}</div></div>
        <div class="r">${fmtMoney(i.price * i.qty)}</div>
      </div>
    `).join('')}

    <div class="sectiontitle2"><span>Datos del cliente</span></div>
    <div class="field">
      <label>Nombre del cliente</label>
      <input type="text" id="ck_clientname" placeholder="Ej: Juan Pérez" value="${AppState.lastClient ? escapeHtml(AppState.lastClient.name) : ''}" list="clientSuggestions">
      <datalist id="clientSuggestions">${AppState.clients.map(c => `<option value="${escapeHtml(c.name)}">`).join('')}</datalist>
    </div>
    <div class="field">
      <label>Número de teléfono</label>
      <input type="tel" inputmode="tel" id="ck_clientphone" placeholder="Ej: 71234567" value="${AppState.lastClient ? escapeHtml(AppState.lastClient.phone || '') : ''}">
    </div>

    <div class="totalbox"><span class="lbl">Total a cobrar</span><span class="val">${fmtMoney(total)}</span></div>
    <button class="btn block" id="confirmSale">✔ Confirmar venta y descontar stock</button>
  `;

  openSheet(html, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#ck_clientname', overlay).addEventListener('input', () => {
      const name = $('#ck_clientname', overlay).value.trim();
      const existing = AppState.clients.find(c => normalizeSearch(c.name) === normalizeSearch(name));
      if (existing && !$('#ck_clientphone', overlay).value) $('#ck_clientphone', overlay).value = existing.phone || '';
    });

    $('#confirmSale', overlay).addEventListener('click', async () => {
      const clientName = $('#ck_clientname', overlay).value.trim();
      const clientPhone = $('#ck_clientphone', overlay).value.trim();
      if (!clientName) { showToast('⚠️ Ingresa el nombre del cliente', 'error'); return; }

      const client = findOrCreateClientQuick(clientName, clientPhone);
      const groupName = _saleSelectedGroup ? (AppState.priceGroups.find(g => g.id === _saleSelectedGroup) || {}).name : null;
      const saleId = uid('sale');
      const saleItems = [];

      for (const it of items) {
        it.product.stock -= it.qty;
        await DB.put('products', it.product);
        const unitCost = grossCost(it.product);
        saleItems.push({
          productId: it.product.id,
          productName: it.product.name,
          category: it.product.category || 'General',
          qty: it.qty,
          unitCost,
          unitPrice: it.price,
          subtotal: it.price * it.qty,
          profit: (it.price - unitCost) * it.qty
        });
        await DB.put('inventoryMovements', {
          id: uid('mov'),
          productId: it.product.id,
          productName: it.product.name,
          type: 'sale',
          qty: -it.qty,
          stockAfter: it.product.stock,
          reason: 'Venta registrada',
          date: Date.now(),
          saleId,
          syncStatus: 'local'
        });
      }

      const sale = {
        id: saleId,
        type: _saleType,
        groupId: _saleType === 'wholesale' ? _saleSelectedGroup : null,
        groupName: _saleType === 'wholesale' ? groupName : null,
        items: saleItems,
        total,
        clientId: client ? client.id : null,
        clientName, clientPhone,
        date: Date.now(),
        syncStatus: 'local'
      };
      AppState.sales.push(sale);
      await DB.put('sales', sale);
      await writeAudit('sale:create', 'sales', sale.id, null, sale).catch(() => {});

      showToast('✔ Venta registrada — stock actualizado');
      close();
      openReceiptPreview(sale);

      _cart = {};
      renderVender();
    });
  });
}

window.renderVender = renderVender;
