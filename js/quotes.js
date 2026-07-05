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

async function confirmDeleteQuote(id) {
  if (confirmDialog('¿Eliminar esta cotización?')) {
    try {
      await DB.delete('quotes', id);
      AppState.quotes = AppState.quotes.filter(x => x.id !== id);
      renderQuotes();
      showToast('Cotización eliminada de Supabase');
    } catch (err) { showToast(err.message || 'No se pudo eliminar la cotización.', 'error'); }
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
          <input type="number" inputmode="numeric" step="1" class="item-price" placeholder="Precio" value="${it.price || ''}" style="flex:0.8;">
          <input type="number" inputmode="numeric" step="1" class="item-qty" placeholder="Cant." value="${it.qty || 1}" style="flex:0.6;">
          <button type="button" class="insumo-del" data-idx="${idx}">✕</button>
        </div>
      `).join('');

      $all('.item-product', listEl).forEach((sel, idx) => sel.addEventListener('change', () => {
        const prod = AppState.products.find(p => p.id === sel.value);
        items[idx].productId = sel.value;
        items[idx].name = prod ? prod.name : '';
        if (prod && !items[idx].price) items[idx].price = unitPrice(prod);
        renderItems();
        updateTotal();
      }));
      $all('.item-price', listEl).forEach((inp, idx) => inp.addEventListener('input', () => { items[idx].price = roundBs(parseFloat(inp.value) || 0); updateTotal(); }));
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

      await findOrCreateClientQuick(clientName, clientPhone);

      const data = {
        id: uid('quo'),
        clientName, clientPhone, expiryDate,
        items: cleanItems,
        createdAt: Date.now()
      };
      const saveBtn = $('#saveForm', overlay);
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando en Supabase…';
      try {
        await DB.put('quotes', data);
        AppState.quotes.push(data);
        close();
        renderQuotes();
        showToast('Cotización creada en Supabase');
        openQuotePreview(data.id);
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Crear cotización';
        showToast(err.message || 'No se pudo guardar la cotización.', 'error');
      }
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


function drawQuoteCanvas(q, total) {
  const W = 720;
  const items = q.items || [];
  const H = Math.max(720, 330 + (items.length * 46) + 180);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#F5FAF6';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 34, 34, W - 68, H - 68, 28, true, false);

  ctx.fillStyle = '#01773B';
  roundRect(ctx, 34, 34, W - 68, 96, 28, true, false);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(AppState.settings.businessName || 'NATURA VIDA', 62, 82);
  ctx.font = '14px Arial';
  ctx.fillText(AppState.settings.businessSlogan || 'Te cuida por dentro y por fuera', 62, 108);

  let y = 170;
  ctx.fillStyle = '#15171A';
  ctx.font = 'bold 25px Arial';
  ctx.fillText('COTIZACIÓN', 62, y);
  ctx.textAlign = 'right';
  ctx.font = '13px Arial';
  ctx.fillStyle = '#6B7280';
  ctx.fillText('Fecha: ' + new Date(q.createdAt || Date.now()).toLocaleDateString('es-BO'), W - 62, y);
  ctx.fillText('Válida hasta: ' + fmtDate(q.expiryDate), W - 62, y + 22);
  ctx.textAlign = 'left';

  y += 50;
  ctx.fillStyle = '#EEF7F1';
  roundRect(ctx, 62, y, W - 124, 72, 18, true, false);
  ctx.fillStyle = '#15171A';
  ctx.font = 'bold 16px Arial';
  ctx.fillText('Cliente: ' + (q.clientName || '—'), 86, y + 30);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#56635B';
  ctx.fillText('Teléfono: ' + (q.clientPhone || '—'), 86, y + 52);
  y += 108;

  ctx.font = 'bold 13px Arial';
  ctx.fillStyle = '#6B7280';
  ctx.fillText('PRODUCTO', 62, y);
  ctx.fillText('CANT.', 410, y);
  ctx.fillText('PRECIO', 485, y);
  ctx.textAlign = 'right';
  ctx.fillText('SUBTOTAL', W - 62, y);
  ctx.textAlign = 'left';
  y += 12;
  ctx.strokeStyle = '#DDE7DF';
  ctx.beginPath(); ctx.moveTo(62, y); ctx.lineTo(W - 62, y); ctx.stroke();
  y += 30;

  items.forEach((it, idx) => {
    if (idx % 2 === 0) {
      ctx.fillStyle = '#FAFCFB';
      roundRect(ctx, 56, y - 22, W - 112, 38, 12, true, false);
    }
    ctx.fillStyle = '#15171A';
    ctx.font = '14px Arial';
    ctx.fillText(String(it.name || '').slice(0, 42), 62, y);
    ctx.fillText(String(it.qty || 0), 418, y);
    ctx.fillText(fmtMoney(it.price || 0), 485, y);
    ctx.textAlign = 'right';
    ctx.fillText(fmtMoney((it.price || 0) * (it.qty || 0)), W - 62, y);
    ctx.textAlign = 'left';
    y += 46;
  });

  y += 18;
  ctx.strokeStyle = '#DDE7DF';
  ctx.beginPath(); ctx.moveTo(62, y); ctx.lineTo(W - 62, y); ctx.stroke();
  y += 48;

  ctx.fillStyle = '#01773B';
  ctx.font = 'bold 30px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('TOTAL: ' + fmtMoney(total), W - 62, y);
  ctx.textAlign = 'left';

  y += 64;
  ctx.fillStyle = '#FFF8EB';
  roundRect(ctx, 62, y, W - 124, 74, 18, true, false);
  ctx.fillStyle = '#8A5A12';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('Nota', 86, y + 28);
  ctx.font = '13px Arial';
  ctx.fillText('Precios sujetos a disponibilidad. Gracias por preferir productos naturales.', 86, y + 52);
  return canvas;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function generateQuoteImage(q, total) {
  const canvas = drawQuoteCanvas(q, total);
  openSheet(`
    <h2>Imagen de cotización <span class="x" id="closeSheet">✕</span></h2>
    <div class="receiptCanvasWrap" id="quoteCanvasWrap"></div>
    <div class="exportRow">
      <div class="exportBtn" id="downloadQuoteImg"><span class="ic">🖼️</span><span class="lbl">Guardar imagen</span><span class="sub">JPG</span></div>
      <div class="exportBtn" id="shareQuoteImg"><span class="ic">📤</span><span class="lbl">Compartir</span><span class="sub">WhatsApp / sistema</span></div>
    </div>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    const wrap = $('#quoteCanvasWrap', overlay);
    wrap.appendChild(canvas);
    $('#downloadQuoteImg', overlay).addEventListener('click', () => {
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cotizacion_${(q.clientName || 'cliente').replace(/\s+/g, '_')}_${todayISO()}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        showToast('Imagen de cotización descargada.');
      }, 'image/jpeg', 0.95);
    });
    $('#shareQuoteImg', overlay).addEventListener('click', () => {
      canvas.toBlob(async (blob) => {
        const file = new File([blob], `cotizacion_${todayISO()}.jpg`, { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: 'Cotización Natura Vida', text: `Cotización — ${AppState.settings.businessName}` }); } catch (_) {}
        } else {
          showToast('Este navegador no permite compartir imagen directa. Usa Guardar imagen.', 'error');
        }
      }, 'image/jpeg', 0.95);
    });
  });
}

window.renderQuotes = renderQuotes;
window.openQuoteForm = openQuoteForm;
window.openQuotePreview = openQuotePreview;
