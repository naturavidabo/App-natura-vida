/* NATURA VIDA V7.6.0 — distribución, rutas, entregas, GPS y evidencia. */
(() => {
  let routeCache = { routes: [], stops: [], deliveries: [], geoEvents: [] };
  let routeFilter = 'active';
  let activeMap = null;

  const esc = value => escapeHtml(String(value == null ? '' : value));
  const sb = () => getSupabaseClient();
  const uidV760 = prefix => window.uid ? uid(prefix) : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const currentUid = () => AppState.session.onlineUserId || AppState.session.userId;
  const admin = () => window.isAdmin && isAdmin();
  const statusLabel = s => ({planned:'Planificada',in_progress:'En ruta',completed:'Completada',cancelled:'Cancelada',pending:'Pendiente',arrived:'En punto',delivered:'Entregada',failed:'No entregada',skipped:'Omitida'})[s] || s;

  function errorText(error) { return window.messageFromError ? messageFromError(error) : String(error && error.message || error || 'Error'); }
  function dateLabel(value) { try { return new Date(`${value}T12:00:00`).toLocaleDateString('es-BO'); } catch (_) { return value || ''; } }
  function routeStops(routeId) { return routeCache.stops.filter(s => s.route_id === routeId).sort((a,b)=>Number(a.sequence_no)-Number(b.sequence_no)); }
  function routeDeliveries(routeId) { return routeCache.deliveries.filter(d => d.route_id === routeId); }
  function validCoord(value, min, max) { const n=Number(value); return Number.isFinite(n) && n>=min && n<=max; }
  function hasGps(row) { return validCoord(row.latitude,-90,90) && validCoord(row.longitude,-180,180); }

  async function refreshDistributionV760(options = {}) {
    if (!sb() || !currentUid()) return { ok:false, message:'Sesión no disponible.' };
    const [routesRes, stopsRes, deliveriesRes, geoRes] = await Promise.all([
      sb().from('delivery_routes').select('*').order('route_date',{ascending:false}).order('created_at',{ascending:false}).limit(300),
      sb().from('route_stops').select('*').order('sequence_no',{ascending:true}).limit(1200),
      sb().from('deliveries').select('*').order('delivered_at',{ascending:false}).limit(800),
      sb().from('geo_events').select('*').order('created_at',{ascending:false}).limit(800)
    ]);
    const failed=[routesRes,stopsRes,deliveriesRes,geoRes].find(r=>r.error);
    if (failed) return { ok:false, message:errorText(failed.error) };
    routeCache={routes:routesRes.data||[],stops:stopsRes.data||[],deliveries:deliveriesRes.data||[],geoEvents:geoRes.data||[]};
    if (options.rerender && AppState.currentTab==='distribucion') renderDistributionV760();
    return {ok:true,...routeCache};
  }

  async function renderDistributionV760() {
    $('#fabAdd').classList.add('hidden');
    const main=$('#mainArea');
    main.innerHTML='<div class="loading">Cargando distribución y rutas…</div>';
    const res=await refreshDistributionV760();
    if(!res.ok){ main.innerHTML=`<div class="v7Empty"><span>🗺️</span><h3>No se pudo cargar distribución</h3><p>${esc(res.message)}</p><button class="btn" id="retryDistV760">Reintentar</button></div>`; $('#retryDistV760')?.addEventListener('click',renderDistributionV760); return; }
    const visible=routeCache.routes.filter(r=>routeFilter==='all' ? true : routeFilter==='active' ? !['completed','cancelled'].includes(r.status) : r.status===routeFilter);
    const pendingStops=routeCache.stops.filter(s=>['pending','arrived'].includes(s.status)).length;
    const today=new Date().toISOString().slice(0,10);
    const todayRoutes=routeCache.routes.filter(r=>r.route_date===today).length;
    const delivered=routeCache.stops.filter(s=>s.status==='delivered').length;
    main.innerHTML=`
      <section class="v760RouteHero"><span class="v7Eyebrow" style="color:#c8f4db">Natura Vida V7.6.0</span><h1>Distribución y rutas</h1><p>${admin()?'Planifica rutas, asigna responsables y fiscaliza entregas con ubicación y evidencia.':'Gestiona tus recorridos, confirma visitas y registra entregas desde el celular.'}</p></section>
      <section class="v7MetricGrid compact"><article class="v7MetricCard primary"><span>Rutas hoy</span><strong>${todayRoutes}</strong><small>programadas</small></article><article class="v7MetricCard"><span>Pendientes</span><strong>${pendingStops}</strong><small>paradas</small></article><article class="v7MetricCard notification"><span>Entregadas</span><strong>${delivered}</strong><small>acumuladas</small></article></section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Planificación</span><h2>Rutas de entrega</h2></div><button class="btn sm" id="newRouteV760">+ Nueva ruta</button></div>
        <div class="v760RouteFilters"><button data-route-filter="active" class="${routeFilter==='active'?'active':''}">Activas</button><button data-route-filter="planned" class="${routeFilter==='planned'?'active':''}">Planificadas</button><button data-route-filter="completed" class="${routeFilter==='completed'?'active':''}">Completadas</button><button data-route-filter="all" class="${routeFilter==='all'?'active':''}">Todas</button></div>
        <div class="v760RouteGrid">${visible.map(routeCard).join('') || '<div class="v7Empty"><span>🚚</span><h3>Sin rutas en esta vista</h3><p>Crea una ruta y agrega clientes o puntos de entrega.</p></div>'}</div>
      </section>`;
    $('#newRouteV760').addEventListener('click',openNewRouteV760);
    $all('[data-route-filter]').forEach(b=>b.addEventListener('click',()=>{routeFilter=b.dataset.routeFilter;renderDistributionV760();}));
    $all('[data-open-route]').forEach(b=>b.addEventListener('click',()=>openRouteDetailV760(b.dataset.openRoute)));
  }

  function routeCard(route){
    const stops=routeStops(route.id), done=stops.filter(s=>s.status==='delivered').length;
    return `<article class="v760RouteCard"><header><div><h3>${esc(route.route_name||route.route_code)}</h3><small>${dateLabel(route.route_date)} · ${esc(route.driver_name||route.representative_name||'Sin responsable')}</small></div><em class="v760Status ${esc(route.status)}">${statusLabel(route.status)}</em></header><div class="v760RouteMeta"><span><b>${stops.length}</b>paradas</span><span><b>${done}</b>entregas</span><span><b>${stops.filter(hasGps).length}</b>con GPS</span></div><div class="v760RouteActions"><button class="btn sm" data-open-route="${esc(route.id)}">Abrir ruta</button></div></article>`;
  }

  function representativeOptions(){
    const profiles=(AppState.allProfiles||[]).filter(p=>String(p.role||'').toLowerCase()!=='administrador' && String(p.status||'').toLowerCase()==='activo');
    return profiles.map(p=>`<option value="${esc(p.id)}" data-name="${esc(p.full_name||p.email||'Representante')}">${esc(p.full_name||p.email||'Representante')}</option>`).join('');
  }

  function openNewRouteV760(){
    const today=new Date().toISOString().slice(0,10);
    openSheet(`<h2>Nueva ruta <span class="x" id="closeSheet">✕</span></h2><div class="v7CashNotice">La ruta queda asociada al responsable. Luego podrás agregar paradas, GPS y evidencia.</div><div class="field"><label>Nombre de la ruta</label><input id="routeNameV760" placeholder="Ej.: Ruta Norte · mercados"></div><div class="field"><label>Fecha</label><input id="routeDateV760" type="date" value="${today}"></div>${admin()?`<div class="field"><label>Representante / responsable</label><select id="routeRepV760"><option value="">Administrador principal</option>${representativeOptions()}</select></div>`:''}<div class="field"><label>Observaciones</label><textarea id="routeNotesV760" placeholder="Horario, vehículo, prioridad o zona"></textarea></div><button class="btn block" id="saveRouteV760">Crear ruta</button>`,(overlay,close)=>{
      $('#closeSheet',overlay).addEventListener('click',close);
      $('#saveRouteV760',overlay).addEventListener('click',async()=>{
        const name=$('#routeNameV760',overlay).value.trim(); if(!name)return showToast('Ingresa un nombre para la ruta.','error');
        const repSel=$('#routeRepV760',overlay); const repId=repSel&&repSel.value?repSel.value:currentUid(); const repName=repSel&&repSel.value?repSel.options[repSel.selectedIndex].text:(AppState.session.fullName||AppState.session.email||'Administrador');
        const row={id:uidV760('route'),route_code:`R-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`,route_name:name,route_date:$('#routeDateV760',overlay).value,representative_user_id:repId,representative_name:repName,driver_user_id:repId,driver_name:repName,status:'planned',notes:$('#routeNotesV760',overlay).value.trim(),created_by:currentUid(),updated_by:currentUid()};
        const btn=$('#saveRouteV760',overlay);btn.disabled=true;btn.textContent='Guardando en Supabase…';
        const {error}=await sb().from('delivery_routes').insert(row); if(error){btn.disabled=false;btn.textContent='Reintentar';return showToast(errorText(error),'error');}
        close();showToast('Ruta creada. Agrega ahora los puntos de entrega.');await refreshDistributionV760();openRouteDetailV760(row.id);
      });
    });
  }

  async function openRouteDetailV760(routeId){
    await refreshDistributionV760();
    const route=routeCache.routes.find(r=>r.id===routeId); if(!route)return showToast('La ruta ya no está disponible.','error');
    const stops=routeStops(routeId), done=stops.filter(s=>s.status==='delivered').length;
    const main=$('#mainArea');
    main.innerHTML=`<section class="v7PageHead"><span class="v7Eyebrow">${esc(route.route_code)}</span><h1>${esc(route.route_name)}</h1><p>${dateLabel(route.route_date)} · ${esc(route.driver_name||route.representative_name||'Sin responsable')}</p></section><div class="v760RouteActions"><button class="btn sm outline" id="backDistV760">← Rutas</button><button class="btn sm" id="addStopV760">+ Parada</button>${route.status==='planned'?'<button class="btn sm" id="startRouteV760">Iniciar ruta</button>':''}${route.status==='in_progress'?'<button class="btn sm outline" id="finishRouteV760">Finalizar ruta</button>':''}</div><section class="v7MetricGrid compact"><article class="v7MetricCard"><span>Paradas</span><strong>${stops.length}</strong></article><article class="v7MetricCard primary"><span>Entregadas</span><strong>${done}</strong></article><article class="v7MetricCard notification"><span>Avance</span><strong>${stops.length?Math.round(done/stops.length*100):0}%</strong></article></section><div id="routeMapV760" class="v760Map"></div><section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Secuencia</span><h2>Puntos de entrega</h2></div></div><div class="v760StopList">${stops.map(stopCard).join('')||'<div class="v7Empty"><span>📍</span><h3>Ruta sin paradas</h3><p>Agrega clientes o puntos manuales.</p></div>'}</div></section>`;
    $('#backDistV760').addEventListener('click',renderDistributionV760); $('#addStopV760').addEventListener('click',()=>openNewStopV760(route));
    $('#startRouteV760')?.addEventListener('click',()=>updateRouteStatusV760(route.id,'in_progress'));
    $('#finishRouteV760')?.addEventListener('click',()=>updateRouteStatusV760(route.id,'completed'));
    $all('[data-arrive-stop]').forEach(b=>b.addEventListener('click',()=>markArrivalV760(route,b.dataset.arriveStop)));
    $all('[data-deliver-stop]').forEach(b=>b.addEventListener('click',()=>openDeliveryV760(route,b.dataset.deliverStop)));
    $all('[data-fail-stop]').forEach(b=>b.addEventListener('click',()=>markStopStatusV760(route,b.dataset.failStop,'failed')));
    $all('[data-nav-stop]').forEach(b=>b.addEventListener('click',()=>openNavigationV760(b.dataset.navStop)));
    drawRouteMapV760(stops);
  }

  function stopCard(stop){
    const delivery=routeCache.deliveries.find(d=>d.route_stop_id===stop.id);
    const geo=delivery ? (delivery.within_geofence ? '<span class="v760GeoBadge ok">✓ dentro de geocerca</span>' : delivery.distance_m!=null ? `<span class="v760GeoBadge out">${Math.round(delivery.distance_m)} m del punto</span>` : '') : '';
    return `<article class="v760Stop"><div class="v760StopNumber">${Number(stop.sequence_no||0)}</div><div><h4>${esc(stop.client_name||'Punto de entrega')}</h4><p>${esc(stop.address||stop.location_label||'Sin dirección')}</p><span class="v760Status ${esc(stop.status)}">${statusLabel(stop.status)}</span>${hasGps(stop)?'<span class="v760GeoBadge">📍 GPS registrado</span>':'<span class="v760GeoBadge out">GPS pendiente</span>'}${geo}<div class="v760StopActions">${hasGps(stop)?`<button class="btn sm ghost" data-nav-stop="${esc(stop.id)}">Navegar</button>`:''}${['pending'].includes(stop.status)?`<button class="btn sm outline" data-arrive-stop="${esc(stop.id)}">Llegué</button>`:''}${['pending','arrived','failed'].includes(stop.status)?`<button class="btn sm" data-deliver-stop="${esc(stop.id)}">Entregar</button>`:''}${['pending','arrived'].includes(stop.status)?`<button class="btn sm ghost dangerText" data-fail-stop="${esc(stop.id)}">No entregado</button>`:''}${delivery&&delivery.evidence_url?`<a class="btn sm outline" href="${esc(delivery.evidence_url)}" target="_blank" rel="noopener">Evidencia</a>`:''}</div></div></article>`;
  }

  function drawRouteMapV760(stops){
    const el=document.getElementById('routeMapV760'); if(!el)return;
    if(activeMap){try{activeMap.remove();}catch(_){}activeMap=null;}
    const points=stops.filter(hasGps);
    if(!window.L){el.innerHTML='<div class="v7Empty"><span>🗺️</span><h3>Mapa no disponible</h3><p>La lista de paradas continúa funcionando.</p></div>';return;}
    const center=points.length?[Number(points[0].latitude),Number(points[0].longitude)]:[-17.7833,-63.1821];
    activeMap=L.map(el,{zoomControl:true}).setView(center,points.length?13:5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(activeMap);
    const latlngs=[];points.forEach(stop=>{const ll=[Number(stop.latitude),Number(stop.longitude)];latlngs.push(ll);L.marker(ll).addTo(activeMap).bindPopup(`<b>${Number(stop.sequence_no)}</b> ${esc(stop.client_name||'Parada')}<br>${esc(stop.address||'')}`);});
    if(latlngs.length>1){L.polyline(latlngs,{weight:4,opacity:.75}).addTo(activeMap);activeMap.fitBounds(latlngs,{padding:[28,28]});}
    else if(latlngs.length===1)activeMap.setView(latlngs[0],15);
    setTimeout(()=>activeMap&&activeMap.invalidateSize(),150);
  }

  function clientOptionsV760(){return (AppState.clients||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.businessName?' · '+esc(c.businessName):''}</option>`).join('');}
  function openNewStopV760(route){
    const seq=routeStops(route.id).reduce((m,s)=>Math.max(m,Number(s.sequence_no||0)),0)+1;
    openSheet(`<h2>Agregar parada <span class="x" id="closeSheet">✕</span></h2><div class="field"><label>Cliente existente</label><select id="stopClientV760"><option value="">Punto manual</option>${clientOptionsV760()}</select></div><div class="field"><label>Nombre del punto / cliente</label><input id="stopNameV760"></div><div class="field"><label>Dirección o referencia</label><input id="stopAddressV760"></div><div class="field-row"><div class="field"><label>Latitud</label><input id="stopLatV760" type="number" step="any"></div><div class="field"><label>Longitud</label><input id="stopLngV760" type="number" step="any"></div></div><button class="btn ghost block" id="captureStopGpsV760">Usar ubicación actual</button><div class="field"><label>Orden de visita</label><input id="stopSeqV760" type="number" min="1" value="${seq}"></div><div class="field"><label>Monto por cobrar (opcional)</label><input id="stopDueV760" type="number" min="0" step="0.01"></div><div class="field"><label>Observaciones</label><textarea id="stopNotesV760"></textarea></div><button class="btn block" id="saveStopV760">Guardar parada</button>`,(overlay,close)=>{
      $('#closeSheet',overlay).addEventListener('click',close);
      $('#stopClientV760',overlay).addEventListener('change',e=>{const c=(AppState.clients||[]).find(x=>x.id===e.target.value);if(!c)return;$('#stopNameV760',overlay).value=c.businessName||c.name||'';$('#stopAddressV760',overlay).value=[c.city,c.address,c.locationLabel].filter(Boolean).join(' · ');$('#stopLatV760',overlay).value=c.latitude||'';$('#stopLngV760',overlay).value=c.longitude||'';});
      $('#captureStopGpsV760',overlay).addEventListener('click',async()=>{const pos=await getPositionV760();if(!pos.ok)return showToast(pos.message,'error');$('#stopLatV760',overlay).value=pos.latitude.toFixed(6);$('#stopLngV760',overlay).value=pos.longitude.toFixed(6);showToast('Ubicación capturada.');});
      $('#saveStopV760',overlay).addEventListener('click',async()=>{const name=$('#stopNameV760',overlay).value.trim();if(!name)return showToast('Ingresa el cliente o nombre del punto.','error');const lat=$('#stopLatV760',overlay).value,lng=$('#stopLngV760',overlay).value;if((lat||lng)&&(!validCoord(lat,-90,90)||!validCoord(lng,-180,180)))return showToast('Revisa la latitud y longitud.','error');const row={id:uidV760('stop'),route_id:route.id,sequence_no:Number($('#stopSeqV760',overlay).value||seq),client_id:$('#stopClientV760',overlay).value||null,client_name:name,address:$('#stopAddressV760',overlay).value.trim(),location_label:$('#stopAddressV760',overlay).value.trim(),latitude:lat===''?null:Number(lat),longitude:lng===''?null:Number(lng),status:'pending',amount_due:Number($('#stopDueV760',overlay).value||0),notes:$('#stopNotesV760',overlay).value.trim(),created_by:currentUid(),updated_by:currentUid()};const btn=$('#saveStopV760',overlay);btn.disabled=true;btn.textContent='Guardando…';const{error}=await sb().from('route_stops').insert(row);if(error){btn.disabled=false;btn.textContent='Reintentar';return showToast(errorText(error),'error');}close();showToast('Parada agregada.');openRouteDetailV760(route.id);});
    });
  }

  function getPositionV760(){return new Promise(resolve=>{if(!navigator.geolocation)return resolve({ok:false,message:'El dispositivo no permite geolocalización.'});navigator.geolocation.getCurrentPosition(p=>resolve({ok:true,latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),e=>resolve({ok:false,message:e.code===1?'Autoriza la ubicación para registrar la entrega.':'No se pudo obtener la ubicación.'}),{enableHighAccuracy:true,timeout:12000,maximumAge:15000});});}
  function distanceMeters(aLat,aLng,bLat,bLng){const R=6371000,rad=x=>x*Math.PI/180,dLat=rad(bLat-aLat),dLng=rad(bLng-aLng),a=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}

  async function updateRouteStatusV760(id,status){const{error}=await sb().from('delivery_routes').update({status,updated_by:currentUid(),updated_at:new Date().toISOString()}).eq('id',id);if(error)return showToast(errorText(error),'error');showToast(status==='completed'?'Ruta finalizada.':'Ruta iniciada.');openRouteDetailV760(id);}
  async function markStopStatusV760(route,stopId,status){const{error}=await sb().from('route_stops').update({status,updated_by:currentUid(),updated_at:new Date().toISOString()}).eq('id',stopId);if(error)return showToast(errorText(error),'error');showToast(status==='failed'?'Entrega marcada como no realizada.':'Estado actualizado.');openRouteDetailV760(route.id);}
  async function markArrivalV760(route,stopId){const pos=await getPositionV760();if(!pos.ok)return showToast(pos.message,'error');const now=new Date().toISOString();const [stopRes,geoRes]=await Promise.all([sb().from('route_stops').update({status:'arrived',arrived_at:now,updated_by:currentUid(),updated_at:now}).eq('id',stopId),sb().from('geo_events').insert({id:uidV760('geo'),user_id:currentUid(),route_id:route.id,route_stop_id:stopId,event_type:'arrival',latitude:pos.latitude,longitude:pos.longitude,accuracy_m:pos.accuracy})]);if(stopRes.error||geoRes.error)return showToast(errorText(stopRes.error||geoRes.error),'error');showToast('Llegada registrada con GPS.');openRouteDetailV760(route.id);}

  async function uploadEvidenceV760(file,deliveryId){if(!file)return'';if(!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type||''))throw new Error('Usa una foto JPG, PNG o WEBP.');if(file.size>8*1024*1024)throw new Error('La foto supera 8 MB.');const ext=(file.type.split('/')[1]||'jpg').replace('jpeg','jpg');const path=`${currentUid()}/deliveries/${deliveryId}.${ext}`;const{error}=await sb().storage.from('payment-assets').upload(path,file,{upsert:true,contentType:file.type,cacheControl:'86400'});if(error)throw error;const{data}=sb().storage.from('payment-assets').getPublicUrl(path);return data&&data.publicUrl?`${data.publicUrl}?v=${Date.now()}`:'';}

  function openDeliveryV760(route,stopId){const stop=routeStops(route.id).find(s=>s.id===stopId);if(!stop)return;openSheet(`<h2>Confirmar entrega <span class="x" id="closeSheet">✕</span></h2><div class="v7CashNotice">Se registrará hora, ubicación y distancia respecto al punto planificado.</div><div class="field"><label>Recibió</label><input id="deliveryRecipientV760" placeholder="Nombre de quien recibe"></div><div class="field"><label>Monto cobrado (opcional)</label><input id="deliveryCollectedV760" type="number" min="0" step="0.01" value="${Number(stop.amount_due||0)}"></div><label class="v760FileLabel">📷 Adjuntar foto de entrega<input id="deliveryPhotoV760" type="file" accept="image/*" capture="environment"></label><img id="deliveryPreviewV760" class="v760EvidencePreview hidden" alt="Vista previa"><div class="field"><label>Observaciones</label><textarea id="deliveryNoteV760" placeholder="Estado del pedido, faltantes, referencia"></textarea></div><button class="btn block" id="confirmDeliveryV760">Confirmar entrega con GPS</button>`,(overlay,close)=>{
      $('#closeSheet',overlay).addEventListener('click',close);$('#deliveryPhotoV760',overlay).addEventListener('change',e=>{const f=e.target.files&&e.target.files[0],img=$('#deliveryPreviewV760',overlay);if(!f)return;img.src=URL.createObjectURL(f);img.classList.remove('hidden');});
      $('#confirmDeliveryV760',overlay).addEventListener('click',async()=>{const pos=await getPositionV760();if(!pos.ok)return showToast(pos.message,'error');const deliveryId=uidV760('del');const btn=$('#confirmDeliveryV760',overlay);btn.disabled=true;btn.textContent='Guardando evidencia…';try{const file=$('#deliveryPhotoV760',overlay).files&&$('#deliveryPhotoV760',overlay).files[0];const evidence=await uploadEvidenceV760(file,deliveryId);const distance=hasGps(stop)?distanceMeters(pos.latitude,pos.longitude,Number(stop.latitude),Number(stop.longitude)):null;const now=new Date().toISOString();const delivery={id:deliveryId,route_id:route.id,route_stop_id:stop.id,representative_user_id:route.representative_user_id||currentUid(),client_id:stop.client_id||null,client_name:stop.client_name||'',status:'delivered',recipient_name:$('#deliveryRecipientV760',overlay).value.trim(),amount_collected:Number($('#deliveryCollectedV760',overlay).value||0),evidence_url:evidence,evidence_note:$('#deliveryNoteV760',overlay).value.trim(),latitude:pos.latitude,longitude:pos.longitude,accuracy_m:pos.accuracy,distance_m:distance,within_geofence:distance==null?null:distance<=100,delivered_at:now,created_by:currentUid()};const dres=await sb().from('deliveries').upsert(delivery,{onConflict:'route_stop_id'});if(dres.error)throw dres.error;const sres=await sb().from('route_stops').update({status:'delivered',delivered_at:now,updated_by:currentUid(),updated_at:now}).eq('id',stop.id);if(sres.error)throw sres.error;await sb().from('geo_events').insert({id:uidV760('geo'),user_id:currentUid(),route_id:route.id,route_stop_id:stop.id,event_type:'delivery',latitude:pos.latitude,longitude:pos.longitude,accuracy_m:pos.accuracy});close();showToast(distance!=null&&distance>100?`Entrega registrada a ${Math.round(distance)} m del punto planificado.`:'Entrega confirmada correctamente.');openRouteDetailV760(route.id);}catch(error){btn.disabled=false;btn.textContent='Reintentar';showToast(errorText(error),'error');}});
    });}

  function openNavigationV760(stopId){const stop=routeCache.stops.find(s=>s.id===stopId);if(!stop||!hasGps(stop))return showToast('Esta parada no tiene GPS.','error');window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.latitude+','+stop.longitude)}`,'_blank','noopener');}

  Object.assign(window,{renderDistributionV760,refreshDistributionV760,openRouteDetailV760});
})();
