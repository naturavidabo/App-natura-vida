/* NATURA VIDA V8.0.1 — administración de roles y estructura funcional. */
(() => {
  const esc = value => escapeHtml(String(value ?? ''));
  const currentUserId = () => AppState.session?.onlineUserId || AppState.session?.userId || '';
  const activeProfiles = () => (AppState.manageableProfiles || []).filter(profile => String(profile.status || '').toLowerCase() === 'activo');

  function statusMetaV800(status) {
    const value = String(status || 'pendiente').toLowerCase();
    if (value === 'activo') return ['Activo','success'];
    if (value === 'bloqueado') return ['Bloqueado','danger'];
    return ['Pendiente','warning'];
  }

  function profileCardV800(profile) {
    const [statusLabel,statusTone] = statusMetaV800(profile.status);
    const role = roleCatalogItemV800(profile.commercial_role);
    const manager = profileNameV800(profile.manager_user_id) || (profile.commercial_role === 'central_admin' ? 'No aplica' : 'Administración central');
    const supplier = profileNameV800(profile.supplier_user_id) || (profile.commercial_role === 'central_admin' ? 'No aplica' : 'Stock central Natura Vida');
    const stockOwner = profileNameV800(profile.stock_owner_user_id) || (profile.commercial_role === 'field_seller' ? 'Pendiente de asignación' : 'No aplica');
    const self = profile.id === currentUserId();
    const canEdit = canOpenRolesV800() && !self && (isAdmin() || profile.manager_user_id === currentUserId());
    return `<article class="v800UserRoleCard" data-user-id="${esc(profile.id)}">
      <div class="v800UserRoleHead">
        ${window.avatarMarkupV771 ? avatarMarkupV771(profile,'representative') : `<span class="v7Avatar">${esc((profile.full_name||profile.email||'U').charAt(0).toUpperCase())}</span>`}
        <div><strong>${esc(profile.full_name || 'Sin nombre')}</strong><span>${esc(profile.email || '')}</span><small>${esc(profile.city || profile.region_name || '')}</small></div>
        <em class="v7Status ${statusTone}">${statusLabel}</em>
      </div>
      <div class="v800AssignedRole"><small>Función actual</small><strong>${esc(role.roleName)}</strong><p>${esc(role.summary)}</p></div>
      <div class="v800RolePills">${roleCapabilityPillsV800(profile.commercial_role)}</div>
      <dl class="v800MiniMeta"><div><dt>Región</dt><dd>${esc(profile.region_name || 'Sin definir')}</dd></div><div><dt>Responsable</dt><dd>${esc(manager)}</dd></div><div><dt>Proveedor</dt><dd>${esc(supplier)}</dd></div>${profile.commercial_role==='field_seller'?`<div><dt>Stock de</dt><dd>${esc(stockOwner)}</dd></div><div><dt>Punto</dt><dd>${esc(profile.stock_point_id||'Stock general')}</dd></div>`:''}</dl>
      ${profile.role_note ? `<div class="v800RoleNote">${esc(profile.role_note)}</div>` : ''}
      ${canEdit ? `<button class="btn block assignRoleV800" data-id="${esc(profile.id)}">Asignar función y alcance</button>` : ''}
    </article>`;
  }

  async function renderRolesStructureV800(options = {}) {
    $('#fabAdd').classList.add('hidden');
    const main = $('#mainArea');
    if (!options.quiet && (!(AppState.roleCatalog || []).length || !(AppState.manageableProfiles || []).length)) {
      main.innerHTML = '<div class="loading">Cargando estructura funcional…</div>';
    }
    const result = await syncV8ContextV800();
    if (!result.ok) {
      main.innerHTML = `<div class="v7Empty"><span>⚠️</span><h3>No se pudo cargar la estructura</h3><p>${esc(result.message)}</p><button class="btn" id="retryRolesV800">Reintentar</button></div>`;
      $('#retryRolesV800')?.addEventListener('click', renderRolesStructureV800);
      return;
    }
    const current = (AppState.manageableProfiles || []).find(profile => profile.id === currentUserId()) || Object.assign({}, AppState.session, {
      commercial_role: currentCommercialRoleV800(), region_name: AppState.session.regionName || '', manager_user_id: AppState.session.managerUserId, supplier_user_id: AppState.session.supplierUserId
    });
    const profiles = (AppState.manageableProfiles || []).filter(profile => profile.id !== currentUserId() && (isAdmin() || profile.manager_user_id === currentUserId()));
    main.innerHTML = `
      <section class="v800ModuleHero roles"><span class="v800Orb one"></span><span class="v800Orb two"></span><span class="v7Eyebrow">Natura Vida V8 XD</span><h1>Roles y estructura funcional</h1><p>La función cambia los permisos y herramientas; la identidad, ventas, clientes, stock e historial permanecen unidos a la misma cuenta.</p></section>
      ${roleSummaryCardV800(current)}
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Jerarquía operativa</span><h2>${isAdmin() ? 'Usuarios y funciones' : 'Mi equipo asignado'}</h2></div><span class="v800CountBadge">${profiles.length}</span></div>
        <div class="v800RoleGuide"><strong>Regla principal</strong><p>El Administrador central asigna región, responsable, proveedor y función. Un Representante regional avanzado o Administrador regional puede organizar a las personas ya vinculadas a su equipo.</p></div>
        <div class="v800UserRoleGrid">${profiles.map(profileCardV800).join('') || '<div class="v7Empty"><span>👥</span><h3>Sin personas asignadas</h3><p>Las cuentas aprobadas y vinculadas aparecerán aquí.</p></div>'}</div>
      </section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Guía de funciones</span><h2>Qué puede hacer cada rol</h2></div></div><div class="v800RoleCatalog">${(AppState.roleCatalog || []).map(role => `<article><div><span>${esc(role.shortName)} · ${role.assignable===false?'Preparado para próxima activación':'Disponible'}</span><strong>${esc(role.roleName)}</strong><p>${esc(role.summary)}</p></div><div class="v800RolePills">${roleCapabilityPillsV800(role.roleCode)}</div></article>`).join('')}</div></section>`;
    $all('.assignRoleV800').forEach(button => button.addEventListener('click', () => openRoleAssignmentV800(button.dataset.id)));
  }

  function allowedRolesForCurrentUserV800() {
    const all = (AppState.roleCatalog || []).filter(role => role.active !== false && role.assignable !== false);
    if (isAdmin()) return all;
    return all.filter(role => ['commercial_representative','field_seller','delivery','support'].includes(role.roleCode));
  }

  function profileOptionsV800(selectedId, excludeId, includeBlank = true) {
    const profiles = activeProfiles().filter(profile => profile.id !== excludeId);
    return `${includeBlank ? '<option value="">Administración / stock central</option>' : ''}${profiles.map(profile => `<option value="${esc(profile.id)}" ${profile.id===selectedId?'selected':''}>${esc(profile.full_name||profile.email)} · ${esc(roleShortNameV800(profile.commercial_role))}</option>`).join('')}`;
  }

  function supplierOptionsV800(selectedId, targetUserId) {
    const currentId = currentUserId();
    const candidates = activeProfiles().filter(profile => profile.id !== targetUserId && roleCatalogItemV800(profile.commercial_role).canSupplyTeam);
    return `<option value="">Administración / stock central</option>${candidates.map(profile => `<option value="${esc(profile.id)}" ${profile.id===selectedId?'selected':''}>${esc(profile.full_name||profile.email)} · ${esc(roleShortNameV800(profile.commercial_role))}</option>`).join('')}`;
  }

  async function openRoleAssignmentV800(userId) {
    if (window.fetchLinkedStockContextV801) await fetchLinkedStockContextV801().catch(()=>({ok:false}));
    const profile = (AppState.manageableProfiles || []).find(row => row.id === userId);
    if (!profile) return showToast('No se encontró el perfil.', 'error');
    const roles = allowedRolesForCurrentUserV800();
    openSheet(`
      <h2>Asignar función <span class="x" id="closeSheet">✕</span></h2>
      <div class="v800PersonStrip">${window.avatarMarkupV771 ? avatarMarkupV771(profile,'representative') : ''}<div><strong>${esc(profile.full_name||profile.email)}</strong><span>${esc(profile.email||'')}</span></div></div>
      <div class="field"><label>Función / rol</label><select id="v800RoleSelect">${roles.map(role => `<option value="${role.roleCode}" ${profile.commercial_role===role.roleCode?'selected':''}>${esc(role.roleName)}</option>`).join('')}</select></div>
      <div id="v800RolePreview"></div>
      <div class="field"><label>Región o zona</label><input id="v800Region" value="${esc(profile.region_name||profile.city||'')}" placeholder="Ej.: La Paz Metropolitana"></div>
      <div class="field"><label>Responsable directo</label><select id="v800Manager">${profileOptionsV800(profile.manager_user_id,userId,true)}</select></div>
      <div class="field"><label>Proveedor habitual</label><select id="v800Supplier">${supplierOptionsV800(profile.supplier_user_id,userId)}</select><small class="v800FieldHelp">Para representantes identifica quién los abastece. El vendedor vinculado no compra: usa el propietario de stock definido abajo.</small></div>
      <div id="v801LinkedSellerFields" class="v801LinkedSellerFields">
        <div class="field"><label>Propietario del stock de trabajo</label><select id="v801StockOwner">${window.ownerOptionsV801?ownerOptionsV801(profile.stock_owner_user_id||profile.manager_user_id||''):''}</select></div>
        <div class="field"><label>Punto de venta o custodia</label><select id="v801StockPoint">${window.pointOptionsV801?pointOptionsV801(profile.stock_owner_user_id||profile.manager_user_id||'',profile.stock_point_id||''):'<option value="">Stock general del responsable</option>'}</select><small class="v800FieldHelp">Si se selecciona un punto, las ventas descuentan únicamente lo dejado físicamente allí.</small></div>
        <div class="field-row"><div class="field"><label>Ciudad de operación</label><input id="v801OperationCity" value="${esc(profile.operation_city||profile.city||'')}"></div><div class="field"><label>Cobranzas</label><select id="v801SellerCollect"><option value="0" ${!profile.seller_can_collect?'selected':''}>No autorizadas</option><option value="1" ${profile.seller_can_collect?'selected':''}>Autorizadas</option></select></div></div>
      </div>
      <div class="field"><label>Observación de la función</label><textarea id="v800RoleNote" rows="3" placeholder="Alcance especial, etapa de prueba o responsabilidad concreta">${esc(profile.role_note||'')}</textarea></div>
      <div class="v800HistoryNotice"><strong>El cambio no crea otra cuenta.</strong><span>Conserva ventas, clientes, stock, rutas, cobranzas, actividad territorial y auditoría.</span></div>
      <button class="btn block" id="saveRoleV800">Guardar función y alcance</button>
    `, (overlay, close) => {
      const renderPreview = () => {
        const role = roleCatalogItemV800($('#v800RoleSelect',overlay).value);
        $('#v800RolePreview',overlay).innerHTML = `<div class="v800RolePreview"><strong>${esc(role.roleName)}</strong><p>${esc(role.summary)}</p><div class="v800RolePills">${roleCapabilityPillsV800(role.roleCode)}</div>${role.tools?.length ? `<small>Herramientas: ${esc(role.tools.join(' · '))}</small>` : ''}</div>`;
        const linkedFields=$('#v801LinkedSellerFields',overlay);
        if(linkedFields)linkedFields.classList.toggle('hidden',role.roleCode!=='field_seller');
        if (!isAdmin()) {
          $('#v800Manager',overlay).value = currentUserId();
          $('#v800Manager',overlay).disabled = true;
          $('#v800Supplier',overlay).value = AppState.session.supplierUserId||'';
          $('#v800Supplier',overlay).disabled = true;
        }
      };
      renderPreview();
      $('#v800RoleSelect',overlay).addEventListener('change',renderPreview);
      $('#v801StockOwner',overlay)?.addEventListener('change',e=>{if($('#v801StockPoint',overlay)&&window.pointOptionsV801)$('#v801StockPoint',overlay).innerHTML=pointOptionsV801(e.target.value,'');});
      $('#closeSheet',overlay).addEventListener('click',close);
      $('#saveRoleV800',overlay).addEventListener('click',async()=>{
        const btn=$('#saveRoleV800',overlay); btn.disabled=true; btn.textContent='Guardando función…';
        try {
          const sb=await requireClient();
          const selectedRole=$('#v800RoleSelect',overlay).value;
          const { data,error }=await sb.rpc('nv801_assign_user_role',{
            p_user_id:userId,
            p_commercial_role:selectedRole,
            p_region_name:$('#v800Region',overlay).value.trim(),
            p_manager_user_id:$('#v800Manager',overlay).value || null,
            p_supplier_user_id:$('#v800Supplier',overlay).value || null,
            p_role_note:$('#v800RoleNote',overlay).value.trim(),
            p_stock_owner_user_id:selectedRole==='field_seller'?($('#v801StockOwner',overlay)?.value||null):null,
            p_stock_point_id:selectedRole==='field_seller'?($('#v801StockPoint',overlay)?.value||null):null,
            p_operation_city:$('#v801OperationCity',overlay)?.value.trim()||$('#v800Region',overlay).value.trim(),
            p_seller_can_collect:selectedRole==='field_seller'&&$('#v801SellerCollect',overlay)?.value==='1'
          });
          if(error) throw error;
          close(); showToast('Función y alcance actualizados.');
          await syncV8ContextV800();
          renderRolesStructureV800();
          if(window.renderTopHeader) renderTopHeader();
        } catch(error){ btn.disabled=false; btn.textContent='Reintentar'; showToast(messageFromError(error),'error'); }
      });
    });
  }

  function patchRolesStructureV801(){ if(AppState.currentTab==='roles-estructura'&&!window.V7_FORM_DIRTY) renderRolesStructureV800({quiet:true}); }
  Object.assign(window,{ renderRolesStructureV800,patchRolesStructureV801,openRoleAssignmentV800 });
})();
