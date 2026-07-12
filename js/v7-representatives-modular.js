/* NATURA VIDA V7.2.6 — ficha modular de representantes.
   Corrige la separación entre condiciones asignadas por administrador y grupos propios del representante. */
(function(){
  function profileIsAdmin(p){ return String(p.role || '').toLowerCase() === 'administrador'; }
  function repConfig(userId){ return (AppState.representatives || []).find(r => r.id === userId) || {}; }
  function adminGlobalGroups(){ return (AppState.priceGroups || []).filter(g => window.nvIsGlobalGroup ? nvIsGlobalGroup(g) : true); }
  function repOwnGroups(userId){ return (AppState.priceGroups || []).filter(g => window.nvIsRepresentativeGroup ? nvIsRepresentativeGroup(g, userId) : g.ownerUserId === userId); }
  function salesForRep(userId){ return (AppState.sales || []).filter(s => String(s.sellerId || '') === String(userId)); }
  function topProductsFromSales(rows){
    const map = new Map();
    rows.forEach(s => (s.items || []).forEach(it => {
      const id = it.productId || it.productName;
      const cur = map.get(id) || { name: it.productName || id, qty: 0, total: 0 };
      cur.qty += Number(it.qty || 0); cur.total += Number(it.subtotal || 0); map.set(id, cur);
    }));
    return Array.from(map.values()).sort((a,b)=>b.qty-a.qty).slice(0,5);
  }
  async function saveRepresentativeConfigV725(userId, data = {}){
    const current = repConfig(userId);
    const row = window.nvPrepareOwnedRecord ? nvPrepareOwnedRecord(Object.assign({}, current, data, { id: userId, representativeUserId: userId }), 'representatives') : Object.assign({}, current, data, { id: userId, representativeUserId: userId });
    await DB.put('representatives', row);
    const idx = (AppState.representatives || []).findIndex(r => r.id === userId);
    if (idx >= 0) AppState.representatives[idx] = row; else AppState.representatives.push(row);
    return row;
  }
  async function openRepresentativeDetailV725(userId, profiles){
    const p = (profiles || []).find(x => x.id === userId) || {};
    const stockRes = window.fetchRepresentativeStockForAdminV725 ? await fetchRepresentativeStockForAdminV725(userId) : { ok:true, rows:[] };
    const ordersRes = window.fetchRepresentativeOrdersForAdminV725 ? await fetchRepresentativeOrdersForAdminV725(userId) : { ok:true, orders:[] };
    const stock = stockRes.ok ? stockRes.rows : [];
    const orders = ordersRes.ok ? ordersRes.orders : [];
    const sales = salesForRep(userId);
    const groups = repOwnGroups(userId);
    const totalStock = stock.reduce((s,r)=>s+Number(r.stock||0),0);
    const stockValue = stock.reduce((s,r)=>s+(Number(r.stock||0)*Number(r.acquisitionCost||0)),0);
    const top = topProductsFromSales(sales);
    openSheet(`
      <h2>Ficha modular — ${escapeHtml(p.full_name || p.email || 'Representante')} <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CashNotice">Esta ficha prepara la estructura XD: stock, movimientos, ventas, grupos propios y futura jerarquía regional.</div>
      <section class="v7MetricGrid compact"><article class="v7MetricCard"><span>Stock</span><strong>${totalStock}</strong><small>unidades</small></article><article class="v7MetricCard"><span>Valor ref.</span><strong>${fmtMoney(stockValue)}</strong><small>stock propio</small></article><article class="v7MetricCard primary"><span>Ventas</span><strong>${sales.length}</strong><small>${fmtMoney(sales.reduce((s,x)=>s+Number(x.total||0),0))}</small></article></section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Grupos propios</span><h2>${groups.length} grupo(s)</h2></div><button class="btn sm outline" id="openRepGroupsV726">Ver grupos</button></div>${groups.map(g=>`<div class="priceLine"><span><b style="color:${g.color}">●</b> ${escapeHtml(g.name)}</span><b>${g.mode==='discount'?'−':'+'}${Number(g.percent||0)}%</b></div>`).join('') || '<div class="v7EmptyInline"><span>🏷️</span><div><strong>Sin grupos propios</strong><small>El representante puede crearlos desde Más → Mis grupos de precios.</small></div></div>'}</section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Stock actual</span><h2>Productos en poder del representante</h2></div></div>${stock.map(r=>`<div class="priceLine"><span>${escapeHtml(r.productName)}<small>${escapeHtml(r.category||'General')}</small></span><b>${Number(r.stock||0)} u.</b></div>`).join('') || '<div class="v7EmptyInline"><span>📦</span><div><strong>Sin stock confirmado</strong><small>Cuando se confirme una compra, aparecerá aquí.</small></div></div>'}</section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Productos fuertes</span><h2>Más movidos</h2></div></div>${top.map(t=>`<div class="priceLine"><span>${escapeHtml(t.name)}<small>${Number(t.qty)} unidad(es)</small></span><b>${fmtMoney(t.total)}</b></div>`).join('') || '<div class="v7EmptyInline"><span>📈</span><div><strong>Sin ventas registradas</strong><small>Los productos fuertes se calcularán automáticamente.</small></div></div>'}</section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Pedidos</span><h2>Últimos movimientos de compra</h2></div></div>${orders.slice(0,6).map(o=>`<div class="priceLine"><span>${escapeHtml(o.id || 'Pedido')}<small>${fmtDateTime(o.createdAt || Date.now())} · ${escapeHtml(o.status||'')}</small></span><b>${fmtMoney(o.total||0)}</b></div>`).join('') || '<div class="v7EmptyInline"><span>🛒</span><div><strong>Sin pedidos</strong><small>Aún no tiene compras registradas.</small></div></div>'}</section>
    `,(overlay,close)=>{ $('#closeSheet',overlay).addEventListener('click',close); const btn=$('#openRepGroupsV726',overlay); if(btn)btn.addEventListener('click',()=>openRepresentativeGroupsV726(userId,p)); });
  }
  function openRepresentativeGroupsV726(userId, profile){
    const groups = repOwnGroups(userId);
    openSheet(`
      <h2>Grupos propios — ${escapeHtml((profile && profile.full_name) || 'Representante')} <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CashNotice">Son grupos creados por el representante desde su cuenta. El administrador los puede auditar, pero no se mezclan con los grupos globales.</div>
      ${groups.map(g=>`<article class="v7HistoryCard"><span><strong><b style="color:${g.color}">●</b> ${escapeHtml(g.name)}</strong><small>${g.mode==='discount'?'Descuento':'Ganancia'} ${Number(g.percent||0)}%</small></span><span><b>${escapeHtml(g.scope||'representative')}</b><small>${escapeHtml(g.region||'')}</small></span></article>`).join('') || '<div class="v7Empty"><span>🏷️</span><h3>Sin grupos propios</h3><p>Cuando el representante cree grupos desde su sesión, aparecerán aquí.</p></div>'}
    `,(overlay,close)=>$('#closeSheet',overlay).addEventListener('click',close));
  }
  async function renderUsersFoundationV726(){
    $('#fabAdd').classList.add('hidden');
    const [profilesRes] = await Promise.all([fetchAllProfilesV7(), fetchProfileChangeRequestsV7()]);
    const profiles = profilesRes && profilesRes.ok ? profilesRes.profiles || [] : AppState.allProfiles || [];
    const requests = (AppState.profileChangeRequests || []).filter(r => r.status === 'pending');
    const globalGroups = adminGlobalGroups();
    $('#mainArea').innerHTML = `
      <section class="v7PageHead"><span class="v7Eyebrow">Matriz modular XD</span><h1>Representantes</h1><p>Controla cuentas, stock, condiciones de compra y grupos propios sin mezclar permisos.</p></section>
      ${requests.length ? `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Solicitudes pendientes</span><h2>Cambios de perfil</h2></div><span class="v7BadgeCount">${requests.length}</span></div>${requests.map(r => { const p=profiles.find(x=>x.id===r.userId)||{}; return `<article class="v7ChangeRequest"><div><strong>${escapeHtml(p.full_name||p.email||'Usuario')}</strong><span>${r.fieldName==='phone'?'WhatsApp':'Ciudad'}: <b>${escapeHtml(r.oldValue||'—')}</b> → <b>${escapeHtml(r.newValue)}</b></span><small>${fmtDateTime(r.createdAt)}</small></div><div><button class="btn sm approveProfileChange" data-id="${r.id}">Aprobar</button><button class="btn sm outline rejectProfileChange" data-id="${r.id}">Rechazar</button></div></article>`; }).join('')}</section>` : ''}
      <section class="v7UsersGrid">${profiles.map(p => {
        const s=String(p.status||'pendiente').toLowerCase(); const label=s==='activo'?'Activo':s==='bloqueado'?'Bloqueado':'Pendiente'; const tone=s==='activo'?'success':s==='bloqueado'?'danger':'warning'; const admin=profileIsAdmin(p); const cfg=repConfig(p.id); const ownGroups=repOwnGroups(p.id);
        return `<article class="v7UserCard ${admin?'admin':''}"><div class="v7UserTop"><div class="v7Avatar">${escapeHtml((p.full_name||p.email||'U').charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(p.full_name||'Sin nombre')}</strong><span>${escapeHtml(p.email||'')}</span><small>${escapeHtml(p.city||'')} ${p.phone?'· '+escapeHtml(p.phone):''}</small></div><em class="v7Status ${tone}">${label}</em></div>${admin?`<div class="v7AdminPrincipal">Administrador principal</div>`:`<div class="v7DiscountEditor"><label>Condición de compra asignada por administrador<select data-rep-group="${p.id}"><option value="">Sin grupo fijo</option>${globalGroups.map(g=>`<option value="${g.id}" ${cfg.priceGroupId===g.id?'selected':''}>${escapeHtml(g.name)} (${g.mode==='discount'?'−':'+'}${Number(g.percent||0)}%)</option>`).join('')}</select></label><label>Descuento personal para compras<input type="number" min="0" max="100" step="0.5" value="${Number(p.representative_discount_percent||cfg.discountPercent||0)}" data-discount-input="${p.id}"></label><button class="btn sm outline saveDiscountV7" data-id="${p.id}">Guardar condición</button></div><div class="v7CashNotice">Grupos propios del representante: <b>${ownGroups.length}</b>. Se crean desde su sesión en Más → Mis grupos de precios.</div><div class="v7UserActions"><button class="btn sm detailRepresentativeV725" data-id="${p.id}">Ficha modular</button><button class="btn sm outline repGroupsV726" data-id="${p.id}">Grupos propios</button><button class="btn sm ghost editLegalNameV7" data-id="${p.id}">Corregir nombre</button>${s==='pendiente'?`<button class="btn sm approveUserV7" data-id="${p.id}">Aprobar</button>`:''}${s==='activo'?`<button class="btn sm outline blockUserV7" data-id="${p.id}">Bloquear</button>`:''}${s==='bloqueado'?`<button class="btn sm unblockUserV7" data-id="${p.id}">Reactivar</button>`:''}</div>`}</article>`;
      }).join('')}</section>`;
    $all('.approveUserV7').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true; const res=await adminApproveUser(b.dataset.id); showToast(res.ok?'Cuenta aprobada.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV726(); else b.disabled=false;}));
    $all('.blockUserV7').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true; const res=await adminBlockUser(b.dataset.id); showToast(res.ok?'Cuenta bloqueada.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV726(); else b.disabled=false;}));
    $all('.unblockUserV7').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true; const res=await adminUnblockUser(b.dataset.id); showToast(res.ok?'Cuenta reactivada.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV726(); else b.disabled=false;}));
    $all('.saveDiscountV7').forEach(b=>b.addEventListener('click',async()=>{const input=$(`[data-discount-input="${b.dataset.id}"]`); const group=$(`[data-rep-group="${b.dataset.id}"]`); b.disabled=true; const res=await setRepresentativeDiscountV7(b.dataset.id,Number(input.value||0)); if(res.ok){await saveRepresentativeConfigV725(b.dataset.id,{priceGroupId:group?group.value:'',discountPercent:Number(input.value||0)}).catch(()=>{});} showToast(res.ok?'Condición de compra actualizada.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV726(); else b.disabled=false;}));
    $all('.detailRepresentativeV725').forEach(b=>b.addEventListener('click',()=>openRepresentativeDetailV725(b.dataset.id, profiles)));
    $all('.repGroupsV726').forEach(b=>b.addEventListener('click',()=>openRepresentativeGroupsV726(b.dataset.id, profiles.find(p=>p.id===b.dataset.id))));
    $all('.editLegalNameV7').forEach(b=>b.addEventListener('click',()=>showToast('Usa la versión anterior de corrección de nombre desde perfil si es necesario.')));
    $all('.approveProfileChange').forEach(b=>b.addEventListener('click',async()=>{const res=await reviewProfileChangeV7(b.dataset.id,'approved',''); showToast(res.ok?'Cambio aprobado.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV726();}));
    $all('.rejectProfileChange').forEach(b=>b.addEventListener('click',async()=>{const res=await reviewProfileChangeV7(b.dataset.id,'rejected',''); showToast(res.ok?'Cambio rechazado.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV726();}));
  }
  Object.assign(window,{ saveRepresentativeConfigV725, openRepresentativeDetailV725, openRepresentativeGroupsV726, renderUsersFoundation: renderUsersFoundationV726 });
})();
