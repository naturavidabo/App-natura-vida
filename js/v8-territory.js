/* NATURA VIDA V8.0.4 — registro territorial vinculado, panel de capas corregido y formularios móviles estables. */
(() => {
  const territory = {
    prospects: [], visits: [], events: [], loaded: false,
    view: 'map', ownerFilter: 'all', statusFilter: 'all', search: '',
    map: null, baseLayer: null, fallbackLayer: null, markerLayer: null,
    densityLayer: null, locationLayer: null, temporaryLayer: null,
    markerSignature: '', realtimeTimer: null, tileErrors: 0, tilesLoaded: false,
    provider: 'osm', densityVisible: false, densitySource: 'all', placingPoint: false, fullscreen: false,
    savedView: null, lastFetchAt: 0, markerIndex: new Map(), searchAbort: null, searchTimer: null, searchSerial: 0, layersOpen: false
  };
  const esc = value => escapeHtml(String(value ?? ''));
  const currentUid = () => AppState.session?.onlineUserId || AppState.session?.userId || '';
  const canViewTeam = () => isAdmin() || (window.canManageTeamV800 && canManageTeamV800());
  const canCreateForTeam = () => canViewTeam();
  const BOLIVIA_CENTER = [-16.2902, -63.5887];
  const BOLIVIA_ZOOM = 5;
  const MAP_VIEW_KEY = 'nv801-territory-map-view';

  function mapProspect(row={}) { return {
    id:row.id,ownerUserId:row.owner_user_id,managerUserId:row.manager_user_id,regionName:row.region_name||'',name:row.name||'',businessName:row.business_name||'',phone:row.phone||'',city:row.city||'',address:row.address||'',locationLabel:row.location_label||'',latitude:row.latitude==null?null:Number(row.latitude),longitude:row.longitude==null?null:Number(row.longitude),status:row.status||'prospect',potential:row.potential||'medium',convertedClientId:row.converted_client_id||'',notes:row.notes||'',createdAt:row.created_at?new Date(row.created_at).getTime():Date.now(),updatedAt:row.updated_at?new Date(row.updated_at).getTime():Date.now()
  }; }
  function mapVisit(row={}) { return {
    id:row.id,ownerUserId:row.owner_user_id,managerUserId:row.manager_user_id,regionName:row.region_name||'',prospectId:row.prospect_id||'',clientId:row.client_id||'',targetName:row.target_name||'',visitType:row.visit_type||'prospecting',outcome:row.outcome||'pending',latitude:row.latitude==null?null:Number(row.latitude),longitude:row.longitude==null?null:Number(row.longitude),accuracyM:row.accuracy_m==null?null:Number(row.accuracy_m),visitedAt:row.visited_at?new Date(row.visited_at).getTime():Date.now(),nextActionDate:row.next_action_date||'',notes:row.notes||'',createdAt:row.created_at?new Date(row.created_at).getTime():Date.now()
  }; }
  function mapEvent(row={}) { return { id:row.id,ownerUserId:row.owner_user_id,managerUserId:row.manager_user_id,regionName:row.region_name||'',eventType:row.event_type||'',entityType:row.entity_type||'',entityId:row.entity_id||'',title:row.title||'',summary:row.summary||'',latitude:row.latitude==null?null:Number(row.latitude),longitude:row.longitude==null?null:Number(row.longitude),createdAt:row.created_at?new Date(row.created_at).getTime():Date.now() }; }

  function ownerName(id) { return profileNameV800(id) || (id===currentUid() ? (AppState.session.fullName||AppState.session.email||'Mi cuenta') : 'Usuario'); }
  function ownerOptions(selected='all', includeAll=true) {
    const profiles=(AppState.manageableProfiles||[]).filter(p=>String(p.status||'').toLowerCase()==='activo');
    return `${includeAll?`<option value="all" ${selected==='all'?'selected':''}>Toda la actividad visible</option>`:''}${profiles.map(p=>`<option value="${esc(p.id)}" ${selected===p.id?'selected':''}>${esc(p.full_name||p.email)} · ${esc(roleShortNameV800(p.commercial_role))}</option>`).join('')}`;
  }
  function statusLabel(status) { return ({prospect:'Prospecto',contacted:'Contactado',qualified:'Calificado',converted:'Cliente activo',inactive:'Inactivo',lost:'Descartado'})[status]||status; }
  function outcomeLabel(value) { return ({pending:'Pendiente',no_contact:'Sin contacto',interested:'Interesado',quoted:'Cotizado',sale:'Venta',collection:'Cobranza',not_interested:'No interesado',completed:'Completada'})[value]||value; }
  function visitTypeLabel(value) { return ({prospecting:'Prospección',follow_up:'Seguimiento',sale:'Venta',collection:'Cobranza',delivery:'Entrega',other:'Otra'})[value]||value; }
  function pointValid(item) {
    const rawLat=item?.latitude,rawLng=item?.longitude;
    if(rawLat===null||rawLat===undefined||rawLat===''||rawLng===null||rawLng===undefined||rawLng==='')return false;
    const lat=Number(rawLat),lng=Number(rawLng);
    return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180&&!(lat===0&&lng===0);
  }
  function publicCanManage(userId){ return window.canManageTeamV800&&canManageTeamV800()&&(AppState.manageableProfiles||[]).some(p=>p.id===userId&&p.manager_user_id===currentUid()); }

  async function fetchTerritoryV801(options={}) {
    try {
      const sb=await requireClient();
      const [prospectsRes,visitsRes,eventsRes]=await Promise.all([
        sb.from('territory_prospects').select('*').order('updated_at',{ascending:false}).limit(1000),
        sb.from('territory_visits').select('*').order('visited_at',{ascending:false}).limit(1000),
        sb.from('territory_events').select('*').order('created_at',{ascending:false}).limit(300)
      ]);
      const failed=[prospectsRes,visitsRes,eventsRes].find(r=>r.error); if(failed) throw failed.error;
      territory.prospects=(prospectsRes.data||[]).map(mapProspect);
      territory.visits=(visitsRes.data||[]).map(mapVisit);
      territory.events=(eventsRes.data||[]).map(mapEvent);
      territory.loaded=true; territory.lastFetchAt=Date.now();
      if (!options.skipProfiles && window.fetchManageableProfilesV800) await fetchManageableProfilesV800().catch(()=>{});
      return {ok:true};
    }catch(error){ return {ok:false,message:messageFromError(error)}; }
  }
  const fetchTerritoryV800 = fetchTerritoryV801;

  function visibleOwner(item) { return territory.ownerFilter==='all' || item.ownerUserId===territory.ownerFilter; }
  function filteredProspects() {
    const term=normalizeSearch(territory.search||'');
    return territory.prospects.filter(p=>visibleOwner(p)&&(territory.statusFilter==='all'||p.status===territory.statusFilter)&&(!term||normalizeSearch([p.name,p.businessName,p.phone,p.city,p.address,p.notes].join(' ')).includes(term)));
  }
  function visibleClients() {
    const term=normalizeSearch(territory.search||'');
    return (AppState.clients||[]).filter(c=>(territory.ownerFilter==='all'||c.ownerUserId===territory.ownerFilter)&&(!term||normalizeSearch([c.name,c.businessName,c.phone,c.city,c.address].join(' ')).includes(term)));
  }
  function filteredVisits() { return territory.visits.filter(v=>visibleOwner(v)); }
  function filteredEvents() { return territory.events.filter(e=>visibleOwner(e)); }

  function metricValues(){
    const prospects=filteredProspects(),clients=visibleClients(),visits=filteredVisits();
    const today=new Date().toDateString();
    return {prospects:prospects.filter(p=>!['converted','lost'].includes(p.status)).length,clients:clients.length,visits:visits.filter(v=>new Date(v.visitedAt).toDateString()===today).length,mapped:[...prospects,...clients].filter(pointValid).length};
  }
  function metricHtml() {
    const m=metricValues();
    return `<article class="v7MetricCard"><span>Prospectos</span><strong id="territoryMetricProspects">${m.prospects}</strong><small>en desarrollo</small></article><article class="v7MetricCard"><span>Clientes visibles</span><strong id="territoryMetricClients">${m.clients}</strong><small>cartera territorial</small></article><article class="v7MetricCard"><span>Visitas hoy</span><strong id="territoryMetricVisits">${m.visits}</strong><small>actividad registrada</small></article><article class="v7MetricCard"><span>Puntos con GPS</span><strong id="territoryMetricMapped">${m.mapped}</strong><small>cobertura trazable</small></article>`;
  }

  function prospectCard(p) {
    const canEdit=p.ownerUserId===currentUid()||isAdmin()||publicCanManage(p.ownerUserId);
    return `<article class="v800ProspectCard status-${esc(p.status)}"><div class="v800ProspectHead"><span class="v800MapDot ${esc(p.status)}"></span><div><strong>${esc(p.businessName||p.name)}</strong>${p.businessName&&p.name!==p.businessName?`<span>${esc(p.name)}</span>`:''}<small>${esc(p.city||p.address||'Sin dirección')} · ${esc(ownerName(p.ownerUserId))}</small></div><em>${esc(statusLabel(p.status))}</em></div><div class="v800ProspectMeta"><span>☎ ${esc(p.phone||'sin teléfono')}</span><span>Potencial: ${esc(({low:'Bajo',medium:'Medio',high:'Alto'})[p.potential]||p.potential)}</span><span>${pointValid(p)?'📍 GPS registrado':'○ Sin GPS'}</span></div>${p.notes?`<p>${esc(p.notes)}</p>`:''}<div class="v800CardActions"><button class="btn sm registerVisitV801" data-prospect="${esc(p.id)}">Registrar visita</button>${pointValid(p)?`<button class="btn sm outline locateTerritoryV801" data-kind="prospect" data-id="${esc(p.id)}">Ver mapa</button>`:''}${canEdit?`<button class="btn sm ghost editProspectV801" data-id="${esc(p.id)}">Editar</button>`:''}${p.ownerUserId===currentUid()&&p.status!=='converted'?`<button class="btn sm ghost convertProspectV801" data-id="${esc(p.id)}">Convertir en cliente</button>`:''}</div></article>`;
  }
  function visitCard(v) { return `<article class="v800VisitCard"><span class="v800VisitIcon">${v.visitType==='sale'?'🛒':v.visitType==='collection'?'💳':v.visitType==='delivery'?'🚚':'📍'}</span><div><strong>${esc(v.targetName||'Visita')}</strong><span>${esc(visitTypeLabel(v.visitType))} · ${esc(outcomeLabel(v.outcome))}</span><small>${esc(ownerName(v.ownerUserId))} · ${fmtDateTime(v.visitedAt)}${v.nextActionDate?` · Próxima: ${esc(v.nextActionDate)}`:''}</small>${v.notes?`<p>${esc(v.notes)}</p>`:''}</div>${pointValid(v)?`<button class="btn sm outline locateTerritoryV801" data-kind="visit" data-id="${esc(v.id)}">Mapa</button>`:''}</article>`; }
  function eventCard(e) { return `<article class="v800EventRow"><span>${e.eventType==='visit_registered'?'📍':e.eventType==='prospect_created'?'✦':'↻'}</span><div><strong>${esc(e.title)}</strong><p>${esc(e.summary)}</p><small>${esc(ownerName(e.ownerUserId))} · ${fmtDateTime(e.createdAt)}</small></div></article>`; }

  function mapPanelHtml(){
    return `<section class="v800MapPanel v802MapPanel" id="territoryMapPanelV801">
      <div class="v800MapToolbar v802MapToolbar"><div><strong>Mapa territorial</strong><span>Clientes, visitas y cobertura</span></div><button class="v801MapIconBtn" id="fullscreenMapV801" title="Ampliar mapa" aria-label="Ampliar mapa">⛶</button></div>
      <div class="v802MapSearchShell" id="mapSearchShellV802">
        <div class="v801MapSearch"><span class="v802SearchIcon">⌕</span><input id="mapAddressSearchV801" autocomplete="off" inputmode="search" placeholder="Buscar cliente, tienda, calle o mercado"><button id="runMapSearchV801" aria-label="Buscar">Buscar</button></div>
        <div id="mapSearchResultsV801" class="v801MapSearchResults hidden" role="listbox"></div>
      </div>
      <div class="v801MapActions v802MapActions"><button id="myLocationV801"><span>⌖</span> Mi ubicación</button><button id="placePointV801"><span>＋</span> Marcar punto</button><button id="mapLayersV802" class="v802LayersButton" aria-expanded="${territory.layersOpen?'true':'false'}"><span>◫</span> Capas</button></div>
      <div class="v802MapLayerMenu ${territory.layersOpen?'':'hidden'}" id="mapLayerMenuV802">
        <div class="v802LayerRow"><span><b>Vista cartográfica</b><small>Calles y referencias del mapa</small></span><button id="retryTilesV801">↻ Recargar</button></div>
        <label class="v802DensityControl"><span><b>Densidad territorial</b><small id="densitySummaryV802">${territory.densityVisible?'Capa activa':'Capa desactivada'}</small></span><input type="checkbox" id="densityToggleV801" ${territory.densityVisible?'checked':''}></label>
        <label class="v802DensitySource"><span>Analizar</span><select id="densitySourceV802"><option value="all" ${territory.densitySource==='all'?'selected':''}>Toda la actividad</option><option value="clients" ${territory.densitySource==='clients'?'selected':''}>Clientes</option><option value="prospects" ${territory.densitySource==='prospects'?'selected':''}>Prospectos</option><option value="visits" ${territory.densitySource==='visits'?'selected':''}>Visitas</option></select></label>
        <div class="v803LayerFooter"><button type="button" id="closeLayersV804">Continuar</button></div>
      </div>
      <div class="v801MapWrap"><div class="v801MapStatus" id="mapStatusV801"><span class="spinner"></span><b>Cargando calles…</b><small>Conectando con la cartografía</small></div><div id="territoryMapV801" class="v800TerritoryMap"></div></div>
      <div class="v800MapLegend"><span><i></i>Clientes</span><span><i class="prospect"></i>Prospectos</span><span><i class="qualified"></i>Calificados</span><span><i class="inactive"></i>Inactivos</span><span class="v802DensityLegend ${territory.densityVisible?'':'hidden'}" id="densityLegendV802"><i></i>Densidad baja–alta</span></div>
    </section>`;
  }

  function contentHtml() {
    const prospects=filteredProspects(),visits=filteredVisits(),events=filteredEvents();
    if(territory.view==='prospects') return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Desarrollo comercial</span><h2>Prospectos</h2></div><button class="btn sm" id="newProspectV801">Nuevo prospecto</button></div><div class="v800ProspectList" id="territoryProspectList">${prospects.map(prospectCard).join('')||'<div class="v7Empty"><span>✦</span><h3>Sin prospectos</h3><p>Registra tiendas y personas potenciales desde el trabajo de campo.</p></div>'}</div></section>`;
    if(territory.view==='visits') return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Trabajo de campo</span><h2>Visitas</h2></div><button class="btn sm" id="newVisitV801">Registrar visita</button></div><div class="v800VisitList">${visits.map(visitCard).join('')||'<div class="v7Empty"><span>📍</span><h3>Sin visitas</h3><p>Registra cada recorrido, resultado y próxima acción.</p></div>'}</div></section>`;
    if(territory.view==='activity') return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Realtime silencioso</span><h2>Actividad territorial</h2></div></div><div class="v800EventList">${events.map(eventCard).join('')||'<div class="v7Empty"><span>↻</span><h3>Sin actividad</h3><p>Las novedades del equipo aparecerán aquí sin recargar la pantalla.</p></div>'}</div></section>`;
    return mapPanelHtml();
  }

  async function renderTerritoryV801() {
    $('#fabAdd').classList.add('hidden'); const main=$('#mainArea');
    if(!territory.loaded) main.innerHTML='<div class="loading">Preparando territorio…</div>';
    const result=await fetchTerritoryV801();
    if(!result.ok){main.innerHTML=`<div class="v7Empty"><span>⚠️</span><h3>No se pudo cargar Territorio</h3><p>${esc(result.message)}</p><button class="btn" id="retryTerritoryV801">Reintentar</button></div>`;$('#retryTerritoryV801')?.addEventListener('click',renderTerritoryV801);return;}
    main.innerHTML=`<section class="v800ModuleHero territory v802TerritoryHero"><span class="v800Orb one"></span><span class="v800Orb two"></span><span class="v7Eyebrow">Territorio Natura Vida</span><h1>Clientes, prospectos y cobertura</h1><p>Busca, ubica y registra el trabajo comercial desde un mapa estable.</p></section><section class="v7MetricGrid v802TerritoryMetrics" id="territoryMetricGrid">${metricHtml()}</section><section class="v800TerritoryControls v802TerritoryControls"><div class="v800ViewTabs">${[['map','Mapa'],['prospects','Prospectos'],['visits','Visitas'],['activity','Actividad']].map(([id,label])=>`<button data-view="${id}" class="${territory.view===id?'active':''}">${label}</button>`).join('')}</div><div class="v800TerritoryFilters ${territory.view==='map'?'mapMode':''}">${canViewTeam()?`<select id="territoryOwnerFilter">${ownerOptions(territory.ownerFilter,true)}</select>`:''}<select id="territoryStatusFilter"><option value="all">Todos los estados</option>${['prospect','contacted','qualified','converted','inactive','lost'].map(s=>`<option value="${s}" ${territory.statusFilter===s?'selected':''}>${statusLabel(s)}</option>`).join('')}</select>${territory.view==='map'?'':`<input id="territorySearch" placeholder="Filtrar cartera por nombre o zona" value="${esc(territory.search)}">`}</div></section><div id="territoryDynamicContent">${contentHtml()}</div>`;
    bindTerritoryControlsV801(); if(territory.view==='map') setTimeout(initTerritoryMapV801,60);
  }
  const renderTerritoryV800=renderTerritoryV801;

  function bindTerritoryControlsV801(){
    $all('.v800ViewTabs button').forEach(btn=>btn.onclick=()=>{closeMapLayersV804();closeMapSearchV802();territory.view=btn.dataset.view;patchTerritoryV801({rebuildContent:true});});
    $('#territoryOwnerFilter')?.addEventListener('change',e=>{territory.ownerFilter=e.target.value;patchTerritoryV801({rebuildContent:true,fit:true});});
    $('#territoryStatusFilter')?.addEventListener('change',e=>{territory.statusFilter=e.target.value;patchTerritoryV801({rebuildContent:true,fit:true});});
    $('#territorySearch')?.addEventListener('input',e=>{territory.search=e.target.value;clearTimeout(territory.searchTimer);territory.searchTimer=setTimeout(()=>patchTerritoryV801({rebuildContent:true,fit:true}),220);});
    bindDynamicTerritoryActionsV801();
  }
  function bindDynamicTerritoryActionsV801(){
    $('#newProspectV801')?.addEventListener('click',()=>openProspectFormV801());
    $('#newVisitV801')?.addEventListener('click',()=>openVisitFormV801());
    $all('.editProspectV801').forEach(b=>b.onclick=()=>openProspectFormV801(b.dataset.id));
    $all('.registerVisitV801').forEach(b=>b.onclick=()=>openVisitFormV801({prospectId:b.dataset.prospect}));
    $all('.convertProspectV801').forEach(b=>b.onclick=()=>convertProspectV801(b.dataset.id));
    $all('.locateTerritoryV801').forEach(b=>b.onclick=()=>locateItemV801(b.dataset.kind,b.dataset.id));
  }

  function patchMetricsV801(){const m=metricValues();[['Prospects','prospects'],['Clients','clients'],['Visits','visits'],['Mapped','mapped']].forEach(([id,key])=>{const el=$(`#territoryMetric${id}`);if(el&&String(el.textContent)!==String(m[key]))el.textContent=String(m[key]);});}
  function patchTerritoryV801(options={}){
    if(AppState.currentTab!=='territorio')return false;
    patchMetricsV801();
    const dynamic=$('#territoryDynamicContent');
    if(options.rebuildContent&&dynamic){
      if(territory.view!=='map'&&territory.map) destroyTerritoryMapV801();
      dynamic.innerHTML=contentHtml(); bindDynamicTerritoryActionsV801();
      if(territory.view==='map')setTimeout(()=>initTerritoryMapV801({fit:options.fit}),45);
    }else if(territory.view==='map'&&territory.map){updateTerritoryMarkersV801({fit:!!options.fit});}
    return true;
  }

  function readSavedMapViewV801(){try{return JSON.parse(localStorage.getItem(MAP_VIEW_KEY)||'null');}catch(_){return null;}}
  function saveMapViewV801(){if(!territory.map)return;const c=territory.map.getCenter();try{localStorage.setItem(MAP_VIEW_KEY,JSON.stringify({lat:c.lat,lng:c.lng,zoom:territory.map.getZoom()}));}catch(_){}}
  function mapStatusV801(type,title,detail=''){
    const el=$('#mapStatusV801');if(!el)return;
    el.className=`v801MapStatus ${type||''}`;
    el.innerHTML=type==='hidden'?'':`${type==='loading'?'<span class="spinner"></span>':type==='error'?'<span>!</span>':'<span>✓</span>'}<b>${esc(title)}</b><small>${esc(detail)}</small>`;
  }
  function removeBaseLayersV801(){if(!territory.map)return;[territory.baseLayer,territory.fallbackLayer].forEach(layer=>{if(layer&&territory.map.hasLayer(layer))territory.map.removeLayer(layer);});territory.baseLayer=null;territory.fallbackLayer=null;}
  function addMapProviderV801(provider='osm'){
    if(!territory.map||!window.L)return;
    removeBaseLayersV801();territory.provider=provider;territory.tileErrors=0;territory.tilesLoaded=false;mapStatusV801('loading','Cargando calles…',provider==='osm'?'OpenStreetMap':'Cartografía alternativa');
    const options={maxZoom:19,crossOrigin:true,updateWhenIdle:true,keepBuffer:3};
    const url=provider==='osm'?'https://tile.openstreetmap.org/{z}/{x}/{y}.png':'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    const attr=provider==='osm'?'© OpenStreetMap':'© OpenStreetMap · CARTO';
    const layer=L.tileLayer(url,Object.assign({},options,{attribution:attr}));
    territory.baseLayer=layer.addTo(territory.map);
    layer.on('load',()=>{territory.tilesLoaded=true;mapStatusV801('hidden','','');});
    layer.on('tileerror',()=>{territory.tileErrors+=1;if(territory.tileErrors>=4&&!territory.tilesLoaded&&provider==='osm'){addMapProviderV801('carto');}else if(territory.tileErrors>=8&&!territory.tilesLoaded){mapStatusV801('error','No se pudieron cargar las calles','Revisa internet y pulsa ↻ Mapa.');}});
    setTimeout(()=>{if(!territory.tilesLoaded&&territory.provider===provider){if(provider==='osm')addMapProviderV801('carto');else mapStatusV801('error','Cartografía no disponible','Tu ubicación y puntos siguen guardados. Reintenta cuando haya conexión.');}},8000);
  }
  function destroyTerritoryMapV801(){if(territory.map){saveMapViewV801();territory.map.remove();}territory.map=null;territory.baseLayer=null;territory.markerLayer=null;territory.densityLayer=null;territory.locationLayer=null;territory.temporaryLayer=null;territory.markerSignature='';territory.markerIndex=new Map();}

  function initTerritoryMapV801(options={}){
    const container=$('#territoryMapV801');if(!container)return;
    if(!window.L){mapStatusV801('error','No cargó el motor del mapa','Pulsa ↻ Mapa o revisa la conexión.');return;}
    if(territory.map&&territory.map.getContainer()!==container)destroyTerritoryMapV801();
    if(!territory.map){
      territory.map=L.map(container,{zoomControl:true,preferCanvas:true,attributionControl:true});
      territory.markerLayer=L.layerGroup().addTo(territory.map);territory.densityLayer=L.layerGroup().addTo(territory.map);territory.locationLayer=L.layerGroup().addTo(territory.map);territory.temporaryLayer=L.layerGroup().addTo(territory.map);
      const saved=readSavedMapViewV801();if(saved&&Number.isFinite(saved.lat)&&Number.isFinite(saved.lng))territory.map.setView([saved.lat,saved.lng],saved.zoom||BOLIVIA_ZOOM);else territory.map.setView(BOLIVIA_CENTER,BOLIVIA_ZOOM);
      territory.map.on('moveend zoomend',saveMapViewV801);
      territory.map.on('click',e=>{if(!territory.placingPoint)return;territory.placingPoint=false;$('#placePointV801')?.classList.remove('active');showTemporaryPointV801(e.latlng.lat,e.latlng.lng,true);});
      addMapProviderV801('osm');
    }
    bindMapControlsV801();updateTerritoryMarkersV801({fit:options.fit||!readSavedMapViewV801()});setTimeout(()=>territory.map?.invalidateSize({pan:false}),120);
  }

  function clientPointV801(c){return {kind:'client',id:c.id,name:c.businessName||c.name||'Cliente',businessName:c.businessName||'',status:'converted',ownerUserId:c.ownerUserId,latitude:Number(c.latitude),longitude:Number(c.longitude),phone:c.phone||'',city:c.city||'',address:c.address||'',locationLabel:c.locationLabel||c.location||''};}
  function mapProspectsV802(){return (territory.prospects||[]).filter(p=>visibleOwner(p)&&(territory.statusFilter==='all'||p.status===territory.statusFilter));}
  function mapClientsV802(){return (AppState.clients||[]).filter(c=>territory.ownerFilter==='all'||c.ownerUserId===territory.ownerFilter||c.sellerId===territory.ownerFilter);}
  function mapPointsV801(){return [...mapProspectsV802().filter(pointValid).map(p=>Object.assign({kind:'prospect'},p)),...mapClientsV802().filter(pointValid).map(clientPointV801)];}
  function densityPointsV802(){
    const clients=mapClientsV802().filter(pointValid).map(c=>Object.assign({kind:'client'},clientPointV801(c)));
    const prospects=mapProspectsV802().filter(pointValid).map(p=>Object.assign({kind:'prospect'},p));
    const visits=(territory.visits||[]).filter(visibleOwner).filter(pointValid).map(v=>Object.assign({kind:'visit'},v));
    if(territory.densitySource==='clients')return clients;
    if(territory.densitySource==='prospects')return prospects;
    if(territory.densitySource==='visits')return visits;
    return [...clients,...prospects,...visits];
  }
  function markerColorV801(p){if(p.kind==='client'||p.status==='converted')return'#078c55';if(p.status==='qualified')return'#8fc91f';if(['inactive','lost'].includes(p.status))return'#74877d';if(p.status==='contacted')return'#42a96b';return'#f0a83b';}
  function markerIconV801(p){return L.divIcon({className:'v800LeafletMarkerWrap',html:`<span class="v800LeafletMarker" style="--marker:${markerColorV801(p)}">${p.kind==='client'?'C':'P'}</span>`,iconSize:[34,34],iconAnchor:[17,31]});}
  function updateDensitySummaryV802(count=0){
    const text=$('#densitySummaryV802');if(text)text.textContent=territory.densityVisible?(count?`${count} punto(s) representados`:'Sin puntos GPS para esta capa'):'Capa desactivada';
    $('#densityLegendV802')?.classList.toggle('hidden',!territory.densityVisible||!count);
  }
  function updateTerritoryMarkersV801(options={}){
    if(!territory.map||!territory.markerLayer)return;
    const points=mapPointsV801();const densityPoints=densityPointsV802();const densitySignature=densityPoints.map(p=>`${p.kind}:${p.id||''}:${p.latitude}:${p.longitude}`).sort().join('|');const signature=points.map(p=>`${p.kind}:${p.id}:${p.latitude}:${p.longitude}:${p.status}`).sort().join('|')+`|d:${territory.densityVisible}:${territory.densitySource}:${densitySignature}`;
    if(signature===territory.markerSignature&&!options.fit)return;
    territory.markerSignature=signature;territory.markerLayer.clearLayers();territory.densityLayer?.clearLayers();territory.markerIndex=new Map();
    const bounds=[];
    points.forEach(p=>{const latlng=[Number(p.latitude),Number(p.longitude)];bounds.push(latlng);const marker=L.marker(latlng,{icon:markerIconV801(p)}).bindPopup(`<div class="v801MapPopup"><strong>${esc(p.businessName||p.name)}</strong><span>${esc(statusLabel(p.status))} · ${esc(ownerName(p.ownerUserId))}</span><small>${esc(p.address||p.locationLabel||p.city||'Sin dirección')}</small>${p.phone?`<a href="https://wa.me/${String(p.phone).replace(/\D/g,'')}" target="_blank" rel="noopener">WhatsApp</a>`:''}<button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}','_blank')">Navegar</button></div>`);territory.markerLayer.addLayer(marker);territory.markerIndex.set(`${p.kind}:${p.id}`,marker);});
    if(territory.densityVisible){
      const grouped=new Map();densityPoints.forEach(p=>{const lat=Number(p.latitude),lng=Number(p.longitude);const key=`${lat.toFixed(2)},${lng.toFixed(2)}`;const row=grouped.get(key)||{lat,lng,count:0};row.count+=1;grouped.set(key,row);});
      const max=Math.max(1,...[...grouped.values()].map(g=>g.count));
      grouped.forEach(g=>{const level=g.count/max;const color=level>.66?'#df7b27':level>.33?'#d9b72d':'#75b83c';const radius=Math.min(1700,Math.max(320,320+g.count*190));territory.densityLayer.addLayer(L.circle([g.lat,g.lng],{radius,color,weight:2,fillColor:color,fillOpacity:.18,interactive:false}));territory.densityLayer.addLayer(L.circleMarker([g.lat,g.lng],{radius:Math.min(25,8+g.count*2.5),color:'#fff',weight:2,fillColor:color,fillOpacity:.68,interactive:false}));});
      updateDensitySummaryV802(densityPoints.length);
    }else updateDensitySummaryV802(0);
    if(options.fit&&bounds.length){territory.map.fitBounds(bounds,{padding:[36,36],maxZoom:15});}
    else if(options.fit&&!bounds.length)territory.map.setView(BOLIVIA_CENTER,BOLIVIA_ZOOM);
  }

  function closeMapLayersV804(){
    territory.layersOpen=false;
    $('#mapLayerMenuV802')?.classList.add('hidden');
    const button=$('#mapLayersV802');
    if(button)button.setAttribute('aria-expanded','false');
  }
  function prepareTerritorySheetV804(){
    closeMapLayersV804();
    closeMapSearchV802();
    document.activeElement?.blur();
  }

  function bindMapControlsV801(){
    $('#fullscreenMapV801')?.addEventListener('click',toggleMapFullscreenV801);
    $('#myLocationV801')?.addEventListener('click',centerMyLocationV801);
    $('#placePointV801')?.addEventListener('click',e=>{territory.placingPoint=!territory.placingPoint;e.currentTarget.classList.toggle('active',territory.placingPoint);showToast(territory.placingPoint?'Toca el lugar exacto en el mapa.':'Marcación cancelada.');});
    $('#mapLayersV802')?.addEventListener('click',e=>{territory.layersOpen=!territory.layersOpen;$('#mapLayerMenuV802')?.classList.toggle('hidden',!territory.layersOpen);e.currentTarget.setAttribute('aria-expanded',territory.layersOpen?'true':'false');});
    $('#closeLayersV804')?.addEventListener('click',()=>{closeMapLayersV804();showToast('Vista del mapa aplicada.');});
    $('#densityToggleV801')?.addEventListener('change',e=>{territory.densityVisible=e.target.checked;territory.markerSignature='';updateTerritoryMarkersV801();const count=densityPointsV802().length;showToast(territory.densityVisible?(count?`Densidad activada con ${count} punto(s).`:'No hay puntos GPS para mostrar densidad.'):'Densidad desactivada.',territory.densityVisible&&!count?'error':undefined);});
    $('#densitySourceV802')?.addEventListener('change',e=>{territory.densitySource=e.target.value;territory.markerSignature='';updateTerritoryMarkersV801();});
    $('#retryTilesV801')?.addEventListener('click',()=>addMapProviderV801(territory.provider==='osm'?'carto':'osm'));
    $('#runMapSearchV801')?.addEventListener('click',()=>searchMapAddressV801({forceExternal:true}));
    const input=$('#mapAddressSearchV801');
    input?.addEventListener('focus',()=>{$('#territoryMapPanelV801')?.classList.add('v802MapSearchActive');setTimeout(()=>input.scrollIntoView({block:'start',behavior:'smooth'}),60);if(input.value.trim().length>=2)searchMapAddressV801();});
    input?.addEventListener('input',()=>{clearTimeout(territory.searchTimer);territory.searchTimer=setTimeout(()=>searchMapAddressV801(),320);});
    input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchMapAddressV801({forceExternal:true});}if(e.key==='Escape')closeMapSearchV802();});
    if(!document.body.dataset.nv802MapSearchBound){document.body.dataset.nv802MapSearchBound='1';document.addEventListener('click',event=>{if(!event.target.closest('#mapSearchShellV802'))closeMapSearchV802();});}
    if(!document.body.dataset.nv803MapLayersBound){document.body.dataset.nv803MapLayersBound='1';document.addEventListener('click',event=>{if(territory.layersOpen&&!event.target.closest('#mapLayerMenuV802')&&!event.target.closest('#mapLayersV802'))closeMapLayersV804();});}
  }
  function toggleMapFullscreenV801(){const panel=$('#territoryMapPanelV801');if(!panel)return;territory.fullscreen=!territory.fullscreen;panel.classList.toggle('v801MapFullscreen',territory.fullscreen);document.body.classList.toggle('nv801MapOpen',territory.fullscreen);$('#fullscreenMapV801').textContent=territory.fullscreen?'✕':'⛶';setTimeout(()=>territory.map?.invalidateSize({pan:false}),180);}
  function centerMyLocationV801(){const btn=$('#myLocationV801');if(!navigator.geolocation)return showToast('Este dispositivo no permite geolocalización.','error');btn.disabled=true;btn.innerHTML='<span>⌖</span> Ubicando…';navigator.geolocation.getCurrentPosition(pos=>{btn.disabled=false;btn.innerHTML='<span>⌖</span> Mi ubicación';const lat=Number(pos.coords.latitude),lng=Number(pos.coords.longitude),accuracy=Number(pos.coords.accuracy||0);territory.locationLayer.clearLayers();const marker=L.marker([lat,lng]).bindPopup(`<strong>Mi ubicación</strong><br>Precisión aproximada: ${Math.round(accuracy)} m`).addTo(territory.locationLayer);L.circle([lat,lng],{radius:Math.min(Math.max(accuracy,8),150),color:'#0b9360',weight:2,fillColor:'#6fd69b',fillOpacity:.12,interactive:false}).addTo(territory.locationLayer);territory.map.setView([lat,lng],Math.max(16,territory.map.getZoom()));marker.openPopup();},err=>{btn.disabled=false;btn.innerHTML='<span>⌖</span> Mi ubicación';const message=err.code===1?'Permiso de ubicación denegado. Autorízalo en el navegador.':err.code===2?'El GPS no pudo determinar la ubicación. Actívalo y reintenta.':err.code===3?'La ubicación tardó demasiado. Reintenta en un lugar con mejor señal.':'No se pudo obtener la ubicación.';showToast(message,'error');},{enableHighAccuracy:true,timeout:18000,maximumAge:30000});}
  function showTemporaryPointV801(lat,lng,openForm=false,label='Punto seleccionado'){territory.temporaryLayer?.clearLayers();const marker=L.marker([lat,lng],{draggable:true}).addTo(territory.temporaryLayer).bindPopup(`<strong>${esc(label)}</strong><br><button id="createHereV801">Registrar prospecto aquí</button>`).openPopup();marker.on('dragend',()=>{const p=marker.getLatLng();lat=p.lat;lng=p.lng;});setTimeout(()=>$('#createHereV801')?.addEventListener('click',()=>openProspectFormV801('',{latitude:lat,longitude:lng,locationLabel:label})),60);if(openForm)showToast('Punto marcado. Ajusta el pin o registra el prospecto.');}
  function closeMapSearchV802(){
    $('#mapSearchResultsV801')?.classList.add('hidden');
    $('#territoryMapPanelV801')?.classList.remove('v802MapSearchActive');
  }
  function mapResultTypeV802(kind){return ({client:'Cliente',prospect:'Prospecto',visit:'Visita',address:'Ubicación'})[kind]||'Resultado';}
  function localMapResultsV802(query){
    const term=normalizeSearch(query);if(term.length<2)return[];
    const rows=[];
    const clients=(AppState.clients||[]).filter(c=>territory.ownerFilter==='all'||c.ownerUserId===territory.ownerFilter||c.sellerId===territory.ownerFilter);
    const prospects=(territory.prospects||[]).filter(p=>visibleOwner(p)&&(territory.statusFilter==='all'||p.status===territory.statusFilter));
    clients.forEach(c=>{const text=normalizeSearch([c.name,c.businessName,c.phone,c.city,c.address,c.locationLabel].join(' '));if(text.includes(term))rows.push({kind:'client',id:c.id,title:c.businessName||c.name||'Cliente',detail:[c.phone,c.city||c.address,pointValid(c)?'GPS registrado':'Sin GPS'].filter(Boolean).join(' · '),latitude:c.latitude,longitude:c.longitude,item:c});});
    prospects.forEach(p=>{const text=normalizeSearch([p.name,p.businessName,p.phone,p.city,p.address,p.locationLabel].join(' '));if(text.includes(term))rows.push({kind:'prospect',id:p.id,title:p.businessName||p.name||'Prospecto',detail:[p.phone,p.city||p.address,pointValid(p)?'GPS registrado':'Sin GPS'].filter(Boolean).join(' · '),latitude:p.latitude,longitude:p.longitude,item:p});});
    return rows.sort((a,b)=>{const an=normalizeSearch(a.title),bn=normalizeSearch(b.title);const ap=an.startsWith(term)?0:1,bp=bn.startsWith(term)?0:1;return ap-bp||an.localeCompare(bn);}).slice(0,7);
  }
  function renderMapSearchResultsV802(localRows=[],externalRows=[],loading=false,message=''){
    const box=$('#mapSearchResultsV801');if(!box)return;
    const rows=[...localRows,...externalRows];box.classList.remove('hidden');
    if(!rows.length&&!loading){box.innerHTML=`<p>${esc(message||'No se encontraron coincidencias.')}</p>`;return;}
    box.innerHTML=`${localRows.length?'<div class="v802ResultGroup">Registros Natura Vida</div>':''}${localRows.map((r,i)=>`<button class="v802MapResult internal" data-result-kind="${esc(r.kind)}" data-result-index="${i}"><span class="v802ResultBadge ${esc(r.kind)}">${esc(mapResultTypeV802(r.kind))}</span><strong>${esc(r.title)}</strong><small>${esc(r.detail)}</small></button>`).join('')}${externalRows.length?'<div class="v802ResultGroup">Calles y lugares</div>':''}${externalRows.map((r,i)=>`<button class="v802MapResult address" data-address-index="${i}"><span class="v802ResultBadge address">Ubicación</span><strong>${esc((r.display_name||'').split(',')[0])}</strong><small>${esc(r.display_name||'')}</small></button>`).join('')}${loading?'<div class="v801MapResultLoading"><span class="spinner"></span> Buscando calles y lugares…</div>':''}`;
    $all('[data-result-index]',box).forEach(btn=>btn.onclick=()=>selectLocalMapResultV802(localRows[Number(btn.dataset.resultIndex)]));
    $all('[data-address-index]',box).forEach(btn=>btn.onclick=()=>selectExternalMapResultV802(externalRows[Number(btn.dataset.addressIndex)]));
  }
  function selectLocalMapResultV802(result){
    if(!result)return;
    if(pointValid(result)){const lat=Number(result.latitude),lng=Number(result.longitude);territory.map?.setView([lat,lng],17);const marker=territory.markerIndex.get(`${result.kind}:${result.id}`);if(marker)setTimeout(()=>marker.openPopup(),120);closeMapSearchV802();document.activeElement?.blur();return;}
    closeMapSearchV802();
    if(result.kind==='client'){showToast('Cliente encontrado. Completa o captura su ubicación.');openProspectFormV801('',{clientId:result.id});return;}
    if(result.kind==='prospect'){showToast('Prospecto encontrado. Completa o captura su ubicación.');openProspectFormV801(result.id);return;}
    showToast(`${mapResultTypeV802(result.kind)} encontrado, pero todavía no tiene ubicación GPS.`, 'error');
  }
  function selectExternalMapResultV802(result){if(!result)return;const lat=Number(result.lat),lng=Number(result.lon);territory.map?.setView([lat,lng],17);showTemporaryPointV801(lat,lng,false,result.display_name||'Ubicación encontrada');closeMapSearchV802();document.activeElement?.blur();}
  async function searchMapAddressV801(options={}){
    const input=$('#mapAddressSearchV801');const q=input?.value.trim();if(!q){closeMapSearchV802();if(options.forceExternal)showToast('Escribe un cliente, calle, mercado, tienda o ciudad.','error');return;}
    const localRows=localMapResultsV802(q);const doExternal=options.forceExternal||q.length>=3;
    renderMapSearchResultsV802(localRows,[],doExternal,'No se encontraron registros internos.');
    if(!doExternal)return;
    if(territory.searchAbort)territory.searchAbort.abort();territory.searchAbort=new AbortController();const serial=++territory.searchSerial;
    try{const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=bo&limit=6&addressdetails=1&accept-language=es&q=${encodeURIComponent(q)}`;const response=await fetch(url,{headers:{Accept:'application/json'},signal:territory.searchAbort.signal,cache:'no-store'});if(!response.ok)throw new Error('Servicio de búsqueda no disponible');const rows=await response.json();if(serial!==territory.searchSerial)return;renderMapSearchResultsV802(localRows,rows||[],false,localRows.length?'':'No se encontraron resultados en Bolivia.');}catch(error){if(error.name==='AbortError')return;renderMapSearchResultsV802(localRows,[],false,localRows.length?'':'No se pudo buscar la ubicación. Revisa la conexión y reintenta.');}
  }
  function locateItemV801(kind,id){territory.view='map';patchTerritoryV801({rebuildContent:true});setTimeout(()=>{const item=kind==='prospect'?territory.prospects.find(p=>p.id===id):kind==='client'?(AppState.clients||[]).find(c=>c.id===id):territory.visits.find(v=>v.id===id);if(item&&pointValid(item)&&territory.map){territory.map.setView([Number(item.latitude),Number(item.longitude)],17);territory.markerIndex.get(`${kind}:${id}`)?.openPopup();}},160);}

  function getGps(button){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('Este dispositivo no permite geolocalización.'));button.disabled=true;button.textContent='Capturando GPS…';navigator.geolocation.getCurrentPosition(pos=>{button.disabled=false;button.textContent='GPS capturado';resolve({latitude:Number(pos.coords.latitude.toFixed(6)),longitude:Number(pos.coords.longitude.toFixed(6)),accuracy:Number(pos.coords.accuracy||0)});},err=>{button.disabled=false;button.textContent='Capturar ubicación actual';reject(new Error(err.code===1?'Debes autorizar la ubicación en el navegador.':err.message||'No se pudo obtener la ubicación.'));},{enableHighAccuracy:true,timeout:18000,maximumAge:10000});});}

  function openProspectFormV801(id='',prefill={}){
    prepareTerritorySheetV804();
    const current=territory.prospects.find(p=>p.id===id)||{};
    let linkedClient=(AppState.clients||[]).find(c=>c.id===(prefill.clientId||''))||null;
    let lat=prefill.latitude??current.latitude??linkedClient?.latitude??'',lng=prefill.longitude??current.longitude??linkedClient?.longitude??'';
    const initialBusiness=current.businessName||current.name||linkedClient?.businessName||linkedClient?.name||'';
    const initialName=current.name||linkedClient?.name||'';
    const initialPhone=current.phone||linkedClient?.phone||'';
    const initialCity=current.city||linkedClient?.city||AppState.session?.operationCity||AppState.session?.city||'';
    const initialAddress=current.address||linkedClient?.address||'';
    const initialLocation=prefill.locationLabel||current.locationLabel||linkedClient?.locationLabel||linkedClient?.location||'';
    const initialNotes=current.notes||linkedClient?.notes||'';
    openSheet(`<h2>${id?'Editar prospecto':'Registro territorial'} <span class="x" id="closeSheet">✕</span></h2><div class="v803TerritoryFormNotice"><strong>Busca antes de registrar</strong><span>Escribe un nombre y selecciona un cliente existente para completar WhatsApp, ciudad, dirección y georreferencia.</span></div>${canCreateForTeam()?`<div class="field"><label>Responsable de la cuenta</label><select id="tpOwner">${ownerOptions(current.ownerUserId||linkedClient?.ownerUserId||currentUid(),false)}</select></div>`:''}<div class="field"><label>Tienda, prospecto o cliente existente</label><div class="clientAutocompleteV802"><input id="tpBusiness" autocomplete="off" value="${esc(initialBusiness)}" placeholder="Ej.: Gloria, Biomujer o nombre de tienda"><div id="tpClientSuggestionsV804" class="clientSuggestionsV802 hidden"></div></div><small class="clientAssistV802">Desde 2 letras se muestran clientes parecidos. Al elegir uno se rellenan sus datos.</small></div><div id="tpLinkedClientV804" class="v803LinkedClient ${linkedClient?'':'hidden'}"></div><div class="field-row"><div class="field"><label>Persona de contacto</label><input id="tpName" value="${esc(initialName)}"></div><div class="field"><label>WhatsApp</label><input id="tpPhone" inputmode="tel" value="${esc(initialPhone)}"></div></div><div class="field-row"><div class="field"><label>Ciudad</label><input id="tpCity" value="${esc(initialCity)}"></div><div class="field" id="tpPotentialFieldV804"><label>Potencial</label><select id="tpPotential"><option value="low" ${current.potential==='low'?'selected':''}>Bajo</option><option value="medium" ${!current.potential||current.potential==='medium'?'selected':''}>Medio</option><option value="high" ${current.potential==='high'?'selected':''}>Alto</option></select></div></div><div class="field"><label>Dirección / referencia</label><input id="tpAddress" value="${esc(initialAddress)}"></div><div class="field" id="tpStatusFieldV804"><label>Estado</label><select id="tpStatus">${['prospect','contacted','qualified','converted','inactive','lost'].map(s=>`<option value="${s}" ${current.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}</select></div><div class="field-row"><div class="field"><label>Latitud</label><input id="tpLat" inputmode="decimal" value="${lat}"></div><div class="field"><label>Longitud</label><input id="tpLng" inputmode="decimal" value="${lng}"></div></div><button class="btn ghost block" id="tpGps">Capturar ubicación actual</button><div class="field"><label>Dato de ubicación</label><input id="tpLocation" value="${esc(initialLocation)}"></div><div class="field"><label>Observaciones</label><textarea id="tpNotes" rows="3">${esc(initialNotes)}</textarea></div><div class="stickyActions v803TerritoryActions"><button type="button" class="btn outline" id="cancelProspectV804">Cancelar</button><button class="btn" id="saveProspectV801">${linkedClient?'Actualizar cliente y ubicación':'Guardar prospecto'}</button></div>`,(overlay,close)=>{
      const businessInput=$('#tpBusiness',overlay), linkedBox=$('#tpLinkedClientV804',overlay), saveButton=$('#saveProspectV801',overlay);
      const renderLinkedClient=()=>{
        linkedBox.classList.toggle('hidden',!linkedClient);
        $('#tpPotentialFieldV804',overlay)?.classList.toggle('hidden',!!linkedClient);
        $('#tpStatusFieldV804',overlay)?.classList.toggle('hidden',!!linkedClient);
        if(!linkedClient){linkedBox.innerHTML='';saveButton.textContent=id?'Guardar cambios':'Guardar prospecto';return;}
        linkedBox.innerHTML=`<span>✓</span><div><strong>Cliente existente vinculado</strong><small>${esc([linkedClient.businessName||linkedClient.name,linkedClient.phone||'sin WhatsApp',linkedClient.city||linkedClient.address].filter(Boolean).join(' · '))}</small></div><button type="button" id="unlinkClientV804">Cambiar</button>`;
        saveButton.textContent='Actualizar cliente y ubicación';
        $('#unlinkClientV804',overlay)?.addEventListener('click',()=>{linkedClient=null;renderLinkedClient();businessInput.focus();});
      };
      const fillFromClient=client=>{
        linkedClient=client;
        businessInput.value=client.businessName||client.name||'';
        $('#tpName',overlay).value=client.name||client.businessName||'';
        $('#tpPhone',overlay).value=client.phone||'';
        $('#tpCity',overlay).value=client.city||'';
        $('#tpAddress',overlay).value=client.address||'';
        lat=client.latitude??'';lng=client.longitude??'';
        $('#tpLat',overlay).value=lat;$('#tpLng',overlay).value=lng;
        $('#tpLocation',overlay).value=client.locationLabel||client.location||'';
        $('#tpNotes',overlay).value=client.notes||'';
        renderLinkedClient();
        showToast('Datos del cliente completados. Ahora puedes capturar o corregir su ubicación.');
      };
      renderLinkedClient();
      if(window.bindClientAutocompleteV802)bindClientAutocompleteV802({input:businessInput,container:$('#tpClientSuggestionsV804',overlay),limit:7,onTyping:value=>{if(linkedClient){const selectedName=linkedClient.businessName||linkedClient.name||'';if(normalizeSearch(value)!==normalizeSearch(selectedName)){linkedClient=null;renderLinkedClient();}}},onSelect:fillFromClient});
      $('#closeSheet',overlay).onclick=close;$('#cancelProspectV804',overlay).onclick=close;
      $('#tpGps',overlay).onclick=async()=>{try{const gps=await getGps($('#tpGps',overlay));lat=gps.latitude;lng=gps.longitude;$('#tpLat',overlay).value=lat;$('#tpLng',overlay).value=lng;if(!$('#tpLocation',overlay).value.trim())$('#tpLocation',overlay).value=`GPS ${lat}, ${lng}`;showToast('Ubicación capturada. Pulsa Guardar para aplicarla.');}catch(error){showToast(error.message,'error');}};
      saveButton.onclick=async()=>{
        const business=businessInput.value.trim(),name=$('#tpName',overlay).value.trim();if(!business&&!name)return showToast('Ingresa el nombre del prospecto, tienda o cliente.','error');
        lat=$('#tpLat',overlay).value.trim();lng=$('#tpLng',overlay).value.trim();if((lat&&!Number.isFinite(Number(lat)))||(lng&&!Number.isFinite(Number(lng))))return showToast('Revisa las coordenadas ingresadas.','error');
        saveButton.disabled=true;saveButton.textContent='Guardando…';
        try{
          if(linkedClient){
            const updated=buildClientRecordV723(linkedClient,{name:name||linkedClient.name||business,businessName:business||linkedClient.businessName,phone:$('#tpPhone',overlay).value.trim(),city:$('#tpCity',overlay).value.trim(),address:$('#tpAddress',overlay).value.trim(),locationLabel:$('#tpLocation',overlay).value.trim(),latitude:lat===''?'':Number(lat),longitude:lng===''?'':Number(lng),notes:$('#tpNotes',overlay).value.trim()});
            await saveClientV723(updated);territory.markerSignature='';close();showToast('Cliente actualizado y vinculado al mapa.');patchTerritoryV801({fit:pointValid(updated)});return;
          }
          const sb=await requireClient();const row={id:id||uid('pros'),owner_user_id:$('#tpOwner',overlay)?.value||current.ownerUserId||currentUid(),name:name||business,business_name:business,phone:$('#tpPhone',overlay).value.trim(),city:$('#tpCity',overlay).value.trim(),address:$('#tpAddress',overlay).value.trim(),location_label:$('#tpLocation',overlay).value.trim(),latitude:lat===''?null:Number(lat),longitude:lng===''?null:Number(lng),status:$('#tpStatus',overlay).value,potential:$('#tpPotential',overlay).value,notes:$('#tpNotes',overlay).value.trim()};const {error}=await sb.from('territory_prospects').upsert(row,{onConflict:'id'});if(error)throw error;close();showToast('Prospecto guardado.');await fetchTerritoryV801({skipProfiles:true});patchTerritoryV801({rebuildContent:true});
        }catch(error){saveButton.disabled=false;saveButton.textContent=linkedClient?'Reintentar actualización':'Reintentar';showToast(messageFromError(error),'error');}
      };
      if(linkedClient)fillFromClient(linkedClient);
    });
  }

  function targetOptions(selectedProspect='',selectedClient=''){return `<optgroup label="Prospectos">${territory.prospects.map(p=>`<option value="p:${esc(p.id)}" ${selectedProspect===p.id?'selected':''}>${esc(p.businessName||p.name)} · ${esc(ownerName(p.ownerUserId))}</option>`).join('')}</optgroup><optgroup label="Clientes">${(AppState.clients||[]).map(c=>`<option value="c:${esc(c.id)}" ${selectedClient===c.id?'selected':''}>${esc(c.businessName||c.name)} · ${esc(ownerName(c.ownerUserId))}</option>`).join('')}</optgroup>`;}
  function openVisitFormV801(prefill={}){prepareTerritorySheetV804();let lat='',lng='',accuracy=null;const selected=`${prefill.prospectId?'p:'+prefill.prospectId:prefill.clientId?'c:'+prefill.clientId:''}`;openSheet(`<h2>Registrar visita <span class="x" id="closeSheet">✕</span></h2>${canCreateForTeam()?`<div class="field"><label>Persona que realizó la visita</label><select id="tvOwner">${ownerOptions(prefill.ownerUserId||currentUid(),false)}</select></div>`:''}<div class="field"><label>Cliente o prospecto</label><select id="tvTarget"><option value="">Seleccionar…</option>${targetOptions(prefill.prospectId,prefill.clientId)}</select></div><div class="field-row"><div class="field"><label>Tipo de visita</label><select id="tvType"><option value="prospecting">Prospección</option><option value="follow_up">Seguimiento</option><option value="sale">Venta</option><option value="collection">Cobranza</option><option value="delivery">Entrega</option><option value="other">Otra</option></select></div><div class="field"><label>Resultado</label><select id="tvOutcome"><option value="pending">Pendiente</option><option value="no_contact">Sin contacto</option><option value="interested">Interesado</option><option value="quoted">Cotizado</option><option value="sale">Venta</option><option value="collection">Cobranza</option><option value="not_interested">No interesado</option><option value="completed">Completada</option></select></div></div><div class="field"><label>Próxima acción</label><input id="tvNext" type="date"></div><button class="btn ghost block" id="tvGps">Registrar ubicación de la visita</button><div class="field"><label>Observaciones</label><textarea id="tvNotes" rows="4" placeholder="Resultado, pedido, necesidad o próximo paso"></textarea></div><button class="btn block" id="saveVisitV801">Guardar visita</button>`,(overlay,close)=>{$('#closeSheet',overlay).onclick=close;if(selected)$('#tvTarget',overlay).value=selected;$('#tvGps',overlay).onclick=async()=>{try{const gps=await getGps($('#tvGps',overlay));lat=gps.latitude;lng=gps.longitude;accuracy=gps.accuracy;showToast('Ubicación de visita capturada.');}catch(error){showToast(error.message,'error');}};$('#saveVisitV801',overlay).onclick=async()=>{const raw=$('#tvTarget',overlay).value;if(!raw)return showToast('Selecciona un cliente o prospecto.','error');const [kind,id]=raw.split(':');const target=kind==='p'?territory.prospects.find(p=>p.id===id):(AppState.clients||[]).find(c=>c.id===id);if(!target)return showToast('No se encontró el punto seleccionado.','error');const btn=$('#saveVisitV801',overlay);btn.disabled=true;btn.textContent='Guardando…';try{const sb=await requireClient();const row={id:uid('visit'),owner_user_id:$('#tvOwner',overlay)?.value||currentUid(),prospect_id:kind==='p'?id:null,client_id:kind==='c'?id:null,target_name:target.businessName||target.name||'Visita',visit_type:$('#tvType',overlay).value,outcome:$('#tvOutcome',overlay).value,latitude:lat===''?(pointValid(target)?Number(target.latitude):null):Number(lat),longitude:lng===''?(pointValid(target)?Number(target.longitude):null):Number(lng),accuracy_m:accuracy,next_action_date:$('#tvNext',overlay).value||null,notes:$('#tvNotes',overlay).value.trim(),visited_at:new Date().toISOString()};const {error}=await sb.from('territory_visits').insert(row);if(error)throw error;close();showToast('Visita registrada.');await fetchTerritoryV801({skipProfiles:true});patchTerritoryV801({rebuildContent:true});}catch(error){btn.disabled=false;btn.textContent='Reintentar';showToast(messageFromError(error),'error');}};});}

  async function convertProspectV801(id){const p=territory.prospects.find(x=>x.id===id);if(!p||p.ownerUserId!==currentUid())return showToast('Solo el responsable puede convertir este prospecto.','error');if(!confirm(`¿Convertir ${p.businessName||p.name} en cliente?`))return;try{const client=buildClientRecordV723({}, {name:p.businessName||p.name,phone:p.phone,customerType:'wholesale',businessName:p.businessName||p.name,city:p.city,address:p.address,latitude:p.latitude??'',longitude:p.longitude??'',locationLabel:p.locationLabel,notes:p.notes,ownerUserId:p.ownerUserId});await saveClientV723(client);const sb=await requireClient();const {error}=await sb.from('territory_prospects').update({status:'converted',converted_client_id:client.id}).eq('id',id);if(error)throw error;showToast('Prospecto convertido en cliente.');await fetchTerritoryV801({skipProfiles:true});patchTerritoryV801({rebuildContent:true});}catch(error){showToast(messageFromError(error),'error');}}

  function handleTerritoryRealtimeV801(){clearTimeout(territory.realtimeTimer);territory.realtimeTimer=setTimeout(async()=>{const result=await fetchTerritoryV801({skipProfiles:true});if(result.ok&&AppState.currentTab==='territorio'&&!window.V7_FORM_DIRTY){patchTerritoryV801({rebuildContent:territory.view!=='map'});}},650);}
  function nv801PatchTerritoryView(context={}){if(AppState.currentTab!=='territorio')return false;patchTerritoryV801({rebuildContent:territory.view!=='map'});return true;}

  Object.assign(window,{renderTerritoryV801,renderTerritoryV800,fetchTerritoryV801,fetchTerritoryV800,handleTerritoryRealtimeV801,handleTerritoryRealtimeV800:handleTerritoryRealtimeV801,nv801PatchTerritoryView});
})();
