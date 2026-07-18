/* NATURA VIDA V8.0.1 XD — núcleo de roles, jerarquía y contexto modular. */
(() => {
  AppState.roleCatalog = AppState.roleCatalog || [];
  AppState.manageableProfiles = AppState.manageableProfiles || [];

  const esc = value => window.escapeHtml ? escapeHtml(String(value ?? '')) : String(value ?? '');
  const ROLE_FALLBACK = window.ROLE_DEFINITIONS_V800 || {};

  function roleCatalogItemV800(code) {
    const row = (AppState.roleCatalog || []).find(item => item.roleCode === code);
    if (row) return row;
    const fallback = ROLE_FALLBACK[code] || ROLE_FALLBACK.commercial_representative || {};
    return {
      roleCode: code || 'commercial_representative',
      roleName: fallback.name || 'Representante comercial',
      shortName: fallback.short || 'Representante',
      summary: fallback.summary || '',
      level: Number(fallback.level || 0),
      canSell: (fallback.permissions || []).includes('sales:create'),
      canHoldStock: ['central_admin','regional_admin','regional_advanced','commercial_representative'].includes(code),
      canBuy: ['central_admin','regional_admin','regional_advanced','commercial_representative'].includes(code),
      canManageTeam: ['central_admin','regional_admin','regional_advanced'].includes(code),
      canManageRegion: ['central_admin','regional_admin','regional_advanced'].includes(code),
      canSupplyTeam: code === 'central_admin',
      assignable: !['production','inventory','finance'].includes(code),
      tools: []
    };
  }

  function roleNameV800(code) { return roleCatalogItemV800(code).roleName; }
  function roleShortNameV800(code) { return roleCatalogItemV800(code).shortName; }
  function roleSummaryV800(code) { return roleCatalogItemV800(code).summary; }
  function roleToolsV800(code) { return roleCatalogItemV800(code).tools || []; }
  function currentCommercialRoleV800() { return AppState.session?.commercialRole || (isAdmin() ? 'central_admin' : 'commercial_representative'); }

  function mapRoleRowV800(row = {}) {
    return {
      roleCode: row.role_code,
      roleName: row.role_name || '',
      shortName: row.short_name || '',
      summary: row.summary || '',
      level: Number(row.hierarchy_level || 0),
      canSell: !!row.can_sell,
      canHoldStock: !!row.can_hold_stock,
      canBuy: !!row.can_buy,
      canManageTeam: !!row.can_manage_team,
      canManageRegion: !!row.can_manage_region,
      canSupplyTeam: !!row.can_supply_team,
      assignable: row.assignable !== false,
      tools: Array.isArray(row.tools) ? row.tools : [],
      active: row.active !== false
    };
  }

  function mapManageableProfileV800(row = {}) {
    return {
      id: row.id,
      full_name: row.full_name || '',
      email: row.email || '',
      phone: row.phone || '',
      city: row.city || '',
      status: row.status || 'pendiente',
      avatar_url: row.avatar_url || '',
      role: row.legacy_role || row.role || 'representante',
      commercial_role: row.commercial_role || 'commercial_representative',
      region_name: row.region_name || row.city || '',
      manager_user_id: row.manager_user_id || null,
      supplier_user_id: row.supplier_user_id || null,
      stock_owner_user_id: row.stock_owner_user_id || null,
      stock_point_id: row.stock_point_id || null,
      operation_city: row.operation_city || row.city || '',
      seller_can_collect: !!row.seller_can_collect,
      role_assigned_at: row.role_assigned_at || null,
      role_note: row.role_note || ''
    };
  }

  async function fetchRoleCatalogV800() {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.from('business_roles').select('*').eq('active', true).order('hierarchy_level', { ascending: false });
      if (error) return { ok: false, message: messageFromError(error) };
      AppState.roleCatalog = (data || []).map(mapRoleRowV800);
      return { ok: true, roles: AppState.roleCatalog };
    } catch (error) { return { ok: false, message: messageFromError(error) }; }
  }

  async function fetchManageableProfilesV800() {
    try {
      const sb = await requireClient();
      const { data, error } = await sb.rpc('nv801_list_manageable_profiles');
      if (error) return { ok: false, message: messageFromError(error) };
      AppState.manageableProfiles = (data || []).map(mapManageableProfileV800);
      return { ok: true, profiles: AppState.manageableProfiles };
    } catch (error) { return { ok: false, message: messageFromError(error) }; }
  }

  async function syncV8ContextV800() {
    const results = await Promise.all([fetchRoleCatalogV800(), fetchManageableProfilesV800()]);
    const failed = results.find(result => !result.ok);
    return failed || { ok: true };
  }

  function profileNameV800(userId) {
    if (!userId) return '';
    const row = (AppState.manageableProfiles || []).find(profile => profile.id === userId)
      || (AppState.allProfiles || []).find(profile => profile.id === userId);
    return row ? (row.full_name || row.email || '') : '';
  }

  function roleCapabilityPillsV800(roleCode) {
    const role = roleCatalogItemV800(roleCode);
    const pills = [];
    if (role.canSell) pills.push('Puede vender');
    if (role.canHoldStock) pills.push('Stock propio');
    if (role.canBuy) pills.push('Puede pedir');
    if (role.canManageTeam) pills.push('Gestiona equipo');
    if (role.canManageRegion) pills.push('Control regional');
    if (role.canSupplyTeam) pills.push('Puede abastecer');
    if (roleCode === 'field_seller') { pills.push('Stock vinculado'); pills.push('Inventario solo lectura'); }
    return pills.map(text => `<span>${esc(text)}</span>`).join('');
  }

  function roleSummaryCardV800(profile = AppState.session || {}, options = {}) {
    const roleCode = profile.commercial_role || profile.commercialRole || currentCommercialRoleV800();
    const role = roleCatalogItemV800(roleCode);
    const managerId = profile.manager_user_id || profile.managerUserId;
    const supplierId = profile.supplier_user_id || profile.supplierUserId;
    const region = profile.region_name || profile.regionName || profile.city || 'Sin región asignada';
    const manager = profileNameV800(managerId) || (roleCode === 'central_admin' ? 'No aplica' : 'Administración central');
    const supplier = profileNameV800(supplierId) || (roleCode === 'central_admin' ? 'No aplica' : 'Stock central Natura Vida');
    const stockOwnerId = profile.stock_owner_user_id || profile.stockOwnerUserId;
    const stockOwner = profileNameV800(stockOwnerId) || (roleCode === 'field_seller' ? 'Pendiente de asignación' : 'No aplica');
    const stockPoint = profile.stock_point_id || profile.stockPointId || '';
    const tools = role.tools || [];
    return `<article class="v800RoleSummary ${options.compact ? 'compact' : ''}">
      <div class="v800RoleSummaryTop"><span class="v800RoleSeal">${esc((role.shortName || role.roleName || 'NV').split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase())}</span><div><small>Función asignada</small><h3>${esc(role.roleName)}</h3><p>${esc(role.summary)}</p></div></div>
      <div class="v800RolePills">${roleCapabilityPillsV800(roleCode)}</div>
      <dl class="v800RoleMeta"><div><dt>Región</dt><dd>${esc(region)}</dd></div><div><dt>Responsable</dt><dd>${esc(manager)}</dd></div><div><dt>Proveedor asignado</dt><dd>${esc(supplier)}</dd></div>${roleCode==='field_seller'?`<div><dt>Stock de trabajo</dt><dd>${esc(stockOwner)}</dd></div><div><dt>Punto de venta</dt><dd>${esc(stockPoint||'Stock general del responsable')}</dd></div>`:''}</dl>
      ${tools.length ? `<div class="v800RoleTools"><strong>Herramientas de este perfil</strong><div>${tools.slice(0, options.compact ? 5 : 12).map(tool=>`<span>${esc(tool)}</span>`).join('')}</div></div>` : ''}
    </article>`;
  }

  function canOpenRolesV800() { return isAdmin() || (window.canManageTeamV800 && canManageTeamV800()); }

  Object.assign(window, {
    roleCatalogItemV800, roleNameV800, roleShortNameV800, roleSummaryV800, roleToolsV800,
    currentCommercialRoleV800, fetchRoleCatalogV800, fetchManageableProfilesV800, syncV8ContextV800,
    profileNameV800, roleCapabilityPillsV800, roleSummaryCardV800, canOpenRolesV800
  });
})();
