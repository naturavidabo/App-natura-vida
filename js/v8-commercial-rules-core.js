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
    commercialRulePreviewHtmlV807
  });
})();