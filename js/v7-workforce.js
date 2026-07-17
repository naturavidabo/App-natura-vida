/* NATURA VIDA V7.7.1 — personal con/sin acceso, mano de obra ocasional y actualización silenciosa. */
(() => {
  const emptyCache = () => ({ staff: [], tasks: [], attendance: [], labor: [], payments: [] });
  let workforceCache = emptyCache();
  let workforceLoaded = false;
  let workforceTab = 'equipo';
  let realtimeTimer = null;
  let refreshPromise = null;

  const sb = () => window.getSupabaseClient ? getSupabaseClient() : null;
  const currentUid = () => AppState.session.onlineUserId || AppState.session.userId;
  const admin = () => window.isAdmin && isAdmin();
  const managerMode = () => admin() || (window.canManageTeamV800 && canManageTeamV800());
  const esc = value => escapeHtml(String(value == null ? '' : value));
  const uid770 = prefix => window.uid ? uid(prefix) : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const nowIso = () => new Date().toISOString();

  function errorText(error) {
    const raw = window.messageFromError ? messageFromError(error) : String(error?.message || error || 'Error');
    if (/staff_members|staff_tasks|staff_attendance|labor_costs|staff_payments/i.test(raw) && /does not exist|schema cache/i.test(raw)) {
      return 'Falta ejecutar el SQL principal de Natura Vida V7.7.1 y luego V8.0.0 en Supabase.';
    }
    return raw;
  }

  function dateLabel(value) {
    if (!value) return 'Sin fecha';
    try { return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('es-BO'); }
    catch (_) { return String(value); }
  }

  function dateTimeLabel(value) {
    if (!value) return 'Sin registro';
    try { return new Date(value).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' }); }
    catch (_) { return String(value); }
  }

  function staffName(id, fallback = '') {
    const row = workforceCache.staff.find(item => item.id === id);
    return row ? row.full_name : (fallback || 'Personal no disponible');
  }

  function statusText(value) {
    return ({
      active: 'Activo', inactive: 'Inactivo', suspended: 'Suspendido', retired: 'Retirado',
      pending: 'Pendiente', in_progress: 'En proceso', completed: 'Completada', cancelled: 'Cancelada', overdue: 'Atrasada',
      present: 'Presente', late: 'Atraso', absent: 'Ausente', permission: 'Permiso', medical: 'Baja médica',
      paid: 'Pagado', partial: 'Parcial', scheduled: 'Programado'
    })[value] || value || 'Sin estado';
  }

  async function refreshWorkforceV770(options = {}) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      if (!sb() || !currentUid()) return { ok: false, message: 'Sesión no disponible.' };
      const [staffRes, taskRes, attendanceRes, laborRes, paymentRes] = await Promise.all([
        sb().from('staff_members').select('*').order('created_at', { ascending: false }).limit(500),
        sb().from('staff_tasks').select('*').order('created_at', { ascending: false }).limit(1000),
        sb().from('staff_attendance').select('*').order('work_date', { ascending: false }).limit(1200),
        sb().from('labor_costs').select('*').order('work_date', { ascending: false }).limit(1000),
        sb().from('staff_payments').select('*').order('payment_date', { ascending: false }).limit(1000)
      ]);
      const failed = [staffRes, taskRes, attendanceRes, laborRes, paymentRes].find(result => result.error);
      if (failed) return { ok: false, message: errorText(failed.error) };
      workforceCache = {
        staff: staffRes.data || [],
        tasks: taskRes.data || [],
        attendance: attendanceRes.data || [],
        labor: laborRes.data || [],
        payments: paymentRes.data || []
      };
      workforceLoaded = true;
      if (options.rerender && AppState.currentTab === 'personal') renderWorkforceV770({ quiet: true });
      return { ok: true, ...workforceCache };
    })();
    try { return await refreshPromise; }
    finally { refreshPromise = null; }
  }

  function workforceTabs() {
    const tabs = managerMode()
      ? [['equipo','Equipo'],['tareas','Tareas'],['asistencia','Asistencia'],['mano-obra','Mano de obra'],['pagos','Pagos']]
      : [['tareas','Mis tareas'],['asistencia','Mi asistencia']];
    if (!tabs.some(([id]) => id === workforceTab)) workforceTab = tabs[0][0];
    return `<div class="v770WorkTabs">${tabs.map(([id, label]) => `<button data-work-tab="${id}" class="${workforceTab === id ? 'active' : ''}">${label}</button>`).join('')}</div>`;
  }

  function metricsHtml() {
    const active = workforceCache.staff.filter(row => row.status === 'active').length;
    const pendingTasks = workforceCache.tasks.filter(row => ['pending', 'in_progress'].includes(row.status)).length;
    const month = today().slice(0, 7);
    const laborTotal = workforceCache.labor.filter(row => String(row.work_date || '').startsWith(month)).reduce((sum, row) => sum + Number(row.total_cost || 0), 0);
    const paidTotal = workforceCache.payments.filter(row => String(row.payment_date || '').startsWith(month)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return `<section class="v7MetricGrid compact v770WorkMetrics">
      <article class="v7MetricCard primary"><span>Personal activo</span><strong id="workMetricActiveV771">${active}</strong><small>en operación</small></article>
      <article class="v7MetricCard"><span>Tareas abiertas</span><strong id="workMetricTasksV771">${pendingTasks}</strong><small>pendientes o en proceso</small></article>
      <article class="v7MetricCard notification"><span>Mano de obra mes</span><strong id="workMetricLaborV771">${fmtMoney(laborTotal)}</strong><small>costo registrado</small></article>
      <article class="v7MetricCard"><span>Pagos mes</span><strong id="workMetricPaidV771">${fmtMoney(paidTotal)}</strong><small>al personal</small></article>
    </section>`;
  }

  function staffOptions(selected = '') {
    return workforceCache.staff.filter(row => row.status !== 'retired').map(row => `<option value="${esc(row.id)}" ${row.id === selected ? 'selected' : ''}>${esc(row.full_name)} · ${esc(roleLabel(row.role_type))}</option>`).join('');
  }

  function managerOptions(selected = '') {
    if (!managerMode()) return '';
    const profiles = ((AppState.manageableProfiles && AppState.manageableProfiles.length) ? AppState.manageableProfiles : (AppState.allProfiles || [])).filter(row => String(row.status || '').toLowerCase() === 'activo');
    const ownLabel = admin() ? 'Administración central' : (AppState.session.roleShortName || 'Responsable regional');
    return `<div class="field"><label>Responsable / región</label><select id="staffManagerV770"><option value="${esc(currentUid())}">${esc(ownLabel)}</option>${profiles.filter(row => row.id !== currentUid()).map(row => `<option value="${esc(row.id)}" ${row.id === selected ? 'selected' : ''}>${esc(row.full_name || row.email || 'Usuario')}</option>`).join('')}</select></div>`;
  }

  function roleLabel(value) {
    return ({ production: 'Producción', sales: 'Ventas', delivery: 'Reparto', inventory: 'Inventario', administration: 'Administración', support: 'Apoyo' })[value] || value || 'Apoyo';
  }

  function renderTeam() {
    return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Equipo de trabajo</span><h2>Personal registrado</h2></div>${managerMode()?'<button class="btn sm" id="newStaffV770">+ Persona</button>':''}</div>
      <div class="v770StaffGrid">${workforceCache.staff.map(row => {
        const open = workforceCache.tasks.filter(task => task.staff_id === row.id && ['pending', 'in_progress'].includes(task.status)).length;
        const linkedProfile=(AppState.allProfiles||[]).find(profile=>profile.id===row.linked_user_id)||{}; const avatar=window.avatarMarkupV771 ? avatarMarkupV771(linkedProfile.full_name||linkedProfile.email ? linkedProfile : {full_name:row.full_name},'staff') : `<div class="v770StaffAvatar">${esc((row.full_name||'P').charAt(0).toUpperCase())}</div>`; return `<article class="v770StaffCard">${avatar}<div class="v770StaffMain"><div class="v770StaffTitle"><h3>${esc(row.full_name)}</h3><em class="v770State ${esc(row.status)}">${statusText(row.status)}</em></div><p>${esc(roleLabel(row.operational_role||row.role_type))}${row.region ? ` · ${esc(row.region)}` : ''}</p><div class="v770StaffFacts"><span>${row.access_mode==='app'?'📲 Con acceso a la app':'📝 Gestionado sin cuenta'}</span><span>${row.phone ? `📱 ${esc(row.phone)}` : 'Sin celular'}</span><span>${open} tarea(s) abierta(s)</span><span>${esc(row.pay_mode === 'hour' ? `${fmtMoney(row.pay_rate)}/hora` : row.pay_mode === 'unit' ? `${fmtMoney(row.pay_rate)}/unidad` : row.pay_mode === 'day' ? `${fmtMoney(row.pay_rate)}/jornada` : 'Pago por tarea')}</span></div></div><button class="v770IconBtn" data-edit-staff="${esc(row.id)}" aria-label="Editar">✎</button></article>`;
      }).join('') || '<div class="v7Empty"><span>👥</span><h3>Aún no hay personal</h3><p>Registra producción, ventas, reparto o apoyo regional.</p></div>'}</div></section>`;
  }

  function renderTasks() {
    const rows = workforceCache.tasks.slice().sort((a, b) => String(a.status).localeCompare(String(b.status)) || String(a.due_date || '').localeCompare(String(b.due_date || '')));
    return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Asignaciones</span><h2>Tareas y seguimiento</h2></div><button class="btn sm" id="newTaskV770">+ Tarea</button></div>
      <div class="v770TaskList">${rows.map(row => `<article class="v770TaskCard ${esc(row.priority)}"><div><span class="v770TaskType">${esc(roleLabel(row.task_type))}</span><h3>${esc(row.title)}</h3><p>${esc(staffName(row.staff_id))} · ${dateLabel(row.due_date)}${row.location ? ` · ${esc(row.location)}` : ''}</p>${row.notes ? `<small>${esc(row.notes)}</small>` : ''}</div><div class="v770TaskSide"><em class="v770State ${esc(row.status)}">${statusText(row.status)}</em>${!['completed', 'cancelled'].includes(row.status) ? `<button class="btn sm outline" data-complete-task="${esc(row.id)}">Completar</button>` : ''}</div></article>`).join('') || '<div class="v7Empty"><span>✅</span><h3>Sin tareas registradas</h3><p>Asigna actividades de producción, venta, inventario o reparto.</p></div>'}</div></section>`;
  }

  function renderAttendance() {
    const rows = workforceCache.attendance.slice(0, 120);
    return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Control operativo</span><h2>Asistencia</h2></div><button class="btn sm" id="newAttendanceV770">+ Registrar</button></div>
      <div class="v770AttendanceList">${rows.map(row => `<article class="v770LineCard"><span><strong>${esc(staffName(row.staff_id,row.worker_name||''))}</strong><small>${row.worker_kind==='occasional'?'Ayudante ocasional · ':''}${dateLabel(row.work_date)} · ${statusText(row.status)}</small></span><span class="v770TimePair"><b>${row.check_in ? new Date(row.check_in).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—'}</b><small>Entrada</small></span><span class="v770TimePair"><b>${row.check_out ? new Date(row.check_out).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—'}</b><small>Salida</small></span>${row.check_in && !row.check_out ? `<button class="btn sm outline" data-checkout="${esc(row.id)}">Marcar salida</button>` : ''}</article>`).join('') || '<div class="v7Empty"><span>🕒</span><h3>Sin asistencia</h3><p>Registra entrada, salida, atrasos, permisos o bajas médicas.</p></div>'}</div></section>`;
  }

  function renderLabor() {
    const total = workforceCache.labor.reduce((sum, row) => sum + Number(row.total_cost || 0), 0);
    return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Costo productivo</span><h2>Mano de obra</h2><p>Total histórico: <b>${fmtMoney(total)}</b></p></div><button class="btn sm" id="newLaborV770">+ Costo</button></div>
      <div class="v770LaborList">${workforceCache.labor.map(row => `<article class="v770LineCard"><span><strong>${esc(staffName(row.staff_id,row.worker_name||''))}</strong><small>${row.worker_kind==='occasional'?'Ayudante ocasional · ':''}${dateLabel(row.work_date)}${row.production_batch_id ? ` · Lote ${esc(row.production_batch_id)}` : ''}</small></span><span><b>${Number(row.hours || 0)} h</b><small>${Number(row.units || 0)} unidades</small></span><span class="v770Money"><b>${fmtMoney(row.total_cost)}</b><small>${esc(row.notes || 'Costo de trabajo')} · ${row.payment_status==='paid'?'Pagado':'Pendiente'}</small></span></article>`).join('') || '<div class="v7Empty"><span>🧰</span><h3>Sin costos de mano de obra</h3><p>Asocia jornadas, horas o unidades a una producción.</p></div>'}</div></section>`;
  }

  function renderPayments() {
    return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Egresos laborales</span><h2>Pagos al personal</h2></div><button class="btn sm" id="newPaymentV770">+ Pago</button></div>
      <div class="v770LaborList">${workforceCache.payments.map(row => `<article class="v770LineCard"><span><strong>${esc(staffName(row.staff_id))}</strong><small>${dateLabel(row.payment_date)} · ${esc(row.payment_type || 'Pago')}</small></span><em class="v770State ${esc(row.status)}">${statusText(row.status)}</em><span class="v770Money"><b>${fmtMoney(row.amount)}</b><small>${esc(row.notes || 'Sin observación')}</small></span></article>`).join('') || '<div class="v7Empty"><span>💳</span><h3>Sin pagos registrados</h3><p>Registra anticipos, pagos parciales o pagos completos.</p></div>'}</div></section>`;
  }

  function tabContent() {
    if (workforceTab === 'tareas') return renderTasks();
    if (workforceTab === 'asistencia') return renderAttendance();
    if (workforceTab === 'mano-obra') return renderLabor();
    if (workforceTab === 'pagos') return renderPayments();
    return renderTeam();
  }

  async function renderWorkforceV770(options = {}) {
    $('#fabAdd').classList.add('hidden');
    const main = $('#mainArea');
    const scroll = options.quiet ? window.scrollY : 0;
    if (!workforceLoaded && !options.quiet) main.innerHTML = '<div class="loading">Cargando personal y mano de obra…</div>';
    const result = options.skipRefresh ? { ok: true } : await refreshWorkforceV770();
    if (!result.ok) {
      main.innerHTML = `<div class="v7Empty"><span>👥</span><h3>No se pudo abrir Personal</h3><p>${esc(result.message)}</p><button class="btn" id="retryWorkforceV770">Reintentar</button></div>`;
      $('#retryWorkforceV770')?.addEventListener('click', () => renderWorkforceV770());
      return;
    }
    main.innerHTML = `<section class="v770WorkHero nv771LimeHero"><div class="v770OrganicGlow one"></div><div class="v770OrganicGlow two"></div><span class="v7Eyebrow">Natura Vida V8.0.0 XD</span><h1>${managerMode()?'Personal, funciones y mano de obra':'Mi trabajo'}</h1><p>${managerMode() ? 'Diferencia usuarios con acceso, personal gestionado y ayudantes ocasionales; asigna tareas según tu alcance.' : 'Consulta tus tareas y registros de asistencia sin acceder a información de otras personas.'}</p></section>${metricsHtml()}${workforceTabs()}<div id="workforceTabContentV771">${tabContent()}</div>`;
    bindWorkforceEvents();
    if (options.quiet) requestAnimationFrame(() => window.scrollTo({ top: scroll, behavior: 'auto' }));
  }

  function bindWorkforceEvents() {
    $all('[data-work-tab]').forEach(button => { button.onclick=()=>{ workforceTab=button.dataset.workTab; renderWorkforceV770({ quiet:true,skipRefresh:true }); }; });
    const newStaff=$('#newStaffV770'); if(newStaff)newStaff.onclick=()=>openStaffFormV770();
    $all('[data-edit-staff]').forEach(button => { button.onclick=()=>openStaffFormV770(button.dataset.editStaff); });
    const newTask=$('#newTaskV770'); if(newTask)newTask.onclick=openTaskFormV770;
    $all('[data-complete-task]').forEach(button => { button.onclick=()=>completeTaskV770(button.dataset.completeTask); });
    const newAttendance=$('#newAttendanceV770'); if(newAttendance)newAttendance.onclick=openAttendanceFormV770;
    $all('[data-checkout]').forEach(button => { button.onclick=()=>markCheckoutV770(button.dataset.checkout); });
    const newLabor=$('#newLaborV770'); if(newLabor)newLabor.onclick=openLaborFormV770;
    const newPayment=$('#newPaymentV770'); if(newPayment)newPayment.onclick=openPaymentFormV770;
  }

  function openStaffFormV770(id = '') {
    if (!managerMode()) return showToast('Tu perfil no administra personal.', 'error');
    const row = workforceCache.staff.find(item => item.id === id) || null;
    openSheet(`<h2>${row ? 'Editar personal' : 'Registrar personal'} <span class="x" id="closeSheet">✕</span></h2>
      <div class="field"><label>Nombre completo</label><input id="staffNameV770" value="${esc(row?.full_name || '')}" placeholder="Nombre y apellidos"></div>
      <div class="field-row"><div class="field"><label>Celular</label><input id="staffPhoneV770" inputmode="tel" value="${esc(row?.phone || '')}"></div><div class="field"><label>Región / ciudad</label><input id="staffRegionV770" value="${esc(row?.region || AppState.session.city || '')}"></div></div>
      <div class="field-row"><div class="field"><label>Área de trabajo</label><select id="staffRoleV770">${['production','sales','delivery','inventory','administration','support'].map(value => `<option value="${value}" ${(row?.operational_role||row?.role_type) === value ? 'selected' : ''}>${roleLabel(value)}</option>`).join('')}</select></div><div class="field"><label>Estado</label><select id="staffStatusV770">${['active','inactive','suspended','retired'].map(value => `<option value="${value}" ${row?.status === value ? 'selected' : ''}>${statusText(value)}</option>`).join('')}</select></div></div>
      <div class="field"><label>Forma de participación</label><select id="staffAccessModeV771"><option value="managed" ${row?.access_mode!=='app'?'selected':''}>Registrado sin acceso a la aplicación</option><option value="app" ${row?.access_mode==='app'?'selected':''}>Tendrá acceso a la aplicación</option></select></div>
      <div class="field ${row?.access_mode==='app'?'':'hidden'}" id="linkedUserFieldV771"><label>Cuenta aprobada a vincular</label><select id="staffLinkedUserV771"><option value="">Seleccionar cuenta…</option>${(((AppState.manageableProfiles&&AppState.manageableProfiles.length)?AppState.manageableProfiles:AppState.allProfiles)||[]).filter(profile=>String(profile.status||'').toLowerCase()==='activo').map(profile=>`<option value="${esc(profile.id)}" ${row?.linked_user_id===profile.id?'selected':''}>${esc(profile.full_name||profile.email||'Usuario')} · ${esc(profile.email||'')}</option>`).join('')}</select><small>La persona crea primero su cuenta; después se vincula aquí con su función.</small></div>
      ${managerOptions(row?.manager_user_id || currentUid())}
      <div class="field-row"><div class="field"><label>Modalidad de pago</label><select id="staffPayModeV770">${[['day','Por jornada'],['hour','Por hora'],['unit','Por unidad'],['task','Por tarea']].map(([value, label]) => `<option value="${value}" ${row?.pay_mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label>Tarifa referencial</label><input id="staffRateV770" type="number" min="0" step="0.01" value="${Number(row?.pay_rate || 0)}"></div></div>
      <div class="field"><label>Fecha de ingreso</label><input id="staffJoinedV770" type="date" value="${esc(row?.joined_on || today())}"></div>
      <div class="field"><label>Observaciones</label><textarea id="staffNotesV770">${esc(row?.notes || '')}</textarea></div>
      <button class="btn block" id="saveStaffV770">${row ? 'Guardar cambios' : 'Registrar persona'}</button>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#staffAccessModeV771', overlay)?.addEventListener('change', event => $('#linkedUserFieldV771', overlay)?.classList.toggle('hidden', event.target.value !== 'app'));
      $('#saveStaffV770', overlay).addEventListener('click', async () => {
        const name = $('#staffNameV770', overlay).value.trim();
        if (!name) return showToast('Ingresa el nombre del personal.', 'error');
        const payload = {
          id: row?.id || uid770('staff'),
          manager_user_id: managerMode() ? ($('#staffManagerV770', overlay)?.value || currentUid()) : currentUid(),
          full_name: name,
          phone: $('#staffPhoneV770', overlay).value.trim(),
          role_type: $('#staffRoleV770', overlay).value,
          operational_role: $('#staffRoleV770', overlay).value,
          access_mode: $('#staffAccessModeV771', overlay).value,
          linked_user_id: $('#staffAccessModeV771', overlay).value === 'app' ? ($('#staffLinkedUserV771', overlay).value || null) : null,
          region: $('#staffRegionV770', overlay).value.trim(),
          status: $('#staffStatusV770', overlay).value,
          joined_on: $('#staffJoinedV770', overlay).value || today(),
          pay_mode: $('#staffPayModeV770', overlay).value,
          pay_rate: Number($('#staffRateV770', overlay).value || 0),
          notes: $('#staffNotesV770', overlay).value.trim(),
          created_by: row?.created_by || currentUid(),
          updated_by: currentUid(),
          updated_at: nowIso()
        };
        const button = $('#saveStaffV770', overlay); button.disabled = true; button.textContent = 'Guardando…';
        const { error } = await sb().from('staff_members').upsert(payload, { onConflict: 'id' });
        if (error) { button.disabled = false; button.textContent = 'Reintentar'; return showToast(errorText(error), 'error'); }
        close(); showToast(row ? 'Personal actualizado.' : 'Personal registrado.'); await refreshWorkforceV770(); patchWorkforceV771();
      });
    });
  }

  function openTaskFormV770() {
    if (!workforceCache.staff.length) return showToast('Registra primero una persona.', 'error');
    openSheet(`<h2>Nueva tarea <span class="x" id="closeSheet">✕</span></h2>
      <div class="field"><label>Responsable</label><select id="taskStaffV770">${staffOptions()}</select></div>
      <div class="field"><label>Tarea</label><input id="taskTitleV770" placeholder="Ej.: Envasar lote de aceite de coco"></div>
      <div class="field-row"><div class="field"><label>Tipo</label><select id="taskTypeV770">${['production','sales','delivery','inventory','administration','support'].map(value => `<option value="${value}">${roleLabel(value)}</option>`).join('')}</select></div><div class="field"><label>Prioridad</label><select id="taskPriorityV770"><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baja</option></select></div></div>
      <div class="field-row"><div class="field"><label>Fecha límite</label><input id="taskDueV770" type="date" value="${today()}"></div><div class="field"><label>Lugar</label><input id="taskLocationV770" placeholder="Producción, tienda, ruta…"></div></div>
      <div class="field"><label>Indicaciones</label><textarea id="taskNotesV770"></textarea></div><button class="btn block" id="saveTaskV770">Crear tarea</button>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#saveTaskV770', overlay).addEventListener('click', async () => {
        const title = $('#taskTitleV770', overlay).value.trim(); if (!title) return showToast('Escribe la tarea.', 'error');
        const staffId = $('#taskStaffV770', overlay).value;
        const staff = workforceCache.staff.find(item => item.id === staffId);
        const row = { id: uid770('task'), staff_id: staffId, manager_user_id: staff?.manager_user_id || currentUid(), title, task_type: $('#taskTypeV770', overlay).value, priority: $('#taskPriorityV770', overlay).value, status: 'pending', due_date: $('#taskDueV770', overlay).value || today(), location: $('#taskLocationV770', overlay).value.trim(), notes: $('#taskNotesV770', overlay).value.trim(), created_by: currentUid(), updated_by: currentUid() };
        const button = $('#saveTaskV770', overlay); button.disabled = true; button.textContent = 'Guardando…';
        const { error } = await sb().from('staff_tasks').insert(row);
        if (error) { button.disabled = false; button.textContent = 'Reintentar'; return showToast(errorText(error), 'error'); }
        close(); showToast('Tarea asignada.'); await refreshWorkforceV770(); patchWorkforceV771();
      });
    });
  }

  async function completeTaskV770(id) {
    const { error } = await sb().from('staff_tasks').update({ status: 'completed', completed_at: nowIso(), updated_by: currentUid(), updated_at: nowIso() }).eq('id', id);
    if (error) return showToast(errorText(error), 'error');
    showToast('Tarea completada.'); await refreshWorkforceV770(); patchWorkforceV771();
  }

  function getPositionV770() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }), () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    });
  }

  function openAttendanceFormV770() {
    if (!workforceCache.staff.length) return showToast('Registra primero una persona.', 'error');
    openSheet(`<h2>Registrar asistencia <span class="x" id="closeSheet">✕</span></h2><div class="field"><label>Personal</label><select id="attendanceStaffV770">${staffOptions()}</select></div><div class="field"><label>Fecha</label><input id="attendanceDateV770" type="date" value="${today()}"></div><div class="field"><label>Estado</label><select id="attendanceStatusV770"><option value="present">Presente</option><option value="late">Atraso</option><option value="absent">Ausente</option><option value="permission">Permiso</option><option value="medical">Baja médica</option></select></div><div class="field"><label>Observación</label><textarea id="attendanceNotesV770"></textarea></div><button class="btn block" id="saveAttendanceV770">Registrar entrada ahora</button>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#saveAttendanceV770', overlay).addEventListener('click', async () => {
        const button = $('#saveAttendanceV770', overlay); button.disabled = true; button.textContent = 'Obteniendo ubicación…';
        const pos = await getPositionV770();
        const staffId = $('#attendanceStaffV770', overlay).value;
        const staff = workforceCache.staff.find(item => item.id === staffId);
        const status = $('#attendanceStatusV770', overlay).value;
        const workDate = $('#attendanceDateV770', overlay).value || today();
        const existing = workforceCache.attendance.find(item => item.staff_id === staffId && item.work_date === workDate);
        const row = { id: existing?.id || uid770('att'), staff_id: staffId, manager_user_id: staff?.manager_user_id || currentUid(), work_date: workDate, status, check_in: ['present', 'late'].includes(status) ? (existing?.check_in || nowIso()) : null, check_out: existing?.check_out || null, latitude: pos?.latitude ?? existing?.latitude ?? null, longitude: pos?.longitude ?? existing?.longitude ?? null, accuracy_m: pos?.accuracy ?? existing?.accuracy_m ?? null, notes: $('#attendanceNotesV770', overlay).value.trim(), created_by: existing?.created_by || currentUid(), updated_by: currentUid(), updated_at: nowIso() };
        button.textContent = 'Guardando…';
        const { error } = await sb().from('staff_attendance').upsert(row, { onConflict: 'staff_id,work_date' });
        if (error) { button.disabled = false; button.textContent = 'Reintentar'; return showToast(errorText(error), 'error'); }
        close(); showToast(pos ? 'Asistencia registrada con ubicación.' : 'Asistencia registrada sin ubicación.'); await refreshWorkforceV770(); patchWorkforceV771();
      });
    });
  }

  async function markCheckoutV770(id) {
    const { error } = await sb().from('staff_attendance').update({ check_out: nowIso(), updated_by: currentUid(), updated_at: nowIso() }).eq('id', id);
    if (error) return showToast(errorText(error), 'error');
    showToast('Salida registrada.'); await refreshWorkforceV770(); patchWorkforceV771();
  }

  function openLaborFormV770() {
    openSheet(`<h2>Registrar mano de obra <span class="x" id="closeSheet">✕</span></h2><div class="field"><label>Tipo de trabajador</label><select id="laborWorkerKindV771"><option value="registered">Personal registrado</option><option value="occasional">Ayudante ocasional / momentáneo</option></select></div><div class="field" id="laborRegisteredFieldV771"><label>Personal</label><select id="laborStaffV770">${staffOptions()}</select></div><div class="field hidden" id="laborOccasionalFieldV771"><label>Nombre o referencia</label><input id="laborWorkerNameV771" placeholder="Ej.: Ayudante de envasado"></div><div class="field-row"><div class="field"><label>Fecha</label><input id="laborDateV770" type="date" value="${today()}"></div><div class="field"><label>Lote / referencia</label><input id="laborBatchV770" placeholder="Código de lote o trabajo"></div></div><div class="field-row"><div class="field"><label>Horas</label><input id="laborHoursV770" type="number" min="0" step="0.25" value="0"></div><div class="field"><label>Unidades</label><input id="laborUnitsV770" type="number" min="0" step="1" value="0"></div></div><div class="field-row"><div class="field"><label>Tarifa aplicada</label><input id="laborRateV770" type="number" min="0" step="0.01" value="0"></div><div class="field"><label>Costo / gasto total</label><input id="laborTotalV770" type="number" min="0" step="0.01" value="0"></div></div><div class="field-row"><div class="field"><label>Estado del pago</label><select id="laborPaymentStatusV771"><option value="paid">Pagado</option><option value="pending">Pendiente</option></select></div><div class="field"><label>Forma de pago</label><select id="laborPaymentMethodV771"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="other">Otra</option></select></div></div><div class="field"><label>Detalle</label><textarea id="laborNotesV770" placeholder="Trabajo realizado y observaciones"></textarea></div><div class="v7CashNotice">El ayudante ocasional no necesita cuenta ni ficha permanente. Este registro funciona como costo de mano de obra y gasto puntual.</div><button class="btn block" id="saveLaborV770">Guardar costo / gasto</button>`, (overlay, close) => {
      const kind=$('#laborWorkerKindV771',overlay), staffSelect=$('#laborStaffV770',overlay), rate=$('#laborRateV770',overlay), hours=$('#laborHoursV770',overlay), units=$('#laborUnitsV770',overlay), total=$('#laborTotalV770',overlay);
      function applyStaffRate(){const staff=workforceCache.staff.find(item=>item.id===staffSelect.value);rate.value=Number(staff?.pay_rate||0);calculate();}
      function calculate(){const staff=workforceCache.staff.find(item=>item.id===staffSelect.value);const r=Number(rate.value||0);total.value=roundBs(kind.value==='registered'&&staff?.pay_mode==='unit'?r*Number(units.value||0):r*Number(hours.value||0));}
      kind.addEventListener('change',()=>{const occasional=kind.value==='occasional';$('#laborRegisteredFieldV771',overlay).classList.toggle('hidden',occasional);$('#laborOccasionalFieldV771',overlay).classList.toggle('hidden',!occasional);if(!occasional)applyStaffRate();});
      staffSelect.addEventListener('change',applyStaffRate);[rate,hours,units].forEach(input=>input.addEventListener('input',calculate));if(workforceCache.staff.length)applyStaffRate();
      $('#closeSheet',overlay).addEventListener('click',close);
      $('#saveLaborV770',overlay).addEventListener('click',async()=>{
        const occasional=kind.value==='occasional';const staffId=occasional?null:staffSelect.value;const staff=workforceCache.staff.find(item=>item.id===staffId);const workerName=occasional?$('#laborWorkerNameV771',overlay).value.trim():(staff?.full_name||'');
        if(occasional&&workerName.length<2)return showToast('Ingresa el nombre o referencia del ayudante.','error');
        if(!occasional&&!staff)return showToast('Selecciona una persona registrada.','error');
        const paymentStatus=$('#laborPaymentStatusV771',overlay).value;
        const row={id:uid770('labor'),staff_id:staffId,worker_name:workerName,worker_kind:occasional?'occasional':'registered',manager_user_id:staff?.manager_user_id||currentUid(),production_batch_id:$('#laborBatchV770',overlay).value.trim(),work_date:$('#laborDateV770',overlay).value||today(),hours:Number(hours.value||0),units:Number(units.value||0),rate:Number(rate.value||0),total_cost:Number(total.value||0),payment_status:paymentStatus,payment_date:paymentStatus==='paid'?($('#laborDateV770',overlay).value||today()):null,payment_method:$('#laborPaymentMethodV771',overlay).value,notes:$('#laborNotesV770',overlay).value.trim(),created_by:currentUid(),updated_by:currentUid()};
        if(row.total_cost<=0)return showToast('El costo total debe ser mayor a cero.','error');
        const button=$('#saveLaborV770',overlay);button.disabled=true;button.textContent='Guardando…';const {error}=await sb().from('labor_costs').insert(row);if(error){button.disabled=false;button.textContent='Reintentar';return showToast(errorText(error),'error');}
        close();showToast(occasional?'Gasto de ayudante ocasional registrado.':'Costo de mano de obra registrado.');await refreshWorkforceV770();patchWorkforceV771();
      });
    });
  }

  function openPaymentFormV770() {
    if (!workforceCache.staff.length) return showToast('Registra primero una persona.', 'error');
    openSheet(`<h2>Registrar pago <span class="x" id="closeSheet">✕</span></h2><div class="field"><label>Personal</label><select id="paymentStaffV770">${staffOptions()}</select></div><div class="field-row"><div class="field"><label>Fecha</label><input id="paymentDateV770" type="date" value="${today()}"></div><div class="field"><label>Monto</label><input id="paymentAmountV770" type="number" min="0" step="0.01"></div></div><div class="field-row"><div class="field"><label>Concepto</label><select id="paymentTypeV770"><option value="salary">Pago de jornada</option><option value="advance">Anticipo</option><option value="production">Producción / lote</option><option value="commission">Comisión</option><option value="other">Otro</option></select></div><div class="field"><label>Estado</label><select id="paymentStatusV770"><option value="paid">Pagado</option><option value="partial">Parcial</option><option value="scheduled">Programado</option></select></div></div><div class="field"><label>Observación</label><textarea id="paymentNotesV770"></textarea></div><button class="btn block" id="savePaymentV770">Guardar pago</button>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#savePaymentV770', overlay).addEventListener('click', async () => {
        const amount = Number($('#paymentAmountV770', overlay).value || 0); if (amount <= 0) return showToast('Ingresa un monto válido.', 'error');
        const staffId = $('#paymentStaffV770', overlay).value; const staff = workforceCache.staff.find(item => item.id === staffId);
        const row = { id: uid770('pay'), staff_id: staffId, manager_user_id: staff?.manager_user_id || currentUid(), payment_date: $('#paymentDateV770', overlay).value || today(), amount, payment_type: $('#paymentTypeV770', overlay).value, status: $('#paymentStatusV770', overlay).value, notes: $('#paymentNotesV770', overlay).value.trim(), created_by: currentUid(), updated_by: currentUid() };
        const button = $('#savePaymentV770', overlay); button.disabled = true; button.textContent = 'Guardando…';
        const { error } = await sb().from('staff_payments').insert(row);
        if (error) { button.disabled = false; button.textContent = 'Reintentar'; return showToast(errorText(error), 'error'); }
        close(); showToast('Pago registrado.'); await refreshWorkforceV770(); patchWorkforceV771();
      });
    });
  }

  function patchWorkforceV771() {
    if (AppState.currentTab !== 'personal' || window.V7_FORM_DIRTY) return;
    const active=workforceCache.staff.filter(row=>row.status==='active').length;
    const pendingTasks=workforceCache.tasks.filter(row=>['pending','in_progress'].includes(row.status)).length;
    const month=today().slice(0,7);
    const laborTotal=workforceCache.labor.filter(row=>String(row.work_date||'').startsWith(month)).reduce((sum,row)=>sum+Number(row.total_cost||0),0);
    const paidTotal=workforceCache.payments.filter(row=>String(row.payment_date||'').startsWith(month)).reduce((sum,row)=>sum+Number(row.amount||0),0);
    const values=[['workMetricActiveV771',active],['workMetricTasksV771',pendingTasks],['workMetricLaborV771',fmtMoney(laborTotal)],['workMetricPaidV771',fmtMoney(paidTotal)]];
    values.forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value;});
    const content=$('#workforceTabContentV771');
    if(content){const scroll=window.scrollY;content.innerHTML=tabContent();bindWorkforceEvents();requestAnimationFrame(()=>window.scrollTo({top:scroll,behavior:'auto'}));}
  }

  function handleWorkforceRealtimeV770() {
    clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(async () => {
      await refreshWorkforceV770();
      if (AppState.currentTab === 'personal' && !window.V7_FORM_DIRTY) patchWorkforceV771();
    }, 520);
  }

  Object.assign(window, { renderWorkforceV770, refreshWorkforceV770, handleWorkforceRealtimeV770, patchWorkforceV771 });
})();
