/* NATURA VIDA V7.7.1 — entregas integradas, rutas estables y mapa persistente. */
(() => {
  let routeCache = { routes: [], stops: [], deliveries: [], geoEvents: [], requests: [] };
  let routeFilter = 'active';
  let activeRouteId = '';
  let activeMap = null;
  let mapLayerGroup = null;
  let mapLine = null;
  let mapSignature = '';
  let refreshPromise = null;
  let realtimeTimer = null;
  let distributionLoaded = false;

  const esc = value => escapeHtml(String(value == null ? '' : value));
  const sb = () => getSupabaseClient();
  const uidV760 = prefix => window.uid ? uid(prefix) : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const currentUid = () => AppState.session.onlineUserId || AppState.session.userId;
  const admin = () => window.isAdmin && isAdmin();
  const statusLabel = status => ({ planned: 'Planificada', in_progress: 'En ruta', completed: 'Completada', cancelled: 'Cancelada', pending: 'Pendiente', arrived: 'En punto', delivered: 'Entregada', failed: 'No entregada', skipped: 'Omitida' })[status] || status;

  function errorText(error) { return window.messageFromError ? messageFromError(error) : String(error?.message || error || 'Error'); }
  function dateLabel(value) { try { return new Date(`${value}T12:00:00`).toLocaleDateString('es-BO'); } catch (_) { return value || ''; } }
  function routeStops(routeId) { return routeCache.stops.filter(row => row.route_id === routeId).sort((a, b) => Number(a.sequence_no) - Number(b.sequence_no)); }
  function validCoord(value, min, max) { const number = Number(value); return Number.isFinite(number) && number >= min && number <= max; }
  function hasGps(row) { return validCoord(row.latitude, -90, 90) && validCoord(row.longitude, -180, 180); }

  async function refreshDistributionV760() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      if (!sb() || !currentUid()) return { ok: false, message: 'Sesión no disponible.' };
      const [routesRes, stopsRes, deliveriesRes, geoRes, requestsRes] = await Promise.all([
        sb().from('delivery_routes').select('*').order('route_date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
        sb().from('route_stops').select('*').order('sequence_no', { ascending: true }).limit(1200),
        sb().from('deliveries').select('*').order('delivered_at', { ascending: false }).limit(800),
        sb().from('geo_events').select('*').order('created_at', { ascending: false }).limit(800),
        sb().from('delivery_requests').select('*').order('requested_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(500)
      ]);
      const failed = [routesRes, stopsRes, deliveriesRes, geoRes, requestsRes].find(result => result.error);
      if (failed) return { ok: false, message: errorText(failed.error) };
      routeCache = { routes: routesRes.data || [], stops: stopsRes.data || [], deliveries: deliveriesRes.data || [], geoEvents: geoRes.data || [], requests: requestsRes.data || [] };
      distributionLoaded = true;
      return { ok: true, ...routeCache };
    })();
    try { return await refreshPromise; }
    finally { refreshPromise = null; }
  }

  function visibleRoutes() {
    return routeCache.routes.filter(route => routeFilter === 'all' ? true : routeFilter === 'active' ? !['completed', 'cancelled'].includes(route.status) : route.status === routeFilter);
  }

  function routeMetrics() {
    const today = new Date().toISOString().slice(0, 10);
    return {
      todayRoutes: routeCache.routes.filter(route => route.route_date === today).length,
      pendingStops: routeCache.stops.filter(stop => ['pending', 'arrived'].includes(stop.status)).length,
      delivered: routeCache.stops.filter(stop => stop.status === 'delivered').length,
      requests: routeCache.requests.filter(request => request.status === 'pending').length
    };
  }

  function routeCard(route) {
    const stops = routeStops(route.id);
    const done = stops.filter(stop => stop.status === 'delivered').length;
    return `<article class="v760RouteCard"><header><div><h3>${esc(route.route_name || route.route_code)}</h3><small>${dateLabel(route.route_date)} · ${esc(route.driver_name || route.representative_name || 'Sin responsable')}</small></div><em class="v760Status ${esc(route.status)}">${statusLabel(route.status)}</em></header><div class="v760RouteMeta"><span><b>${stops.length}</b>paradas</span><span><b>${done}</b>entregas</span><span><b>${stops.filter(hasGps).length}</b>con GPS</span></div><div class="v760RouteActions"><button class="btn sm" data-open-route="${esc(route.id)}">Abrir ruta</button></div></article>`;
  }

  function deliveryRequestCardV771(request) {
    const items = Array.isArray(request.items) ? request.items : [];
    const detail = items.slice(0, 3).map(item => `${esc(item.productName || item.product_name || item.name || 'Producto')} × ${Number(item.qty || item.quantity || 0)}`).join(' · ');
    const source = request.source_type === 'sale' ? 'Venta' : request.source_type === 'order' ? 'Pedido' : 'Manual';
    return `<label class="nv771DeliveryRequestCard"><input type="checkbox" data-delivery-request="${esc(request.id)}"><span class="nv771RequestCheck">✓</span><span><strong>${esc(request.client_name || 'Destino sin nombre')}</strong><small>${source}${request.source_code ? ` ${esc(request.source_code)}` : ''} · ${request.requested_date ? dateLabel(request.requested_date) : 'Sin fecha'}</small><em>${esc(request.address || request.location_label || 'Dirección pendiente')}</em>${detail ? `<i>${detail}</i>` : ''}</span><b>${fmtMoney(request.amount_due || 0)}</b></label>`;
  }

  function pendingRequestsHtmlV771() {
    const requests = routeCache.requests.filter(request => request.status === 'pending');
    return requests.map(deliveryRequestCardV771).join('') || '<div class="v7Empty small"><span>✓</span><h3>Sin entregas por programar</h3><p>Las ventas y pedidos marcados para entrega aparecerán aquí.</p></div>';
  }

  function listHtml() {
    const metrics = routeMetrics();
    return `<section class="v760RouteHero v770RouteHero"><div class="v770OrganicGlow one"></div><div class="v770OrganicGlow two"></div><span class="v7Eyebrow">Natura Vida V8.0.3</span><h1>Distribución y rutas</h1><p>${admin() ? 'Planifica rutas, asigna responsables y fiscaliza entregas con ubicación y evidencia.' : 'Gestiona tus recorridos, confirma visitas y registra entregas desde el celular.'}</p></section>
      <section class="v7MetricGrid compact nv771RouteMetrics"><article class="v7MetricCard primary"><span>Rutas hoy</span><strong id="distMetricTodayV770">${metrics.todayRoutes}</strong><small>programadas</small></article><article class="v7MetricCard"><span>Paradas</span><strong id="distMetricPendingV770">${metrics.pendingStops}</strong><small>pendientes</small></article><article class="v7MetricCard notification"><span>Entregadas</span><strong id="distMetricDeliveredV770">${metrics.delivered}</strong><small>acumuladas</small></article><article class="v7MetricCard lime"><span>Por programar</span><strong id="distMetricRequestsV771">${metrics.requests}</strong><small>ventas y pedidos</small></article></section>
      <section class="v7Panel nv771DeliveryQueue"><div class="v7PanelHead"><div><span class="v7Eyebrow">Integración operativa</span><h2>Entregas pendientes</h2></div><button class="btn sm" id="planSelectedRequestsV771">Crear ruta</button></div><div class="nv771QueueTools"><button class="btn sm outline" id="selectAllRequestsV771">Seleccionar todas</button><span id="selectedRequestsCountV771">0 seleccionadas</span></div><div id="deliveryRequestListV771" class="nv771DeliveryRequestList">${pendingRequestsHtmlV771()}</div></section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Planificación</span><h2>Rutas de entrega</h2></div><button class="btn sm" id="newRouteV760">+ Ruta manual</button></div>
        <div class="v760RouteFilters"><button data-route-filter="active" class="${routeFilter === 'active' ? 'active' : ''}">Activas</button><button data-route-filter="planned" class="${routeFilter === 'planned' ? 'active' : ''}">Planificadas</button><button data-route-filter="completed" class="${routeFilter === 'completed' ? 'active' : ''}">Completadas</button><button data-route-filter="all" class="${routeFilter === 'all' ? 'active' : ''}">Todas</button></div>
        <div class="v760RouteGrid" id="routeGridV770">${visibleRoutes().map(routeCard).join('') || '<div class="v7Empty"><span>🚚</span><h3>Sin rutas en esta vista</h3><p>Crea una ruta y agrega clientes o puntos de entrega.</p></div>'}</div>
      </section>`;
  }

  function bindDeliveryQueueEventsV771() {
    const updateSelected = () => {
      const count = $all('[data-delivery-request]:checked').length;
      const label = $('#selectedRequestsCountV771');
      if (label) label.textContent = `${count} seleccionada${count === 1 ? '' : 's'}`;
    };
    $all('[data-delivery-request]').forEach(input => { input.onchange = updateSelected; });
    const selectAll = $('#selectAllRequestsV771');
    if (selectAll) selectAll.onclick = () => {
      $all('[data-delivery-request]').forEach(input => { input.checked = true; });
      updateSelected();
    };
    const planButton = $('#planSelectedRequestsV771');
    if (planButton) planButton.onclick = () => {
      const ids = $all('[data-delivery-request]:checked').map(input => input.dataset.deliveryRequest);
      openPlanDeliveryRequestsV771(ids);
    };
    updateSelected();
  }

  function bindListEvents() {
    const newRoute = $('#newRouteV760');
    if (newRoute) newRoute.onclick = openNewRouteV760;
    bindDeliveryQueueEventsV771();
    $all('[data-route-filter]').forEach(button => {
      button.onclick = () => {
        routeFilter = button.dataset.routeFilter;
        $all('[data-route-filter]').forEach(item => item.classList.toggle('active', item.dataset.routeFilter === routeFilter));
        patchRouteListV770();
      };
    });
    bindOpenRouteButtons();
  }

  function bindOpenRouteButtons(root = document) {
    $all('[data-open-route]', root).forEach(button => { button.onclick = () => openRouteDetailV760(button.dataset.openRoute); });
  }

  async function renderDistributionV760(options = {}) {
    $('#fabAdd').classList.add('hidden');
    activeRouteId = '';
    destroyMapV770();
    const main = $('#mainArea');
    if (!distributionLoaded && !options.quiet) main.innerHTML = '<div class="loading">Cargando distribución y rutas…</div>';
    const result = await refreshDistributionV760();
    if (!result.ok) {
      main.innerHTML = `<div class="v7Empty"><span>🗺️</span><h3>No se pudo cargar distribución</h3><p>${esc(result.message)}</p><button class="btn" id="retryDistV760">Reintentar</button></div>`;
      $('#retryDistV760')?.addEventListener('click', renderDistributionV760);
      return;
    }
    main.innerHTML = listHtml();
    bindListEvents();
  }

  function patchRouteListV770() {
    if (AppState.currentTab !== 'distribucion' || activeRouteId) return;
    const metrics = routeMetrics();
    const todayEl = $('#distMetricTodayV770'), pendingEl = $('#distMetricPendingV770'), deliveredEl = $('#distMetricDeliveredV770'), requestsEl = $('#distMetricRequestsV771');
    if (todayEl) todayEl.textContent = metrics.todayRoutes;
    if (pendingEl) pendingEl.textContent = metrics.pendingStops;
    if (deliveredEl) deliveredEl.textContent = metrics.delivered;
    if (requestsEl) requestsEl.textContent = metrics.requests;
    const requestList = $('#deliveryRequestListV771');
    if (requestList) requestList.innerHTML = pendingRequestsHtmlV771();
    const grid = $('#routeGridV770');
    if (grid) {
      grid.innerHTML = visibleRoutes().map(routeCard).join('') || '<div class="v7Empty"><span>🚚</span><h3>Sin rutas en esta vista</h3><p>Crea una ruta y agrega clientes o puntos de entrega.</p></div>';
      bindOpenRouteButtons(grid);
    }
    bindDeliveryQueueEventsV771();
  }

  function openPlanDeliveryRequestsV771(requestIds = []) {
    if (!requestIds.length) return showToast('Selecciona al menos una entrega pendiente.', 'error');
    const date = new Date().toISOString().slice(0,10);
    openSheet(`<h2>Crear ruta desde entregas <span class="x" id="closeSheet">✕</span></h2><div class="v7CashNotice">Se crearán ${requestIds.length} paradas con cliente, dirección, productos, monto y referencia de la venta o pedido.</div><div class="field"><label>Nombre de la ruta</label><input id="planRouteNameV771" value="Ruta de entregas · ${dateLabel(date)}"></div><div class="field"><label>Fecha</label><input id="planRouteDateV771" type="date" value="${date}"></div>${admin() ? `<div class="field"><label>Responsable</label><select id="planRouteRepV771"><option value="${esc(currentUid())}">${esc(AppState.session.fullName || 'Administrador')}</option>${representativeOptions()}</select></div>` : ''}<div class="field"><label>Observaciones</label><textarea id="planRouteNotesV771" placeholder="Zona, vehículo, prioridad u horario"></textarea></div><button class="btn block" id="confirmPlanRouteV771">Crear ruta con ${requestIds.length} entregas</button>`, (overlay, close) => {
      $('#closeSheet',overlay).addEventListener('click',close);
      $('#confirmPlanRouteV771',overlay).addEventListener('click',async()=>{
        const select=$('#planRouteRepV771',overlay); const repId=select?.value || currentUid(); const repName=select ? select.options[select.selectedIndex].text : (AppState.session.fullName||'Responsable');
        const button=$('#confirmPlanRouteV771',overlay); button.disabled=true;button.textContent='Creando ruta y paradas…';
        const result=await planDeliveryRequestsV771(requestIds,{ name:$('#planRouteNameV771',overlay).value.trim(),date:$('#planRouteDateV771',overlay).value,representativeUserId:repId,driverUserId:repId,driverName:repName,notes:$('#planRouteNotesV771',overlay).value.trim() });
        if(!result.ok){button.disabled=false;button.textContent='Reintentar';return showToast(result.message,'error');}
        close();showToast(`Ruta creada con ${result.stops || requestIds.length} entregas.`);await refreshDistributionV760();openRouteDetailV760(result.route_id);
      });
    });
  }

  function representativeOptions() {
    const profiles = (AppState.allProfiles || []).filter(profile => String(profile.role || '').toLowerCase() !== 'administrador' && String(profile.status || '').toLowerCase() === 'activo');
    return profiles.map(profile => `<option value="${esc(profile.id)}">${esc(profile.full_name || profile.email || 'Representante')}</option>`).join('');
  }

  function openNewRouteV760() {
    const date = new Date().toISOString().slice(0, 10);
    openSheet(`<h2>Nueva ruta <span class="x" id="closeSheet">✕</span></h2><div class="v7CashNotice">La ruta queda asociada al responsable. Luego podrás agregar paradas, GPS y evidencia.</div><div class="field"><label>Nombre de la ruta</label><input id="routeNameV760" placeholder="Ej.: Ruta Norte · mercados"></div><div class="field"><label>Fecha</label><input id="routeDateV760" type="date" value="${date}"></div>${admin() ? `<div class="field"><label>Representante / responsable</label><select id="routeRepV760"><option value="">Administrador principal</option>${representativeOptions()}</select></div>` : ''}<div class="field"><label>Observaciones</label><textarea id="routeNotesV760" placeholder="Horario, vehículo, prioridad o zona"></textarea></div><button class="btn block" id="saveRouteV760">Crear ruta</button>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#saveRouteV760', overlay).addEventListener('click', async () => {
        const name = $('#routeNameV760', overlay).value.trim(); if (!name) return showToast('Ingresa un nombre para la ruta.', 'error');
        const repSelect = $('#routeRepV760', overlay); const repId = repSelect?.value || currentUid(); const repName = repSelect?.value ? repSelect.options[repSelect.selectedIndex].text : (AppState.session.fullName || AppState.session.email || 'Administrador');
        const row = { id: uidV760('route'), route_code: `R-${date.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`, route_name: name, route_date: $('#routeDateV760', overlay).value, representative_user_id: repId, representative_name: repName, driver_user_id: repId, driver_name: repName, status: 'planned', notes: $('#routeNotesV760', overlay).value.trim(), created_by: currentUid(), updated_by: currentUid() };
        const button = $('#saveRouteV760', overlay); button.disabled = true; button.textContent = 'Guardando en Supabase…';
        const { error } = await sb().from('delivery_routes').insert(row);
        if (error) { button.disabled = false; button.textContent = 'Reintentar'; return showToast(errorText(error), 'error'); }
        close(); showToast('Ruta creada. Agrega ahora los puntos de entrega.'); await refreshDistributionV760(); openRouteDetailV760(row.id);
      });
    });
  }

  function routeDetailHtml(route) {
    const stops = routeStops(route.id); const done = stops.filter(stop => stop.status === 'delivered').length;
    return `<section class="v7PageHead v770DetailHead"><span class="v7Eyebrow">${esc(route.route_code)}</span><h1>${esc(route.route_name)}</h1><p>${dateLabel(route.route_date)} · ${esc(route.driver_name || route.representative_name || 'Sin responsable')}</p></section>
      <div class="v760RouteActions" id="routeStatusActionsV770">${routeStatusActions(route)}</div>
      <section class="v7MetricGrid compact"><article class="v7MetricCard"><span>Paradas</span><strong id="routeStopsMetricV770">${stops.length}</strong></article><article class="v7MetricCard primary"><span>Entregadas</span><strong id="routeDoneMetricV770">${done}</strong></article><article class="v7MetricCard notification"><span>Avance</span><strong id="routeProgressMetricV770">${stops.length ? Math.round(done / stops.length * 100) : 0}%</strong></article></section>
      <div id="routeMapV760" class="v760Map"></div>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Secuencia</span><h2>Puntos de entrega</h2></div><span class="v770SyncChip" id="routeSyncChipV770">Actualizado</span></div><div class="v760StopList" id="routeStopListV770">${stopsHtml(stops)}</div></section>`;
  }

  function routeStatusActions(route) {
    return `<button class="btn sm outline" id="backDistV760">← Rutas</button><button class="btn sm" id="addStopV760">+ Parada</button>${route.status === 'planned' ? '<button class="btn sm" id="startRouteV760">Iniciar ruta</button>' : ''}${route.status === 'in_progress' ? '<button class="btn sm outline" id="finishRouteV760">Finalizar ruta</button>' : ''}`;
  }

  function stopsHtml(stops) {
    return stops.map(stopCard).join('') || '<div class="v7Empty"><span>📍</span><h3>Ruta sin paradas</h3><p>Agrega clientes o puntos manuales.</p></div>';
  }

  async function openRouteDetailV760(routeId, options = {}) {
    const result = await refreshDistributionV760();
    if (!result.ok) return showToast(result.message, 'error');
    const route = routeCache.routes.find(item => item.id === routeId); if (!route) return showToast('La ruta ya no está disponible.', 'error');
    activeRouteId = routeId;
    const main = $('#mainArea'); const scroll = options.preserveScroll ? window.scrollY : 0;
    main.innerHTML = routeDetailHtml(route);
    bindRouteDetailEvents(route);
    updateRouteMapV770(routeStops(route.id), true);
    if (options.preserveScroll) requestAnimationFrame(() => window.scrollTo({ top: scroll, behavior: 'auto' }));
  }

  function bindRouteDetailEvents(route) {
    $('#backDistV760')?.addEventListener('click', () => renderDistributionV760({ quiet: true }));
    $('#addStopV760')?.addEventListener('click', () => openNewStopV760(route));
    $('#startRouteV760')?.addEventListener('click', () => updateRouteStatusV760(route.id, 'in_progress'));
    $('#finishRouteV760')?.addEventListener('click', () => updateRouteStatusV760(route.id, 'completed'));
    bindStopEvents(route);
  }

  function bindStopEvents(route) {
    $all('[data-arrive-stop]').forEach(button => button.addEventListener('click', () => markArrivalV760(route, button.dataset.arriveStop)));
    $all('[data-deliver-stop]').forEach(button => button.addEventListener('click', () => openDeliveryV760(route, button.dataset.deliverStop)));
    $all('[data-fail-stop]').forEach(button => button.addEventListener('click', () => markStopStatusV760(route, button.dataset.failStop, 'failed')));
    $all('[data-nav-stop]').forEach(button => button.addEventListener('click', () => openNavigationV760(button.dataset.navStop)));
  }

  function patchRouteDetailV770() {
    if (!activeRouteId || AppState.currentTab !== 'distribucion') return;
    const route = routeCache.routes.find(item => item.id === activeRouteId);
    if (!route) { activeRouteId = ''; return renderDistributionV760({ quiet: true }); }
    const stops = routeStops(route.id); const done = stops.filter(stop => stop.status === 'delivered').length;
    const stopsMetric = $('#routeStopsMetricV770'), doneMetric = $('#routeDoneMetricV770'), progressMetric = $('#routeProgressMetricV770');
    if (stopsMetric) stopsMetric.textContent = stops.length;
    if (doneMetric) doneMetric.textContent = done;
    if (progressMetric) progressMetric.textContent = `${stops.length ? Math.round(done / stops.length * 100) : 0}%`;
    const statusActions = $('#routeStatusActionsV770');
    if (statusActions) { statusActions.innerHTML = routeStatusActions(route); bindRouteDetailEvents(route); }
    const list = $('#routeStopListV770');
    if (list) { list.innerHTML = stopsHtml(stops); bindStopEvents(route); }
    updateRouteMapV770(stops, false);
    const chip = $('#routeSyncChipV770');
    if (chip) { chip.textContent = 'Actualizado'; chip.classList.add('pulse'); setTimeout(() => chip.classList.remove('pulse'), 500); }
  }

  function stopCard(stop) {
    const delivery = routeCache.deliveries.find(row => row.route_stop_id === stop.id);
    const geo = delivery ? (delivery.within_geofence ? '<span class="v760GeoBadge ok">✓ dentro de geocerca</span>' : delivery.distance_m != null ? `<span class="v760GeoBadge out">${Math.round(delivery.distance_m)} m del punto</span>` : '') : '';
    const itemText = Array.isArray(stop.items) ? stop.items.slice(0,3).map(item => `${esc(item.productName || item.product_name || item.name || 'Producto')} × ${Number(item.qty || item.quantity || 0)}`).join(' · ') : '';
    return `<article class="v760Stop"><div class="v760StopNumber">${Number(stop.sequence_no || 0)}</div><div><h4>${esc(stop.client_name || 'Punto de entrega')}</h4><p>${esc(stop.address || stop.location_label || 'Sin dirección')}</p>${stop.source_code ? `<small class="nv771StopSource">${esc(stop.source_type === 'sale' ? 'Venta' : stop.source_type === 'order' ? 'Pedido' : 'Origen')} ${esc(stop.source_code)}</small>` : ''}${itemText ? `<small class="nv771StopItems">${itemText}</small>` : ''}<span class="v760Status ${esc(stop.status)}">${statusLabel(stop.status)}</span>${hasGps(stop) ? '<span class="v760GeoBadge">📍 GPS registrado</span>' : '<span class="v760GeoBadge out">GPS pendiente</span>'}${geo}<div class="v760StopActions">${hasGps(stop) ? `<button class="btn sm ghost" data-nav-stop="${esc(stop.id)}">Navegar</button>` : ''}${stop.status === 'pending' ? `<button class="btn sm outline" data-arrive-stop="${esc(stop.id)}">Llegué</button>` : ''}${['pending', 'arrived', 'failed'].includes(stop.status) ? `<button class="btn sm" data-deliver-stop="${esc(stop.id)}">Entregar</button>` : ''}${['pending', 'arrived'].includes(stop.status) ? `<button class="btn sm ghost dangerText" data-fail-stop="${esc(stop.id)}">No entregado</button>` : ''}${delivery?.evidence_url ? `<a class="btn sm outline" href="${esc(delivery.evidence_url)}" target="_blank" rel="noopener">Evidencia</a>` : ''}</div></div></article>`;
  }

  function destroyMapV770() {
    if (activeMap) { try { activeMap.remove(); } catch (_) {} }
    activeMap = null; mapLayerGroup = null; mapLine = null; mapSignature = '';
  }

  function updateRouteMapV770(stops, force = false) {
    const element = document.getElementById('routeMapV760'); if (!element) return;
    const points = stops.filter(hasGps);
    const signature = points.map(stop => `${stop.id}:${Number(stop.latitude).toFixed(6)},${Number(stop.longitude).toFixed(6)}:${stop.status}`).join('|');
    if (!force && activeMap && signature === mapSignature) return;
    if (!window.L) { element.innerHTML = '<div class="v7Empty"><span>🗺️</span><h3>Mapa no disponible</h3><p>La lista de paradas continúa funcionando.</p></div>'; return; }
    if (!activeMap) {
      const center = points.length ? [Number(points[0].latitude), Number(points[0].longitude)] : [-17.7833, -63.1821];
      activeMap = L.map(element, { zoomControl: true }).setView(center, points.length ? 13 : 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(activeMap);
      mapLayerGroup = L.layerGroup().addTo(activeMap);
    }
    mapLayerGroup.clearLayers();
    if (mapLine) { activeMap.removeLayer(mapLine); mapLine = null; }
    const latlngs = [];
    points.forEach(stop => {
      const latlng = [Number(stop.latitude), Number(stop.longitude)]; latlngs.push(latlng);
      L.marker(latlng).addTo(mapLayerGroup).bindPopup(`<b>${Number(stop.sequence_no)}</b> ${esc(stop.client_name || 'Parada')}<br>${esc(stop.address || '')}`);
    });
    if (latlngs.length > 1) { mapLine = L.polyline(latlngs, { weight: 4, opacity: .75 }).addTo(activeMap); activeMap.fitBounds(latlngs, { padding: [28, 28] }); }
    else if (latlngs.length === 1) activeMap.setView(latlngs[0], 15);
    mapSignature = signature;
    setTimeout(() => activeMap?.invalidateSize(), 100);
  }

  function clientOptionsV760() { return (AppState.clients || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map(client => `<option value="${esc(client.id)}">${esc(client.name)}${client.businessName ? ` · ${esc(client.businessName)}` : ''}</option>`).join(''); }

  function openNewStopV760(route) {
    const sequence = routeStops(route.id).reduce((max, stop) => Math.max(max, Number(stop.sequence_no || 0)), 0) + 1;
    openSheet(`<h2>Agregar parada <span class="x" id="closeSheet">✕</span></h2><div class="field"><label>Cliente existente</label><select id="stopClientV760"><option value="">Punto manual</option>${clientOptionsV760()}</select></div><div class="field"><label>Nombre del punto / cliente</label><input id="stopNameV760"></div><div class="field"><label>Dirección o referencia</label><input id="stopAddressV760"></div><div class="field-row"><div class="field"><label>Latitud</label><input id="stopLatV760" type="number" step="any"></div><div class="field"><label>Longitud</label><input id="stopLngV760" type="number" step="any"></div></div><button class="btn ghost block" id="captureStopGpsV760">Usar ubicación actual</button><div class="field"><label>Orden de visita</label><input id="stopSeqV760" type="number" min="1" value="${sequence}"></div><div class="field"><label>Monto por cobrar (opcional)</label><input id="stopDueV760" type="number" min="0" step="0.01"></div><div class="field"><label>Observaciones</label><textarea id="stopNotesV760"></textarea></div><button class="btn block" id="saveStopV760">Guardar parada</button>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#stopClientV760', overlay).addEventListener('change', event => { const client = (AppState.clients || []).find(item => item.id === event.target.value); if (!client) return; $('#stopNameV760', overlay).value = client.businessName || client.name || ''; $('#stopAddressV760', overlay).value = [client.city, client.address, client.locationLabel].filter(Boolean).join(' · '); $('#stopLatV760', overlay).value = client.latitude || ''; $('#stopLngV760', overlay).value = client.longitude || ''; });
      $('#captureStopGpsV760', overlay).addEventListener('click', async () => { const position = await getPositionV760(); if (!position.ok) return showToast(position.message, 'error'); $('#stopLatV760', overlay).value = position.latitude.toFixed(6); $('#stopLngV760', overlay).value = position.longitude.toFixed(6); showToast('Ubicación capturada.'); });
      $('#saveStopV760', overlay).addEventListener('click', async () => {
        const name = $('#stopNameV760', overlay).value.trim(); if (!name) return showToast('Ingresa el cliente o nombre del punto.', 'error');
        const latitude = $('#stopLatV760', overlay).value, longitude = $('#stopLngV760', overlay).value;
        if ((latitude || longitude) && (!validCoord(latitude, -90, 90) || !validCoord(longitude, -180, 180))) return showToast('Revisa la latitud y longitud.', 'error');
        const row = { id: uidV760('stop'), route_id: route.id, sequence_no: Number($('#stopSeqV760', overlay).value || sequence), client_id: $('#stopClientV760', overlay).value || null, client_name: name, address: $('#stopAddressV760', overlay).value.trim(), location_label: $('#stopAddressV760', overlay).value.trim(), latitude: latitude === '' ? null : Number(latitude), longitude: longitude === '' ? null : Number(longitude), status: 'pending', amount_due: Number($('#stopDueV760', overlay).value || 0), notes: $('#stopNotesV760', overlay).value.trim(), created_by: currentUid(), updated_by: currentUid() };
        const button = $('#saveStopV760', overlay); button.disabled = true; button.textContent = 'Guardando…';
        const { error } = await sb().from('route_stops').insert(row);
        if (error) { button.disabled = false; button.textContent = 'Reintentar'; return showToast(errorText(error), 'error'); }
        close(); showToast('Parada agregada.'); await refreshAndPatchV770(route.id);
      });
    });
  }

  function getPositionV760() { return new Promise(resolve => { if (!navigator.geolocation) return resolve({ ok: false, message: 'El dispositivo no permite geolocalización.' }); navigator.geolocation.getCurrentPosition(position => resolve({ ok: true, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }), error => resolve({ ok: false, message: error.code === 1 ? 'Autoriza la ubicación para registrar la entrega.' : 'No se pudo obtener la ubicación.' }), { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }); }); }
  function distanceMeters(aLat, aLng, bLat, bLng) { const R = 6371000, rad = value => value * Math.PI / 180, dLat = rad(bLat - aLat), dLng = rad(bLng - aLng), a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }

  async function refreshAndPatchV770(routeId = activeRouteId) {
    await refreshDistributionV760();
    if (routeId) { activeRouteId = routeId; patchRouteDetailV770(); }
    else patchRouteListV770();
  }

  async function updateRouteStatusV760(id, status) { const { error } = await sb().from('delivery_routes').update({ status, updated_by: currentUid(), updated_at: new Date().toISOString() }).eq('id', id); if (error) return showToast(errorText(error), 'error'); showToast(status === 'completed' ? 'Ruta finalizada.' : 'Ruta iniciada.'); await refreshAndPatchV770(id); }
  async function markStopStatusV760(route, stopId, status) { const { error } = await sb().from('route_stops').update({ status, updated_by: currentUid(), updated_at: new Date().toISOString() }).eq('id', stopId); if (error) return showToast(errorText(error), 'error'); showToast(status === 'failed' ? 'Entrega marcada como no realizada.' : 'Estado actualizado.'); await refreshAndPatchV770(route.id); }
  async function markArrivalV760(route, stopId) { const position = await getPositionV760(); if (!position.ok) return showToast(position.message, 'error'); const now = new Date().toISOString(); const [stopRes, geoRes] = await Promise.all([sb().from('route_stops').update({ status: 'arrived', arrived_at: now, updated_by: currentUid(), updated_at: now }).eq('id', stopId), sb().from('geo_events').insert({ id: uidV760('geo'), user_id: currentUid(), route_id: route.id, route_stop_id: stopId, event_type: 'arrival', latitude: position.latitude, longitude: position.longitude, accuracy_m: position.accuracy })]); if (stopRes.error || geoRes.error) return showToast(errorText(stopRes.error || geoRes.error), 'error'); showToast('Llegada registrada con GPS.'); await refreshAndPatchV770(route.id); }

  async function uploadEvidenceV760(file, deliveryId) { if (!file) return ''; if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type || '')) throw new Error('Usa una foto JPG, PNG o WEBP.'); if (file.size > 8 * 1024 * 1024) throw new Error('La foto supera 8 MB.'); const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg'); const path = `${currentUid()}/deliveries/${deliveryId}.${ext}`; const { error } = await sb().storage.from('payment-assets').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '86400' }); if (error) throw error; const { data } = sb().storage.from('payment-assets').getPublicUrl(path); return data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : ''; }

  function openDeliveryV760(route, stopId) {
    const stop = routeStops(route.id).find(item => item.id === stopId); if (!stop) return;
    openSheet(`<h2>Confirmar entrega <span class="x" id="closeSheet">✕</span></h2><div class="v7CashNotice">Se registrará hora, ubicación y distancia respecto al punto planificado.</div><div class="field"><label>Recibió</label><input id="deliveryRecipientV760" placeholder="Nombre de quien recibe"></div><div class="field"><label>Monto cobrado (opcional)</label><input id="deliveryCollectedV760" type="number" min="0" step="0.01" value="${Number(stop.amount_due || 0)}"></div><label class="v760FileLabel">📷 Adjuntar foto de entrega<input id="deliveryPhotoV760" type="file" accept="image/*" capture="environment"></label><img id="deliveryPreviewV760" class="v760EvidencePreview hidden" alt="Vista previa"><div class="field"><label>Observaciones</label><textarea id="deliveryNoteV760" placeholder="Estado del pedido, faltantes, referencia"></textarea></div><button class="btn block" id="confirmDeliveryV760">Confirmar entrega con GPS</button>`, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#deliveryPhotoV760', overlay).addEventListener('change', event => { const file = event.target.files?.[0], image = $('#deliveryPreviewV760', overlay); if (!file) return; image.src = URL.createObjectURL(file); image.classList.remove('hidden'); });
      $('#confirmDeliveryV760', overlay).addEventListener('click', async () => {
        const position = await getPositionV760(); if (!position.ok) return showToast(position.message, 'error');
        const deliveryId = uidV760('del'); const button = $('#confirmDeliveryV760', overlay); button.disabled = true; button.textContent = 'Guardando evidencia…';
        try {
          const file = $('#deliveryPhotoV760', overlay).files?.[0]; const evidence = await uploadEvidenceV760(file, deliveryId); const distance = hasGps(stop) ? distanceMeters(position.latitude, position.longitude, Number(stop.latitude), Number(stop.longitude)) : null; const now = new Date().toISOString();
          const delivery = { id: deliveryId, route_id: route.id, route_stop_id: stop.id, representative_user_id: route.representative_user_id || currentUid(), client_id: stop.client_id || null, client_name: stop.client_name || '', status: 'delivered', recipient_name: $('#deliveryRecipientV760', overlay).value.trim(), amount_collected: Number($('#deliveryCollectedV760', overlay).value || 0), evidence_url: evidence, evidence_note: $('#deliveryNoteV760', overlay).value.trim(), latitude: position.latitude, longitude: position.longitude, accuracy_m: position.accuracy, distance_m: distance, within_geofence: distance == null ? null : distance <= 100, delivered_at: now, created_by: currentUid() };
          const deliveryRes = await sb().from('deliveries').upsert(delivery, { onConflict: 'route_stop_id' }); if (deliveryRes.error) throw deliveryRes.error;
          const stopRes = await sb().from('route_stops').update({ status: 'delivered', delivered_at: now, updated_by: currentUid(), updated_at: now }).eq('id', stop.id); if (stopRes.error) throw stopRes.error;
          await sb().from('geo_events').insert({ id: uidV760('geo'), user_id: currentUid(), route_id: route.id, route_stop_id: stop.id, event_type: 'delivery', latitude: position.latitude, longitude: position.longitude, accuracy_m: position.accuracy });
          close(); showToast(distance != null && distance > 100 ? `Entrega registrada a ${Math.round(distance)} m del punto planificado.` : 'Entrega confirmada correctamente.'); await refreshAndPatchV770(route.id);
        } catch (error) { button.disabled = false; button.textContent = 'Reintentar'; showToast(errorText(error), 'error'); }
      });
    });
  }

  function openNavigationV760(stopId) { const stop = routeCache.stops.find(item => item.id === stopId); if (!stop || !hasGps(stop)) return showToast('Esta parada no tiene GPS.', 'error'); window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${stop.latitude},${stop.longitude}`)}`, '_blank', 'noopener'); }

  function handleDistributionRealtimeV770() {
    clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(async () => {
      await refreshDistributionV760();
      if (AppState.currentTab !== 'distribucion' || window.V7_FORM_DIRTY) return;
      if (activeRouteId) patchRouteDetailV770(); else patchRouteListV770();
    }, 480);
  }

  Object.assign(window, { renderDistributionV760, refreshDistributionV760, refreshAndPatchV770, openRouteDetailV760, handleDistributionRealtimeV770 });
})();
