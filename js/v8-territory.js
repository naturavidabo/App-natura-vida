/* NATURA VIDA V8.0.0 XD — territorio, prospectos, visitas y mapa comercial. */
(() => {
  const territory = {
    prospects: [], visits: [], events: [], loaded: false,
    view: 'map', ownerFilter: 'all', statusFilter: 'all', search: '',
    map: null, layer: null, densityLayer: null, markerSignature: '', realtimeTimer: null
  };
  const esc = value => escapeHtml(String(value ?? ''));
  const currentUid = () => AppState.session?.onlineUserId || AppState.session?.userId || '';
  const canViewTeam = () => isAdmin() || (window.canManageTeamV800 && canManageTeamV800());
  const canCreateForTeam = () => canViewTeam();

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
  function statusLabel(status) { return ({prospect:'Prospecto',contacted:'Contactado',qualified:'Calificado',converted:'Cliente convertido',inactive:'Inactivo',lost:'Descartado'})[status]||status; }
  function outcomeLabel(value) { return ({pending:'Pendiente',no_contact:'Sin contacto',interested:'Interesado',quoted:'Cotizado',sale:'Venta',collection:'Cobranza',not_interested:'No interesado',completed:'Completada'})[value]||value; }
  function visitTypeLabel(value) { return ({prospecting:'Prospección',follow_up:'Seguimiento',sale:'Venta',collection:'Cobranza',delivery:'Entrega',other:'Otra'})[value]||value; }
  function pointValid(item) { return Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude)); }

  async function fetchTerritoryV800() {
    try {
      const sb=await requireClient();
      const [prospectsRes,visitsRes,eventsRes,profilesRes]=await Promise.all([
        sb.from('territory_prospects').select('*').order('updated_at',{ascending:false}).limit(1000),
        sb.from('territory_visits').select('*').order('visited_at',{ascending:false}).limit(1000),
        sb.from('territory_events').select('*').order('created_at',{ascending:false}).limit(300),
        fetchManageableProfilesV800()
      ]);
      const failed=[prospectsRes,visitsRes,eventsRes].find(r=>r.error); if(failed) throw failed.error;
      territory.prospects=(prospectsRes.data||[]).map(mapProspect);
      territory.visits=(visitsRes.data||[]).map(mapVisit);
      territory.events=(eventsRes.data||[]).map(mapEvent);
      territory.loaded=true;
      return {ok:true};
    }catch(error){ return {ok:false,message:messageFromError(error)}; }
  }

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

  function metricHtml() {
    const prospects=filteredProspects(),clients=visibleClients(),visits=filteredVisits();
    const today=new Date().toDateString(); const todayVisits=visits.filter(v=>new Date(v.visitedAt).toDateString()===today);
    const mapped=[...prospects,...clients].filter(pointValid).length;
    return `<article class="v7MetricCard"><span>Prospectos</span><strong id="territoryMetricProspects">${prospects.filter(p=>!['converted','lost'].includes(p.status)).length}</strong><small>en desarrollo</small></article><article class="v7MetricCard"><span>Clientes visibles</span><strong id="territoryMetricClients">${clients.length}</strong><small>cartera territorial</small></article><article class="v7MetricCard"><span>Visitas hoy</span><strong id="territoryMetricVisits">${todayVisits.length}</strong><small>actividad registrada</small></article><article class="v7MetricCard"><span>Puntos con GPS</span><strong id="territoryMetricMapped">${mapped}</strong><small>cobertura trazable</small></article>`;
  }

  function prospectCard(p) {
    const owner=ownerName(p.ownerUserId); const canEdit=p.ownerUserId===currentUid()||isAdmin()||publicCanManage(p.ownerUserId);
    return `<article class="v800ProspectCard status-${esc(p.status)}"><div class="v800ProspectHead"><span class="v800MapDot ${esc(p.status)}"></span><div><strong>${esc(p.businessName||p.name)}</strong>${p.businessName&&p.name!==p.businessName?`<span>${esc(p.name)}</span>`:''}<small>${esc(p.city||p.address||'Sin dirección')} · ${esc(owner)}</small></div><em>${esc(statusLabel(p.status))}</em></div><div class="v800ProspectMeta"><span>☎ ${esc(p.phone||'sin teléfono')}</span><span>Potencial: ${esc(({low:'Bajo',medium:'Medio',high:'Alto'})[p.potential]||p.potential)}</span><span>${pointValid(p)?'📍 GPS registrado':'○ Sin GPS'}</span></div>${p.notes?`<p>${esc(p.notes)}</p>`:''}<div class="v800CardActions"><button class="btn sm registerVisitV800" data-prospect="${esc(p.id)}">Registrar visita</button>${pointValid(p)?`<button class="btn sm outline locateTerritoryV800" data-kind="prospect" data-id="${esc(p.id)}">Ver mapa</button>`:''}${canEdit?`<button class="btn sm ghost editProspectV800" data-id="${esc(p.id)}">Editar</button>`:''}${p.ownerUserId===currentUid()&&p.status!=='converted'?`<button class="btn sm ghost convertProspectV800" data-id="${esc(p.id)}">Convertir en cliente</button>`:''}</div></article>`;
  }
  function visitCard(v) { return `<article class="v800VisitCard"><span class="v800VisitIcon">${v.visitType==='sale'?'🛒':v.visitType==='collection'?'💳':v.visitType==='delivery'?'🚚':'📍'}</span><div><strong>${esc(v.targetName||'Visita')}</strong><span>${esc(visitTypeLabel(v.visitType))} · ${esc(outcomeLabel(v.outcome))}</span><small>${esc(ownerName(v.ownerUserId))} · ${fmtDateTime(v.visitedAt)}${v.nextActionDate?` · Próxima: ${esc(v.nextActionDate)}`:''}</small>${v.notes?`<p>${esc(v.notes)}</p>`:''}</div>${pointValid(v)?`<button class="btn sm outline locateTerritoryV800" data-kind="visit" data-id="${esc(v.id)}">Mapa</button>`:''}</article>`; }
  function eventCard(e) { return `<article class="v800EventRow"><span>${e.eventType==='visit_registered'?'📍':e.eventType==='prospect_created'?'✦':'↻'}</span><div><strong>${esc(e.title)}</strong><p>${esc(e.summary)}</p><small>${esc(ownerName(e.ownerUserId))} · ${fmtDateTime(e.createdAt)}</small></div></article>`; }
  function publicCanManage(userId){ return window.canManageTeamV800&&canManageTeamV800()&&(AppState.manageableProfiles||[]).some(p=>p.id===userId&&p.manager_user_id===currentUid()); }

  function contentHtml() {
    const prospects=filteredProspects(),visits=filteredVisits(),events=filteredEvents();
    if(territory.view==='prospects') return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Desarrollo comercial</span><h2>Prospectos</h2></div><button class="btn sm" id="newProspectV800">Nuevo prospecto</button></div><div class="v800ProspectList" id="territoryProspectList">${prospects.map(prospectCard).join('')||'<div class="v7Empty"><span>✦</span><h3>Sin prospectos</h3><p>Registra tiendas y personas potenciales desde el trabajo de campo.</p></div>'}</div></section>`;
    if(territory.view==='visits') return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Trabajo de campo</span><h2>Visitas</h2></div><button class="btn sm" id="newVisitV800">Registrar visita</button></div><div class="v800VisitList" id="territoryVisitList">${visits.map(visitCard).join('')||'<div class="v7Empty"><span>📍</span><h3>Sin visitas</h3><p>Las visitas y resultados aparecerán aquí.</p></div>'}</div></section>`;
    if(territory.view==='activity') return `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Actualización silenciosa</span><h2>Actividad territorial</h2></div><span class="v770SyncChip">Realtime</span></div><div class="v800EventList" id="territoryEventList">${events.map(eventCard).join('')||'<div class="v7Empty"><span>🌿</span><h3>Sin actividad</h3><p>Los nuevos prospectos y visitas aparecerán sin recargar la pantalla.</p></div>'}</div></section>`;
    return `<section class="v800MapPanel"><div class="v800MapToolbar"><div><strong>Mapa territorial</strong><span>Clientes, prospectos, visitas y densidad comercial</span></div><label class="v800DensityToggle"><input type="checkbox" id="territoryDensityV800" checked> Densidad</label></div><div id="territoryMapV800" class="v800TerritoryMap"></div><div class="v800MapLegend"><span><i class="client"></i>Clientes</span><span><i class="prospect"></i>Prospectos</span><span><i class="qualified"></i>Calificados</span><span><i class="inactive"></i>Inactivos</span></div></section>`;
  }

  function fullHtml() {
    if(!canViewTeam()) territory.ownerFilter=currentUid();
    return `<section class="v800ModuleHero territory"><span class="v800Orb one"></span><span class="v800Orb two"></span><span class="v7Eyebrow">Territorio V8 XD</span><h1>Clientes, prospectos y actividad de campo</h1><p>Cada visita y punto GPS construye progresivamente el mapa comercial de Natura Vida, sin mezclarlo con el registro laboral de Personal.</p></section>
      <section class="v7MetricGrid compact v800TerritoryMetrics">${metricHtml()}</section>
      <section class="v800TerritoryControls"><div class="v800ViewTabs">${[['map','Mapa'],['prospects','Prospectos'],['visits','Visitas'],['activity','Actividad']].map(([id,label])=>`<button data-territory-view="${id}" class="${territory.view===id?'active':''}">${label}</button>`).join('')}</div><div class="v800TerritoryFilters">${canViewTeam()?`<select id="territoryOwnerFilter">${ownerOptions(territory.ownerFilter,true)}</select>`:''}<select id="territoryStatusFilter"><option value="all">Todos los estados</option>${['prospect','contacted','qualified','converted','inactive','lost'].map(s=>`<option value="${s}" ${territory.statusFilter===s?'selected':''}>${statusLabel(s)}</option>`).join('')}</select><input id="territorySearch" placeholder="Buscar tienda, cliente o zona" value="${esc(territory.search)}"></div></section>
      <div id="territoryContentV800">${contentHtml()}</div>`;
  }

  async function renderTerritoryV800(options={}) {
    $('#fabAdd').classList.add('hidden'); const main=$('#mainArea');
    if(!territory.loaded&&!options.silent) main.innerHTML='<div class="loading">Cargando territorio…</div>';
    const result=await fetchTerritoryV800();
    if(!result.ok){ if(territory.loaded&&options.silent)return; main.innerHTML=`<div class="v7Empty"><span>⚠️</span><h3>No se pudo cargar Territorio</h3><p>${esc(result.message)}</p><button class="btn" id="retryTerritoryV800">Reintentar</button></div>`; $('#retryTerritoryV800')?.addEventListener('click',renderTerritoryV800); return; }
    if(options.patch&&$('#territoryContentV800')) return patchTerritoryV800();
    main.innerHTML=fullHtml(); bindTerritoryEvents(); if(territory.view==='map')setTimeout(initTerritoryMapV800,60);
  }

  function patchTerritoryV800(){
    if(AppState.currentTab!=='territorio'||window.V7_FORM_DIRTY)return;
    const metrics=$('.v800TerritoryMetrics'); if(metrics)metrics.innerHTML=metricHtml();
    const content=$('#territoryContentV800'); if(content&&territory.view!=='map'){content.innerHTML=contentHtml();bindContentEvents();}
    if(territory.view==='map')updateTerritoryMapV800();
  }

  function bindTerritoryEvents(){
    $all('[data-territory-view]').forEach(button=>button.addEventListener('click',()=>{territory.view=button.dataset.territoryView; $all('[data-territory-view]').forEach(x=>x.classList.toggle('active',x===button)); const content=$('#territoryContentV800'); if(content)content.innerHTML=contentHtml();bindContentEvents();if(territory.view==='map')setTimeout(initTerritoryMapV800,40);}));
    $('#territoryOwnerFilter')?.addEventListener('change',e=>{territory.ownerFilter=e.target.value;patchTerritoryV800();});
    $('#territoryStatusFilter')?.addEventListener('change',e=>{territory.statusFilter=e.target.value;patchTerritoryV800();});
    $('#territorySearch')?.addEventListener('input',e=>{territory.search=e.target.value;clearTimeout(e.target._t);e.target._t=setTimeout(patchTerritoryV800,180);});
    bindContentEvents();
  }
  function bindContentEvents(){
    $('#newProspectV800')?.addEventListener('click',()=>openProspectFormV800());
    $('#newVisitV800')?.addEventListener('click',()=>openVisitFormV800());
    $('#territoryDensityV800')?.addEventListener('change',updateTerritoryMapV800);
    $all('.editProspectV800').forEach(b=>b.addEventListener('click',()=>openProspectFormV800(b.dataset.id)));
    $all('.registerVisitV800').forEach(b=>b.addEventListener('click',()=>openVisitFormV800({prospectId:b.dataset.prospect})));
    $all('.locateTerritoryV800').forEach(b=>b.addEventListener('click',()=>locatePointV800(b.dataset.kind,b.dataset.id)));
    $all('.convertProspectV800').forEach(b=>b.addEventListener('click',()=>convertProspectV800(b.dataset.id)));
  }

  function pointCollection(){
    const points=[];
    visibleClients().filter(pointValid).forEach(c=>points.push({kind:'client',id:c.id,name:c.businessName||c.name,lat:Number(c.latitude),lng:Number(c.longitude),status:commercialStatusV723(c).label,owner:c.ownerUserId}));
    filteredProspects().filter(pointValid).forEach(p=>points.push({kind:'prospect',id:p.id,name:p.businessName||p.name,lat:Number(p.latitude),lng:Number(p.longitude),status:p.status,owner:p.ownerUserId}));
    return points;
  }
  function markerColor(point){ if(point.kind==='client')return '#0a8f55'; return ({qualified:'#9bcf22',contacted:'#44b36f',inactive:'#7a8b82',lost:'#ad5f5f',converted:'#0a8f55'})[point.status]||'#f0a83b'; }
  function initTerritoryMapV800(){
    const el=$('#territoryMapV800'); if(!el||!window.L)return;
    if(territory.map){territory.map.remove();territory.map=null;}
    territory.map=L.map(el,{zoomControl:true,attributionControl:true}).setView([-17.7833,-63.1821],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(territory.map);
    territory.layer=L.layerGroup().addTo(territory.map); territory.densityLayer=L.layerGroup().addTo(territory.map); territory.markerSignature='';
    updateTerritoryMapV800(true); setTimeout(()=>territory.map?.invalidateSize(),180);
  }
  function densityGroups(points){const map=new Map();points.forEach(p=>{const key=`${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;const row=map.get(key)||{lat:0,lng:0,count:0};row.lat+=p.lat;row.lng+=p.lng;row.count++;map.set(key,row);});return Array.from(map.values()).map(r=>({lat:r.lat/r.count,lng:r.lng/r.count,count:r.count}));}
  function updateTerritoryMapV800(fit=false){
    if(!territory.map||!territory.layer)return; const points=pointCollection(); const signature=points.map(p=>`${p.kind}:${p.id}:${p.lat}:${p.lng}:${p.status}`).join('|');
    if(signature!==territory.markerSignature){territory.layer.clearLayers();points.forEach(p=>{const icon=L.divIcon({className:'v800LeafletMarkerWrap',html:`<span class="v800LeafletMarker" style="--marker:${markerColor(p)}">${p.kind==='client'?'C':'P'}</span>`,iconSize:[32,38],iconAnchor:[16,34]});L.marker([p.lat,p.lng],{icon}).bindPopup(`<strong>${esc(p.name)}</strong><br>${p.kind==='client'?'Cliente':'Prospecto'} · ${esc(p.status)}<br><small>${esc(ownerName(p.owner))}</small>`).addTo(territory.layer);});territory.markerSignature=signature;if((fit||!territory._fitDone)&&points.length){territory.map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lng])).pad(.18),{maxZoom:15});territory._fitDone=true;}}
    territory.densityLayer?.clearLayers(); if($('#territoryDensityV800')?.checked!==false){densityGroups(points).filter(g=>g.count>=2).forEach(g=>L.circle([g.lat,g.lng],{radius:Math.min(900,180+g.count*85),color:'#70b92b',weight:1,fillColor:'#9ddc39',fillOpacity:Math.min(.34,.12+g.count*.035)}).bindTooltip(`${g.count} puntos en esta zona`).addTo(territory.densityLayer));}
  }
  function locatePointV800(kind,id){territory.view='map';renderTerritoryV800().then(()=>setTimeout(()=>{const item=kind==='prospect'?territory.prospects.find(x=>x.id===id):kind==='visit'?territory.visits.find(x=>x.id===id):(AppState.clients||[]).find(x=>x.id===id);if(item&&pointValid(item)&&territory.map)territory.map.setView([Number(item.latitude),Number(item.longitude)],17);},100));}

  function getGps(button,overlay){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('Este dispositivo no permite geolocalización.'));button.disabled=true;button.textContent='Capturando GPS…';navigator.geolocation.getCurrentPosition(pos=>{button.disabled=false;button.textContent='GPS capturado';resolve({latitude:Number(pos.coords.latitude.toFixed(6)),longitude:Number(pos.coords.longitude.toFixed(6)),accuracy:Number(pos.coords.accuracy||0)});},err=>{button.disabled=false;button.textContent='Capturar ubicación actual';reject(new Error(err.message||'No se pudo obtener la ubicación.'));},{enableHighAccuracy:true,timeout:15000,maximumAge:10000});});}

  function openProspectFormV800(id=''){
    const current=territory.prospects.find(p=>p.id===id)||{}; let lat=current.latitude??'',lng=current.longitude??'';
    openSheet(`<h2>${id?'Editar':'Nuevo'} prospecto <span class="x" id="closeSheet">✕</span></h2>${canCreateForTeam()?`<div class="field"><label>Responsable de la cuenta</label><select id="tpOwner">${ownerOptions(current.ownerUserId||currentUid(),false)}</select></div>`:''}<div class="field"><label>Tienda / prospecto</label><input id="tpBusiness" value="${esc(current.businessName||current.name||'')}" placeholder="Nombre visible del negocio"></div><div class="field-row"><div class="field"><label>Persona de contacto</label><input id="tpName" value="${esc(current.name||'')}"></div><div class="field"><label>WhatsApp</label><input id="tpPhone" inputmode="tel" value="${esc(current.phone||'')}"></div></div><div class="field-row"><div class="field"><label>Ciudad</label><input id="tpCity" value="${esc(current.city||'')}"></div><div class="field"><label>Potencial</label><select id="tpPotential"><option value="low" ${current.potential==='low'?'selected':''}>Bajo</option><option value="medium" ${!current.potential||current.potential==='medium'?'selected':''}>Medio</option><option value="high" ${current.potential==='high'?'selected':''}>Alto</option></select></div></div><div class="field"><label>Dirección / referencia</label><input id="tpAddress" value="${esc(current.address||'')}"></div><div class="field"><label>Estado</label><select id="tpStatus">${['prospect','contacted','qualified','converted','inactive','lost'].map(s=>`<option value="${s}" ${current.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}</select></div><div class="field-row"><div class="field"><label>Latitud</label><input id="tpLat" readonly value="${lat}"></div><div class="field"><label>Longitud</label><input id="tpLng" readonly value="${lng}"></div></div><button class="btn ghost block" id="tpGps">Capturar ubicación actual</button><div class="field"><label>Dato de ubicación</label><input id="tpLocation" value="${esc(current.locationLabel||'')}"></div><div class="field"><label>Observaciones</label><textarea id="tpNotes" rows="3">${esc(current.notes||'')}</textarea></div><button class="btn block" id="saveProspectV800">Guardar prospecto</button>`,(overlay,close)=>{
      $('#closeSheet',overlay).onclick=close; $('#tpGps',overlay).onclick=async()=>{try{const gps=await getGps($('#tpGps',overlay),overlay);lat=gps.latitude;lng=gps.longitude;$('#tpLat',overlay).value=lat;$('#tpLng',overlay).value=lng;if(!$('#tpLocation',overlay).value.trim())$('#tpLocation',overlay).value=`GPS ${lat}, ${lng}`;}catch(error){showToast(error.message,'error');}};
      $('#saveProspectV800',overlay).onclick=async()=>{const business=$('#tpBusiness',overlay).value.trim(),name=$('#tpName',overlay).value.trim();if(!business&&!name)return showToast('Ingresa el nombre del prospecto o tienda.','error');const btn=$('#saveProspectV800',overlay);btn.disabled=true;btn.textContent='Guardando…';try{const sb=await requireClient();const row={id:id||uid('pros'),owner_user_id:$('#tpOwner',overlay)?.value||current.ownerUserId||currentUid(),name:name||business,business_name:business,phone:$('#tpPhone',overlay).value.trim(),city:$('#tpCity',overlay).value.trim(),address:$('#tpAddress',overlay).value.trim(),location_label:$('#tpLocation',overlay).value.trim(),latitude:lat===''?null:Number(lat),longitude:lng===''?null:Number(lng),status:$('#tpStatus',overlay).value,potential:$('#tpPotential',overlay).value,notes:$('#tpNotes',overlay).value.trim()};const {error}=await sb.from('territory_prospects').upsert(row,{onConflict:'id'});if(error)throw error;close();showToast('Prospecto guardado.');await fetchTerritoryV800();patchTerritoryV800();}catch(error){btn.disabled=false;btn.textContent='Reintentar';showToast(messageFromError(error),'error');}};
    });
  }

  function targetOptions(selectedProspect='',selectedClient=''){
    return `<optgroup label="Prospectos">${territory.prospects.map(p=>`<option value="p:${esc(p.id)}" ${selectedProspect===p.id?'selected':''}>${esc(p.businessName||p.name)} · ${esc(ownerName(p.ownerUserId))}</option>`).join('')}</optgroup><optgroup label="Clientes">${(AppState.clients||[]).map(c=>`<option value="c:${esc(c.id)}" ${selectedClient===c.id?'selected':''}>${esc(c.businessName||c.name)} · ${esc(ownerName(c.ownerUserId))}</option>`).join('')}</optgroup>`;
  }
  function openVisitFormV800(prefill={}){let lat='',lng='',accuracy=null;const selected=`${prefill.prospectId?'p:'+prefill.prospectId:prefill.clientId?'c:'+prefill.clientId:''}`;openSheet(`<h2>Registrar visita <span class="x" id="closeSheet">✕</span></h2>${canCreateForTeam()?`<div class="field"><label>Persona que realizó la visita</label><select id="tvOwner">${ownerOptions(prefill.ownerUserId||currentUid(),false)}</select></div>`:''}<div class="field"><label>Cliente o prospecto</label><select id="tvTarget"><option value="">Seleccionar…</option>${targetOptions(prefill.prospectId,prefill.clientId)}</select></div><div class="field-row"><div class="field"><label>Tipo de visita</label><select id="tvType"><option value="prospecting">Prospección</option><option value="follow_up">Seguimiento</option><option value="sale">Venta</option><option value="collection">Cobranza</option><option value="delivery">Entrega</option><option value="other">Otra</option></select></div><div class="field"><label>Resultado</label><select id="tvOutcome"><option value="pending">Pendiente</option><option value="no_contact">Sin contacto</option><option value="interested">Interesado</option><option value="quoted">Cotizado</option><option value="sale">Venta</option><option value="collection">Cobranza</option><option value="not_interested">No interesado</option><option value="completed">Completada</option></select></div></div><div class="field"><label>Próxima acción</label><input id="tvNext" type="date"></div><button class="btn ghost block" id="tvGps">Registrar ubicación de la visita</button><div class="field"><label>Observaciones</label><textarea id="tvNotes" rows="4" placeholder="Resultado, pedido, necesidad o próximo paso"></textarea></div><button class="btn block" id="saveVisitV800">Guardar visita</button>`,(overlay,close)=>{$('#closeSheet',overlay).onclick=close;if(selected)$('#tvTarget',overlay).value=selected;$('#tvGps',overlay).onclick=async()=>{try{const gps=await getGps($('#tvGps',overlay),overlay);lat=gps.latitude;lng=gps.longitude;accuracy=gps.accuracy;showToast('Ubicación de visita capturada.');}catch(error){showToast(error.message,'error');}};$('#saveVisitV800',overlay).onclick=async()=>{const raw=$('#tvTarget',overlay).value;if(!raw)return showToast('Selecciona un cliente o prospecto.','error');const [kind,id]=raw.split(':');const target=kind==='p'?territory.prospects.find(p=>p.id===id):(AppState.clients||[]).find(c=>c.id===id);if(!target)return showToast('No se encontró el punto seleccionado.','error');const btn=$('#saveVisitV800',overlay);btn.disabled=true;btn.textContent='Guardando…';try{const sb=await requireClient();const row={id:uid('visit'),owner_user_id:$('#tvOwner',overlay)?.value||currentUid(),prospect_id:kind==='p'?id:null,client_id:kind==='c'?id:null,target_name:target.businessName||target.name||'Visita',visit_type:$('#tvType',overlay).value,outcome:$('#tvOutcome',overlay).value,latitude:lat===''?(pointValid(target)?Number(target.latitude):null):Number(lat),longitude:lng===''?(pointValid(target)?Number(target.longitude):null):Number(lng),accuracy_m:accuracy,next_action_date:$('#tvNext',overlay).value||null,notes:$('#tvNotes',overlay).value.trim(),visited_at:new Date().toISOString()};const {error}=await sb.from('territory_visits').insert(row);if(error)throw error;close();showToast('Visita registrada.');await fetchTerritoryV800();patchTerritoryV800();}catch(error){btn.disabled=false;btn.textContent='Reintentar';showToast(messageFromError(error),'error');}};});}

  async function convertProspectV800(id){const p=territory.prospects.find(x=>x.id===id);if(!p||p.ownerUserId!==currentUid())return showToast('Solo el responsable puede convertir este prospecto.','error');if(!confirm(`¿Convertir ${p.businessName||p.name} en cliente?`))return;try{const client=buildClientRecordV723({}, {name:p.businessName||p.name,phone:p.phone,customerType:'wholesale',businessName:p.businessName||p.name,city:p.city,address:p.address,latitude:p.latitude??'',longitude:p.longitude??'',locationLabel:p.locationLabel,notes:p.notes,ownerUserId:p.ownerUserId});await saveClientV723(client);const sb=await requireClient();const {error}=await sb.from('territory_prospects').update({status:'converted',converted_client_id:client.id}).eq('id',id);if(error)throw error;showToast('Prospecto convertido en cliente.');await fetchTerritoryV800();patchTerritoryV800();}catch(error){showToast(messageFromError(error),'error');}}

  function handleTerritoryRealtimeV800(){clearTimeout(territory.realtimeTimer);territory.realtimeTimer=setTimeout(async()=>{const result=await fetchTerritoryV800();if(result.ok&&AppState.currentTab==='territorio'&&!window.V7_FORM_DIRTY)patchTerritoryV800();},520);}

  Object.assign(window,{renderTerritoryV800,fetchTerritoryV800,handleTerritoryRealtimeV800});
})();
