/* products.js — Gestión de productos: insumos, costo neto automático, fotos, stock.
   Precios: % ganancia unitaria y % ganancia por mayor son INDEPENDIENTES, ambos calculados
   directo sobre el costo neto (no en cascada). Los grupos de precio ajustan ADEMÁS sobre
   el precio mayorista ya calculado. */

let _prodSearch = '';

function unitPrice(product) {
  const cost = grossCost(product);
  const pct = Number(product.unitMarkupPct) || 0;
  return cost + (cost * pct / 100);
}
function wholesalePrice(product) {
  const cost = grossCost(product);
  const pct = Number(product.wholesaleMarkupPct) || 0;
  return cost + (cost * pct / 100);
}
window.unitPrice = unitPrice;
window.wholesalePrice = wholesalePrice;

function renderInventario() {
  $('#fabAdd').classList.remove('hidden');
  $('#fabAdd').onclick = () => openProductForm(null);
  const main = $('#mainArea');

  const lowThreshold = AppState.settings.lowStockThreshold;
  let html = `
    <div class="toolrow">
      <input type="text" id="searchInput" placeholder="Buscar producto..." value="${escapeHtml(_prodSearch)}">
    </div>
  `;

  const filtered = AppState.products.filter(p => matchesSearch(p.name, _prodSearch));

  if (filtered.length === 0) {
    html += `
      <div class="empty">
        <span class="ic">🌿</span>
        <h3>${AppState.products.length === 0 ? 'Aún no hay productos' : 'Sin resultados'}</h3>
        <p>${AppState.products.length === 0 ? 'Toca el botón + para registrar tu primer producto.' : 'Intenta con otro término de búsqueda.'}</p>
      </div>`;
  } else {
    html += `<div class="invGrid">`;
    filtered.slice().reverse().forEach(p => {
      const low = p.stock <= lowThreshold;
      const uPrice = unitPrice(p);
      const wPrice = wholesalePrice(p);
      html += `
      <div class="invCard" data-id="${p.id}">
        <div class="invPhoto">${p.photo ? `<img src="${p.photo}" alt="">` : '<span class="invPhotoFallback">🌿</span>'}</div>
        <div class="invBody">
          <div class="invName">${escapeHtml(p.name)}</div>
          <span class="pill ${low ? 'low' : 'ok'}" style="margin-top:5px;">${low ? '⚠ bajo' : 'stock'} · ${p.stock}</span>
          <div class="invPrices">
            <div class="invPriceBox"><span class="lbl">Unitario</span><span class="val">${fmtMoney(uPrice)}</span></div>
            <div class="invPriceBox alt"><span class="lbl">Mayor</span><span class="val">${fmtMoney(wPrice)}</span></div>
          </div>
        </div>
        <div class="invActions">
          <button class="editBtn" data-id="${p.id}">✏️ Editar</button>
          <button class="danger delBtn" data-id="${p.id}">🗑️</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  main.innerHTML = html;
  $('#searchInput').addEventListener('input', e => { _prodSearch = e.target.value; renderInventario(); });
  $all('.editBtn').forEach(b => b.addEventListener('click', () => openProductForm(b.dataset.id)));
  $all('.delBtn').forEach(b => b.addEventListener('click', () => confirmDeleteProduct(b.dataset.id)));
}

function confirmDeleteProduct(id) {
  const p = AppState.products.find(x => x.id === id);
  if (!p) return;
  if (confirmDialog(`¿Eliminar "${p.name}" del inventario? Esta acción no se puede deshacer.`)) {
    AppState.products = AppState.products.filter(x => x.id !== id);
    DB.delete('products', id);
    renderInventario();
    showToast('Producto eliminado');
  }
}

function openProductForm(id) {
  const p = id ? AppState.products.find(x => x.id === id) : null;
  let insumos = p ? JSON.parse(JSON.stringify(p.insumos || [])) : [{ name: '', unit: 'ml', unitCost: '', qtyUsed: '' }];
  if (insumos.length === 0) insumos = [{ name: '', unit: 'ml', unitCost: '', qtyUsed: '' }];

  const html = `
    <h2>${p ? 'Editar producto' : 'Nuevo producto'} <span class="x" id="closeSheet">✕</span></h2>

    <div class="field">
      <label>Fotografía (desde galería o cámara)</label>
      <label class="photopick" id="photoPick">
        <input type="file" id="photoInput" accept="image/*">
        <span id="photoPlaceholder" class="${p && p.photo ? 'hidden' : ''}">
          <span class="ic" style="display:block;text-align:center;">📷</span>
          <span style="display:block;text-align:center;">Tocar para elegir foto</span>
        </span>
        <img id="photoPreview" src="${p && p.photo ? p.photo : ''}" alt="" class="${p && p.photo ? '' : 'hidden'}">
      </label>
    </div>

    <div class="field">
      <label>Nombre del producto</label>
      <input type="text" id="f_name" placeholder="Ej: Aceite de coco 200ml" value="${p ? escapeHtml(p.name) : ''}">
    </div>

    <div class="field">
      <label>Descripción</label>
      <input type="text" id="f_desc" placeholder="Breve descripción" value="${p ? escapeHtml(p.description || '') : ''}">
    </div>

    <div class="sectiontitle2"><span>Insumos / componentes</span></div>
    <div id="insumosList"></div>
    <button type="button" class="addInsumoBtn" id="addInsumoBtn">+ Agregar insumo</button>

    <div class="field-row" style="margin-top:14px;">
      <div class="field">
        <label>Cantidad final del envase</label>
        <input type="number" inputmode="decimal" step="0.01" id="f_finalqty" placeholder="Ej: 250" value="${p && p.finalQty ? p.finalQty : ''}">
      </div>
      <div class="field">
        <label>Unidad final</label>
        <input type="text" id="f_finalunit" placeholder="ml, gr, u." value="${p && p.finalUnit ? escapeHtml(p.finalUnit) : 'ml'}">
      </div>
    </div>

    <div class="costSummary">
      <span class="lbl">Costo total neto</span>
      <span class="val" id="grossVal">Bs 0.00</span>
    </div>

    <div class="sectiontitle2"><span>Precios de venta</span></div>
    <div class="field-row">
      <div class="field">
        <label>% ganancia unitaria</label>
        <input type="number" inputmode="decimal" step="1" id="f_unitpct" placeholder="Ej: 40" value="${p && p.unitMarkupPct != null ? p.unitMarkupPct : ''}">
      </div>
      <div class="field">
        <label>% ganancia por mayor</label>
        <input type="number" inputmode="decimal" step="1" id="f_wholesalepct" placeholder="Ej: 20" value="${p && p.wholesaleMarkupPct != null ? p.wholesaleMarkupPct : ''}">
      </div>
    </div>
    <div class="field-row">
      <div class="costSummary" style="flex:1;">
        <span class="lbl">Precio unitario</span>
        <span class="val" id="unitPriceVal">Bs 0.00</span>
      </div>
      <div class="costSummary" style="flex:1;">
        <span class="lbl">Precio mayor</span>
        <span class="val" id="wholesaleVal">Bs 0.00</span>
      </div>
    </div>
    <p style="font-size:11px; color:var(--gray); margin:8px 0 0; line-height:1.5;">
      Ambos porcentajes se calculan de forma independiente sobre el costo neto. Si activas
      grupos de precio, cada grupo aplicará su propio ajuste ADEMÁS sobre el precio mayor.
    </p>

    <div class="field-row" style="margin-top:14px;">
      <div class="field">
        <label>Fecha de ingreso</label>
        <input type="date" id="f_entrydate" value="${p && p.entryDate ? p.entryDate : todayISO()}">
      </div>
      <div class="field">
        <label>Stock inicial / actual</label>
        <input type="number" inputmode="numeric" step="1" id="f_stock" placeholder="0" value="${p ? p.stock : ''}">
      </div>
    </div>

    <div class="actions">
      <button class="btn outline block" id="cancelForm">Cancelar</button>
      <button class="btn block" id="saveForm">${p ? 'Guardar cambios' : 'Crear producto'}</button>
    </div>
  `;

  openSheet(html, (overlay, close) => {
    const insumosListEl = $('#insumosList', overlay);

    function renderInsumos() {
      insumosListEl.innerHTML = insumos.map((ins, idx) => `
        <div class="insumo-row" data-idx="${idx}">
          <input type="text" class="insumo-name" placeholder="Nombre insumo" value="${escapeHtml(ins.name)}">
          <input type="text" class="insumo-unit" placeholder="ud." value="${escapeHtml(ins.unit || '')}">
          <input type="number" inputmode="decimal" step="0.01" class="insumo-cost" placeholder="Costo/ud" value="${ins.unitCost}">
          <input type="number" inputmode="decimal" step="0.01" class="insumo-qty" placeholder="Cant. usada" value="${ins.qtyUsed}">
          <button type="button" class="insumo-del" data-idx="${idx}">✕</button>
        </div>
      `).join('');
      $all('.insumo-name', insumosListEl).forEach((inp, idx) => inp.addEventListener('input', () => { insumos[idx].name = inp.value; }));
      $all('.insumo-unit', insumosListEl).forEach((inp, idx) => inp.addEventListener('input', () => { insumos[idx].unit = inp.value; }));
      $all('.insumo-cost', insumosListEl).forEach((inp, idx) => inp.addEventListener('input', () => { insumos[idx].unitCost = inp.value; updateAll(); }));
      $all('.insumo-qty', insumosListEl).forEach((inp, idx) => inp.addEventListener('input', () => { insumos[idx].qtyUsed = inp.value; updateAll(); }));
      $all('.insumo-del', insumosListEl).forEach(btn => btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (insumos.length <= 1) insumos[0] = { name: '', unit: 'ml', unitCost: '', qtyUsed: '' };
        else insumos.splice(idx, 1);
        renderInsumos();
        updateAll();
      }));
    }

    function currentGross() {
      return insumos.reduce((s, i) => s + ((parseFloat(i.qtyUsed) || 0) * (parseFloat(i.unitCost) || 0)), 0);
    }

    function updateAll() {
      const g = currentGross();
      $('#grossVal', overlay).textContent = fmtMoney(g);
      const unitPct = parseFloat($('#f_unitpct', overlay).value) || 0;
      const wholesalePct = parseFloat($('#f_wholesalepct', overlay).value) || 0;
      $('#unitPriceVal', overlay).textContent = fmtMoney(g + (g * unitPct / 100));
      $('#wholesaleVal', overlay).textContent = fmtMoney(g + (g * wholesalePct / 100));
    }

    renderInsumos();
    updateAll();
    $('#f_unitpct', overlay).addEventListener('input', updateAll);
    $('#f_wholesalepct', overlay).addEventListener('input', updateAll);

    $('#addInsumoBtn', overlay).addEventListener('click', () => {
      insumos.push({ name: '', unit: 'ml', unitCost: '', qtyUsed: '' });
      renderInsumos();
      updateAll();
    });

    let photoData = p ? (p.photo || null) : null;
    $('#photoInput', overlay).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        photoData = await readImageFile(file);
        $('#photoPreview', overlay).src = photoData;
        $('#photoPreview', overlay).classList.remove('hidden');
        $('#photoPlaceholder', overlay).classList.add('hidden');
      } catch (err) {
        showToast('⚠️ ' + err.message, 'error');
      }
    });

    $('#closeSheet', overlay).addEventListener('click', close);
    $('#cancelForm', overlay).addEventListener('click', close);

    $('#saveForm', overlay).addEventListener('click', async () => {
      const name = $('#f_name', overlay).value.trim();
      if (!name) { showToast('⚠️ Ponle un nombre al producto', 'error'); return; }

      const cleanInsumos = insumos
        .filter(i => i.name.trim() || (parseFloat(i.unitCost) || 0) > 0)
        .map(i => ({ name: i.name.trim(), unit: (i.unit || '').trim(), unitCost: parseFloat(i.unitCost) || 0, qtyUsed: parseFloat(i.qtyUsed) || 0 }));

      const data = {
        id: p ? p.id : uid('prod'),
        name,
        description: $('#f_desc', overlay).value.trim(),
        insumos: cleanInsumos,
        finalQty: parseFloat($('#f_finalqty', overlay).value) || 0,
        finalUnit: $('#f_finalunit', overlay).value.trim() || 'u.',
        unitMarkupPct: parseFloat($('#f_unitpct', overlay).value) || 0,
        wholesaleMarkupPct: parseFloat($('#f_wholesalepct', overlay).value) || 0,
        entryDate: $('#f_entrydate', overlay).value || todayISO(),
        stock: parseInt($('#f_stock', overlay).value) || 0,
        photo: photoData,
        createdAt: p ? p.createdAt : Date.now()
      };

      await DB.put('products', data);
      if (p) {
        const idx = AppState.products.findIndex(x => x.id === p.id);
        AppState.products[idx] = data;
      } else {
        AppState.products.push(data);
      }
      close();
      renderInventario();
      showToast(p ? 'Producto actualizado' : 'Producto creado');
    });
  });
}

window.renderInventario = renderInventario;
window.openProductForm = openProductForm;
