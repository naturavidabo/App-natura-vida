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

  const filtered = AppState.clients.filter(c => matchesSearch(c.name, _clientSearch) || matchesSearch(c.phone, _clientSearch));

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
  $('#searchInput').addEventListener('input', e => { _clientSearch = e.target.value; renderClients(); });
  $all('.editClientBtn').forEach(b => b.addEventListener('click', () => openClientForm(b.dataset.id)));
  $all('.delClientBtn').forEach(b => b.addEventListener('click', () => confirmDeleteClient(b.dataset.id)));
  $all('.histClientBtn').forEach(b => b.addEventListener('click', () => openClientHistory(b.dataset.id)));
}

function confirmDeleteClient(id) {
  const c = AppState.clients.find(x => x.id === id);
  if (!c) return;
  if (confirmDialog(`¿Eliminar a "${c.name}" del directorio? El historial de ventas ya registrado se conserva.`)) {
    AppState.clients = AppState.clients.filter(x => x.id !== id);
    DB.delete('clients', id);
    renderClients();
    showToast('Cliente eliminado');
  }
}

function openClientHistory(id) {
  const c = AppState.clients.find(x => x.id === id);
  if (!c) return;
  const purchases = AppState.sales.filter(s => s.clientId === id).slice().reverse();

  const html = `
    <h2>Historial — ${escapeHtml(c.name)} <span class="x" id="closeSheet">✕</span></h2>
    ${purchases.length === 0 ? `<div class="empty"><span class="ic">📭</span><h3>Sin compras aún</h3></div>` :
      purchases.map(s => `
        <div class="histitem">
          <div class="l">
            <div class="pname">${escapeHtml(s.productName)}</div>
            <div class="meta">${s.type === 'unit' ? 'Unitaria' : 'Por mayor'} · ${s.qty} ${s.type === 'wholesale' ? 'lote(s)' : 'unid.'} · ${fmtDate(s.date)}</div>
          </div>
          <div class="r">+${fmtMoney(s.total)}</div>
        </div>
      `).join('')}
    <div class="actions">
      <button class="btn block" id="closeSheet2">Cerrar</button>
    </div>
  `;
  openSheet(html, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#closeSheet2', overlay).addEventListener('click', close);
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
      showToast(c ? 'Cliente actualizado' : 'Cliente creado');
    });
  });
}

/* Busca o crea un cliente rápido desde el flujo de venta, sin salir de la pantalla. */
function findOrCreateClientQuick(name, phone) {
  name = (name || '').trim();
  if (!name) return null;
  let existing = AppState.clients.find(c => normalizeSearch(c.name) === normalizeSearch(name));
  if (existing) {
    if (phone && phone.trim() && existing.phone !== phone.trim()) {
      existing.phone = phone.trim();
      DB.put('clients', existing);
    }
    AppState.lastClient = existing;
    return existing;
  }
  const data = { id: uid('cli'), name, phone: (phone || '').trim(), priceGroupId: '', createdAt: Date.now() };
  AppState.clients.push(data);
  DB.put('clients', data);
  AppState.lastClient = data;
  return data;
}

window.renderClients = renderClients;
window.openClientForm = openClientForm;
window.findOrCreateClientQuick = findOrCreateClientQuick;
