/* quotes.js — Cotizaciones / precios de oferta para NATURA VIDA. V7.2.6 */

function isExpired(quote) {
  if (!quote.expiryDate) return false;
  return new Date(quote.expiryDate + 'T23:59:59') < new Date();
}

function quoteTotal(q) {
  return (q.items || []).reduce((s, i) => s + (Number(i.price || 0) * Number(i.qty || 0)), 0);
}

function renderQuotes() {
  $('#fabAdd').classList.remove('hidden');
  $('#fabAdd').onclick = () => openQuoteForm();
  const main = $('#mainArea');
  const active = AppState.quotes.filter(q => !isExpired(q)).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const expired = AppState.quotes.filter(q => isExpired(q)).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  let html = `<section class="v7PageHead"><span class="v7Eyebrow">Precios y ofertas</span><h1>Cotizaciones</h1><p>Envía precios personalizados sin descontar stock.</p></section>`;
  html += `<div class="toolrow"><button class="btn" id="newQuoteV726">+ Nueva cotización</button></div>`;
  html += `<div class="sectiontitle" style="color:var(--pine-mid); margin-top:0;">Cotizaciones activas</div>`;
  html += active.length ? active.map(q => quoteCardHtml(q, false)).join('') : `<div class="empty"><span class="ic">📄</span><h3>Sin cotizaciones activas</h3><p>Toca + para crear una nueva.</p></div>`;
  if (expired.length) html += `<div class="sectiontitle" style="color:var(--gray);">Vencidas</div>` + expired.map(q => quoteCardHtml(q, true)).join('');
  main.innerHTML = html;
  $('#newQuoteV726')?.addEventListener('click', () => openQuoteForm());
  $all('.viewQuoteBtn').forEach(b => b.addEventListener('click', () => openQuotePreview(b.dataset.id)));
  $all('.editQuoteBtnV726').forEach(b => b.addEventListener('click', () => openQuoteForm({ quoteId: b.dataset.id })));
  $all('.delQuoteBtn').forEach(b => b.addEventListener('click', () => confirmDeleteQuote(b.dataset.id)));
}

function quoteCardHtml(q, expired) {
  const total = quoteTotal(q);
  return `
  <div class="card" data-id="${q.id}" style="${expired ? 'opacity:0.6;' : ''}">
    <div style="padding:13px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div class="name">${escapeHtml(q.clientName || 'Sin cliente')}</div>
        <span class="pill ${expired ? 'low' : 'ok'}">${expired ? 'vencida' : 'vigente'}</span>
      </div>
      <div class="costline">📞 ${escapeHtml(q.clientPhone || 'sin teléfono')}</div>
      <div class="costline">📅 Válida hasta: ${fmtDate(q.expiryDate)}</div>
      <div class="priceline"><span class="p2">Total: ${fmtMoney(total)}</span></div>
    </div>
    <div class="cardactions">
      <button class="viewQuoteBtn" data-id="${q.id}">👁️ Ver</button>
      <button class="editQuoteBtnV726" data-id="${q.id}">✏️ Editar</button>
      <button class="danger delQuoteBtn" data-id="${q.id}">🗑️</button>
    </div>
  </div>`;
}

async function confirmDeleteQuote(id) {
  if (!confirmDialog('¿Eliminar esta cotización?')) return;
  try {
    await DB.delete('quotes', id);
    AppState.quotes = AppState.quotes.filter(x => x.id !== id);
    renderQuotes();
    showToast('Cotización eliminada.');
  } catch (err) { showToast(err.message || 'No se pudo eliminar la cotización.', 'error'); }
}

function productQuotePrice(prod, groupId) {
  if (!prod) return 0;
  return roundBs(groupId ? priceForGroup(prod, groupId) : unitPrice(prod));
}

function openProductPickerForQuote(onSelect) {
  openSheet(`
    <h2>Elegir producto <span class="x" id="closeSheet">✕</span></h2>
    <div class="field"><input id="quoteProdSearchV726" autocomplete="off" placeholder="Buscar producto o presentación..."></div>
    <div id="quoteProductListV726" class="quoteProductListV726"></div>
  `, (overlay, close) => {
    const render = () => {
      const q = normalizeSearch($('#quoteProdSearchV726', overlay).value || '');
      const rows = (AppState.products || []).filter(p => p.status !== 'archived').filter(p => !q || normalizeSearch([p.name, p.category, p.sku].filter(Boolean).join(' ')).includes(q));
      $('#quoteProductListV726', overlay).innerHTML = rows.length ? rows.map(p => `
        <button type="button" class="quoteProductPickV726" data-id="${p.id}">
          <strong>${escapeHtml(p.name)}</strong>
          <span>${escapeHtml(p.category || 'General')} · ${fmtMoney(unitPrice(p))}</span>
        </button>`).join('') : `<div class="v7Empty small"><span>🔎</span><p>No hay productos.</p></div>`;
      $all('.quoteProductPickV726', overlay).forEach(b => b.addEventListener('click', () => {
        const prod = AppState.products.find(p => p.id === b.dataset.id);
        if (prod && onSelect) onSelect(prod);
        close();
      }));
    };
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#quoteProdSearchV726', overlay).addEventListener('input', render);
    render();
    setTimeout(() => $('#quoteProdSearchV726', overlay)?.focus(), 80);
  });
}

function openQuoteForm(prefill = {}) {
  const editing = prefill.quoteId ? AppState.quotes.find(q => q.id === prefill.quoteId) : (prefill.id && prefill.items ? prefill : null);
  const prefClient = prefill.client || (editing && editing.clientId ? AppState.clients.find(c => c.id === editing.clientId) : null);
  const prefGroupId = prefill.priceGroupId || (editing && editing.priceGroupId) || (prefClient && prefClient.priceGroupId) || '';
  let selectedClient = prefClient || null;
  let items = editing && Array.isArray(editing.items) && editing.items.length
    ? editing.items.map(i => ({ productId: i.productId || '', name: i.name || i.productName || '', price: Number(i.price || i.unitPrice || 0), qty: Number(i.qty || 1) || 1 }))
    : [{ productId: '', name: '', price: 0, qty: 1 }];
  const html = `
    <h2>${editing ? 'Editar precios / cotización' : 'Precios / cotización'} <span class="x" id="closeSheet">✕</span></h2>
    <div class="field"><label>Cliente / posible cliente</label><div class="clientInputRow"><input type="text" id="q_clientname" autocomplete="off" placeholder="Ej: Juan Pérez" value="${escapeHtml((editing && editing.clientName) || (prefClient && prefClient.name) || '')}"><button type="button" class="miniClientPick" id="pickQuoteClientV726">▾</button></div></div>
    <div class="field"><label>Número de teléfono</label><input type="tel" inputmode="tel" id="q_clientphone" autocomplete="off" placeholder="Ej: 71234567" value="${escapeHtml((editing && editing.clientPhone) || (prefClient && prefClient.phone) || '')}"></div>
    <div class="field"><label>Grupo/beneficio aplicado</label><select id="q_group"><option value="">Precio base</option>${AppState.priceGroups.map(g=>`<option value="${g.id}" ${prefGroupId===g.id?'selected':''}>${escapeHtml(g.name)} (${g.mode==='discount'?'−':'+'}${g.percent}%)</option>`).join('')}</select></div>
    <div class="field"><label>Fecha límite de validez</label><input type="date" id="q_expiry" value="${editing ? escapeHtml(editing.expiryDate || todayISO()) : todayISO()}"></div>
    <div class="sectiontitle2"><span>Productos cotizados</span></div>
    <div id="quoteItemsList"></div>
    <button type="button" class="addInsumoBtn" id="addItemBtn">+ Agregar producto</button>
    <div class="totalbox"><span class="lbl">Total cotizado</span><span class="val" id="q_total">${fmtMoney(0)}</span></div>
    <div class="actions stickyActions"><button class="btn outline block" id="cancelForm">Cancelar</button><button class="btn block" id="saveForm">${editing ? 'Guardar cambios' : 'Crear cotización'}</button></div>`;

  openSheet(html, (overlay, close) => {
    const listEl = $('#quoteItemsList', overlay);
    const groupValue = () => $('#q_group', overlay)?.value || '';
    const fillClient = (c) => {
      if (!c) return;
      selectedClient = c;
      $('#q_clientname', overlay).value = c.name || '';
      $('#q_clientphone', overlay).value = c.phone || '';
      if (c.priceGroupId && !$('#q_group', overlay).value) {
        $('#q_group', overlay).value = c.priceGroupId;
        applyGroupToItems();
      }
    };
    function renderItems() {
      listEl.innerHTML = items.map((it, idx) => `
        <div class="quoteItemRowV726" data-idx="${idx}">
          <button type="button" class="quoteItemProductBtnV726" data-idx="${idx}">
            <strong>${escapeHtml(it.name || 'Seleccionar producto')}</strong>
            <small>${it.productId ? 'Tocar para cambiar' : 'Producto completo visible'}</small>
          </button>
          <div class="quoteQtyStepperV726"><button type="button" data-delta="-1" data-idx="${idx}">−</button><input class="item-qty" inputmode="numeric" type="number" min="1" value="${it.qty || 1}"><button type="button" data-delta="1" data-idx="${idx}">+</button></div>
          <input type="number" inputmode="decimal" step="0.01" class="item-price" placeholder="Precio" value="${it.price || ''}">
          <button type="button" class="insumo-del" data-idx="${idx}">✕</button>
        </div>`).join('');
      $all('.quoteItemProductBtnV726', listEl).forEach(btn => btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        openProductPickerForQuote(prod => {
          items[idx].productId = prod.id;
          items[idx].name = prod.name;
          items[idx].price = productQuotePrice(prod, groupValue());
          renderItems(); updateTotal();
        });
      }));
      $all('.item-price', listEl).forEach((inp, idx) => inp.addEventListener('input', () => { items[idx].price = roundBs(parseFloat(inp.value) || 0); updateTotal(); }));
      $all('.item-qty', listEl).forEach((inp, idx) => inp.addEventListener('input', () => { items[idx].qty = Math.max(1, parseInt(inp.value, 10) || 1); updateTotal(); }));
      $all('.quoteQtyStepperV726 button', listEl).forEach(btn => btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx); const d = Number(btn.dataset.delta || 0);
        items[idx].qty = Math.max(1, Number(items[idx].qty || 1) + d); renderItems(); updateTotal();
      }));
      $all('.insumo-del', listEl).forEach(btn => btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        if (items.length <= 1) items[0] = { productId: '', name: '', price: 0, qty: 1 }; else items.splice(idx, 1);
        renderItems(); updateTotal();
      }));
    }
    function updateTotal() { $('#q_total', overlay).textContent = fmtMoney(quoteTotal({ items })); }
    function applyGroupToItems() {
      const gid = groupValue();
      items = items.map(it => {
        const prod = AppState.products.find(p => p.id === it.productId);
        return prod ? Object.assign({}, it, { price: productQuotePrice(prod, gid) }) : it;
      });
      renderItems(); updateTotal();
    }
    renderItems(); updateTotal();
    $('#pickQuoteClientV726', overlay).addEventListener('click', () => openClientSelectorSheet({ saleType: 'market', onSelect: fillClient }));
    $('#q_group', overlay)?.addEventListener('change', applyGroupToItems);
    $('#addItemBtn', overlay).addEventListener('click', () => { items.push({ productId: '', name: '', price: 0, qty: 1 }); renderItems(); updateTotal(); });
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#cancelForm', overlay).addEventListener('click', close);
    $('#saveForm', overlay).addEventListener('click', async () => {
      const clientName = $('#q_clientname', overlay).value.trim();
      const clientPhone = $('#q_clientphone', overlay).value.trim();
      const expiryDate = $('#q_expiry', overlay).value;
      const cleanItems = items.filter(i => i.name && Number(i.qty) > 0 && Number(i.price) >= 0);
      if (!clientName) return showToast('Ingresa el nombre del cliente.', 'error');
      if (!expiryDate) return showToast('Selecciona una fecha de vigencia.', 'error');
      if (!cleanItems.length) return showToast('Agrega al menos un producto.', 'error');
      const client = selectedClient || await findOrCreateClientQuick(clientName, clientPhone, 'wholesale');
      const data = {
        id: editing ? editing.id : uid('quo'),
        clientId: client ? client.id : '', clientName, clientPhone, expiryDate,
        priceGroupId: groupValue(), title: 'Precios / oferta Natura Vida', items: cleanItems,
        createdAt: editing ? (editing.createdAt || Date.now()) : Date.now(), updatedAt: Date.now()
      };
      const saveBtn = $('#saveForm', overlay); saveBtn.disabled = true; saveBtn.textContent = 'Guardando en Supabase…';
      try {
        await DB.put('quotes', data);
        const idx = AppState.quotes.findIndex(q => q.id === data.id);
        if (idx >= 0) AppState.quotes[idx] = data; else AppState.quotes.push(data);
        close(); renderQuotes(); showToast(editing ? 'Cotización actualizada.' : 'Cotización creada.'); openQuotePreview(data.id);
      } catch (err) { saveBtn.disabled = false; saveBtn.textContent = editing ? 'Guardar cambios' : 'Crear cotización'; showToast(err.message || 'No se pudo guardar la cotización.', 'error'); }
    });
  });
}

function openQuotePreview(id) {
  const q = AppState.quotes.find(x => x.id === id);
  if (!q) return;
  const total = quoteTotal(q);
  const html = `
    <h2>Precios / oferta <span class="x" id="closeSheet">✕</span></h2>
    <div class="banner">Cliente: <b>${escapeHtml(q.clientName)}</b> · Tel: ${escapeHtml(q.clientPhone || '—')}<br>Válida hasta: ${fmtDate(q.expiryDate)} ${isExpired(q) ? ' · <b style="color:var(--red)">VENCIDA</b>' : ''}</div>
    ${q.items.map(i => `<div class="histitem"><div class="l"><div class="pname">${escapeHtml(i.name)}</div><div class="meta">Cant: ${i.qty} × ${fmtMoney(i.price)}</div></div><div class="r">${fmtMoney(i.price * i.qty)}</div></div>`).join('')}
    <div class="totalbox"><span class="lbl">Total</span><span class="val">${fmtMoney(total)}</span></div>
    <div class="actions"><button class="btn outline block" id="editQuoteBtnV726">✏️ Editar</button><button class="btn outline block" id="shareQuoteBtn">📤 Compartir</button><button class="btn block" id="imgQuoteBtn">🖼️ Generar imagen</button></div>`;
  openSheet(html, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#editQuoteBtnV726', overlay).addEventListener('click', () => { close(); openQuoteForm({ quoteId: q.id }); });
    $('#shareQuoteBtn', overlay).addEventListener('click', () => shareQuoteText(q, total));
    $('#imgQuoteBtn', overlay).addEventListener('click', () => generateQuoteImage(q, total));
  });
}

function shareQuoteText(q, total) {
  const lines = [`*Precios / oferta — ${AppState.settings.businessName}*`, `Cliente: ${q.clientName}`, `Válida hasta: ${fmtDate(q.expiryDate)}`, '', ...q.items.map(i => `${i.name} x${i.qty} — ${fmtMoney(i.price * i.qty)}`), '', `Total: ${fmtMoney(total)}`];
  const text = lines.join('\n');
  if (navigator.share) navigator.share({ title: 'Precios / oferta', text }).catch(() => {});
  else navigator.clipboard.writeText(text).then(() => showToast('Copiado al portapapeles'));
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2;
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  if (fill) ctx.fill(); if (stroke) ctx.stroke();
}
function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').split(/\s+/); let line = ''; let lines = [];
  words.forEach(w => { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test; });
  if (line) lines.push(line); lines = lines.slice(0, maxLines);
  lines.forEach((l, i) => ctx.fillText(i === maxLines - 1 && lines.length === maxLines && words.length > l.split(/\s+/).length ? l + '…' : l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function drawQuoteCanvas(q, total) {
  const W = 720; const items = q.items || []; const H = Math.max(720, 340 + (items.length * 58) + 180);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F5FAF6'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#FFFFFF'; roundRect(ctx, 34, 34, W - 68, H - 68, 28, true, false);
  ctx.fillStyle = '#01773B'; roundRect(ctx, 34, 34, W - 68, 96, 28, true, false); ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 28px Arial'; ctx.fillText(AppState.settings.businessName || 'NATURA VIDA', 62, 82); ctx.font = '14px Arial'; ctx.fillText(AppState.settings.businessSlogan || 'Te cuida por dentro y por fuera', 62, 108);
  let y = 170; ctx.fillStyle = '#15171A'; ctx.font = 'bold 25px Arial'; ctx.fillText('PRECIOS / OFERTA', 62, y); ctx.textAlign = 'right'; ctx.font = '13px Arial'; ctx.fillStyle = '#6B7280'; ctx.fillText('Fecha: ' + new Date(q.createdAt || Date.now()).toLocaleDateString('es-BO'), W - 62, y); ctx.fillText('Válida hasta: ' + fmtDate(q.expiryDate), W - 62, y + 22); ctx.textAlign = 'left';
  y += 50; ctx.fillStyle = '#EEF7F1'; roundRect(ctx, 62, y, W - 124, 72, 18, true, false); ctx.fillStyle = '#15171A'; ctx.font = 'bold 16px Arial'; ctx.fillText('Cliente: ' + (q.clientName || '—'), 86, y + 30); ctx.font = '14px Arial'; ctx.fillStyle = '#56635B'; ctx.fillText('Teléfono: ' + (q.clientPhone || '—'), 86, y + 52); y += 108;
  ctx.font = 'bold 13px Arial'; ctx.fillStyle = '#6B7280'; ctx.fillText('PRODUCTO', 62, y); ctx.fillText('CANT.', 430, y); ctx.fillText('PRECIO', 500, y); ctx.textAlign = 'right'; ctx.fillText('SUBTOTAL', W - 62, y); ctx.textAlign = 'left'; y += 12; ctx.strokeStyle = '#DDE7DF'; ctx.beginPath(); ctx.moveTo(62, y); ctx.lineTo(W - 62, y); ctx.stroke(); y += 30;
  items.forEach((it, idx) => { if (idx % 2 === 0) { ctx.fillStyle = '#FAFCFB'; roundRect(ctx, 56, y - 24, W - 112, 48, 12, true, false); } ctx.fillStyle = '#15171A'; ctx.font = '14px Arial'; wrapCanvasText(ctx, it.name || '', 62, y - 4, 340, 16, 2); ctx.fillText(String(it.qty || 0), 438, y); ctx.fillText(fmtMoney(it.price || 0), 500, y); ctx.textAlign = 'right'; ctx.fillText(fmtMoney((it.price || 0) * (it.qty || 0)), W - 62, y); ctx.textAlign = 'left'; y += 58; });
  y += 18; ctx.strokeStyle = '#DDE7DF'; ctx.beginPath(); ctx.moveTo(62, y); ctx.lineTo(W - 62, y); ctx.stroke(); y += 48; ctx.fillStyle = '#01773B'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'right'; ctx.fillText('TOTAL: ' + fmtMoney(total), W - 62, y); ctx.textAlign = 'left'; y += 64; ctx.fillStyle = '#FFF8EB'; roundRect(ctx, 62, y, W - 124, 74, 18, true, false); ctx.fillStyle = '#8A5A12'; ctx.font = 'bold 14px Arial'; ctx.fillText('Nota', 86, y + 28); ctx.font = '13px Arial'; ctx.fillText('Precios sujetos a disponibilidad. Gracias por preferir productos naturales.', 86, y + 52); return canvas;
}

function generateQuoteImage(q, total) {
  const canvas = drawQuoteCanvas(q, total);
  openSheet(`<h2>Imagen de precios <span class="x" id="closeSheet">✕</span></h2><div class="receiptCanvasWrap" id="quoteCanvasWrap"></div><div class="exportRow"><div class="exportBtn" id="downloadQuoteImg"><span class="ic">🖼️</span><span class="lbl">Guardar imagen</span><span class="sub">JPG</span></div><div class="exportBtn" id="shareQuoteImg"><span class="ic">📤</span><span class="lbl">Compartir</span><span class="sub">Cualquier aplicación</span></div></div>`, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close); $('#quoteCanvasWrap', overlay).appendChild(canvas);
    $('#downloadQuoteImg', overlay).addEventListener('click', () => { canvas.toBlob(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `cotizacion_${(q.clientName || 'cliente').replace(/\s+/g, '_')}_${todayISO()}.jpg`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); showToast('Imagen de precios descargada.'); }, 'image/jpeg', 0.95); });
    $('#shareQuoteImg', overlay).addEventListener('click', () => { canvas.toBlob(async blob => { const file = new File([blob], `cotizacion_${todayISO()}.jpg`, { type: 'image/jpeg' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Precios / oferta Natura Vida', text: `Precios / oferta — ${AppState.settings.businessName}` }); } catch (_) {} } else showToast('Este navegador no permite compartir imagen directa. Usa Guardar imagen.', 'error'); }, 'image/jpeg', 0.95); });
  });
}

window.renderQuotes = renderQuotes;
window.openQuoteForm = openQuoteForm;
window.openQuotePreview = openQuotePreview;
