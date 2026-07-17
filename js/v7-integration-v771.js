/* NATURA VIDA V7.7.1 — integración operativa, fotografías y actualizaciones silenciosas. */
(() => {
  const metricCache = new Map();
  let deliveryCache = [];
  let deliveryRefreshPromise = null;

  const sb = () => window.getSupabaseClient ? getSupabaseClient() : null;
  const currentUid = () => AppState.session?.onlineUserId || AppState.session?.userId || null;
  const esc = value => escapeHtml(String(value == null ? '' : value));
  const newId = prefix => window.uid ? uid(prefix) : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const errText = error => window.messageFromError ? messageFromError(error) : String(error?.message || error || 'Error');

  function profileAvatarUrlV771(profile = AppState.session || {}) {
    return String(profile.avatar_url || profile.avatarUrl || profile.photo_url || profile.photoUrl || '').trim();
  }

  function profileNameV771(profile = {}) {
    return String(profile.full_name || profile.fullName || profile.email || 'Usuario Natura Vida').trim();
  }

  function avatarMarkupV771(profile = {}, className = '') {
    const url = profileAvatarUrlV771(profile);
    const initial = profileNameV771(profile).charAt(0).toUpperCase() || 'N';
    return `<span class="nv771Avatar ${esc(className)}">${url ? `<img src="${esc(url)}" alt="Foto de ${esc(profileNameV771(profile))}" loading="lazy" decoding="async">` : `<b>${esc(initial)}</b>`}</span>`;
  }

  async function uploadMyAvatarV771(file) {
    try {
      if (!file) return { ok:false, message:'Selecciona una fotografía.' };
      if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type || '')) return { ok:false, message:'Usa una fotografía JPG, PNG o WEBP.' };
      if (file.size > 6 * 1024 * 1024) return { ok:false, message:'La fotografía supera 6 MB.' };
      if (!sb() || !currentUid()) return { ok:false, message:'La sesión no está disponible.' };
      const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg','jpg');
      const path = `${currentUid()}/avatar-current.${ext}`;
      const upload = await sb().storage.from('profile-assets').upload(path, file, { upsert:true, contentType:file.type, cacheControl:'86400' });
      if (upload.error) throw upload.error;
      const { data } = sb().storage.from('profile-assets').getPublicUrl(path);
      const url = data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : '';
      if (!url) throw new Error('No se obtuvo la dirección pública de la fotografía.');
      const saved = await sb().rpc('nv771_update_my_avatar', { p_avatar_url:url });
      if (saved.error) throw saved.error;
      AppState.session.avatarUrl = url;
      AppState.session.avatar_url = url;
      const own = (AppState.allProfiles || []).find(p => p.id === currentUid());
      if (own) own.avatar_url = url;
      window.dispatchEvent(new CustomEvent('nv:profile-avatar', { detail:{ url } }));
      return { ok:true, url, profile:saved.data };
    } catch (error) { return { ok:false, message:errText(error) }; }
  }

  async function removeMyAvatarV771() {
    try {
      if (!sb() || !currentUid()) return { ok:false, message:'La sesión no está disponible.' };
      const saved = await sb().rpc('nv771_update_my_avatar', { p_avatar_url:'' });
      if (saved.error) throw saved.error;
      const list = await sb().storage.from('profile-assets').list(currentUid(), { limit:20 });
      if (!list.error && list.data?.length) {
        const paths = list.data.filter(x => /^avatar-current\./.test(x.name)).map(x => `${currentUid()}/${x.name}`);
        if (paths.length) await sb().storage.from('profile-assets').remove(paths);
      }
      AppState.session.avatarUrl = '';
      AppState.session.avatar_url = '';
      const own = (AppState.allProfiles || []).find(p => p.id === currentUid());
      if (own) own.avatar_url = '';
      window.dispatchEvent(new CustomEvent('nv:profile-avatar', { detail:{ url:'' } }));
      return { ok:true };
    } catch (error) { return { ok:false, message:errText(error) }; }
  }

  function normalizeDeliveryRequestV771(row = {}) {
    return {
      ...row,
      items: Array.isArray(row.items) ? row.items : [],
      amount_due: Number(row.amount_due || 0),
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude)
    };
  }

  async function fetchDeliveryRequestsV771(options = {}) {
    if (deliveryRefreshPromise) return deliveryRefreshPromise;
    deliveryRefreshPromise = (async () => {
      if (!sb()) return { ok:false, message:'Supabase no está disponible.', requests:deliveryCache };
      let query = sb().from('delivery_requests').select('*').order('requested_date', { ascending:true, nullsFirst:false }).order('created_at', { ascending:false }).limit(options.limit || 500);
      if (options.status) query = query.eq('status', options.status);
      const { data, error } = await query;
      if (error) return { ok:false, message:errText(error), requests:deliveryCache };
      deliveryCache = (data || []).map(normalizeDeliveryRequestV771);
      return { ok:true, requests:deliveryCache };
    })();
    try { return await deliveryRefreshPromise; }
    finally { deliveryRefreshPromise = null; }
  }

  function deliveryRequestPayloadFromSaleV771(sale = {}, client = {}, options = {}) {
    const owner = sale.sellerId || currentUid();
    return {
      id:`dreq_sale_${String(sale.id)}`, source_type:'sale', source_id:String(sale.id), source_code:String(sale.documentNumber || sale.receiptNumber || ''),
      owner_user_id:owner, responsible_user_id:owner,
      client_id:sale.clientId || client.id || null,
      client_name:sale.clientName || client.name || '', client_phone:sale.clientPhone || client.phone || '',
      address:options.address || sale.clientAddress || client.address || '', location_label:options.locationLabel || client.locationLabel || '',
      latitude:options.latitude ?? client.latitude ?? null, longitude:options.longitude ?? client.longitude ?? null,
      amount_due:Number(sale.pendingBalance || 0), items:Array.isArray(sale.items) ? sale.items : [],
      requested_date:options.requestedDate || new Date().toISOString().slice(0,10), priority:options.priority || 'normal',
      status:'pending', notes:options.notes || '', created_by:currentUid(), updated_by:currentUid()
    };
  }

  async function findDeliveryRequestBySourceV771(sourceType, sourceId) {
    const { data, error } = await sb().from('delivery_requests').select('*').eq('source_type', sourceType).eq('source_id', String(sourceId)).maybeSingle();
    if (error) throw error;
    return data ? normalizeDeliveryRequestV771(data) : null;
  }

  async function createDeliveryRequestFromSaleV771(sale, client, options = {}) {
    try {
      if (!sale?.id || !sb()) return { ok:false, message:'La venta o Supabase no están disponibles.' };
      const existing = await findDeliveryRequestBySourceV771('sale', sale.id);
      if (existing) return { ok:true, request:existing, existing:true };
      const row = deliveryRequestPayloadFromSaleV771(sale, client, options);
      const { data, error } = await sb().from('delivery_requests').insert(row).select().single();
      if (error) {
        if (String(error.code || '') === '23505') {
          const concurrent = await findDeliveryRequestBySourceV771('sale', sale.id);
          if (concurrent) return { ok:true, request:concurrent, existing:true };
        }
        throw error;
      }
      return { ok:true, request:normalizeDeliveryRequestV771(data), existing:false };
    } catch (error) { return { ok:false, message:errText(error) }; }
  }

  function orderItemsV771(order = {}) {
    return Array.isArray(order.items) ? order.items : Array.isArray(order.payload?.items) ? order.payload.items : [];
  }

  async function ensureDeliveryRequestFromOrderV771(order = {}, options = {}) {
    try {
      if (!order.id || !sb()) return { ok:false, message:'El pedido no está disponible.' };
      const existing = await findDeliveryRequestBySourceV771('order', order.id);
      if (existing) return { ok:true, request:existing, existing:true };
      const repId = order.representativeId || order.representative_user_id || options.representativeUserId || currentUid();
      const row = {
        id:`dreq_order_${String(order.id)}`, source_type:'order', source_id:String(order.id), source_code:String(order.orderNumber || order.order_number || ''),
        owner_user_id:repId, responsible_user_id:repId,
        client_id:null, client_name:order.representativeName || order.representative_name || 'Representante',
        client_phone:order.representativePhone || order.phone || '', address:order.address || order.representativeAddress || '',
        location_label:order.city || order.representativeCity || '', latitude:order.latitude ?? null, longitude:order.longitude ?? null,
        amount_due:0, items:orderItemsV771(order), requested_date:options.requestedDate || new Date().toISOString().slice(0,10),
        priority:options.priority || 'normal', status:'pending', notes:options.notes || order.note || 'Entrega de pedido de representante',
        created_by:currentUid(), updated_by:currentUid()
      };
      const { data, error } = await sb().from('delivery_requests').insert(row).select().single();
      if (error) {
        if (String(error.code || '') === '23505') {
          const concurrent = await findDeliveryRequestBySourceV771('order', order.id);
          if (concurrent) return { ok:true, request:concurrent, existing:true };
        }
        throw error;
      }
      return { ok:true, request:normalizeDeliveryRequestV771(data), existing:false };
    } catch (error) { return { ok:false, message:errText(error) }; }
  }

  async function planDeliveryRequestsV771(requestIds = [], route = {}) {
    try {
      if (!requestIds.length) return { ok:false, message:'Selecciona al menos una entrega.' };
      const { data, error } = await sb().rpc('nv771_plan_delivery_requests', {
        p_request_ids:requestIds,
        p_route_name:String(route.name || 'Ruta de entregas'),
        p_route_date:route.date || new Date().toISOString().slice(0,10),
        p_representative_user_id:route.representativeUserId || currentUid(),
        p_driver_user_id:route.driverUserId || route.representativeUserId || currentUid(),
        p_driver_name:String(route.driverName || AppState.session?.fullName || ''),
        p_notes:String(route.notes || '')
      });
      if (error) throw error;
      await fetchDeliveryRequestsV771();
      return { ok:true, ...(data || {}) };
    } catch (error) { return { ok:false, message:errText(error) }; }
  }

  async function hydrateRepresentativeCardsStableV771(profiles = AppState.allProfiles || []) {
    if (!window.isAdmin || !isAdmin()) return;
    const reps = profiles.filter(p => String(p.role || '').toLowerCase() !== 'administrador');
    // Conserva el valor anterior: nunca vuelve visualmente a “Cargando…”.
    reps.forEach(p => {
      const cached = metricCache.get(p.id);
      if (!cached) return;
      const unitsEl = document.querySelector(`[data-rep-stock-units="${p.id}"]`);
      const salesEl = document.querySelector(`[data-rep-sales-total="${p.id}"]`);
      const activityEl = document.querySelector(`[data-rep-last-activity="${p.id}"]`);
      if (unitsEl) unitsEl.textContent = cached.units;
      if (salesEl) salesEl.textContent = cached.sales;
      if (activityEl) activityEl.textContent = cached.activity;
    });
    try {
      const client = await requireClient();
      const { data, error } = await client.from('representative_stock').select('representative_user_id,stock,acquisition_cost,updated_at');
      if (error) throw error;
      const map = new Map();
      (data || []).forEach(r => {
        const row = map.get(r.representative_user_id) || { units:0, value:0, last:0 };
        row.units += Number(r.stock || 0);
        row.value += Number(r.stock || 0) * Number(r.acquisition_cost || 0);
        row.last = Math.max(row.last, r.updated_at ? new Date(r.updated_at).getTime() : 0);
        map.set(r.representative_user_id,row);
      });
      reps.forEach(p => {
        const row = map.get(p.id) || { units:0,value:0,last:0 };
        const sales = window.repSalesV730 ? repSalesV730(p.id) : (AppState.sales || []).filter(s => s.sellerId === p.id);
        const values = {
          units:`${row.units} u. · ${fmtMoney(row.value)}`,
          sales:`${sales.length} venta(s) · ${fmtMoney(sales.reduce((sum,x)=>sum+Number(x.total||0),0))}`,
          activity:row.last ? fmtDate(row.last) : (sales.length ? fmtDate(Math.max(...sales.map(s=>Number(s.date||0)))) : 'Sin actividad')
        };
        metricCache.set(p.id,values);
        const unitsEl = document.querySelector(`[data-rep-stock-units="${p.id}"]`);
        const salesEl = document.querySelector(`[data-rep-sales-total="${p.id}"]`);
        const activityEl = document.querySelector(`[data-rep-last-activity="${p.id}"]`);
        if (unitsEl) unitsEl.textContent = values.units;
        if (salesEl) salesEl.textContent = values.sales;
        if (activityEl) activityEl.textContent = values.activity;
      });
    } catch (error) { console.warn('Métricas silenciosas de representantes:', error); }
  }

  function cachedRepresentativeMetricV771(userId, field, fallback='—') {
    return metricCache.get(userId)?.[field] || fallback;
  }

  Object.assign(window, {
    profileAvatarUrlV771, avatarMarkupV771, uploadMyAvatarV771, removeMyAvatarV771,
    fetchDeliveryRequestsV771, createDeliveryRequestFromSaleV771, ensureDeliveryRequestFromOrderV771, planDeliveryRequestsV771,
    hydrateRepresentativeCardsV730:hydrateRepresentativeCardsStableV771,
    cachedRepresentativeMetricV771,
    getDeliveryRequestCacheV771:() => deliveryCache.slice()
  });
})();
