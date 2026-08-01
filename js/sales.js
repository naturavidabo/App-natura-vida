/* sales.js — Venta con precios flexibles por producto.
   V8.2.11: ventas verificables, descuentos preparados por IA y selector de pago premium. */

let _saleType = 'unit';
let _saleSelectedGroup = null;
let _saleSearch = '';
let _cart = {};       // { productId: qty }
let _cartPrices = {}; // { productId: manual pricing entry }
let _saleDraftV827 = null; // Borrador preparado por IA; nunca se guarda automáticamente.


/* V8.2.9 — Selector compacto de forma de pago y preparación para verificación bancaria. */
function paymentMethodLabelV826(method) {
  return ({ cash: 'Efectivo', qr: 'QR / transferencia', credit: 'A crédito' })[String(method || '')] || 'Sin definir';
}

function paymentStatusLabelV826(status) {
  return ({ paid: 'Pagado', partial: 'Pago parcial', pending: 'Pendiente', verified: 'Verificado', pending_verification: 'Esperando confirmación' })[String(status || '')] || String(status || 'Pendiente');
}

function paymentQrSourceV826() {
  const profile = window.myCommercialProfile ? myCommercialProfile() : null;
  return String(profile?.qrUrl || AppState?.settings?.paymentQrUrl || '');
}

function paymentChoiceSummaryV826(choice, total) {
  if (!choice) return '<div class="nv826PaymentSummary empty"><span>Forma de pago</span><strong>Se elegirá al confirmar</strong><small>Efectivo, QR / transferencia o crédito.</small></div>';
  const paid = Number(choice.amountPaid || 0);
  const pending = Math.max(0, Number(total || 0) - paid);
  return `<div class="nv826PaymentSummary ${escapeHtml(choice.method || '')}"><span>${escapeHtml(paymentMethodLabelV826(choice.method))}</span><strong>${escapeHtml(paymentStatusLabelV826(choice.paymentStatus))}</strong><small>Pagado ${fmtMoney(paid)}${pending > .009 ? ` · Saldo ${fmtMoney(pending)}` : ''}</small><button type="button" class="nv826ChangePayment">Cambiar</button></div>`;
}


/* V8.2.9 — Persistencia verificable: el recibo solo depende de una venta confirmada. */
function saleStageLabelV829(stage) {
  return ({stock:'verificación de stock',client:'registro del cliente',number:'numeración del recibo',save:'guardado de la venta',refresh:'actualización de datos',receipt:'apertura del recibo'})[stage] || 'registro de la venta';
}

function saleErrorHtmlV829(message, operation) {
  const stage = saleStageLabelV829(operation?.stage);
  const id = String(operation?.id || 'sin identificador');
  return `<div class="nv829SaleError"><strong>No se pudo completar la operación</strong><span>Falla durante: ${escapeHtml(stage)}.</span><p>${escapeHtml(message)}</p><small>ID de control: ${escapeHtml(id)}. No vuelvas a crear otra venta hasta verificar esta misma operación.</small></div>`;
}

async function verifyCloudSaleV829(saleId) {
  if (!saleId || !navigator.onLine) return { ok:false, sale:null };
  try {
    if (window.findCloudSaleById) return await findCloudSaleById(saleId);
    const sb = window.getSupabaseClient ? getSupabaseClient() : null;
    if (!sb) return { ok:false, sale:null };
    const { data, error } = await sb.from('sales').select('*').eq('id', String(saleId)).maybeSingle();
    return error ? { ok:false, sale:null, message:messageFromError(error) } : { ok:true, sale:data || null };
  } catch (error) { return { ok:false, sale:null, message:String(error?.message || error || '') }; }
}

async function openSaleReceiptSafeV829(sale) {
  try {
    if (window.openV7ReceiptPreview) { openV7ReceiptPreview(sale, 'sale'); return {ok:true}; }
    if (window.openReceiptPreview) { openReceiptPreview(sale); return {ok:true}; }
    throw new Error('El módulo visual del recibo no está disponible.');
  } catch (error) {
    console.error('NV_RECEIPT_PREVIEW_ERROR', error);
    return {ok:false, message:String(error?.message || error || 'No se pudo abrir el recibo.')};
  }
}

function paymentIconV8211(type){
  const icons={
    cash:'<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="10" width="38" height="28" rx="7"/><circle cx="24" cy="24" r="7"/><path d="M10 17h5M33 31h5"/></svg>',
    qr:'<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="7" width="13" height="13" rx="2"/><rect x="28" y="7" width="13" height="13" rx="2"/><rect x="7" y="28" width="13" height="13" rx="2"/><path d="M29 29h5v5h-5zM36 29h5M36 36h5v5M28 39h5"/></svg>',
    credit:'<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="9" width="34" height="32" rx="7"/><path d="M7 18h34M15 6v7M33 6v7M15 27h7M27 27h7M15 34h7"/></svg>'
  };return icons[type]||icons.cash;
}

function openPaymentMethodSelectorV826(options = {}) {
  const total = roundBs(Math.max(0, Number(options.total || 0)));
  const clientName = String(options.clientName || 'Cliente');
  const qrUrl = String(options.qrUrl || paymentQrSourceV826());
  const initial = options.initial || null;
  const reference = String(initial?.reference || `NV-PAY-${Date.now().toString(36).toUpperCase()}`);
  const gateway = window.NVBankPaymentAdapterV826 || null;
  let gatewayIntent = null;
  let gatewayUnsubscribe = null;
  let qrVerified = initial?.verificationStatus === 'verified';
  let qrVerificationMode = initial?.verificationMode || '';
  let selected = String(initial?.method || 'cash');

  return new Promise(resolve => {
    const modal = openSheet(`
      <div class="nv8211PaymentHead"><div><span>COBRO DE LA VENTA</span><h2>Forma de pago</h2><p>Selecciona cómo se recibió el dinero.</p></div><button class="x" id="closeSheet" type="button" aria-label="Cerrar">✕</button></div>
      <div class="nv826PaymentIntro"><span><small>Cliente</small><strong>${escapeHtml(clientName)}</strong></span><span><small>Total</small><b>${fmtMoney(total)}</b></span></div>
      <div class="nv826PaymentChoices nv8211PaymentChoices" role="radiogroup" aria-label="Forma de pago">
        <button type="button" data-pay-method="cash"><span class="nv8211PayIcon cash">${paymentIconV8211('cash')}</span><b>Efectivo</b></button>
        <button type="button" data-pay-method="qr"><span class="nv8211PayIcon qr">${paymentIconV8211('qr')}</span><b>QR</b></button>
        <button type="button" data-pay-method="credit"><span class="nv8211PayIcon credit">${paymentIconV8211('credit')}</span><b>Crédito</b></button>
      </div>
      <div class="nv8211PaymentHint" id="nv8211PaymentHint"></div>
      <section id="nv826CashPanel" class="nv826PaymentPanel">
        <div class="field"><label>Monto recibido en efectivo</label><input id="nv826CashAmount" type="number" inputmode="decimal" min="0" max="${total}" step="0.01" value="${initial?.method === 'cash' ? Number(initial.amountPaid || total) : total}"></div>
        <small>Si es menor al total, la diferencia quedará como saldo pendiente.</small>
      </section>
      <section id="nv826QrPanel" class="nv826PaymentPanel hidden">
        <div class="nv826QrStage ${qrUrl ? '' : 'missing'}">
          ${qrUrl ? `<img src="${escapeHtml(qrUrl)}" alt="QR de pago" loading="eager" decoding="async">` : '<div class="nv826QrMissing">QR no configurado</div>'}
          <div><strong id="nv826QrStatus">${qrVerified ? 'Pago verificado' : (gateway ? 'Preparando verificación…' : 'Verificación manual disponible')}</strong><small id="nv826QrDetail">${gateway ? 'La aplicación esperará la respuesta del proveedor.' : 'Aún no existe una API bancaria conectada. Confirma únicamente después de comprobar el ingreso.'}</small><code>${escapeHtml(reference)}</code></div>
        </div>
        <label class="form-check nv826ManualConfirm"><input class="form-check-input" type="checkbox" id="nv826QrManual" ${qrVerified ? 'checked' : ''}><span class="form-check-label">Confirmé el ingreso en la cuenta autorizada</span></label>
      </section>
      <section id="nv826CreditPanel" class="nv826PaymentPanel hidden">
        <div class="field"><label>Pago inicial opcional</label><input id="nv826CreditInitial" type="number" inputmode="decimal" min="0" max="${total}" step="0.01" value="${initial?.method === 'credit' ? Number(initial.amountPaid || 0) : 0}"></div>
        <div class="field"><label>Motivo / acuerdo</label><input id="nv826CreditReason" value="${escapeHtml(initial?.pendingReason || '')}" placeholder="Ej.: venta a crédito, cuota inicial"></div>
      </section>
      <div id="nv826PaymentValidation" class="nv826PaymentValidation"></div>
      <div class="actions two"><button class="btn outline" type="button" id="nv826CancelPayment">Cancelar</button><button class="btn" type="button" id="nv826ApplyPayment">Continuar</button></div>
    `, (overlay, close) => {
      const buttons = [...overlay.querySelectorAll('[data-pay-method]')];
      const panels = {
        cash: overlay.querySelector('#nv826CashPanel'),
        qr: overlay.querySelector('#nv826QrPanel'),
        credit: overlay.querySelector('#nv826CreditPanel')
      };
      const validation = overlay.querySelector('#nv826PaymentValidation');
      const status = overlay.querySelector('#nv826QrStatus');
      const detail = overlay.querySelector('#nv826QrDetail');
      let bankEventHandler = null;
      let settled = false;
      const cleanupGateway = () => { try { gatewayUnsubscribe?.(); } catch (_) {} gatewayUnsubscribe = null; };
      const cleanup = () => { cleanupGateway(); if (bankEventHandler) window.removeEventListener('nv:payment-confirmed', bankEventHandler); };
      const finish = value => { if (settled) return; settled = true; cleanup(); close(); resolve(value); };
      const closeAll = () => finish(null);
      overlay.querySelector('#closeSheet').onclick = closeAll;
      overlay.querySelector('#nv826CancelPayment').onclick = closeAll;
      overlay.addEventListener('click', event => { if (event.target === overlay) closeAll(); }, true);

      const choose = method => {
        selected = method;
        buttons.forEach(button => button.classList.toggle('active', button.dataset.payMethod === method));
        Object.entries(panels).forEach(([name, panel]) => panel.classList.toggle('hidden', name !== method));
        const hint=overlay.querySelector('#nv8211PaymentHint');if(hint)hint.textContent=({cash:'El efectivo se sumará a la rendición del vendedor.',qr:'El pago digital debe confirmarse antes del recibo.',credit:'El saldo pendiente quedará en cuentas por cobrar.'})[method]||'';
        validation.textContent = '';
      };
      buttons.forEach(button => button.onclick = () => choose(button.dataset.payMethod));
      choose(selected);

      const markVerified = (provider = 'manual', providerReference = reference) => {
        qrVerified = true;
        qrVerificationMode = provider === 'manual' ? 'manual' : 'automatic';
        const checkbox = overlay.querySelector('#nv826QrManual');
        if (checkbox) checkbox.checked = true;
        if (status) status.textContent = provider === 'manual' ? 'Ingreso confirmado manualmente' : 'Pago confirmado en tiempo real';
        if (detail) detail.textContent = provider === 'manual' ? 'La venta puede continuar bajo responsabilidad del usuario que confirmó.' : `Confirmado por ${provider}.`;
        gatewayIntent = Object.assign({}, gatewayIntent || {}, { provider, reference: providerReference, status: 'verified' });
      };
      overlay.querySelector('#nv826QrManual')?.addEventListener('change', event => {
        if (event.target.checked) markVerified('manual', reference);
        else { qrVerified = false; qrVerificationMode = ''; if (status) status.textContent = gateway ? 'Esperando confirmación…' : 'Verificación manual disponible'; }
      });

      if (gateway && typeof gateway.createIntent === 'function') {
        Promise.resolve(gateway.createIntent({ amount: total, clientName, reference })).then(intent => {
          gatewayIntent = intent || { reference };
          if (status) status.textContent = 'Esperando confirmación del banco';
          if (detail) detail.textContent = 'La pantalla se actualizará automáticamente cuando llegue una respuesta válida.';
          if (typeof gateway.subscribe === 'function') {
            gatewayUnsubscribe = gateway.subscribe(gatewayIntent, event => {
              if (event?.status === 'verified' || event?.status === 'paid') markVerified(event.provider || gateway.name || 'API bancaria', event.reference || gatewayIntent.reference || reference);
            });
          }
        }).catch(error => {
          if (status) status.textContent = 'No se pudo iniciar la verificación automática';
          if (detail) detail.textContent = String(error?.message || 'Utiliza la confirmación manual después de revisar la cuenta.');
        });
      }
      bankEventHandler = event => {
        const data = event?.detail || {};
        if (String(data.reference || '') === String(gatewayIntent?.reference || reference) && ['verified','paid'].includes(String(data.status || ''))) markVerified(data.provider || 'API bancaria', data.reference || reference);
      };
      window.addEventListener('nv:payment-confirmed', bankEventHandler);

      overlay.querySelector('#nv826ApplyPayment').onclick = () => {
        validation.textContent = '';
        let choice;
        if (selected === 'cash') {
          const amountPaid = roundBs(Math.min(total, Math.max(0, Number(overlay.querySelector('#nv826CashAmount').value || 0))));
          const pending = roundBs(Math.max(0, total - amountPaid));
          choice = { method: 'cash', amountPaid, paymentStatus: pending > .009 ? (amountPaid > 0 ? 'partial' : 'pending') : 'paid', pendingReason: pending > .009 ? 'Saldo pendiente de pago en efectivo' : '', verificationStatus: 'not_required' };
        } else if (selected === 'credit') {
          const amountPaid = roundBs(Math.min(total, Math.max(0, Number(overlay.querySelector('#nv826CreditInitial').value || 0))));
          const pending = roundBs(Math.max(0, total - amountPaid));
          choice = { method: 'credit', amountPaid, paymentStatus: pending > .009 ? (amountPaid > 0 ? 'partial' : 'pending') : 'paid', pendingReason: overlay.querySelector('#nv826CreditReason').value.trim() || 'Venta a crédito', verificationStatus: 'not_required' };
        } else {
          if (!qrUrl) { validation.textContent = 'Configura primero el QR de cobro en el perfil comercial.'; return; }
          if (!qrVerified) { validation.textContent = 'El pago QR todavía no está confirmado. Espera la respuesta bancaria o confirma manualmente después de verificar el ingreso.'; return; }
          choice = { method: 'qr', amountPaid: total, paymentStatus: 'paid', pendingReason: '', verificationStatus: 'verified', verificationMode: qrVerificationMode || 'manual', provider: gatewayIntent?.provider || (qrVerificationMode === 'automatic' ? 'API bancaria' : 'manual'), reference: gatewayIntent?.reference || reference, confirmedAt: Date.now() };
        }
        finish(choice);
      };
    });
    return modal;
  });
}

function cartCount() {
  return Object.values(_cart).reduce((s, q) => s + Number(q || 0), 0);
}

function sellerMode() {
  return window.isReseller && isReseller();
}

function applyPercentGroup(base, groupId) {
  const g = AppState.priceGroups.find(pg => pg.id === groupId);
  const cleanBase = roundBs(base);
  if (!g) return cleanBase;
  const pct = Number(g.percent) || 0;
  if (g.mode === 'discount') return roundBs(Math.max(0, cleanBase - (cleanBase * pct / 100)));
  return roundBs(cleanBase + (cleanBase * pct / 100));
}

function saleGroupInfoV7(groupId) {
  return AppState.priceGroups.find(pg => pg.id === groupId) || null;
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
    <div class="manualPriceGrid v802EditablePriceGrid v826PriceReferenceGrid">
      <div><span>Precio de lista</span><strong>${fmtMoney(current.basePrice)}</strong></div>
      <div><span>Precio por grupo</span><strong>${fmtMoney(current.groupPrice)}</strong></div>
      <div><span>Precio actual</span><strong>${fmtMoney(current.unitPrice)}</strong></div>
    </div>
    <div class="field-row v826AdjustmentRow">
      <div class="field v826NeutralField"><label>Tipo de ajuste</label><select id="manualMode"><option value="final">Precio final</option><option value="discount_amount">Rebaja Bs</option><option value="discount_percent">Rebaja %</option><option value="surcharge_amount">Recargo Bs</option><option value="surcharge_percent">Recargo %</option></select></div>
      <div class="field v826NeutralField hidden" id="manualValueField"><label>Valor del ajuste</label><input id="manualValue" type="number" inputmode="decimal" step="0.01" value=""></div>
    </div>
    <div class="field v826ManualPriceField" id="manualFinalField"><label>Precio final manual</label><input id="manualFinal" type="number" inputmode="decimal" step="0.01" value="${existing ? existing.manualPrice : current.unitPrice}"><small>Solo este campo usa naranja porque es el valor intervenido manualmente.</small></div>
    <div class="v826CalculatedPrice hidden" id="manualCalculatedField"><span>Precio final calculado</span><strong id="manualCalculatedValue">${fmtMoney(existing ? existing.manualPrice : current.unitPrice)}</strong><small>Se calcula automáticamente según el tipo de ajuste.</small></div>
    <div class="field"><label>Motivo del ajuste</label><input id="manualReason" value="${escapeHtml(existing ? (existing.reason || '') : '')}" placeholder="Ej.: entrega, cliente antiguo, promoción"></div>
    ${window.promotionOptionsHtmlV807 ? promotionOptionsHtmlV807(p, current.referencePrice) : ''}
    <div class="v7PricePreview"><span>Diferencia frente al precio de lista</span><strong id="manualDiff"></strong></div>
    <div id="nv807PriceRulePreview" class="nv807ComplianceBox"></div>
    <div class="actions two"><button class="btn outline" id="resetManualPrice">Restablecer precio del grupo</button><button class="btn" id="applyManualPrice">Aplicar</button></div>
  `, (overlay, close) => {
    const mode = $('#manualMode', overlay);
    const value = $('#manualValue', overlay);
    const final = $('#manualFinal', overlay);
    const reason = $('#manualReason', overlay);
    const valueField = $('#manualValueField', overlay);
    const finalField = $('#manualFinalField', overlay);
    const calculatedField = $('#manualCalculatedField', overlay);
    const calculatedValue = $('#manualCalculatedValue', overlay);
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
      if (calculatedValue) calculatedValue.textContent = fmtMoney(Math.max(0, roundBs(next)));
      updateDiff();
    }
    function syncModeFields() {
      const isFinal = mode.value === 'final';
      valueField?.classList.toggle('hidden', isFinal);
      finalField?.classList.toggle('hidden', !isFinal);
      calculatedField?.classList.toggle('hidden', isFinal);
      if (!isFinal) computeFinalFromAdjustment();
    }
    function updateDiff() {
      const price = roundBs(Number(final.value || 0));
      const diff = roundBs(price - current.basePrice);
      const el = $('#manualDiff', overlay);
      if (el) {
        if (diff > 0) el.textContent = `Recargo ${fmtMoney(diff)}`;
        else if (diff < 0) el.textContent = `Rebaja ${fmtMoney(Math.abs(diff))}`;
        else el.textContent = 'Sin diferencia';
      }
      if (window.evaluateCommercialPriceV807 && window.commercialRulePreviewHtmlV807) {
        const evaluation = evaluateCommercialPriceV807(p, price, current.referencePrice, {
          roleCode: window.currentRoleCodeV807 ? currentRoleCodeV807() : AppState.session?.commercialRole,
          seller: sellerMode(),
          reason: reason.value.trim(),
          override: existing?.commercialOverride === true
        });
        const preview = $('#nv807PriceRulePreview', overlay);
        if (preview) preview.innerHTML = commercialRulePreviewHtmlV807(evaluation);
      }
    }
    $('#closeSheet', overlay).addEventListener('click', close);
    mode.addEventListener('change', () => { if (mode.value === 'final') value.value = ''; syncModeFields(); computeFinalFromAdjustment(); });
    value.addEventListener('input', computeFinalFromAdjustment);
    final.addEventListener('input', () => { mode.value = 'final'; value.value = ''; syncModeFields(); updateDiff(); });
    reason.addEventListener('input', updateDiff);
    syncModeFields();
    $all('.nv807PromoApply', overlay).forEach(button => button.addEventListener('click', () => {
      const promotion = window.getPromotionsV807 ? getPromotionsV807().find(row => row.id === button.dataset.promoId) : null;
      if (!promotion) return;
      const nextPrice = window.promotionPriceV807 ? promotionPriceV807(promotion, current.referencePrice) : roundBs(current.referencePrice * (1 - Number(promotion.discountPercent || 0) / 100));
      mode.value = 'discount_percent';
      value.value = Number(promotion.discountPercent || 0);
      final.value = nextPrice;
      reason.value = promotion.note || `Promoción: ${promotion.name}`;
      syncModeFields();
      updateDiff();
    }));
    $('#resetManualPrice', overlay).addEventListener('click', () => { if (typeof options.onReset === 'function') options.onReset(); close(); });
    $('#applyManualPrice', overlay).addEventListener('click', () => {
      const manualPrice = roundBs(Number(final.value || 0));
      if (!Number.isFinite(manualPrice) || manualPrice <= 0) return showToast('Ingresa un precio final válido.', 'error');
      let commercialEvaluation = window.evaluateCommercialPriceV807 ? evaluateCommercialPriceV807(p, manualPrice, current.referencePrice, {
        roleCode: window.currentRoleCodeV807 ? currentRoleCodeV807() : AppState.session?.commercialRole,
        seller: sellerMode(),
        reason: reason.value.trim()
      }) : { allowed: true, issues: [], status: 'allowed' };
      let commercialOverride = false;
      if (!commercialEvaluation.allowed) {
        if (!commercialEvaluation.canOverride) {
          return showToast(commercialEvaluation.issues?.[0]?.message || 'Este precio no está autorizado por las reglas comerciales.', 'error');
        }
        if (!reason.value.trim()) return showToast('Escribe el motivo para autorizar una excepción.', 'error');
        const approved = window.confirm(`El precio incumple una regla comercial.

${commercialEvaluation.issues.map(issue => '• ' + issue.message).join('\n')}

¿Autorizar esta excepción como administrador central?`);
        if (!approved) return;
        commercialOverride = true;
        commercialEvaluation = evaluateCommercialPriceV807(p, manualPrice, current.referencePrice, {
          roleCode: 'central_admin', seller: sellerMode(), reason: reason.value.trim(), override: true
        });
      }
      const entry = {
        manualPrice,
        mode: mode.value,
        rawValue: value.value === '' ? null : Number(value.value || 0),
        reason: reason.value.trim(),
        basePrice: current.basePrice,
        groupPrice: current.groupPrice,
        groupId: current.groupId || null,
        groupName: current.groupName || '',
        commercialOverride,
        commercialRuleStatus: commercialEvaluation.status,
        commercialMarginPercent: commercialEvaluation.marginPercent,
        commercialMinimumPrice: commercialEvaluation.minimumPrice,
        commercialDiscountPercent: commercialEvaluation.discountPercent,
        commercialRoleCode: commercialEvaluation.roleCode,
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

function salesToolboxV770() {
  return `<section class="v770SalesTools" aria-label="Herramientas comerciales">
    <button id="salesCatalogV770"><span>📖</span><strong>Catálogo</strong><small>Mostrar o compartir</small></button>
    <button id="salesClientsV770"><span>👥</span><strong>Clientes</strong><small>Directorio comercial</small></button>
    <button id="salesQuoteV770"><span>🏷️</span><strong>Cotizar</strong><small>Preparar oferta</small></button>
    <button id="salesCollectV770"><span>💳</span><strong>Cobrar</strong><small>Saldos pendientes</small></button>
  </section>`;
}

function bindSalesToolboxV770() {
  $('#salesCatalogV770')?.addEventListener('click', () => window.openCatalogPdfOptions ? openCatalogPdfOptions() : showToast('Catálogo no disponible.', 'error'));
  $('#salesClientsV770')?.addEventListener('click', () => window.navigateTo && navigateTo('clientes'));
  $('#salesQuoteV770')?.addEventListener('click', () => window.navigateTo && navigateTo('cotizaciones'));
  $('#salesCollectV770')?.addEventListener('click', () => window.navigateTo && navigateTo('por-cobrar'));
}

function renderVender() {
  $('#fabAdd').classList.add('hidden');
  const main = $('#mainArea');
  if (sellerMode() && !['reseller_unit', 'reseller_wholesale'].includes(_saleType)) _saleType = 'reseller_unit';
  if (AppState.products.length === 0) {
    main.innerHTML = `<div class="empty"><span class="ic">💵</span><h3>No hay productos</h3><p>Actualiza el catálogo o espera a que el administrador cargue productos.</p></div>`;
    return;
  }
  const groupsEnabled = (sellerMode() || AppState.settings.priceGroupsEnabled) && AppState.priceGroups.length > 0;
  main.innerHTML = `
    ${sellerMode() ? `
      <section class="salesCleanHeader"><div><span class="eyebrow">Ventas</span><h1>Registrar venta</h1></div><small>Puedes negociar precios por producto.</small></section>
      <div class="saletoggle salesChannelToggle cleanSaleToggle"><button data-type="reseller_unit" class="${_saleType === 'reseller_unit' ? 'active' : ''}">Unitaria</button><button data-type="reseller_wholesale" class="${_saleType === 'reseller_wholesale' ? 'active' : ''}">Mayorista</button></div>` : `
      <section class="salesCleanHeader"><div><span class="eyebrow">Ventas</span><h1>Registrar venta</h1></div><small>Precio base, grupo o precio manual por producto.</small></section>
      <div class="saletoggle salesChannelToggle cleanSaleToggle"><button data-type="unit" class="${_saleType === 'unit' ? 'active' : ''}">Unitaria</button><button data-type="market" class="${_saleType === 'market' ? 'active' : ''}">Mayorista</button><button data-type="representative_transfer" class="${_saleType === 'representative_transfer' ? 'active' : ''}">Representantes</button></div>`}
    ${salesToolboxV770()}
    ${((_saleType === 'market' || _saleType === 'representative_transfer') || sellerMode()) && groupsEnabled ? `
    <div class="field" style="margin-bottom:14px;"><label>Grupo / zona de venta (opcional)</label><select id="s_group"><option value="">Sin grupo / precio base</option>${AppState.priceGroups.map(g => `<option value="${g.id}" ${_saleSelectedGroup === g.id ? 'selected' : ''}>${escapeHtml(g.name)} (${g.mode === 'discount' ? '−' : '+'}${g.percent}%)</option>`).join('')}</select><small>Los precios manuales se mantienen como excepción.</small></div>` : ''}
    <div class="toolrow"><input type="text" id="searchInput" placeholder="Buscar producto..." value="${escapeHtml(_saleSearch)}"></div>
    <div class="catalogGrid" id="catalogGrid"></div>
  `;
  bindSalesToolboxV770();
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
    <div class="catalogCard cleanSaleCard ${sellerMode() ? 'resellerCatalogCard' : ''} ${qty > 0 ? 'v802PriceEditable' : ''} price-${b.source} adjust-${b.sign}" data-id="${p.id}">
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
      commercialOverride: !!b.manual?.commercialOverride,
      commercialRuleStatus: b.manual?.commercialRuleStatus || '',
      commercialMarginPercent: b.manual?.commercialMarginPercent ?? null,
      commercialMinimumPrice: b.manual?.commercialMinimumPrice ?? null,
      commercialDiscountPercent: b.manual?.commercialDiscountPercent ?? b.adjustmentPercent,
      commercialRoleCode: b.manual?.commercialRoleCode || (window.currentRoleCodeV807 ? currentRoleCodeV807() : AppState.session?.commercialRole || ''),
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
  const commercialValidationV807 = window.validateSaleItemsV807 ? validateSaleItemsV807(saleItemsPreview, { roleCode: window.currentRoleCodeV807 ? currentRoleCodeV807() : AppState.session?.commercialRole, seller: sellerMode() }) : { allowed: true, evaluations: [], warnings: [] };
  if (!commercialValidationV807.allowed) {
    const first = commercialValidationV807.blocked[0];
    showToast(`${first.productName}: ${first.issues?.[0]?.message || 'precio no autorizado'}`, 'error');
    return;
  }
  const total = saleItemsPreview.reduce((sum, item) => sum + item.subtotal, 0);
  const sellerProfit = sellerMode() ? saleItemsPreview.reduce((sum, item) => sum + Number(item.sellerProfit || 0), 0) : 0;
  const discounts = saleItemsPreview.reduce((s, i) => s + Number(i.discountAmount || 0), 0);
  const surcharges = saleItemsPreview.reduce((s, i) => s + Number(i.surchargeAmount || 0), 0);
  const draftV827 = _saleDraftV827 || {};
  const preClientV827 = (AppState.clients || []).find(c => String(c.id) === String(draftV827.clientId || '')) || null;
  const initialClientV827 = preClientV827 || AppState.lastClient || null;
  const operation = { id: uid('sale'), documentNumber: '', client: preClientV827, sale: null, submitting: false, saved: false, stage: 'payment', preferredPaymentMethod: String(draftV827.paymentMethod || '') };
  const html = `
    <h2>Confirmar venta <span class="x" id="closeSheet">✕</span></h2>
    <div class="sectiontitle2"><span>Productos (${saleItemsPreview.length})</span></div>
    ${saleItemsPreview.map(i => `<div class="histitem priceLine ${i.priceSource}"><div class="l"><div class="pname">${escapeHtml(i.productName)} ${salePriceBadgeV7({source:i.priceSource, sign:i.priceAdjustmentType})}</div><div class="meta">${i.qty} × ${fmtMoney(i.unitPrice)} · ${salePriceLabelV7({source:i.priceSource, sign:i.priceAdjustmentType, adjustmentAmount:i.priceAdjustmentAmount, groupName:i.groupName})}</div>${i.manualPriceReason ? `<small class="priceReason">${escapeHtml(i.manualPriceReason)}</small>` : ''}</div><div class="r">${fmtMoney(i.subtotal)}</div></div>`).join('')}
    ${(discounts || surcharges) ? `<div class="priceSummaryBox"><span>Rebajas: <b>${fmtMoney(discounts)}</b></span><span>Recargos: <b>${fmtMoney(surcharges)}</b></span></div>` : ''}
    ${window.getCommercialRulesV807 && getCommercialRulesV807().enabled ? `<div class="nv807PricePolicyHint"><strong>Reglas comerciales verificadas</strong>Los precios respetan el margen mínimo y el descuento autorizado para el rol actual.</div>` : ''}
    <div class="sectiontitle2"><span>Datos del cliente</span></div>
    <div class="field"><label>Nombre del cliente</label><div class="clientAutocompleteV802"><div class="clientInputRow"><input type="text" id="ck_clientname" autocomplete="off" placeholder="Ej: Juan Pérez" value="${initialClientV827 ? escapeHtml(initialClientV827.name || initialClientV827.businessName || '') : ''}"><button type="button" class="miniClientPick" id="pickClientV723">▾</button></div><div id="ckClientSuggestionsV802" class="clientSuggestionsV802 hidden"></div></div><small>Escribe con normalidad. Las coincidencias aparecerán de forma compacta y solo se aplicarán al tocar “Usar”.</small></div>
    <div class="field"><label>Número de teléfono</label><div class="clientInputRow"><input type="tel" inputmode="tel" id="ck_clientphone" autocomplete="off" placeholder="Ej: 71234567" value="${initialClientV827 ? escapeHtml(initialClientV827.phone || initialClientV827.whatsapp || '') : ''}"><button type="button" class="waIconBtnV723" id="ckClientWaV723"><span class="waLogoV725">☎</span></button></div></div>
    ${(_saleType === 'market') ? `<button type="button" class="btn outline block" id="registerWholesaleV725">Registrar datos de mayorista</button>` : ''}
    <section class="nv771DeliveryToggle"><label><input id="ck_requiresDeliveryV771" type="checkbox"><span><strong>Requiere entrega</strong><small>Crear una entrega pendiente para planificarla en una ruta.</small></span></label><div id="ck_deliveryFieldsV771" class="hidden"><div class="field-row"><div class="field"><label>Fecha solicitada</label><input id="ck_deliveryDateV771" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Prioridad</label><select id="ck_deliveryPriorityV771"><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div></div><div class="field"><label>Dirección de entrega</label><input id="ck_deliveryAddressV771" value="${initialClientV827 ? escapeHtml(initialClientV827.address || initialClientV827.locationLabel || '') : ''}" placeholder="Dirección, zona o referencia"></div><div class="field"><label>Observación de entrega</label><textarea id="ck_deliveryNotesV771" placeholder="Horario, persona de contacto o indicación especial"></textarea></div></div></section>
    <div class="totalbox"><span class="lbl">Total a cobrar</span><span class="val">${fmtMoney(total)}</span></div>
    <div id="ckPaymentSummaryV826">${paymentChoiceSummaryV826(null,total)}</div>
    <div class="v7CashNotice">Al continuar elegirás Efectivo, QR / transferencia o Crédito. El recibo ya no incorpora el QR.</div>
    <div class="v7CashNotice">La operación usa un identificador único. Si se corta la conexión, se verificará primero si la venta ya quedó guardada para evitar duplicarla.</div>
    <div id="ckSaleErrorV829" class="hidden"></div>
    <div class="actions stickyActions"><button class="btn block" id="confirmSale">Elegir forma de pago</button></div>`;
  openSheet(html, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', () => { if (!operation.submitting) close(); });
    const fillClientV723 = (c) => {
      if (!c) return;
      operation.client = c;
      $('#ck_clientname', overlay).value = c.name || '';
      $('#ck_clientphone', overlay).value = c.phone || '';
      const deliveryAddress = $('#ck_deliveryAddressV771', overlay);
      if (deliveryAddress) deliveryAddress.value = c.address || c.locationLabel || '';
      let rebuildForBenefit = false;
      if (c.priceGroupId && (_saleType === 'market' || _saleType === 'representative_transfer' || sellerMode()) && c.priceGroupId !== _saleSelectedGroup) {
        const g = AppState.priceGroups.find(x => x.id === c.priceGroupId);
        if (g && window.confirm(`Este cliente tiene beneficio/grupo: ${g.name}. ¿Aplicarlo a esta venta?`)) {
          _saleSelectedGroup = c.priceGroupId;
          rebuildForBenefit = true;
        }
      }
      const personalPct = Number(c.customDiscountPercent || 0);
      const benefitActive = !c.benefitUntil || new Date(`${c.benefitUntil}T23:59:59`).getTime() >= Date.now();
      if (personalPct > 0 && benefitActive && window.confirm(`Este cliente tiene ${personalPct}% de descuento personal adicional. ¿Aplicarlo a los productos de esta venta?`)) {
        let blockedBenefits = 0;
        Object.keys(_cart).forEach(productId => {
          const product = AppState.products.find(p => p.id === productId);
          if (!product) return;
          const reference = groupPriceForModeV7(product, _saleType, _saleSelectedGroup, sellerMode());
          const candidate = roundBs(Math.max(0, reference * (1 - personalPct / 100)));
          const benefitReason = c.benefitNote || `Beneficio personal ${personalPct}%`;
          const validation = window.evaluateCommercialPriceV807 ? evaluateCommercialPriceV807(product, candidate, reference, { roleCode: window.currentRoleCodeV807 ? currentRoleCodeV807() : AppState.session?.commercialRole, seller: sellerMode(), reason: benefitReason }) : { allowed: true };
          if (!validation.allowed) { blockedBenefits += 1; return; }
          _cartPrices[productId] = { manualPrice: candidate, mode: 'client_benefit', value: personalPct, reason: benefitReason, commercialRuleStatus: validation.status, commercialMarginPercent: validation.marginPercent, commercialMinimumPrice: validation.minimumPrice, commercialDiscountPercent: validation.discountPercent, commercialRoleCode: validation.roleCode };
        });
        if (blockedBenefits) showToast(`${blockedBenefits} beneficio(s) no se aplicaron porque exceden las reglas comerciales.`, 'error');
        rebuildForBenefit = blockedBenefits < Object.keys(_cart).length;
      }
      if (rebuildForBenefit) {
        AppState.lastClient = c;
        close();
        setTimeout(openCheckoutSheet, 80);
      }
    };
    $('#pickClientV723', overlay).addEventListener('click', () => openClientSelectorSheet({ saleType: _saleType, onSelect: fillClientV723 }));
    if (window.bindClientAutocompleteV802) bindClientAutocompleteV802({ input: $('#ck_clientname', overlay), container: $('#ckClientSuggestionsV802', overlay), preferredType: customerTypeForSaleV723(_saleType), onTyping: () => { operation.client = null; }, onSelect: fillClientV723 });
    if ($('#registerWholesaleV725', overlay)) $('#registerWholesaleV725', overlay).addEventListener('click', () => { window._afterClientSaved = fillClientV723; openClientForm(null, { name: $('#ck_clientname', overlay).value.trim(), phone: $('#ck_clientphone', overlay).value.trim(), customerType: 'wholesale' }); });
    $('#ckClientWaV723', overlay).addEventListener('click', () => openWhatsAppV723($('#ck_clientphone', overlay).value, $('#ck_clientname', overlay).value));
    $('#ck_requiresDeliveryV771', overlay)?.addEventListener('change', event => {
      $('#ck_deliveryFieldsV771', overlay)?.classList.toggle('hidden', !event.target.checked);
    });
    const renderPaymentChoiceV826 = () => {
      const box = $('#ckPaymentSummaryV826', overlay);
      if (box) {
        box.innerHTML = paymentChoiceSummaryV826(operation.paymentChoice, total);
        box.querySelector('.nv826ChangePayment')?.addEventListener('click', async () => {
          const choice = await openPaymentMethodSelectorV826({ total, clientName: $('#ck_clientname', overlay).value.trim() || 'Cliente', qrUrl: paymentQrSourceV826(), initial: operation.paymentChoice });
          if (choice) { operation.paymentChoice = choice; renderPaymentChoiceV826(); $('#confirmSale', overlay).textContent = 'Confirmar venta'; }
        });
      }
    };
    renderPaymentChoiceV826();
    if (preClientV827) fillClientV723(preClientV827);
    if (draftV827.source === 'ai') {
      const notice = document.createElement('div'); notice.className = 'nv827AiDraftNotice';
      notice.innerHTML = '<strong>Trabajo preparado por el Asistente IA</strong><span>Revisa cliente, cantidades, precios y forma de pago antes de confirmar.</span>';
      overlay.querySelector('h2')?.insertAdjacentElement('afterend', notice);
    }
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
      if (operation.saved && operation.sale) {
        btn.disabled = true; btn.textContent = 'Abriendo recibo…';
        close();
        const receiptResult = await openSaleReceiptSafeV829(operation.sale);
        if (!receiptResult.ok) showToast(`La venta está guardada, pero no se pudo abrir el recibo: ${receiptResult.message}`, 'error');
        _cart = {}; _cartPrices = {}; _saleDraftV827 = null; renderVender();
        return;
      }
      if (!operation.client && window.findLikelyDuplicateClientV802) { const match = findLikelyDuplicateClientV802(clientName, clientPhone); if (match && window.confirm(`Encontramos un cliente similar: “${match.client.name}”.\n\n¿Deseas usar ese registro para evitar duplicarlo?`)) operation.client = match.client; }
      if (!operation.paymentChoice) {
        const choice = await openPaymentMethodSelectorV826({ total, clientName, qrUrl: paymentQrSourceV826(), initial: operation.preferredPaymentMethod ? { method: operation.preferredPaymentMethod } : null });
        if (!choice) return;
        operation.paymentChoice = choice;
        renderPaymentChoiceV826();
        btn.textContent = 'Confirmar venta';
        return;
      }
      if (!navigator.onLine) return showToast('Sin internet. La venta no fue registrada.', 'error');
      operation.submitting = true; operation.stage = 'stock'; btn.disabled = true; btn.textContent = 'Verificando stock y guardando…';
      const errorBoxV829 = $('#ckSaleErrorV829', overlay); if (errorBoxV829) { errorBoxV829.classList.add('hidden'); errorBoxV829.innerHTML = ''; }
      try {
        const refresh = await syncCloudProductsToLocal();
        if (refresh && refresh.ok === false) throw new Error(refresh.message);
        for (const item of rawItems) {
          const current = AppState.products.find(product => product.id === item.product.id);
          if (!current || Number(current.stock || 0) < Number(item.qty || 0)) throw new Error(`Stock insuficiente para ${item.product.name}. Actualiza la venta y vuelve a intentarlo.`);
        }
        operation.stage = 'client';
        if (!operation.client) operation.client = await findOrCreateClientQuick(clientName, clientPhone, customerTypeForSaleV723(_saleType));
        operation.stage = 'number';
        if (!operation.documentNumber) {
          const result = window.nextDocumentNumberV7 ? await nextDocumentNumberV7('NV-VTA') : { ok: false, message: 'No está disponible la numeración V7.' };
          if (!result.ok) throw new Error(result.message || 'No se pudo generar el número de recibo.');
          operation.documentNumber = result.number;
        }
        if (!operation.sale) {
          const groupName = _saleSelectedGroup ? (saleGroupInfoV7(_saleSelectedGroup) || {}).name : null;
          const paymentChoice = operation.paymentChoice || { method: 'cash', amountPaid: total, paymentStatus: 'paid', verificationStatus: 'not_required' };
          const paidNow = roundBs(Math.min(total, Math.max(0, Number(paymentChoice.amountPaid || 0))));
          const pendingNow = roundBs(Math.max(0, total - paidNow));
          const saleItems = buildSaleItemsFromCartV7(rawItems);
          const finalCommercialValidationV807 = window.validateSaleItemsV807 ? validateSaleItemsV807(saleItems, { roleCode: window.currentRoleCodeV807 ? currentRoleCodeV807() : AppState.session?.commercialRole, seller: sellerMode() }) : { allowed: true, evaluations: [] };
          if (!finalCommercialValidationV807.allowed) {
            const first = finalCommercialValidationV807.blocked[0];
            throw new Error(`${first.productName}: ${first.issues?.[0]?.message || 'precio no autorizado por las reglas comerciales'}`);
          }
          operation.sale = {
            id: operation.id,
            documentNumber: operation.documentNumber,
            receiptNumber: operation.documentNumber,
            paymentMethod: paymentChoice.method,
            paymentStatus: paymentChoice.paymentStatus || (pendingNow > 0 ? (paidNow > 0 ? 'partial' : 'pending') : 'paid'),
            paymentVerificationStatus: paymentChoice.verificationStatus || 'not_required',
            paymentVerificationMode: paymentChoice.verificationMode || '',
            paymentProvider: paymentChoice.provider || '',
            paymentReference: paymentChoice.reference || '',
            paymentConfirmedAt: paymentChoice.confirmedAt || null,
            amountPaid: paidNow,
            pendingBalance: pendingNow,
            pendingReason: pendingNow > 0 ? (paymentChoice.pendingReason || 'Saldo pendiente') : '',
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
            commercialRulesVersion: '8.0.7',
            commercialCompliance: {
              checked: true,
              roleCode: window.currentRoleCodeV807 ? currentRoleCodeV807() : AppState.session?.commercialRole || '',
              minimumMarginPercent: window.getCommercialRulesV807 ? getCommercialRulesV807().minimumMarginPercent : null,
              globalMaximumDiscountPercent: window.getCommercialRulesV807 ? getCommercialRulesV807().globalMaximumDiscountPercent : null,
              overrides: saleItems.filter(item => item.commercialOverride).length
            },
            sellerProfit,
            clientId: operation.client ? operation.client.id : null,
            clientName: operation.client ? operation.client.name : clientName,
            clientPhone: operation.client ? operation.client.phone : clientPhone,
            customerType: operation.client ? (operation.client.customerType || customerTypeForSaleV723(_saleType)) : customerTypeForSaleV723(_saleType),
            clientCity: operation.client ? (operation.client.city || '') : '',
            clientAddress: operation.client ? (operation.client.address || '') : '',
            requiresDelivery: !!$('#ck_requiresDeliveryV771', overlay)?.checked,
            deliveryRequestedDate: $('#ck_deliveryDateV771', overlay)?.value || '',
            deliveryAddress: $('#ck_deliveryAddressV771', overlay)?.value.trim() || (operation.client ? (operation.client.address || '') : ''),
            clientBusinessName: operation.client ? (operation.client.businessName || '') : '',
            date: Date.now(),
            syncStatus: 'cloud'
          };
        }
        operation.stage = 'save';
        if (!operation.saved) {
          try {
            await DB.put('sales', operation.sale);
            operation.saved = true;
          } catch (saveError) {
            const verification = await verifyCloudSaleV829(operation.sale.id);
            if (verification.ok && verification.sale) {
              operation.saved = true;
              await DB.put('sales', operation.sale, { silent:true });
              console.warn('NV_SALE_RECOVERED_AFTER_ERROR', operation.sale.id, saveError);
            } else {
              throw saveError;
            }
          }
        }
        operation.stage = 'refresh';
        await Promise.all([syncCloudProductsToLocal().catch(() => null), window.syncCloudSalesToLocal ? syncCloudSalesToLocal().catch(() => null) : Promise.resolve()]);
        if (!AppState.sales.some(x => x.id === operation.sale.id)) AppState.sales.push(operation.sale);
        await writeAudit('sale:create', 'sales', operation.sale.id, null, operation.sale).catch(() => {});
        let deliveryWarning = '';
        if (operation.sale.requiresDelivery && window.createDeliveryRequestFromSaleV771) {
          const delivery = await createDeliveryRequestFromSaleV771(operation.sale, operation.client || {}, {
            requestedDate: $('#ck_deliveryDateV771', overlay)?.value || new Date().toISOString().slice(0,10),
            priority: $('#ck_deliveryPriorityV771', overlay)?.value || 'normal',
            address: $('#ck_deliveryAddressV771', overlay)?.value.trim() || operation.sale.clientAddress || '',
            latitude: operation.client?.latitude ?? null,
            longitude: operation.client?.longitude ?? null,
            notes: $('#ck_deliveryNotesV771', overlay)?.value.trim() || ''
          });
          if (!delivery.ok) deliveryWarning = delivery.message || 'No se pudo crear la entrega pendiente.';
        }
        showToast(deliveryWarning ? `Venta guardada, pero revisa la entrega: ${deliveryWarning}` : (operation.sale.requiresDelivery ? 'Venta guardada y enviada a Entregas pendientes.' : 'Venta registrada en Supabase.'), deliveryWarning ? 'error' : undefined);
        operation.submitting = false;
        close();
        operation.stage = 'receipt';
        const receiptResult = await openSaleReceiptSafeV829(operation.sale);
        if (!receiptResult.ok) showToast(`La venta se guardó, pero no se abrió el recibo: ${receiptResult.message}`, 'error');
        _cart = {}; _cartPrices = {}; _saleDraftV827 = null; renderVender();
      } catch (err) {
        operation.submitting = false; btn.disabled = false; btn.textContent = operation.saved ? 'Abrir recibo guardado' : 'Verificar y reintentar';
        const message = window.messageFromError ? messageFromError(err, 'No se pudo registrar la venta.') : (err.message || 'No se pudo registrar la venta.');
        const errorBox = $('#ckSaleErrorV829', overlay);
        if (errorBox) { errorBox.innerHTML = saleErrorHtmlV829(message, operation); errorBox.classList.remove('hidden'); errorBox.scrollIntoView({block:'nearest', behavior:'smooth'}); }
        showToast(message, 'error');
        console.error('NV_SALE_OPERATION_ERROR', { stage:operation.stage, operationId:operation.id, saved:operation.saved, error:err });
      }
    });
  });
}

function startSaleWithProduct(productId) {
  AppState.currentTab = 'vender';
  _saleDraftV827 = null;
  _cart = { [productId]: 1 };
  render();
}

function prepareSaleDraftV827(options = {}) {
  const requested = Array.isArray(options.items) ? options.items : [];
  const nextCart = {};
  requested.forEach(item => {
    const product = (AppState.products || []).find(p => String(p.id) === String(item.productId || '')) ||
      (AppState.products || []).find(p => normalizeSearch(p.name || '') === normalizeSearch(item.productName || ''));
    if (!product) return;
    const qty = Math.max(1, Math.min(Number(product.stock || 0), Math.floor(Number(item.quantity || item.qty || 1))));
    if (qty > 0) nextCart[product.id] = qty;
  });
  if (!Object.keys(nextCart).length) { showToast('No se encontró un producto válido para preparar la venta.', 'error'); return false; }
  _cart = nextCart; _cartPrices = {};
  if (['unit','market','representative_transfer','reseller_unit','reseller_wholesale'].includes(String(options.saleType || ''))) _saleType = String(options.saleType);
  requested.forEach(item=>{const product=(AppState.products||[]).find(p=>String(p.id)===String(item.productId||''));if(!product)return;const base=Number(item.unitPrice||0)||Number(window.unitPrice?unitPrice(product):product.price||0);const manual=Number(item.manualPrice||0);if(manual>0&&Math.abs(manual-base)>.009){_cartPrices[product.id]={manualPrice:roundBs(manual),mode:item.adjustmentMode||'final',rawValue:item.adjustmentValue??null,reason:String(item.adjustmentReason||options.note||'Precio preparado por el Asistente IA'),basePrice:base,createdAt:Date.now()};}});
  const client = (AppState.clients || []).find(c => String(c.id) === String(options.clientId || '')) || null;
  if (client) AppState.lastClient = client;
  _saleDraftV827 = { clientId: client?.id || '', paymentMethod: String(options.paymentMethod || ''), note: String(options.note || ''), source: options.source || 'ai' };
  AppState.currentTab = 'vender';
  if (window.render) render(); else renderVender();
  showToast('Venta preparada. Revisa los datos antes de confirmar.');
  setTimeout(() => { if (Object.keys(_cart).length && AppState.currentTab === 'vender') openCheckoutSheet(); }, 180);
  return true;
}

Object.assign(window, {
  renderVender,
  startSaleWithProduct,
  prepareSaleDraftV827,
  applyPercentGroupV7: applyPercentGroup,
  buildSalePriceBreakdownV7,
  openSalePriceEditorV7,
  salePriceBadgeV7,
  salePriceLabelV7,
  openPaymentMethodSelectorV826,
  paymentMethodLabelV826,
  paymentStatusLabelV826,
  paymentChoiceSummaryV826,
  paymentQrSourceV826,
  verifyCloudSaleV829,
  openSaleReceiptSafeV829
});
