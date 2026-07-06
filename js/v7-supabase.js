/* NATURA VIDA V7 — funciones Supabase adicionales.
   Supabase continúa siendo la única fuente persistente. */

(() => {
  const originalSyncAfterLogin = window.syncAfterLogin;
  const originalRunBackgroundSyncOnce = window.runBackgroundSyncOnce;
  const originalSetCloudConnectionState = window.setCloudConnectionState;
  let v7Channel = null;
  let v7RefreshTimer = null;

  AppState.commercialProfiles = AppState.commercialProfiles || [];
  AppState.profileChangeRequests = AppState.profileChangeRequests || [];
  AppState.allProfiles = AppState.allProfiles || [];

  function v7Error(error, fallback = 'No se pudo completar la operación.') {
    if (window.messageFromError) return messageFromError(error, fallback);
    return String((error && error.message) || error || fallback);
  }

  function mapCommercialProfile(row = {}) {
    return {
      userId: row.user_id,
      businessName: row.business_name || '',
      address: row.address || '',
      locationLabel: row.location_label || '',
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      receiptMessage: row.receipt_message || '',
      qrUrl: row.qr_url || '',
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
    };
  }

  function myCommercialProfile() {
    const id = AppState.session && AppState.session.onlineUserId;
    return AppState.commercialProfiles.find(p => p.userId === id) || {
      userId: id,
      businessName: '', address: '', locationLabel: '', latitude: null,
      longitude: null, receiptMessage: '', qrUrl: ''
    };
  }

  function commercialProfileFor(userId) {
    return AppState.commercialProfiles.find(p => p.userId === userId) || null;
  }

  async function fetchCommercialProfilesV7() {
    const sb = await requireClient();
    const { data, error } = await sb.from('commercial_profiles').select('*').order('updated_at', { ascending: false });
    if (error) return { ok: false, message: v7Error(error) };
    AppState.commercialProfiles = (data || []).map(mapCommercialProfile);
    return { ok: true, profiles: AppState.commercialProfiles };
  }

  async function fetchProfileChangeRequestsV7() {
    const sb = await requireClient();
    const { data, error } = await sb.from('profile_change_requests').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return { ok: false, message: v7Error(error) };
    AppState.profileChangeRequests = (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      fieldName: row.field_name,
      oldValue: row.old_value || '',
      newValue: row.new_value || '',
      status: row.status || 'pending',
      reviewedBy: row.reviewed_by || null,
      reviewNote: row.review_note || '',
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : null
    }));
    return { ok: true, requests: AppState.profileChangeRequests };
  }

  async function fetchAllProfilesV7() {
    if (!isAdmin()) return { ok: true, profiles: [] };
    const res = await fetchAllProfilesForAdmin();
    if (res && res.ok) AppState.allProfiles = res.profiles || [];
    return res;
  }

  async function syncV7Context() {
    const tasks = [fetchCommercialProfilesV7(), fetchProfileChangeRequestsV7()];
    if (isAdmin()) tasks.push(fetchAllProfilesV7());
    const results = await Promise.all(tasks.map(p => Promise.resolve(p).catch(error => ({ ok: false, message: v7Error(error) }))));
    try {
      const sb = await requireClient();
      const { data } = await sb.from('profiles').select('*').eq('id', AppState.session.onlineUserId).maybeSingle();
      if (data && AppState.session) {
        AppState.session.discountPercent = Number(data.representative_discount_percent || 0);
        AppState.session.phone = data.phone || AppState.session.phone || '';
        AppState.session.city = data.city || AppState.session.city || '';
        AppState.session.fullName = data.full_name || AppState.session.fullName;
      }
    } catch (_) {}
    const failed = results.find(r => r && r.ok === false);
    return failed || { ok: true };
  }

  async function saveCommercialProfileV7(profile = {}) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('update_my_commercial_profile_v7', {
        p_business_name: String(profile.businessName || ''),
        p_address: String(profile.address || ''),
        p_location_label: String(profile.locationLabel || ''),
        p_latitude: profile.latitude === '' || profile.latitude == null ? null : Number(profile.latitude),
        p_longitude: profile.longitude === '' || profile.longitude == null ? null : Number(profile.longitude),
        p_receipt_message: String(profile.receiptMessage || ''),
        p_qr_url: String(profile.qrUrl || '')
      });
      if (error) return { ok: false, message: v7Error(error) };
      await fetchCommercialProfilesV7();
      return { ok: true, profile: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function uploadPaymentQrV7(dataUrl) {
    try {
      if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return { ok: false, message: 'Selecciona y recorta primero una imagen QR.' };
      const sb = await requireClient();
      const userId = AppState.session && AppState.session.onlineUserId;
      if (!userId) return { ok: false, message: 'La sesión no está activa.' };
      const blob = dataUrlToBlob(dataUrl);
      const path = `${userId}/qr-current.jpg`;
      const { error } = await sb.storage.from('payment-assets').upload(path, blob, {
        upsert: true,
        contentType: 'image/jpeg',
        cacheControl: '0'
      });
      if (error) return { ok: false, message: v7Error(error) };
      const { data } = sb.storage.from('payment-assets').getPublicUrl(path);
      if (!data || !data.publicUrl) return { ok: false, message: 'No se obtuvo la dirección pública del QR.' };
      return { ok: true, url: `${data.publicUrl}?v=${Date.now()}` };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function requestProfileChangeV7(fieldName, newValue) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('request_profile_change_v7', {
        p_field_name: String(fieldName || ''),
        p_new_value: String(newValue || '')
      });
      if (error) return { ok: false, message: v7Error(error) };
      await fetchProfileChangeRequestsV7();
      return { ok: true, request: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function reviewProfileChangeV7(requestId, decision, note = '') {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('admin_review_profile_change_v7', {
        p_request_id: String(requestId),
        p_decision: String(decision),
        p_note: String(note || '')
      });
      if (error) return { ok: false, message: v7Error(error) };
      await Promise.all([fetchProfileChangeRequestsV7(), fetchAllProfilesV7()]);
      return { ok: true, request: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  function mapV7OrderRow(row = {}) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    return Object.assign({}, payload, {
      id: row.id,
      orderNumber: row.order_number || payload.orderNumber || '',
      receiptNumber: row.receipt_number || payload.receiptNumber || '',
      source: row.source || payload.source || 'representative',
      representativeId: row.representative_user_id,
      representativeName: row.representative_name || payload.representativeName || '',
      status: row.status || payload.status || 'submitted',
      paymentStatus: row.payment_status || payload.paymentStatus || 'pending',
      total: Number(row.total || payload.total || 0),
      note: row.note || payload.note || '',
      createdAt: row.created_at ? new Date(row.created_at).getTime() : (payload.createdAt || Date.now()),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : (payload.updatedAt || Date.now()),
      approvedAt: row.approved_at ? new Date(row.approved_at).getTime() : (payload.approvedAt || null),
      paidAt: row.paid_at ? new Date(row.paid_at).getTime() : (payload.paidAt || null),
      syncStatus: 'cloud'
    });
  }

  async function fetchCloudPurchaseOrdersV7() {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(300);
      if (error) return { ok: false, message: v7Error(error) };
      return { ok: true, orders: (data || []).map(mapV7OrderRow) };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function refreshOrdersV7() {
    const res = await fetchCloudPurchaseOrdersV7();
    if (!res.ok) return res;
    await DB.clear('purchaseOrders');
    if (res.orders.length) await DB.bulkPut('purchaseOrders', res.orders, { silent: true });
    return res;
  }

  async function createPurchaseOrderV7(order) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('create_purchase_order_v7', { p_order: order });
      if (error) return { ok: false, message: v7Error(error) };
      await refreshOrdersV7();
      return { ok: true, order: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function adminCreateDirectOrderV7(representativeUserId, order) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('admin_create_direct_order_v7', {
        p_representative_user_id: representativeUserId,
        p_order: order
      });
      if (error) return { ok: false, message: v7Error(error) };
      await refreshOrdersV7();
      return { ok: true, order: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function adminUpdateOrderV7(orderId, order) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('admin_update_purchase_order_v7', {
        p_order_id: String(orderId),
        p_order: order
      });
      if (error) return { ok: false, message: v7Error(error) };
      await refreshOrdersV7();
      return { ok: true, order: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function adminApproveOrderV7(orderId) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('admin_approve_purchase_order_v7', { p_order_id: String(orderId) });
      if (error) return { ok: false, message: v7Error(error) };
      await refreshOrdersV7();
      return { ok: true, order: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function adminConfirmOrderPaymentV7(orderId) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('admin_confirm_order_payment_v7', { p_order_id: String(orderId) });
      if (error) return { ok: false, message: v7Error(error) };
      await Promise.all([refreshOrdersV7(), syncCloudProductsToLocal()]);
      return { ok: true, order: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function cancelPurchaseOrderV7(orderId) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('cancel_purchase_order_v7', { p_order_id: String(orderId) });
      if (error) return { ok: false, message: v7Error(error) };
      await refreshOrdersV7();
      return { ok: true, order: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }


  async function representativeUpdateOrderV7(orderId, order) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('representative_update_purchase_order_v7', {
        p_order_id: String(orderId),
        p_order: order
      });
      if (error) return { ok: false, message: v7Error(error) };
      await refreshOrdersV7();
      return { ok: true, order: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function setRepresentativeDiscountV7(userId, percent) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('admin_set_representative_discount_v7', {
        p_user_id: userId,
        p_percent: Number(percent || 0)
      });
      if (error) return { ok: false, message: v7Error(error) };
      await fetchAllProfilesV7();
      return { ok: true, profile: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function adminUpdateProfileNameV7(userId, fullName) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('admin_update_profile_name_v7', {
        p_user_id: userId,
        p_full_name: String(fullName || '')
      });
      if (error) return { ok: false, message: v7Error(error) };
      await fetchAllProfilesV7();
      return { ok: true, profile: data };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function nextDocumentNumberV7(prefix) {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('next_document_number_v7', { p_prefix: String(prefix || 'NV-DOC') });
      return error ? { ok: false, message: v7Error(error) } : { ok: true, number: String(data || '') };
    } catch (error) { return { ok: false, message: v7Error(error) }; }
  }

  async function activeRepresentativesV7() {
    const res = await fetchAllProfilesV7();
    if (!res || !res.ok) return [];
    return (res.profiles || []).filter(p => String(p.role || '').toLowerCase() !== 'administrador' && String(p.status || '').toLowerCase() === 'activo');
  }

  function stopV7Realtime() {
    clearTimeout(v7RefreshTimer);
    const sb = getSupabaseClient();
    if (sb && v7Channel) sb.removeChannel(v7Channel).catch(() => {});
    v7Channel = null;
  }

  function scheduleV7Refresh() {
    clearTimeout(v7RefreshTimer);
    v7RefreshTimer = setTimeout(async () => {
      await syncV7Context().catch(() => {});
      if (window.render && !window.V7_FORM_DIRTY) render();
    }, 220);
  }

  function startV7Realtime() {
    // V7.1.1: commercial_profiles y profile_change_requests ya forman parte
    // del canal Realtime principal. Se evita abrir un segundo canal duplicado.
    return true;
  }

  async function syncAfterLoginV7() {
    const base = originalSyncAfterLogin ? await originalSyncAfterLogin() : { ok: true };
    await syncV7Context();
    return base;
  }

  async function runBackgroundSyncV7(reason = 'automatic') {
    const base = originalRunBackgroundSyncOnce ? await originalRunBackgroundSyncOnce(reason) : { ok: true };
    await syncV7Context();
    return base;
  }

  // Evita que el indicador cambie a “Conectando” por cada lectura o guardado.
  window.setCloudConnectionState = function v7ConnectionState(state, detail = '') {
    const current = window.CloudConnection || { state: navigator.onLine ? 'connecting' : 'offline' };
    const importantConnecting = /reconect|internet recuperado|abriendo realtime|inicio de sesión|verificando acceso|creando cuenta/i.test(String(detail));
    if (state === 'connecting' && current.state === 'online' && navigator.onLine && !importantConnecting) {
      current.detail = detail || 'Actualizando datos';
      current.updatedAt = Date.now();
      window.dispatchEvent(new CustomEvent('nv:connection', { detail: Object.assign({}, current) }));
      return;
    }
    return originalSetCloudConnectionState ? originalSetCloudConnectionState(state, detail) : undefined;
  };

  Object.assign(window, {
    myCommercialProfile,
    commercialProfileFor,
    fetchCommercialProfilesV7,
    fetchProfileChangeRequestsV7,
    fetchAllProfilesV7,
    syncV7Context,
    saveCommercialProfileV7,
    uploadPaymentQrV7,
    requestProfileChangeV7,
    reviewProfileChangeV7,
    mapV7OrderRow,
    fetchCloudPurchaseOrders: fetchCloudPurchaseOrdersV7,
    fetchCloudPurchaseOrdersV7,
    refreshOrdersV7,
    createPurchaseOrderV7,
    adminCreateDirectOrderV7,
    adminUpdateOrderV7,
    adminApproveOrderV7,
    adminConfirmOrderPaymentV7,
    cancelPurchaseOrderV7,
    representativeUpdateOrderV7,
    setRepresentativeDiscountV7,
    adminUpdateProfileNameV7,
    nextDocumentNumberV7,
    activeRepresentativesV7,
    startV7Realtime,
    stopV7Realtime,
    syncAfterLogin: syncAfterLoginV7,
    runBackgroundSyncOnce: runBackgroundSyncV7
  });
})();
