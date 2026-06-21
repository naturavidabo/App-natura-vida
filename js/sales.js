/* sales.js — Venta con catálogo/carrito. Para revendedores permite precio negociado.
   Ejemplo: precio revendedor Bs 100, precio sugerido público Bs 150; el revendedor puede vender a Bs 140, 150, 160, etc. y la app calcula su margen. */

let _saleType = 'unit';
let _saleSelectedGroup = null;
let _saleSearch = '';
let _cart = {};       // { productId: qty }
let _cartPrices = {}; // { productId: customSalePrice } para revendedores

function cartCount() {
  return Object.values(_cart).reduce((s, q) => s + q, 0);
}

function sellerMode() {
  return window.isReseller && isReseller();
}

function priceForCurrentMode(p) {
  if (sellerMode()) return sellerSalePrice(p);
  if (_saleType === 'unit') return unitPrice(p);
  if (AppState.settings.priceGroupsEnabled && _saleSelectedGroup) return priceForGroup(p, _saleSelectedGroup);
  return wholesalePrice(p);
}

function sellerSalePrice(p) {
  const custom = Number(_cartPrices[p.id]);
  if (Number.isFinite(custom) && custom > 0) return roundBs(custom);
  return publicPrice(p) || wholesalePrice(p);
}

function sellerUnitMargin(p) {
  return roundBs(sellerSalePrice(p) - wholesalePrice(p));
}

function renderVender() {
  $('#fabAdd').classList.add('hidden');
  const main = $('#mainArea');

  if (sellerMode()) _saleType = 'wholesale';

  if (AppState.products.length === 0) {
    main.innerHTML = `<div class="empty"><span class="ic">💵</span><h3>No hay productos</h3><p>Actualiza el catálogo o espera a que el administrador cargue productos.</p></div>`;
    return;
  }

  const groupsEnabled = !sellerMode() && AppState.settings.priceGroupsEnabled && AppState.priceGroups.length > 0;

  let html = `
    ${sellerMode() ? `
      <section class="resellerSaleHero">
        <div class="eyebrow">Modo revendedor</div>
        <h1>Vender con precio negociado</h1>
        <p>El administrador define tu precio base. Tú decides el precio final de venta y la app calcula tu margen automáticamente.</p>
      </section>` : `
      <div class="saletoggle salesChannelToggle">
        <button data-type="unit" class="${_saleType === 'unit' ? 'active' : ''}">Unitaria</button>
        <button data-type="market" class="${_saleType === 'market' ? 'active' : ''}">Mayorista mercado</button>
        <button data-type="representative_transfer" class="${_saleType === 'representative_transfer' ? 'active' : ''}">A representante</button>
      </div>
      <div class="formNotice salesChannelNotice">
        ${_saleType === 'unit' ? 'Venta directa a cliente final.' : (_saleType === 'market' ? 'Venta al por mayor a mercados o tiendas que no usan la app.' : 'Despacho/venta a representante regional. En V4 se complementa con archivo de despacho inteligente.')}
      </div>`}

    ${(_saleType === 'market' || _saleType === 'representative_transfer') && groupsEnabled ? `
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

  if (!sellerMode()) {
    $all('.saletoggle button').forEach(b => b.addEventListener('click', () => {
      _saleType = b.dataset.type;
      renderVender();
    }));
  }
  const groupSel = $('#s_group');
  if (groupSel) groupSel.addEventListener('change', () => { _saleSelectedGroup = groupSel.value || null; renderVender(); });
  $('#searchInput').addEventListener('input', e => { _saleSearch = e.target.value; renderCatalogGrid(); });

  renderCatalogGrid();
  renderCartBar();
}

function renderCatalogGrid() {
  const grid = $('#catalogGrid');
  if (!grid) return;
  const filtered = AppState.products.filter(p => p.status !== 'archived' && matchesSearch(p.name, _saleSearch));

  grid.innerHTML = filtered.map(p => {
    const price = priceForCurrentMode(p);
    const qty = _cart[p.id] || 0;
    const low = p.stock <= AppState.settings.lowStockThreshold;
    const base = wholesalePrice(p);
    const suggested = publicPrice(p);
    const margin = sellerUnitMargin(p);
    return `
    <div class="catalogCard ${sellerMode() ? 'resellerCatalogCard' : ''}" data-id="${p.id}">
      <div class="catalogPhoto">${p.photo ? `<img src="${p.photo}" alt="">` : '<span class="invPhotoFallback">🌿</span>'}</div>
      <div class="catalogBody">
        <div class="catalogName">${escapeHtml(p.name)}</div>
        ${sellerMode() ? `
          <div class="sellerPriceBox">
            <div><span>Tu base</span><strong>${fmtMoney(base)}</strong></div>
            <div><span>Sugerido</span><strong>${fmtMoney(suggested)}</strong></div>
          </div>
          <div class="field sellerPriceField">
            <label>Tu precio de venta</label>
            <input type="number" inputmode="decimal" step="1" class="sellerCustomPrice" data-id="${p.id}" value="${price || ''}">
          </div>
          <div class="sellerMargin ${margin < 0 ? 'negative' : ''}">Margen por unidad: ${fmtMoney(margin)}</div>
        ` : `
          <div class="catalogPrice">${fmtMoney(price)}</div>
        `}
        <div class="catalogStock ${low ? 'low' : ''}">stock referencial: ${p.stock}</div>
        <div class="qtyStepper">
          <button class="qtyMinus" data-id="${p.id}">−</button>
          <span class="qtyVal" data-id="${p.id}">${qty}</span>
          <button class="qtyPlus" data-id="${p.id}">+</button>
        </div>
      </div>
    </div>`;
  }).join('');

  $all('.sellerCustomPrice', grid).forEach(inp => inp.addEventListener('input', () => {
    const p = AppState.products.find(x => x.id === inp.dataset.id);
    if (!p) return;
    _cartPrices[p.id] = roundBs(parseFloat(inp.value) || 0);
    renderCatalogGrid();
    renderCartBar();
  }));
  $all('.qtyPlus', grid).forEach(b => b.addEventListener('click', () => changeQty(b.dataset.id, 1)));
  $all('.qtyMinus', grid).forEach(b => b.addEventListener('click', () => changeQty(b.dataset.id, -1)));
}

function changeQty(productId, delta) {
  const p = AppState.products.find(x => x.id === productId);
  if (!p) return;
  const current = _cart[productId] || 0;
  let next = current + delta;
  if (next < 0) next = 0;
  if (next > p.stock) { showToast(`⚠️ Stock referencial: ${p.stock}`, 'error'); next = p.stock; }
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
  const margin = sellerMode() ? Object.entries(_cart).reduce((s, [id, qty]) => {
    const p = AppState.products.find(x => x.id === id);
    return s + (p ? sellerUnitMargin(p) * qty : 0);
  }, 0) : null;
  bar.innerHTML = `
    <div class="cartBarInfo">
      <span class="cartCount">${count} ítem(s)${sellerMode() ? ` · margen ${fmtMoney(margin)}` : ''}</span>
      <span class="cartTotal">${fmtMoney(total)}</span>
    </div>
    <button class="btn" id="goToCheckout">Continuar</button>
  `;
  $('#goToCheckout', bar).addEventListener('click', openCheckoutSheet);
}

function openCheckoutSheet() {
  const items = Object.entries(_cart).map(([id, qty]) => {
    const p = AppState.products.find(x => x.id === id);
    return { product: p, qty, price: p ? priceForCurrentMode(p) : 0 };
  }).filter(i => i.product);

  if (sellerMode()) {
    const invalid = items.find(i => i.price < wholesalePrice(i.product));
    if (invalid) {
      showToast(`El precio de ${invalid.product.name} no puede ser menor a tu precio base.`, 'error');
      return;
    }
  }

  const total = items.reduce((s, i) => s + (i.price * i.qty), 0);
  const sellerProfit = sellerMode() ? items.reduce((s, i) => s + ((i.price - wholesalePrice(i.product)) * i.qty), 0) : 0;

  const html = `
    <h2>Confirmar venta <span class="x" id="closeSheet">✕</span></h2>

    <div class="sectiontitle2"><span>Productos (${items.length})</span></div>
    ${items.map(i => `
      <div class="histitem">
        <div class="l"><div class="pname">${escapeHtml(i.product.name)}</div><div class="meta">${i.qty} × ${fmtMoney(i.price)}${sellerMode() ? ` · base ${fmtMoney(wholesalePrice(i.product))}` : ''}</div></div>
        <div class="r">${fmtMoney(i.price * i.qty)}</div>
      </div>
    `).join('')}

    ${sellerMode() ? `<div class="totalbox resellerProfitBox"><span class="lbl">Tu margen estimado</span><span class="val">${fmtMoney(sellerProfit)}</span></div>` : ''}

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
    <button class="btn block" id="confirmSale">Confirmar venta y generar recibo</button>
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
        const resellerBase = wholesalePrice(it.product);
        const unitCost = sellerMode() ? resellerBase : grossCost(it.product);
        const sellerUnitProfit = sellerMode() ? (it.price - resellerBase) : 0;
        if (!sellerMode()) {
          it.product.stock -= it.qty;
          await DB.put('products', it.product);
        } else {
          it.product.stock = Math.max(0, (Number(it.product.stock) || 0) - it.qty);
          await DB.put('products', it.product, { silent: true });
        }
        saleItems.push({
          productId: it.product.id,
          productName: it.product.name,
          category: it.product.category || 'General',
          qty: it.qty,
          unitCost,
          resellerBase,
          suggestedPublicPrice: publicPrice(it.product),
          unitPrice: it.price,
          subtotal: it.price * it.qty,
          profit: (it.price - unitCost) * it.qty,
          sellerUnitProfit,
          sellerProfit: sellerUnitProfit * it.qty
        });
        await DB.put('inventoryMovements', {
          id: uid('mov'),
          productId: it.product.id,
          productName: it.product.name,
          type: sellerMode() ? 'reseller_sale_local' : 'sale',
          qty: -it.qty,
          stockAfter: it.product.stock,
          reason: sellerMode() ? 'Venta revendedor registrada localmente' : 'Venta registrada',
          date: Date.now(),
          saleId,
          syncStatus: 'local'
        }, { silent: sellerMode() });
      }

      const sale = {
        id: saleId,
        type: sellerMode() ? 'reseller' : _saleType,
        role: AppState.session ? AppState.session.roleName : 'Local',
        sellerId: AppState.session ? AppState.session.userId : null,
        sellerName: AppState.session ? AppState.session.fullName : null,
        groupId: (_saleType === 'market' || _saleType === 'representative_transfer') ? _saleSelectedGroup : null,
        groupName: (_saleType === 'market' || _saleType === 'representative_transfer') ? groupName : null,
        items: saleItems,
        total,
        sellerProfit,
        clientId: client ? client.id : null,
        clientName, clientPhone,
        date: Date.now(),
        syncStatus: 'local'
      };
      AppState.sales.push(sale);
      await DB.put('sales', sale);
      await writeAudit('sale:create', 'sales', sale.id, null, sale).catch(() => {});

      showToast('Venta registrada');
      close();
      openReceiptPreview(sale);

      _cart = {};
      _cartPrices = {};
      renderVender();
    });
  });
}

function startSaleWithProduct(productId) {
  AppState.currentTab = 'vender';
  _cart = { [productId]: 1 };
  const p = AppState.products.find(x => x.id === productId);
  if (p && sellerMode()) _cartPrices[productId] = publicPrice(p) || wholesalePrice(p);
  render();
}

window.renderVender = renderVender;
window.startSaleWithProduct = startSaleWithProduct;
