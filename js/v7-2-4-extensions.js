/* v7-2-4-extensions.js — mejoras controladas: WhatsApp, representantes y seguridad visual. */
(function(){
  const WAPP_SVG = `<svg class="waSvgV724" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#18b65a"/><path fill="#fff" d="M22.4 18.7c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.3 5.3 4.6.7.3 1.3.5 1.8.6.7.2 1.4.2 1.9.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.5z"/><path fill="#fff" d="M16 5.7A10.2 10.2 0 0 0 7.3 21l-1.1 4.1 4.2-1.1A10.2 10.2 0 1 0 16 5.7zm0 18.4c-1.8 0-3.5-.6-4.8-1.5l-.3-.2-2.5.7.7-2.4-.2-.3A8.2 8.2 0 1 1 16 24.1z"/></svg>`;
  function digits(phone){ return (window.normalizePhoneV723 ? normalizePhoneV723(phone) : String(phone||'').replace(/\D+/g,'').replace(/^591/,'').slice(-8)); }
  function waMessage(name){ return `Hola${name ? ' '+name : ''}, le escribo de Natura Vida Bolivia.`; }
  function waUrls(phone, name){
    const d = digits(phone);
    const text = encodeURIComponent(waMessage(name));
    if (!d || d.length < 7) return null;
    const target = `591${d}`;
    return {
      target,
      normal: `intent://send?phone=${target}&text=${text}#Intent;scheme=whatsapp;package=com.whatsapp;end`,
      business: `intent://send?phone=${target}&text=${text}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`,
      web: `https://wa.me/${target}?text=${text}`
    };
  }
  function openUrl(url){
    try { window.location.href = url; }
    catch (_) { window.open(url, '_blank', 'noopener'); }
  }
  function openWhatsAppChoiceV724(phone, name=''){
    const urls = waUrls(phone, name);
    if (!urls) return showToast('Este cliente no tiene WhatsApp válido.', 'error');
    openSheet(`
      <h2>Contactar por WhatsApp <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CashNotice">Número preparado para Bolivia: <strong>+${urls.target}</strong>. Elige la aplicación que quieres abrir.</div>
      <div class="waChoiceGridV724">
        <button class="waChoiceV724" id="openWaNormalV724">${WAPP_SVG}<span>WhatsApp normal</span></button>
        <button class="waChoiceV724 business" id="openWaBusinessV724">${WAPP_SVG}<span>WhatsApp Business</span></button>
      </div>
      <button class="btn outline block" id="openWaWebV724">Abrir enlace general si el celular no elige bien</button>
    `, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#openWaNormalV724', overlay).addEventListener('click', () => { close(); openUrl(urls.normal); });
      $('#openWaBusinessV724', overlay).addEventListener('click', () => { close(); openUrl(urls.business); });
      $('#openWaWebV724', overlay).addEventListener('click', () => { close(); window.open(urls.web, '_blank', 'noopener'); });
    });
  }
  try { window.openWhatsAppV723 = openWhatsAppChoiceV724; openWhatsAppV723 = openWhatsAppChoiceV724; } catch (_) { window.openWhatsAppV723 = openWhatsAppChoiceV724; }
  window.openWhatsAppChoiceV724 = openWhatsAppChoiceV724;
  window.whatsAppIconV724 = () => WAPP_SVG;

  async function fetchRepCommercialDataV724(profile){
    const repId = profile && profile.id;
    const out = { stock: [], movements: [], orders: [], sales: [] };
    if (!repId || !window.getSupabaseClient) return out;
    const sb = getSupabaseClient();
    const productsById = new Map((AppState.products||[]).map(p=>[p.id,p]));
    try {
      const { data } = await sb.from('representative_stock').select('product_id,stock,acquisition_cost,updated_at').eq('representative_user_id', repId);
      out.stock = (data||[]).map(r=>{ const p=productsById.get(r.product_id)||{}; return { productId:r.product_id, name:p.name||r.product_id, category:p.category||'', photo:p.photo||'', stock:Number(r.stock||0), acquisitionCost:Number(r.acquisition_cost||0), updatedAt:r.updated_at }; }).sort((a,b)=>b.stock-a.stock);
    } catch (_) {}
    try {
      const { data } = await sb.from('representative_stock_movements').select('*').eq('representative_user_id', repId).order('created_at',{ascending:false}).limit(40);
      out.movements = (data||[]).map(m=>{ const p=productsById.get(m.product_id)||{}; return Object.assign({},m,{productName:p.name||m.product_id}); });
    } catch (_) {}
    try {
      const { data } = await sb.from('purchase_orders').select('*').eq('representative_user_id', repId).order('created_at',{ascending:false}).limit(20);
      out.orders = (data||[]).map(r=>window.mapV7OrderRow?mapV7OrderRow(r):(r.payload||r));
    } catch (_) {}
    out.sales = (AppState.sales||[]).filter(s => String(s.sellerId||'')===String(repId) || String(s.sellerUserId||'')===String(repId)).sort((a,b)=>Number(b.date||0)-Number(a.date||0));
    return out;
  }
  function money(v){ return window.fmtMoney ? fmtMoney(v) : `Bs ${Number(v||0).toFixed(2)}`; }
  function repProductStrengthsV724(sales){
    const map = new Map();
    (sales||[]).forEach(s => (s.items||[]).forEach(it => { const k=it.productId||it.productName; const row=map.get(k)||{name:it.productName||k, qty:0, total:0}; row.qty+=Number(it.qty||0); row.total+=Number(it.subtotal||0); map.set(k,row); }));
    return Array.from(map.values()).sort((a,b)=>b.qty-a.qty).slice(0,5);
  }
  function repStatus(profile){
    const s=String(profile.status||'pendiente').toLowerCase();
    return s==='activo'?['Activo','success']:s==='bloqueado'?['Bloqueado','danger']:['Pendiente','warning'];
  }
  function openRepDetailV724(profile){
    openSheet(`<h2>Representante <span class="x" id="closeSheet">✕</span></h2><div class="v7LoadingBox">Cargando stock y movimientos…</div>`, async (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      const data = await fetchRepCommercialDataV724(profile);
      const units = data.stock.reduce((s,r)=>s+Number(r.stock||0),0);
      const value = data.stock.reduce((s,r)=>s+(Number(r.stock||0)*Number(r.acquisitionCost||0)),0);
      const products = repProductStrengthsV724(data.sales);
      $('.sheet', overlay).innerHTML = `
        <h2>${escapeHtml(profile.full_name||profile.email||'Representante')} <span class="x" id="closeSheet2">✕</span></h2>
        <div class="repSummaryGridV724"><div><span>Stock total</span><strong>${units}</strong></div><div><span>Valor ref.</span><strong>${money(value)}</strong></div><div><span>Ventas</span><strong>${data.sales.length}</strong></div><div><span>Pedidos</span><strong>${data.orders.length}</strong></div></div>
        <section class="v7Panel compact"><div class="v7PanelHead"><div><span class="v7Eyebrow">Inventario propio</span><h2>Stock actual</h2></div></div>${data.stock.length?data.stock.map(r=>`<div class="repStockRowV724"><span>${escapeHtml(r.name)}<small>${escapeHtml(r.category||'')}</small></span><b>${r.stock}</b></div>`).join(''):'<div class="v7Empty small"><span>📦</span><p>Sin stock asignado.</p></div>'}</section>
        <section class="v7Panel compact"><div class="v7PanelHead"><div><span class="v7Eyebrow">Actividad</span><h2>Productos fuertes</h2></div></div>${products.length?products.map(r=>`<div class="repStockRowV724"><span>${escapeHtml(r.name)}<small>${money(r.total)}</small></span><b>${r.qty}</b></div>`).join(''):'<div class="v7Empty small"><span>🌱</span><p>Todavía no hay ventas registradas.</p></div>'}</section>
        <section class="v7Panel compact"><div class="v7PanelHead"><div><span class="v7Eyebrow">Movimientos</span><h2>Últimos registros</h2></div></div>${data.movements.length?data.movements.slice(0,12).map(m=>`<div class="repMoveRowV724"><span>${escapeHtml(m.productName||'Producto')}<small>${m.created_at?fmtDateTime(new Date(m.created_at).getTime()):''}</small></span><b>${Number(m.delta||m.qty||0)>0?'+':''}${Number(m.delta||m.qty||0)}</b></div>`).join(''):'<div class="v7Empty small"><span>↕</span><p>Sin movimientos visibles.</p></div>'}</section>
      `;
      $('#closeSheet2', overlay).addEventListener('click', close);
    });
  }
  async function renderUsersFoundationV724(){
    $('#fabAdd').classList.add('hidden');
    const [profilesRes] = await Promise.all([fetchAllProfilesV7(), fetchProfileChangeRequestsV7().catch(()=>({ok:false}))]);
    const profiles = profilesRes && profilesRes.ok ? profilesRes.profiles || [] : AppState.allProfiles || [];
    const requests = (AppState.profileChangeRequests || []).filter(r => r.status === 'pending');
    $('#mainArea').innerHTML = `
      <section class="v7PageHead"><span class="v7Eyebrow">Equipo comercial</span><h1>Representantes</h1><p>Aprueba cuentas, revisa stock, movimientos, pedidos y ventas por representante.</p></section>
      ${requests.length ? `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Solicitudes pendientes</span><h2>Cambios de perfil</h2></div><span class="v7BadgeCount">${requests.length}</span></div>${requests.map(r=>{ const p=profiles.find(x=>x.id===r.userId)||{}; return `<article class="v7ChangeRequest"><div><strong>${escapeHtml(p.full_name||p.email||'Usuario')}</strong><span>${r.fieldName==='phone'?'WhatsApp':'Ciudad'}: <b>${escapeHtml(r.oldValue||'—')}</b> → <b>${escapeHtml(r.newValue)}</b></span><small>${fmtDateTime(r.createdAt)}</small></div><div><button class="btn sm approveProfileChange" data-id="${r.id}">Aprobar</button><button class="btn sm outline rejectProfileChange" data-id="${r.id}">Rechazar</button></div></article>`;}).join('')}</section>`:''}
      <section class="v7UsersGrid">${profiles.map(p=>{ const [label,tone]=repStatus(p); const admin=String(p.role||'').toLowerCase()==='administrador'; return `<article class="v7UserCard ${admin?'admin':''}"><div class="v7UserTop"><div class="v7Avatar">${escapeHtml((p.full_name||p.email||'U').charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(p.full_name||'Sin nombre')}</strong><span>${escapeHtml(p.email||'')}</span><small>${escapeHtml(p.city||'')} ${p.phone?'· '+escapeHtml(p.phone):''}</small></div><em class="v7Status ${tone}">${label}</em></div>${admin?`<div class="v7AdminPrincipal">Administrador principal</div>`:`<div class="repQuickActionsV724"><button class="btn sm repDetailV724" data-id="${p.id}">Ver stock y movimientos</button></div><div class="v7DiscountEditor"><label>Descuento personal para compras<input type="number" min="0" max="100" step="0.5" value="${Number(p.representative_discount_percent||0)}" data-discount-input="${p.id}"></label><button class="btn sm outline saveDiscountV7" data-id="${p.id}">Guardar descuento</button></div><div class="v7UserActions"><button class="btn sm ghost editLegalNameV724" data-id="${p.id}">Corregir nombre</button>${String(p.status).toLowerCase()==='pendiente'?`<button class="btn sm approveUserV7" data-id="${p.id}">Aprobar</button>`:''}${String(p.status).toLowerCase()==='activo'?`<button class="btn sm outline blockUserV7" data-id="${p.id}">Bloquear</button>`:''}${String(p.status).toLowerCase()==='bloqueado'?`<button class="btn sm unblockUserV7" data-id="${p.id}">Reactivar</button>`:''}</div>`}</article>`; }).join('')}</section>`;
    $all('.repDetailV724').forEach(b=>b.addEventListener('click',()=>{ const p=profiles.find(x=>x.id===b.dataset.id); if(p) openRepDetailV724(p); }));
    $all('.saveDiscountV7').forEach(b=>b.addEventListener('click',async()=>{const input=$(`[data-discount-input="${b.dataset.id}"]`);const res=await setRepresentativeDiscountV7(b.dataset.id,Number(input.value||0));showToast(res.ok?'Descuento actualizado.':res.message,res.ok?undefined:'error');if(res.ok)renderUsersFoundationV724();}));
    $all('.approveUserV7').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;const res=await adminApproveUser(b.dataset.id);showToast(res.ok?'Cuenta aprobada.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV724(); else b.disabled=false;}));
    $all('.blockUserV7').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;const res=await adminBlockUser(b.dataset.id);showToast(res.ok?'Cuenta bloqueada.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV724(); else b.disabled=false;}));
    $all('.unblockUserV7').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;const res=await adminUnblockUser(b.dataset.id);showToast(res.ok?'Cuenta reactivada.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV724(); else b.disabled=false;}));
    $all('.approveProfileChange').forEach(b=>b.addEventListener('click',async()=>{const res=await reviewProfileChangeV7(b.dataset.id,'approved','');showToast(res.ok?'Cambio aprobado.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV724();}));
    $all('.rejectProfileChange').forEach(b=>b.addEventListener('click',async()=>{const res=await reviewProfileChangeV7(b.dataset.id,'rejected','');showToast(res.ok?'Cambio rechazado.':res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV724();}));
    $all('.editLegalNameV724').forEach(b=>b.addEventListener('click',()=>{
      const profile=profiles.find(p=>p.id===b.dataset.id); if(!profile) return;
      openSheet(`<h2>Corregir nombre <span class="x" id="closeSheet">✕</span></h2><div class="field"><label>Nombre completo</label><input id="legalNameV724" value="${escapeHtml(profile.full_name||'')}"></div><button class="btn block" id="saveLegalNameV724">Guardar</button>`,(overlay,close)=>{ $('#closeSheet',overlay).addEventListener('click',close); $('#saveLegalNameV724',overlay).addEventListener('click',async()=>{const v=$('#legalNameV724',overlay).value.trim(); if(v.length<3)return showToast('Ingresa un nombre válido.','error'); const res=await adminUpdateProfileNameV7(profile.id,v); showToast(res.ok?'Nombre corregido.':res.message,res.ok?undefined:'error'); if(res.ok){close();renderUsersFoundationV724();}}); });
    }));
  }
  window.renderUsersFoundation = renderUsersFoundationV724;
  window.openRepresentativeDetailV724 = openRepDetailV724;
})();
