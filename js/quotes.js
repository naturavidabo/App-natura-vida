/* quotes.js — Cotizaciones: cliente, productos, vigencia con calendario, activas vs vencidas. */

function isExpired(quote) {
  if (!quote.expiryDate) return false;
  return new Date(quote.expiryDate + 'T23:59:59') < new Date();
}

function renderQuotes() {
  $('#fabAdd').classList.remove('hidden');
  $('#fabAdd').onclick = () => openQuoteForm();
  const main = $('#mainArea');

  const active = AppState.quotes.filter(q => !isExpired(q)).sort((a, b) => b.createdAt - a.createdAt);
  const expired = AppState.quotes.filter(q => isExpired(q)).sort((a, b) => b.createdAt - a.createdAt);

  let html = `<div class="sectiontitle" style="color:var(--pine-mid); margin-top:0;">Cotizaciones activas</div>`;

  if (active.length === 0) {
    html += `<div class="empty"><span class="ic">📄</span><h3>Sin cotizaciones activas</h3><p>Toca + para crear una nueva.</p></div>`;
  } else {
    active.forEach(q => { html += quoteCardHtml(q, false); });
  }

  if (expired.length > 0) {
    html += `<div class="sectiontitle" style="color:var(--gray);">Vencidas (archivo histórico)</div>`;
    expired.forEach(q => { html += quoteCardHtml(q, true); });
  }

  main.innerHTML = html;
  $all('.viewQuoteBtn').forEach(b => b.addEventListener('click', () => openQuotePreview(b.dataset.id)));
  $all('.delQuoteBtn').forEach(b => b.addEventListener('click', () => confirmDeleteQuote(b.dataset.id)));
}

function quoteCardHtml(q, expired) {
  const total = (q.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
  return `
  <div class="card" data-id="${q.id}" style="${expired ? 'opacity:0.6;' : ''}">
    <div style="padding:13px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div class="name">${escapeHtml(q.clientName)}</div>
        <span class="pill ${expired ? 'low' : 'ok'}">${expired ? 'vencida' : 'vigente'}</span>
      </div>
      <div class="costline">📞 ${escapeHtml(q.clientPhone || 'sin teléfono')}</div>
      <div class="costline">📅 Válida hasta: ${fmtDate(q.expiryDate)}</div>
      <div class="priceline"><span class="p2">Total: ${fmtMoney(total)}</span></div>
    </div>
    <div class="cardactions">
      <button class="viewQuoteBtn" data-id="${q.id}">👁️ Ver / Compartir</button>
      <button class="danger delQuoteBtn" data-id="${q.id}">🗑️</button>
    </div>
  </div>`;
}

function confirmDeleteQuote(id) {
  if (confirmDialog('¿Eliminar esta cotización?')) {
    AppState.quotes = AppState.quotes.filter(x => x.id !== id);
    DB.delete('quotes', id);
    renderQuotes();
    showToast('Cotización eliminada');
  }
}

function openQuoteForm() {
  let items = [{ productId: '', name: '', price: 0, qty: 1 }];

  const html = `
    <h2>Nueva cotización <span class="x" id="closeSheet">✕</span></h2>

    <div class="field">
      <label>Nombre del cliente / posible cliente</label>
      <input type="text" id="q_clientname" placeholder="Ej: Juan Pérez" list="clientSuggestions2">
      <datalist id="clientSuggestions2">${AppState.clients.map(c => `<option value="${escapeHtml(c.name)}">`).join('')}</datalist>
    </div>
    <div class="field">
      <label>Número de teléfono</label>
      <input type="tel" inputmode="tel" id="q_clientphone" placeholder="Ej: 71234567">
    </div>
    <div class="field">
      <label>Fecha límite de validez</label>
      <input type="date" id="q_expiry" value="${todayISO()}">
    </div>

    <div class="sectiontitle2"><span>Productos cotizados</span></div>
    <div id="quoteItemsList"></div>
    <button type="button" class="addInsumoBtn" id="addItemBtn">+ Agregar producto</button>

    <div class="totalbox">
      <span class="lbl">Total cotizado</span>
      <span class="val" id="q_total">${fmtMoney(0)}</span>
    </div>

    <div class="actions">
      <button class="btn outline block" id="cancelForm">Cancelar</button>
      <button class="btn block" id="saveForm">Crear cotización</button>
    </div>
  `;

  openSheet(html, (overlay, close) => {
    const listEl = $('#quoteItemsList', overlay);

    function renderItems() {
      listEl.innerHTML = items.map((it, idx) => `
        <div class="insumo-row" data-idx="${idx}">
          <select class="item-product" style="flex:1.6;">
            <option value="">Seleccionar producto...</option>
            ${AppState.products.map(p => `<option value="${p.id}" ${it.productId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
          <input type="number" inputmode="decimal" step="0.01" class="item-price" placeholder="Precio" value="${it.price || ''}" style="flex:0.8;">
          <input type="number" inputmode="numeric" step="1" class="item-qty" placeholder="Cant." value="${it.qty || 1}" style="flex:0.6;">
          <button type="button" class="insumo-del" data-idx="${idx}">✕</button>
        </div>
      `).join('');

      $all('.item-product', listEl).forEach((sel, idx) => sel.addEventListener('change', () => {
        const prod = AppState.products.find(p => p.id === sel.value);
        items[idx].productId = sel.value;
        items[idx].name = prod ? prod.name : '';
        if (prod && !items[idx].price) items[idx].price = prod.publicPrice || 0;
        renderItems();
        updateTotal();
      }));
      $all('.item-price', listEl).forEach((inp, idx) => inp.addEventListener('input', () => { items[idx].price = parseFloat(inp.value) || 0; updateTotal(); }));
      $all('.item-qty', listEl).forEach((inp, idx) => inp.addEventListener('input', () => { items[idx].qty = parseInt(inp.value) || 1; updateTotal(); }));
      $all('.insumo-del', listEl).forEach(btn => btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (items.length <= 1) items[0] = { productId: '', name: '', price: 0, qty: 1 };
        else items.splice(idx, 1);
        renderItems();
        updateTotal();
      }));
    }

    function updateTotal() {
      const total = items.reduce((s, i) => s + ((i.price || 0) * (i.qty || 0)), 0);
      $('#q_total', overlay).textContent = fmtMoney(total);
    }

    renderItems();
    updateTotal();

    $('#addItemBtn', overlay).addEventListener('click', () => {
      items.push({ productId: '', name: '', price: 0, qty: 1 });
      renderItems();
      updateTotal();
    });

    $('#closeSheet', overlay).addEventListener('click', close);
    $('#cancelForm', overlay).addEventListener('click', close);

    $('#saveForm', overlay).addEventListener('click', async () => {
      const clientName = $('#q_clientname', overlay).value.trim();
      const clientPhone = $('#q_clientphone', overlay).value.trim();
      const expiryDate = $('#q_expiry', overlay).value;
      const cleanItems = items.filter(i => i.name && i.qty > 0);

      if (!clientName) { showToast('⚠️ Ingresa el nombre del cliente', 'error'); return; }
      if (!expiryDate) { showToast('⚠️ Selecciona una fecha de vigencia', 'error'); return; }
      if (cleanItems.length === 0) { showToast('⚠️ Agrega al menos un producto', 'error'); return; }

      findOrCreateClientQuick(clientName, clientPhone);

      const data = {
        id: uid('quo'),
        clientName, clientPhone, expiryDate,
        items: cleanItems,
        createdAt: Date.now()
      };
      AppState.quotes.push(data);
      await DB.put('quotes', data);
      close();
      renderQuotes();
      showToast('Cotización creada');
      openQuotePreview(data.id);
    });
  });
}

function openQuotePreview(id) {
  const q = AppState.quotes.find(x => x.id === id);
  if (!q) return;
  const total = q.items.reduce((s, i) => s + (i.price * i.qty), 0);

  const html = `
    <h2>Cotización <span class="x" id="closeSheet">✕</span></h2>
    <div class="banner">Cliente: <b>${escapeHtml(q.clientName)}</b> · Tel: ${escapeHtml(q.clientPhone || '—')}<br>Válida hasta: ${fmtDate(q.expiryDate)} ${isExpired(q) ? ' · <b style="color:var(--red)">VENCIDA</b>' : ''}</div>
    ${q.items.map(i => `
      <div class="histitem">
        <div class="l"><div class="pname">${escapeHtml(i.name)}</div><div class="meta">Cant: ${i.qty} × ${fmtMoney(i.price)}</div></div>
        <div class="r">${fmtMoney(i.price * i.qty)}</div>
      </div>
    `).join('')}
    <div class="totalbox"><span class="lbl">Total</span><span class="val">${fmtMoney(total)}</span></div>
    <div class="actions">
      <button class="btn outline block" id="shareQuoteBtn">📤 Compartir</button>
      <button class="btn block" id="imgQuoteBtn">🖼️ Generar imagen</button>
    </div>
  `;
  openSheet(html, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#shareQuoteBtn', overlay).addEventListener('click', () => shareQuoteText(q, total));
    $('#imgQuoteBtn', overlay).addEventListener('click', () => generateQuoteImage(q, total));
  });
}

function shareQuoteText(q, total) {
  const lines = [
    `*Cotización — ${AppState.settings.businessName}*`,
    `Cliente: ${q.clientName}`,
    `Válida hasta: ${fmtDate(q.expiryDate)}`,
    '',
    ...q.items.map(i => `${i.name} x${i.qty} — ${fmtMoney(i.price * i.qty)}`),
    '',
    `Total: ${fmtMoney(total)}`
  ];
  const text = lines.join('\n');
  if (navigator.share) {
    navigator.share({ title: 'Cotización', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Copiado al portapapeles'));
  }
}

window.renderQuotes = renderQuotes;
window.openQuoteForm = openQuoteForm;
window.openQuotePreview = openQuotePreview;
