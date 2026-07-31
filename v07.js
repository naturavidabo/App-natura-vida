'use strict';

const V07_VERSION = '0.8.0';
const originalRenderModuleV06 = renderModule;
const originalPushQueueItemV06 = pushQueueItem;
const originalPullRemoteCoreDataV06 = pullRemoteCoreData;
const originalVerifyDataIntegrityV06 = verifyDataIntegrity;
let recipeDraftItems = [];
let currentMarketListId = null;

function numberInput(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function localProductById(id) {
  return products.find(item => item.id === id);
}

function ingredientById(id, ingredients = []) {
  return ingredients.find(item => item.id === id);
}

function recipeUnitCost(recipe, items, ingredients) {
  const direct = items.reduce((sum, item) => {
    const ingredient = ingredientById(item.ingredientId, ingredients);
    return sum + numberInput(item.quantity) * numberInput(ingredient?.averageCost);
  }, 0);
  const yieldQuantity = Math.max(0.001, numberInput(recipe?.yieldQuantity, 1));
  const indirect = Math.max(0, numberInput(recipe?.indirectCost));
  return { direct, indirect, batch: direct + indirect, unit: (direct + indirect) / yieldQuantity };
}

function safeImageFallbackHTML(product, className, hidden = false) {
  return `<span class="${className} image-fallback" aria-hidden="true" ${hidden ? 'hidden' : ''}>${escapeHTML(product.emoji || '🍽️')}</span>`;
}

productVisualHTML = function(product, admin = false) {
  const className = admin ? 'admin-product-photo' : 'product-photo';
  if (product.imageUrl) {
    return `<img class="${className}" src="${escapeHTML(product.imageUrl)}" alt="${escapeHTML(product.name)}" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />${safeImageFallbackHTML(product, admin ? 'admin-fallback' : 'food-emoji', true)}`;
  }
  return safeImageFallbackHTML(product, admin ? 'admin-fallback' : 'food-emoji');
};

async function loadImageElement(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function optimizeProductImage(file) {
  const image = await loadImageElement(file);
  const width = 1200;
  const height = 900;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#fff8ed');
  gradient.addColorStop(0.48, '#ffe49a');
  gradient.addColorStop(1, '#ffb21e');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const margin = 44;
  const availableWidth = width - margin * 2;
  const availableHeight = height - margin * 2;
  const scale = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight);
  const drawWidth = Math.max(1, image.naturalWidth * scale);
  const drawHeight = Math.max(1, image.naturalHeight * scale);
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  context.save();
  context.shadowColor = 'rgba(76, 20, 0, .22)';
  context.shadowBlur = 28;
  context.shadowOffsetY = 12;
  context.drawImage(image, x, y, drawWidth, drawHeight);
  context.restore();

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.88));
  if (!blob) throw new Error('No se pudo optimizar la fotografía.');
  return new File([blob], `${String(file.name || 'producto').replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' });
}

uploadProductImage = async function(file, productId) {
  if (!file) return null;
  if (!supabaseClient || !authContext || authContext.offline || !navigator.onLine) throw new Error('Conéctate a internet para subir la fotografía.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La fotografía supera 5 MB.');
  const optimized = await optimizeProductImage(file);
  const path = `${authContext.businessId}/${productId}.webp`;
  const { error } = await supabaseClient.storage.from('product-images').upload(path, optimized, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '3600'
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from('product-images').getPublicUrl(path);
  return { imageUrl: `${data.publicUrl}?v=${Date.now()}`, imagePath: path, imageWidth: 1200, imageHeight: 900 };
};

async function loadRecipeData() {
  const [recipes, items, ingredients] = await Promise.all([
    getAllRecords('recipesLocal'),
    getAllRecords('recipeItemsLocal'),
    loadInventoryLocal()
  ]);
  return { recipes, items, ingredients };
}

async function renderRecipesModule() {
  const { recipes, items, ingredients } = await loadRecipeData();
  const recipeByProduct = new Map(recipes.filter(item => item.active !== false).map(item => [item.productId, item]));
  const eligibleProducts = products.filter(product => product.active !== false && product.category !== 'Bebidas');
  const rows = eligibleProducts.map(product => {
    const recipe = recipeByProduct.get(product.id);
    const recipeItems = recipe ? items.filter(item => item.recipeId === recipe.id && item.active !== false) : [];
    const cost = recipe ? recipeUnitCost(recipe, recipeItems, ingredients) : { direct: 0, indirect: 0, batch: 0, unit: 0 };
    const margin = numberInput(product.price) - cost.unit;
    const percentage = numberInput(product.price) > 0 ? margin / numberInput(product.price) * 100 : 0;
    const incomplete = !recipe || !recipeItems.length || recipeItems.some(line => !numberInput(ingredientById(line.ingredientId, ingredients)?.averageCost));
    return `<article class="recipe-card ${incomplete ? 'incomplete' : ''}">
      <div class="recipe-card-photo">${productVisualHTML(product, true)}</div>
      <div class="recipe-card-main"><b>${escapeHTML(product.name)}</b><small>${recipeItems.length} insumo(s) · rendimiento ${inventoryNumber(recipe?.yieldQuantity || 1)}</small><span class="recipe-state">${recipe ? (incomplete ? 'Costo incompleto' : 'Costo calculado') : 'Sin receta'}</span></div>
      <div class="recipe-metrics"><span>Costo unitario <b>${money(cost.unit)}</b></span><span>Precio <b>${money(product.price)}</b></span><span>Margen <b class="${margin < 0 ? 'negative' : ''}">${money(margin)} · ${inventoryNumber(percentage)}%</b></span></div>
      <button class="secondary-action edit-recipe" data-product-id="${escapeHTML(product.id)}">${recipe ? 'Editar receta' : 'Crear receta'}</button>
    </article>`;
  }).join('');
  const configured = recipes.filter(recipe => recipe.active !== false).length;
  const totalEstimated = eligibleProducts.reduce((sum, product) => {
    const recipe = recipeByProduct.get(product.id);
    if (!recipe) return sum;
    return sum + recipeUnitCost(recipe, items.filter(item => item.recipeId === recipe.id), ingredients).unit;
  }, 0);
  return `<div class="module-summary"><div><small>Recetas configuradas</small><strong>${configured}</strong></div><div><small>Insumos disponibles</small><strong>${ingredients.length}</strong></div><div><small>Costo unitario acumulado</small><strong>${money(totalEstimated)}</strong></div><button id="newRecipeBtn" class="primary-action">＋ Nueva receta</button></div><div class="recipe-list">${rows || '<div class="empty-state">Todavía no existen productos configurables.</div>'}</div>`;
}

function recipeLineHTML(line, index, ingredients) {
  const ingredient = ingredientById(line.ingredientId, ingredients);
  return `<div class="recipe-line" data-index="${index}">
    <label>Insumo<select class="recipe-ingredient">${ingredients.map(item => `<option value="${item.id}" ${item.id === line.ingredientId ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></label>
    <label>Cantidad<input class="recipe-quantity" type="number" min="0.0001" step="0.0001" value="${numberInput(line.quantity, 1)}" required /><small>${escapeHTML(ingredient?.baseUnit || '')}</small></label>
    <div class="recipe-line-cost"><span>Costo</span><b>${money(numberInput(line.quantity) * numberInput(ingredient?.averageCost))}</b></div>
    <button type="button" class="remove-recipe-line" aria-label="Quitar insumo">×</button>
  </div>`;
}

async function renderRecipeDraft() {
  const ingredients = await loadInventoryLocal();
  const container = $('recipeLines');
  if (!ingredients.length) {
    container.innerHTML = '<div class="notice-box">Primero crea los insumos en Inventario.</div>';
    $('addRecipeLine').disabled = true;
    updateRecipePreview([], ingredients);
    return;
  }
  $('addRecipeLine').disabled = false;
  if (!recipeDraftItems.length) recipeDraftItems = [{ id: uid(), ingredientId: ingredients[0].id, quantity: 1 }];
  container.innerHTML = recipeDraftItems.map((line, index) => recipeLineHTML(line, index, ingredients)).join('');
  container.querySelectorAll('.recipe-line').forEach(row => {
    const index = Number(row.dataset.index);
    const ingredientSelect = row.querySelector('.recipe-ingredient');
    const quantityInput = row.querySelector('.recipe-quantity');
    ingredientSelect.onchange = () => { recipeDraftItems[index].ingredientId = ingredientSelect.value; renderRecipeDraft(); };
    quantityInput.oninput = () => { recipeDraftItems[index].quantity = numberInput(quantityInput.value); updateRecipePreview(recipeDraftItems, ingredients); row.querySelector('.recipe-line-cost b').textContent = money(numberInput(quantityInput.value) * numberInput(ingredientById(ingredientSelect.value, ingredients)?.averageCost)); };
    row.querySelector('.remove-recipe-line').onclick = () => { recipeDraftItems.splice(index, 1); renderRecipeDraft(); };
  });
  updateRecipePreview(recipeDraftItems, ingredients);
}

function updateRecipePreview(items = recipeDraftItems, ingredients = []) {
  const preview = $('recipeCostPreview');
  if (!preview) return;
  const recipe = { yieldQuantity: numberInput($('recipeYield')?.value, 1), indirectCost: numberInput($('recipeIndirectCost')?.value) };
  const product = localProductById($('recipeProduct')?.value);
  const cost = recipeUnitCost(recipe, items, ingredients);
  const margin = numberInput(product?.price) - cost.unit;
  const percentage = numberInput(product?.price) > 0 ? margin / numberInput(product.price) * 100 : 0;
  preview.innerHTML = `<div><span>Ingredientes</span><b>${money(cost.direct)}</b></div><div><span>Indirectos</span><b>${money(cost.indirect)}</b></div><div><span>Costo por unidad</span><b>${money(cost.unit)}</b></div><div><span>Margen estimado</span><b class="${margin < 0 ? 'negative' : ''}">${money(margin)} · ${inventoryNumber(percentage)}%</b></div>`;
}

async function openRecipeDialog(productId = '') {
  if (!canManageBusiness()) return toast('Solo la propietaria o el administrador pueden configurar recetas.');
  const ingredients = await loadInventoryLocal();
  if (!ingredients.length) return toast('Primero crea los insumos del inventario.');
  const eligible = products.filter(product => product.active !== false && product.category !== 'Bebidas');
  $('recipeProduct').innerHTML = eligible.map(product => `<option value="${product.id}">${escapeHTML(product.name)}</option>`).join('');
  const selectedProductId = productId || eligible[0]?.id;
  $('recipeProduct').value = selectedProductId;
  const recipes = await getAllRecords('recipesLocal');
  const recipe = recipes.find(item => item.productId === selectedProductId && item.active !== false);
  $('recipeId').value = recipe?.id || '';
  $('recipeYield').value = recipe?.yieldQuantity || 1;
  $('recipeIndirectCost').value = recipe?.indirectCost || 0;
  recipeDraftItems = recipe ? (await getAllRecords('recipeItemsLocal')).filter(item => item.recipeId === recipe.id && item.active !== false).map(item => ({ ...item })) : [];
  $('recipeDialogTitle').textContent = recipe ? 'Editar receta' : 'Crear receta';
  await renderRecipeDraft();
  $('recipeDialog').showModal();
}

async function switchRecipeProduct() {
  const productId = $('recipeProduct').value;
  if ($('recipeDialog').open) $('recipeDialog').close();
  await openRecipeDialog(productId);
}

async function saveRecipe(event) {
  event.preventDefault();
  if (!canManageBusiness()) return toast('No tienes permiso para modificar recetas.');
  const productId = $('recipeProduct').value;
  const product = localProductById(productId);
  if (!product) return toast('No se encontró el producto.');
  const ingredients = await loadInventoryLocal();
  const validItems = recipeDraftItems
    .map(item => ({ ...item, quantity: numberInput(item.quantity) }))
    .filter(item => item.ingredientId && item.quantity > 0);
  if (!validItems.length) return toast('Agrega al menos un insumo con cantidad mayor a cero.');
  const duplicated = validItems.some((item, index) => validItems.findIndex(other => other.ingredientId === item.ingredientId) !== index);
  if (duplicated) return toast('Un insumo está repetido. Mantén una sola línea por insumo.');
  const existingId = $('recipeId').value;
  const recipeId = existingId || uid();
  const existing = existingId ? await getRecord('recipesLocal', existingId) : null;
  const oldItems = (await getAllRecords('recipeItemsLocal')).filter(item => item.recipeId === recipeId);
  const recipe = {
    ...(existing || {}), id: recipeId, productId,
    yieldQuantity: Math.max(0.001, numberInput($('recipeYield').value, 1)),
    indirectCost: Math.max(0, numberInput($('recipeIndirectCost').value)), active: true,
    createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION
  };
  const items = validItems.map(item => ({
    id: item.id || uid(), recipeId, ingredientId: item.ingredientId, quantity: item.quantity,
    active: true, createdAt: item.createdAt || nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION
  }));
  const transaction = db.transaction(['recipesLocal', 'recipeItemsLocal', 'syncQueue', 'auditLogs'], 'readwrite');
  transaction.objectStore('recipesLocal').put(recipe);
  oldItems.forEach(item => transaction.objectStore('recipeItemsLocal').delete(item.id));
  items.forEach(item => transaction.objectStore('recipeItemsLocal').put(item));
  transaction.objectStore('syncQueue').put(queueRecord('recipesLocal', { recipe, items }));
  const cost = recipeUnitCost(recipe, items, ingredients);
  transaction.objectStore('auditLogs').put({ id: uid(), action: existing ? 'recipe_updated' : 'recipe_created', entity: 'recipesLocal', entityId: recipeId, details: { product: product.name, items: items.length, unitCost: cost.unit }, createdAt: nowIso(), appVersion: APP_VERSION });
  await transactionPromise(transaction);
  $('recipeDialog').close();
  await renderModule('recipes');
  await refreshStatus();
  scheduleAutoBackup('actualización de recetas');
  toast('Receta y costo guardados.');
}

async function getCurrentMarketList() {
  const lists = (await getAllRecords('marketListsLocal')).filter(item => !['completed', 'cancelled'].includes(item.status));
  return lists.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
}

async function ensureMarketList() {
  let list = await getCurrentMarketList();
  if (list) return list;
  list = { id: uid(), date: localDateKey(), status: 'draft', notes: '', createdAt: nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION };
  const tx = db.transaction(['marketListsLocal', 'syncQueue', 'auditLogs'], 'readwrite');
  tx.objectStore('marketListsLocal').put(list);
  tx.objectStore('syncQueue').put(queueRecord('marketListsLocal', { list, items: [] }));
  tx.objectStore('auditLogs').put({ id: uid(), action: 'market_list_created', entity: 'marketListsLocal', entityId: list.id, details: { date: list.date }, createdAt: nowIso(), appVersion: APP_VERSION });
  await transactionPromise(tx);
  return list;
}

async function marketPayload(listId) {
  const list = await getRecord('marketListsLocal', listId);
  const items = (await getAllRecords('marketListItemsLocal')).filter(item => item.marketListId === listId && item.active !== false);
  return { list, items };
}

async function queueMarketList(listId) {
  const payload = await marketPayload(listId);
  await putRecord('syncQueue', queueRecord('marketListsLocal', payload));
}

async function renderMarketModule() {
  const list = await getCurrentMarketList();
  if (!list) return `<div class="market-empty"><div class="market-empty-icon">✓</div><h2>Prepara tu lista de mercado</h2><p>Puedes agregar artículos manualmente o generar sugerencias según el stock mínimo.</p><button id="createMarketListBtn" class="primary-action">Crear lista de hoy</button></div>`;
  currentMarketListId = list.id;
  const items = (await getAllRecords('marketListItemsLocal')).filter(item => item.marketListId === list.id && item.active !== false);
  const checked = items.filter(item => item.checked).length;
  const rows = items.map(item => `<article class="market-row ${item.checked ? 'checked' : ''}">
    <button class="market-check" data-id="${item.id}" aria-label="${item.checked ? 'Desmarcar' : 'Marcar comprado'}">${item.checked ? '✓' : ''}</button>
    <div class="market-main"><b>${escapeHTML(item.description)}</b><small>${inventoryNumber(item.plannedQuantity || 0)} ${escapeHTML(item.purchaseUnit || '')}${item.note ? ` · ${escapeHTML(item.note)}` : ''}</small></div>
    <div class="market-actions">${item.ingredientId ? `<button class="button-light buy-market-item" data-id="${item.id}">Registrar compra</button>` : ''}<button class="text-button edit-market-item" data-id="${item.id}">Editar</button><button class="text-button remove-market-item" data-id="${item.id}">Quitar</button></div>
  </article>`).join('');
  return `<div class="module-summary"><div><small>Lista activa</small><strong>${new Date(`${list.date}T12:00:00`).toLocaleDateString('es-BO')}</strong></div><div><small>Artículos</small><strong>${items.length}</strong></div><div><small>Marcados</small><strong>${checked}/${items.length}</strong></div><button id="addMarketItemBtn" class="primary-action">＋ Agregar artículo</button></div>
  <div class="market-toolbar"><button id="suggestMarketBtn" class="secondary-action">⚠ Sugerir faltantes</button><button id="completeMarketBtn" class="button-light" ${!items.length ? 'disabled' : ''}>Finalizar lista</button><button id="newMarketListBtn" class="text-button">Crear otra lista</button></div>
  <div class="market-list">${rows || '<div class="empty-state">La lista está vacía. Agrega un artículo o usa “Sugerir faltantes”.</div>'}</div>`;
}

async function createNewMarketList(force = false) {
  const active = await getCurrentMarketList();
  if (active && !force) return active;
  if (active && force) {
    active.status = 'completed';
    active.updatedAt = nowIso();
    await putRecord('marketListsLocal', active);
    await queueMarketList(active.id);
  }
  const list = { id: uid(), date: localDateKey(), status: 'draft', notes: '', createdAt: nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION };
  await putRecord('marketListsLocal', list);
  await queueMarketList(list.id);
  currentMarketListId = list.id;
  await renderModule('market');
  scheduleAutoBackup('lista de mercado');
  toast('Lista de mercado creada.');
  return list;
}

async function openMarketItemDialog(item = null) {
  const list = await ensureMarketList();
  currentMarketListId = list.id;
  const ingredients = await loadInventoryLocal();
  $('marketIngredient').innerHTML = '<option value="">Artículo manual</option>' + ingredients.map(ingredient => `<option value="${ingredient.id}">${escapeHTML(ingredient.name)}</option>`).join('');
  $('marketItemId').value = item?.id || '';
  $('marketListId').value = list.id;
  $('marketIngredient').value = item?.ingredientId || '';
  $('marketDescription').value = item?.description || '';
  $('marketPlannedQuantity').value = item?.plannedQuantity ?? 1;
  $('marketPurchaseUnit').value = item?.purchaseUnit || '';
  $('marketItemNote').value = item?.note || '';
  $('marketItemTitle').textContent = item ? 'Editar artículo' : 'Agregar artículo';
  $('marketItemDialog').showModal();
}

function fillMarketFromIngredient() {
  loadInventoryLocal().then(ingredients => {
    const selected = ingredientById($('marketIngredient').value, ingredients);
    if (!selected) return;
    $('marketDescription').value = selected.name;
    $('marketPurchaseUnit').value = selected.purchaseUnit || selected.baseUnit;
  });
}

async function saveMarketItem(event) {
  event.preventDefault();
  const listId = $('marketListId').value;
  const id = $('marketItemId').value || uid();
  const existing = await getRecord('marketListItemsLocal', id);
  const item = {
    ...(existing || {}), id, marketListId: listId, ingredientId: $('marketIngredient').value || null,
    description: $('marketDescription').value.trim(), plannedQuantity: Math.max(0, numberInput($('marketPlannedQuantity').value)),
    purchaseUnit: $('marketPurchaseUnit').value.trim(), note: $('marketItemNote').value.trim(), checked: existing?.checked || false,
    active: true, createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION
  };
  if (!item.description) return toast('Escribe el artículo que se comprará.');
  const list = await getRecord('marketListsLocal', listId);
  list.updatedAt = nowIso();
  const tx = db.transaction(['marketListsLocal', 'marketListItemsLocal', 'auditLogs'], 'readwrite');
  tx.objectStore('marketListsLocal').put(list);
  tx.objectStore('marketListItemsLocal').put(item);
  tx.objectStore('auditLogs').put({ id: uid(), action: existing ? 'market_item_updated' : 'market_item_created', entity: 'marketListItemsLocal', entityId: item.id, details: { description: item.description, plannedQuantity: item.plannedQuantity }, createdAt: nowIso(), appVersion: APP_VERSION });
  await transactionPromise(tx);
  await queueMarketList(listId);
  $('marketItemDialog').close();
  await renderModule('market');
  await refreshStatus();
  scheduleAutoBackup('lista de mercado');
  toast('Artículo guardado.');
}

async function toggleMarketItem(id) {
  const item = await getRecord('marketListItemsLocal', id);
  if (!item) return;
  item.checked = !item.checked;
  item.updatedAt = nowIso();
  const tx = db.transaction(['marketListItemsLocal', 'auditLogs'], 'readwrite');
  tx.objectStore('marketListItemsLocal').put(item);
  tx.objectStore('auditLogs').put({ id: uid(), action: item.checked ? 'market_item_checked' : 'market_item_unchecked', entity: 'marketListItemsLocal', entityId: item.id, details: { description: item.description }, createdAt: nowIso(), appVersion: APP_VERSION });
  await transactionPromise(tx);
  await queueMarketList(item.marketListId);
  await renderModule('market');
}

async function removeMarketItem(id) {
  const item = await getRecord('marketListItemsLocal', id);
  if (!item) return;
  if (!confirm(`¿Quitar “${item.description}” de la lista?`)) return;
  item.active = false;
  item.updatedAt = nowIso();
  const tx = db.transaction(['marketListItemsLocal', 'auditLogs'], 'readwrite');
  tx.objectStore('marketListItemsLocal').put(item);
  tx.objectStore('auditLogs').put({ id: uid(), action: 'market_item_removed', entity: 'marketListItemsLocal', entityId: item.id, details: { description: item.description }, createdAt: nowIso(), appVersion: APP_VERSION });
  await transactionPromise(tx);
  await queueMarketList(item.marketListId);
  await renderModule('market');
  toast('Artículo retirado.');
}

async function suggestMarketItems() {
  const list = await ensureMarketList();
  const ingredients = await loadInventoryLocal();
  const currentItems = (await getAllRecords('marketListItemsLocal')).filter(item => item.marketListId === list.id && item.active !== false);
  const linked = new Set(currentItems.map(item => item.ingredientId).filter(Boolean));
  const suggestions = ingredients.filter(item => numberInput(item.theoreticalQuantity) <= numberInput(item.minimumStock) && !linked.has(item.id));
  if (!suggestions.length) return toast('No hay faltantes nuevos según el stock mínimo.');
  const tx = db.transaction(['marketListItemsLocal', 'auditLogs'], 'readwrite');
  suggestions.forEach(ingredient => {
    const conversion = Math.max(0.0001, numberInput(ingredient.conversionFactor, 1));
    const target = Math.max(numberInput(ingredient.minimumStock) * 2, numberInput(ingredient.minimumStock) + conversion);
    const planned = Math.max(1, Math.ceil(Math.max(0, target - numberInput(ingredient.theoreticalQuantity)) / conversion * 100) / 100);
    const item = { id: uid(), marketListId: list.id, ingredientId: ingredient.id, description: ingredient.name, plannedQuantity: planned, purchaseUnit: ingredient.purchaseUnit || ingredient.baseUnit, note: 'Sugerido por stock bajo', checked: false, active: true, createdAt: nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION };
    tx.objectStore('marketListItemsLocal').put(item);
  });
  tx.objectStore('auditLogs').put({ id: uid(), action: 'market_suggestions_added', entity: 'marketListsLocal', entityId: list.id, details: { count: suggestions.length }, createdAt: nowIso(), appVersion: APP_VERSION });
  await transactionPromise(tx);
  await queueMarketList(list.id);
  await renderModule('market');
  await refreshStatus();
  toast(`${suggestions.length} faltante(s) agregado(s).`);
}

async function completeMarketList() {
  const list = await getCurrentMarketList();
  if (!list) return;
  const items = (await getAllRecords('marketListItemsLocal')).filter(item => item.marketListId === list.id && item.active !== false);
  const unchecked = items.filter(item => !item.checked).length;
  if (unchecked && !confirm(`Hay ${unchecked} artículo(s) sin marcar. ¿Finalizar de todos modos?`)) return;
  list.status = 'completed';
  list.updatedAt = nowIso();
  const tx = db.transaction(['marketListsLocal', 'auditLogs'], 'readwrite');
  tx.objectStore('marketListsLocal').put(list);
  tx.objectStore('auditLogs').put({ id: uid(), action: 'market_list_completed', entity: 'marketListsLocal', entityId: list.id, details: { items: items.length, unchecked }, createdAt: nowIso(), appVersion: APP_VERSION });
  await transactionPromise(tx);
  await queueMarketList(list.id);
  currentMarketListId = null;
  await renderModule('market');
  scheduleAutoBackup('lista de mercado finalizada');
  toast('Lista finalizada y conservada en el historial.');
}

async function buyMarketItem(id) {
  const item = await getRecord('marketListItemsLocal', id);
  if (!item?.ingredientId) return;
  await openPurchaseDialog();
  if ($('purchaseMarketItemId')) $('purchaseMarketItemId').value = item.id;
  $('purchaseIngredient').value = item.ingredientId;
  $('purchaseQuantity').value = item.plannedQuantity || 1;
  $('purchaseNotes').value = `Lista de mercado: ${item.description}`;
  updatePurchasePreview();
}


async function markMarketItemPurchased(id, purchase) {
  const item = await getRecord('marketListItemsLocal', id);
  if (!item) return;
  item.checked = true;
  item.actualQuantity = numberInput(purchase.quantity);
  item.actualPrice = numberInput(purchase.total);
  item.updatedAt = nowIso();
  const tx = db.transaction(['marketListItemsLocal', 'auditLogs'], 'readwrite');
  tx.objectStore('marketListItemsLocal').put(item);
  tx.objectStore('auditLogs').put({ id: uid(), action: 'market_item_purchased', entity: 'marketListItemsLocal', entityId: item.id, details: { purchaseId: purchase.id, amount: purchase.total }, createdAt: nowIso(), appVersion: APP_VERSION });
  await transactionPromise(tx);
  await queueMarketList(item.marketListId);
}

renderModule = async function(key) {
  if (!['recipes', 'market'].includes(key)) return originalRenderModuleV06(key);
  const module = modules.find(item => item[0] === key);
  $('salesView').classList.remove('active');
  $('moduleView').classList.add('active');
  const body = key === 'recipes' ? await renderRecipesModule() : await renderMarketModule();
  $('moduleContent').innerHTML = `<div class="module-hero"><p class="eyebrow" style="color:#ffd54d">Good King V${V07_VERSION}</p><h1>${escapeHTML(module[2])}</h1><p>${escapeHTML(module[3])}</p></div>${body}`;
  if (key === 'recipes') {
    $('newRecipeBtn')?.addEventListener('click', () => openRecipeDialog());
    $('moduleContent').querySelectorAll('.edit-recipe').forEach(button => button.onclick = () => openRecipeDialog(button.dataset.productId));
  } else {
    $('createMarketListBtn')?.addEventListener('click', () => createNewMarketList());
    $('addMarketItemBtn')?.addEventListener('click', () => openMarketItemDialog());
    $('suggestMarketBtn')?.addEventListener('click', suggestMarketItems);
    $('completeMarketBtn')?.addEventListener('click', completeMarketList);
    $('newMarketListBtn')?.addEventListener('click', () => { if (confirm('La lista actual quedará finalizada. ¿Crear una nueva?')) createNewMarketList(true); });
    $('moduleContent').querySelectorAll('.market-check').forEach(button => button.onclick = () => toggleMarketItem(button.dataset.id));
    $('moduleContent').querySelectorAll('.edit-market-item').forEach(button => button.onclick = async () => openMarketItemDialog(await getRecord('marketListItemsLocal', button.dataset.id)));
    $('moduleContent').querySelectorAll('.remove-market-item').forEach(button => button.onclick = () => removeMarketItem(button.dataset.id));
    $('moduleContent').querySelectorAll('.buy-market-item').forEach(button => button.onclick = () => buyMarketItem(button.dataset.id));
  }
};

pushQueueItem = async function(item, deviceId) {
  const client = supabaseClient;
  const businessId = authContext.businessId;
  const userId = authContext.userId;
  const payload = item.payload;
  if (item.entity === 'recipesLocal') {
    const localProduct = localProductById(payload.recipe.productId);
    if (!localProduct) throw new Error('La receta apunta a un producto que ya no existe.');
    const product = await ensureProductRemoteId(localProduct);
    const categories = await getRemoteCategoryMap();
    let { error } = await client.from('products').upsert({
      id: product.remoteId, business_id: businessId, category_id: categories[categoryCode(product.category)] || null,
      name: product.name, description: product.desc || null, price: numberInput(product.price), image_url: product.imageUrl || null,
      icon: product.emoji || null, availability: product.status === 'soldout' ? 'sold_out' : product.status === 'low' ? 'low_stock' : 'available',
      sort_order: numberInput(product.sortOrder), active: product.active !== false,
      payload: { local_id: product.id, badge: product.badge || '', image_path: product.imagePath || '' },
      created_by: userId, device_id: deviceId, created_at: product.createdAt || nowIso(), updated_at: product.updatedAt || nowIso()
    }, { onConflict: 'id' });
    if (error) throw error;
    const recipe = payload.recipe;
    ({ error } = await client.from('recipes').upsert({
      id: recipe.id, business_id: businessId, product_id: product.remoteId,
      yield_quantity: numberInput(recipe.yieldQuantity, 1), indirect_cost: numberInput(recipe.indirectCost), active: recipe.active !== false,
      created_by: userId, created_at: recipe.createdAt || nowIso(), updated_at: recipe.updatedAt || nowIso(), deleted_at: null
    }, { onConflict: 'id' }));
    if (error) throw error;
    const { data: existingItems, error: existingError } = await client.from('recipe_items').select('id').eq('recipe_id', recipe.id).is('deleted_at', null);
    if (existingError) throw existingError;
    const currentIds = new Set((payload.items || []).map(row => row.id));
    for (const stale of existingItems || []) {
      if (!currentIds.has(stale.id)) {
        const { error: staleError } = await client.from('recipe_items').update({ deleted_at: nowIso(), updated_at: nowIso() }).eq('id', stale.id);
        if (staleError) throw staleError;
      }
    }
    if ((payload.items || []).length) {
      const rows = payload.items.map(row => ({ id: row.id, business_id: businessId, recipe_id: recipe.id, ingredient_id: row.ingredientId, quantity: numberInput(row.quantity), created_at: row.createdAt || nowIso(), updated_at: row.updatedAt || nowIso(), deleted_at: null }));
      ({ error } = await client.from('recipe_items').upsert(rows, { onConflict: 'id' }));
      if (error) throw error;
    }
    return;
  }
  if (item.entity === 'marketListsLocal') {
    const list = payload.list;
    let { error } = await client.from('market_lists').upsert({ id: list.id, business_id: businessId, list_date: list.date, status: list.status || 'draft', notes: list.notes || null, created_by: userId, device_id: deviceId, created_at: list.createdAt || nowIso(), updated_at: list.updatedAt || nowIso(), deleted_at: null }, { onConflict: 'id' });
    if (error) throw error;
    const { data: existingItems, error: existingError } = await client.from('market_list_items').select('id').eq('market_list_id', list.id).is('deleted_at', null);
    if (existingError) throw existingError;
    const activeItems = (payload.items || []).filter(row => row.active !== false);
    const currentIds = new Set(activeItems.map(row => row.id));
    for (const stale of existingItems || []) {
      if (!currentIds.has(stale.id)) {
        const { error: staleError } = await client.from('market_list_items').update({ deleted_at: nowIso(), updated_at: nowIso() }).eq('id', stale.id);
        if (staleError) throw staleError;
      }
    }
    if (activeItems.length) {
      const rows = activeItems.map(row => ({ id: row.id, business_id: businessId, market_list_id: list.id, ingredient_id: row.ingredientId || null, description: row.description, planned_quantity: numberInput(row.plannedQuantity), purchase_unit: row.purchaseUnit || null, checked: Boolean(row.checked), actual_quantity: row.actualQuantity == null ? null : numberInput(row.actualQuantity), actual_price: row.actualPrice == null ? null : numberInput(row.actualPrice), created_at: row.createdAt || nowIso(), updated_at: row.updatedAt || nowIso(), deleted_at: null }));
      ({ error } = await client.from('market_list_items').upsert(rows, { onConflict: 'id' }));
      if (error) throw error;
    }
    return;
  }
  return originalPushQueueItemV06(item, deviceId);
};

pullRemoteCoreData = async function() {
  const result = await originalPullRemoteCoreDataV06();
  if (!supabaseClient || !authContext || !navigator.onLine) return result;
  const [{ data: remoteRecipes, error: recipeError }, { data: remoteLists, error: marketError }] = await Promise.all([
    supabaseClient.from('recipes').select('*, recipe_items(*)').eq('business_id', authContext.businessId).is('deleted_at', null),
    supabaseClient.from('market_lists').select('*, market_list_items(*)').eq('business_id', authContext.businessId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(30)
  ]);
  if (recipeError || marketError) throw (recipeError || marketError);
  for (const row of remoteRecipes || []) {
    const product = products.find(item => item.remoteId === row.product_id);
    if (!product) continue;
    await putRecord('recipesLocal', { id: row.id, productId: product.id, yieldQuantity: numberInput(row.yield_quantity, 1), indirectCost: numberInput(row.indirect_cost), active: row.active !== false, createdAt: row.created_at, updatedAt: row.updated_at, appVersion: APP_VERSION, remote: true });
    const localOld = (await getAllRecords('recipeItemsLocal')).filter(item => item.recipeId === row.id);
    const remoteIds = new Set((row.recipe_items || []).filter(item => !item.deleted_at).map(item => item.id));
    for (const old of localOld) if (!remoteIds.has(old.id)) await deleteRecordV07('recipeItemsLocal', old.id);
    for (const item of (row.recipe_items || []).filter(item => !item.deleted_at)) await putRecord('recipeItemsLocal', { id: item.id, recipeId: row.id, ingredientId: item.ingredient_id, quantity: numberInput(item.quantity), active: true, createdAt: item.created_at, updatedAt: item.updated_at, appVersion: APP_VERSION, remote: true });
    result.pulled = (result.pulled || 0) + 1;
  }
  for (const row of remoteLists || []) {
    await putRecord('marketListsLocal', { id: row.id, date: row.list_date, status: row.status, notes: row.notes || '', createdAt: row.created_at, updatedAt: row.updated_at, appVersion: APP_VERSION, remote: true });
    const localOld = (await getAllRecords('marketListItemsLocal')).filter(item => item.marketListId === row.id);
    const remoteIds = new Set((row.market_list_items || []).filter(item => !item.deleted_at).map(item => item.id));
    for (const old of localOld) if (!remoteIds.has(old.id)) await deleteRecordV07('marketListItemsLocal', old.id);
    for (const item of (row.market_list_items || []).filter(item => !item.deleted_at)) await putRecord('marketListItemsLocal', { id: item.id, marketListId: row.id, ingredientId: item.ingredient_id || null, description: item.description, plannedQuantity: numberInput(item.planned_quantity), purchaseUnit: item.purchase_unit || '', checked: Boolean(item.checked), actualQuantity: item.actual_quantity == null ? null : numberInput(item.actual_quantity), actualPrice: item.actual_price == null ? null : numberInput(item.actual_price), active: true, createdAt: item.created_at, updatedAt: item.updated_at, appVersion: APP_VERSION, remote: true });
    result.pulled = (result.pulled || 0) + 1;
  }
  return result;
};

async function deleteRecordV07(storeName, id) {
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(id);
  await transactionPromise(tx);
}

verifyDataIntegrity = async function() {
  const report = await originalVerifyDataIntegrityV06();
  const [recipes, recipeItems, ingredients, lists, marketItems] = await Promise.all([
    getAllRecords('recipesLocal'), getAllRecords('recipeItemsLocal'), loadInventoryLocal(), getAllRecords('marketListsLocal'), getAllRecords('marketListItemsLocal')
  ]);
  const recipeIds = new Set(recipes.map(item => item.id));
  const ingredientIds = new Set(ingredients.map(item => item.id));
  const productIds = new Set(products.map(item => item.id));
  recipes.forEach(recipe => {
    if (!productIds.has(recipe.productId)) report.errors.push(`La receta ${recipe.id} apunta a un producto inexistente.`);
    if (numberInput(recipe.yieldQuantity) <= 0) report.errors.push(`La receta de ${localProductById(recipe.productId)?.name || recipe.productId} tiene rendimiento inválido.`);
  });
  recipeItems.forEach(item => {
    if (!recipeIds.has(item.recipeId)) report.errors.push(`Hay un componente de receta sin receta válida: ${item.id}.`);
    if (!ingredientIds.has(item.ingredientId)) report.warnings.push(`La receta usa un insumo que ya no está activo: ${item.ingredientId}.`);
    if (numberInput(item.quantity) <= 0) report.errors.push(`Cantidad inválida en componente de receta ${item.id}.`);
  });
  const listIds = new Set(lists.map(item => item.id));
  marketItems.forEach(item => { if (!listIds.has(item.marketListId)) report.errors.push(`Artículo de mercado sin lista válida: ${item.id}.`); });
  report.counts.recipes = recipes.length;
  report.counts.marketLists = lists.length;
  await putRecord('appMeta', { id: 'last-health-check', ...report });
  return report;
};

function bindV07() {
  $('recipeForm')?.addEventListener('submit', saveRecipe);
  $('dismissRecipe').onclick = $('cancelRecipe').onclick = () => $('recipeDialog').close();
  $('addRecipeLine')?.addEventListener('click', async () => {
    const ingredients = await loadInventoryLocal();
    if (!ingredients.length) return toast('Primero crea un insumo.');
    recipeDraftItems.push({ id: uid(), ingredientId: ingredients[0].id, quantity: 1 });
    renderRecipeDraft();
  });
  $('recipeProduct')?.addEventListener('change', switchRecipeProduct);
  $('recipeYield')?.addEventListener('input', async () => updateRecipePreview(recipeDraftItems, await loadInventoryLocal()));
  $('recipeIndirectCost')?.addEventListener('input', async () => updateRecipePreview(recipeDraftItems, await loadInventoryLocal()));
  $('marketItemForm')?.addEventListener('submit', saveMarketItem);
  $('dismissMarketItem').onclick = $('cancelMarketItem').onclick = () => $('marketItemDialog').close();
  $('marketIngredient')?.addEventListener('change', fillMarketFromIngredient);
}

window.addEventListener('DOMContentLoaded', () => setTimeout(bindV07, 0));
