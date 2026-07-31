/* NATURA VIDA V8.0.1 — estabilización transversal, negocio visible y parches silenciosos. */
(() => {
  const currentUid = () => AppState.session?.onlineUserId || AppState.session?.userId || '';
  const profileById = id => (AppState.allProfiles || AppState.manageableProfiles || []).find(p => p.id === id) || null;

  function profileManagedByCurrentV801(userId) {
    const uid = currentUid();
    if (!uid || !userId) return false;
    const p = profileById(userId);
    return Boolean(p && (p.manager_user_id === uid || p.managerUserId === uid));
  }

  function saleVisibleToCurrentBusinessV801(sale = {}) {
    if (!sale || sale.deletedAt || sale.deleted_at) return false;
    if (isAdmin()) return true;
    const uid = currentUid();
    const sellerId = sale.sellerId || sale.seller_id || '';
    const stockOwner = sale.stockOwnerUserId || sale.stock_owner_user_id || sale.ownerUserId || sale.owner_user_id || '';
    if (sellerId === uid || stockOwner === uid) return true;
    if (window.canManageTeamV800 && canManageTeamV800()) {
      if (profileManagedByCurrentV801(sellerId)) return true;
      if (stockOwner && profileManagedByCurrentV801(stockOwner)) return true;
    }
    return false;
  }

  function businessSalesV801(userId = currentUid()) {
    return (AppState.sales || []).filter(s => {
      if (s.deletedAt || s.deleted_at) return false;
      const sellerId = s.sellerId || s.seller_id || '';
      const stockOwner = s.stockOwnerUserId || s.stock_owner_user_id || s.ownerUserId || s.owner_user_id || '';
      return sellerId === userId || stockOwner === userId;
    });
  }

  function callQuiet(fn, ...args) {
    if (typeof fn !== 'function') return false;
    Promise.resolve().then(() => fn(...args)).catch(error => console.warn('Actualización silenciosa V8.0.1:', error));
    return true;
  }

  function nv801PatchCurrentView(context = {}) {
    if (window.V7_FORM_DIRTY) return true;
    switch (AppState.currentTab) {
      case 'territorio':
        return window.nv801PatchTerritoryView ? nv801PatchTerritoryView(context) : false;
      case 'regional':
        return callQuiet(window.refreshRegionalV771);
      case 'distribucion':
        // El propio módulo conserva ruta, mapa, desplazamiento y valores visibles.
        return callQuiet(window.refreshAndPatchV770 || window.refreshDistributionV760);
      case 'personal':
        return callQuiet(async () => {
          await refreshWorkforceV770({ quiet: true });
          if (window.patchWorkforceV771) patchWorkforceV771();
        });
      case 'puntos-stock':
        return callQuiet(window.refreshLinkedStockV801);
      case 'roles-estructura':
        return callQuiet(async () => {
          if (window.syncV8ContextV800) await syncV8ContextV800();
          if (window.patchRolesStructureV801) patchRolesStructureV801();
        });
      case 'usuarios':
        return callQuiet(async () => {
          if (window.syncV8ContextV800) await syncV8ContextV800();
          if (window.hydrateRepresentativeCardsV730) hydrateRepresentativeCardsV730(AppState.allProfiles || []);
        });
      default:
        return false;
    }
  }

  Object.assign(window, {
    saleVisibleToCurrentBusinessV801,
    businessSalesV801,
    profileManagedByCurrentV801,
    nv801PatchCurrentView
  });
})();
