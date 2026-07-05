/* products.js — Inventario comercial avanzado para NATURA VIDA.
   Modelo V2: nombre, categoría, costo, precio revendedor, precio público, stock,
   descripción, fotografía, SKU, estado y trazabilidad local para futura nube. */

let _prodSearch = '';

const DEFAULT_CATEGORIES = [
  'General', 'Cosmética natural', 'Cuidado facial', 'Cuidado corporal',
  'Aceites', 'Jabones', 'Cabello', 'Bienestar', 'Promociones'
];

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function productCost(product) {
  return roundBs(grossCost(product));
}

function representativePrice(product) {
  return roundBs(safeNumber(product.resellerPrice ?? product.representativePrice ?? product.wholesalePriceFixed, 0));
}

function resellerPrice(product) {
  return representativePrice(product);
}

function resellerAdditionalCost(product) {
  return roundBs(safeNumber(product.resellerAdditionalCost ?? product.localAdditionalCost ?? 0, 0));
}

function resellerEffectiveCost(product) {
  return roundBs(representativePrice(product) + resellerAdditionalCost(product));
}

function resellerLocalUnitPrice(product) {
  return roundBs(safeNumber(product.resellerLocalUnitPrice ?? product.localUnitPrice ?? product.ownPublicPrice ?? publicPrice(product), 0));
}

function resellerLocalWholesalePrice(product) {
  return roundBs(safeNumber(product.resellerLocalWholesalePrice ?? product.localWholesalePrice ?? product.ownWholesalePrice ?? marketPrice(product), 0));
}

function marketPrice(product) {
  return roundBs(safeNumber(product.marketPrice ?? product.wholesaleMarketPrice ?? product.marketPriceFixed ?? product.mayoristaPrice ?? product.wholesalePriceFixed ?? product.resellerPrice, 0));
}

function publicPrice(product) {
  return roundBs(safeNumber(product.publicPrice ?? product.unitPriceFixed, 0));
}

function unitPrice(product) {
  return publicPrice(product);
}

function wholesalePrice(product) {
  return marketPrice(product);
}

function marginPct(price, cost) {
  if (!cost || cost <= 0) return 0;
  return ((price - cost) / cost) * 100;
}

function marginAmount(price, cost) {
  return roundBs((Number(price) || 0) - (Number(cost) || 0));
}

function normalizeProductInput(raw, previousProduct) {
  const now = Date.now();
  const cost = roundBs(safeNumber(raw.cost, 0));
  const market = roundBs(safeNumber(raw.marketPrice, 0));
  const reseller = roundBs(safeNumber(raw.resellerPrice, 0));
  const publico = roundBs(safeNumber(raw.publicPrice, 0));
  const stock = Math.max(0, parseInt(raw.stock, 10) || 0);
  return {
    id: previousProduct ? previousProduct.id : uid('prod'),
    name: (raw.name || '').trim(),
    category: (raw.category || 'General').trim() || 'General',
    sku: (raw.sku || '').trim(),
    description: (raw.description || '').trim(),
    cost,
    marketPrice: market,
    wholesaleMarketPrice: market,
    marketPriceFixed: market,
    resellerPrice: reseller,
    representativePrice: reseller,
    publicPrice: publico,
    wholesalePriceFixed: reseller,
    unitPriceFixed: publico,
    stock,
    resellerAdditionalCost: roundBs(safeNumber(raw.resellerAdditionalCost ?? (previousProduct && previousProduct.resellerAdditionalCost), 0)),
    resellerLocalUnitPrice: roundBs(safeNumber(raw.resellerLocalUnitPrice ?? (previousProduct && previousProduct.resellerLocalUnitPrice) ?? publico, 0)),
    resellerLocalWholesalePrice: roundBs(safeNumber(raw.resellerLocalWholesalePrice ?? (previousProduct && previousProduct.resellerLocalWholesalePrice) ?? market, 0)),
    photo: raw.photo || null,
    insumos: Array.isArray(raw.insumos) ? raw.insumos : [],
    finalQty: safeNumber(raw.finalQty, 0),
    finalUnit: (raw.finalUnit || 'u.').trim() || 'u.',
    entryDate: raw.entryDate || todayISO(),
    status: raw.status || 'active',
    syncStatus: 'local',
    createdAt: previousProduct ? previousProduct.createdAt : now,
    updatedAt: now
  };
}

function productMatchesSearch(product, needle) {
  if (!needle) return true;
  return [product.name, product.category, product.description, product.sku]
    .some(value => matchesSearch(value || '', needle));
}

function productMetrics(products = AppState.products) {
  const active = products.filter(p => p.status !== 'archived');
  return active.reduce((acc, p) => {
    const cost = productCost(p);
    const publico = publicPrice(p);
    const mayorista = marketPrice(p);
    const revendedor = resellerPrice(p);
    const stock = Number(p.stock) || 0;
    acc.count += 1;
    acc.units += stock;
    acc.costValue += cost * stock;
    acc.publicValue += publico * stock;
    acc.marketValue += mayorista * stock;
    acc.resellerValue += revendedor * stock;
    if (stock <= AppState.settings.lowStockThreshold) acc.lowStock += 1;
    return acc;
  }, { count: 0, units: 0, costValue: 0, publicValue: 0, marketValue: 0, resellerValue: 0, lowStock: 0 });
}

function renderInventario() {
  const adminMode = !window.isAdmin || isAdmin();
  const seller = window.isReseller && isReseller();
  $('#fabAdd').classList.toggle('hidden', !adminMode);
  $('#fabAdd').onclick = adminMode ? () => openProductForm(null) : null;
  const main = $('#mainArea');
  const lowThreshold = AppState.settings.lowStockThreshold;
  const metrics = productMetrics();

  let html = `
    <section class="inventoryHero">
      <div>
        <div class="eyebrow">${seller ? 'Mi inventario regional' : 'Inventario comercial'}</div>
        <h1>${seller ? 'Productos para vender' : 'Productos Natura Vida'}</h1>
        <p>${adminMode ? 'Costo por insumos, precio mayorista, precio representantes, precio público, stock, fotografía y trazabilidad directamente en Supabase.' : 'Administra tu stock asignado, costos y precios; cada cambio se guarda en Supabase.'}</p>
      </div>
      ${adminMode ? '<button class="btn sm" id="quickAddProduct">+ Producto</button>' : '<span class="livePill">Realtime activo</span>'}
    </section>

    <div class="kpiGrid inventoryKpis">
      <div class="kpiCard"><span class="lbl">Productos</span><strong>${metrics.count}</strong></div>
      <div class="kpiCard"><span class="lbl">Unidades</span><strong>${metrics.units}</strong></div>
      <div class="kpiCard"><span class="lbl">${seller ? 'Inversión aprox.' : 'Costo stock'}</span><strong>${fmtMoney(seller ? AppState.products.filter(p=>p.status!=='archived').reduce((s,p)=>s+(resellerEffectiveCost(p)*(Number(p.stock)||0)),0) : metrics.costValue)}</strong></div>
      <div class="kpiCard ${metrics.lowStock ? 'dangerSoft' : ''}"><span class="lbl">Stock bajo</span><strong>${metrics.lowStock}</strong></div>
    </div>

    ${seller ? `<div class="formNotice resellerInventoryNotice">Tu precio base es el precio representantes que te entrega el administrador. Agrega transporte/costos operativos, define tu precio unitario y tu precio mayorista, y actualiza tu stock oficial en Supabase.</div>` : ''}

    <div class="toolrow enhancedSearch">
      <input type="text" id="searchInput" placeholder="Buscar por producto, categoría, SKU o descripción..." value="${escapeHtml(_prodSearch)}">
    </div>
  `;

  const filtered = AppState.products
    .filter(p => p.status !== 'archived')
    .filter(p => productMatchesSearch(p, _prodSearch))
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  if (filtered.length === 0) {
    html += `
      <div class="empty">
        <span class="ic">🌿</span>
        <h3>${AppState.products.length === 0 ? 'Aún no hay productos' : 'Sin resultados'}</h3>
        <p>${AppState.products.length === 0 ? (seller ? 'El catálogo aparecerá automáticamente cuando el administrador registre productos.' : 'Toca + Producto para registrar tu primer producto con costo, precios, stock y fotografía.') : 'Intenta con otro término de búsqueda.'}</p>
      </div>`;
  } else {
    html += `<div class="invGrid v2Grid">`;
    filtered.forEach(p => {
      const low = p.stock <= lowThreshold;
      const cost = productCost(p);
      const mPrice = marketPrice(p);
      const rPrice = resellerPrice(p);
      const pPrice = publicPrice(p);
      const localCost = resellerEffectiveCost(p);
      const localUnit = resellerLocalUnitPrice(p);
      const localWholesale = resellerLocalWholesalePrice(p);
      const mMargin = marginPct(mPrice, cost);
      const rMargin = marginPct(rPrice, cost);
      const pMargin = marginPct(pPrice, cost);
      const localUnitMargin = marginAmount(localUnit, localCost);
      const localWholesaleMargin = marginAmount(localWholesale, localCost);
      html += `
      <article class="invCard v2ProductCard ${seller ? 'resellerInventoryCard' : ''}" data-id="${p.id}">
        <div class="invPhoto">${p.photo ? `<img src="${p.photo}" alt="${escapeHtml(p.name)}">` : '<span class="invPhotoFallback">🌿</span>'}</div>
        <div class="invBody">
          <div class="productLineTop">
            <span class="categoryBadge">${escapeHtml(p.category || 'General')}</span>
            ${p.sku ? `<span class="skuBadge">${escapeHtml(p.sku)}</span>` : ''}
          </div>
          <div class="invName">${escapeHtml(p.name)}</div>
          ${p.description ? `<div class="invDesc">${escapeHtml(p.description)}</div>` : ''}
          <span class="pill ${low ? 'low' : 'ok'} stockPill">${low ? '⚠ stock bajo' : 'stock'} · ${p.stock}</span>
          ${seller ? `
          <div class="priceMatrix priceMatrix4 resellerPriceMatrix">
            <div><span>Base admin</span><strong>${fmtMoney(rPrice)}</strong></div>
            <div><span>+ Envío/costos</span><strong>${fmtMoney(resellerAdditionalCost(p))}</strong></div>
            <div><span>Mi unitario</span><strong>${fmtMoney(localUnit)}</strong><small>${fmtMoney(localUnitMargin)}</small></div>
            <div><span>Mi mayorista</span><strong>${fmtMoney(localWholesale)}</strong><small>${fmtMoney(localWholesaleMargin)}</small></div>
          </div>` : `
          <div class="priceMatrix priceMatrix4">
            <div><span>Costo</span><strong>${fmtMoney(cost)}</strong></div>
            <div><span>Mayorista</span><strong>${fmtMoney(mPrice)}</strong><small>${mMargin >= 0 ? '+' : ''}${mMargin.toFixed(0)}%</small></div>
            <div><span>Represent.</span><strong>${fmtMoney(rPrice)}</strong><small>${rMargin >= 0 ? '+' : ''}${rMargin.toFixed(0)}%</small></div>
            <div><span>Público</span><strong>${fmtMoney(pPrice)}</strong><small>${pMargin >= 0 ? '+' : ''}${pMargin.toFixed(0)}%</small></div>
          </div>`}
        </div>
        ${adminMode ? `<div class="invActions">
          <button class="editBtn" data-id="${p.id}">Editar</button>
          <button class="danger delBtn" data-id="${p.id}">Eliminar</button>
        </div>` : `<div class="invActions">
          <button class="editMyInvBtn" data-id="${p.id}">Editar mi inventario</button>
          <button class="sellThisBtn" data-id="${p.id}">Vender</button>
        </div>`}
      </article>`;
    });
    html += `</div>`;
  }

  main.innerHTML = html;
  const quickAdd = $('#quickAddProduct');
  if (quickAdd) quickAdd.addEventListener('click', () => openProductForm(null));
  $('#searchInput').addEventListener('input', e => { _prodSearch = e.target.value; renderInventario(); });
  $all('.editBtn').forEach(b => b.addEventListener('click', () => openProductForm(b.dataset.id)));
  $all('.editMyInvBtn').forEach(b => b.addEventListener('click', () => openResellerProductForm(b.dataset.id)));
  $all('.delBtn').forEach(b => b.addEventListener('click', () => confirmDeleteProduct(b.dataset.id)));
  $all('.sellThisBtn').forEach(b => b.addEventListener('click', () => { window.startSaleWithProduct ? startSaleWithProduct(b.dataset.id) : navigateTo('vender'); }));
}

async function confirmDeleteProduct(id) {
  const p = AppState.products.find(x => x.id === id);
  if (!p) return;
  if (confirmDialog(`¿Eliminar "${p.name}" del inventario? Esta acción no se puede deshacer.`)) {
    try {
      await DB.delete('products', id);
      AppState.products = AppState.products.filter(x => x.id !== id);
      await writeAudit('product:delete', 'products', id, p, null).catch(() => {});
      renderInventario();
      showToast('Producto eliminado de Supabase.');
    } catch (err) {
      showToast(err.message || 'No se pudo eliminar el producto.', 'error');
    }
  }
}

function openProductForm(id) {
  if (window.isAdmin && !isAdmin()) { showToast('Solo el administrador puede modificar productos.', 'error'); return; }
  const p = id ? AppState.products.find(x => x.id === id) : null;
  const baseCost = p ? productCost(p) : 0;
  let insumos = p ? JSON.parse(JSON.stringify(p.insumos || [])) : [];
  if (insumos.length === 0) insumos = [{ name: '', unit: 'u.', unitCost: '', qtyUsed: '' }];
  let manualCostTouched = false;

  const knownCategories = Array.from(new Set(DEFAULT_CATEGORIES.concat(AppState.products.map(x => x.category).filter(Boolean))));
  const html = `
    <h2>${p ? 'Editar producto' : 'Nuevo producto'} <span class="x" id="closeSheet">✕</span></h2>

    <div class="formNotice">
      Producto comercial completo: costo por insumos, precio mayorista, precio para representantes, precio público, stock, descripción y fotografía.
    </div>

    <div class="field">
      <label>Fotografía</label>
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
      <label>Nombre del producto *</label>
      <input type="text" id="f_name" placeholder="Ej: Aceite de coco 200ml" value="${p ? escapeHtml(p.name) : ''}">
    </div>

    <div class="field-row">
      <div class="field">
        <label>Categoría *</label>
        <input type="text" id="f_category" list="categorySuggestions" placeholder="Ej: Cuidado facial" value="${p ? escapeHtml(p.category || 'General') : 'General'}">
        <datalist id="categorySuggestions">${knownCategories.map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
      </div>
      <div class="field">
        <label>SKU / código</label>
        <input type="text" id="f_sku" placeholder="Opcional" value="${p ? escapeHtml(p.sku || '') : ''}">
      </div>
    </div>

    <div class="field">
      <label>Descripción</label>
      <textarea id="f_desc" rows="3" placeholder="Beneficios, presentación, aroma, tamaño, recomendaciones...">${p ? escapeHtml(p.description || '') : ''}</textarea>
    </div>

    <div class="sectiontitle2"><span>Costos y precios</span></div>
    <div class="field-row priceFields priceFields4">
      <div class="field money">
        <label>Costo calculado (Bs)</label>
        <input type="number" inputmode="decimal" step="0.01" id="f_cost" placeholder="Calculado por insumos" value="${baseCost || ''}" readonly>
      </div>
      <div class="field money">
        <label>Precio mayorista (Bs) *</label>
        <input type="number" inputmode="decimal" step="0.01" id="f_marketprice" placeholder="Ej: 120" value="${p ? marketPrice(p) || '' : ''}">
      </div>
      <div class="field money">
        <label>Precio representantes (Bs) *</label>
        <input type="number" inputmode="decimal" step="0.01" id="f_resellerprice" placeholder="Ej: 100" value="${p ? resellerPrice(p) || '' : ''}">
      </div>
      <div class="field money">
        <label>Precio público (Bs) *</label>
        <input type="number" inputmode="decimal" step="0.01" id="f_publicprice" placeholder="Ej: 150" value="${p ? publicPrice(p) || '' : ''}">
      </div>
    </div>

    <div class="profitPreview profitPreview3">
      <div><span>Utilidad mayorista</span><strong id="marketProfitVal">Bs 0</strong><small id="marketPctVal">0%</small></div>
      <div><span>Utilidad representantes</span><strong id="resellerProfitVal">Bs 0</strong><small id="resellerPctVal">0%</small></div>
      <div><span>Utilidad público</span><strong id="publicProfitVal">Bs 0</strong><small id="publicPctVal">0%</small></div>
    </div>

    <div class="sectiontitle2"><span>Stock y presentación</span></div>
    <div class="field-row">
      <div class="field">
        <label>Fecha de ingreso</label>
        <input type="date" id="f_entrydate" value="${p && p.entryDate ? p.entryDate : todayISO()}">
      </div>
      <div class="field">
        <label>Stock actual *</label>
        <input type="number" inputmode="numeric" step="1" id="f_stock" placeholder="0" value="${p ? p.stock : ''}">
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Cantidad / presentación</label>
        <input type="number" inputmode="decimal" step="0.01" id="f_finalqty" placeholder="Ej: 250" value="${p && p.finalQty ? p.finalQty : ''}">
      </div>
      <div class="field">
        <label>Unidad</label>
        <input type="text" id="f_finalunit" placeholder="ml, gr, u." value="${p && p.finalUnit ? escapeHtml(p.finalUnit) : 'u.'}">
      </div>
    </div>

    <details class="advancedCostBox" open>
      <summary>Costeo por insumos</summary>
      <p>El costo del producto se calcula desde los insumos registrados. Este valor alimenta la utilidad y los reportes.</p>
      <div id="insumosList"></div>
      <button type="button" class="addInsumoBtn" id="addInsumoBtn">+ Agregar insumo</button>
      <div class="costSummary"><span class="lbl">Costo calculado por insumos</span><span class="val" id="grossVal">Bs 0</span></div>
    </details>

    <div class="actions stickyActions">
      <button class="btn outline block" id="cancelForm">Cancelar</button>
      <button class="btn block" id="saveForm">${p ? 'Guardar cambios' : 'Crear producto'}</button>
    </div>
  `;

  openSheet(html, (overlay, close) => {
    const insumosListEl = $('#insumosList', overlay);

    function currentInsumoCost() {
      return insumos.reduce((s, i) => s + ((parseFloat(i.qtyUsed) || 0) * (parseFloat(i.unitCost) || 0)), 0);
    }

    function readCost() {
      return roundBs(currentInsumoCost());
    }

    function setCostFromInsumosIfNeeded() {
      const calculated = currentInsumoCost();
      $('#f_cost', overlay).value = calculated ? roundBs(calculated) : '';
    }

    function updateProfitPreview() {
      setCostFromInsumosIfNeeded();
      const cost = readCost();
      const mPrice = roundBs(parseFloat($('#f_marketprice', overlay).value) || 0);
      const rPrice = roundBs(parseFloat($('#f_resellerprice', overlay).value) || 0);
      const pPrice = roundBs(parseFloat($('#f_publicprice', overlay).value) || 0);
      const mPct = marginPct(mPrice, cost);
      const rPct = marginPct(rPrice, cost);
      const pPct = marginPct(pPrice, cost);
      $('#grossVal', overlay).textContent = fmtMoney(currentInsumoCost());
      $('#marketProfitVal', overlay).textContent = fmtMoney(marginAmount(mPrice, cost));
      $('#resellerProfitVal', overlay).textContent = fmtMoney(marginAmount(rPrice, cost));
      $('#publicProfitVal', overlay).textContent = fmtMoney(marginAmount(pPrice, cost));
      $('#marketPctVal', overlay).textContent = mPrice > 0 ? `${mPct >= 0 ? '+' : ''}${mPct.toFixed(0)}%` : '0%';
      $('#resellerPctVal', overlay).textContent = rPrice > 0 ? `${rPct >= 0 ? '+' : ''}${rPct.toFixed(0)}%` : '0%';
      $('#publicPctVal', overlay).textContent = pPrice > 0 ? `${pPct >= 0 ? '+' : ''}${pPct.toFixed(0)}%` : '0%';
      $('#marketPctVal', overlay).classList.toggle('negative', mPrice > 0 && mPrice < cost);
      $('#resellerPctVal', overlay).classList.toggle('negative', rPrice > 0 && rPrice < cost);
      $('#publicPctVal', overlay).classList.toggle('negative', pPrice > 0 && pPrice < cost);
    }

    function renderInsumos() {
      insumosListEl.innerHTML = insumos.map((ins, idx) => `
        <div class="insumo-row" data-idx="${idx}">
          <input type="text" class="insumo-name" placeholder="Nombre insumo" value="${escapeHtml(ins.name)}">
          <input type="text" class="insumo-unit" placeholder="ud." value="${escapeHtml(ins.unit || '')}">
          <input type="number" inputmode="decimal" step="0.01" class="insumo-cost" placeholder="Costo/ud" value="${ins.unitCost}">
          <input type="number" inputmode="decimal" step="0.01" class="insumo-qty" placeholder="Cant." value="${ins.qtyUsed}">
          <button type="button" class="insumo-del" data-idx="${idx}">✕</button>
        </div>
      `).join('');
      $all('.insumo-name', insumosListEl).forEach((inp, idx) => inp.addEventListener('input', () => { insumos[idx].name = inp.value; }));
      $all('.insumo-unit', insumosListEl).forEach((inp, idx) => inp.addEventListener('input', () => { insumos[idx].unit = inp.value; }));
      $all('.insumo-cost', insumosListEl).forEach((inp, idx) => inp.addEventListener('input', () => { insumos[idx].unitCost = inp.value; updateProfitPreview(); }));
      $all('.insumo-qty', insumosListEl).forEach((inp, idx) => inp.addEventListener('input', () => { insumos[idx].qtyUsed = inp.value; updateProfitPreview(); }));
      $all('.insumo-del', insumosListEl).forEach(btn => btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (insumos.length <= 1) insumos[0] = { name: '', unit: 'u.', unitCost: '', qtyUsed: '' };
        else insumos.splice(idx, 1);
        renderInsumos();
        updateProfitPreview();
      }));
    }

    renderInsumos();
    updateProfitPreview();

    ['f_marketprice', 'f_resellerprice', 'f_publicprice'].forEach(id => {
      $('#' + id, overlay).addEventListener('input', updateProfitPreview);
    });

    $('#addInsumoBtn', overlay).addEventListener('click', () => {
      insumos.push({ name: '', unit: 'u.', unitCost: '', qtyUsed: '' });
      renderInsumos();
      updateProfitPreview();
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
      const category = $('#f_category', overlay).value.trim() || 'General';
      const cost = readCost();
      const mPrice = roundBs(parseFloat($('#f_marketprice', overlay).value) || 0);
      const rPrice = roundBs(parseFloat($('#f_resellerprice', overlay).value) || 0);
      const pPrice = roundBs(parseFloat($('#f_publicprice', overlay).value) || 0);
      const stock = parseInt($('#f_stock', overlay).value, 10);

      if (!name) { showToast('⚠️ Ponle un nombre al producto', 'error'); return; }
      if (!category) { showToast('⚠️ Define una categoría', 'error'); return; }
      if (cost <= 0) { showToast('⚠️ Ingresa el costo del producto', 'error'); return; }
      if (mPrice <= 0 || rPrice <= 0 || pPrice <= 0) { showToast('⚠️ Ingresa precio mayorista, representantes y público', 'error'); return; }
      if (pPrice < rPrice || pPrice < mPrice) { showToast('⚠️ El precio público no debería ser menor a mayorista o representantes', 'error'); return; }
      if (!Number.isFinite(stock) || stock < 0) { showToast('⚠️ El stock no puede ser negativo', 'error'); return; }

      const cleanInsumos = insumos
        .filter(i => (i.name || '').trim() || (parseFloat(i.unitCost) || 0) > 0)
        .map(i => ({
          name: (i.name || '').trim(),
          unit: (i.unit || '').trim(),
          unitCost: parseFloat(i.unitCost) || 0,
          qtyUsed: parseFloat(i.qtyUsed) || 0
        }));

      const previousStock = p ? Number(p.stock) || 0 : 0;
      const data = normalizeProductInput({
        name,
        category,
        sku: $('#f_sku', overlay).value,
        description: $('#f_desc', overlay).value,
        cost,
        marketPrice: mPrice,
        resellerPrice: rPrice,
        publicPrice: pPrice,
        stock,
        photo: photoData,
        insumos: cleanInsumos,
        finalQty: $('#f_finalqty', overlay).value,
        finalUnit: $('#f_finalunit', overlay).value,
        entryDate: $('#f_entrydate', overlay).value || todayISO()
      }, p);

      const saveBtn = $('#saveForm', overlay);
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando en Supabase…';
      try {
        await DB.put('products', data);
        await writeAudit(p ? 'product:update' : 'product:create', 'products', data.id, p || null, data).catch(() => {});

        if (!p || previousStock !== data.stock) {
          await DB.put('inventoryMovements', {
            id: uid('mov'),
            productId: data.id,
            productName: data.name,
            type: p ? 'adjustment' : 'initial_stock',
            qty: data.stock - previousStock,
            stockAfter: data.stock,
            reason: p ? 'Edición de producto' : 'Registro inicial de producto',
            date: Date.now(),
            syncStatus: 'cloud'
          }).catch(err => console.warn('Movimiento auxiliar:', err.message));
        }

        if (p) {
          const idx = AppState.products.findIndex(x => x.id === p.id);
          AppState.products[idx] = data;
        } else {
          AppState.products.push(data);
        }
        close();
        renderInventario();
        showToast(p ? 'Producto actualizado en Supabase' : 'Producto creado en Supabase');
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = p ? 'Guardar cambios' : 'Crear producto';
        showToast(err.message || 'No se pudo guardar el producto.', 'error');
      }
    });
  });
}


function openResellerProductForm(id) {
  if (!window.isReseller || !isReseller()) { showToast('Esta edición es solo para representantes.', 'error'); return; }
  const p = AppState.products.find(x => x.id === id);
  if (!p) return;
  const base = representativePrice(p);
  const extra = resellerAdditionalCost(p);
  const localUnit = resellerLocalUnitPrice(p);
  const localWholesale = resellerLocalWholesalePrice(p);
  const stock = Number(p.stock) || 0;
  const html = `
    <h2>Mi inventario <span class="x" id="closeSheet">✕</span></h2>
    <div class="formNotice">Edita tu stock personal, transporte/costos operativos y precios de venta. Todo se guarda en Supabase y se refleja automáticamente en tus dispositivos.</div>
    <div class="resellerProductHeader">
      <div class="thumb">${p.photo ? `<img src="${p.photo}" alt="">` : '🌿'}</div>
      <div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.category || 'General')}</small></div>
    </div>
    <div class="field-row">
      <div class="field money"><label>Precio base administrador</label><input type="number" value="${base}" readonly></div>
      <div class="field money"><label>Transporte / costo adicional</label><input type="number" inputmode="decimal" step="0.01" id="ri_extra" value="${extra || ''}" placeholder="Ej: 5"></div>
    </div>
    <div class="costSummary resellerCostSummary"><span class="lbl">Mi costo real estimado</span><span class="val" id="ri_cost">${fmtMoney(base + extra)}</span></div>
    <div class="field-row">
      <div class="field"><label>Mi stock actual</label><input type="number" inputmode="numeric" step="1" id="ri_stock" value="${stock}"></div>
      <div class="field money"><label>Mi precio unitario</label><input type="number" inputmode="decimal" step="0.01" id="ri_unit" value="${localUnit || ''}" placeholder="Ej: 150"></div>
    </div>
    <div class="field-row">
      <div class="field money"><label>Mi precio mayorista</label><input type="number" inputmode="decimal" step="0.01" id="ri_wholesale" value="${localWholesale || ''}" placeholder="Ej: 135"></div>
      <div class="field"><label>Observación local</label><input type="text" id="ri_note" value="${escapeHtml(p.resellerLocalNote || '')}" placeholder="Ej: envío La Paz incluido"></div>
    </div>
    <div class="profitPreview profitPreview2">
      <div><span>Margen unitario</span><strong id="ri_unit_margin">Bs 0</strong></div>
      <div><span>Margen mayorista</span><strong id="ri_wholesale_margin">Bs 0</strong></div>
    </div>
    <div class="actions stickyActions">
      <button class="btn outline block" id="cancelForm">Cancelar</button>
      <button class="btn block" id="saveResellerInv">Guardar mi inventario</button>
    </div>
  `;
  openSheet(html, (overlay, close) => {
    function calc() {
      const ex = roundBs(parseFloat($('#ri_extra', overlay).value) || 0);
      const cost = roundBs(base + ex);
      const unit = roundBs(parseFloat($('#ri_unit', overlay).value) || 0);
      const wh = roundBs(parseFloat($('#ri_wholesale', overlay).value) || 0);
      $('#ri_cost', overlay).textContent = fmtMoney(cost);
      $('#ri_unit_margin', overlay).textContent = fmtMoney(unit - cost);
      $('#ri_wholesale_margin', overlay).textContent = fmtMoney(wh - cost);
      $('#ri_unit_margin', overlay).classList.toggle('negative', unit > 0 && unit < cost);
      $('#ri_wholesale_margin', overlay).classList.toggle('negative', wh > 0 && wh < cost);
    }
    ['ri_extra','ri_unit','ri_wholesale'].forEach(id => $('#' + id, overlay).addEventListener('input', calc));
    calc();
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#cancelForm', overlay).addEventListener('click', close);
    $('#saveResellerInv', overlay).addEventListener('click', async () => {
      const previousStock = Number(p.stock) || 0;
      const newStock = parseInt($('#ri_stock', overlay).value, 10);
      if (!Number.isFinite(newStock) || newStock < 0) { showToast('El stock no puede ser negativo.', 'error'); return; }
      const ex = roundBs(parseFloat($('#ri_extra', overlay).value) || 0);
      const unit = roundBs(parseFloat($('#ri_unit', overlay).value) || 0);
      const wh = roundBs(parseFloat($('#ri_wholesale', overlay).value) || 0);
      const cost = roundBs(base + ex);
      if (unit > 0 && unit < cost) { showToast('Tu precio unitario está por debajo de tu costo real.', 'error'); return; }
      if (wh > 0 && wh < cost) { showToast('Tu precio mayorista está por debajo de tu costo real.', 'error'); return; }
      const note = $('#ri_note', overlay).value.trim();
      const stockDelta = newStock - previousStock;
      const saveBtn = $('#saveResellerInv', overlay);
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando en Supabase…';
      try {
        if (!window.updateRepresentativeInventoryRemote) throw new Error('El módulo de inventario online no está disponible.');
        const result = await updateRepresentativeInventoryRemote(p.id, stockDelta, {
          additionalCost: ex,
          unitPrice: unit || publicPrice(p),
          wholesalePrice: wh || marketPrice(p),
          note
        });
        if (!result || !result.ok) throw new Error((result && result.message) || 'Supabase rechazó el ajuste.');

        p.stock = Number(result.stock);
        p.resellerAdditionalCost = ex;
        p.resellerLocalUnitPrice = unit || publicPrice(p);
        p.resellerLocalWholesalePrice = wh || marketPrice(p);
        p.resellerLocalNote = note;
        p.resellerLocalUpdatedAt = Date.now();
        p.updatedAt = Date.now();
        await DB.put('products', p, { silent: true });

        if (stockDelta !== 0) {
          await DB.put('inventoryMovements', {
            id: uid('mov'), productId: p.id, productName: p.name,
            type: 'reseller_stock_adjustment', qty: stockDelta,
            stockAfter: Number(result.stock), reason: 'Ajuste de inventario del representante',
            date: Date.now(), sellerId: AppState.session.userId, syncStatus: 'cloud'
          }).catch(err => console.warn('Movimiento auxiliar:', err.message));
        }
        const idx = AppState.products.findIndex(x => x.id === p.id);
        if (idx >= 0) AppState.products[idx] = p;
        close();
        renderInventario();
        showToast('Inventario actualizado en Supabase');
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar mi inventario';
        showToast(err.message || 'No se pudo actualizar el inventario.', 'error');
      }
    });
  });
}

window.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;
window.productCost = productCost;
window.marketPrice = marketPrice;
window.representativePrice = representativePrice;
window.resellerPrice = resellerPrice;
window.resellerAdditionalCost = resellerAdditionalCost;
window.resellerEffectiveCost = resellerEffectiveCost;
window.resellerLocalUnitPrice = resellerLocalUnitPrice;
window.resellerLocalWholesalePrice = resellerLocalWholesalePrice;
window.publicPrice = publicPrice;
window.marginPct = marginPct;
window.unitPrice = unitPrice;
window.wholesalePrice = wholesalePrice;
window.productMetrics = productMetrics;
window.renderInventario = renderInventario;
window.openProductForm = openProductForm;
window.openResellerProductForm = openResellerProductForm;
