/* clients.js — Directorio de clientes: nombre, teléfono, grupo de precio asignado, historial. */

let _clientSearch = '';

function renderClients() {
  $('#fabAdd').classList.remove('hidden');
  $('#fabAdd').onclick = () => openClientForm(null);
  const main = $('#mainArea');

  let html = `
    <div class="toolrow">
      <input type="text" id="searchInput" placeholder="Buscar cliente..." value="${escapeHtml(_clientSearch)}">
    </div>
  `;

  const filtered = AppState.clients;

  if (filtered.length === 0) {
    html += `
      <div class="empty">
        <span class="ic">👤</span>
        <h3>${AppState.clients.length === 0 ? 'Aún no hay clientes' : 'Sin resultados'}</h3>
        <p>${AppState.clients.length === 0 ? 'Se agregan automáticamente al registrar una venta, o créalos aquí.' : 'Intenta con otro término.'}</p>
      </div>`;
  } else {
    filtered.slice().reverse().forEach(c => {
      const group = AppState.priceGroups.find(g => g.id === c.priceGroupId);
      const purchases = AppState.sales.filter(s => s.clientId === c.id);
      html += `
      <div class="card" data-id="${c.id}">
        <div style="padding:13px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div class="name">${escapeHtml(c.name)}</div>
            ${group ? `<span class="pill" style="background:${group.color}22; color:${group.color};">${escapeHtml(group.name)}</span>` : ''}
          </div>
          <div class="costline" style="margin-top:6px;">📞 ${escapeHtml(c.phone || 'sin teléfono')}</div>
          <div class="costline">🛒 ${purchases.length} compra(s) registrada(s)</div>
        </div>
        <div class="cardactions">
          <button class="histClientBtn" data-id="${c.id}">📜 Historial</button>
          <button class="editClientBtn" data-id="${c.id}">✏️ Editar</button>
          <button class="danger delClientBtn" data-id="${c.id}">🗑️</button>
        </div>
      </div>`;
    });
  }

  main.innerHTML = html;
  bindStableSearch('#searchInput', '#mainArea .card', value => { _clientSearch = value; });
  $all('.editClientBtn').forEach(b => b.addEventListener('click', () => openClientForm(b.dataset.id)));
  $all('.delClientBtn').forEach(b => b.addEventListener('click', () => confirmDeleteClient(b.dataset.id)));
  $all('.histClientBtn').forEach(b => b.addEventListener('click', () => openClientHistory(b.dataset.id)));
}

async function confirmDeleteClient(id) {
  const c = AppState.clients.find(x => x.id === id);
  if (!c) return;
  if (confirmDialog(`¿Eliminar a "${c.name}" del directorio? El historial de ventas ya registrado se conserva.`)) {
    try {
      await DB.delete('clients', id);
      AppState.clients = AppState.clients.filter(x => x.id !== id);
      renderClients();
      showToast('Cliente eliminado de Supabase');
    } catch (err) {
      showToast(err.message || 'No se pudo eliminar el cliente.', 'error');
    }
  }
}

function openClientHistory(id) {
  const c = AppState.clients.find(x => x.id === id);
  if (!c) return;
  const purchases = AppState.sales.filter(s => s.clientId === id).slice().reverse();

  const html = `
    <h2>Historial — ${escapeHtml(c.name)} <span class="x" id="closeSheet">✕</span></h2>
    ${purchases.length === 0 ? `<div class="empty"><span class="ic">📭</span><h3>Sin compras aún</h3></div>` :
      purchases.map(s => {
        const items = s.items || [];
        const summary = items.length === 1 ? items[0].productName : `${items[0] ? items[0].productName : ''} +${items.length - 1} más`;
        const totalUnits = items.reduce((sum, it) => sum + it.qty, 0);
        return `
        <div class="histitem histitem-clickable" data-saleid="${s.id}">
          <div class="l">
            <div class="pname">${escapeHtml(summary)}</div>
            <div class="meta">${s.type === 'unit' ? 'Unitaria' : 'Por mayor'} · ${totalUnits} unid. · ${fmtDate(s.date)}</div>
          </div>
          <div class="r">
            <div>+${fmtMoney(s.total)}</div>
            <div class="histReceiptHint">🧾 Ver recibo</div>
          </div>
        </div>
      `;
      }).join('')}
    <div class="actions">
      <button class="btn block" id="closeSheet2">Cerrar</button>
    </div>
  `;
  openSheet(html, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#closeSheet2', overlay).addEventListener('click', close);
    $all('.histitem-clickable', overlay).forEach(el => el.addEventListener('click', () => {
      const sale = AppState.sales.find(s => s.id === el.dataset.saleid);
      if (sale) openReceiptPreview(sale);
    }));
  });
}

function openClientForm(id, prefill) {
  const c = id ? AppState.clients.find(x => x.id === id) : null;
  const pf = prefill || {};

  const html = `
    <h2>${c ? 'Editar cliente' : 'Nuevo cliente'} <span class="x" id="closeSheet">✕</span></h2>

    <div class="field">
      <label>Nombre completo</label>
      <input type="text" id="f_cname" placeholder="Ej: María Pérez" value="${c ? escapeHtml(c.name) : escapeHtml(pf.name || '')}">
    </div>
    <div class="field">
      <label>Número de teléfono</label>
      <input type="tel" inputmode="tel" id="f_cphone" placeholder="Ej: 71234567" value="${c ? escapeHtml(c.phone || '') : escapeHtml(pf.phone || '')}">
    </div>
    ${AppState.settings.priceGroupsEnabled ? `
    <div class="field">
      <label>Grupo de precio asignado</label>
      <select id="f_cgroup">
        <option value="">Sin grupo (precio de abastecimiento)</option>
        ${AppState.priceGroups.map(g => `<option value="${g.id}" ${c && c.priceGroupId === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}
      </select>
    </div>` : ''}

    <div class="actions">
      <button class="btn outline block" id="cancelForm">Cancelar</button>
      <button class="btn block" id="saveForm">${c ? 'Guardar cambios' : 'Crear cliente'}</button>
    </div>
  `;

  return openSheet(html, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#cancelForm', overlay).addEventListener('click', close);

    $('#saveForm', overlay).addEventListener('click', async () => {
      const name = $('#f_cname', overlay).value.trim();
      if (!name) { showToast('⚠️ Ponle un nombre al cliente', 'error'); return; }
      const groupSel = $('#f_cgroup', overlay);

      const data = {
        id: c ? c.id : uid('cli'),
        name,
        phone: $('#f_cphone', overlay).value.trim(),
        priceGroupId: groupSel ? groupSel.value : '',
        createdAt: c ? c.createdAt : Date.now()
      };
      const saveBtn = $('#saveForm', overlay);
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando en Supabase…';
      try {
        await DB.put('clients', data);
        if (c) {
          const idx = AppState.clients.findIndex(x => x.id === c.id);
          AppState.clients[idx] = data;
        } else {
          AppState.clients.push(data);
        }
        AppState.lastClient = data;
        close();
        if (window._afterClientSaved) { window._afterClientSaved(data); window._afterClientSaved = null; }
        if (AppState.currentTab === 'clientes') renderClients();
        showToast(c ? 'Cliente actualizado en Supabase' : 'Cliente creado en Supabase');
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = c ? 'Guardar cambios' : 'Crear cliente';
        showToast(err.message || 'No se pudo guardar el cliente.', 'error');
      }
    });
  });
}

/* Busca o crea un cliente rápido desde el flujo de venta, sin salir de la pantalla. */
async function findOrCreateClientQuick(name, phone) {
  name = (name || '').trim();
  if (!name) return null;
  let existing = AppState.clients.find(c => normalizeSearch(c.name) === normalizeSearch(name));
  if (existing) {
    if (phone && phone.trim() && existing.phone !== phone.trim()) {
      const updated = Object.assign({}, existing, { phone: phone.trim() });
      await DB.put('clients', updated);
      const idx = AppState.clients.findIndex(c => c.id === existing.id);
      if (idx >= 0) AppState.clients[idx] = updated;
      existing = updated;
    }
    AppState.lastClient = existing;
    return existing;
  }
  const data = { id: uid('cli'), name, phone: (phone || '').trim(), priceGroupId: '', createdAt: Date.now() };
  await DB.put('clients', data);
  AppState.clients.push(data);
  AppState.lastClient = data;
  return data;
}


window.renderClients = renderClients;
window.openClientForm = openClientForm;
window.findOrCreateClientQuick = findOrCreateClientQuick;

/* ===== NATURA VIDA V7.2.3 — Clientes saneados, mayoristas ligeros y WhatsApp ===== */
function onlyDigitsV723(value) {
  return String(value || '').replace(/\D+/g, '');
}
function normalizePhoneV723(value) {
  let d = onlyDigitsV723(value);
  if (d.startsWith('591')) d = d.slice(3);
  if (d.startsWith('0') && d.length > 8) d = d.replace(/^0+/, '');
  return d.slice(-8);
}
function whatsappUrlV723(phone, message = '') {
  const d = normalizePhoneV723(phone);
  if (!d || d.length < 7) return '';
  const text = message ? `&text=${encodeURIComponent(message)}` : '';
  return `https://api.whatsapp.com/send?phone=591${d}${text}`;
}
function whatsappIntentV725(phone, message = '') {
  const d = normalizePhoneV723(phone);
  if (!d || d.length < 7) return '';
  const text = message ? `&text=${encodeURIComponent(message)}` : '';
  return `intent://send?phone=591${d}${text}#Intent;scheme=whatsapp;package=com.whatsapp;end`;
}
function openWhatsAppV723(phone, name = '') {
  const msg = name ? `Hola ${name}, le escribo de Natura Vida Bolivia.` : 'Hola, le escribo de Natura Vida Bolivia.';
  const url = whatsappUrlV723(phone, msg);
  if (!url) return showToast('Este cliente no tiene un WhatsApp válido.', 'error');
  const intent = whatsappIntentV725(phone, msg);
  try { window.location.href = intent; setTimeout(() => window.open(url, '_blank', 'noopener'), 900); }
  catch (_) { window.open(url, '_blank', 'noopener'); }
}
function whatsappButtonLabelV725(){ return '<span class="waLogoV725">☎</span>'; }
function customerTypeForSaleV723(saleType) {
  if (['market', 'reseller_wholesale', 'wholesale', 'representative_transfer'].includes(String(saleType || ''))) return 'wholesale';
  if (['unit', 'reseller_unit'].includes(String(saleType || ''))) return 'unit';
  return 'unclassified';
}
function customerTypeLabelV723(type) {
  return ({ unit: 'Unitario', wholesale: 'Mayorista', mixed: 'Mixto', unclassified: 'Sin clasificar' })[type || 'unclassified'] || 'Sin clasificar';
}
function customerTypeClassV723(type) {
  return ({ unit: 'unit', wholesale: 'wholesale', mixed: 'mixed', unclassified: 'unclassified' })[type || 'unclassified'] || 'unclassified';
}
function clientTypeMatchesV723(client, preferred, showAll = false) {
  if (showAll || !preferred) return true;
  const t = client.customerType || client.type || 'unclassified';
  if (t === 'mixed' || t === 'unclassified') return true;
  return t === preferred;
}
function clientSearchTextV723(client) {
  return normalizeSearch([client.name, client.phone, client.businessName, client.city, client.address].filter(Boolean).join(' '));
}
function clientSalesV723(clientOrId) {
  const id = typeof clientOrId === 'string' ? clientOrId : clientOrId && clientOrId.id;
  const c = typeof clientOrId === 'object' ? clientOrId : AppState.clients.find(x => x.id === id);
  const phone = c ? normalizePhoneV723(c.phone) : '';
  const name = c ? normalizeSearch(c.name) : '';
  return (AppState.sales || []).filter(s => (id && s.clientId === id) || (phone && normalizePhoneV723(s.clientPhone) === phone) || (name && normalizeSearch(s.clientName) === name));
}
function commercialStatusV723(client) {
  const sales = clientSalesV723(client).filter(s => !s.deletedAt);
  if (!sales.length) return { label: 'Nuevo', cls: 'blue' };
  const now = Date.now();
  const last = Math.max(...sales.map(s => Number(s.date || s.createdAt || 0)).filter(Boolean));
  const days = last ? Math.floor((now - last) / 86400000) : 999;
  const total = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  if (days > 90) return { label: 'Inactivo', cls: 'gray' };
  if (sales.length >= 5 || total >= 2000) return { label: 'Consolidado', cls: 'green' };
  if (sales.length >= 2) return { label: 'Recurrente', cls: 'yellow' };
  return { label: 'En seguimiento', cls: 'orange' };
}
function betterClientNameV723(a, b) {
  const an = String(a || '').trim();
  const bn = String(b || '').trim();
  if (!an) return bn;
  if (!bn) return an;
  return bn.length > an.length ? bn : an;
}
function mergeTextV723(a, b) {
  return String(a || '').trim() || String(b || '').trim();
}
function buildClientRecordV723(base = {}, data = {}) {
  const phone = normalizePhoneV723(data.phone ?? base.phone);
  const customerType = data.customerType || base.customerType || data.type || base.type || 'unclassified';
  return Object.assign({}, base, data, {
    id: base.id || data.id || uid('cli'),
    name: String(data.name ?? base.name ?? '').trim(),
    phone,
    customerType,
    businessName: String(data.businessName ?? base.businessName ?? '').trim(),
    city: String(data.city ?? base.city ?? '').trim(),
    address: String(data.address ?? base.address ?? '').trim(),
    latitude: data.latitude ?? base.latitude ?? '',
    longitude: data.longitude ?? base.longitude ?? '',
    locationLabel: String(data.locationLabel ?? base.locationLabel ?? base.location ?? '').trim(),
    storePhoto: data.storePhoto || base.storePhoto || '',
    notes: String(data.notes ?? base.notes ?? '').trim(),
    aliases: Array.from(new Set([...(base.aliases || []), ...(data.aliases || [])].filter(Boolean))),
    createdAt: base.createdAt || data.createdAt || Date.now(),
    updatedAt: Date.now()
  });
}

async function saveClientV723(record) {
  await DB.put('clients', record);
  const idx = AppState.clients.findIndex(c => c.id === record.id);
  if (idx >= 0) AppState.clients[idx] = record; else AppState.clients.push(record);
  return record;
}

function clientCardHtmlV723(c) {
  const purchases = clientSalesV723(c);
  const status = commercialStatusV723(c);
  const type = c.customerType || 'unclassified';
  const photo = c.storePhoto ? `<img src="${c.storePhoto}" loading="lazy" decoding="async" alt="">` : `<span>${type === 'wholesale' ? '🏪' : '👤'}</span>`;
  return `<div class="card clientCardV723" data-id="${c.id}" data-search="${escapeHtml([c.name,c.phone,c.businessName,c.city,c.address].filter(Boolean).join(' '))}">
    <div class="clientPhotoV723">${photo}</div>
    <div class="clientMainV723">
      <div class="clientTopV723"><div class="name">${escapeHtml(c.name || 'Sin nombre')}</div><span class="typePillV723 ${customerTypeClassV723(type)}">${customerTypeLabelV723(type)}</span></div>
      ${c.businessName && c.businessName !== c.name ? `<div class="costline">🏪 ${escapeHtml(c.businessName)}</div>` : ''}
      <div class="costline">📞 ${escapeHtml(c.phone || 'sin teléfono')} ${c.phone ? `<button class="waMiniV723 waIconOnlyV725" data-wa="${c.id}" title="Abrir WhatsApp normal">${whatsappButtonLabelV725()}</button>` : ''}</div>
      <div class="costline">🛒 ${purchases.length} compra(s) · <span class="trust ${status.cls}">${status.label}</span>${c.priceGroupId ? ` · <span class="priceBadge group">Beneficio</span>` : ''}</div>
      ${c.city || c.address ? `<div class="costline">📍 ${escapeHtml([c.city, c.address].filter(Boolean).join(' · '))}</div>` : ''}
    </div>
    <div class="cardactions">
      <button class="histClientBtn" data-id="${c.id}">📜 Historial</button>
      <button class="quoteClientBtnV725" data-id="${c.id}">💬 Precios</button>
      <button class="benefitClientBtnV725" data-id="${c.id}">🎁 Beneficio</button>
      <button class="editClientBtn" data-id="${c.id}">✏️ Editar</button>
      <button class="danger delClientBtn" data-id="${c.id}">🗑️</button>
    </div>
  </div>`;
}

function renderClients() {
  $('#fabAdd').classList.remove('hidden');
  $('#fabAdd').onclick = () => openClientForm(null);
  const main = $('#mainArea');
  const duplicates = findClientDuplicateGroupsV723();
  main.innerHTML = `
    <section class="v7PageHead"><span class="v7Eyebrow">Directorio comercial</span><h1>Clientes</h1><p>Clientes unitarios y mayoristas con WhatsApp, estado automático e historial.</p></section>
    <div class="toolrow clientToolbarV723"><input type="text" id="searchInput" placeholder="Buscar cliente, teléfono o tienda..." value="${escapeHtml(_clientSearch)}"><button class="btn outline" id="cleanClientsV723">Saneamiento${duplicates.length ? ` (${duplicates.length})` : ''}</button></div>
    ${AppState.clients.length === 0 ? `<div class="empty"><span class="ic">👤</span><h3>Aún no hay clientes</h3><p>Se agregan automáticamente al registrar una venta, o créalos aquí.</p></div>` : `<div class="clientListV723">${AppState.clients.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))).map(clientCardHtmlV723).join('')}</div>`}
  `;
  bindStableSearch('#searchInput', '#mainArea .clientCardV723', value => { _clientSearch = value; });
  $('#cleanClientsV723')?.addEventListener('click', openClientCleanupV723);
  $all('.editClientBtn').forEach(b => b.addEventListener('click', () => openClientForm(b.dataset.id)));
  $all('.delClientBtn').forEach(b => b.addEventListener('click', () => confirmDeleteClient(b.dataset.id)));
  $all('.histClientBtn').forEach(b => b.addEventListener('click', () => openClientHistory(b.dataset.id)));
  $all('.waMiniV723').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const c = AppState.clients.find(x => x.id === b.dataset.wa); if (c) openWhatsAppV723(c.phone, c.name); }));
  $all('.quoteClientBtnV725').forEach(b => b.addEventListener('click', () => { const c=AppState.clients.find(x=>x.id===b.dataset.id); if(c && window.openQuoteForm) openQuoteForm({client:c, priceGroupId:c.priceGroupId||''}); }));
  $all('.benefitClientBtnV725').forEach(b => b.addEventListener('click', () => openClientBenefitV725(b.dataset.id)));
}

function openClientForm(id, prefill = {}) {
  const c = id ? AppState.clients.find(x => x.id === id) : null;
  const current = buildClientRecordV723(c || {}, prefill || {});
  let photoData = current.storePhoto || '';
  const html = `
    <h2>${c ? 'Editar cliente' : 'Nuevo cliente'} <span class="x" id="closeSheet">✕</span></h2>
    <div class="field"><label>${current.customerType === 'wholesale' ? 'Nombre de tienda / negocio' : 'Nombre del cliente'}</label><input type="text" id="f_cname" autocomplete="off" placeholder="Ej: Comercial María" value="${escapeHtml(current.name || '')}"></div>
    <div class="field-row"><div class="field"><label>Celular / WhatsApp</label><div class="clientInputRow"><input type="tel" inputmode="tel" id="f_cphone" autocomplete="off" placeholder="Ej: 71234567" value="${escapeHtml(current.phone || '')}"><button type="button" class="waIconBtnV723" id="f_cwa"><span class="waLogoV725">☎</span></button></div></div><div class="field"><label>Tipo</label><select id="f_ctype"><option value="unit" ${current.customerType==='unit'?'selected':''}>Unitario</option><option value="wholesale" ${current.customerType==='wholesale'?'selected':''}>Mayorista</option><option value="mixed" ${current.customerType==='mixed'?'selected':''}>Mixto</option><option value="unclassified" ${current.customerType==='unclassified'?'selected':''}>Sin clasificar</option></select></div></div>
    <div id="wholesaleFieldsV723" class="wholesaleFieldsV723">
      <div class="field"><label>Ciudad</label><input id="f_ccity" autocomplete="off" value="${escapeHtml(current.city || '')}" placeholder="Ej: Santa Cruz"></div>
      <div class="field"><label>Dirección</label><input id="f_caddress" autocomplete="off" value="${escapeHtml(current.address || '')}" placeholder="Mercado, avenida, local o referencia principal"></div>
      <div class="field-row"><div class="field"><label>Latitud</label><input id="f_clat" readonly value="${escapeHtml(current.latitude || '')}"></div><div class="field"><label>Longitud</label><input id="f_clng" readonly value="${escapeHtml(current.longitude || '')}"></div></div>
      <button type="button" class="btn ghost block" id="captureClientGpsV723">Capturar ubicación GPS</button>
      <div class="field"><label>Dato de ubicación</label><input id="f_clocation" autocomplete="off" value="${escapeHtml(current.locationLabel || '')}" placeholder="Se completa al capturar GPS o puedes escribir referencia corta"></div>
      <div class="field"><label>Foto de tienda</label><label class="photoClientPickV723"><input type="file" id="f_cphoto" accept="image/*" capture="environment"><span id="clientPhotoTextV723">${photoData ? 'Cambiar foto' : 'Tocar para sacar/subir foto'}</span><img id="clientPhotoPreviewV723" class="${photoData ? '' : 'hidden'}" src="${photoData}" alt=""></label></div>
    </div>
    <div class="field"><label>Observaciones</label><textarea id="f_cnotes" rows="3" placeholder="Dato útil para atender mejor al cliente">${escapeHtml(current.notes || '')}</textarea></div>
    ${AppState.settings.priceGroupsEnabled ? `<div class="field"><label>Grupo de precio asignado</label><select id="f_cgroup"><option value="">Sin grupo</option>${AppState.priceGroups.map(g => `<option value="${g.id}" ${current.priceGroupId === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}</select></div>` : ''}
    <div class="actions"><button class="btn outline block" id="cancelForm">Cancelar</button><button class="btn block" id="saveForm">${c ? 'Guardar cambios' : 'Crear cliente'}</button></div>
  `;
  return openSheet(html, (overlay, close) => {
    const typeSel = $('#f_ctype', overlay);
    const toggleWholesale = () => { const t = typeSel.value; $('#wholesaleFieldsV723', overlay).classList.toggle('hidden', !(t === 'wholesale' || t === 'mixed')); };
    toggleWholesale();
    typeSel.addEventListener('change', toggleWholesale);
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#cancelForm', overlay).addEventListener('click', close);
    $('#f_cwa', overlay).addEventListener('click', () => openWhatsAppV723($('#f_cphone', overlay).value, $('#f_cname', overlay).value));
    $('#captureClientGpsV723', overlay)?.addEventListener('click', () => {
      if (!navigator.geolocation) return showToast('Este dispositivo no permite ubicación.', 'error');
      const btn = $('#captureClientGpsV723', overlay); btn.disabled = true; btn.textContent = 'Capturando ubicación…';
      navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude.toFixed(6); const lng = pos.coords.longitude.toFixed(6);
        $('#f_clat', overlay).value = lat; $('#f_clng', overlay).value = lng;
        if (!$('#f_clocation', overlay).value.trim()) $('#f_clocation', overlay).value = `GPS capturado: ${lat}, ${lng}`;
        btn.disabled = false; btn.textContent = 'Ubicación GPS capturada';
      }, () => { btn.disabled = false; btn.textContent = 'Capturar ubicación GPS'; showToast('No se pudo capturar ubicación.', 'error'); }, { enableHighAccuracy: true, timeout: 12000 });
    });
    $('#f_cphoto', overlay)?.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      try { photoData = await readImageFile(file, { optimize: true, maxEdge: 900, quality: 0.86, mimeType: 'image/jpeg' }); $('#clientPhotoPreviewV723', overlay).src = photoData; $('#clientPhotoPreviewV723', overlay).classList.remove('hidden'); $('#clientPhotoTextV723', overlay).textContent = 'Foto lista'; }
      catch (err) { showToast(err.message || 'No se pudo leer la foto.', 'error'); }
    });
    $('#saveForm', overlay).addEventListener('click', async () => {
      const name = $('#f_cname', overlay).value.trim();
      if (!name) return showToast('Ponle un nombre al cliente o tienda.', 'error');
      const type = $('#f_ctype', overlay).value || 'unclassified';
      const record = buildClientRecordV723(c || {}, {
        name,
        phone: $('#f_cphone', overlay).value,
        customerType: type,
        priceGroupId: $('#f_cgroup', overlay) ? $('#f_cgroup', overlay).value : '',
        city: $('#f_ccity', overlay) ? $('#f_ccity', overlay).value : '',
        address: $('#f_caddress', overlay) ? $('#f_caddress', overlay).value : '',
        latitude: $('#f_clat', overlay) ? $('#f_clat', overlay).value : '',
        longitude: $('#f_clng', overlay) ? $('#f_clng', overlay).value : '',
        locationLabel: $('#f_clocation', overlay) ? $('#f_clocation', overlay).value : '',
        storePhoto: photoData,
        notes: $('#f_cnotes', overlay).value
      });
      const btn = $('#saveForm', overlay); btn.disabled = true; btn.textContent = 'Guardando en Supabase…';
      try { await saveClientV723(record); AppState.lastClient = record; close(); if (window._afterClientSaved) { window._afterClientSaved(record); window._afterClientSaved = null; } if (AppState.currentTab === 'clientes') renderClients(); showToast(c ? 'Cliente actualizado.' : 'Cliente creado.'); }
      catch (err) { btn.disabled = false; btn.textContent = c ? 'Guardar cambios' : 'Crear cliente'; showToast(err.message || 'No se pudo guardar el cliente.', 'error'); }
    });
  });
}

async function findOrCreateClientQuick(name, phone, customerType = 'unclassified', extra = {}) {
  name = String(name || '').trim(); phone = normalizePhoneV723(phone || '');
  if (!name) return null;
  let existing = null;
  if (phone) existing = AppState.clients.find(c => normalizePhoneV723(c.phone) === phone);
  if (!existing) existing = AppState.clients.find(c => normalizeSearch(c.name) === normalizeSearch(name));
  if (existing) {
    const updated = buildClientRecordV723(existing, Object.assign({}, extra, { name: betterClientNameV723(existing.name, name), phone: phone || existing.phone, customerType: existing.customerType && existing.customerType !== 'unclassified' ? existing.customerType : customerType }));
    await saveClientV723(updated); AppState.lastClient = updated; return updated;
  }
  const data = buildClientRecordV723({}, Object.assign({}, extra, { name, phone, customerType }));
  await saveClientV723(data); AppState.lastClient = data; return data;
}

function openClientSelectorSheet(options = {}) {
  const preferred = options.customerType || customerTypeForSaleV723(options.saleType);
  let showAll = false;
  const title = preferred === 'wholesale' ? 'Seleccionar mayorista' : 'Seleccionar cliente';
  openSheet(`
    <h2>${title} <span class="x" id="closeSheet">✕</span></h2>
    <div class="clientPickerHeadV723"><input id="clientPickerSearchV723" autocomplete="off" placeholder="Buscar por nombre o teléfono"><button class="btn outline" id="clientPickerAllV723">Ver todos</button></div>
    <div id="clientPickerListV723" class="clientPickerListV723"></div>
    <button class="btn block" id="createPickerClientV723">+ Crear nuevo ${preferred === 'wholesale' ? 'mayorista' : 'cliente'}</button>
  `, (overlay, close) => {
    const render = () => {
      const q = normalizeSearch($('#clientPickerSearchV723', overlay).value);
      const clients = AppState.clients.filter(c => clientTypeMatchesV723(c, preferred, showAll)).filter(c => !q || clientSearchTextV723(c).includes(q)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
      $('#clientPickerListV723', overlay).innerHTML = clients.length ? clients.map(c => {
        const status = commercialStatusV723(c);
        return `<button type="button" class="clientPickItemV723" data-id="${c.id}"><strong>${escapeHtml(c.name || 'Sin nombre')}</strong><span>${escapeHtml(c.phone || 'sin teléfono')} · ${customerTypeLabelV723(c.customerType)}</span><small>${status.label}${c.city ? ` · ${escapeHtml(c.city)}` : ''}</small></button>`;
      }).join('') : `<div class="v7Empty small"><span>👤</span><p>No hay coincidencias.</p></div>`;
      $all('.clientPickItemV723', overlay).forEach(b => b.addEventListener('click', () => { const c = AppState.clients.find(x => x.id === b.dataset.id); if (c && options.onSelect) options.onSelect(c); close(); }));
    };
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#clientPickerSearchV723', overlay).addEventListener('input', render);
    $('#clientPickerAllV723', overlay).addEventListener('click', () => { showAll = !showAll; $('#clientPickerAllV723', overlay).textContent = showAll ? 'Filtrar' : 'Ver todos'; render(); });
    $('#createPickerClientV723', overlay).addEventListener('click', () => { const name = $('#clientPickerSearchV723', overlay).value.trim(); close(); window._afterClientSaved = c => { if (options.onSelect) options.onSelect(c); }; openClientForm(null, { name, customerType: preferred }); });
    render();
    setTimeout(() => $('#clientPickerSearchV723', overlay)?.focus(), 80);
  });
}

function findClientDuplicateGroupsV723() {
  const groups = [];
  const used = new Set();
  const clients = AppState.clients || [];
  for (let i = 0; i < clients.length; i++) {
    const a = clients[i]; if (used.has(a.id)) continue;
    const phoneA = normalizePhoneV723(a.phone); const nameA = normalizeSearch(a.name);
    const matches = clients.filter((b, idx) => idx > i && !used.has(b.id) && ((phoneA && normalizePhoneV723(b.phone) === phoneA) || (nameA && normalizeSearch(b.name) && (normalizeSearch(b.name).includes(nameA) || nameA.includes(normalizeSearch(b.name))))));
    if (matches.length) { const group = [a, ...matches]; group.forEach(c => used.add(c.id)); groups.push(group); }
  }
  return groups;
}
async function mergeClientGroupV723(group) {
  if (!group || group.length < 2) return;
  const target = group.slice().sort((a,b)=>String(b.name||'').length-String(a.name||'').length)[0];
  const merged = group.reduce((acc, c) => buildClientRecordV723(acc, {
    name: betterClientNameV723(acc.name, c.name), phone: acc.phone || c.phone, customerType: acc.customerType !== 'unclassified' ? acc.customerType : (c.customerType || 'unclassified'), businessName: mergeTextV723(acc.businessName, c.businessName), city: mergeTextV723(acc.city, c.city), address: mergeTextV723(acc.address, c.address), latitude: acc.latitude || c.latitude, longitude: acc.longitude || c.longitude, locationLabel: mergeTextV723(acc.locationLabel, c.locationLabel || c.location), storePhoto: acc.storePhoto || c.storePhoto, notes: [acc.notes, c.notes].filter(Boolean).join(acc.notes && c.notes ? '\n' : ''), aliases: [...(acc.aliases || []), c.name].filter(Boolean)
  }), target);
  await saveClientV723(merged);
  const duplicateIds = group.map(c => c.id).filter(id => id !== merged.id);
  for (const sale of AppState.sales || []) {
    if (duplicateIds.includes(sale.clientId)) {
      const updatedSale = Object.assign({}, sale, { clientId: merged.id, clientName: merged.name, clientPhone: merged.phone });
      await DB.put('sales', updatedSale).catch(() => null);
      const idx = AppState.sales.findIndex(s => s.id === sale.id); if (idx >= 0) AppState.sales[idx] = updatedSale;
    }
  }
  for (const id of duplicateIds) { await DB.delete('clients', id).catch(() => null); }
  AppState.clients = AppState.clients.filter(c => !duplicateIds.includes(c.id));
}
function openClientCleanupV723() {
  const groups = findClientDuplicateGroupsV723();
  openSheet(`<h2>Saneamiento de clientes <span class="x" id="closeSheet">✕</span></h2>${groups.length ? groups.map((g,i)=>`<div class="duplicateBoxV723"><strong>Posible duplicado ${i+1}</strong>${g.map(c=>`<p>${escapeHtml(c.name)} · ${escapeHtml(c.phone || 'sin teléfono')}</p>`).join('')}<button class="btn block mergeGroupV723" data-i="${i}">Fusionar este grupo</button></div>`).join('') : `<div class="v7Empty"><span>✓</span><h3>No se detectaron duplicados claros</h3><p>La revisión usa coincidencia de teléfono y nombres muy parecidos.</p></div>`}<button class="btn outline block" id="closeSheet2">Cerrar</button>`, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close); $('#closeSheet2', overlay).addEventListener('click', close);
    $all('.mergeGroupV723', overlay).forEach(b => b.addEventListener('click', async () => { b.disabled = true; b.textContent = 'Fusionando…'; await mergeClientGroupV723(groups[Number(b.dataset.i)]); showToast('Clientes fusionados.'); close(); renderClients(); }));
  });
}

window.renderClients = renderClients;
window.openClientForm = openClientForm;
window.findOrCreateClientQuick = findOrCreateClientQuick;
window.openClientSelectorSheet = openClientSelectorSheet;
window.openWhatsAppV723 = openWhatsAppV723;
window.customerTypeForSaleV723 = customerTypeForSaleV723;
window.commercialStatusV723 = commercialStatusV723;
window.buildClientRecordV723 = buildClientRecordV723;
window.saveClientV723 = saveClientV723;
window.normalizePhoneV723 = normalizePhoneV723;
window.openClientBenefitV725 = openClientBenefitV725;
