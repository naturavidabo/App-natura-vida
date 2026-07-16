/* NATURA VIDA V7.4.0 — Producción, insumos, lotes y costo real. */

(() => {
  const MATERIAL_CATEGORIES_V740 = ['Materia prima', 'Envases', 'Etiquetas', 'Empaques', 'Ingredientes', 'Otros insumos'];
  const MOVEMENT_LABELS_V740 = {
    purchase: 'Compra / ingreso con costo',
    adjust_in: 'Ajuste de entrada',
    consume: 'Consumo de producción',
    adjust_out: 'Ajuste de salida'
  };
  const ORDER_STATUS_V740 = {
    planned: ['Planificada', 'planned'],
    in_progress: ['En proceso', 'progress'],
    completed: ['Completada', 'completed'],
    cancelled: ['Cancelada', 'cancelled']
  };

  let productionViewV740 = 'resumen';

  function sbV740() {
    if (!window.getSupabaseClient) throw new Error('Supabase no está disponible.');
    const sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase no está configurado.');
    return sb;
  }

  function assertProductionAdminV740() {
    if (!requireAuth() || !isAdmin()) throw new Error('Solo el administrador puede gestionar producción.');
    if (!navigator.onLine) throw new Error('Se necesita internet para registrar producción.');
    if (!canOperate()) throw new Error('La cuenta no está habilitada para operar.');
  }

  function errorMessageV740(error) {
    if (window.messageFromError) return messageFromError(error);
    return String((error && error.message) || error || 'Error desconocido');
  }

  function mapRawMaterialV740(row) {
    const payload = row.payload || {};
    return Object.assign({}, payload, {
      id: row.id,
      name: row.name || '',
      category: row.category || 'Materia prima',
      unit: row.unit || 'unidad',
      stock: Number(row.stock || 0),
      averageCost: Number(row.average_cost || 0),
      minStock: Number(row.min_stock || 0),
      supplier: row.supplier || '',
      note: row.note || '',
      active: row.active !== false,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
    });
  }

  function mapRawMaterialMovementV740(row) {
    return Object.assign({}, row.payload || {}, {
      id: row.id,
      materialId: row.material_id,
      movementType: row.movement_type,
      quantity: Number(row.quantity || 0),
      unitCost: Number(row.unit_cost || 0),
      totalCost: Number(row.total_cost || 0),
      referenceId: row.reference_id || '',
      note: row.note || '',
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    });
  }

  function mapProductionOrderV740(row) {
    return Object.assign({}, row.payload || {}, {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name || '',
      status: row.status || 'planned',
      plannedOutput: Number(row.planned_output || 0),
      outputUnit: row.output_unit || 'unidades',
      presentationMl: Number(row.presentation_ml || 0),
      plannedInputs: Array.isArray(row.planned_inputs) ? row.planned_inputs : [],
      note: row.note || '',
      startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
    });
  }

  function mapProductionBatchV740(row) {
    return Object.assign({}, row.payload || {}, {
      id: row.id,
      orderId: row.order_id,
      lotCode: row.lot_code || '',
      productId: row.product_id,
      productName: row.product_name || '',
      outputQty: Number(row.output_qty || 0),
      outputUnit: row.output_unit || 'unidades',
      presentationMl: Number(row.presentation_ml || 0),
      actualInputs: Array.isArray(row.actual_inputs) ? row.actual_inputs : [],
      inputCost: Number(row.input_cost || 0),
      directCost: Number(row.direct_cost || 0),
      totalCost: Number(row.total_cost || 0),
      unitCost: Number(row.unit_cost || 0),
      costPerMl: Number(row.cost_per_ml || 0),
      note: row.note || '',
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    });
  }

  async function syncProductionCloudToLocalV740() {
    if (!requireAuth() || !isAdmin()) {
      AppState.rawMaterials = [];
      AppState.rawMaterialMovements = [];
      AppState.productionOrders = [];
      AppState.productionBatches = [];
      return { ok: true, skipped: true };
    }
    try {
      const sb = sbV740();
      const [materialsResult, movementsResult, ordersResult, batchesResult] = await Promise.all([
        sb.from('raw_materials').select('*').order('name', { ascending: true }),
        sb.from('raw_material_movements').select('*').order('created_at', { ascending: false }).limit(600),
        sb.from('production_orders').select('*').order('created_at', { ascending: false }).limit(300),
        sb.from('production_batches').select('*').order('created_at', { ascending: false }).limit(300)
      ]);
      const failed = [materialsResult, movementsResult, ordersResult, batchesResult].find(r => r.error);
      if (failed) return { ok: false, message: errorMessageV740(failed.error) };

      const materials = (materialsResult.data || []).map(mapRawMaterialV740);
      const movements = (movementsResult.data || []).map(mapRawMaterialMovementV740);
      const orders = (ordersResult.data || []).map(mapProductionOrderV740);
      const batches = (batchesResult.data || []).map(mapProductionBatchV740);

      await Promise.all([
        DB.clear('rawMaterials'), DB.clear('rawMaterialMovements'),
        DB.clear('productionOrders'), DB.clear('productionBatches')
      ]);
      if (materials.length) await DB.bulkPut('rawMaterials', materials, { silent: true });
      if (movements.length) await DB.bulkPut('rawMaterialMovements', movements, { silent: true });
      if (orders.length) await DB.bulkPut('productionOrders', orders, { silent: true });
      if (batches.length) await DB.bulkPut('productionBatches', batches, { silent: true });

      AppState.rawMaterials = materials;
      AppState.rawMaterialMovements = movements;
      AppState.productionOrders = orders;
      AppState.productionBatches = batches;
      return { ok: true, count: materials.length + movements.length + orders.length + batches.length };
    } catch (error) {
      return { ok: false, message: errorMessageV740(error) };
    }
  }

  async function refreshProductionV740({ refreshProducts = false, refreshFinance = false } = {}) {
    const tasks = [syncProductionCloudToLocalV740()];
    if (refreshProducts && window.syncCloudProductsToLocal) tasks.push(syncCloudProductsToLocal());
    if (refreshFinance && window.syncGenericCloudRecordsToLocal) tasks.push(syncGenericCloudRecordsToLocal());
    const results = await Promise.all(tasks);
    const failed = results.find(r => r && r.ok === false);
    if (failed) throw new Error(failed.message || 'No se pudo actualizar producción.');
    await loadAllState();
    return results;
  }

  async function saveRawMaterialV740(data, existing = null) {
    assertProductionAdminV740();
    const sb = sbV740();
    const row = {
      name: String(data.name || '').trim(),
      category: data.category || 'Materia prima',
      unit: String(data.unit || 'unidad').trim(),
      min_stock: Math.max(0, Number(data.minStock || 0)),
      supplier: String(data.supplier || '').trim(),
      note: String(data.note || '').trim(),
      active: data.active !== false,
      payload: { source: 'Natura Vida V7.4.0' }
    };
    if (!row.name) throw new Error('Ingresa el nombre del insumo.');
    if (!row.unit) throw new Error('Ingresa la unidad del insumo.');

    let result;
    let materialId;
    if (existing && existing.id) {
      materialId = existing.id;
      result = await sb.from('raw_materials').update(row).eq('id', materialId).select().single();
    } else {
      materialId = uid('mat');
      result = await sb.from('raw_materials').insert(Object.assign({
        id: materialId,
        stock: 0,
        average_cost: 0,
        created_by: AppState.session.onlineUserId || AppState.session.userId
      }, row)).select().single();
    }
    if (result.error) throw new Error(errorMessageV740(result.error));
    await writeAudit(existing ? 'raw_material_updated' : 'raw_material_created', 'raw_materials', materialId, existing || null, data);
    return mapRawMaterialV740(result.data);
  }

  async function registerRawMaterialMovementV740(material, movementType, quantity, unitCost, note = '', registerExpense = true) {
    assertProductionAdminV740();
    const cleanQty = Number(quantity || 0);
    const cleanCost = Number(unitCost || 0);
    if (!material || !material.id) throw new Error('Selecciona un insumo.');
    if (!Number.isFinite(cleanQty) || cleanQty <= 0) throw new Error('La cantidad debe ser mayor que cero.');
    if (movementType === 'purchase' && (!Number.isFinite(cleanCost) || cleanCost <= 0)) throw new Error('Ingresa el costo unitario de la compra.');
    const movementId = uid('rmm');
    const { data, error } = await sbV740().rpc('register_raw_material_movement_v74', {
      p_movement_id: movementId,
      p_material_id: material.id,
      p_movement_type: movementType,
      p_quantity: cleanQty,
      p_unit_cost: Math.max(0, cleanCost || 0),
      p_note: String(note || '').trim(),
      p_payload: { source: 'Natura Vida V7.4.0' },
      p_register_expense: movementType === 'purchase' ? registerExpense !== false : false
    });
    if (error) throw new Error(errorMessageV740(error));
    return data;
  }

  async function saveProductionOrderV740(data) {
    assertProductionAdminV740();
    const product = (AppState.products || []).find(p => p.id === data.productId);
    if (!product) throw new Error('Selecciona un producto terminado.');
    const output = Number(data.plannedOutput || 0);
    if (!Number.isFinite(output) || output <= 0) throw new Error('La cantidad planificada debe ser mayor que cero.');
    const inputs = (data.plannedInputs || []).map(item => ({
      materialId: item.materialId,
      materialName: item.materialName,
      unit: item.unit,
      quantity: Number(item.quantity || 0)
    })).filter(item => item.materialId && item.quantity > 0);
    const ids = new Set(inputs.map(i => i.materialId));
    if (ids.size !== inputs.length) throw new Error('Un insumo está repetido. Déjalo una sola vez.');
    if (!inputs.length) throw new Error('Agrega al menos un insumo planificado.');

    const id = uid('po');
    const row = {
      id,
      product_id: product.id,
      product_name: product.name || '',
      status: 'planned',
      planned_output: output,
      output_unit: String(data.outputUnit || 'unidades').trim() || 'unidades',
      presentation_ml: Math.max(0, Number(data.presentationMl || 0)),
      planned_inputs: inputs,
      note: String(data.note || '').trim(),
      payload: { source: 'Natura Vida V7.4.0' },
      created_by: AppState.session.onlineUserId || AppState.session.userId
    };
    const { data: saved, error } = await sbV740().from('production_orders').insert(row).select().single();
    if (error) throw new Error(errorMessageV740(error));
    await writeAudit('production_order_created', 'production_orders', id, null, row);
    return mapProductionOrderV740(saved);
  }

  async function updateProductionOrderStatusV740(order, status) {
    assertProductionAdminV740();
    if (!order || !order.id) throw new Error('Orden no encontrada.');
    if (!['planned', 'in_progress', 'cancelled'].includes(status)) throw new Error('Estado no permitido.');
    const patch = { status };
    if (status === 'in_progress' && !order.startedAt) patch.started_at = new Date().toISOString();
    const { data, error } = await sbV740().from('production_orders').update(patch).eq('id', order.id).select().single();
    if (error) throw new Error(errorMessageV740(error));
    await writeAudit('production_order_status', 'production_orders', order.id, order, { status });
    return mapProductionOrderV740(data);
  }

  async function completeProductionOrderV740(order, data) {
    assertProductionAdminV740();
    const outputQty = Number(data.outputQty || 0);
    const directCost = Number(data.directCost || 0);
    const actualInputs = (data.actualInputs || []).map(item => ({
      materialId: item.materialId,
      quantity: Number(item.quantity || 0)
    })).filter(item => item.materialId && item.quantity > 0);
    if (outputQty <= 0) throw new Error('Ingresa la cantidad realmente obtenida.');
    if (!actualInputs.length) throw new Error('Registra los insumos realmente utilizados.');
    if (new Set(actualInputs.map(i => i.materialId)).size !== actualInputs.length) throw new Error('Hay insumos repetidos.');
    if (directCost < 0) throw new Error('El costo adicional no puede ser negativo.');

    const batchId = uid('batch');
    const lotCode = String(data.lotCode || generatedLotCodeV740()).trim();
    const { data: result, error } = await sbV740().rpc('complete_production_order_v74', {
      p_order_id: order.id,
      p_batch_id: batchId,
      p_lot_code: lotCode,
      p_actual_inputs: actualInputs,
      p_output_qty: outputQty,
      p_output_unit: String(data.outputUnit || order.outputUnit || 'unidades').trim(),
      p_presentation_ml: Math.max(0, Number(data.presentationMl || 0)),
      p_direct_cost: directCost,
      p_note: String(data.note || '').trim()
    });
    if (error) throw new Error(errorMessageV740(error));
    return result;
  }

  function generatedLotCodeV740() {
    const d = new Date();
    const part = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const time = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    return `NV-${part}-${time}`;
  }

  function materialValueV740(material) {
    return Number(material.stock || 0) * Number(material.averageCost || 0);
  }

  function lowStockMaterialsV740() {
    return (AppState.rawMaterials || []).filter(m => m.active !== false && Number(m.stock || 0) <= Number(m.minStock || 0));
  }

  function productionThisMonthV740() {
    const d = new Date();
    const month = d.getMonth();
    const year = d.getFullYear();
    return (AppState.productionBatches || []).filter(b => {
      const x = new Date(b.createdAt);
      return x.getMonth() === month && x.getFullYear() === year;
    });
  }

  function statusBadgeV740(status) {
    const [label, cls] = ORDER_STATUS_V740[status] || [status || 'Sin estado', 'planned'];
    return `<span class="productionStatusV740 ${cls}">${escapeHtml(label)}</span>`;
  }

  function productionTabsV740() {
    const tabs = [
      ['resumen', 'Resumen'], ['insumos', 'Insumos'], ['ordenes', 'Órdenes'], ['lotes', 'Lotes']
    ];
    return `<div class="productionTabsV740">${tabs.map(([id, label]) => `<button data-production-view="${id}" class="${productionViewV740 === id ? 'active' : ''}">${label}</button>`).join('')}</div>`;
  }

  function bindProductionTabsV740() {
    $all('[data-production-view]').forEach(btn => btn.addEventListener('click', () => {
      productionViewV740 = btn.dataset.productionView;
      renderProductionV740();
    }));
  }

  function renderProductionV740() {
    if (!isAdmin()) return navigateTo('inicio');
    $('#fabAdd').classList.add('hidden');
    const materials = (AppState.rawMaterials || []).filter(m => m.active !== false);
    const orders = AppState.productionOrders || [];
    const batches = AppState.productionBatches || [];
    const openOrders = orders.filter(o => ['planned', 'in_progress'].includes(o.status));
    const low = lowStockMaterialsV740();
    const monthBatches = productionThisMonthV740();
    const stockValue = materials.reduce((sum, m) => sum + materialValueV740(m), 0);
    const monthCost = monthBatches.reduce((sum, b) => sum + Number(b.totalCost || 0), 0);

    $('#mainArea').innerHTML = `
      <section class="v7PageHead productionHeadV740">
        <span class="v7Eyebrow">Cadena de fabricación</span>
        <h1>Producción e insumos</h1>
        <p>Controla compras, existencias, órdenes, lotes, rendimiento y costo real del producto terminado.</p>
      </section>
      ${productionTabsV740()}
      <section class="v7MetricGrid compact productionMetricsV740">
        <article class="v7MetricCard"><span>Valor de insumos</span><strong>${fmtMoney(stockValue)}</strong><small>${materials.length} insumo(s) activo(s)</small></article>
        <article class="v7MetricCard"><span>Órdenes abiertas</span><strong>${openOrders.length}</strong><small>planificadas o en proceso</small></article>
        <article class="v7MetricCard"><span>Lotes del mes</span><strong>${monthBatches.length}</strong><small>${fmtMoney(monthCost)} de costo acumulado</small></article>
        <article class="v7MetricCard ${low.length ? 'dangerV740' : 'primary'}"><span>Stock crítico</span><strong>${low.length}</strong><small>${low.length ? 'requiere reposición' : 'sin alertas'}</small></article>
      </section>
      <div id="productionContentV740"></div>
    `;
    bindProductionTabsV740();
    if (productionViewV740 === 'insumos') renderMaterialsViewV740();
    else if (productionViewV740 === 'ordenes') renderOrdersViewV740();
    else if (productionViewV740 === 'lotes') renderBatchesViewV740();
    else renderProductionSummaryV740();
  }

  function renderProductionSummaryV740() {
    const content = $('#productionContentV740');
    const low = lowStockMaterialsV740();
    const openOrders = (AppState.productionOrders || []).filter(o => ['planned', 'in_progress'].includes(o.status)).slice(0, 6);
    const batches = (AppState.productionBatches || []).slice(0, 5);
    content.innerHTML = `
      <div class="productionActionGridV740">
        <button id="newMaterialV740"><span>＋</span><strong>Nuevo insumo</strong><small>Materia prima, frasco o etiqueta</small></button>
        <button id="materialPurchaseV740"><span>↥</span><strong>Registrar compra</strong><small>Aumenta stock y recalcula costo</small></button>
        <button id="newProductionOrderV740"><span>▣</span><strong>Nueva orden</strong><small>Planifica producto e insumos</small></button>
      </div>
      ${low.length ? `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Atención</span><h2>Insumos con stock crítico</h2></div><button class="btn sm outline" id="goMaterialsV740">Ver todos</button></div>${low.slice(0, 6).map(materialLineV740).join('')}</section>` : ''}
      <section class="v7Panel">
        <div class="v7PanelHead"><div><span class="v7Eyebrow">Trabajo pendiente</span><h2>Órdenes abiertas</h2></div><button class="btn sm outline" id="goOrdersV740">Ver órdenes</button></div>
        ${openOrders.length ? openOrders.map(orderLineV740).join('') : '<div class="v7Empty small"><span>✓</span><p>No hay órdenes pendientes.</p></div>'}
      </section>
      <section class="v7Panel">
        <div class="v7PanelHead"><div><span class="v7Eyebrow">Trazabilidad</span><h2>Últimos lotes</h2></div><button class="btn sm outline" id="goBatchesV740">Ver lotes</button></div>
        ${batches.length ? batches.map(batchLineV740).join('') : '<div class="v7Empty small"><span>🌿</span><p>Aún no se completó ningún lote.</p></div>'}
      </section>
    `;
    $('#newMaterialV740').addEventListener('click', () => openRawMaterialFormV740());
    $('#materialPurchaseV740').addEventListener('click', () => openMaterialPickerV740('purchase'));
    $('#newProductionOrderV740').addEventListener('click', openProductionOrderFormV740);
    if ($('#goMaterialsV740')) $('#goMaterialsV740').addEventListener('click', () => { productionViewV740 = 'insumos'; renderProductionV740(); });
    $('#goOrdersV740').addEventListener('click', () => { productionViewV740 = 'ordenes'; renderProductionV740(); });
    $('#goBatchesV740').addEventListener('click', () => { productionViewV740 = 'lotes'; renderProductionV740(); });
    bindOrderLineActionsV740();
    bindBatchLineActionsV740();
  }

  function materialLineV740(material) {
    const low = Number(material.stock || 0) <= Number(material.minStock || 0);
    return `<div class="productionRowV740 ${low ? 'low' : ''}"><span><strong>${escapeHtml(material.name)}</strong><small>${escapeHtml(material.category)} · costo medio ${fmtMoney(material.averageCost)} / ${escapeHtml(material.unit)}</small></span><span><b>${Number(material.stock || 0).toLocaleString('es-BO')} ${escapeHtml(material.unit)}</b><small>mín. ${Number(material.minStock || 0).toLocaleString('es-BO')}</small></span></div>`;
  }

  function orderLineV740(order) {
    return `<div class="productionRowV740 order"><span><strong>${escapeHtml(order.productName || 'Producto')}</strong><small>${Number(order.plannedOutput || 0).toLocaleString('es-BO')} ${escapeHtml(order.outputUnit)} · ${fmtDate(order.createdAt)}</small></span><span>${statusBadgeV740(order.status)}<button class="productionArrowV740" data-order-detail="${order.id}">›</button></span></div>`;
  }

  function batchLineV740(batch) {
    return `<div class="productionRowV740 batch"><span><strong>${escapeHtml(batch.lotCode)}</strong><small>${escapeHtml(batch.productName)} · ${Number(batch.outputQty || 0).toLocaleString('es-BO')} ${escapeHtml(batch.outputUnit)}</small></span><span><b>${fmtMoney(batch.unitCost)}</b><small>por unidad</small><button class="productionArrowV740" data-batch-detail="${batch.id}">›</button></span></div>`;
  }

  function renderMaterialsViewV740() {
    const content = $('#productionContentV740');
    const materials = (AppState.rawMaterials || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    content.innerHTML = `
      <div class="toolrow productionToolbarV740"><button class="btn" id="addMaterialV740">+ Nuevo insumo</button><button class="btn outline" id="addMovementV740">Registrar movimiento</button></div>
      <section class="productionListV740">
        ${materials.map(m => {
          const low = m.active !== false && Number(m.stock || 0) <= Number(m.minStock || 0);
          return `<article class="productionMaterialCardV740 ${low ? 'low' : ''} ${m.active === false ? 'inactive' : ''}">
            <div class="productionMaterialTopV740"><span><small>${escapeHtml(m.category)}</small><strong>${escapeHtml(m.name)}</strong></span>${low ? '<em>Stock crítico</em>' : ''}</div>
            <div class="productionMaterialStatsV740"><div><span>Disponible</span><b>${Number(m.stock || 0).toLocaleString('es-BO')} ${escapeHtml(m.unit)}</b></div><div><span>Costo medio</span><b>${fmtMoney(m.averageCost)}</b></div><div><span>Valor</span><b>${fmtMoney(materialValueV740(m))}</b></div></div>
            ${m.supplier || m.note ? `<p>${escapeHtml([m.supplier ? `Proveedor: ${m.supplier}` : '', m.note].filter(Boolean).join(' · '))}</p>` : ''}
            <div class="productionCardActionsV740"><button class="btn sm materialMoveV740" data-id="${m.id}">Movimiento</button><button class="btn sm outline materialHistoryV740" data-id="${m.id}">Historial</button><button class="btn sm ghost materialEditV740" data-id="${m.id}">Editar</button></div>
          </article>`;
        }).join('') || '<div class="v7Empty"><span>📦</span><h3>Sin insumos registrados</h3><p>Crea la materia prima, frascos, tapas, etiquetas y empaques que utilizas.</p></div>'}
      </section>`;
    $('#addMaterialV740').addEventListener('click', () => openRawMaterialFormV740());
    $('#addMovementV740').addEventListener('click', () => openMaterialPickerV740('purchase'));
    $all('.materialMoveV740').forEach(btn => btn.addEventListener('click', () => openMaterialMovementV740(materials.find(m => m.id === btn.dataset.id))));
    $all('.materialHistoryV740').forEach(btn => btn.addEventListener('click', () => openMaterialHistoryV740(materials.find(m => m.id === btn.dataset.id))));
    $all('.materialEditV740').forEach(btn => btn.addEventListener('click', () => openRawMaterialFormV740(materials.find(m => m.id === btn.dataset.id))));
  }

  function renderOrdersViewV740() {
    const content = $('#productionContentV740');
    const orders = AppState.productionOrders || [];
    content.innerHTML = `
      <div class="toolrow productionToolbarV740"><button class="btn" id="newOrderV740">+ Nueva orden de producción</button></div>
      <section class="productionListV740">
        ${orders.map(order => `<article class="productionOrderCardV740">
          <div class="productionOrderTopV740"><span><small>${fmtDateTime(order.createdAt)}</small><strong>${escapeHtml(order.productName || 'Producto')}</strong></span>${statusBadgeV740(order.status)}</div>
          <div class="productionOrderPlanV740"><div><span>Meta</span><b>${Number(order.plannedOutput || 0).toLocaleString('es-BO')} ${escapeHtml(order.outputUnit)}</b></div><div><span>Insumos</span><b>${(order.plannedInputs || []).length}</b></div><div><span>Presentación</span><b>${order.presentationMl ? `${order.presentationMl} ml` : 'No indicada'}</b></div></div>
          ${order.note ? `<p>${escapeHtml(order.note)}</p>` : ''}
          <div class="productionCardActionsV740">
            <button class="btn sm outline orderDetailV740" data-id="${order.id}">Detalle</button>
            ${order.status === 'planned' ? `<button class="btn sm orderStartV740" data-id="${order.id}">Iniciar</button>` : ''}
            ${['planned', 'in_progress'].includes(order.status) ? `<button class="btn sm orderCompleteV740" data-id="${order.id}">Completar lote</button><button class="btn sm ghost orderCancelV740" data-id="${order.id}">Cancelar</button>` : ''}
          </div>
        </article>`).join('') || '<div class="v7Empty"><span>🧪</span><h3>Sin órdenes de producción</h3><p>Crea una orden para planificar qué producto fabricarás y qué insumos usarás.</p></div>'}
      </section>`;
    $('#newOrderV740').addEventListener('click', openProductionOrderFormV740);
    $all('.orderDetailV740').forEach(btn => btn.addEventListener('click', () => openProductionOrderDetailV740(orders.find(o => o.id === btn.dataset.id))));
    $all('.orderStartV740').forEach(btn => btn.addEventListener('click', () => handleOrderStatusV740(orders.find(o => o.id === btn.dataset.id), 'in_progress')));
    $all('.orderCompleteV740').forEach(btn => btn.addEventListener('click', () => openCompleteProductionV740(orders.find(o => o.id === btn.dataset.id))));
    $all('.orderCancelV740').forEach(btn => btn.addEventListener('click', () => handleOrderStatusV740(orders.find(o => o.id === btn.dataset.id), 'cancelled')));
  }

  function renderBatchesViewV740() {
    const content = $('#productionContentV740');
    const batches = AppState.productionBatches || [];
    content.innerHTML = `
      <section class="productionListV740">
        ${batches.map(batch => `<article class="productionBatchCardV740">
          <div class="productionBatchTopV740"><span><small>${fmtDateTime(batch.createdAt)}</small><strong>${escapeHtml(batch.lotCode)}</strong><em>${escapeHtml(batch.productName)}</em></span><button class="productionArrowV740 batchDetailV740" data-id="${batch.id}">›</button></div>
          <div class="productionBatchStatsV740"><div><span>Producción</span><b>${Number(batch.outputQty || 0).toLocaleString('es-BO')} ${escapeHtml(batch.outputUnit)}</b></div><div><span>Costo total</span><b>${fmtMoney(batch.totalCost)}</b></div><div><span>Costo unitario</span><b>${fmtMoney(batch.unitCost)}</b></div>${batch.costPerMl ? `<div><span>Costo por ml</span><b>${fmtMoney(batch.costPerMl)}</b></div>` : ''}</div>
        </article>`).join('') || '<div class="v7Empty"><span>🏷️</span><h3>Sin lotes terminados</h3><p>Los lotes aparecerán al completar una orden de producción.</p></div>'}
      </section>`;
    $all('.batchDetailV740').forEach(btn => btn.addEventListener('click', () => openProductionBatchDetailV740(batches.find(b => b.id === btn.dataset.id))));
  }

  function bindOrderLineActionsV740() {
    $all('[data-order-detail]').forEach(btn => btn.addEventListener('click', () => {
      const order = (AppState.productionOrders || []).find(o => o.id === btn.dataset.orderDetail);
      if (order) openProductionOrderDetailV740(order);
    }));
  }

  function bindBatchLineActionsV740() {
    $all('[data-batch-detail]').forEach(btn => btn.addEventListener('click', () => {
      const batch = (AppState.productionBatches || []).find(b => b.id === btn.dataset.batchDetail);
      if (batch) openProductionBatchDetailV740(batch);
    }));
  }

  function openRawMaterialFormV740(existing = null) {
    const isEdit = !!existing;
    openSheet(`
      <h2>${isEdit ? 'Editar insumo' : 'Nuevo insumo'} <span class="x" id="closeSheet">✕</span></h2>
      <div class="field"><label>Tipo de insumo</label><select id="materialCategoryV740">${MATERIAL_CATEGORIES_V740.map(c => `<option ${existing && existing.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Nombre *</label><input id="materialNameV740" value="${escapeHtml(existing ? existing.name : '')}" placeholder="Ej.: coco seco, frasco de 200 ml, etiqueta 200 ml"></div>
      <div class="field-row"><div class="field"><label>Unidad *</label><input id="materialUnitV740" value="${escapeHtml(existing ? existing.unit : '')}" placeholder="kg, unidad, litro, ml"></div><div class="field"><label>Stock mínimo</label><input id="materialMinV740" type="number" inputmode="decimal" step="0.01" min="0" value="${existing ? Number(existing.minStock || 0) : 0}"></div></div>
      <div class="field"><label>Proveedor</label><input id="materialSupplierV740" value="${escapeHtml(existing ? existing.supplier : '')}" placeholder="Nombre o referencia del proveedor"></div>
      <div class="field"><label>Observación</label><textarea id="materialNoteV740" rows="3">${escapeHtml(existing ? existing.note : '')}</textarea></div>
      ${!isEdit ? `<div class="productionInitialStockV740"><strong>Ingreso inicial opcional</strong><div class="field-row"><div class="field"><label>Cantidad inicial</label><input id="materialInitialQtyV740" type="number" inputmode="decimal" step="0.01" min="0"></div><div class="field"><label>Costo por unidad</label><input id="materialInitialCostV740" type="number" inputmode="decimal" step="0.0001" min="0"></div></div><label class="switchline"><span>Registrar este ingreso inicial como egreso del mes</span><input id="materialInitialExpenseV740" type="checkbox"></label></div>` : `<label class="switchline"><span>Insumo activo</span><input id="materialActiveV740" type="checkbox" ${existing.active !== false ? 'checked' : ''}></label>`}
      <button class="btn block" id="saveMaterialV740">${isEdit ? 'Guardar cambios' : 'Crear insumo'}</button>
      <div class="v7CashNotice">El stock no se edita manualmente. Se modifica mediante compras, ajustes o consumo de producción para conservar trazabilidad.</div>
    `, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#saveMaterialV740', overlay).addEventListener('click', async () => {
        const btn = $('#saveMaterialV740', overlay);
        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          const initialQty = !isEdit ? Number($('#materialInitialQtyV740', overlay).value || 0) : 0;
          const initialCost = !isEdit ? Number($('#materialInitialCostV740', overlay).value || 0) : 0;
          const initialExpense = !isEdit ? $('#materialInitialExpenseV740', overlay).checked : false;
          if (initialQty > 0 && initialCost <= 0) throw new Error('Para el ingreso inicial, indica el costo por unidad.');
          const saved = await saveRawMaterialV740({
            category: $('#materialCategoryV740', overlay).value,
            name: $('#materialNameV740', overlay).value,
            unit: $('#materialUnitV740', overlay).value,
            minStock: $('#materialMinV740', overlay).value,
            supplier: $('#materialSupplierV740', overlay).value,
            note: $('#materialNoteV740', overlay).value,
            active: isEdit ? $('#materialActiveV740', overlay).checked : true
          }, existing);
          if (!isEdit && initialQty > 0) {
            await registerRawMaterialMovementV740(saved, 'purchase', initialQty, initialCost, 'Ingreso inicial', initialExpense);
          }
          await refreshProductionV740({ refreshFinance: initialQty > 0 && initialExpense });
          close(); showToast(isEdit ? 'Insumo actualizado.' : 'Insumo creado.'); renderProductionV740();
        } catch (error) {
          btn.disabled = false; btn.textContent = isEdit ? 'Guardar cambios' : 'Crear insumo';
          showToast(error.message || 'No se pudo guardar el insumo.', 'error');
        }
      });
    });
  }

  function openMaterialPickerV740(defaultType = 'purchase') {
    const materials = (AppState.rawMaterials || []).filter(m => m.active !== false);
    if (!materials.length) return showToast('Primero crea un insumo.', 'error');
    openSheet(`<h2>Seleccionar insumo <span class="x" id="closeSheet">✕</span></h2><div class="productionPickerV740">${materials.map(m => `<button data-id="${m.id}"><span><strong>${escapeHtml(m.name)}</strong><small>${Number(m.stock || 0).toLocaleString('es-BO')} ${escapeHtml(m.unit)} disponibles</small></span><b>›</b></button>`).join('')}</div>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $all('[data-id]', overlay).forEach(btn => btn.addEventListener('click', () => {
        const material = materials.find(m => m.id === btn.dataset.id);
        close(); setTimeout(() => openMaterialMovementV740(material, defaultType), 80);
      }));
    });
  }

  function openMaterialMovementV740(material, defaultType = 'purchase') {
    if (!material) return;
    openSheet(`
      <h2>Movimiento de insumo <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CashNotice"><strong>${escapeHtml(material.name)}</strong><br>Disponible: <b>${Number(material.stock || 0).toLocaleString('es-BO')} ${escapeHtml(material.unit)}</b> · Costo medio: ${fmtMoney(material.averageCost)}</div>
      <div class="field"><label>Movimiento</label><select id="movementTypeV740">${Object.entries(MOVEMENT_LABELS_V740).filter(([key]) => key !== 'consume').map(([key, label]) => `<option value="${key}" ${key === defaultType ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field-row"><div class="field"><label>Cantidad (${escapeHtml(material.unit)})</label><input id="movementQtyV740" type="number" inputmode="decimal" step="0.01" min="0"></div><div class="field" id="movementCostFieldV740"><label>Costo por ${escapeHtml(material.unit)}</label><input id="movementCostV740" type="number" inputmode="decimal" step="0.0001" min="0"></div></div>
      <div class="productionCostPreviewV740" id="movementPreviewV740">Completa la cantidad y el costo.</div>
      <div class="field"><label>Nota</label><textarea id="movementNoteV740" rows="3" placeholder="Proveedor, factura, motivo del ajuste"></textarea></div>
      <label class="switchline" id="movementExpenseLineV740"><span>Registrar compra también en Finanzas y egresos</span><input id="movementExpenseV740" type="checkbox" checked></label>
      <button class="btn block" id="saveMovementV740">Guardar movimiento</button>
    `, (overlay, close) => {
      const update = () => {
        const type = $('#movementTypeV740', overlay).value;
        const qty = Number($('#movementQtyV740', overlay).value || 0);
        const cost = Number($('#movementCostV740', overlay).value || 0);
        $('#movementCostFieldV740', overlay).style.display = type === 'purchase' ? '' : 'none';
        $('#movementExpenseLineV740', overlay).style.display = type === 'purchase' ? '' : 'none';
        $('#movementPreviewV740', overlay).textContent = type === 'purchase' && qty > 0 && cost > 0
          ? `Compra total estimada: ${fmtMoney(qty * cost)}`
          : type === 'adjust_out' ? `Nuevo stock estimado: ${Math.max(0, Number(material.stock || 0) - qty).toLocaleString('es-BO')} ${material.unit}`
            : type === 'adjust_in' ? `Nuevo stock estimado: ${(Number(material.stock || 0) + qty).toLocaleString('es-BO')} ${material.unit}`
              : 'Completa los datos del movimiento.';
      };
      ['#movementTypeV740', '#movementQtyV740', '#movementCostV740'].forEach(sel => $(sel, overlay).addEventListener('input', update));
      update();
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#saveMovementV740', overlay).addEventListener('click', async () => {
        const btn = $('#saveMovementV740', overlay); btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          await registerRawMaterialMovementV740(material, $('#movementTypeV740', overlay).value, $('#movementQtyV740', overlay).value, $('#movementCostV740', overlay).value, $('#movementNoteV740', overlay).value, $('#movementExpenseV740', overlay).checked);
          await refreshProductionV740({ refreshFinance: $('#movementTypeV740', overlay).value === 'purchase' && $('#movementExpenseV740', overlay).checked }); close(); showToast('Movimiento registrado.'); renderProductionV740();
        } catch (error) { btn.disabled = false; btn.textContent = 'Guardar movimiento'; showToast(error.message || 'No se pudo registrar.', 'error'); }
      });
    });
  }

  function openMaterialHistoryV740(material) {
    if (!material) return;
    const rows = (AppState.rawMaterialMovements || []).filter(m => m.materialId === material.id).slice(0, 100);
    openSheet(`<h2>Historial de ${escapeHtml(material.name)} <span class="x" id="closeSheet">✕</span></h2><div class="productionHistoryV740">${rows.map(row => `<div><span><strong>${escapeHtml(MOVEMENT_LABELS_V740[row.movementType] || row.movementType)}</strong><small>${fmtDateTime(row.createdAt)}${row.note ? ` · ${escapeHtml(row.note)}` : ''}</small></span><span class="${['consume','adjust_out'].includes(row.movementType) ? 'out' : 'in'}"><b>${['consume','adjust_out'].includes(row.movementType) ? '−' : '+'}${Number(row.quantity).toLocaleString('es-BO')} ${escapeHtml(material.unit)}</b><small>${fmtMoney(row.totalCost)}</small></span></div>`).join('') || '<div class="v7Empty small"><p>Sin movimientos registrados.</p></div>'}</div>`, (overlay, close) => $('#closeSheet', overlay).addEventListener('click', close));
  }

  function guessPresentationMlV740(product) {
    const direct = Number(product.presentationMl || product.volumeMl || product.ml || 0);
    if (direct > 0) return direct;
    const match = String(product.name || '').match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
    return match ? Number(match[1].replace(',', '.')) : 0;
  }

  function openProductionOrderFormV740() {
    const products = (AppState.products || []).filter(p => p.status !== 'archived');
    const materials = (AppState.rawMaterials || []).filter(m => m.active !== false);
    if (!products.length) return showToast('Primero registra productos terminados.', 'error');
    if (!materials.length) return showToast('Primero registra los insumos de producción.', 'error');

    openSheet(`
      <h2>Nueva orden de producción <span class="x" id="closeSheet">✕</span></h2>
      <div class="field"><label>Producto terminado *</label><select id="orderProductV740"><option value="">Seleccionar…</option>${products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <div class="field-row"><div class="field"><label>Cantidad planificada *</label><input id="orderOutputV740" type="number" inputmode="decimal" step="0.01" min="0"></div><div class="field"><label>Unidad de salida</label><input id="orderUnitV740" value="unidades"></div></div>
      <div class="field"><label>Contenido por unidad (ml, opcional)</label><input id="orderPresentationV740" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Ej.: 200"></div>
      <div class="productionInputsBuilderV740"><div class="productionBuilderHeadV740"><strong>Insumos planificados</strong><button class="btn sm outline" id="addInputRowV740">+ Agregar</button></div><div id="inputRowsV740"></div></div>
      <div class="field"><label>Observación</label><textarea id="orderNoteV740" rows="3" placeholder="Meta, responsable o detalle del lote"></textarea></div>
      <button class="btn block" id="saveOrderV740">Crear orden</button>
    `, (overlay, close) => {
      const rows = $('#inputRowsV740', overlay);
      const addRow = (selectedId = '', qty = '') => {
        const row = document.createElement('div'); row.className = 'productionInputBuilderRowV740';
        row.innerHTML = `<select class="inputMaterialV740"><option value="">Insumo…</option>${materials.map(m => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${escapeHtml(m.name)} (${escapeHtml(m.unit)})</option>`).join('')}</select><input class="inputQtyV740" type="number" inputmode="decimal" step="0.01" min="0" value="${qty}" placeholder="Cantidad"><button type="button" class="removeInputV740">✕</button>`;
        rows.appendChild(row);
        $('.removeInputV740', row).addEventListener('click', () => row.remove());
      };
      addRow();
      $('#addInputRowV740', overlay).addEventListener('click', () => addRow());
      $('#orderProductV740', overlay).addEventListener('change', () => {
        const p = products.find(x => x.id === $('#orderProductV740', overlay).value);
        if (p) $('#orderPresentationV740', overlay).value = guessPresentationMlV740(p) || '';
      });
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#saveOrderV740', overlay).addEventListener('click', async () => {
        const btn = $('#saveOrderV740', overlay); btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          const plannedInputs = $all('.productionInputBuilderRowV740', overlay).map(row => {
            const material = materials.find(m => m.id === $('.inputMaterialV740', row).value);
            return material ? { materialId: material.id, materialName: material.name, unit: material.unit, quantity: Number($('.inputQtyV740', row).value || 0) } : null;
          }).filter(Boolean);
          await saveProductionOrderV740({
            productId: $('#orderProductV740', overlay).value,
            plannedOutput: $('#orderOutputV740', overlay).value,
            outputUnit: $('#orderUnitV740', overlay).value,
            presentationMl: $('#orderPresentationV740', overlay).value,
            plannedInputs,
            note: $('#orderNoteV740', overlay).value
          });
          await refreshProductionV740(); close(); productionViewV740 = 'ordenes'; showToast('Orden de producción creada.'); renderProductionV740();
        } catch (error) { btn.disabled = false; btn.textContent = 'Crear orden'; showToast(error.message || 'No se pudo crear la orden.', 'error'); }
      });
    });
  }

  async function handleOrderStatusV740(order, status) {
    if (!order) return;
    if (status === 'cancelled' && !confirmDialog('¿Cancelar esta orden? No se descontarán insumos.')) return;
    try {
      await updateProductionOrderStatusV740(order, status);
      await refreshProductionV740();
      showToast(status === 'in_progress' ? 'Orden iniciada.' : 'Orden cancelada.');
      renderProductionV740();
    } catch (error) { showToast(error.message || 'No se pudo actualizar la orden.', 'error'); }
  }

  function openCompleteProductionV740(order) {
    if (!order) return;
    const materials = AppState.rawMaterials || [];
    const planned = (order.plannedInputs || []).map(item => {
      const material = materials.find(m => m.id === item.materialId);
      return Object.assign({}, item, { material });
    }).filter(x => x.material);
    if (!planned.length) return showToast('La orden no tiene insumos válidos.', 'error');
    const lotCode = generatedLotCodeV740();
    openSheet(`
      <h2>Completar producción <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CashNotice"><strong>${escapeHtml(order.productName)}</strong><br>Meta: ${Number(order.plannedOutput || 0).toLocaleString('es-BO')} ${escapeHtml(order.outputUnit)}</div>
      <div class="field"><label>Código de lote *</label><input id="completeLotV740" value="${escapeHtml(lotCode)}"></div>
      <div class="field-row"><div class="field"><label>Cantidad obtenida *</label><input id="completeOutputV740" type="number" inputmode="decimal" step="0.01" min="0" value="${Number(order.plannedOutput || 0)}"></div><div class="field"><label>Unidad de salida</label><input id="completeUnitV740" value="${escapeHtml(order.outputUnit || 'unidades')}"></div></div>
      <div class="field"><label>Contenido por unidad (ml)</label><input id="completePresentationV740" type="number" inputmode="decimal" step="0.01" min="0" value="${Number(order.presentationMl || 0) || ''}"></div>
      <div class="productionActualInputsV740"><strong>Consumo real de insumos</strong>${planned.map(item => `<div class="productionActualInputRowV740" data-material-id="${item.material.id}"><span><b>${escapeHtml(item.material.name)}</b><small>Disponible: ${Number(item.material.stock || 0).toLocaleString('es-BO')} ${escapeHtml(item.material.unit)} · costo ${fmtMoney(item.material.averageCost)}</small></span><input class="actualQtyV740" type="number" inputmode="decimal" step="0.01" min="0" value="${Number(item.quantity || 0)}"><em>${escapeHtml(item.material.unit)}</em></div>`).join('')}</div>
      <div class="field"><label>Mano de obra y otros costos directos (Bs)</label><input id="completeDirectCostV740" type="number" inputmode="decimal" step="0.01" min="0" value="0"></div>
      <div class="productionCostPreviewV740" id="completePreviewV740"></div>
      <div class="field"><label>Observación del lote</label><textarea id="completeNoteV740" rows="3"></textarea></div>
      <button class="btn block" id="completeOrderV740">Confirmar lote y actualizar stock</button>
      <div class="v7CashNotice">La confirmación es atómica: descuenta insumos, crea el lote, calcula costos y aumenta el stock del producto terminado en una sola operación de Supabase.</div>
    `, (overlay, close) => {
      const update = () => {
        const inputCost = $all('.productionActualInputRowV740', overlay).reduce((sum, row) => {
          const material = materials.find(m => m.id === row.dataset.materialId);
          return sum + Number($('.actualQtyV740', row).value || 0) * Number(material ? material.averageCost : 0);
        }, 0);
        const direct = Number($('#completeDirectCostV740', overlay).value || 0);
        const output = Number($('#completeOutputV740', overlay).value || 0);
        const total = inputCost + direct;
        $('#completePreviewV740', overlay).innerHTML = `<span>Insumos <b>${fmtMoney(inputCost)}</b></span><span>Costo total <b>${fmtMoney(total)}</b></span><span>Costo unitario <b>${output > 0 ? fmtMoney(total / output) : fmtMoney(0)}</b></span>`;
      };
      $all('input', overlay).forEach(input => input.addEventListener('input', update)); update();
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#completeOrderV740', overlay).addEventListener('click', async () => {
        const btn = $('#completeOrderV740', overlay); btn.disabled = true; btn.textContent = 'Procesando lote…';
        try {
          const actualInputs = $all('.productionActualInputRowV740', overlay).map(row => ({ materialId: row.dataset.materialId, quantity: Number($('.actualQtyV740', row).value || 0) }));
          const shortages = actualInputs.map(input => {
            const material = materials.find(m => m.id === input.materialId);
            return material && input.quantity > Number(material.stock || 0) ? `${material.name}: disponible ${material.stock}, requerido ${input.quantity}` : '';
          }).filter(Boolean);
          if (shortages.length) throw new Error(`Stock insuficiente. ${shortages.join(' | ')}`);
          await completeProductionOrderV740(order, {
            lotCode: $('#completeLotV740', overlay).value,
            outputQty: $('#completeOutputV740', overlay).value,
            outputUnit: $('#completeUnitV740', overlay).value,
            presentationMl: $('#completePresentationV740', overlay).value,
            actualInputs,
            directCost: $('#completeDirectCostV740', overlay).value,
            note: $('#completeNoteV740', overlay).value
          });
          await refreshProductionV740({ refreshProducts: true });
          close(); productionViewV740 = 'lotes'; showToast('Lote completado y stock actualizado.'); renderProductionV740();
        } catch (error) { btn.disabled = false; btn.textContent = 'Confirmar lote y actualizar stock'; showToast(error.message || 'No se pudo completar la producción.', 'error'); }
      });
    });
  }

  function openProductionOrderDetailV740(order) {
    if (!order) return;
    const batch = (AppState.productionBatches || []).find(b => b.orderId === order.id);
    openSheet(`<h2>Orden de producción <span class="x" id="closeSheet">✕</span></h2><div class="productionDetailHeroV740"><span>${statusBadgeV740(order.status)}</span><h3>${escapeHtml(order.productName)}</h3><p>Meta: ${Number(order.plannedOutput || 0).toLocaleString('es-BO')} ${escapeHtml(order.outputUnit)}${order.presentationMl ? ` · ${order.presentationMl} ml por unidad` : ''}</p></div><div class="productionDetailListV740"><strong>Insumos planificados</strong>${(order.plannedInputs || []).map(item => `<div><span>${escapeHtml(item.materialName || item.materialId)}</span><b>${Number(item.quantity || 0).toLocaleString('es-BO')} ${escapeHtml(item.unit || '')}</b></div>`).join('')}</div>${order.note ? `<div class="v7CashNotice">${escapeHtml(order.note)}</div>` : ''}${batch ? `<button class="btn block" id="viewBatchFromOrderV740">Ver lote ${escapeHtml(batch.lotCode)}</button>` : ''}`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      if ($('#viewBatchFromOrderV740', overlay)) $('#viewBatchFromOrderV740', overlay).addEventListener('click', () => { close(); setTimeout(() => openProductionBatchDetailV740(batch), 80); });
    });
  }

  function openProductionBatchDetailV740(batch) {
    if (!batch) return;
    openSheet(`<h2>Lote ${escapeHtml(batch.lotCode)} <span class="x" id="closeSheet">✕</span></h2><div class="productionDetailHeroV740 completed"><span>Completado ${fmtDateTime(batch.createdAt)}</span><h3>${escapeHtml(batch.productName)}</h3><p>${Number(batch.outputQty || 0).toLocaleString('es-BO')} ${escapeHtml(batch.outputUnit)}${batch.presentationMl ? ` · ${batch.presentationMl} ml por unidad` : ''}</p></div><div class="productionCostGridV740"><div><span>Costo de insumos</span><b>${fmtMoney(batch.inputCost)}</b></div><div><span>Costos directos</span><b>${fmtMoney(batch.directCost)}</b></div><div><span>Costo total</span><b>${fmtMoney(batch.totalCost)}</b></div><div><span>Costo unitario</span><b>${fmtMoney(batch.unitCost)}</b></div>${batch.costPerMl ? `<div><span>Costo por ml</span><b>${fmtMoney(batch.costPerMl)}</b></div>` : ''}</div><div class="productionDetailListV740"><strong>Consumo real</strong>${(batch.actualInputs || []).map(item => `<div><span>${escapeHtml(item.materialName || item.materialId)}</span><b>${Number(item.quantity || 0).toLocaleString('es-BO')} ${escapeHtml(item.unit || '')} · ${fmtMoney(item.totalCost || 0)}</b></div>`).join('')}</div>${batch.note ? `<div class="v7CashNotice">${escapeHtml(batch.note)}</div>` : ''}`, (overlay, close) => $('#closeSheet', overlay).addEventListener('click', close));
  }

  Object.assign(window, {
    syncProductionCloudToLocalV740,
    renderProductionV740,
    saveRawMaterialV740,
    registerRawMaterialMovementV740,
    saveProductionOrderV740,
    updateProductionOrderStatusV740,
    completeProductionOrderV740,
    openRawMaterialFormV740,
    openMaterialMovementV740,
    openProductionOrderFormV740,
    openCompleteProductionV740
  });
})();
