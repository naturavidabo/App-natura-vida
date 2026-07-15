/* NATURA VIDA V7 — compra online, pedidos y venta directa a representantes. */

(() => {
  let orderCart = {};
  let orderSearch = '';
  let orderNote = '';
  let editingOrderId = null;

  const STATUS = {
    submitted: ['Enviado', 'info'],
    modified: ['Modificado', 'warning'],
    approved_pending_payment: ['Aprobado · pendiente de pago', 'warning'],
    paid: ['Pagado · stock transferido', 'success'],
    cancelled: ['Cancelado', 'muted'],
    rejected: ['Rechazado', 'danger']
  };

  function statusMeta(status) { return STATUS[status] || [status || 'Enviado', 'info']; }
  function centralStock(p) { return Math.max(0, Number(p.adminStock != null ? p.adminStock : p.stock) || 0); }
  function representativeOrderPrice(p) {
    const base = representativePrice(p);
    const groupId = AppState.session.priceGroupId || '';
    const grouped = groupId && window.applyPercentGroupV7 ? applyPercentGroupV7(base, groupId) : base;
    const discount = Math.min(100, Math.max(0, Number(AppState.session.discountPercent || 0)));
    return roundBs(grouped * (1 - discount / 100));
  }
  function cartUnits() { return Object.values(orderCart).reduce((s, q) => s + Number(q || 0), 0); }
  function cartItems() {
    return Object.entries(orderCart).map(([id, qty]) => {
      const p = AppState.products.find(x => x.id === id);
      if (!p) return null;
      const unitPrice = representativeOrderPrice(p);
      return { productId: p.id, productName: p.name, category: p.category || 'General', qty: Number(qty), unitPrice, subtotal: roundBs(unitPrice * Number(qty)) };
    }).filter(Boolean);
  }
  function cartTotal() { return cartItems().reduce((s, i) => s + i.subtotal, 0); }

  async function currentOrders() {
    const rows = await DB.getAll('purchaseOrders').catch(() => []);
    AppState.purchaseOrders = rows;
    return rows;
  }

  function changeOrderQty(productId, delta) {
    const p = AppState.products.find(x => x.id === productId);
    if (!p) return;
    const max = centralStock(p);
    const next = Math.max(0, Math.min(max, Number(orderCart[productId] || 0) + delta));
    if (next === 0) delete orderCart[productId]; else orderCart[productId] = next;
    renderOrderRequestV7();
  }

  function renderOrderCartBar() {
    let bar = $('#cartBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cartBar';
      bar.className = 'cartBar v7CartBar';
      $('#app').appendChild(bar);
    }
    if (!cartUnits()) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    bar.innerHTML = `<div><strong>${cartUnits()} unidad(es)</strong><span>${fmtMoney(cartTotal())}</span></div><button class="btn" id="openOrderCartV7">Ver carrito</button>`;
    $('#openOrderCartV7').addEventListener('click', openOrderCartSheet);
  }

  function orderCard(order, representativeView = false) {
    const [label, tone] = statusMeta(order.status);
    const canEdit = representativeView && ['submitted', 'modified', 'approved_pending_payment'].includes(order.status);
    const canCancel = representativeView && !['paid', 'cancelled', 'rejected'].includes(order.status);
    return `<article class="v7OrderCard ${tone}">
      <div class="v7OrderTop"><div><span class="v7DocNumber">${escapeHtml(order.orderNumber || 'Pedido')}</span><strong>${representativeView ? 'Compra a Natura Vida' : escapeHtml(order.representativeName || 'Representante')}</strong></div><span class="v7Status ${tone}">${escapeHtml(label)}</span></div>
      <div class="v7OrderItems">${(order.items || []).slice(0,4).map(i => `<span>${escapeHtml(i.productName)} <b>× ${i.qty}</b></span>`).join('')}${(order.items || []).length > 4 ? `<span>+ ${(order.items || []).length - 4} producto(s)</span>` : ''}</div>
      <div class="v7OrderFoot"><span>${fmtDateTime(order.createdAt)}</span><strong>${fmtMoney(order.total || 0)}</strong></div>
      <div class="v7OrderActions">
        ${canEdit ? `<button class="btn sm outline v7EditOwnOrder" data-id="${order.id}">Modificar</button>` : ''}
        ${canCancel ? `<button class="btn sm ghost dangerText v7CancelOwnOrder" data-id="${order.id}">Cancelar</button>` : ''}
        ${order.status === 'approved_pending_payment' ? `<button class="btn sm v7PaymentOrder" data-id="${order.id}">Ver QR y pagar</button>` : ''}
        ${order.status === 'paid' ? `<button class="btn sm v7ReceiptOrder" data-id="${order.id}">Ver recibo</button>` : ''}
      </div>
    </article>`;
  }

  async function renderOrderRequestV7() {
    if (isAdmin()) return renderAdminOrdersInboxV7();
    $('#fabAdd').classList.add('hidden');
    const orders = (await currentOrders()).filter(o => o.representativeId === AppState.session.userId).sort((a,b)=>b.createdAt-a.createdAt);
    const products = AppState.products.filter(p => p.status !== 'archived');
    const discount = Number(AppState.session.discountPercent || 0);
    const repGroup = AppState.priceGroups.find(g => g.id === (AppState.session.priceGroupId || ''));
    $('#mainArea').innerHTML = `
      <section class="v7PageHead v7BuyHead"><span class="v7Eyebrow">Catálogo central</span><h1>Compra online</h1><p>Elige productos, envía tu solicitud y recibe el stock cuando el administrador confirme el pago.</p>${repGroup ? `<span class="v7DiscountChip">Grupo: ${escapeHtml(repGroup.name)}</span>` : ''}${discount > 0 ? `<span class="v7DiscountChip">Descuento personal: ${discount}%</span>` : ''}</section>
      ${editingOrderId ? `<div class="v7EditBanner"><span>Editando pedido ${escapeHtml((orders.find(o=>o.id===editingOrderId)||{}).orderNumber || '')}</span><button id="cancelEditOrderV7">Cancelar edición</button></div>` : ''}
      <div class="v7SearchBox"><span>⌕</span><input id="v7OrderSearch" placeholder="Buscar producto o categoría" value="${escapeHtml(orderSearch)}"></div>
      <section class="v7ProductGrid">
        ${products.map(p => {
          const stock = centralStock(p); const qty = Number(orderCart[p.id] || 0); const price = representativeOrderPrice(p);
          return `<article class="v7ProductCard ${stock === 0 ? 'soldout' : ''}">
            <div class="v7ProductImage">${p.photo ? `<img src="${p.photo}" alt="" loading="lazy" decoding="async" >` : '<span>NV</span>'}${stock === 0 ? '<em>AGOTADO</em>' : ''}</div>
            <div class="v7ProductBody"><small>${escapeHtml(p.category || 'General')}</small><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description || '')}</p><div class="v7ProductPrice"><strong>${fmtMoney(price)}</strong><span>${stock} disponibles</span></div>
            <div class="v7Stepper"><button data-minus="${p.id}" ${stock===0?'disabled':''}>−</button><b>${qty}</b><button data-plus="${p.id}" ${stock===0?'disabled':''}>+</button></div></div>
          </article>`;
        }).join('') || `<div class="v7Empty"><span>🌿</span><h3>No hay productos disponibles</h3><p>El catálogo aparecerá cuando el administrador publique productos activos.</p></div>`}
      </section>
      <section class="v7Panel v7OrderHistory"><div class="v7PanelHead"><div><span class="v7Eyebrow">Registro permanente</span><h2>Mis pedidos</h2></div><span>${orders.length}</span></div>${orders.map(o=>orderCard(o,true)).join('') || '<div class="v7EmptyInline"><span>🛒</span><div><strong>Aún no hiciste pedidos</strong><small>Tu historial aparecerá aquí.</small></div></div>'}</section>`;
    bindStableSearch('#v7OrderSearch', '#mainArea .v7ProductCard', value => { orderSearch = value; });
    $all('[data-plus]').forEach(b => b.addEventListener('click', () => changeOrderQty(b.dataset.plus, 1)));
    $all('[data-minus]').forEach(b => b.addEventListener('click', () => changeOrderQty(b.dataset.minus, -1)));
    if ($('#cancelEditOrderV7')) $('#cancelEditOrderV7').addEventListener('click', () => { editingOrderId = null; orderCart = {}; orderNote = ''; renderOrderRequestV7(); });
    $all('.v7EditOwnOrder').forEach(b => b.addEventListener('click', () => editOwnOrder(b.dataset.id, orders)));
    $all('.v7CancelOwnOrder').forEach(b => b.addEventListener('click', () => cancelOwnOrder(b.dataset.id)));
    $all('.v7PaymentOrder, .v7ReceiptOrder').forEach(b => b.addEventListener('click', () => {
      const o = orders.find(x => x.id === b.dataset.id); if (o) openV7ReceiptPreview(o, 'order');
    }));
    renderOrderCartBar();
  }

  function editOwnOrder(id, orders) {
    const order = orders.find(o => o.id === id); if (!order) return;
    editingOrderId = id; orderCart = {}; orderNote = order.note || '';
    (order.items || []).forEach(i => { orderCart[i.productId] = Number(i.qty || 0); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderOrderRequestV7();
  }

  async function cancelOwnOrder(id) {
    if (!confirmDialog('¿Cancelar este pedido? Solo puede cancelarse antes de confirmar el pago.')) return;
    const res = await cancelPurchaseOrderV7(id);
    showToast(res.ok ? 'Pedido cancelado.' : res.message, res.ok ? undefined : 'error');
    if (res.ok) renderOrderRequestV7();
  }

  function openOrderCartSheet() {
    const items = cartItems();
    openSheet(`
      <h2>${editingOrderId ? 'Modificar pedido' : 'Confirmar pedido'} <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CartList">${items.map(i => `<div><span><strong>${escapeHtml(i.productName)}</strong><small>${i.qty} × ${fmtMoney(i.unitPrice)}</small></span><b>${fmtMoney(i.subtotal)}</b></div>`).join('')}</div>
      <div class="field"><label>Nota para el administrador</label><textarea id="v7OrderNote" rows="3" placeholder="Ej.: enviar por flota, confirmar horario...">${escapeHtml(orderNote)}</textarea></div>
      <div class="v7TotalLine"><span>Total al contado</span><strong>${fmtMoney(cartTotal())}</strong></div>
      <div class="v7CashNotice">El stock pasa a tu inventario únicamente cuando el administrador confirma el pago.</div>
      <button class="btn block" id="submitOrderV7">${editingOrderId ? 'Guardar modificación' : 'Enviar pedido'}</button>
      <button class="btn outline block" id="clearOrderV7">Vaciar carrito</button>
    `, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#clearOrderV7', overlay).addEventListener('click', () => { orderCart = {}; orderNote = ''; editingOrderId = null; close(); renderOrderRequestV7(); });
      $('#submitOrderV7', overlay).addEventListener('click', async () => {
        if (!navigator.onLine) return showToast('Se necesita internet para enviar el pedido.', 'error');
        orderNote = $('#v7OrderNote', overlay).value.trim();
        const payload = { items: cartItems(), total: cartTotal(), note: orderNote, representativeName: AppState.session.fullName, representativePhone: AppState.session.phone || '', representativeCity: AppState.session.city || '', source: 'representative', status: editingOrderId ? 'modified' : 'submitted', paymentStatus: 'pending', updatedAt: Date.now() };
        const btn = $('#submitOrderV7', overlay); btn.disabled = true; btn.textContent = 'Guardando en Supabase…';
        const res = editingOrderId ? await representativeUpdateOrderV7(editingOrderId, payload) : await createPurchaseOrderV7(Object.assign({ id: uid('order'), createdAt: Date.now() }, payload));
        if (!res.ok) { btn.disabled = false; btn.textContent = 'Reintentar'; return showToast(res.message, 'error'); }
        orderCart = {}; orderNote = ''; editingOrderId = null; close(); showToast('Pedido enviado correctamente.'); renderOrderRequestV7();
      });
    });
  }

  function adminOrderActions(order) {
    if (order.status === 'paid') return `<button class="btn sm v7ReceiptAdminOrder" data-id="${order.id}">Recibo</button>`;
    if (['cancelled','rejected'].includes(order.status)) return '';
    return `${['submitted','modified','approved_pending_payment'].includes(order.status) ? `<button class="btn sm outline v7AdminEditOrder" data-id="${order.id}">${order.status === 'approved_pending_payment' ? 'Modificar antes del pago' : 'Revisar / modificar'}</button>` : ''}${['submitted','modified'].includes(order.status) ? `<button class="btn sm v7ApproveOrder" data-id="${order.id}">Aprobar</button>` : ''}${order.status === 'approved_pending_payment' ? `<button class="btn sm outline v7PaymentAdminOrder" data-id="${order.id}">Orden de pago</button><button class="btn sm v7ConfirmPayment" data-id="${order.id}">Confirmar pago</button>` : ''}<button class="btn sm ghost dangerText v7RejectOrder" data-id="${order.id}">Rechazar</button>`;
  }

  async function renderAdminOrdersInboxV7() {
    $('#fabAdd').classList.add('hidden');
    await refreshOrdersV7().catch(() => {});
    const orders = (await currentOrders()).sort((a,b)=>b.createdAt-a.createdAt);
    $('#mainArea').innerHTML = `
      <section class="v7PageHead v7AdminOrdersHead"><div><span class="v7Eyebrow">Compras de representantes</span><h1>Pedidos y cobros</h1><p>Revisa, modifica, aprueba y confirma pagos al contado.</p></div><button class="btn" id="v7DirectSaleBtn">+ Venta directa</button></section>
      <section class="v7MetricGrid compact"><article class="v7MetricCard"><span>Nuevos</span><strong>${orders.filter(o=>['submitted','modified'].includes(o.status)).length}</strong></article><article class="v7MetricCard"><span>Pendientes de pago</span><strong>${orders.filter(o=>o.status==='approved_pending_payment').length}</strong></article><article class="v7MetricCard primary"><span>Pagados</span><strong>${orders.filter(o=>o.status==='paid').length}</strong></article></section>
      <section class="v7AdminOrderList">${orders.map(order => { const [label,tone]=statusMeta(order.status); return `<article class="v7AdminOrderCard ${tone}"><div class="v7OrderTop"><div><span class="v7DocNumber">${escapeHtml(order.orderNumber || 'Pedido')}</span><strong>${escapeHtml(order.representativeName || 'Representante')}</strong><small>${fmtDateTime(order.createdAt)} · ${order.source === 'admin_direct' ? 'Venta directa' : 'Pedido online'}</small></div><span class="v7Status ${tone}">${escapeHtml(label)}</span></div><div class="v7OrderItems">${(order.items||[]).map(i=>`<span>${escapeHtml(i.productName)} <b>× ${i.qty}</b> · ${fmtMoney(i.subtotal)}</span>`).join('')}</div>${order.note?`<div class="v7OrderNote">${escapeHtml(order.note)}</div>`:''}<div class="v7OrderFoot"><span>${order.receiptNumber ? escapeHtml(order.receiptNumber) : 'Pago al contado'}</span><strong>${fmtMoney(order.total)}</strong></div><div class="v7OrderActions">${adminOrderActions(order)}</div></article>`; }).join('') || '<div class="v7Empty"><span>📦</span><h3>Sin pedidos</h3><p>Las solicitudes aparecerán automáticamente.</p></div>'}</section>`;
    $('#v7DirectSaleBtn').addEventListener('click', openDirectRepresentativeSale);
    $all('.v7AdminEditOrder').forEach(b => b.addEventListener('click', () => openAdminOrderEditor(b.dataset.id, orders)));
    $all('.v7ApproveOrder').forEach(b => b.addEventListener('click', () => approveAdminOrder(b.dataset.id)));
    $all('.v7PaymentAdminOrder').forEach(b => b.addEventListener('click', () => { const o=orders.find(x=>x.id===b.dataset.id); if(o) openV7ReceiptPreview(o,'order'); }));
    $all('.v7ConfirmPayment').forEach(b => b.addEventListener('click', () => confirmAdminOrderPayment(b.dataset.id)));
    $all('.v7RejectOrder').forEach(b => b.addEventListener('click', () => rejectAdminOrder(b.dataset.id, orders)));
    $all('.v7ReceiptAdminOrder').forEach(b => b.addEventListener('click', () => { const o=orders.find(x=>x.id===b.dataset.id); if(o) openV7ReceiptPreview(o,'order'); }));
  }

  function openAdminOrderEditor(id, orders) {
    const order = orders.find(o => o.id === id); if (!order) return;
    const items = JSON.parse(JSON.stringify(order.items || []));
    const profile = (AppState.allProfiles || []).find(p => p.id === order.representativeId) || {};
    const orderDiscount = Math.min(100, Math.max(0, Number(order.representativeDiscountPercent ?? profile.representative_discount_percent ?? 0)));
    const suggestedOrderPrice = product => roundBs(representativePrice(product) * (1 - orderDiscount / 100));
    openSheet(`<h2>Revisar ${escapeHtml(order.orderNumber || 'pedido')} <span class="x" id="closeSheet">✕</span></h2><div class="v7EditOrderInfo"><strong>${escapeHtml(order.representativeName || '')}</strong><span>Toda modificación será notificada al representante.</span></div><div id="v7AdminEditItems"></div><div class="field"><label>Agregar producto</label><select id="v7AddProductSelect"><option value="">Seleccionar…</option>${AppState.products.filter(p=>centralStock(p)>0).map(p=>`<option value="${p.id}">${escapeHtml(p.name)} · ${fmtMoney(suggestedOrderPrice(p))}</option>`).join('')}</select></div><div class="field"><label>Nota del administrador</label><textarea id="v7AdminOrderNote">${escapeHtml(order.adminNote || '')}</textarea></div><div class="v7TotalLine"><span>Total actualizado</span><strong id="v7AdminEditTotal"></strong></div><button class="btn block" id="v7SaveAdminOrder">Guardar y notificar</button>`, (overlay, close) => {
      const renderItems = () => {
        $('#v7AdminEditItems', overlay).innerHTML = items.map((i,idx)=>`<div class="v7EditItem"><div><strong>${escapeHtml(i.productName)}</strong><small>Disponible: ${centralStock(AppState.products.find(p=>p.id===i.productId)||{})}</small></div><input type="number" min="0" step="1" value="${i.qty}" data-q="${idx}"><input type="number" min="0" step="0.01" value="${i.unitPrice}" data-p="${idx}"><button data-r="${idx}">×</button></div>`).join('');
        const recalc=()=>{items.forEach(i=>i.subtotal=roundBs(Number(i.qty||0)*Number(i.unitPrice||0))); $('#v7AdminEditTotal',overlay).textContent=fmtMoney(items.reduce((s,i)=>s+i.subtotal,0));};
        $all('[data-q]',overlay).forEach(el=>el.addEventListener('input',()=>{items[Number(el.dataset.q)].qty=Math.max(0,Number(el.value||0));recalc();}));
        $all('[data-p]',overlay).forEach(el=>el.addEventListener('input',()=>{items[Number(el.dataset.p)].unitPrice=Math.max(0,Number(el.value||0));recalc();}));
        $all('[data-r]',overlay).forEach(el=>el.addEventListener('click',()=>{items.splice(Number(el.dataset.r),1);renderItems();})); recalc();
      };
      renderItems();
      $('#closeSheet',overlay).addEventListener('click',close);
      $('#v7AddProductSelect',overlay).addEventListener('change',e=>{const p=AppState.products.find(x=>x.id===e.target.value);if(!p)return;const found=items.find(i=>i.productId===p.id);if(found)found.qty+=1;else { const unitPrice=suggestedOrderPrice(p); items.push({productId:p.id,productName:p.name,category:p.category||'General',qty:1,unitPrice,subtotal:unitPrice}); }e.target.value='';renderItems();});
      $('#v7SaveAdminOrder',overlay).addEventListener('click',async()=>{const clean=items.filter(i=>Number(i.qty)>0&&Number(i.unitPrice)>=0).map(i=>Object.assign(i,{subtotal:roundBs(Number(i.qty)*Number(i.unitPrice))}));if(!clean.length)return showToast('El pedido debe conservar al menos un producto.','error');const payload=Object.assign({},order,{items:clean,total:clean.reduce((s,i)=>s+i.subtotal,0),adminNote:$('#v7AdminOrderNote',overlay).value.trim(),status:'modified',updatedAt:Date.now()});const btn=$('#v7SaveAdminOrder',overlay);btn.disabled=true;btn.textContent='Guardando…';const res=await adminUpdateOrderV7(order.id,payload);if(!res.ok){btn.disabled=false;btn.textContent='Reintentar';return showToast(res.message,'error');}close();showToast('Pedido modificado y notificado.');renderAdminOrdersInboxV7();});
    });
  }

  async function approveAdminOrder(id) { const res=await adminApproveOrderV7(id); showToast(res.ok?'Pedido aprobado. Esperando pago.':res.message,res.ok?undefined:'error'); if(res.ok)renderAdminOrdersInboxV7(); }
  async function confirmAdminOrderPayment(id) { if(!confirmDialog('¿Confirmas que el pago total fue recibido? Al confirmar, el stock pasará al representante.'))return; const res=await adminConfirmOrderPaymentV7(id); showToast(res.ok?'Pago confirmado y stock transferido.':res.message,res.ok?undefined:'error'); if(res.ok){await renderAdminOrdersInboxV7();const orders=await currentOrders();const o=orders.find(x=>x.id===id);if(o)openV7ReceiptPreview(o,'order');} }
  async function rejectAdminOrder(id, orders) { if(!confirmDialog('¿Rechazar este pedido?'))return; const order=orders.find(o=>o.id===id);const res=await adminUpdateOrderV7(id,Object.assign({},order,{status:'rejected',updatedAt:Date.now()}));showToast(res.ok?'Pedido rechazado.':res.message,res.ok?undefined:'error');if(res.ok)renderAdminOrdersInboxV7(); }

  async function openDirectRepresentativeSale() {
    const reps = await activeRepresentativesV7();
    if (!reps.length) return showToast('No hay representantes activos.', 'error');

    let selectedRep = reps[0].id;
    const cart = {};
    const priceForRepresentative = (product) => {
      const rep = reps.find(r => r.id === selectedRep) || {};
      const discount = Math.min(100, Math.max(0, Number(rep.representative_discount_percent || 0)));
      return roundBs(representativePrice(product) * (1 - discount / 100));
    };

    openSheet(`
      <h2>Venta directa a representante <span class="x" id="closeSheet">✕</span></h2>
      <div class="field">
        <label>Representante activo</label>
        <select id="v7DirectRep">
          ${reps.map(r => `<option value="${r.id}">${escapeHtml(r.full_name || r.email)} · ${escapeHtml(r.city || '')}${Number(r.representative_discount_percent || 0) > 0 ? ` · descuento ${Number(r.representative_discount_percent)}%` : ''}</option>`).join('')}
        </select>
      </div>
      <div class="v7CashNotice">Se generará una operación pendiente de pago. El stock se transferirá al confirmar el pago.</div>
      <div class="v7DirectProducts">
        ${AppState.products.filter(p => p.status !== 'archived').map(p => `
          <div>
            <span>
              <strong>${escapeHtml(p.name)}</strong>
              <small data-direct-price="${p.id}">${fmtMoney(priceForRepresentative(p))} · ${centralStock(p)} disponibles</small>
            </span>
            <input type="number" min="0" max="${centralStock(p)}" value="0" data-direct="${p.id}" ${centralStock(p) === 0 ? 'disabled' : ''}>
          </div>
        `).join('')}
      </div>
      <div class="field"><label>Nota</label><textarea id="v7DirectNote" placeholder="Detalle de entrega o acuerdo"></textarea></div>
      <div class="v7TotalLine"><span>Total</span><strong id="v7DirectTotal">Bs 0</strong></div>
      <button class="btn block" id="v7CreateDirectSale">Crear venta pendiente de pago</button>
    `, (overlay, close) => {
      const refreshVisiblePrices = () => {
        AppState.products.forEach(product => {
          const el = $(`[data-direct-price="${product.id}"]`, overlay);
          if (el) el.textContent = `${fmtMoney(priceForRepresentative(product))} · ${centralStock(product)} disponibles`;
        });
      };
      const recalc = () => {
        $all('[data-direct]', overlay).forEach(el => {
          cart[el.dataset.direct] = Math.max(0, Number(el.value || 0));
        });
        const total = Object.entries(cart).reduce((sum, [id, qty]) => {
          const product = AppState.products.find(x => x.id === id);
          return sum + (product ? priceForRepresentative(product) * qty : 0);
        }, 0);
        $('#v7DirectTotal', overlay).textContent = fmtMoney(total);
      };

      $('#closeSheet', overlay).addEventListener('click', close);
      $('#v7DirectRep', overlay).addEventListener('change', event => {
        selectedRep = event.target.value;
        refreshVisiblePrices();
        recalc();
      });
      $all('[data-direct]', overlay).forEach(el => el.addEventListener('input', recalc));

      $('#v7CreateDirectSale', overlay).addEventListener('click', async () => {
        recalc();
        const rep = reps.find(r => r.id === selectedRep);
        const items = Object.entries(cart)
          .filter(([, qty]) => qty > 0)
          .map(([id, qty]) => {
            const product = AppState.products.find(x => x.id === id);
            const unitPrice = priceForRepresentative(product);
            return {
              productId: id,
              productName: product.name,
              category: product.category || 'General',
              qty,
              unitPrice,
              subtotal: roundBs(qty * unitPrice)
            };
          });

        if (!items.length) return showToast('Selecciona al menos un producto.', 'error');

        const order = {
          id: uid('order'),
          source: 'admin_direct',
          representativeName: rep.full_name || rep.email,
          representativePhone: rep.phone || '',
          representativeCity: rep.city || '',
          representativeDiscountPercent: Number(rep.representative_discount_percent || 0),
          items,
          total: items.reduce((sum, item) => sum + item.subtotal, 0),
          note: $('#v7DirectNote', overlay).value.trim(),
          status: 'approved_pending_payment',
          paymentStatus: 'pending',
          createdAt: Date.now()
        };

        const btn = $('#v7CreateDirectSale', overlay);
        btn.disabled = true;
        btn.textContent = 'Guardando…';
        const res = await adminCreateDirectOrderV7(selectedRep, order);
        if (!res.ok) {
          btn.disabled = false;
          btn.textContent = 'Reintentar';
          return showToast(res.message, 'error');
        }
        close();
        showToast('Venta creada y notificada al representante.');
        renderAdminOrdersInboxV7();
      });
    });
  }

  Object.assign(window, {
    renderOrderRequest: renderOrderRequestV7,
    renderAdminOrdersInbox: renderAdminOrdersInboxV7,
    renderOrderRequestV7,
    renderAdminOrdersInboxV7
  });
})();
