/* NATURA VIDA V7.7.1 — Gestión regional estable, sin pantallas de carga repetidas. */
(() => {
  let regionalCache = { profiles:[], regional:[], requests:[], stock:[] };
  let regionalLoaded = false;
  let refreshPromise = null;
  let realtimeTimer = null;

  const esc = value => escapeHtml(String(value ?? ''));
  const client = () => {
    const value = window.getSupabaseClient ? getSupabaseClient() : null;
    if (!value) throw new Error('Supabase no está disponible.');
    return value;
  };
  const currentUid = () => AppState.session.onlineUserId || AppState.session.userId;
  const msg = error => window.messageFromError ? messageFromError(error) : String(error?.message || error || 'Error inesperado');

  async function loadRegionalDataV750() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const userId = currentUid();
      const admin = isAdmin();
      const managerView = admin || (window.canManageTeamV800 && canManageTeamV800());
      const profilesPromise = managerView && window.fetchManageableProfilesV800 ? fetchManageableProfilesV800() : (admin && window.fetchAllProfilesV7 ? fetchAllProfilesV7() : Promise.resolve({ ok:true, profiles:[AppState.session] }));
      let regionalQuery = client().from('representative_regional_profiles').select('*').order('updated_at',{ ascending:false });
      let requestsQuery = client().from('regional_restock_requests').select('*').order('created_at',{ ascending:false }).limit(200);
      let stockQuery = client().from('representative_stock').select('representative_user_id,product_id,stock,acquisition_cost,updated_at');
      if (!managerView) {
        regionalQuery = regionalQuery.eq('representative_user_id',userId);
        requestsQuery = requestsQuery.eq('representative_user_id',userId);
        stockQuery = stockQuery.eq('representative_user_id',userId);
      }
      const [profilesRes,regionalRes,requestsRes,stockRes] = await Promise.all([profilesPromise,regionalQuery,requestsQuery,stockQuery]);
      const failed = [regionalRes,requestsRes,stockRes].find(result => result.error);
      if (failed) throw failed.error;
      regionalCache = {
        profiles:profilesRes?.ok ? (profilesRes.profiles || []) : (regionalCache.profiles || []),
        regional:regionalRes.data || [], requests:requestsRes.data || [], stock:stockRes.data || []
      };
      regionalLoaded = true;
      return { ok:true, ...regionalCache };
    })();
    try { return await refreshPromise; }
    finally { refreshPromise = null; }
  }

  function aggregateStock(rows,userId) {
    return rows.filter(row => row.representative_user_id === userId).reduce((sum,row) => ({ units:sum.units+Number(row.stock||0), value:sum.value+Number(row.stock||0)*Number(row.acquisition_cost||0) }),{ units:0,value:0 });
  }
  function statusLabel(status) { return ({ active:'Activo',suspended:'Suspendido',inactive:'Inactivo',pending:'Pendiente',approved:'Aprobada',rejected:'Rechazada',fulfilled:'Atendida' })[status] || status || 'Pendiente'; }
  function representativeRows() {
    const reps = regionalCache.profiles.filter(profile => String(profile.role||'').toLowerCase() !== 'administrador');
    const managerView = isAdmin() || (window.canManageTeamV800 && canManageTeamV800());
    return managerView ? reps : reps.filter(profile => profile.id === currentUid());
  }
  function totalUnits() { return regionalCache.stock.reduce((sum,row)=>sum+Number(row.stock||0),0); }
  function pendingRequests() { return regionalCache.requests.filter(row=>row.status==='pending').length; }

  function representativeCard(profile) {
    const regional = regionalCache.regional.find(row => row.representative_user_id === profile.id) || {};
    const stock = aggregateStock(regionalCache.stock,profile.id);
    const requests = regionalCache.requests.filter(row => row.representative_user_id === profile.id && row.status === 'pending').length;
    const avatar = window.avatarMarkupV771 ? avatarMarkupV771(profile,'regional') : `<span class="v7Avatar">${esc((profile.full_name||profile.email||'R').charAt(0).toUpperCase())}</span>`;
    return `<article class="v750RegionalCard" data-regional-user="${esc(profile.id)}"><div class="v750RepTop">${avatar}<div><strong>${esc(profile.full_name||'Sin nombre')}</strong><span>${esc(regional.region_name||profile.city||'Región sin definir')}</span><small>${esc(regional.city||profile.city||'')}</small></div><em>${statusLabel(regional.operational_status||'active')}</em></div><div class="v750RepStats"><span><b>${stock.units}</b><small>unidades</small></span><span><b>${fmtMoney(stock.value)}</b><small>valor stock</small></span><span><b>${requests}</b><small>solicitudes</small></span></div><div class="v750CardActions"><button class="btn sm editRegionV750" data-id="${esc(profile.id)}">Editar ficha</button><button class="btn sm outline viewRequestsV750" data-id="${esc(profile.id)}">Reposiciones</button></div></article>`;
  }

  function requestCard(row) {
    const detail = Array.isArray(row.items) ? row.items.map(item => `${esc(item.productName||item.product_name)} × ${Number(item.quantity||0)}`).join(' · ') : 'Sin detalle';
    return `<article class="v750RequestCard"><div><strong>${esc(row.request_code||'Solicitud')}</strong><span>${esc(row.representative_name||'Representante')} · ${new Date(row.created_at).toLocaleDateString('es-BO')}</span><small>${detail}</small></div><div><em class="v750Status ${esc(row.status)}">${statusLabel(row.status)}</em>${(isAdmin() || ((window.canManageTeamV800&&canManageTeamV800()) && row.representative_user_id!==currentUid())) && row.status==='pending' ? `<button class="btn sm approveRestockV750" data-id="${esc(row.id)}">Aprobar</button><button class="btn sm outline rejectRestockV750" data-id="${esc(row.id)}">Rechazar</button>` : ''}</div></article>`;
  }

  function fullHtml() {
    const visible = representativeRows();
    const managerView = isAdmin() || (window.canManageTeamV800 && canManageTeamV800());
    return `<section class="v7RegionalHero nv771LimeHero"><span class="nv771HeroOrb one"></span><span class="nv771HeroOrb two"></span><span class="v7Eyebrow">Natura Vida V8.0.5</span><h1>${managerView?'Gestión regional y equipo':'Mi región comercial'}</h1><p>${managerView?'Región, stock, equipo y solicitudes visibles según tu nivel de responsabilidad, con actualización silenciosa.':'Consulta tu región, stock y reposiciones sin perder la estabilidad de la pantalla.'}</p></section>
      <section class="v7MetricGrid compact v750Metrics"><article class="v7MetricCard"><span>Representantes</span><strong id="regionalMetricRepsV771">${visible.length}</strong><small>con ficha visible</small></article><article class="v7MetricCard"><span>Stock regional</span><strong id="regionalMetricStockV771">${totalUnits()}</strong><small>unidades registradas</small></article><article class="v7MetricCard"><span>Reposiciones</span><strong id="regionalMetricPendingV771">${pendingRequests()}</strong><small>pendientes</small></article></section>
      ${managerView?`<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Mapa operativo</span><h2>Representantes regionales</h2></div><span class="v770SyncChip" id="regionalSyncChipV771">Actualizado</span></div><div class="v750RegionalGrid" id="regionalGridV771">${visible.map(representativeCard).join('')||'<div class="v7Empty"><h3>Sin representantes</h3><p>Aprueba primero las cuentas del equipo comercial.</p></div>'}</div></section>`:''}
      <section class="v7Panel" id="regionalRequestsSectionV771"><div class="v7PanelHead"><div><span class="v7Eyebrow">Abastecimiento</span><h2>Solicitudes de reposición</h2></div>${!isAdmin()?'<button class="btn sm" id="newRestockV750">Nueva solicitud</button>':''}</div><div class="v750RequestList" id="regionalRequestsListV771">${regionalCache.requests.map(requestCard).join('')||'<div class="v7Empty"><span>📦</span><h3>Sin solicitudes</h3><p>Las solicitudes aparecerán aquí.</p></div>'}</div></section>`;
  }

  function bindRegionalEvents() {
    $all('.editRegionV750').forEach(button => { button.onclick=()=>openRegionEditorV750(button.dataset.id); });
    $all('.viewRequestsV750').forEach(button => { button.onclick=()=>$('#regionalRequestsSectionV771')?.scrollIntoView({ behavior:'smooth',block:'start' }); });
    const newRestock=$('#newRestockV750'); if(newRestock)newRestock.onclick=openRestockRequestV750;
    $all('.approveRestockV750').forEach(button=>{ button.onclick=()=>updateRestockStatusV750(button.dataset.id,'approved'); });
    $all('.rejectRestockV750').forEach(button=>{ button.onclick=()=>updateRestockStatusV750(button.dataset.id,'rejected'); });
  }

  function patchRegionalV771() {
    if (AppState.currentTab !== 'regional' || window.V7_FORM_DIRTY) return;
    const visible = representativeRows();
    const reps = $('#regionalMetricRepsV771'), stock = $('#regionalMetricStockV771'), pending = $('#regionalMetricPendingV771');
    if (reps) reps.textContent = visible.length;
    if (stock) stock.textContent = totalUnits();
    if (pending) pending.textContent = pendingRequests();
    const grid = $('#regionalGridV771');
    if (grid) grid.innerHTML = visible.map(representativeCard).join('') || '<div class="v7Empty"><h3>Sin representantes</h3><p>Aprueba primero las cuentas del equipo comercial.</p></div>';
    const list = $('#regionalRequestsListV771');
    if (list) list.innerHTML = regionalCache.requests.map(requestCard).join('') || '<div class="v7Empty"><span>📦</span><h3>Sin solicitudes</h3><p>Las solicitudes aparecerán aquí.</p></div>';
    const chip = $('#regionalSyncChipV771');
    if (chip) { chip.textContent='Actualizado'; chip.classList.add('pulse'); setTimeout(()=>chip.classList.remove('pulse'),320); }
    bindRegionalEvents();
  }

  async function renderRegionalManagementV750(options = {}) {
    $('#fabAdd').classList.add('hidden');
    const main = $('#mainArea');
    if (!regionalLoaded && !options.quiet) main.innerHTML='<div class="loading">Cargando gestión regional…</div>';
    try {
      await loadRegionalDataV750();
      if (options.patch && $('#regionalMetricStockV771')) return patchRegionalV771();
      main.innerHTML=fullHtml();
      bindRegionalEvents();
    } catch (error) {
      if (regionalLoaded && $('#regionalMetricStockV771')) return showToast(msg(error),'error');
      main.innerHTML=`<div class="v7Empty"><span>⚠️</span><h3>No se pudo cargar</h3><p>${esc(msg(error))}</p><button class="btn" id="retryRegionalV750">Reintentar</button></div>`;
      $('#retryRegionalV750')?.addEventListener('click',renderRegionalManagementV750);
    }
  }

  async function refreshAndPatchRegionalV771() { await loadRegionalDataV750(); patchRegionalV771(); }

  function openRegionEditorV750(userId) {
    const profile = regionalCache.profiles.find(row=>row.id===userId)||{};
    const regional = regionalCache.regional.find(row=>row.representative_user_id===userId)||{};
    openSheet(`<h2>Ficha regional <span class="x" id="closeSheet">✕</span></h2><div class="v7CashNotice">${esc(profile.full_name||profile.email||'Representante')}</div><div class="field"><label>Región / zona</label><input id="rRegion" value="${esc(regional.region_name||'')}" placeholder="Ej.: Santa Cruz Norte"></div><div class="field-row"><div class="field"><label>Ciudad</label><input id="rCity" value="${esc(regional.city||profile.city||'')}"></div><div class="field"><label>Estado</label><select id="rStatus"><option value="active">Activo</option><option value="suspended" ${regional.operational_status==='suspended'?'selected':''}>Suspendido</option><option value="inactive" ${regional.operational_status==='inactive'?'selected':''}>Inactivo</option></select></div></div><div class="field-row"><div class="field"><label>Meta mensual (Bs)</label><input id="rGoal" type="number" min="0" value="${Number(regional.monthly_goal||0)}"></div><div class="field"><label>Límite de deuda (Bs)</label><input id="rLimit" type="number" min="0" value="${Number(regional.debt_limit||0)}"></div></div><div class="field"><label>Observaciones</label><textarea id="rNote">${esc(regional.notes||'')}</textarea></div><div class="stickyActions"><button class="btn block" id="saveRegionV750">Guardar ficha regional</button></div>`,(overlay,close)=>{
      $('#closeSheet',overlay).onclick=close;
      $('#saveRegionV750',overlay).onclick=async()=>{
        const button=$('#saveRegionV750',overlay); button.disabled=true; button.textContent='Guardando…';
        const row={ representative_user_id:userId,representative_name:profile.full_name||profile.email||'',region_name:$('#rRegion',overlay).value.trim(),city:$('#rCity',overlay).value.trim(),operational_status:$('#rStatus',overlay).value,monthly_goal:Number($('#rGoal',overlay).value||0),debt_limit:Number($('#rLimit',overlay).value||0),notes:$('#rNote',overlay).value.trim(),updated_by:currentUid() };
        const { error }=await client().from('representative_regional_profiles').upsert(row,{ onConflict:'representative_user_id' });
        if(error){button.disabled=false;button.textContent='Reintentar';return showToast(msg(error),'error');}
        close();showToast('Ficha regional actualizada.');await refreshAndPatchRegionalV771();
      };
    });
  }

  function openRestockRequestV750() {
    const products=(AppState.products||[]).filter(product=>product.status!=='archived');
    openSheet(`<h2>Solicitar reposición <span class="x" id="closeSheet">✕</span></h2><div class="field"><label>Producto</label><select id="rrProduct">${products.map(product=>`<option value="${product.id}">${esc(product.name)}</option>`).join('')}</select></div><div class="field"><label>Cantidad</label><input id="rrQty" type="number" min="1" value="1"></div><div class="field"><label>Prioridad</label><select id="rrPriority"><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div><div class="field"><label>Observación</label><textarea id="rrNote"></textarea></div><div class="stickyActions"><button class="btn block" id="saveRestockV750">Enviar solicitud</button></div>`,(overlay,close)=>{
      $('#closeSheet',overlay).onclick=close;
      $('#saveRestockV750',overlay).onclick=async()=>{
        const product=products.find(row=>row.id===$('#rrProduct',overlay).value); const quantity=Number($('#rrQty',overlay).value||0);
        if(!product||quantity<=0)return showToast('Selecciona producto y cantidad válida.','error');
        const row={ id:window.uid?uid('rr'):`rr_${Date.now()}`,request_code:`REP-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`,representative_user_id:currentUid(),representative_name:AppState.session.fullName||AppState.session.email||'',items:[{ productId:product.id,productName:product.name,quantity }],priority:$('#rrPriority',overlay).value,note:$('#rrNote',overlay).value.trim(),status:'pending',created_by:currentUid() };
        const { error }=await client().from('regional_restock_requests').insert(row);
        if(error)return showToast(msg(error),'error');
        close();showToast('Solicitud enviada.');await refreshAndPatchRegionalV771();
      };
    });
  }

  async function updateRestockStatusV750(id,status) {
    const { error }=await client().from('regional_restock_requests').update({ status,reviewed_by:currentUid(),reviewed_at:new Date().toISOString() }).eq('id',id);
    if(error)return showToast(msg(error),'error');
    showToast(status==='approved'?'Solicitud aprobada.':'Solicitud rechazada.');
    await refreshAndPatchRegionalV771();
  }

  function handleRegionalRealtimeV771() {
    clearTimeout(realtimeTimer);
    realtimeTimer=setTimeout(async()=>{
      try { await loadRegionalDataV750(); if(AppState.currentTab==='regional'&&!window.V7_FORM_DIRTY)patchRegionalV771(); }
      catch(error){console.warn('Realtime regional:',error);}
    },520);
  }

  Object.assign(window,{ renderRegionalManagementV750,loadRegionalDataV750,refreshRegionalV771:refreshAndPatchRegionalV771,handleRegionalRealtimeV771 });
})();
