/* NATURA VIDA V8.0.7 — reglas comerciales, márgenes, descuentos y promociones.
   Las reglas se guardan dentro de la configuración oficial de Supabase.
   La IA todavía no interviene: todo cálculo es determinista y auditable. */
(() => {
  'use strict';

  const VERSION = '8.0.7';
  const DEFAULT_RULES = Object.freeze({
    enabled: false,
    enforcementMode: 'block',
    marginBasis: 'sale',
    minimumMarginPercent: 15,
    globalMaximumDiscountPercent: 30,
    requireReasonFromPercent: 1,
    allowCentralOverride: true,
    promotionsCanStack: false,
    roleDiscountLimits: {
      central_admin: 30,
      regional_admin: 15,
      regional_advanced: 12,
      commercial_representative: 10,
      field_seller: 5,
      delivery: 0,
      production: 0,
      inventory: 0,
      finance: 0,
      support: 0
    }
  });

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const num = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const money = value => window.fmtMoney ? fmtMoney(value) : `Bs ${num(value).toFixed(2)}`;
  const round = value => window.roundBs ? roundBs(value) : Math.round(num(value) * 100) / 100;
  const today = () => new Date().toISOString().slice(0, 10);

  function currentRoleCodeV807() {
    return AppState?.session?.commercialRole || (window.isAdmin && isAdmin() ? 'central_admin' : 'commercial_representative');
  }

  function normalizeRulesV807(source = {}) {
    const roleLimits = Object.assign({}, DEFAULT_RULES.roleDiscountLimits, source.roleDiscountLimits || {});
    const normalized = Object.assign({}, DEFAULT_RULES, source || {}, { roleDiscountLimits: roleLimits });
    normalized.enabled = normalized.enabled !== false;
    normalized.enforcementMode = normalized.enforcementMode === 'warning' ? 'warning' : 'block';
    normalized.marginBasis = normalized.marginBasis === 'cost' ? 'cost' : 'sale';
    normalized.minimumMarginPercent = Math.min(95, Math.max(0, num(normalized.minimumMarginPercent, DEFAULT_RULES.minimumMarginPercent)));
    normalized.globalMaximumDiscountPercent = Math.min(100, Math.max(0, num(normalized.globalMaximumDiscountPercent, DEFAULT_RULES.globalMaximumDiscountPercent)));
    normalized.requireReasonFromPercent = Math.min(100, Math.max(0, num(normalized.requireReasonFromPercent, DEFAULT_RULES.requireReasonFromPercent)));
    normalized.allowCentralOverride = normalized.allowCentralOverride !== false;
    normalized.promotionsCanStack = normalized.promotionsCanStack === true;
    Object.keys(normalized.roleDiscountLimits).forEach(key => {
      normalized.roleDiscountLimits[key] = Math.min(100, Math.max(0, num(normalized.roleDiscountLimits[key], 0)));
    });
    return normalized;
  }

  function getCommercialRulesV807() {
    if (!AppState.settings) AppState.settings = {};
    const rules = normalizeRulesV807(AppState.settings.commercialRules || {});
    AppState.settings.commercialRules = rules;
    if (!Array.isArray(AppState.settings.commercialPromotions)) AppState.settings.commercialPromotions = [];
    return rules;
  }

  function getPromotionsV807() {
    getCommercialRulesV807();
    return AppState.settings.commercialPromotions;
  }

  function roleDiscountLimitV807(roleCode = currentRoleCodeV807()) {
    const rules = getCommercialRulesV807();
    const roleLimit = num(rules.roleDiscountLimits[roleCode], 0);
    return Math.min(rules.globalMaximumDiscountPercent, roleLimit);
  }

  function realCostForProductV807(product, options = {}) {
    if (!product) return 0;
    if (Number.isFinite(Number(options.cost))) return round(options.cost);
    const roleCode = options.roleCode || currentRoleCodeV807();
    const sellerCostRoles = ['commercial_representative', 'regional_advanced', 'regional_admin', 'field_seller'];
    if (options.seller === true || sellerCostRoles.includes(roleCode)) {
      const delegated = window.resellerEffectiveCost ? resellerEffectiveCost(product) : 0;
      if (delegated > 0) return round(delegated);
    }
    const central = window.grossCost ? grossCost(product) : num(product.cost ?? product.baseCost, 0);
    return round(central);
  }

  function marginPercentV807(price, cost, basis = getCommercialRulesV807().marginBasis) {
    price = num(price); cost = num(cost);
    if (price <= 0 || cost < 0) return 0;
    if (basis === 'cost') return cost > 0 ? ((price - cost) / cost) * 100 : 0;
    return ((price - cost) / price) * 100;
  }

  function minimumFromMarginV807(cost, marginPercent, basis = getCommercialRulesV807().marginBasis) {
    cost = Math.max(0, num(cost));
    const pct = Math.max(0, Math.min(95, num(marginPercent))) / 100;
    if (!cost) return 0;
    if (basis === 'cost') return round(cost * (1 + pct));
    return round(cost / Math.max(0.05, 1 - pct));
  }

  function minimumPriceForProductV807(product, options = {}) {
    const rules = getCommercialRulesV807();
    const cost = realCostForProductV807(product, options);
    const derived = minimumFromMarginV807(cost, rules.minimumMarginPercent, rules.marginBasis);
    const explicit = Math.max(0, num(product?.minimumPrice ?? product?.minimumAuthorizedPrice, 0));
    return round(Math.max(derived, explicit));
  }

  function evaluateCommercialPriceV807(product, finalPrice, referencePrice, options = {}) {
    const rules = getCommercialRulesV807();
    const roleCode = options.roleCode || currentRoleCodeV807();
    const price = round(finalPrice);
    const reference = round(referencePrice || price);
    const cost = realCostForProductV807(product, options);
    const minimumPrice = minimumPriceForProductV807(product, Object.assign({}, options, { cost }));
    const marginPercent = round(marginPercentV807(price, cost, rules.marginBasis));
    const discountPercent = reference > 0 && price < reference ? round(((reference - price) / reference) * 100) : 0;
    const roleLimit = roleDiscountLimitV807(roleCode);
    const reason = String(options.reason || '').trim();
    const issues = [];

    if (!rules.enabled) {
      return { allowed: true, status: 'disabled', rules, roleCode, price, reference, cost, minimumPrice, marginPercent, discountPercent, roleLimit, issues, canOverride: false };
    }
    if (!(price > 0)) issues.push({ code: 'invalid_price', severity: 'critical', message: 'El precio final debe ser mayor a cero.' });
    if (!(cost > 0)) issues.push({ code: 'missing_cost', severity: 'warning', message: 'El producto no tiene un costo real confiable; revisa su costeo.' });
    if (cost > 0 && price + 0.001 < minimumPrice) issues.push({ code: 'below_minimum', severity: 'critical', message: `El precio queda por debajo del mínimo autorizado de ${money(minimumPrice)}.` });
    if (discountPercent > roleLimit + 0.001) issues.push({ code: 'discount_limit', severity: 'critical', message: `El descuento de ${discountPercent.toFixed(1)}% supera el máximo de ${roleLimit.toFixed(1)}% para este rol.` });
    if (discountPercent >= rules.requireReasonFromPercent && !reason) issues.push({ code: 'reason_required', severity: 'critical', message: 'Indica el motivo del descuento o modificación de precio.' });

    const critical = issues.filter(issue => issue.severity === 'critical');
    const canOverride = roleCode === 'central_admin' && rules.allowCentralOverride && critical.length > 0;
    const overrideAccepted = options.override === true && canOverride && reason;
    const strictBlocked = rules.enforcementMode === 'block' && critical.length > 0 && !overrideAccepted;
    const status = strictBlocked ? 'blocked' : critical.length || issues.length ? 'warning' : 'allowed';
    return {
      allowed: !strictBlocked,
      status,
      rules,
      roleCode,
      price,
      reference,
      cost,
      minimumPrice,
      marginPercent,
      discountPercent,
      roleLimit,
      issues,
      canOverride,
      overrideAccepted: !!overrideAccepted,
      reason
    };
  }

  function validateSaleItemsV807(items = [], options = {}) {
    const evaluations = items.map(item => {
      const product = (AppState.products || []).find(row => row.id === item.productId) || item.product || item;
      return Object.assign({ productId: item.productId, productName: item.productName || product?.name || 'Producto' }, evaluateCommercialPriceV807(
        product,
        item.unitPrice,
        item.originalUnitPrice || item.groupUnitPrice || item.unitPrice,
        {
          roleCode: options.roleCode || currentRoleCodeV807(),
          seller: options.seller,
          cost: item.unitCost,
          reason: item.manualPriceReason || item.promotionName || item.groupName || (item.priceSource === 'group' ? 'Grupo comercial autorizado' : ''),
          override: item.commercialOverride === true
        }
      ));
    });
    const blocked = evaluations.filter(row => !row.allowed);
    return { allowed: blocked.length === 0, evaluations, blocked, warnings: evaluations.filter(row => row.issues.length && row.allowed) };
  }

  function promotionAppliesV807(promotion, product, dateValue = today()) {
    if (!promotion || promotion.active === false || !product) return false;
    if (promotion.startsAt && dateValue < promotion.startsAt) return false;
    if (promotion.endsAt && dateValue > promotion.endsAt) return false;
    if (promotion.scope === 'product' && promotion.targetId !== product.id) return false;
    if (promotion.scope === 'category' && String(promotion.targetValue || '').toLowerCase() !== String(product.category || '').toLowerCase()) return false;
    return true;
  }

  function activePromotionsForProductV807(product, dateValue = today()) {
    if (!getCommercialRulesV807().enabled) return [];
    return getPromotionsV807().filter(promotion => promotionAppliesV807(promotion, product, dateValue));
  }

  function promotionPriceV807(promotion, referencePrice) {
    const pct = Math.max(0, Math.min(100, num(promotion?.discountPercent, 0)));
    return round(Math.max(0, num(referencePrice) * (1 - pct / 100)));
  }

  function promotionOptionsHtmlV807(product, referencePrice) {
    const rows = activePromotionsForProductV807(product);
    if (!rows.length) return '';
    return `<div class="nv807PromotionSuggestions"><strong>Promociones vigentes</strong>${rows.map(p => `<button type="button" class="nv807PromoApply" data-promo-id="${esc(p.id)}"><span>${esc(p.name)}</span><b>−${num(p.discountPercent).toFixed(1)}%</b><small>${money(promotionPriceV807(p, referencePrice))}</small></button>`).join('')}</div>`;
  }

  function commercialRulePreviewHtmlV807(result) {
    if (!result) return '';
    const statusLabel = result.status === 'allowed' ? 'Dentro de regla' : result.status === 'disabled' ? 'Reglas desactivadas' : result.status === 'blocked' ? 'No autorizado' : 'Requiere atención';
    const issues = result.issues.map(issue => `<li>${esc(issue.message)}</li>`).join('');
    return `<div class="nv807RulePreview ${esc(result.status)}"><div class="nv807RulePreviewHead"><strong>${esc(statusLabel)}</strong><span>Margen ${result.marginPercent.toFixed(1)}%</span></div><div class="nv807RuleMetrics"><span>Costo <b>${money(result.cost)}</b></span><span>Mínimo <b>${money(result.minimumPrice)}</b></span><span>Descuento <b>${result.discountPercent.toFixed(1)}%</b></span><span>Tope del rol <b>${result.roleLimit.toFixed(1)}%</b></span></div>${issues ? `<ul>${issues}</ul>` : ''}${result.canOverride && result.status === 'blocked' ? '<small>El administrador central puede autorizar una excepción con motivo obligatorio.</small>' : ''}</div>`;
  }

  function formatPromotionScopeV807(promotion) {
    if (promotion.scope === 'product') {
      const product = (AppState.products || []).find(row => row.id === promotion.targetId);
      return product ? product.name : 'Producto específico';
    }
    if (promotion.scope === 'category') return `Categoría: ${promotion.targetValue || 'sin definir'}`;
    return 'Todos los productos';
  }

  function commercialMetricsV807() {
    const rules = getCommercialRulesV807();
    const products = (AppState.products || []).filter(p => p.status !== 'archived');
    let missingCost = 0;
    let belowFloor = 0;
    products.forEach(product => {
      const cost = realCostForProductV807(product, { roleCode: 'central_admin' });
      if (!(cost > 0)) missingCost += 1;
      const floor = minimumPriceForProductV807(product, { roleCode: 'central_admin', cost });
      const prices = [window.marketPrice?.(product), window.representativePrice?.(product), window.publicPrice?.(product)].filter(v => num(v) > 0);
      if (prices.some(price => price + 0.001 < floor)) belowFloor += 1;
    });
    const activePromotions = getPromotionsV807().filter(p => p.active !== false && (!p.endsAt || p.endsAt >= today())).length;
    return { rules, products: products.length, missingCost, belowFloor, activePromotions };
  }

  async function saveRulesV807(nextRules, action = 'commercial_rules:update') {
    const before = JSON.parse(JSON.stringify(getCommercialRulesV807()));
    AppState.settings.commercialRules = normalizeRulesV807(nextRules);
    try {
      await saveSettings();
      if (window.writeAudit) await writeAudit(action, 'settings', 'commercialRules', before, AppState.settings.commercialRules).catch(() => {});
      return { ok: true };
    } catch (error) {
      AppState.settings.commercialRules = before;
      return { ok: false, message: error.message || 'No se pudieron guardar las reglas.' };
    }
  }

  async function savePromotionsV807(nextPromotions, action = 'commercial_promotions:update', before = null) {
    const previous = before || JSON.parse(JSON.stringify(getPromotionsV807()));
    AppState.settings.commercialPromotions = nextPromotions;
    try {
      await saveSettings();
      if (window.writeAudit) await writeAudit(action, 'settings', 'commercialPromotions', previous, nextPromotions).catch(() => {});
      return { ok: true };
    } catch (error) {
      AppState.settings.commercialPromotions = previous;
      return { ok: false, message: error.message || 'No se pudieron guardar las promociones.' };
    }
  }

  function renderProductFloorsV807() {
    const rows = (AppState.products || []).filter(p => p.status !== 'archived').slice().sort((a,b) => String(a.name).localeCompare(String(b.name), 'es')).slice(0, 80);
    if (!rows.length) return '<div class="nv807Empty">No hay productos para analizar.</div>';
    return rows.map(product => {
      const cost = realCostForProductV807(product, { roleCode: 'central_admin' });
      const floor = minimumPriceForProductV807(product, { roleCode: 'central_admin', cost });
      const explicit = num(product.minimumPrice, 0);
      const publicValue = window.publicPrice ? publicPrice(product) : num(product.publicPrice);
      const status = !(cost > 0) ? 'warning' : publicValue + 0.001 < floor ? 'blocked' : 'allowed';
      return `<div class="nv807ProductFloor ${status}"><div><strong>${esc(product.name)}</strong><small>${esc(product.category || 'General')} · Costo ${money(cost)}</small></div><span><small>Mínimo ${explicit > 0 ? 'específico' : 'calculado'}</small><b>${money(floor)}</b></span><span><small>Precio público</small><b>${money(publicValue)}</b></span></div>`;
    }).join('');
  }

  function renderPromotionsV807() {
    const rows = getPromotionsV807().slice().sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    if (!rows.length) return '<div class="nv807Empty"><strong>Sin promociones</strong><span>Crea una promoción temporal con alcance y fechas definidos.</span></div>';
    return rows.map(p => `<article class="nv807PromotionCard ${p.active === false ? 'inactive' : ''}"><div><span class="nv807PromotionPct">−${num(p.discountPercent).toFixed(1)}%</span><strong>${esc(p.name)}</strong><small>${esc(formatPromotionScopeV807(p))} · ${esc(p.startsAt || 'sin inicio')} a ${esc(p.endsAt || 'sin fin')}</small></div><div class="nv807PromotionActions"><button type="button" class="btn sm outline nv807EditPromo" data-id="${esc(p.id)}">Editar</button><button type="button" class="btn sm outline nv807TogglePromo" data-id="${esc(p.id)}">${p.active === false ? 'Activar' : 'Pausar'}</button><button type="button" class="btn sm outline nv807DeletePromo" data-id="${esc(p.id)}">Eliminar</button></div></article>`).join('');
  }

  function openPromotionFormV807(id = '') {
    if (!(window.isAdmin && isAdmin())) return showToast('Solo el administrador central puede administrar promociones.', 'error');
    const existing = getPromotionsV807().find(p => p.id === id) || null;
    const categories = [...new Set((AppState.products || []).map(p => p.category).filter(Boolean))].sort();
    const html = `
      <h2>${existing ? 'Editar promoción' : 'Nueva promoción'} <span class="x" id="closeSheet">✕</span></h2>
      <div class="field"><label>Nombre</label><input id="nv807PromoName" value="${esc(existing?.name || '')}" placeholder="Ej.: Reposición mayorista julio"></div>
      <div class="field-row"><div class="field"><label>Descuento %</label><input id="nv807PromoPercent" type="number" inputmode="decimal" step="0.1" min="0" max="100" value="${existing ? num(existing.discountPercent) : ''}"></div><div class="field"><label>Estado</label><select id="nv807PromoActive"><option value="1" ${existing?.active !== false ? 'selected' : ''}>Activa</option><option value="0" ${existing?.active === false ? 'selected' : ''}>Pausada</option></select></div></div>
      <div class="field"><label>Alcance</label><select id="nv807PromoScope"><option value="all">Todos los productos</option><option value="category" ${existing?.scope === 'category' ? 'selected' : ''}>Categoría</option><option value="product" ${existing?.scope === 'product' ? 'selected' : ''}>Producto específico</option></select></div>
      <div class="field nv807PromoTarget" data-scope="category"><label>Categoría</label><select id="nv807PromoCategory"><option value="">Seleccionar</option>${categories.map(category => `<option value="${esc(category)}" ${existing?.targetValue === category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></div>
      <div class="field nv807PromoTarget" data-scope="product"><label>Producto</label><select id="nv807PromoProduct"><option value="">Seleccionar</option>${(AppState.products || []).filter(p=>p.status!=='archived').map(product => `<option value="${esc(product.id)}" ${existing?.targetId === product.id ? 'selected' : ''}>${esc(product.name)}</option>`).join('')}</select></div>
      <div class="field-row"><div class="field"><label>Desde</label><input id="nv807PromoStart" type="date" value="${esc(existing?.startsAt || today())}"></div><div class="field"><label>Hasta</label><input id="nv807PromoEnd" type="date" value="${esc(existing?.endsAt || today())}"></div></div>
      <div class="field"><label>Motivo / objetivo</label><textarea id="nv807PromoNote" rows="3" placeholder="Qué busca lograr la promoción">${esc(existing?.note || '')}</textarea></div>
      <div id="nv807PromoValidation"></div>
      <div class="actions"><button type="button" class="btn outline block" id="nv807CancelPromo">Cancelar</button><button type="button" class="btn block" id="nv807SavePromo">Guardar promoción</button></div>`;
    openSheet(html, (overlay, close) => {
      const scope = overlay.querySelector('#nv807PromoScope');
      const updateScope = () => overlay.querySelectorAll('.nv807PromoTarget').forEach(el => el.classList.toggle('hidden', el.dataset.scope !== scope.value));
      updateScope();
      scope.addEventListener('change', updateScope);
      overlay.querySelector('#closeSheet').addEventListener('click', close);
      overlay.querySelector('#nv807CancelPromo').addEventListener('click', close);
      overlay.querySelector('#nv807SavePromo').addEventListener('click', async () => {
        const name = overlay.querySelector('#nv807PromoName').value.trim();
        const discountPercent = Math.max(0, num(overlay.querySelector('#nv807PromoPercent').value));
        const startsAt = overlay.querySelector('#nv807PromoStart').value;
        const endsAt = overlay.querySelector('#nv807PromoEnd').value;
        const validation = overlay.querySelector('#nv807PromoValidation');
        if (!name) { validation.innerHTML = '<div class="nv807InlineError">Escribe el nombre de la promoción.</div>'; return; }
        if (!(discountPercent > 0)) { validation.innerHTML = '<div class="nv807InlineError">El descuento debe ser mayor a 0%.</div>'; return; }
        if (discountPercent > getCommercialRulesV807().globalMaximumDiscountPercent) { validation.innerHTML = `<div class="nv807InlineError">Supera el descuento global máximo de ${getCommercialRulesV807().globalMaximumDiscountPercent}%.</div>`; return; }
        if (startsAt && endsAt && endsAt < startsAt) { validation.innerHTML = '<div class="nv807InlineError">La fecha final no puede ser anterior al inicio.</div>'; return; }
        const targetId = scope.value === 'product' ? overlay.querySelector('#nv807PromoProduct').value : '';
        const targetValue = scope.value === 'category' ? overlay.querySelector('#nv807PromoCategory').value : '';
        if (scope.value === 'product' && !targetId) { validation.innerHTML = '<div class="nv807InlineError">Selecciona un producto.</div>'; return; }
        if (scope.value === 'category' && !targetValue) { validation.innerHTML = '<div class="nv807InlineError">Selecciona una categoría.</div>'; return; }
        const before = JSON.parse(JSON.stringify(getPromotionsV807()));
        const item = {
          id: existing?.id || (window.uid ? uid('promo') : `promo_${Date.now()}`),
          name,
          discountPercent: round(discountPercent),
          active: overlay.querySelector('#nv807PromoActive').value === '1',
          scope: scope.value,
          targetId,
          targetValue,
          startsAt,
          endsAt,
          note: overlay.querySelector('#nv807PromoNote').value.trim(),
          createdAt: existing?.createdAt || Date.now(),
          updatedAt: Date.now(),
          createdBy: AppState.session?.onlineUserId || AppState.session?.userId || ''
        };
        const next = existing ? before.map(p => p.id === existing.id ? item : p) : before.concat(item);
        const button = overlay.querySelector('#nv807SavePromo');
        button.disabled = true; button.textContent = 'Guardando…';
        const result = await savePromotionsV807(next, existing ? 'promotion:update' : 'promotion:create', before);
        if (!result.ok) { button.disabled = false; button.textContent = 'Guardar promoción'; validation.innerHTML = `<div class="nv807InlineError">${esc(result.message)}</div>`; return; }
        close(); showToast(existing ? 'Promoción actualizada.' : 'Promoción creada.'); renderCommercialRulesV807();
      });
    });
  }

  async function togglePromotionV807(id) {
    const before = JSON.parse(JSON.stringify(getPromotionsV807()));
    const next = before.map(p => p.id === id ? Object.assign({}, p, { active: p.active === false, updatedAt: Date.now() }) : p);
    const result = await savePromotionsV807(next, 'promotion:toggle', before);
    showToast(result.ok ? 'Estado de promoción actualizado.' : result.message, result.ok ? undefined : 'error');
    if (result.ok) renderCommercialRulesV807();
  }

  async function deletePromotionV807(id) {
    const row = getPromotionsV807().find(p => p.id === id);
    if (!row) return;
    if (!window.confirm(`¿Eliminar la promoción “${row.name}”?`)) return;
    const before = JSON.parse(JSON.stringify(getPromotionsV807()));
    const result = await savePromotionsV807(before.filter(p => p.id !== id), 'promotion:delete', before);
    showToast(result.ok ? 'Promoción eliminada.' : result.message, result.ok ? undefined : 'error');
    if (result.ok) renderCommercialRulesV807();
  }

  function openUtilitySimulatorV807() {
    const rules = getCommercialRulesV807();
    const products = (AppState.products || []).filter(p => p.status !== 'archived');
    if (!products.length) return showToast('No hay productos para simular.', 'error');
    openSheet(`
      <h2>Simulador de utilidad <span class="x" id="closeSheet">✕</span></h2>
      <div class="field"><label>Producto</label><select id="nv807SimProduct">${products.map(product => `<option value="${esc(product.id)}">${esc(product.name)}</option>`).join('')}</select></div>
      <div class="field-row"><div class="field"><label>Canal</label><select id="nv807SimChannel"><option value="unit">Público</option><option value="market">Mayorista</option><option value="representative_transfer">Representante</option></select></div><div class="field"><label>Cantidad</label><input id="nv807SimQty" type="number" inputmode="numeric" min="1" value="1"></div></div>
      <div class="field"><label>Descuento a simular %</label><input id="nv807SimDiscount" type="number" inputmode="decimal" step="0.1" min="0" value="0"></div>
      <div id="nv807SimulatorResult"></div>
      <button type="button" class="btn outline block" id="nv807CloseSimulator">Cerrar</button>`, (overlay, close) => {
      const result = overlay.querySelector('#nv807SimulatorResult');
      const recalc = () => {
        const product = products.find(p => p.id === overlay.querySelector('#nv807SimProduct').value);
        const channel = overlay.querySelector('#nv807SimChannel').value;
        const qty = Math.max(1, Math.floor(num(overlay.querySelector('#nv807SimQty').value, 1)));
        const discount = Math.max(0, num(overlay.querySelector('#nv807SimDiscount').value));
        let base = channel === 'unit' ? (window.publicPrice ? publicPrice(product) : num(product.publicPrice)) : channel === 'market' ? (window.marketPrice ? marketPrice(product) : num(product.marketPrice)) : (window.representativePrice ? representativePrice(product) : num(product.resellerPrice));
        const finalPrice = round(base * (1 - discount / 100));
        const evaluation = evaluateCommercialPriceV807(product, finalPrice, base, { roleCode: currentRoleCodeV807(), reason: discount > 0 ? 'Simulación' : '' });
        const profitUnit = round(finalPrice - evaluation.cost);
        result.innerHTML = `<div class="nv807SimulatorCards"><div><span>Precio base</span><strong>${money(base)}</strong></div><div><span>Precio final</span><strong>${money(finalPrice)}</strong></div><div><span>Utilidad por unidad</span><strong>${money(profitUnit)}</strong></div><div><span>Utilidad total</span><strong>${money(profitUnit * qty)}</strong></div></div>${commercialRulePreviewHtmlV807(evaluation)}`;
      };
      ['#nv807SimProduct','#nv807SimChannel','#nv807SimQty','#nv807SimDiscount'].forEach(selector => overlay.querySelector(selector).addEventListener('input', recalc));
      overlay.querySelector('#closeSheet').addEventListener('click', close);
      overlay.querySelector('#nv807CloseSimulator').addEventListener('click', close);
      recalc();
    });
  }

  function renderCommercialRulesV807() {
    if (!(window.isAdmin && isAdmin())) {
      window.showToast?.('Solo el administrador central puede configurar reglas comerciales.', 'error');
      return window.navigateTo?.('ajustes');
    }
    document.querySelector('#fabAdd')?.classList.add('hidden');
    const rules = getCommercialRulesV807();
    const metrics = commercialMetricsV807();
    const roleLabels = {
      central_admin: 'Administrador central',
      regional_admin: 'Administrador regional',
      regional_advanced: 'Representante regional avanzado',
      commercial_representative: 'Representante comercial',
      field_seller: 'Vendedor vinculado'
    };
    document.querySelector('#mainArea').innerHTML = `
      <section class="nv807Hero"><div><span class="eyebrow">Control comercial V8.0.7</span><h1>Reglas, márgenes y descuentos</h1><p>Protege la utilidad, define autorizaciones por rol y simula promociones antes de aplicarlas.</p></div><span class="nv807HeroMark">%</span></section>
      <div class="nv807MetricGrid"><div><span>Margen mínimo</span><strong>${rules.minimumMarginPercent.toFixed(1)}%</strong></div><div><span>Descuento global</span><strong>${rules.globalMaximumDiscountPercent.toFixed(1)}%</strong></div><div><span>Promociones activas</span><strong>${metrics.activePromotions}</strong></div><div class="${metrics.missingCost || metrics.belowFloor ? 'warning' : ''}"><span>Observaciones</span><strong>${metrics.missingCost + metrics.belowFloor}</strong></div></div>

      <section class="dashboardPanel nv807Panel"><div class="panelHeader"><div><span class="eyebrow">Política central</span><h2>Configuración de seguridad comercial</h2></div><span class="nv807StatusPill ${rules.enabled ? 'active' : ''}">${rules.enabled ? 'Activa' : 'Desactivada'}</span></div>
        ${rules.enabled ? '' : '<div class="nv807ActivationNotice"><strong>Activación manual requerida</strong><span>La versión se instala sin bloquear ventas existentes. Revisa los costos y límites; luego selecciona “Sí, proteger precios” y guarda.</span></div>'}
        <div class="field-row"><div class="field"><label>Aplicar reglas</label><select id="nv807RulesEnabled"><option value="1" ${rules.enabled ? 'selected' : ''}>Sí, proteger precios</option><option value="0" ${!rules.enabled ? 'selected' : ''}>No, solo calcular</option></select></div><div class="field"><label>Respuesta ante incumplimiento</label><select id="nv807Enforcement"><option value="block" ${rules.enforcementMode === 'block' ? 'selected' : ''}>Bloquear</option><option value="warning" ${rules.enforcementMode === 'warning' ? 'selected' : ''}>Advertir</option></select></div></div>
        <div class="field-row"><div class="field"><label>Margen mínimo %</label><input id="nv807MinMargin" type="number" inputmode="decimal" step="0.1" min="0" max="95" value="${rules.minimumMarginPercent}"></div><div class="field"><label>Forma de calcular margen</label><select id="nv807MarginBasis"><option value="sale" ${rules.marginBasis === 'sale' ? 'selected' : ''}>Sobre precio de venta</option><option value="cost" ${rules.marginBasis === 'cost' ? 'selected' : ''}>Sobre costo</option></select></div></div>
        <div class="field-row"><div class="field"><label>Descuento máximo global %</label><input id="nv807GlobalDiscount" type="number" inputmode="decimal" step="0.1" min="0" max="100" value="${rules.globalMaximumDiscountPercent}"></div><div class="field"><label>Motivo obligatorio desde %</label><input id="nv807ReasonFrom" type="number" inputmode="decimal" step="0.1" min="0" max="100" value="${rules.requireReasonFromPercent}"></div></div>
        <div class="nv807SwitchRows"><label><input type="checkbox" id="nv807AdminOverride" ${rules.allowCentralOverride ? 'checked' : ''}> Permitir excepción del administrador central con motivo</label><label><input type="checkbox" id="nv807PromoStack" ${rules.promotionsCanStack ? 'checked' : ''}> Permitir combinar promociones</label></div>
        <div class="nv807Subhead"><strong>Descuento máximo por rol</strong><small>El límite efectivo nunca supera el máximo global.</small></div>
        <div class="nv807RoleLimits">${Object.entries(roleLabels).map(([code,label]) => `<label><span>${esc(label)}</span><input data-role-limit="${code}" type="number" inputmode="decimal" step="0.1" min="0" max="100" value="${num(rules.roleDiscountLimits[code])}"><em>%</em></label>`).join('')}</div>
        <div class="actions two"><button type="button" class="btn outline" id="nv807OpenSimulator">Simular utilidad</button><button type="button" class="btn" id="nv807SaveRules">Guardar reglas</button></div>
      </section>

      <section class="dashboardPanel nv807Panel"><div class="panelHeader"><div><span class="eyebrow">Campañas controladas</span><h2>Promociones</h2></div><button type="button" class="btn sm" id="nv807NewPromotion">Nueva promoción</button></div><p class="nv807Intro">Las promociones solo aparecen en productos y fechas autorizadas. Al vender, siguen respetando el precio mínimo y el límite del rol.</p><div class="nv807PromotionList">${renderPromotionsV807()}</div></section>

      <section class="dashboardPanel nv807Panel"><div class="panelHeader"><div><span class="eyebrow">Costo real y piso comercial</span><h2>Control por producto</h2></div><button type="button" class="btn sm outline" id="nv807RefreshFloors">Recalcular</button></div><p class="nv807Intro">El precio mínimo se calcula desde el costo real y el margen central. Un precio mínimo específico del producto, si existe, tiene prioridad cuando es mayor.</p><div class="nv807ProductFloorList">${renderProductFloorsV807()}</div></section>

      <section class="dashboardPanel nv807Panel nv807FinalNotice"><strong>La IA todavía no modifica precios</strong><p>Esta versión deja listas las reglas que una futura IA podrá consultar para sugerir descuentos sin vender por debajo del margen autorizado.</p><button type="button" class="btn outline block" id="nv807BackSettings">Volver a configuración</button></section>`;

    document.querySelector('#nv807SaveRules')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      const next = normalizeRulesV807({
        enabled: document.querySelector('#nv807RulesEnabled').value === '1',
        enforcementMode: document.querySelector('#nv807Enforcement').value,
        minimumMarginPercent: document.querySelector('#nv807MinMargin').value,
        marginBasis: document.querySelector('#nv807MarginBasis').value,
        globalMaximumDiscountPercent: document.querySelector('#nv807GlobalDiscount').value,
        requireReasonFromPercent: document.querySelector('#nv807ReasonFrom').value,
        allowCentralOverride: document.querySelector('#nv807AdminOverride').checked,
        promotionsCanStack: document.querySelector('#nv807PromoStack').checked,
        roleDiscountLimits: Object.fromEntries([...document.querySelectorAll('[data-role-limit]')].map(input => [input.dataset.roleLimit, input.value]))
      });
      button.disabled = true; button.textContent = 'Guardando…';
      const result = await saveRulesV807(next);
      if (!result.ok) { button.disabled = false; button.textContent = 'Guardar reglas'; showToast(result.message, 'error'); return; }
      showToast('Reglas comerciales guardadas en Supabase.'); renderCommercialRulesV807();
    });
    document.querySelector('#nv807OpenSimulator')?.addEventListener('click', openUtilitySimulatorV807);
    document.querySelector('#nv807NewPromotion')?.addEventListener('click', () => openPromotionFormV807());
    document.querySelector('#nv807RefreshFloors')?.addEventListener('click', renderCommercialRulesV807);
    document.querySelector('#nv807BackSettings')?.addEventListener('click', () => navigateTo('ajustes'));
    document.querySelectorAll('.nv807EditPromo').forEach(button => button.addEventListener('click', () => openPromotionFormV807(button.dataset.id)));
    document.querySelectorAll('.nv807TogglePromo').forEach(button => button.addEventListener('click', () => togglePromotionV807(button.dataset.id)));
    document.querySelectorAll('.nv807DeletePromo').forEach(button => button.addEventListener('click', () => deletePromotionV807(button.dataset.id)));
  }

  Object.assign(window, {
    NV807_VERSION: VERSION,
    DEFAULT_COMMERCIAL_RULES_V807: DEFAULT_RULES,
    normalizeRulesV807,
    getCommercialRulesV807,
    getPromotionsV807,
    currentRoleCodeV807,
    roleDiscountLimitV807,
    realCostForProductV807,
    marginPercentV807,
    minimumFromMarginV807,
    minimumPriceForProductV807,
    evaluateCommercialPriceV807,
    validateCommercialPriceV807: evaluateCommercialPriceV807,
    validateSaleItemsV807,
    activePromotionsForProductV807,
    promotionPriceV807,
    promotionOptionsHtmlV807,
    commercialRulePreviewHtmlV807,
    renderCommercialRulesV807,
    openUtilitySimulatorV807,
    openPromotionFormV807
  });
})();
