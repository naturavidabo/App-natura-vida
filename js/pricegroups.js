/* pricegroups.js — Grupos de precio configurables por alcance modular.
   V7.2.6: el administrador gestiona grupos globales; cada representante gestiona sus propios grupos con la misma pantalla. */

const GROUP_COLORS = ['#01773B', '#83AD41', '#D98E1E', '#3B7DD8', '#A23B9E', '#D84343', '#2B8C8C', '#7A5C2E'];

function groupsForScreen() {
  return window.nvPriceGroupsForCurrent ? nvPriceGroupsForCurrent({ manage: true }) : (AppState.priceGroups || []);
}

function renderPriceGroups() {
  $('#fabAdd').classList.remove('hidden');
  $('#fabAdd').onclick = () => openPriceGroupForm(null);
  const main = $('#mainArea');
  const groups = groupsForScreen();
  const title = (window.isAdmin && isAdmin()) ? 'Grupos globales de precios' : 'Mis grupos de precios';
  const desc = (window.isAdmin && isAdmin())
    ? 'Estos grupos son globales del administrador. No se mezclan con los grupos propios de cada representante.'
    : 'Crea tus propios grupos para tus clientes. Funcionan igual que los grupos del administrador, pero solo dentro de tu cuenta.';

  let html = `
    <section class="v7PageHead"><span class="v7Eyebrow">Matriz modular XD</span><h1>${title}</h1><p>${desc}</p></section>
    <div class="banner">
      💲 Los grupos calculan <b>ganancia</b> o <b>descuento</b> sobre el precio base. Cada grupo guarda dueño y alcance para preparar la estructura modular.
    </div>
  `;

  if (groups.length === 0) {
    html += `
      <div class="empty">
        <span class="ic">🏷️</span>
        <h3>Aún no hay grupos</h3>
        <p>${(window.isAdmin && isAdmin()) ? 'Crea grupos globales para precios generales.' : 'Crea tus grupos propios para clientes mayoristas, frecuentes u ofertas.'}</p>
      </div>`;
  } else {
    groups.forEach(g => {
      html += `
      <div class="card" data-id="${g.id}">
        <div style="display:flex; align-items:center; gap:12px; padding:14px;">
          <div style="width:14px; height:42px; border-radius:6px; background:${g.color}; flex-shrink:0;"></div>
          <div style="flex:1;">
            <div class="name">${escapeHtml(g.name)}</div>
            <div class="costline">${g.mode === 'discount' ? 'Descuento' : 'Ganancia'} del ${Number(g.percent || 0)}% sobre precio base</div>
            <div class="costline">${window.nvDataOwnerLabel ? nvDataOwnerLabel(g) : ''}</div>
          </div>
        </div>
        <div class="cardactions">
          <button class="editGroupBtn" data-id="${g.id}">✏️ Editar</button>
          <button class="danger delGroupBtn" data-id="${g.id}">🗑️ Eliminar</button>
        </div>
      </div>`;
    });
  }

  main.innerHTML = html;
  $all('.editGroupBtn').forEach(b => b.addEventListener('click', () => openPriceGroupForm(b.dataset.id)));
  $all('.delGroupBtn').forEach(b => b.addEventListener('click', () => confirmDeleteGroup(b.dataset.id)));
}

async function confirmDeleteGroup(id) {
  const g = (AppState.priceGroups || []).find(x => x.id === id);
  if (!g) return;
  if (confirmDialog(`¿Eliminar el grupo "${g.name}"? Las ventas ya registradas no se modifican.`)) {
    try {
      await DB.delete('priceGroups', id);
      AppState.priceGroups = AppState.priceGroups.filter(x => x.id !== id);
      renderPriceGroups();
      showToast('Grupo eliminado de Supabase');
    } catch (err) { showToast(err.message || 'No se pudo eliminar el grupo.', 'error'); }
  }
}

function openPriceGroupForm(id) {
  const screenGroups = groupsForScreen();
  const g = id ? (AppState.priceGroups || []).find(x => x.id === id) : null;
  const selectedColor = g ? g.color : GROUP_COLORS[screenGroups.length % GROUP_COLORS.length];

  const html = `
    <h2>${g ? 'Editar grupo' : 'Nuevo grupo de precio'} <span class="x" id="closeSheet">✕</span></h2>
    <div class="v7CashNotice">${(window.isAdmin && isAdmin()) ? 'Se guardará como grupo global del administrador.' : 'Se guardará como grupo propio del representante. Tendrá la misma estructura de reglas que usa el administrador.'}</div>

    <div class="field">
      <label>Nombre del grupo</label>
      <input type="text" id="f_gname" placeholder="Ej: Mercado, Tienda, Socios..." value="${g ? escapeHtml(g.name) : ''}">
    </div>

    <div class="field">
      <label>Color identificador</label>
      <div id="colorPicker" style="display:flex; gap:8px; flex-wrap:wrap;">
        ${GROUP_COLORS.map(c => `
          <div class="colorDot" data-color="${c}" style="width:34px;height:34px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c === selectedColor ? '#15171A' : 'transparent'};"></div>
        `).join('')}
      </div>
    </div>

    <div class="field">
      <label>Tipo de regla</label>
      <div class="saletoggle" id="modeToggle">
        <button data-mode="markup" class="${(!g || g.mode === 'markup') ? 'active' : ''}">Ganancia (+%)</button>
        <button data-mode="discount" class="${g && g.mode === 'discount' ? 'active' : ''}">Descuento (−%)</button>
      </div>
    </div>

    <div class="field">
      <label>Porcentaje</label>
      <input type="number" inputmode="decimal" step="0.1" id="f_gpercent" placeholder="Ej: 30" value="${g ? g.percent : ''}">
    </div>

    <div class="actions keyboardSafeActions">
      <button class="btn outline block" id="cancelForm">Cancelar</button>
      <button class="btn block" id="saveForm">${g ? 'Guardar cambios' : 'Crear grupo'}</button>
    </div>
  `;

  openSheet(html, (overlay, close) => {
    let chosenColor = selectedColor;
    let chosenMode = g && g.mode === 'discount' ? 'discount' : 'markup';

    $all('.colorDot', overlay).forEach(dot => dot.addEventListener('click', () => {
      chosenColor = dot.dataset.color;
      $all('.colorDot', overlay).forEach(d => d.style.border = '3px solid transparent');
      dot.style.border = '3px solid #15171A';
    }));

    $all('#modeToggle button', overlay).forEach(btn => btn.addEventListener('click', () => {
      chosenMode = btn.dataset.mode;
      $all('#modeToggle button', overlay).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }));

    $('#closeSheet', overlay).addEventListener('click', close);
    $('#cancelForm', overlay).addEventListener('click', close);

    $('#saveForm', overlay).addEventListener('click', async () => {
      const name = $('#f_gname', overlay).value.trim();
      const percent = parseFloat($('#f_gpercent', overlay).value) || 0;
      if (!name) { showToast('⚠️ Ponle un nombre al grupo', 'error'); return; }
      const base = {
        id: g ? g.id : uid('grp'),
        name, color: chosenColor, mode: chosenMode, percent,
        createdAt: g ? g.createdAt : Date.now()
      };
      const data = window.nvPrepareOwnedRecord ? nvPrepareOwnedRecord(Object.assign({}, g || {}, base), 'priceGroups') : base;
      const saveBtn = $('#saveForm', overlay);
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando en Supabase…';
      try {
        await DB.put('priceGroups', data);
        const idx = AppState.priceGroups.findIndex(x => x.id === data.id);
        if (idx >= 0) AppState.priceGroups[idx] = data; else AppState.priceGroups.push(data);
        close();
        renderPriceGroups();
        showToast(g ? 'Grupo actualizado en Supabase' : 'Grupo creado en Supabase');
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = g ? 'Guardar cambios' : 'Crear grupo';
        showToast(err.message || 'No se pudo guardar el grupo.', 'error');
      }
    });
  });
}

window.renderPriceGroups = renderPriceGroups;
window.openPriceGroupForm = openPriceGroupForm;
