/* NATURA VIDA V7.2.6 — base modular XD / matriz madre.
   Este archivo no reemplaza la app: introduce propiedad de datos, jerarquía y grupos por usuario.
   Regla central: cada dato debe tener dueño, creador, rol y alcance. */
(function(){
  function currentUserId(){ return AppState.session ? String(AppState.session.onlineUserId || AppState.session.userId || '') : ''; }
  function currentRole(){ return String((AppState.session && (AppState.session.roleName || AppState.session.role)) || '').toLowerCase(); }
  function isRep(){ return !window.isAdmin || !isAdmin(); }
  function normalizeGroup(g){
    if (!g) return g;
    if (!g.ownerUserId && !g.scope) {
      // Grupos antiguos: se consideran globales del administrador para no romper ventas previas.
      g.scope = 'global';
      g.ownerRole = 'admin';
    }
    return g;
  }
  function groupOwnerId(g){ return String((g && (g.ownerUserId || g.createdByUserId || g.owner_user_id)) || ''); }
  function isGlobalGroup(g){ g = normalizeGroup(g); return !g || g.scope === 'global' || g.scope === 'admin' || g.visibility === 'shared' || (!g.ownerUserId && !g.createdByUserId); }
  function isRepresentativeGroup(g, userId){
    g = normalizeGroup(g);
    const uid = String(userId || currentUserId());
    return Boolean(g && (g.scope === 'representative' || g.ownerRole === 'representative') && groupOwnerId(g) === uid);
  }
  function priceGroupsForCurrent(opts = {}){
    const uid = currentUserId();
    const rows = (AppState.priceGroups || []).map(g => normalizeGroup(Object.assign({}, g)));
    if (window.isAdmin && isAdmin()) {
      if (opts.onlyRepresentativeUserId) return rows.filter(g => isRepresentativeGroup(g, opts.onlyRepresentativeUserId));
      if (opts.all) return rows;
      // Gestión normal del administrador: solo grupos globales, no mezclados con grupos de representantes.
      return rows.filter(g => isGlobalGroup(g));
    }
    // Representante: administra y aplica solo sus propios grupos. No se mezclan con los globales.
    return rows.filter(g => isRepresentativeGroup(g, uid));
  }
  function priceGroupOptions(selectedId = '', opts = {}){
    const groups = priceGroupsForCurrent(opts);
    return groups.map(g => `<option value="${g.id}" ${selectedId === g.id ? 'selected' : ''}>${escapeHtml(g.name)} (${g.mode === 'discount' ? '−' : '+'}${Number(g.percent || 0)}%)</option>`).join('');
  }
  function findPriceGroup(id){
    const all = (AppState.priceGroups || []).map(g => normalizeGroup(g));
    return all.find(g => g.id === id) || null;
  }
  function prepareOwnedRecord(record, kind = 'generic'){
    const uid = currentUserId();
    const role = currentRole();
    const admin = window.isAdmin && isAdmin();
    const now = Date.now();
    return Object.assign({}, record, {
      ownerUserId: record.ownerUserId || uid,
      createdByUserId: record.createdByUserId || uid,
      ownerRole: record.ownerRole || (admin ? 'admin' : 'representative'),
      scope: record.scope || (admin ? 'global' : 'representative'),
      moduleKey: record.moduleKey || kind,
      region: record.region || (AppState.session && AppState.session.city) || '',
      createdAt: record.createdAt || now,
      updatedAt: now
    });
  }
  function dataOwnerLabel(row){
    if (!row) return 'Sin dueño';
    if (row.scope === 'global' || row.ownerRole === 'admin') return 'Global administrador';
    if (row.ownerRole === 'representative' || row.scope === 'representative') return 'Propio del representante';
    return 'Dato modular';
  }
  function moduleMatrixSummary(){
    return [
      ['clientes','ownerUserId, createdByUserId, customerType, GPS, foto, estado automático'],
      ['grupos','scope global o representative, ownerUserId, regla ganancia/descuento'],
      ['ventas','sellerId, clientId, precio original/final, saldo pendiente, origen'],
      ['stock','representante, producto, movimientos, saldo'],
      ['egresos','ownerUserId, categoría, rendimiento, costo unitario'],
      ['usuarios','jerarquía futura, módulos habilitables, región']
    ];
  }
  Object.assign(window, {
    nvCurrentUserId: currentUserId,
    nvCurrentRole: currentRole,
    nvNormalizeGroup: normalizeGroup,
    nvIsGlobalGroup: isGlobalGroup,
    nvIsRepresentativeGroup: isRepresentativeGroup,
    nvPriceGroupsForCurrent: priceGroupsForCurrent,
    nvPriceGroupOptions: priceGroupOptions,
    nvFindPriceGroup: findPriceGroup,
    nvPrepareOwnedRecord: prepareOwnedRecord,
    nvDataOwnerLabel: dataOwnerLabel,
    nvModuleMatrixSummary: moduleMatrixSummary
  });
})();
