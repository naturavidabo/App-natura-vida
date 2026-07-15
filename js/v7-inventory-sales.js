/* NATURA VIDA V7 — inventario propio y ventas al contado del representante.
   V7.2.3: precios manuales por producto, grupos y trazabilidad. */

(() => {
  const originalRenderInventario = window.renderInventario;
  const originalRenderVender = window.renderVender;
  let saleType = 'reseller_unit';
  let saleSearch = '';
  let saleCart = {};
  let saleManualPrices = {};
  let saleSelectedGroup = null;

  function renderRepresentativeInventoryV7() {
    $('#fabAdd').classList.add('hidden');
    const products = AppState.products.filter(p => p.status !== 'archived' && Number(p.stock || 0) > 0);
    const totalUnits = products.reduce((s,p)=>s+Number(p.stock||0),0);
    const invested = products.reduce((s,p)=>s+(resellerEffectiveCost(p)*Number(p.stock||0)),0);
    $('#mainArea').innerHTML = `
      <section class="v7PageHead"><span class="v7Eyebrow">Productos confirmados y pagados</span><h1>Inventario propio</h1><p>Tu stock se actualiza únicamente cuando Natura Vida confirma el pago de una compra.</p></section>
      <section class="v7MetricGrid compact"><article class="v7MetricCard"><span>Productos</span><strong>${products.length}</strong></article><article class="v7MetricCard"><span>Unidades</span><strong>${totalUnits}</strong></article><article class="v7MetricCard primary"><span>Inversión estimada</span><strong>${fmtMoney(invested)}</strong></article></section>
      <div class="v7CashNotice">Puedes definir libremente tu precio unitario y mayorista. Durante la venta también puedes negociar precios por producto.</div>
      <section class="v7ProductGrid v7OwnInventory">
        ${products.map(p=>`<article class="v7ProductCard"><div class="v7ProductImage">${p.photo?`<img src="${p.photo}" alt="" loading="lazy" decoding="async">`:'<span>NV</span>'}</div><div class="v7ProductBody"><small>${escapeHtml(p.category||'General')}</small><h3>${escapeHtml(p.name)}</h3><div class="v7StockBig"><span>Stock propio</span><strong>${p.stock}</strong></div><div class="v7PricePair"><div><span>Unitario</span><strong>${fmtMoney(resellerLocalUnitPrice(p))}</strong></div><div><span>Mayorista</span><strong>${fmtMoney(resellerLocalWholesalePrice(p))}</strong></div></div><button class="btn outline block v7EditOwnPrices" data-id="${p.id}">Editar mis precios base</button><button class="btn block v7SellOwnProduct" data-id="${p.id}">Vender</button></div></article>`).join('') || `<div class="v7Empty"><span>📦</span><h3>Aún no tienes inventario</h3><p>Compra productos en Compra online. Aparecerán aquí después de confirmar el pago.</p><button class="btn" id="goBuyFromEmpty">Ir a Compra online</button></div>`}
      </section>`;
    $all('.v7EditOwnPrices').forEach(b=>b.addEventListener('click',()=>openOwnPriceEditor(b.dataset.id)));
    $all('.v7SellOwnProduct').forEach(b=>b.addEventListener('click',()=>{saleCart={[b.dataset.id]:1};saleManualPrices={};navigateTo('vender');}));
    if($('#goBuyFromEmpty'))$('#goBuyFromEmpty').addEventListener('click',()=>navigateTo('compra'));
  }

  function openOwnPriceEditor(id) {
    const p=AppState.products.find(x=>x.id===id); if(!p)return;
    const base=resellerAcquisitionCost(p); const extra=resellerAdditionalCost(p);
    openSheet(`<h2>Mis precios base <span class="x" id="closeSheet">✕</span></h2><div class="v7ProductMini"><div>${p.photo?`<img src="${p.photo}" alt="" loading="lazy" decoding="async">`:'NV'}</div><span><strong>${escapeHtml(p.name)}</strong><small>Stock oficial: ${p.stock} · no editable</small></span></div><div class="field-row"><div class="field"><label>Costo promedio pagado a Natura Vida</label><input value="${base}" readonly></div><div class="field"><label>Transporte / costo adicional</label><input id="ownExtra" type="number" min="0" step="0.01" value="${extra||0}"></div></div><div class="field-row"><div class="field"><label>Mi precio unitario base</label><input id="ownUnit" type="number" min="0" step="0.01" value="${resellerLocalUnitPrice(p)||''}"></div><div class="field"><label>Mi precio mayorista base</label><input id="ownWholesale" type="number" min="0" step="0.01" value="${resellerLocalWholesalePrice(p)||''}"></div></div><div class="field"><label>Nota comercial opcional</label><input id="ownNote" value="${escapeHtml(p.resellerLocalNote||'')}" placeholder="Ej.: envío incluido"></div><div class="v7PricePreview"><span>Costo real estimado</span><strong id="ownCostPreview"></strong></div><button class="btn block" id="saveOwnPrices">Guardar precios base</button>`,(overlay,close)=>{
      const calc=()=>{$('#ownCostPreview',overlay).textContent=fmtMoney(base+Number($('#ownExtra',overlay).value||0));};calc();$('#ownExtra',overlay).addEventListener('input',calc);$('#closeSheet',overlay).addEventListener('click',close);
      $('#saveOwnPrices',overlay).addEventListener('click',async()=>{const additionalCost=roundBs(Number($('#ownExtra',overlay).value||0));const unitPrice=roundBs(Number($('#ownUnit',overlay).value||0));const wholesalePrice=roundBs(Number($('#ownWholesale',overlay).value||0));const real=roundBs(base+additionalCost);if(unitPrice<=0||wholesalePrice<=0)return showToast('Ingresa ambos precios de venta.','error');if(unitPrice<real||wholesalePrice<real)return showToast('Los precios base no pueden quedar por debajo de tu costo real.','error');const btn=$('#saveOwnPrices',overlay);btn.disabled=true;btn.textContent='Guardando…';const res=await updateRepresentativeInventoryRemote(p.id,0,{additionalCost,unitPrice,wholesalePrice,note:$('#ownNote',overlay).value.trim()});if(!res.ok){btn.disabled=false;btn.textContent='Reintentar';return showToast(res.message,'error');}p.resellerAdditionalCost=additionalCost;p.resellerLocalUnitPrice=unitPrice;p.resellerLocalWholesalePrice=wholesalePrice;p.resellerLocalNote=$('#ownNote',overlay).value.trim();await DB.put('products',p,{silent:true});close();showToast('Precios actualizados.');renderRepresentativeInventoryV7();});
    });
  }

  function renderInventarioV7() { return isAdmin() ? originalRenderInventario() : renderRepresentativeInventoryV7(); }

  function baseSalePrice(p) { return saleType === 'reseller_wholesale' ? resellerLocalWholesalePrice(p) : resellerLocalUnitPrice(p); }
  function groupedSalePrice(p) { return saleSelectedGroup && window.applyPercentGroupV7 ? applyPercentGroupV7(baseSalePrice(p), saleSelectedGroup) : roundBs(baseSalePrice(p)); }
  function saleBreakdown(p) { return buildSalePriceBreakdownV7(p, { saleType, groupId: saleSelectedGroup, seller: true, basePrice: baseSalePrice(p), groupPrice: groupedSalePrice(p), manual: saleManualPrices[p.id] }); }
  function salePrice(p) { return saleBreakdown(p).unitPrice; }
  function salePriceConfigured(p) { return Number(baseSalePrice(p) || 0) > 0; }
  function saleUnits(){return Object.values(saleCart).reduce((s,q)=>s+Number(q||0),0);}
  function manualCount(){return Object.keys(saleManualPrices).filter(id=>saleManualPrices[id]).length;}

  function saleItems(){return Object.entries(saleCart).map(([id,qty])=>{
    const p=AppState.products.find(x=>x.id===id);if(!p)return null;
    const b=saleBreakdown(p); const q=Number(qty||0); const cost=resellerEffectiveCost(p); const signed=roundBs(b.unitPrice-b.basePrice);
    return {
      productId:p.id, productName:p.name, category:p.category||'General', qty:q,
      originalUnitPrice:b.basePrice, groupUnitPrice:b.groupPrice, manualUnitPrice:b.manual?b.unitPrice:null,
      unitPrice:b.unitPrice, priceSource:b.source, priceAdjustmentType:b.sign, priceAdjustmentAmount:b.adjustmentAmount,
      priceAdjustmentSigned:b.adjustmentSigned, priceAdjustmentPercent:b.adjustmentPercent, manualPriceReason:b.manualReason||'',
      groupId:b.groupId, groupName:b.groupName,
      unitCost:cost, subtotal:roundBs(b.unitPrice*q), originalSubtotal:roundBs(b.basePrice*q), groupSubtotal:roundBs(b.groupPrice*q),
      discountAmount:signed<0?roundBs(Math.abs(signed)*q):0, surchargeAmount:signed>0?roundBs(signed*q):0,
      profit:roundBs((b.unitPrice-cost)*q), sellerUnitProfit:roundBs(b.unitPrice-cost), sellerProfit:roundBs((b.unitPrice-cost)*q)
    };
  }).filter(Boolean);}
  function saleTotal(){return saleItems().reduce((s,i)=>s+i.subtotal,0);}

  function changeSaleQty(id,delta){const p=AppState.products.find(x=>x.id===id);if(!p)return;if(delta>0&&!salePriceConfigured(p)){showToast('Configura primero tu precio base para este producto.','error');return openOwnPriceEditor(id);}const next=Math.max(0,Math.min(Number(p.stock||0),Number(saleCart[id]||0)+delta));if(next===0){delete saleCart[id];delete saleManualPrices[id];}else saleCart[id]=next;renderRepresentativeSalesV7();}

  function openRepPriceEditor(id){
    const p=AppState.products.find(x=>x.id===id); if(!p||!saleCart[id])return showToast('Agrega primero el producto al carrito.','error');
    openSalePriceEditorV7({product:p,breakdown:saleBreakdown(p),manual:saleManualPrices[id],onApply:entry=>{saleManualPrices[id]=entry;renderRepresentativeSalesV7();showToast('Precio manual aplicado.');},onReset:()=>{delete saleManualPrices[id];renderRepresentativeSalesV7();showToast('Precio restablecido.');}});
  }

  function renderSaleCartBar(){let bar=$('#cartBar');if(!bar){bar=document.createElement('div');bar.id='cartBar';bar.className='cartBar v7CartBar';$('#app').appendChild(bar);}if(!saleUnits()){bar.classList.add('hidden');return;}bar.classList.remove('hidden');bar.innerHTML=`<div><strong>${saleUnits()} unidad(es)${manualCount()?` · ${manualCount()} manual`:''}</strong><span>${fmtMoney(saleTotal())}</span></div><button class="btn" id="v7SaleCheckout">Cobrar</button>`;$('#v7SaleCheckout').addEventListener('click',openSaleCheckoutV7);}

  function renderRepresentativeSalesV7(){
    $('#fabAdd').classList.add('hidden');
    const products=AppState.products.filter(p=>p.status!=='archived'&&Number(p.stock||0)>0);
    const groupsEnabled=AppState.settings.priceGroupsEnabled&&AppState.priceGroups.length>0;
    $('#mainArea').innerHTML=`<section class="v7PageHead"><span class="v7Eyebrow">Ventas a tus clientes</span><h1>Vender</h1><p>Elige venta unitaria o mayorista. Puedes aplicar grupos y excepciones manuales.</p></section><div class="v7Segment"><button data-sale-type="reseller_unit" class="${saleType==='reseller_unit'?'active':''}">Venta unitaria</button><button data-sale-type="reseller_wholesale" class="${saleType==='reseller_wholesale'?'active':''}">Venta mayorista</button></div>${groupsEnabled?`<div class="field"><label>Grupo / zona de venta opcional</label><select id="repSaleGroup"><option value="">Sin grupo / precio base</option>${AppState.priceGroups.map(g=>`<option value="${g.id}" ${saleSelectedGroup===g.id?'selected':''}>${escapeHtml(g.name)} (${g.mode==='discount'?'−':'+'}${g.percent}%)</option>`).join('')}</select><small>Los precios manuales se mantienen como excepción.</small></div>`:''}<div class="v7SearchBox"><span>⌕</span><input id="v7SaleSearch" placeholder="Buscar en mi inventario" value="${escapeHtml(saleSearch)}"></div><section class="v7ProductGrid">${products.map(p=>{const q=Number(saleCart[p.id]||0);const configured=salePriceConfigured(p);const b=saleBreakdown(p);return`<article class="v7ProductCard ${configured?'':'unpriced'} price-${b.source} adjust-${b.sign}"><div class="v7ProductImage">${p.photo?`<img src="${p.photo}" alt="" loading="lazy" decoding="async">`:'<span>NV</span>'}${configured?salePriceBadgeV7(b):'<em>CONFIGURA PRECIO</em>'}</div><div class="v7ProductBody"><small>${escapeHtml(p.category||'General')}</small><h3>${escapeHtml(p.name)}</h3><div class="v7ProductPrice"><strong>${configured?fmtMoney(b.unitPrice):'Sin precio'}</strong><span>Stock: ${p.stock}</span></div>${configured&&b.source!=='normal'?`<div class="priceTrace">${salePriceLabelV7(b)} · Base ${fmtMoney(b.basePrice)}</div>`:''}${configured?`<div class="v7Stepper"><button data-sale-minus="${p.id}">−</button><b>${q}</b><button data-sale-plus="${p.id}">+</button></div>${q>0?`<button class="miniEditPrice" data-rep-edit-price="${p.id}">✎ Editar precio</button>`:''}`:`<button class="btn outline block v7ConfigureSalePrice" data-id="${p.id}">Configurar precio base</button>`}</div></article>`}).join('')||`<div class="v7Empty"><span>🌱</span><h3>Sin productos para vender</h3><p>Necesitas stock confirmado en tu Inventario propio.</p></div>`}</section>`;
    $all('[data-sale-type]').forEach(b=>b.addEventListener('click',()=>{saleType=b.dataset.saleType;saleCart={};saleManualPrices={};renderRepresentativeSalesV7();}));
    const group=$('#repSaleGroup'); if(group)group.addEventListener('change',()=>{if(manualCount()){const keep=window.confirm(`Hay ${manualCount()} producto(s) con precio manual.\n\nAceptar: mantener precios manuales.\nCancelar: reemplazar todos con el grupo.`);if(!keep)saleManualPrices={};}saleSelectedGroup=group.value||null;renderRepresentativeSalesV7();});
    bindStableSearch('#v7SaleSearch','#mainArea .v7ProductCard',value=>{saleSearch=value;});$all('[data-sale-plus]').forEach(b=>b.addEventListener('click',()=>changeSaleQty(b.dataset.salePlus,1)));$all('[data-sale-minus]').forEach(b=>b.addEventListener('click',()=>changeSaleQty(b.dataset.saleMinus,-1)));$all('[data-rep-edit-price]').forEach(b=>b.addEventListener('click',()=>openRepPriceEditor(b.dataset.repEditPrice)));$all('.v7ConfigureSalePrice').forEach(b=>b.addEventListener('click',()=>openOwnPriceEditor(b.dataset.id)));renderSaleCartBar();
  }

  async function saveV7Client(data){
    let phone = window.normalizePhoneV723 ? normalizePhoneV723(data.phone || '') : String(data.phone || '').trim();
    let client=AppState.clients.find(c=>(phone && window.normalizePhoneV723 && normalizePhoneV723(c.phone)===phone)||normalizeSearch(c.name)===normalizeSearch(data.name));
    if (window.buildClientRecordV723 && window.saveClientV723) return saveClientV723(buildClientRecordV723(client || {}, Object.assign({}, data, { phone })));
    const row=Object.assign({},client||{id:uid('cli'),createdAt:Date.now()},{name:data.name,phone:phone||'',customerType:data.customerType,businessName:data.businessName||'',address:data.address||'',city:data.city||'',locationLabel:data.locationLabel||data.location||'',notes:data.notes||'',updatedAt:Date.now()});
    await DB.put('clients',row); const idx=AppState.clients.findIndex(c=>c.id===row.id);if(idx>=0)AppState.clients[idx]=row;else AppState.clients.push(row);return row;
  }

  function openSaleCheckoutV7(){
    const items = saleItems(); const total = saleTotal();
    if (!items.length) return showToast('Selecciona al menos un producto.', 'error');
    if (items.some(i => Number(i.unitPrice || 0) <= 0) || total <= 0) return showToast('Todos los productos deben tener un precio de venta válido.', 'error');
    const discounts=items.reduce((s,i)=>s+Number(i.discountAmount||0),0); const surcharges=items.reduce((s,i)=>s+Number(i.surchargeAmount||0),0);
    const operation = { id: uid('sale'), documentNumber: '', client: null, sale: null, submitting: false };
    openSheet(`
      <h2>Confirmar venta al contado <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CartList">${items.map(i => `<div class="priceLine ${i.priceSource}"><span><strong>${escapeHtml(i.productName)} ${salePriceBadgeV7({source:i.priceSource,sign:i.priceAdjustmentType})}</strong><small>${i.qty} × ${fmtMoney(i.unitPrice)} · ${salePriceLabelV7({source:i.priceSource,sign:i.priceAdjustmentType,adjustmentAmount:i.priceAdjustmentAmount,groupName:i.groupName})}</small>${i.manualPriceReason?`<small>${escapeHtml(i.manualPriceReason)}</small>`:''}</span><b>${fmtMoney(i.subtotal)}</b></div>`).join('')}</div>
      ${(discounts||surcharges)?`<div class="priceSummaryBox"><span>Rebajas: <b>${fmtMoney(discounts)}</b></span><span>Recargos: <b>${fmtMoney(surcharges)}</b></span></div>`:''}
      <div class="v7TotalLine"><span>Total a cobrar</span><strong>${fmtMoney(total)}</strong></div>
      <div class="field-row"><div class="field"><label>Monto pagado ahora</label><input id="v7AmountPaid" type="number" inputmode="decimal" step="0.01" value="${total}"></div><div class="field"><label>Saldo pendiente</label><input id="v7PendingBalance" readonly value="0"></div></div>
      <div class="field"><label>Motivo si queda saldo pendiente</label><input id="v7PendingReason" placeholder="Ej.: saldo pendiente, transferencia pendiente"></div>
      <div class="v7CashNotice">Si queda saldo, aparecerá en Ventas por cobrar. La venta descuenta stock al confirmarse.</div>
      <div class="sectiontitle2"><span>Cliente</span></div>
      <div class="field"><label>Nombre *</label><div class="clientInputRow"><input id="v7ClientName" autocomplete="off" placeholder="Nombre del cliente o tienda"><button type="button" class="miniClientPick" id="pickRepClientV723">▾</button></div><small>${saleType === 'reseller_wholesale' ? 'Se muestran primero mayoristas, mixtos y sin clasificar.' : 'Se muestran primero clientes unitarios, mixtos y sin clasificar.'}</small></div>
      <div class="field"><label>WhatsApp</label><div class="clientInputRow"><input id="v7ClientPhone" inputmode="tel" autocomplete="off"><button type="button" class="waIconBtnV723" id="v7ClientWaV723"><span class="waLogoV725">☎</span></button></div></div>
      <input type="hidden" id="v7ClientType" value="${saleType === 'reseller_wholesale' ? 'wholesale' : 'unit'}">
      ${saleType === 'reseller_wholesale' ? `<button type="button" class="btn outline block" id="registerRepWholesaleV725">Registrar datos de mayorista</button>` : ''}
      <details class="v7OptionalDetails"><summary>Datos opcionales del cliente</summary><div class="field"><label>Dirección</label><input id="v7ClientAddress"></div><div class="field"><label>Ciudad</label><input id="v7ClientCity"></div><div class="field"><label>Dato de ubicación</label><input id="v7ClientLocation"></div><div class="field"><label>Observaciones</label><textarea id="v7ClientNotes"></textarea></div></details>
      <div class="actions stickyActions"><button class="btn block" id="confirmSaleV7">Confirmar pago y generar recibo</button></div>
    `, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', () => { if (!operation.submitting) close(); });
      const fillClientV723 = (c) => { if (!c) return; operation.client = c; $('#v7ClientName', overlay).value = c.name || ''; $('#v7ClientPhone', overlay).value = c.phone || ''; $('#v7ClientAddress', overlay).value = c.address || ''; $('#v7ClientCity', overlay).value = c.city || ''; $('#v7ClientLocation', overlay).value = c.locationLabel || c.location || ''; $('#v7ClientNotes', overlay).value = c.notes || ''; let rebuildForBenefit=false; if (c.priceGroupId && c.priceGroupId !== saleSelectedGroup) { const g=AppState.priceGroups.find(x=>x.id===c.priceGroupId); if(g && window.confirm(`Este cliente tiene beneficio/grupo: ${g.name}. ¿Aplicarlo a esta venta?`)){ saleSelectedGroup=c.priceGroupId; rebuildForBenefit=true; } } const personalPct=Number(c.customDiscountPercent||0); const benefitActive=!c.benefitUntil||new Date(`${c.benefitUntil}T23:59:59`).getTime()>=Date.now(); if(personalPct>0&&benefitActive&&window.confirm(`Este cliente tiene ${personalPct}% de descuento personal adicional. ¿Aplicarlo a esta venta?`)){ Object.keys(saleCart).forEach(productId=>{const product=AppState.products.find(p=>p.id===productId);if(!product)return;const reference=groupedSalePrice(product);saleManualPrices[productId]={manualPrice:roundBs(Math.max(0,reference*(1-personalPct/100))),mode:'client_benefit',value:personalPct,reason:c.benefitNote||`Beneficio personal ${personalPct}%`};}); rebuildForBenefit=true;} if(rebuildForBenefit){AppState.lastClient=c;close();setTimeout(openSaleCheckoutV7,80);} };
      $('#pickRepClientV723', overlay).addEventListener('click', () => openClientSelectorSheet({ saleType, onSelect: fillClientV723 }));
      if ($('#registerRepWholesaleV725', overlay)) $('#registerRepWholesaleV725', overlay).addEventListener('click', () => { window._afterClientSaved = fillClientV723; openClientForm(null, { name: $('#v7ClientName', overlay).value.trim(), phone: $('#v7ClientPhone', overlay).value.trim(), customerType: 'wholesale' }); });
      $('#v7ClientWaV723', overlay).addEventListener('click', () => openWhatsAppV723($('#v7ClientPhone', overlay).value, $('#v7ClientName', overlay).value));
      const updatePaymentV725=()=>{const paid=Math.max(0,Number($('#v7AmountPaid',overlay).value||0));$('#v7PendingBalance',overlay).value=roundBs(Math.max(0,total-paid));};
      $('#v7AmountPaid',overlay).addEventListener('input',updatePaymentV725); updatePaymentV725();
      $('#v7ClientName', overlay).addEventListener('blur', () => { const c = AppState.clients.find(x => normalizeSearch(x.name) === normalizeSearch($('#v7ClientName', overlay).value)); if (c) fillClientV723(c); });
      $('#confirmSaleV7', overlay).addEventListener('click', async () => {
        if (operation.submitting) return; const name = $('#v7ClientName', overlay).value.trim(); if (!name) return showToast('Ingresa el nombre del cliente.', 'error'); if (!navigator.onLine) return showToast('Se necesita internet para registrar la venta.', 'error');
        const btn = $('#confirmSaleV7', overlay); operation.submitting = true; btn.disabled = true; btn.textContent = 'Verificando stock y guardando…';
        try {
          const productRefresh = await syncCloudProductsToLocal(); if (productRefresh && productRefresh.ok === false) throw new Error(productRefresh.message);
          for (const item of items) { const current = AppState.products.find(p => p.id === item.productId); if (!current || Number(current.stock || 0) < Number(item.qty || 0)) throw new Error(`Stock insuficiente para ${item.productName}. Actualiza el carrito y vuelve a intentarlo.`); }
          if (!operation.client) operation.client = await saveV7Client({ name, phone: $('#v7ClientPhone', overlay).value.trim(), customerType: $('#v7ClientType', overlay).value, address: $('#v7ClientAddress', overlay).value.trim(), city: $('#v7ClientCity', overlay).value.trim(), locationLabel: $('#v7ClientLocation', overlay).value.trim(), notes: $('#v7ClientNotes', overlay).value.trim() });
          if (!operation.documentNumber) { const num = await nextDocumentNumberV7('NV-VTA'); if (!num.ok) throw new Error(num.message); operation.documentNumber = num.number; }
          if (!operation.sale) { const paidNow=roundBs(Math.min(total,Math.max(0,Number($('#v7AmountPaid',overlay).value||0)))); const pendingNow=roundBs(Math.max(0,total-paidNow)); operation.sale = { id: operation.id, documentNumber: operation.documentNumber, receiptNumber: operation.documentNumber, type: saleType, role: AppState.session.roleName, sellerId: AppState.session.onlineUserId || AppState.session.userId, sellerName: AppState.session.fullName, sellerBusinessName: window.myCommercialProfile ? (myCommercialProfile().businessName || '') : '', sellerQrUrl: window.myCommercialProfile ? (myCommercialProfile().qrUrl || '') : '', sellerReceiptMessage: window.myCommercialProfile ? (myCommercialProfile().receiptMessage || '') : '', groupId: saleSelectedGroup, groupName: saleSelectedGroup ? ((AppState.priceGroups.find(g=>g.id===saleSelectedGroup)||{}).name||'') : null, items, total, originalTotal: items.reduce((s,i)=>s+i.originalSubtotal,0), discountTotal: discounts, surchargeTotal: surcharges, sellerProfit: items.reduce((sum, item) => sum + Number(item.profit || 0), 0), clientId: operation.client.id, clientName: operation.client.name, clientPhone: operation.client.phone, clientCity: operation.client.city || '', clientAddress: operation.client.address || '', clientBusinessName: operation.client.businessName || '', customerType: operation.client.customerType || '', paymentMethod: 'cash', paymentStatus: pendingNow>0 ? (paidNow>0?'partial':'pending') : 'paid', amountPaid: paidNow, pendingBalance: pendingNow, pendingReason: pendingNow>0 ? $('#v7PendingReason',overlay).value.trim() : '', date: Date.now(), syncStatus: 'cloud' }; }
          await DB.put('sales', operation.sale); await Promise.all([syncCloudProductsToLocal().catch(() => null), window.syncCloudSalesToLocal ? syncCloudSalesToLocal().catch(() => null) : Promise.resolve()]); if (!AppState.sales.some(s => s.id === operation.sale.id)) AppState.sales.push(operation.sale); close(); saleCart = {}; saleManualPrices = {}; showToast('Venta registrada y stock actualizado.'); openV7ReceiptPreview(operation.sale, 'sale'); renderRepresentativeSalesV7();
        } catch (err) { operation.submitting = false; btn.disabled = false; btn.textContent = 'Reintentar la misma operación'; const message = window.messageFromError ? messageFromError(err, 'No se pudo guardar la venta.') : (err.message || 'No se pudo guardar la venta.'); showToast(message, 'error'); }
      });
    });
  }

  function renderVenderV7(){return isAdmin()?originalRenderVender():renderRepresentativeSalesV7();}
  Object.assign(window,{renderInventario:renderInventarioV7,renderVender:renderVenderV7,renderRepresentativeInventoryV7,renderRepresentativeSalesV7,openOwnPriceEditor});
})();
