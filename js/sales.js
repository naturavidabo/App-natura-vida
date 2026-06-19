/* sales.js — Flujo de venta: producto → cantidad → (grupo si mayorista) → cliente → guardar.
   Cascada de precios: público (unitaria) → mayorista base (público - % desc. general) → grupo ajusta sobre el mayorista. */

let _saleType = 'unit';
let _saleSelectedProduct = null;
let _saleSelectedGroup = null;
let _saleSearch = '';

function renderVender() {
  $('#fabAdd').classList.add('hidden');
  const main = $('#mainArea');

  if (AppState.products.length === 0) {
    main.innerHTML = `<div class="empty"><span class="ic">💵</span><h3>No hay productos</h3><p>Agrega productos en Inventario antes de registrar ventas.</p></div>`;
    return;
  }

  let html = `
    <div class="saletoggle">
      <button data-type="unit" class="${_saleType === 'unit' ? 'active' : ''}">Venta unitaria</button>
      <button data-type="wholesale" class="${_saleType === 'wholesale' ? 'active' : ''}">Venta al mayor</button>
    </div>
    <div class="toolrow">
      <input type="text" id="searchInput" placeholder="Buscar producto..." value="${escapeHtml(_saleSearch)}">
    </div>
    <div class="sectiontitle">Selecciona producto</div>
    <div class="selectprod" id="selectProdList"></div>
    <div id="saleFormArea"></div>
  `;
  main.innerHTML = html;

  $all('.saletoggle button').forEach(b => b.addEventListener('click', () => {
    _saleType = b.dataset.type;
    _saleSelectedGroup = null;
    renderVender();
  }));
  $('#searchInput').addEventListener('input', e => { _saleSearch = e.target.value; renderProdSelectList(); });

  renderProdSelectList();
  if (_saleSelectedProduct) renderSaleForm();
}

function renderProdSelectList() {
  const list = $('#selectProdList');
  if (!list) return;
  const filtered = AppState.products.filter(p => matchesSearch(p.name, _saleSearch));
  list.innerHTML = filtered.map(p => {
    const refPrice = _saleType === 'unit' ? (p.publicPrice || 0) : wholesaleBasePrice(p);
    return `
    <div class="row ${_saleSelectedProduct === p.id ? 'selected' : ''}" data-id="${p.id}">
      <div class="thumb">${p.photo ? `<img src="${p.photo}" alt="">` : ''}</div>
      <div class="pname">${escapeHtml(p.name)}</div>
      <div class="pprice">${fmtMoney(refPrice)} · stock: ${p.stock}</div>
    </div>`;
  }).join('');
  $all('.row', list).forEach(r => r.addEventListener('click', () => {
    _saleSelectedProduct = r.dataset.id;
    renderProdSelectList();
    renderSaleForm();
  }));
}

function renderSaleForm() {
  const p = AppState.products.find(x => x.id === _saleSelectedProduct);
  const area = $('#saleFormArea');
  if (!area) return;
  if (!p) { area.innerHTML = ''; return; }

  const groupsEnabled = AppState.settings.priceGroupsEnabled && AppState.priceGroups.length > 0;
  const wholesaleBase = wholesaleBasePrice(p);

  let suggestedPrice;
  let noteText;
  if (_saleType === 'unit') {
    suggestedPrice = p.publicPrice || 0;
    noteText = 'Precio al público';
  } else {
    if (groupsEnabled && _saleSelectedGroup) {
      suggestedPrice = priceForGroup(p, _saleSelectedGroup);
      noteText = `Precio mayorista (${fmtMoney(wholesaleBase)}) + grupo seleccionado`;
    } else {
      suggestedPrice = wholesaleBase;
      noteText = `Precio mayorista general (público −${p.wholesaleDiscountPct || 0}%)`;
    }
  }

  area.innerHTML = `
    <div class="sectiontitle">${_saleType === 'unit' ? 'Detalle — venta unitaria' : 'Detalle — venta al mayor'}</div>
    <div class="saleform">

      ${_saleType === 'wholesale' && groupsEnabled ? `
      <div class="field">
        <label>Grupo / zona de venta (descuento adicional opcional)</label>
        <select id="s_group">
          <option value="">Sin grupo adicional (solo precio mayorista general)</option>
          ${AppState.priceGroups.map(g => `<option value="${g.id}" ${_saleSelectedGroup === g.id ? 'selected' : ''}>${escapeHtml(g.name)} (${g.mode === 'discount' ? '−' : '+'}${g.percent}% sobre mayorista)</option>`).join('')}
        </select>
      </div>` : ''}

      <div class="suggestedPrice">
        <div class="lbl">Precio sugerido</div>
        <div class="val">${fmtMoney(suggestedPrice)}</div>
        <div class="note">${noteText}</div>
      </div>

      <div class="field-row">
        <div class="field money">
          <label>Precio a cobrar (editable)</label>
          <input type="number" inputmode="decimal" step="0.01" id="s_price" value="${suggestedPrice.toFixed(2)}">
        </div>
        <div class="field money">
          <label>Cantidad (unidades)</label>
          <input type="number" inputmode="numeric" step="1" id="s_qty" placeholder="1" value="1">
        </div>
      </div>

      <div class="sectiontitle2"><span>Datos del cliente</span></div>
      <div class="field">
        <label>Nombre del cliente</label>
        <input type="text" id="s_clientname" placeholder="Ej: Juan Pérez" value="${AppState.lastClient ? escapeHtml(AppState.lastClient.name) : ''}" list="clientSuggestions">
        <datalist id="clientSuggestions">
          ${AppState.clients.map(c => `<option value="${escapeHtml(c.name)}">`).join('')}
        </datalist>
      </div>
      <div class="field">
        <label>Número de teléfono</label>
        <input type="tel" inputmode="tel" id="s_clientphone" placeholder="Ej: 71234567" value="${AppState.lastClient ? escapeHtml(AppState.lastClient.phone || '') : ''}">
      </div>

      <div class="totalbox">
        <span class="lbl">Total a cobrar</span>
        <span class="val" id="s_total">${fmtMoney(0)}</span>
      </div>
      <button class="btn block" id="confirmSale">✔ Registrar venta y descontar stock</button>
    </div>
  `;

  const groupSel = $('#s_group');
  if (groupSel) {
    groupSel.addEventListener('change', () => {
      _saleSelectedGroup = groupSel.value || null;
      renderSaleForm();
    });
  }

  function calcTotal() {
    const price = parseFloat($('#s_price').value) || 0;
    const qty = parseInt($('#s_qty').value) || 0;
    $('#s_total').textContent = fmtMoney(price * qty);
  }
  $('#s_price').addEventListener('input', calcTotal);
  $('#s_qty').addEventListener('input', calcTotal);

  $('#s_clientname').addEventListener('input', () => {
    const name = $('#s_clientname').value.trim();
    const existing = AppState.clients.find(c => normalizeSearch(c.name) === normalizeSearch(name));
    if (existing && !$('#s_clientphone').value) {
      $('#s_clientphone').value = existing.phone || '';
    }
  });

  $('#confirmSale').addEventListener('click', async () => {
    const price = parseFloat($('#s_price').value) || 0;
    const qty = parseInt($('#s_qty').value) || 0;
    const clientName = $('#s_clientname').value.trim();
    const clientPhone = $('#s_clientphone').value.trim();

    if (price <= 0 || qty <= 0) { showToast('⚠️ Ingresa precio y cantidad válidos', 'error'); return; }
    if (!clientName) { showToast('⚠️ Ingresa el nombre del cliente', 'error'); return; }
    if (qty > p.stock) {
      if (!confirmDialog(`Solo hay ${p.stock} unidades en stock y esta venta requiere ${qty}. ¿Registrar de todas formas?`)) return;
    }

    const client = findOrCreateClientQuick(clientName, clientPhone);

    p.stock -= qty;
    await DB.put('products', p);

    const sale = {
      id: uid('sale'),
      productId: p.id,
      productName: p.name,
      type: _saleType,
      groupId: _saleType === 'wholesale' ? _saleSelectedGroup : null,
      groupName: _saleSelectedGroup ? (AppState.priceGroups.find(g => g.id === _saleSelectedGroup) || {}).name : null,
      qty, unitPrice: price, total: price * qty,
      clientId: client ? client.id : null,
      clientName, clientPhone,
      date: Date.now()
    };
    AppState.sales.push(sale);
    await DB.put('sales', sale);

    showToast('✔ Venta registrada — stock actualizado');
    openReceiptPreview(sale, p);

    _saleSelectedProduct = null;
    _saleSelectedGroup = null;
    renderVender();
  });

  calcTotal();
}

window.renderVender = renderVender;
