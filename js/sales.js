/* sales.js — Venta con precios flexibles por producto.
   V7.2.3: precio normal, precio por grupo y precio manual por línea. */

let _saleType = 'unit';
let _saleSelectedGroup = null;
let _saleSearch = '';
let _cart = {};       // { productId: qty }
let _cartPrices = {}; // { productId: manual pricing entry }

function salePriceGroupsV726() {
  return window.nvPriceGroupsForCurrent ? nvPriceGroupsForCurrent({ manage: false }) : (AppState.priceGroups || []);
}
function saleFindGroupV726(id) {
  return window.nvFindPriceGroup ? nvFindPriceGroup(id) : (AppState.priceGroups || []).find(pg => pg.id === id);
}
function saleGroupOptionsV726(selectedId = '') {
  return salePriceGroupsV726().map(g => `<option value="${g.id}" ${selectedId === g.id ? 'selected' : ''}>${escapeHtml(g.name)} (${g.mode === 'discount' ? '−' : '+'}${Number(g.percent || 0)}%)</option>`).join('');
}

function cartCount() {
  return Object.values(_cart).reduce((s, q) => s + Number(q || 0), 0);
}

function sellerMode() {
  return window.isReseller && isReseller();
}

function applyPercentGroup(base, groupId) {
  const g = saleFindGroupV726(groupId);
  const cleanBase = roundBs(base);
  if (!g) return cleanBase;
  const pct = Number(g.percent) || 0;
  if (g.mode === 'discount') return roundBs(Math.max(0, cleanBase - (cleanBase * pct / 100)));
  return roundBs(cleanBase + (cleanBase * pct / 100));
}

function saleGroupInfoV7(groupId) {
  return saleFindGroupV726(groupId) || null;
}

function saleManualEntryV7(entry) {
  if (!entry) return null;
  if (typeof entry === 'number') return { manualPrice: roundBs(entry), mode: 'final', value: roundBs(entry), reason: '' };
  const price = Number(entry.manualPrice ?? entry.price ?? entry.unitPrice ?? entry.value);
  if (!Number.isFinite(price) || price <= 0) return null;
  return Object.assign({}, entry, { manualPrice: roundBs(price) });
}

function basePriceForModeV7(product, saleType, isSeller) {
  if (isSeller) {
    if (saleType === 'reseller_wholesale') return roundBs(resellerLocalWholesalePrice(product) || marketPrice(product) || publicPrice(product));
    return roundBs(resellerLocalUnitPrice(product) || publicPrice(product) || marketPrice(product));
  }
  if (saleType === 'unit') return roundBs(unitPrice(product));
  if (saleType === 'representative_transfer') return roundBs(representativePrice(product));
  return roundBs(marketPrice(product));
}

function groupPriceForModeV7(product, saleType, groupId, isSeller) {
  const base = basePriceForModeV7(product, saleType, isSeller);
  if (!groupId) return base;
  if (isSeller) return applyPercentGroup(base, groupId);
  if (saleType === 'market' || saleType === 'representative_transfer') return priceForGroup(product, groupId);
  return base;
}

function buildSalePriceBreakdownV7(product, opts = {}) {
  const saleType = opts.saleType || _saleType;
  const groupId = opts.groupId || null;
  const manual = saleManualEntryV7(opts.manual);
  const isSeller = !!opts.seller;
  const basePrice = roundBs(Number(opts.basePrice ?? basePriceForModeV7(product, saleType, isSeller)) || 0);
  const groupPrice = roundBs(Number(opts.groupPrice ?? groupPriceForModeV7(product, saleType, groupId, isSeller)) || 0);
  const referencePrice = groupId ? groupPrice : basePrice;
  const unitPrice = manual ? roundBs(manual.manualPrice) : referencePrice;
  const diffFromBase = roundBs(unitPrice - basePrice);
  const diffFromReference = roundBs(unitPrice - referencePrice);
  let source = 'normal';
  if (manual) source = 'manual';
  else if (groupId && Math.abs(groupPrice - basePrice) > 0.0001) source = 'group';
  const sign = diffFromBase < 0 ? 'discount' : diffFromBase > 0 ? 'surcharge' : 'none';
  return {
    basePrice,
    groupPrice,
    referencePrice,
    unitPrice,
    manual,
    source,
    sign,
    groupId: groupId || null,
    groupName: groupId ? ((saleGroupInfoV7(groupId) || {}).name || '') : '',
    adjustmentAmount: roundBs(Math.abs(diffFromBase)),
    adjustmentSigned: diffFromBase,
    referenceAdjustmentSigned: diffFromReference,
    adjustmentPercent: basePrice ? roundBs((diffFromBase / basePrice) * 100) : 0,
    manualReason: manual ? (manual.reason || '') : ''
  };
}

function salePriceBadgeV7(b) {
  if (!b) return '';
  if (b.source === 'manual') {
    const cls = b.sign === 'discount' ? 'discount' : b.sign === 'surcharge' ? 'surcharge' : 'manual';
    return `<span class="priceBadge ${cls}">Manual</span>`;
  }
  if (b.source === 'group') return `<span class="priceBadge group">Grupo</span>`;
  return '';
}

function salePriceLabelV7(b) {
  if (!b) return 'Normal';
  if (b.source === 'manual') {
    if (b.sign === 'discount') return `Manual · rebaja ${fmtMoney(b.adjustmentAmount)}`;
    if (b.sign === 'surcharge') return `Manual · recargo ${fmtMoney(b.adjustmentAmount)}`;
    return 'Manual';
  }
  if (b.source === 'group') return `Grupo${b.groupName ? ': ' + b.groupName : ''}`;
  return 'Normal';
}

function openSalePriceEditorV7(options = {}) {
  const p = options.product;
  if (!p) return;
  const current = options.breakdown || buildSalePriceBreakdownV7(p, options);
  const existing = saleManualEntryV7(options.manual) || null;
  openSheet(`
    <h2>Editar precio <span class="x" id="closeSheet">✕</span></h2>
    <div class="v7ProductMini"><div>${p.photo ? `<img src="${p.photo}" alt="" loading="lazy" decoding="async">` : 'NV'}</div><span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.category || 'General')}</small></span></div>
    <div class="manualPriceGrid">
      <div><span>Precio de lista</span><strong>${fmtMoney(current.basePrice)}</strong></div>
      <div><span>Precio por grupo</span><strong>${fmtMoney(current.groupPrice)}</strong></div>
      <div><span>Precio actual</span><strong>${fmtMoney(current.unitPrice)}</strong></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Tipo de ajuste</label><select id="manualMode"><option value="final">Precio final</option><option value="discount_amount">Rebaja Bs</option><option value="discount_percent">Rebaja %</option><option value="surcharge_amount">Recargo Bs</option><option value="surcharge_percent">Recargo %</option></select></div>
      <div class="field"><label>Valor</label><input id="manualValue" type="number" inputmode="decimal" step="0.01" value=""></div>
    </div>
    <div class="field"><label>Precio final manual</label><input id="manualFinal" type="number" inputmode="decimal" step="0.01" value="${existing ? existing.manualPrice : current.unitPrice}"></div>
    <div class="field"><label>Motivo opcional</label><input id="manualReason" value="${escapeHtml(existing ? (existing.reason || '') : '')}" placeholder="Ej.: entrega, cliente antiguo, promoción"></div>
    <div class="v7PricePreview"><span>Diferencia frente al precio de lista</span><strong id="manualDiff"></strong></div>
    <div class="actions two"><button class="btn outline" id="resetManualPrice">Restablecer precio del grupo</button><button class="btn" id="applyManualPrice">Aplicar</button></div>
  `, (overlay, close) => {
    const mode = $('#manualMode', overlay);
    const value = $('#manualValue', overlay);
    const final = $('#manualFinal', overlay);
    const reason = $('#manualReason', overlay);
    if (existing && existing.mode) mode.value = existing.mode;
    if (existing && existing.rawValue != null) value.value = existing.rawValue;
    const reference = current.groupId ? current.groupPrice : current.basePrice;
    function computeFinalFromAdjustment() {
      const v = Number(value.value || 0);
      let next = Number(final.value || 0);
      if (mode.value === 'final') next = Number(final.value || 0);
      if (mode.value === 'discount_amount') next = reference - v;
      if (mode.value === 'discount_percent') next = reference - (reference * v / 100);
      if (mode.value === 'surcharge_amount') next = reference + v;
      if (mode.value === 'surcharge_percent') next = reference + (reference * v / 100);
      if (mode.value !== 'final') final.value = Math.max(0, roundBs(next));
      updateDiff();
    }
    function updateDiff() {
      const price = roundBs(Number(final.value || 0));
      const diff = roundBs(price - current.basePrice);
      const el = $('#manualDiff', overlay);
      if (!el) return;
      if (diff > 0) el.textContent = `Recargo ${fmtMoney(diff)}`;
      else if (diff < 0) el.textContent = `Rebaja ${fmtMoney(Math.abs(diff))}`;
      else el.textContent = 'Sin diferencia';
    }
    $('#closeSheet', overlay).addEventListener('click', close);
    mode.addEventListener('change', () => { if (mode.value === 'final') value.value = ''; computeFinalFromAdjustment(); });
    value.addEventListener('input', computeFinalFromAdjustment);
    final.addEventListener('input', () => { mode.value = 'final'; value.value = ''; updateDiff(); });
    $('#resetManualPrice', overlay).addEventListener('click', () => { if (typeof options.onReset === 'function') options.onReset(); close(); });
    $('#applyManualPrice', overlay).addEventListener('click', () => {
      const manualPrice = roundBs(Number(final.value || 0));
      if (!Number.isFinite(manualPrice) || manualPrice <= 0) return showToast('Ingresa un precio final válido.', 'error');
      const entry = {
        manualPrice,
        mode: mode.value,
        rawValue: value.value === '' ? null : Number(value.value || 0),
        reason: reason.value.trim(),
        basePrice: current.basePrice,
        groupPrice: current.groupPrice,
        groupId: current.groupId || null,
        groupName: current.groupName || '',
        createdAt: Date.now()
      };
      if (typeof options.onApply === 'function') options.onApply(entry);
      close();
    });
    updateDiff();
  });
}

function priceForCurrentMode(p) {
  const b = buildSalePriceBreakdownV7(p, {
    saleType: _saleType,
    groupId: (_saleType === 'market' || _saleType === 'representative_transfer' || sellerMode()) ? _saleSelectedGroup : null,
    manual: _cartPrices[p.id],
    seller: sellerMode()
  });
  return b.unitPrice;
}

function sellerBaseCost(p) {
  return window.resellerEffectiveCost ? resellerEffectiveCost(p) : representativePrice(p);
}

function sellerUnitMargin(p) {
  return roundBs(priceForCurrentMode(p) - sellerBaseCost(p));
}

function manualCountV7() {
  return Object.keys(_cartPrices || {}).filter(id => saleManualEntryV7(_cartPrices[id])).length;
}

function renderVender() {
  $('#fabAdd').classList.add('hidden');
  const main = $('#mainArea');
  if (sellerMode() && !['reseller_unit', 'reseller_wholesale'].includes(_saleType)) _saleType = 'reseller_unit';
  if (AppState.products.length === 0) {
    main.innerHTML = `<div class="empty"><span class="ic">💵</span><h3>No hay productos</h3><p>Actualiza el catálogo o espera a que el administrador cargue productos.</p></div>`;
    return;
  }
  const saleGroups = salePriceGroupsV726();
  const groupsEnabled = AppState.settings.priceGroupsEnabled && saleGroups.length > 0;
  main.innerHTML = `
    ${sellerMode() ? `
      <section class="salesCleanHeader"><div><span class="eyebrow">Ventas</span><h1>Registrar venta</h1></div><small>Puedes negociar precios por producto.</small></section>
      <div class="saletoggle salesChannelToggle cleanSaleToggle"><button data-type="reseller_unit" class="${_saleType === 'reseller_unit' ? 'active' : ''}">Unitaria</button><button data-type="reseller_wholesale" class="${_saleType === 'reseller_wholesale' ? 'active' : ''}">Mayorista</button></div>` : `
      <section class="salesCleanHeader"><div><span class="eyebrow">Ventas</span><h1>Registrar venta</h1></div><small>Precio base, grupo o precio manual por producto.</small></section>
      <div class="saletoggle salesChannelToggle cleanSaleToggle"><button data-type="unit" class="${_saleType === 'unit' ? 'active' : ''}">Unitaria</button><button data-type="market" class="${_saleType === 'market' ? 'active' : ''}">Mayorista</button><button data-type="representative_transfer" class="${_saleType === 'representative_transfer' ? 'active' : ''}">Representantes</button></div>`}
    ${((_saleType === 'market' || _saleType === 'representative_transfer') || sellerMode()) && groupsEnabled ? `
    <div class="field" style="margin-bottom:14px;"><label>Grupo / zona de venta (opcional)</label><select id="s_group"><option value="">Sin grupo / precio base</option>${saleGroupOptionsV726(_saleSelectedGroup || '')}</select><small>Los precios manuales se mantienen como excepción.</small></div>` : ''}
    <div class="toolrow"><input type="text" id="searchInput" placeholder="Buscar producto..." value="${escapeHtml(_saleSearch)}"></div>
    <div class="catalogGrid" id="catalogGrid"></div>
  `;
  $all('.saletoggle button').forEach(b => b.addEventListener('click', () => {
    _saleType = b.dataset.type;
    _cartPrices = {};
    renderVender();
  }));
  const groupSel = $('#s_group');
  if (groupSel) groupSel.addEventListener('change', () => {
    const count = manualCountV7();
    const next = groupSel.value || null;
    if (count > 0) {
      const keep = window.confirm(`Hay ${count} producto(s) con precio manual.\n\nAceptar: mantener precios manuales.\nCancelar: reemplazar todos con el grupo.`);
      if (!keep) _cartPrices = {};
    }
    _saleSelectedGroup = next;
    renderVender();
  });
  $('#searchInput').addEventListener('input', e => { _saleSearch = e.target.value; renderCatalogGrid(); });
  renderCatalogGrid();
  renderCartBar();
}

function renderCatalogGrid() {
  const grid = $('#catalogGrid');
  if (!grid) return;
  const filtered = AppState.products.filter(p => p.status !== 'archived' && matchesSearch(p.name, _saleSearch));
  grid.innerHTML = filtered.map(p => {
    const b = buildSalePriceBreakdownV7(p, {
      saleType: _saleType,
      groupId: (_saleType === 'market' || _saleType === 'representative_transfer' || sellerMode()) ? _saleSelectedGroup : null,
      manual: _cartPrices[p.id],
      seller: sellerMode()
    });
    const qty = _cart[p.id] || 0;
    const low = p.stock <= AppState.settings.lowStockThreshold;
    return `
    <div class="catalogCard cleanSaleCard ${sellerMode() ? 'resellerCatalogCard' : ''} price-${b.source} adjust-${b.sign}" data-id="${p.id}">
      <div class="catalogPhoto cleanSalePhoto">${p.photo ? `<img src="${p.photo}" alt="" loading="lazy" decoding="async">` : '<span class="invPhotoFallback nvLeafMark">NV</span>'}${salePriceBadgeV7(b)}</div>
      <div class="catalogBody cleanSaleBody">
        <div class="catalogMetaLine"><span>${escapeHtml(p.category || 'General')}</span><em>${salePriceLabelV7(b)}</em></div>
        <div class="catalogName">${escapeHtml(p.name)}</div>
        <div class="cleanSaleLine"><span class="catalogPrice cleanSalePrice">${fmtMoney(b.unitPrice)}</span><span class="catalogStock ${low ? 'low' : ''}">Stock: ${p.stock}</span></div>
        ${b.source !== 'normal' ? `<div class="priceTrace">Lista ${fmtMoney(b.basePrice)}${b.source === 'group' ? ` → Grupo ${fmtMoney(b.groupPrice)}` : ` → Final ${fmtMoney(b.unitPrice)}`}</div>` : ''}
        <div class="qtyStepper cleanQtyStepper"><button class="qtyMinus" data-id="${p.id}">−</button><span class="qtyVal" data-id="${p.id}">${qty}</span><button class="qtyPlus" data-id="${p.id}">+</button></div>
        ${qty > 0 ? `<button class="miniEditPrice" data-edit-price="${p.id}">✎ Editar precio</button>` : ''}
      </div>
    </div>`;
  }).join('');
  $all('.qtyPlus', grid).forEach(b => b.addEventListener('click', () => changeQty(b.dataset.id, 1)));
  $all('.qtyMinus', grid).forEach(b => b.addEventListener('click', () => changeQty(b.dataset.id, -1)));
  $all('[data-edit-price]', grid).forEach(b => b.addEventListener('click', () => openCartPriceEditor(b.dataset.editPrice)));
}

function changeQty(productId, delta) {
  const p = AppState.products.find(x => x.id === productId);
  if (!p) return;
  const current = _cart[productId] || 0;
  let next = current + delta;
  if (next < 0) next = 0;
  if (next > p.stock) { showToast(`⚠️ Stock referencial: ${p.stock}`, 'error'); next = p.stock; }
  if (next === 0) { delete _cart[productId]; delete _cartPrices[productId]; }
  else _cart[productId] = next;
  renderCatalogGrid();
  renderCartBar();
}

function openCartPriceEditor(productId) {
  const p = AppState.products.find(x => x.id === productId);
  if (!p || !_cart[productId]) return showToast('Agrega primero el producto al carrito.', 'error');
  const groupId = (_saleType === 'market' || _saleType === 'representative_transfer' || sellerMode()) ? _saleSelectedGroup : null;
  const breakdown = buildSalePriceBreakdownV7(p, { saleType: _saleType, groupId, manual: _cartPrices[p.id], seller: sellerMode() });
  openSalePriceEditorV7({
    product: p,
    breakdown,
    manual: _cartPrices[p.id],
    onApply: entry => { _cartPrices[p.id] = entry; renderCatalogGrid(); renderCartBar(); showToast('Precio manual aplicado.'); },
    onReset: () => { delete _cartPrices[p.id]; renderCatalogGrid(); renderCartBar(); showToast('Precio restablecido.'); }
  });
}

function renderCartBar() {
  let bar = $('#cartBar');
  const count = cartCount();
  if (!bar) { bar = document.createElement('div'); bar.id = 'cartBar'; bar.className = 'cartBar'; document.getElementById('app').appendChild(bar); }
  if (count === 0) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const total = Object.entries(_cart).reduce((s, [id, qty]) => {
    const p = AppState.products.find(x => x.id === id);
    return s + (p ? priceForCurrentMode(p) * qty : 0);
  }, 0);
  const manual = manualCountV7();
  bar.innerHTML = `<div class="cartBarInfo"><span class="cartCount">${count} ítem(s)${manual ? ` · ${manual} manual` : ''}</span><span class="cartTotal">${fmtMoney(total)}</span></div><button class="btn" id="goToCheckout">Continuar</button>`;
  $('#goToCheckout', bar).addEventListener('click', openCheckoutSheet);
}

function buildSaleItemsFromCartV7(items) {
  return items.map(it => {
    const product = it.product;
    const groupId = (_saleType === 'market' || _saleType === 'representative_transfer' || sellerMode()) ? _saleSelectedGroup : null;
    const b = buildSalePriceBreakdownV7(product, { saleType: _saleType, groupId, manual: _cartPrices[product.id], seller: sellerMode() });
    const resellerBase = representativePrice(product);
    const resellerRealCost = sellerMode() ? sellerBaseCost(product) : resellerBase;
    const unitCost = sellerMode() ? resellerRealCost : grossCost(product);
    const sellerUnitProfit = sellerMode() ? (b.unitPrice - resellerRealCost) : 0;
    return {
      productId: product.id,
      productName: product.name,
      category: product.category || 'General',
      qty: it.qty,
      unitCost,
      resellerBase,
      suggestedPublicPrice: publicPrice(product),
      marketPrice: marketPrice(product),
      representativePrice: representativePrice(product),
      resellerRealCost,
      resellerSaleChannel: sellerMode() ? _saleType : null,
      originalUnitPrice: b.basePrice,
      groupUnitPrice: b.groupPrice,
      manualUnitPrice: b.manual ? b.unitPrice : null,
      unitPrice: b.unitPrice,
      priceSource: b.source,
      priceAdjustmentType: b.sign,
      priceAdjustmentAmount: b.adjustmentAmount,
      priceAdjustmentSigned: b.adjustmentSigned,
      priceAdjustmentPercent: b.adjustmentPercent,
      manualPriceReason: b.manualReason || '',
      groupId: b.groupId,
      groupName: b.groupName,
      subtotal: roundBs(b.unitPrice * it.qty),
      originalSubtotal: roundBs(b.basePrice * it.qty),
      groupSubtotal: roundBs(b.groupPrice * it.qty),
      discountAmount: b.adjustmentSigned < 0 ? roundBs(Math.abs(b.adjustmentSigned) * it.qty) : 0,
      surchargeAmount: b.adjustmentSigned > 0 ? roundBs(b.adjustmentSigned * it.qty) : 0,
      profit: roundBs((b.unitPrice - unitCost) * it.qty),
      sellerUnitProfit,
      sellerProfit: roundBs(sellerUnitProfit * it.qty)
    };
  });
}

function openCheckoutSheet() {
  if (window.canOperate && !canOperate()) { showToast('Tu cuenta aún no fue aprobada por el administrador. No puedes registrar ventas.', 'error'); return; }
  const rawItems = Object.entries(_cart).map(([id, qty]) => ({ product: AppState.products.find(x => x.id === id), qty: Number(qty || 0) })).filter(i => i.product && i.qty > 0);
  if (!rawItems.length) return showToast('Selecciona al menos un producto.', 'error');
  const saleItemsPreview = buildSaleItemsFromCartV7(rawItems);
  const total = saleItemsPreview.reduce((sum, item) => sum + item.subtotal, 0);
  const sellerProfit = sellerMode() ? saleItemsPreview.reduce((sum, item) => sum + Number(item.sellerProfit || 0), 0) : 0;
  const discounts = saleItemsPreview.reduce((s, i) => s + Number(i.discountAmount || 0), 0);
  const surcharges = saleItemsPreview.reduce((s, i) => s + Number(i.surchargeAmount || 0), 0);
  const operation = { id: uid('sale'), documentNumber: '', client: null, sale: null, submitting: false };
  const html = `
    <h2>Confirmar venta <span class="x" id="closeSheet">✕</span></h2>
    <div class="sectiontitle2"><span>Productos (${saleItemsPreview.length})</span></div>
    ${saleItemsPreview.map(i => `<div class="histitem priceLine ${i.priceSource}"><div class="l"><div class="pname">${escapeHtml(i.productName)} ${salePriceBadgeV7({source:i.priceSource, sign:i.priceAdjustmentType})}</div><div class="meta">${i.qty} × ${fmtMoney(i.unitPrice)} · ${salePriceLabelV7({source:i.priceSource, sign:i.priceAdjustmentType, adjustmentAmount:i.priceAdjustmentAmount, groupName:i.groupName})}</div>${i.manualPriceReason ? `<small class="priceReason">${escapeHtml(i.manualPriceReason)}</small>` : ''}</div><div class="r">${fmtMoney(i.subtotal)}</div></div>`).join('')}
    ${(discounts || surcharges) ? `<div class="priceSummaryBox"><span>Rebajas: <b>${fmtMoney(discounts)}</b></span><span>Recargos: <b>${fmtMoney(surcharges)}</b></span></div>` : ''}
    <div class="sectiontitle2"><span>Datos del cliente</span></div>
    <div class="field"><label>Nombre del cliente</label><div class="clientInputRow"><input type="text" id="ck_clientname" autocomplete="off" placeholder="Ej: Juan Pérez" value="${AppState.lastClient ? escapeHtml(AppState.lastClient.name) : ''}"><button type="button" class="miniClientPick" id="pickClientV723">▾</button></div><small>${(_saleType === 'market' || _saleType === 'representative_transfer') ? 'Se muestran primero mayoristas, mixtos y sin clasificar.' : 'Se muestran primero clientes unitarios, mixtos y sin clasificar.'}</small></div>
    <div class="field"><label>Número de teléfono</label><div class="clientInputRow"><input type="tel" inputmode="tel" id="ck_clientphone" autocomplete="off" placeholder="Ej: 71234567" value="${AppState.lastClient ? escapeHtml(AppState.lastClient.phone || '') : ''}"><button type="button" class="waIconBtnV723" id="ckClientWaV723"><span class="waLogoV725">☎</span></button></div></div>
    ${(_saleType === 'market') ? `<button type="button" class="btn outline block" id="registerWholesaleV725">Registrar datos de mayorista</button>` : ''}
    <div class="totalbox"><span class="lbl">Total a cobrar</span><span class="val">${fmtMoney(total)}</span></div>
    <div class="field-row"><div class="field"><label>Monto pagado ahora</label><input id="ck_amountPaid" type="number" inputmode="decimal" step="0.01" value="${total}"></div><div class="field"><label>Saldo pendiente</label><input id="ck_pendingBalance" readonly value="0"></div></div>
    <div class="field"><label>Motivo si queda saldo pendiente</label><input id="ck_pendingReason" placeholder="Ej.: faltó cambio, transferencia pendiente, saldo por cobrar"></div>
    <div class="v7CashNotice">Si el pago queda incompleto, la venta se registrará y aparecerá en Ventas por cobrar.</div>
    <div class="v7CashNotice">La operación usa un identificador único. Si se corta la conexión, se verificará primero si la venta ya quedó guardada para evitar duplicarla.</div>
    <div class="actions stickyActions"><button class="btn block" id="confirmSale">Confirmar venta y generar recibo</button></div>`;
  openSheet(html, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', () => { if (!operation.submitting) close(); });
    const fillClientV723 = (c) => {
      if (!c) return;
      operation.client = c;
      $('#ck_clientname', overlay).value = c.name || '';
      $('#ck_clientphone', overlay).value = c.phone || '';
      if (c.priceGroupId && (_saleType === 'market' || _saleType === 'representative_transfer' || sellerMode()) && c.priceGroupId !== _saleSelectedGroup) {
        const g = saleFindGroupV726(c.priceGroupId);
        if (g && window.confirm(`Este cliente tiene beneficio/grupo: ${g.name}. ¿Aplicarlo a esta venta?`)) {
          _saleSelectedGroup = c.priceGroupId;
          close();
          setTimeout(openCheckoutSheet, 80);
        }
      }
    };
    $('#pickClientV723', overlay).addEventListener('click', () => openClientSelectorSheet({ saleType: _saleType, onSelect: fillClientV723 }));
    if ($('#registerWholesaleV725', overlay)) $('#registerWholesaleV725', overlay).addEventListener('click', () => { window._afterClientSaved = fillClientV723; openClientForm(null, { name: $('#ck_clientname', overlay).value.trim(), phone: $('#ck_clientphone', overlay).value.trim(), customerType: 'wholesale' }); });
    $('#ckClientWaV723', overlay).addEventListener('click', () => openWhatsAppV723($('#ck_clientphone', overlay).value, $('#ck_clientname', overlay).value));
    const updatePaymentV725 = () => { const paid = Math.max(0, Number($('#ck_amountPaid', overlay).value || 0)); $('#ck_pendingBalance', overlay).value = roundBs(Math.max(0, total - paid)); };
    $('#ck_amountPaid', overlay).addEventListener('input', updatePaymentV725); updatePaymentV725();
    $('#ck_clientname', overlay).addEventListener('blur', () => {
      const name = $('#ck_clientname', overlay).value.trim();
      const existing = AppState.clients.find(c => normalizeSearch(c.name) === normalizeSearch(name));
      if (existing) fillClientV723(existing);
    });
    $('#confirmSale', overlay).addEventListener('click', async () => {
      if (operation.submitting) return;
      const btn = $('#confirmSale', overlay);
      const clientName = $('#ck_clientname', overlay).value.trim();
      const clientPhone = $('#ck_clientphone', overlay).value.trim();
      if (!clientName) return showToast('⚠️ Ingresa el nombre del cliente', 'error');
      if (!navigator.onLine) return showToast('Sin internet. La venta no fue registrada.', 'error');
      operation.submitting = true; btn.disabled = true; btn.textContent = 'Verificando stock y guardando…';
      try {
        const refresh = await syncCloudProductsToLocal();
        if (refresh && refresh.ok === false) throw new Error(refresh.message);
        for (const item of rawItems) {
          const current = AppState.products.find(product => product.id === item.product.id);
          if (!current || Number(current.stock || 0) < Number(item.qty || 0)) throw new Error(`Stock insuficiente para ${item.product.name}. Actualiza la venta y vuelve a intentarlo.`);
        }
        if (!operation.client) operation.client = await findOrCreateClientQuick(clientName, clientPhone, customerTypeForSaleV723(_saleType));
        if (!operation.documentNumber) {
          const result = window.nextDocumentNumberV7 ? await nextDocumentNumberV7('NV-VTA') : { ok: false, message: 'No está disponible la numeración V7.' };
          if (!result.ok) throw new Error(result.message || 'No se pudo generar el número de recibo.');
          operation.documentNumber = result.number;
        }
        if (!operation.sale) {
          const groupName = _saleSelectedGroup ? (saleGroupInfoV7(_saleSelectedGroup) || {}).name : null;
          const paidNow = roundBs(Math.min(total, Math.max(0, Number($('#ck_amountPaid', overlay).value || 0))));
          const pendingNow = roundBs(Math.max(0, total - paidNow));
          const saleItems = buildSaleItemsFromCartV7(rawItems);
          operation.sale = {
            id: operation.id,
            documentNumber: operation.documentNumber,
            receiptNumber: operation.documentNumber,
            paymentMethod: 'cash',
            paymentStatus: pendingNow > 0 ? (paidNow > 0 ? 'partial' : 'pending') : 'paid',
            amountPaid: paidNow,
            pendingBalance: pendingNow,
            pendingReason: pendingNow > 0 ? $('#ck_pendingReason', overlay).value.trim() : '',
            type: _saleType,
            role: AppState.session ? AppState.session.roleName : '',
            sellerId: AppState.session ? (AppState.session.onlineUserId || AppState.session.userId) : null,
            sellerName: AppState.session ? AppState.session.fullName : null,
            sellerBusinessName: window.myCommercialProfile ? (myCommercialProfile().businessName || '') : '',
            sellerQrUrl: window.myCommercialProfile ? (myCommercialProfile().qrUrl || '') : '',
            sellerReceiptMessage: window.myCommercialProfile ? (myCommercialProfile().receiptMessage || '') : '',
            groupId: (_saleType === 'market' || _saleType === 'representative_transfer' || sellerMode()) ? _saleSelectedGroup : null,
            groupName: (_saleType === 'market' || _saleType === 'representative_transfer' || sellerMode()) ? groupName : null,
            items: saleItems,
            total: saleItems.reduce((sum, item) => sum + item.subtotal, 0),
            originalTotal: saleItems.reduce((sum, item) => sum + item.originalSubtotal, 0),
            discountTotal: saleItems.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0),
            surchargeTotal: saleItems.reduce((sum, item) => sum + Number(item.surchargeAmount || 0), 0),
            sellerProfit,
            clientId: operation.client ? operation.client.id : null,
            clientName: operation.client ? operation.client.name : clientName,
            clientPhone: operation.client ? operation.client.phone : clientPhone,
            customerType: operation.client ? (operation.client.customerType || customerTypeForSaleV723(_saleType)) : customerTypeForSaleV723(_saleType),
            clientCity: operation.client ? (operation.client.city || '') : '',
            clientAddress: operation.client ? (operation.client.address || '') : '',
            clientBusinessName: operation.client ? (operation.client.businessName || '') : '',
            date: Date.now(),
            syncStatus: 'cloud'
          };
        }
        await DB.put('sales', operation.sale);
        await Promise.all([syncCloudProductsToLocal().catch(() => null), window.syncCloudSalesToLocal ? syncCloudSalesToLocal().catch(() => null) : Promise.resolve()]);
        if (!AppState.sales.some(x => x.id === operation.sale.id)) AppState.sales.push(operation.sale);
        await writeAudit('sale:create', 'sales', operation.sale.id, null, operation.sale).catch(() => {});
        showToast('Venta registrada en Supabase.');
        close();
        if (window.openV7ReceiptPreview) openV7ReceiptPreview(operation.sale, 'sale'); else openReceiptPreview(operation.sale);
        _cart = {}; _cartPrices = {}; renderVender();
      } catch (err) {
        operation.submitting = false; btn.disabled = false; btn.textContent = 'Reintentar la misma operación';
        const message = window.messageFromError ? messageFromError(err, 'No se pudo registrar la venta.') : (err.message || 'No se pudo registrar la venta.');
        showToast(message, 'error');
      }
    });
  });
}

function startSaleWithProduct(productId) {
  AppState.currentTab = 'vender';
  _cart = { [productId]: 1 };
  render();
}

Object.assign(window, {
  renderVender,
  startSaleWithProduct,
  applyPercentGroupV7: applyPercentGroup,
  buildSalePriceBreakdownV7,
  openSalePriceEditorV7,
  salePriceBadgeV7,
  salePriceLabelV7
});
