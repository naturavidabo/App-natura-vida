/* Natura Vida V8.3.5 — Director Ejecutivo Proactivo, alertas priorizadas y agenda accionable.
   Acceso exclusivo para administrador central. Ninguna acción se ejecuta automáticamente. Los cálculos críticos continúan
   siendo locales; Gemini interpreta un resumen empresarial limitado a través
   de una Supabase Edge Function y nunca recibe claves desde el navegador. */
(function(){
  'use strict';

  const VERSION='8.3.5';
  const MAX_ENTRIES=40;
  const MAX_ARCHIVES=12;
  const MAX_ACTION_HISTORY=40;
  const AI_FUNCTION_NAME='nv-ai-assistant';
  const ENGINE_TIMEOUT_MS=16000;
  const REQUEST_WATCHDOG_MS=22000;
  const ENGINE_HEALTH_TTL=5*60*1000;
  let oldNavigate=null;
  let oldRender=null;
  let lastNonAiTab='inicio';
  let assistantContext={tab:'inicio',label:'Negocio general'};
  let pendingQuestion='';
  let pendingRequestId='';
  let lastQuestionAt=0;
  let answerTimer=null;
  let fabPositionTimer=null;
  let activeSpeechV826=null;
  let activeSpeechButtonV826=null;
  let directorModeV830='auto';
  let engineState={mode:'checking',configured:false,migrationReady:false,model:'gemini-3.1-flash-lite',checkedAt:0,usage:null,message:'Comprobando motor IA'};
  const CONTROL_TASKS_TABLE_V834='nv_ai_control_tasks';
  const CONTROL_STATE_TABLE_V834='nv_ai_control_state';
  let controlSyncTimerV834=null;
  let controlRealtimeChannelV834=null;
  let controlSyncStateV834={status:'local',message:'Control local',lastSyncAt:0,lastError:'',migrationReady:null};
  let controlReminderShownV834='';

  function adminAllowed(){
    try { return !!(window.requireAuth && requireAuth() && window.isAdmin && isAdmin()); }
    catch(_) { return false; }
  }
  function userKey(){
    const s=window.AppState?.session||{};
    return String(s.onlineUserId||s.userId||s.email||'central-admin').replace(/[^a-zA-Z0-9_-]/g,'_');
  }
  function historyKey(){ return `nv_ai_conversation_v812_${userKey()}`; }
  function archiveKey(){ return `nv_ai_archives_v824_${userKey()}`; }
  function dashboardKey(){ return `nv_ai_dashboard_collapsed_v824_${userKey()}`; }
  function actionHistoryKey(){ return `nv_ai_action_history_v822_${userKey()}`; }
  function composerDraftKey(){ return `nv_ai_composer_draft_v824_${userKey()}`; }
  function directorModeKeyV830(){ return `nv_ai_director_mode_v830_${userKey()}`; }
  function controlTasksKeyV832(){ return `nv_ai_control_tasks_v832_${userKey()}`; }
  function controlAlertStateKeyV832(){ return `nv_ai_control_alert_state_v832_${userKey()}`; }
  function dailySummaryKeyV832(){ return `nv_ai_daily_summary_v832_${userKey()}`; }
  function weeklySummaryKeyV835(){ return `nv_ai_weekly_summary_v835_${userKey()}`; }
  function proactiveStateKeyV835(){ return `nv_ai_proactive_state_v835_${userKey()}`; }
  function readDirectorModeV830(){ try{const v=localStorage.getItem(directorModeKeyV830());return ['auto','operate','analyze'].includes(v)?v:'auto';}catch(_){return'auto';} }
  function setDirectorModeV830(value){ directorModeV830=['auto','operate','analyze'].includes(value)?value:'auto'; try{localStorage.setItem(directorModeKeyV830(),directorModeV830);}catch(_){} updateDirectorModeUIV830(); }
  function isOperationalCommandV830(value){ const q=normalizedName(value); return /(vende|venta|vender|cotiza|cotizacion|cotización|recibo|pago|pag[oó]|cuota|plan de pago|rendicion|rendición|registra|prepara|elabora|genera|hazme|descuento|rebaja|precio final|promocion|promoción|producir|produccion|producción|orden de produccion|tarea|recordatorio|seguimiento)/.test(q); }
  function effectiveDirectorModeV830(question){ return directorModeV830==='auto'?(isOperationalCommandV830(question)?'operate':'analyze'):directorModeV830; }
  function updateDirectorModeUIV830(){ document.querySelectorAll('[data-ai-mode-v830]').forEach(b=>b.classList.toggle('active',b.dataset.aiModeV830===directorModeV830)); const label=document.getElementById('nvAiModeLabelV830'); if(label)label.textContent=directorModeV830==='operate'?'Preparar operación':directorModeV830==='analyze'?'Analizar negocio':'Automático'; }
  function readComposerDraft(){ try{return String(localStorage.getItem(composerDraftKey())||'').slice(0,1200);}catch(_){return'';} }
  function saveComposerDraft(value){ try{const v=String(value||'').slice(0,1200);if(v)localStorage.setItem(composerDraftKey(),v);else localStorage.removeItem(composerDraftKey());}catch(_){} }
  function clearComposerDraft(){ try{localStorage.removeItem(composerDraftKey());}catch(_){} }
  function esc(v){
    return window.escapeHtml ? escapeHtml(String(v??'')) : String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function money(v){ return window.fmtMoney ? fmtMoney(Number(v)||0) : `Bs ${(Number(v)||0).toFixed(2)}`; }
  function uid(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }
  function clampText(v,max=300){ return String(v??'').replace(/\s+/g,' ').trim().slice(0,max); }
  function safeHtml(v){ return esc(v).replace(/\n/g,'<br>'); }
  function engineLabel(mode=engineState.mode){
    return mode==='external'?'IA conectada':mode==='checking'?'Comprobando IA':mode==='local-fallback'?'Respaldo local':'Análisis local';
  }
  function engineClass(mode=engineState.mode){ return mode==='external'?'online':mode==='checking'?'checking':mode==='local-fallback'?'warning':'local'; }
  function getSupabaseForAI(){ try { return window.getSupabaseClient ? getSupabaseClient() : null; } catch(_) { return null; } }
  function withTimeout(promise,ms=ENGINE_TIMEOUT_MS){
    let timer;
    return Promise.race([
      Promise.resolve(promise).finally(()=>clearTimeout(timer)),
      new Promise((_,reject)=>{ timer=setTimeout(()=>reject(new Error('El motor IA tardó demasiado en responder.')),ms); })
    ]);
  }
  function botSvg(extraClass=''){
    const suffix=extraClass?` ${extraClass}`:'';
    return `<svg class="nvAiBotSvg${suffix}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle class="nvAiBotHalo" cx="32" cy="32" r="29"/><circle class="nvAiBotHaloInner" cx="32" cy="32" r="24"/>
      <path class="nvAiBotAntenna" d="M32 8v8"/><circle class="nvAiBotAntennaTip" cx="32" cy="7" r="3.4"/>
      <path class="nvAiBotEar" d="M14 27H9v11h5M50 27h5v11h-5"/>
      <rect class="nvAiBotHead" x="13" y="17" width="38" height="33" rx="13"/><rect class="nvAiBotScreen" x="18" y="23" width="28" height="18" rx="9"/>
      <circle class="nvAiBotEye leftEye" cx="26" cy="32" r="2.7"/><circle class="nvAiBotEye rightEye" cx="38" cy="32" r="2.7"/>
      <path class="nvAiBotSmile" d="M27 37c3.2 2.1 6.8 2.1 10 0"/><path class="nvAiBotBase" d="M23 51h18"/>
      <path class="nvAiBotSpark" d="M50 12l1.5 3.5L55 17l-3.5 1.5L50 22l-1.5-3.5L45 17l3.5-1.5z"/>
    </svg>`;
  }

  function currentContext(){
    const tab=String(window.AppState?.currentTab||'inicio');
    const account=window.__nv820ActiveAccountContext;
    if(tab==='estado-cuenta'&&account?.clientId) return {tab,label:`Estado de cuenta: ${account.name||'Cliente'}`,clientId:String(account.clientId)};
    const map={inicio:'Negocio general',vender:'Venta actual',clientes:'Clientes',inventario:'Inventario',territorio:'Territorio','por-cobrar':'Cobranzas','estado-cuenta':'Estado de cuenta','reglas-comerciales':'Reglas comerciales',produccion:'Producción',egresos:'Finanzas',historial:'Historial de ventas','centro-comercial':'Centro comercial'};
    return {tab,label:map[tab]||'Negocio general'};
  }
  function focusedClientRecord(){
    const id=assistantContext?.clientId||window.__nv820ActiveAccountContext?.clientId;
    return id?(window.AppState?.clients||[]).find(c=>String(c.id)===String(id))||null:null;
  }
  function focusedAccountContext(){
    const raw=window.__nv820ActiveAccountContext;
    if(!raw?.clientId||String(raw.clientId)!==String(assistantContext?.clientId||raw.clientId)) return null;
    return raw;
  }
  function dataset(){
    const s=window.AppState||{};
    return {sales:s.sales||[],historicalReceivables:s.historicalReceivables||[],clients:s.clients||[],products:s.products||[],expenses:s.expenses||[],payments:s.receivablePayments||[],settings:s.settings||{},productionOrders:s.productionOrders||[],productionBatches:s.productionBatches||[],rawMaterials:s.rawMaterials||[]};
  }
  function salesStats(periodDays=30){
    const {sales,products}=dataset();
    const now=Date.now();
    const from=now-periodDays*86400000;
    const rows=sales.filter(x=>Number(new Date(x.date||x.createdAt||0))>=from && (!window.saleVisibleToCurrentBusinessV801 || saleVisibleToCurrentBusinessV801(x)));
    let revenue=0,cost=0,units=0;
    const byProduct=new Map();
    rows.forEach(s=>{
      revenue+=Number(s.total)||0;
      (s.items||[]).forEach(it=>{
        const qty=Number(it.qty||it.quantity)||0;
        units+=qty;
        const product=products.find(p=>String(p.id)===String(it.productId))||{};
        const unitCost=Number(it.cost ?? it.unitCost ?? product.cost ?? product.baseCost ?? (window.grossCost?grossCost(product):0))||0;
        const unitPrice=Number(it.price||it.unitPrice)||0;
        cost+=unitCost*qty;
        const key=it.productId||it.name||'sin-producto';
        const prev=byProduct.get(key)||{name:it.name||product.name||'Producto',qty:0,revenue:0,cost:0};
        prev.qty+=qty; prev.revenue+=unitPrice*qty; prev.cost+=unitCost*qty;
        byProduct.set(key,prev);
      });
    });
    return {rows,revenue,cost,profit:revenue-cost,margin:revenue?((revenue-cost)/revenue*100):0,units,byProduct:[...byProduct.values()].sort((a,b)=>(b.revenue-b.cost)-(a.revenue-a.cost))};
  }
  function clientStats(){
    const {clients,sales}=dataset();
    const cutoff=Date.now()-30*86400000;
    const inactive=clients.filter(c=>{
      const own=sales.filter(s=>String(s.clientId||'')===String(c.id||''));
      const last=Math.max(0,...own.map(s=>Number(new Date(s.date||s.createdAt||0))||0));
      return own.length>0 && last<cutoff;
    });
    const incomplete=clients.filter(c=>!String(c.phone||c.whatsapp||'').trim() || !String(c.name||c.businessName||'').trim());
    return {inactive,incomplete,total:clients.length};
  }
  function stockStats(){
    const {products}=dataset();
    const threshold=Number(dataset().settings.lowStockThreshold||5);
    const critical=products.filter(p=>Number(p.stock||0)<=threshold);
    const negative=products.filter(p=>Number(p.stock||0)<0);
    return {critical,negative,total:products.length};
  }
  function normalizedName(v){ return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); }
  function clientDisplayName(c){ return c?clampText(c?.name||c?.businessName||c?.contactName||'Cliente',100):''; }
  function clientDebtInfo(client){
    if(!client?.id) return {totalDebt:0,pendingCount:0};
    const rs=receivableStats();
    const names=new Set([normalizedName(client.name),normalizedName(client.businessName),normalizedName(client.contactName)].filter(Boolean));
    const rows=rs.open.filter(x=>String(x.clientId||'')===String(client.id)||names.has(normalizedName(x.clientName||x.customerName)));
    return {totalDebt:round2(rows.reduce((s,x)=>s+Number(x.balance||0),0)),pendingCount:rows.length,rows};
  }
  function round2(v){ return Math.round((Number(v)||0)*100)/100; }
  function compactNameV8211(value){
    return normalizedName(value).replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function extractExplicitClientQueryV8211(query){
    const raw=String(query||'').replace(/\s+/g,' ').trim();
    const patterns=[
      /(?:para\s+(?:la\s+)?cliente(?:\s+de)?|cliente(?:\s+de)?|a\s+nombre\s+de)\s+(.+?)(?=\s+(?:con\s+(?:una|un|el|la)|por\s+(?:un|una|el|la|bs|bob)|pago|forma\s+de\s+pago|tipo\s+de\s+venta|a\s+credito|al\s+contado|en\s+efectivo|por\s+qr|y\s+(?:una|un|dos|tres|cuatro|cinco|\d+)\s+(?:aceites?|frascos?|unidades?)|$))/i,
      /(?:venta|recibo|cotizacion|cotización)\s+(?:para|de)\s+(.+?)(?=\s+(?:con|por|pago|forma|tipo|y\s+(?:una|un|dos|tres|cuatro|cinco|\d+)\s+(?:aceites?|frascos?|unidades?)|$))/i
    ];
    for(const pattern of patterns){const match=raw.match(pattern);if(match&&compactNameV8211(match[1]).length>=2)return match[1].trim().replace(/[.,;:]+$/,'');}
    return '';
  }
  function clientCandidatesV8211(query){
    const needle=compactNameV8211(query);
    if(!needle)return [];
    const wanted=needle.split(' ').filter(Boolean);
    const rows=(dataset().clients||[]).map(client=>{
      const variants=[client.name,client.businessName,client.contactName].map(compactNameV8211).filter(Boolean);
      let score=0;
      variants.forEach(hay=>{
        if(hay===needle)score=Math.max(score,120);
        else if(hay.startsWith(needle)||needle.startsWith(hay))score=Math.max(score,96-Math.abs(hay.length-needle.length));
        else if(hay.includes(needle)||needle.includes(hay))score=Math.max(score,86-Math.abs(hay.length-needle.length));
        const tokens=hay.split(' ').filter(Boolean);const common=wanted.filter(w=>tokens.some(t=>t===w||t.startsWith(w)||w.startsWith(t))).length;
        if(common)score=Math.max(score,common*24+(common===wanted.length?22:0)-Math.max(0,tokens.length-wanted.length)*2);
      });
      return {client,score,name:clientDisplayName(client)};
    }).filter(row=>row.score>=24).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'es'));
    return rows.slice(0,5);
  }
  function resolveClientFromText(query){
    const rows=clientCandidatesV8211(query);
    if(!rows.length)return null;
    if(rows[0].score>=90&&(rows.length===1||rows[0].score-rows[1].score>=10))return rows[0].client;
    if(rows[0].score>=55&&(rows.length===1||rows[0].score-rows[1].score>=18))return rows[0].client;
    return null;
  }
  function extractMoneyAmount(query){
    const q=String(query||'').replace(/\s/g,'');
    const patterns=[/(?:bs|bob|bolivianos?)\.?([0-9]+(?:[.,][0-9]{1,2})?)/i,/([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:bs|bob|bolivianos?)/i,/cuota(?:de)?([0-9]+(?:[.,][0-9]{1,2})?)/i,/pago(?:de)?([0-9]+(?:[.,][0-9]{1,2})?)/i];
    for(const re of patterns){const m=q.match(re);if(m){const n=Number(m[1].replace(',','.'));if(Number.isFinite(n)&&n>0)return n;}}
    return 0;
  }
  function extractFrequency(query){
    const q=normalizedName(query);
    if(/semanal|cada semana/.test(q))return'weekly';
    if(/quincenal|cada quincena/.test(q))return'biweekly';
    return'monthly';
  }
  function frequencyLabel(value){return value==='weekly'?'Semanal':value==='biweekly'?'Quincenal':'Mensual';}
  function friendlyMissingFieldV829(value){
    const key=normalizedName(value).replace(/\s+/g,'_');
    const map={payment_method:'forma de pago',forma_de_pago:'forma de pago',sale_type:'tipo de venta',tipo_de_venta:'tipo de venta',client:'cliente',cliente:'cliente',product:'producto',producto:'producto',quantity:'cantidad',cantidad:'cantidad',amount:'monto',monto:'monto',installment_amount:'monto de la cuota',monto_de_la_cuota:'monto de la cuota'};
    return map[key]||String(value||'').replace(/_/g,' ').trim();
  }
  function isNonBlockingSaleFieldV829(value){
    const key=normalizedName(value).replace(/\s+/g,'_');
    return ['payment_method','forma_de_pago','sale_type','tipo_de_venta'].includes(key);
  }
  function inferSaleTypeV829(client,question,supplied=''){
    if(['unit','market','representative_transfer','reseller_unit','reseller_wholesale'].includes(String(supplied||'')))return String(supplied);
    const q=normalizedName(question);if(/representante|traspaso/.test(q))return'representative_transfer';if(/mayorista|por mayor/.test(q))return'market';if(/revendedor|reventa/.test(q))return'reseller_wholesale';
    const type=normalizedName([client?.customerType,client?.type,client?.priceGroupName].filter(Boolean).join(' '));
    if(/mayorista|wholesale|mercado/.test(type))return'market';if(/revendedor|reseller/.test(type))return'reseller_wholesale';return'unit';
  }
  function resolveDraftActionV829(question,response={}){
    const supplied=response?.draftAction&&typeof response.draftAction==='object'?response.draftAction:null;
    const q=normalizedName(question);
    const explicitClientQuery=extractExplicitClientQueryV8211(question);
    const requestedClientQuery=explicitClientQuery||String(supplied?.client_query||'').trim();
    const candidateRows=requestedClientQuery?clientCandidatesV8211(requestedClientQuery):[];
    const detectedClient=requestedClientQuery?resolveClientFromText(requestedClientQuery):null;
    const account=focusedAccountContext();
    const contextualClient=!explicitClientQuery?(focusedClientRecord()||((account?.clientId)?(dataset().clients||[]).find(c=>String(c.id)===String(account.clientId)):null)):null;
    const client=detectedClient||contextualClient;
    const amount=Number(supplied?.amount||supplied?.installment_amount||extractMoneyAmount(question))||0;
    let type=String(supplied?.type||'');
    if(!type||type==='none'){
      if(/plan.{0,16}(pago|cuota)|cuota.{0,14}(mes|mensual|seman|quincen)/.test(q))type='create_payment_plan';
      else if(/rendir|rendicion|rendición|entregar efectivo|caja de vendedor/.test(q))type='seller_settlement';
      else if(/(?:crear|crea|preparar|prepara|proponer|propone|arma|armar|diseña|disena|lanza|lanzar|haz).{0,28}promocion|promocion.{0,28}(producto|descuento|campaña|campana)/.test(q))type='prepare_promotion';
      else if(/(?:crear|crea|preparar|prepara|programar|programa|producir|produce|fabrica|fabricar|envasar|envasa).{0,30}(orden de )?produccion|orden de produccion|producir.{0,30}(aceite|frasco|unidades?)/.test(q))type='prepare_production';
      else if(/(?:crear|crea|anota|agrega|programa|programar|recordar|recuerda|recordatorio).{0,20}tarea|tarea.{0,20}(para|de|sobre)/.test(q))type='create_task';
      else if(/cotiza|cotizacion|cotización|presupuesto|oferta/.test(q))type='create_quote';
      else if(/(venta|vende|vender|recibo).{0,55}(aceite|producto|frasco|unidad)|(?:elabora|prepara|genera|hazme).{0,30}(venta|recibo).{0,55}(aceite|producto|frasco)/.test(q))type='prepare_sale';
      else if(/(registro|registra|registrar|pago|pago de).{0,30}(recibo|deuda|cuenta)|ha pagado|pago parcial/.test(q))type='register_payment';
      else if(/(haz|genera|generar|prepara).{0,20}recibo/.test(q))type='generate_receipt';
      else type='none';
    }
    const suppliedItems=Array.isArray(supplied?.items)?supplied.items:[];
    let items=[];
    if(suppliedItems.length){
      items=suppliedItems.map(it=>{const p=productByQuestion(it?.product_query||question);const base={productId:p?.id||'',productName:p?.name||it?.product_query||'Producto',quantity:Math.max(1,Math.min(999,Number(it?.quantity)||1)),stock:Number(p?.stock||0),unitPrice:productPriceV827(p),unitCost:productCostV827(p)};return applySaleAdjustmentV8211(base,parseSaleAdjustmentV8211(question,it));});
    }else{
      items=parseRequestedItemsV829(question);
      if(!items.length){const detectedProduct=productByQuestion(question);if(detectedProduct)items=[{productId:detectedProduct.id,productName:detectedProduct.name,quantity:extractQuantityV827(question),stock:Number(detectedProduct.stock||0),unitPrice:productPriceV827(detectedProduct),unitCost:productCostV827(detectedProduct)}];}
    }
    const merged=new Map();items.forEach(it=>{const key=String(it.productId||normalizedName(it.productName));const prev=merged.get(key);if(prev)prev.quantity+=Number(it.quantity||0);else merged.set(key,{...it});});items=[...merged.values()];
    const globalAdjustment=parseSaleAdjustmentV8211(question,supplied||{});
    if(globalAdjustment.kind&&items.length===1)items=[applySaleAdjustmentV8211(items[0],globalAdjustment)];
    const missing=[];
    if(['create_payment_plan','register_payment','generate_receipt'].includes(type)&&!client?.id)missing.push('cliente');
    if(['prepare_promotion','prepare_production'].includes(type)&&(!items.length||items.some(x=>!x.productId)))missing.push('producto');
    if(['create_payment_plan','register_payment','generate_receipt'].includes(type)&&!amount)missing.push(type==='create_payment_plan'?'monto de la cuota':'monto pagado');
    if(['prepare_sale','create_quote'].includes(type)&&(!items.length||items.some(x=>!x.productId)))missing.push('producto');
    if(['prepare_sale','create_quote'].includes(type)&&explicitClientQuery&&!client?.id)missing.push(candidateRows.length>1?'cliente por confirmar':'cliente');
    if(['prepare_sale','create_quote'].includes(type)&&globalAdjustment.kind&&items.length>1&&!items.some(x=>Number(x.manualPrice)>0))missing.push('producto de la rebaja');
    const externalMissing=(Array.isArray(response?.missingFields)?response.missingFields:[]).map(friendlyMissingFieldV829).filter(Boolean).filter(field=>!(['prepare_sale','create_quote'].includes(type)&&isNonBlockingSaleFieldV829(field)));
    const saleType=inferSaleTypeV829(client,question,supplied?.sale_type||'');
    const promotionPercent=Number(supplied?.discount_percent)||((q.match(/(\d+(?:[.,]\d+)?)\s*%/)||[])[1]?Number((q.match(/(\d+(?:[.,]\d+)?)\s*%/)||[])[1].replace(',','.')):0);
    const productionQuantity=Math.max(0,Number(supplied?.quantity)||extractExplicitQuantityV832(question));
    const suppliedPriority=String(supplied?.priority||'').trim();
    const taskPriority=['urgent','high','normal','low'].includes(suppliedPriority)?suppliedPriority:(/urgente|critica|crítica/.test(q)?'urgent':/alta|prioridad alta/.test(q)?'high':/baja/.test(q)?'low':'normal');
    const taskDueDate=String(supplied?.due_date||'').trim()||(()=>{const d=new Date();if(/pasado manana|pasado mañana/.test(q))d.setDate(d.getDate()+2);else if(/manana|mañana/.test(q))d.setDate(d.getDate()+1);return d.toISOString().slice(0,10);})();
    const parsedTaskTitle=clampText(String(question||'').replace(/^(crea|crear|anota|agrega|programa|recordar|recordatorio)\s+(una\s+)?tarea\s*(para|de|sobre)?\s*/i,''),140);
    const taskTitle=type==='create_task'?clampText(supplied?.task_title||parsedTaskTitle||'Tarea del director',140):'';
    const responsibleMatch=String(question||'').match(/(?:responsable|asignada? a|asignar a)\s+([a-záéíóúñ ]{2,60}?)(?=\s+(?:para|antes|hoy|mañana|manana|pasado|el|la)\b|[,.]|$)/i);
    const taskResponsible=clampText(supplied?.responsible||responsibleMatch?.[1]||'Administrador central',120);
    return {type,clientId:client?.id||'',clientName:clientDisplayName(client),clientQuery:requestedClientQuery,clientCandidates:candidateRows.map(row=>({id:row.client.id,name:clientDisplayName(row.client),score:row.score})),amount,installmentAmount:Number(supplied?.installment_amount)||amount,frequency:supplied?.frequency||extractFrequency(question),startDate:supplied?.start_date||new Date().toISOString().slice(0,10),note:clampText(supplied?.note||question,240),paymentMethod:supplied?.payment_method||paymentMethodFromTextV827(question),saleType,items,promotionPercent:round2(promotionPercent),productionQuantity,taskTitle,taskPriority,taskDueDate,taskResponsible,adjustment:globalAdjustment,missingFields:[...new Set([...externalMissing,...missing].map(friendlyMissingFieldV829))],account:client?clientDebtInfo(client):account};
  }
  const resolveDraftActionV825=resolveDraftActionV829;
  function dateMs(v){ const n=Number(new Date(v||0)); return Number.isFinite(n)?n:0; }
  function daysSince(v){ const n=dateMs(v); return n?Math.max(0,Math.floor((Date.now()-n)/86400000)):9999; }
  function receivableStats(){
    const {sales,historicalReceivables,payments}=dataset();
    const operations=[...(sales||[]),...(historicalReceivables||[])];
    const open=[];
    operations.forEach(x=>{
      let balance=0, paid=0;
      if(window.NVFinancialCoreV820){ paid=NVFinancialCoreV820.paidTotal(x,payments||[]); balance=NVFinancialCoreV820.balance(x,payments||[]); }
      else { const direct=Number(x.paidAmount||x.amountPaid)||0; const extra=(payments||[]).filter(p=>p.status!=='voided').reduce((sum,p)=>sum+(String(p.saleId||'')===String(x.id||'')?Number(p.amount||0):0),0); paid=Math.min(Number(x.total||0),direct+extra); balance=Math.max(0,Number(x.total||0)-paid); }
      if(balance>.009) open.push({...x,paid,balance,historical:!!(x.historicalActive||x.sourceSystem==='Mi Negocio')});
    });
    return {open,total:open.reduce((a,x)=>a+x.balance,0),overdue:open.filter(x=>dateMs(x.dueDate||x.originalDate||x.date)<Date.now()),historical:open.filter(x=>x.historical)};
  }
  function productPriceV827(product){
    if(!product)return 0;
    try{const calculated=window.unitPrice?Number(unitPrice(product)):0;if(calculated>0)return calculated;}catch(_){}
    return Number(product.price??product.unitPrice??product.retailPrice??product.publicPrice??product.marketPrice??0)||0;
  }
  function productCostV827(product){
    if(!product)return 0;
    try{const calculated=window.grossCost?Number(grossCost(product)):0;if(calculated>0)return calculated;}catch(_){}
    return Number(product.cost??product.unitCost??product.baseCost??product.realCost??0)||0;
  }
  function productByQuestion(q){
    const products=dataset().products||[]; const nq=normalizedName(q);
    const tokens=nq.split(/\s+/).filter(w=>w.length>1&&!['aceite','coco','frasco','unidad','unidades','venta','recibo','cotizacion','cotización','elabora','prepara'].includes(w));
    const size=(nq.match(/\b(60|100|115|125|200|500)\s*ml\b/)||[])[1]||'';
    const material=/\bpet\b/.test(nq)?'pet':/vidrio/.test(nq)?'vidrio':'';
    const rows=products.map(p=>{const hay=normalizedName([p.name,p.presentation,p.packageType,p.category].filter(Boolean).join(' '));let score=0;tokens.forEach(w=>{if(hay.includes(w))score+=w.length>=3?3:1;});if(size&&hay.includes(size))score+=8;if(material&&hay.includes(material))score+=6;if(/aceite/.test(nq)&&/aceite/.test(hay))score+=3;if(/coco/.test(nq)&&/coco/.test(hay))score+=3;return {p,score};}).sort((a,b)=>b.score-a.score);
    return rows[0]?.score>=5?rows[0].p:null;
  }
  function wordNumberV827(word){const map={un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,quince:15,veinte:20,treinta:30};return map[normalizedName(word)]||0;}
  function extractQuantityV827(query){
    const q=normalizedName(query);
    const explicit=q.match(/\b(\d{1,3})\s*(?:unidades?|frascos?|aceites?|productos?)\b/)||q.match(/(?:cantidad|cant\.?|x)\s*(\d{1,3})\b/);
    if(explicit){const n=Number(explicit[1]);if(n>0&&n<=999)return n;}
    const words=q.split(/\s+/);
    for(let i=0;i<words.length;i++){const n=wordNumberV827(words[i]);if(n&&/(?:unidades?|frascos?|aceites?|productos?)/.test(words[i+1]||''))return n;}
    for(const word of words){const n=wordNumberV827(word);if(n)return n;}
    const bare=q.match(/\b(\d{1,3})\b(?!\s*ml)/);
    if(bare){const n=Number(bare[1]);if(n>0&&n<=999&&!['60','100','115','125','200','500'].includes(bare[1]))return n;}
    return 1;
  }
  function extractExplicitQuantityV832(query){
    const q=normalizedName(query);
    const explicit=q.match(/\b(\d{1,3})\s*(?:unidades?|frascos?|aceites?|productos?)\b/)||q.match(/(?:cantidad|cant\.?|x)\s*(\d{1,3})\b/);
    if(explicit){const n=Number(explicit[1]);if(n>0&&n<=999)return n;}
    const words=q.split(/\s+/);
    for(let i=0;i<words.length;i++){const n=wordNumberV827(words[i]);if(n&&/(?:unidades?|frascos?|aceites?|productos?)/.test(words[i+1]||''))return n;}
    return 0;
  }
  function paymentMethodFromTextV827(query){const q=normalizedName(query);if(/\bqr\b|transferencia|deposito|depósito/.test(q))return'qr';if(/credito|crédito|a cuenta|por cobrar/.test(q))return'credit';if(/efectivo|contado/.test(q))return'cash';return'';}
  function parseSaleAdjustmentV8211(query,supplied={}){
    const q=compactNameV8211(query);let kind='';let value=0;
    const finalMatch=q.match(/(?:precio\s+final|dejalo\s+en|déjalo\s+en|cobrar\s+a)\s*(?:bs|bob)?\s*(\d+(?:[.,]\d{1,2})?)/i);
    const pctMatch=q.match(/(?:rebaja|descuento)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*%/i);
    const amountMatch=q.match(/(?:rebaja|descuento)\s+(?:de\s+)?(?:bs|bob)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:bolivianos?|bs|bob)?/i);
    if(finalMatch){kind='final';value=Number(finalMatch[1].replace(',','.'));}
    else if(pctMatch){kind='discount_percent';value=Number(pctMatch[1].replace(',','.'));}
    else if(amountMatch){kind='discount_amount';value=Number(amountMatch[1].replace(',','.'));}
    else if(Number(supplied?.final_unit_price)>0){kind='final';value=Number(supplied.final_unit_price);}
    else if(Number(supplied?.discount_percent)>0){kind='discount_percent';value=Number(supplied.discount_percent);}
    else if(Number(supplied?.discount_amount)>0){kind='discount_amount';value=Number(supplied.discount_amount);}
    return {kind,value:Number.isFinite(value)&&value>0?round2(value):0,reason:kind?clampText(`Ajuste solicitado por el administrador: ${String(query||'')}`,180):''};
  }
  function applySaleAdjustmentV8211(item,adjustment){
    if(!item||!adjustment?.kind||!(adjustment.value>0))return item;
    const base=Number(item.unitPrice||0);let final=base;
    if(adjustment.kind==='final')final=adjustment.value;
    if(adjustment.kind==='discount_amount')final=base-adjustment.value;
    if(adjustment.kind==='discount_percent')final=base-(base*adjustment.value/100);
    final=round2(Math.max(0,final));
    return {...item,manualPrice:final,adjustmentMode:adjustment.kind,adjustmentValue:adjustment.value,adjustmentReason:adjustment.reason};
  }
  function parseRequestedItemsV829(query){
    const q=normalizedName(query);const found=[];
    const numberWords='un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta';
    const re=new RegExp(`\\b(\\d{1,3}|${numberWords})\\b\\s*(?:aceites?|frascos?|unidades?|productos?)?\\s*(?:de\\s*)?(60|100|115|125|200|500)\\s*ml(?:\\s*(pet|vidrio))?`,'g');
    let match;
    while((match=re.exec(q))){
      const qty=Number(match[1])||wordNumberV827(match[1])||1;const size=match[2];const material=match[3]||'';
      const product=productByQuestion(`aceite de coco ${size} ml ${material}`);
      if(product)found.push({productId:product.id,productName:product.name,quantity:Math.max(1,Math.min(999,qty)),stock:Number(product.stock||0),unitPrice:productPriceV827(product),unitCost:productCostV827(product)});
    }
    return found;
  }
  function saleTypeLabelV829(value){return ({unit:'Unitaria',market:'Mayorista',representative_transfer:'Representantes',reseller_unit:'Reventa unitaria',reseller_wholesale:'Reventa mayorista'})[value]||'Venta normal';}
  function productOptionsV829(selectedId,selectedName=''){
    const products=(dataset().products||[]).filter(p=>p.status!=='archived');const selected=products.find(p=>String(p.id)===String(selectedId));const size=(normalizedName(selected?.name||selectedName).match(/\\b(60|100|115|125|200|500)\\s*ml\\b/)||[])[1]||'';
    const rows=products.filter(p=>!size||normalizedName(p.name).includes(size)).slice(0,30);if(selected&&!rows.some(p=>String(p.id)===String(selected.id)))rows.unshift(selected);
    return rows.map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(selectedId)?'selected':''}>${esc(p.name)} · stock ${Number(p.stock||0)} · ${esc(money(productPriceV827(p)))}</option>`).join('');
  }

  function promotionCandidates(){
    const st=salesStats(30), products=dataset().products||[];
    const sold=new Map(st.byProduct.map(x=>[normalizedName(x.name),x.qty]));
    return products.map(p=>{ const stock=Number(p.stock||0); const qty=sold.get(normalizedName(p.name))||0; const cost=Number(p.cost??p.baseCost??(window.grossCost?grossCost(p):0))||0; const price=Number(p.price??p.retailPrice??p.publicPrice??(window.unitPrice?unitPrice(p):0))||0; const margin=price?((price-cost)/price*100):0; return {p,stock,qty,margin,score:(stock>10?2:0)+(qty<3?2:0)+(margin>25?1:0)}; }).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score).slice(0,6);
  }
  function recommendations(){
    const rec=[]; const st=salesStats(30), cs=clientStats(), ss=stockStats(), rs=receivableStats();
    if(ss.negative.length) rec.push({level:'critical',title:'Corregir stock negativo',detail:`${ss.negative.length} producto(s) presentan stock negativo.`,question:'¿Qué productos tienen stock negativo?'});
    if(ss.critical.length) rec.push({level:'high',title:'Priorizar reposición',detail:`${ss.critical.length} producto(s) están en stock crítico.`,question:'¿Tengo stock crítico?'});
    if(rs.overdue.length) rec.push({level:'high',title:'Revisar cobranzas vencidas',detail:`${rs.overdue.length} cuenta(s) vencidas por ${money(rs.overdue.reduce((a,x)=>a+x.balance,0))}.`,question:'¿Qué cuentas están vencidas?'});
    if(cs.inactive.length) rec.push({level:'medium',title:'Recuperar clientes inactivos',detail:`${cs.inactive.length} cliente(s) no compran hace más de 30 días.`,question:'¿Qué clientes requieren seguimiento?'});
    if(st.margin>0&&st.margin<25) rec.push({level:'high',title:'Revisar margen',detail:`El margen promedio de 30 días es ${st.margin.toFixed(1)}%.`,question:'¿Cómo está mi margen?'});
    promotionCandidates().slice(0,2).forEach(x=>rec.push({level:'medium',title:`Impulsar ${x.p.name||'producto'}`,detail:`Stock ${x.stock}; movimiento bajo y margen estimado ${x.margin.toFixed(1)}%.`,question:`Analiza una promoción para ${x.p.name||'este producto'}`}));
    return rec.slice(0,6);
  }


  function readControlTasksV832(){
    try{const rows=JSON.parse(localStorage.getItem(controlTasksKeyV832())||'[]');return (Array.isArray(rows)?rows:[]).filter(Boolean).slice(-200);}catch(_){return[];}
  }
  function setControlSyncStateV834(patch={}){
    controlSyncStateV834={...controlSyncStateV834,...patch};
    document.querySelectorAll('[data-control-sync-v834]').forEach(el=>{el.textContent=controlSyncStateV834.status==='online'?'Sincronizado':controlSyncStateV834.status==='syncing'?'Sincronizando…':controlSyncStateV834.status==='setup'?'Falta activar nube':'Modo local';el.dataset.state=controlSyncStateV834.status;});
    try{window.dispatchEvent(new CustomEvent('nv:ai-control-sync',{detail:{...controlSyncStateV834}}));}catch(_){}
  }
  function currentControlUserIdV834(){return String(window.AppState?.session?.onlineUserId||window.AppState?.session?.userId||'');}
  function controlCloudAvailableV834(){return !!(navigator.onLine&&currentControlUserIdV834()&&getSupabaseForAI());}
  function normalizeControlTaskV834(task={}){
    return {id:String(task.id||uid()),title:clampText(task.title||'Tarea del director',160),detail:clampText(task.detail||task.notes||'',320),priority:['urgent','high','normal','low'].includes(task.priority)?task.priority:'normal',status:['pending','in_progress','completed','cancelled'].includes(task.status)?task.status:'pending',dueDate:String(task.dueDate||new Date().toISOString().slice(0,10)).slice(0,10),area:clampText(task.area||'administration',60),source:clampText(task.source||'assistant',60),responsible:clampText(task.responsible||task.assigneeName||'Administrador central',120),clientId:String(task.clientId||''),clientName:clampText(task.clientName||'',160),createdAt:Number(task.createdAt)||Date.now(),updatedAt:Number(task.updatedAt)||Date.now(),syncStatus:task.syncStatus||'local'};
  }
  function mapControlTaskFromCloudV834(row={}){const payload=row.payload||{};return normalizeControlTaskV834({id:row.id,title:row.title,detail:row.detail,priority:row.priority,status:row.status,dueDate:row.due_date,area:row.area,source:row.source,responsible:payload.responsible,clientId:payload.clientId,clientName:payload.clientName,createdAt:Date.parse(row.created_at)||Date.now(),updatedAt:Date.parse(row.updated_at)||Date.now(),syncStatus:'cloud'});}
  function mapControlTaskToCloudV834(task,userId){const t=normalizeControlTaskV834(task);return {id:t.id,owner_user_id:userId,title:t.title,detail:t.detail,priority:t.priority,status:t.status,due_date:t.dueDate||null,area:t.area,source:t.source,payload:{responsible:t.responsible,clientId:t.clientId,clientName:t.clientName},created_at:new Date(t.createdAt).toISOString(),updated_at:new Date(t.updatedAt).toISOString()};}
  function saveControlTasksV832(rows,options={}){const clean=(rows||[]).map(normalizeControlTaskV834).slice(-200);try{localStorage.setItem(controlTasksKeyV832(),JSON.stringify(clean));}catch(_){}updateControlIndicatorsV832();if(!options.skipSync)scheduleControlSyncV834();return clean;}
  function upsertControlTaskV832(task){
    const rows=readControlTasksV832();const next=normalizeControlTaskV834({...task,updatedAt:Date.now(),syncStatus:'pending'});const i=rows.findIndex(x=>String(x.id)===String(next.id));if(i>=0)rows[i]={...rows[i],...next};else rows.push(next);saveControlTasksV832(rows);return next;
  }
  function readAlertStateV832(){try{const value=JSON.parse(localStorage.getItem(controlAlertStateKeyV832())||'{}');return value&&typeof value==='object'?value:{};}catch(_){return{};}}
  function saveAlertStateV832(value,options={}){try{localStorage.setItem(controlAlertStateKeyV832(),JSON.stringify(value||{}));}catch(_){}updateControlIndicatorsV832();if(!options.skipSync)queueControlStateSyncV834('alert-snoozes',value||{});}
  function isMissingControlTableV834(error){return /does not exist|schema cache|could not find the table|42p01/i.test(String(error?.message||error||''));}
  function mergeAlertStateV834(localState={},cloudState={}){const out={...cloudState};Object.entries(localState||{}).forEach(([key,value])=>{if(!out[key]||Number(value?.updatedAt||0)>=Number(out[key]?.updatedAt||0))out[key]=value;});return out;}
  async function pushControlStateV834(stateKey,payload){
    if(!controlCloudAvailableV834())return {ok:false,status:'local'};const sb=getSupabaseForAI(),userId=currentControlUserIdV834();
    const {error}=await sb.from(CONTROL_STATE_TABLE_V834).upsert({owner_user_id:userId,state_key:String(stateKey),payload:payload||{},updated_at:new Date().toISOString()},{onConflict:'owner_user_id,state_key'});
    if(error)throw error;return {ok:true};
  }
  function queueControlStateSyncV834(stateKey,payload){if(!controlCloudAvailableV834())return;setTimeout(()=>pushControlStateV834(stateKey,payload).then(()=>setControlSyncStateV834({status:'online',message:'Control sincronizado',lastSyncAt:Date.now(),lastError:'',migrationReady:true})).catch(error=>{const missing=isMissingControlTableV834(error);setControlSyncStateV834({status:missing?'setup':'local',message:missing?'Ejecuta la migración V8.3.4':'Sincronización pendiente',lastError:String(error?.message||error),migrationReady:missing?false:controlSyncStateV834.migrationReady});}),80);}
  function scheduleControlSyncV834(delay=350){clearTimeout(controlSyncTimerV834);controlSyncTimerV834=setTimeout(()=>syncControlCenterV834({silent:true}).catch(()=>{}),delay);}
  async function syncControlCenterV834(options={}){
    if(!controlCloudAvailableV834()){setControlSyncStateV834({status:'local',message:navigator.onLine?'Sesión no disponible':'Sin conexión'});return {ok:false,status:'local'};}
    const sb=getSupabaseForAI(),userId=currentControlUserIdV834();setControlSyncStateV834({status:'syncing',message:'Sincronizando control…'});
    try{
      const [taskResult,stateResult]=await Promise.all([sb.from(CONTROL_TASKS_TABLE_V834).select('*').eq('owner_user_id',userId).order('updated_at',{ascending:true}),sb.from(CONTROL_STATE_TABLE_V834).select('*').eq('owner_user_id',userId)]);
      if(taskResult.error)throw taskResult.error;if(stateResult.error)throw stateResult.error;
      const local=readControlTasksV832().map(normalizeControlTaskV834),cloud=(taskResult.data||[]).map(mapControlTaskFromCloudV834),merged=new Map();
      [...cloud,...local].forEach(task=>{const old=merged.get(task.id);if(!old||Number(task.updatedAt)>=Number(old.updatedAt))merged.set(task.id,task);});
      const rows=[...merged.values()].sort((a,b)=>a.createdAt-b.createdAt).slice(-200);const cloudMap=new Map(cloud.map(x=>[x.id,x]));
      const toPush=rows.filter(t=>!cloudMap.has(t.id)||Number(t.updatedAt)>Number(cloudMap.get(t.id).updatedAt)+500).map(t=>mapControlTaskToCloudV834(t,userId));
      if(toPush.length){const {error}=await sb.from(CONTROL_TASKS_TABLE_V834).upsert(toPush,{onConflict:'owner_user_id,id'});if(error)throw error;}
      rows.forEach(t=>t.syncStatus='cloud');saveControlTasksV832(rows,{skipSync:true});
      const states=new Map((stateResult.data||[]).map(row=>[row.state_key,row]));const cloudAlerts=states.get('alert-snoozes')?.payload||{};const mergedAlerts=mergeAlertStateV834(readAlertStateV832(),cloudAlerts);saveAlertStateV832(mergedAlerts,{skipSync:true});
      if(JSON.stringify(mergedAlerts)!==JSON.stringify(cloudAlerts))await pushControlStateV834('alert-snoozes',mergedAlerts);
      const today=new Date().toISOString().slice(0,10),summaryKey=`daily-summary:${today}`,cloudSummary=states.get(summaryKey)?.payload||null;let localSummary=null;try{localSummary=JSON.parse(localStorage.getItem(dailySummaryKeyV832())||'null');}catch(_){}
      const summary=(!cloudSummary||Number(localSummary?.createdAt||0)>=Number(cloudSummary?.createdAt||0))?localSummary:cloudSummary;if(summary)try{localStorage.setItem(dailySummaryKeyV832(),JSON.stringify(summary));}catch(_){}if(summary&&JSON.stringify(summary)!==JSON.stringify(cloudSummary))await pushControlStateV834(summaryKey,summary);
      const weekKey=`weekly-summary:${weekStartV835()}`,cloudWeekly=states.get(weekKey)?.payload||null;let localWeekly=null;try{localWeekly=JSON.parse(localStorage.getItem(weeklySummaryKeyV835())||'null');}catch(_){}
      const weekly=(!cloudWeekly||Number(localWeekly?.createdAt||0)>=Number(cloudWeekly?.createdAt||0))?localWeekly:cloudWeekly;if(weekly)try{localStorage.setItem(weeklySummaryKeyV835(),JSON.stringify(weekly));}catch(_){}if(weekly&&JSON.stringify(weekly)!==JSON.stringify(cloudWeekly))await pushControlStateV834(weekKey,weekly);
      const cloudProactive=states.get('proactive-state')?.payload||{};let localProactive={};try{localProactive=JSON.parse(localStorage.getItem(proactiveStateKeyV835())||'{}');}catch(_){}const proactive=Number(localProactive?.shownAt||0)>=Number(cloudProactive?.shownAt||0)?localProactive:cloudProactive;try{localStorage.setItem(proactiveStateKeyV835(),JSON.stringify(proactive||{}));}catch(_){}if(JSON.stringify(proactive)!==JSON.stringify(cloudProactive))await pushControlStateV834('proactive-state',proactive);
      setControlSyncStateV834({status:'online',message:'Tareas y prioridades sincronizadas',lastSyncAt:Date.now(),lastError:'',migrationReady:true});updateControlIndicatorsV832();if(!options.silent)window.showToast?.('Centro ejecutivo sincronizado.');return {ok:true,count:rows.length};
    }catch(error){const missing=isMissingControlTableV834(error);setControlSyncStateV834({status:missing?'setup':'local',message:missing?'Falta ejecutar la migración V8.3.4':'Se conserva el control local',lastError:String(error?.message||error),migrationReady:missing?false:controlSyncStateV834.migrationReady});if(!options.silent)window.showToast?.(missing?'Ejecuta la migración V8.3.4 en Supabase.':'No se pudo sincronizar; las tareas siguen guardadas en este dispositivo.','error');return {ok:false,error};}
  }
  function installControlRealtimeV834(){
    if(!controlCloudAvailableV834())return;const sb=getSupabaseForAI(),userId=currentControlUserIdV834();if(controlRealtimeChannelV834)try{sb.removeChannel(controlRealtimeChannelV834);}catch(_){}
    controlRealtimeChannelV834=sb.channel(`nv-ai-control-v834-${userId}`).on('postgres_changes',{event:'*',schema:'public',table:CONTROL_TASKS_TABLE_V834,filter:`owner_user_id=eq.${userId}`},()=>scheduleControlSyncV834(120)).on('postgres_changes',{event:'*',schema:'public',table:CONTROL_STATE_TABLE_V834,filter:`owner_user_id=eq.${userId}`},()=>scheduleControlSyncV834(120)).subscribe(status=>{if(status==='SUBSCRIBED')setControlSyncStateV834({status:'online',message:'Control en tiempo real'});});
  }
  function installControlSyncV834(){
    syncControlCenterV834({silent:true}).then(()=>installControlRealtimeV834()).catch(()=>{});
    window.addEventListener('online',()=>syncControlCenterV834({silent:true}).then(()=>installControlRealtimeV834()).catch(()=>{}));
    window.addEventListener('nv:session-state',event=>{if(event?.detail?.state==='active')syncControlCenterV834({silent:true}).then(()=>installControlRealtimeV834()).catch(()=>{});});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncControlCenterV834({silent:true}).then(()=>showControlReminderV834()).catch(()=>{});});
  }
  function productCommercialHealthV832(){
    const {products,sales,productionOrders}=dataset();const since=Date.now()-30*86400000;const sold=new Map();
    (sales||[]).filter(row=>dateMs(row.date||row.createdAt)>=since).forEach(row=>(row.items||[]).forEach(item=>{const key=String(item.productId||normalizedName(item.name));sold.set(key,(sold.get(key)||0)+Number(item.qty||item.quantity||0));}));
    const threshold=Number(dataset().settings.lowStockThreshold||5);return (products||[]).filter(p=>p.status!=='archived').map(product=>{const key=String(product.id||normalizedName(product.name));const units30=Number(sold.get(key)||sold.get(normalizedName(product.name))||0);const daily=units30/30;const stock=Number(product.stock||0);const coverage=daily>0?stock/daily:(stock>threshold?999:0);const openPlanned=(productionOrders||[]).filter(o=>String(o.productId)===String(product.id)&&['planned','in_progress'].includes(o.status)).reduce((sum,o)=>sum+Number(o.plannedOutput||0),0);const target=Math.max(threshold*3,Math.ceil(daily*30*1.15));const suggested=Math.max(0,Math.ceil(target-stock-openPlanned));const price=productPriceV827(product),cost=productCostV827(product),margin=price?((price-cost)/price*100):0;return {product,units30,daily,stock,coverage,openPlanned,suggested,price,cost,margin};}).sort((a,b)=>a.coverage-b.coverage||b.suggested-a.suggested);
  }
  function controlAlertsV832(includeSnoozed=false){
    const rows=[];const rs=receivableStats(),cs=clientStats(),st=salesStats(30),health=productCommercialHealthV832(),state=readAlertStateV832(),now=Date.now();
    health.filter(x=>x.stock<0).forEach(x=>rows.push({id:`stock-negative:${x.product.id}`,priority:'urgent',area:'inventario',title:`Stock negativo: ${x.product.name}`,detail:`Existencia registrada ${x.stock}. Requiere saneamiento antes de vender o producir.`,question:`Analiza el stock de ${x.product.name}`,actionTab:'inventario'}));
    health.filter(x=>x.stock>=0&&x.coverage<=7&&x.suggested>0).slice(0,8).forEach(x=>rows.push({id:`production:${x.product.id}`,priority:x.coverage<=3?'urgent':'high',area:'production',title:`Producir ${x.product.name}`,detail:`Cobertura estimada ${x.coverage===999?'sin consumo':x.coverage.toFixed(1)+' días'}; sugerencia ${x.suggested} unidad(es), descontando órdenes abiertas.`,question:`Prepara una orden de producción de ${x.suggested} unidades de ${x.product.name}`,actionTab:'produccion',productId:x.product.id,suggestedQuantity:x.suggested}));
    if(rs.overdue.length)rows.push({id:'receivables-overdue',priority:'high',area:'collections',title:'Cobranzas vencidas',detail:`${rs.overdue.length} cuenta(s) vencidas por ${money(rs.overdue.reduce((a,x)=>a+Number(x.balance||0),0))}.`,question:'¿Qué cobranzas debo priorizar?',actionTab:'por-cobrar'});
    if(cs.inactive.length)rows.push({id:'inactive-clients',priority:'normal',area:'sales',title:'Clientes sin recompra',detail:`${cs.inactive.length} cliente(s) sin movimiento en más de 30 días.`,question:'Prepara seguimientos para clientes inactivos',actionTab:'clientes'});
    if(st.margin>0&&st.margin<25)rows.push({id:'low-margin',priority:'high',area:'sales',title:'Margen comercial bajo',detail:`Margen estimado de 30 días: ${st.margin.toFixed(1)}%. Revisa descuentos y costos.`,question:'Evalúa el margen y los descuentos',actionTab:'reglas-comerciales'});
    const oldOrders=(dataset().productionOrders||[]).filter(o=>['planned','in_progress'].includes(o.status)&&daysSince(o.createdAt||o.updatedAt)>7);if(oldOrders.length)rows.push({id:'old-production-orders',priority:'normal',area:'production',title:'Órdenes de producción demoradas',detail:`${oldOrders.length} orden(es) abiertas por más de siete días.`,question:'Evalúa las órdenes de producción pendientes',actionTab:'produccion'});
    return rows.filter(row=>{const st=state[row.id];return includeSnoozed||!st?.snoozeUntil||Number(st.snoozeUntil)<=now;}).sort((a,b)=>({urgent:0,high:1,normal:2,low:3}[a.priority]-({urgent:0,high:1,normal:2,low:3}[b.priority])));
  }
  function personnelScoreV835(){
    const tasks=readControlTasksV832(),completed=tasks.filter(x=>x.status==='completed').length,open=tasks.filter(x=>['pending','in_progress'].includes(x.status)).length;
    const assigned=tasks.filter(x=>String(x.responsible||'').trim()).length;
    const completion=tasks.length?completed/tasks.length*100:78;
    const assignment=tasks.length?assigned/tasks.length*100:80;
    const overdue=taskOverviewV834().overdue.length;
    return Math.max(0,Math.min(100,Math.round(completion*.55+assignment*.25+Math.max(0,100-overdue*12)*.20)));
  }
  function businessEvaluationV832(){
    const st=salesStats(30),ss=stockStats(),rs=receivableStats(),cs=clientStats(),health=productCommercialHealthV832();
    const marginScore=Math.max(0,Math.min(100,st.margin?st.margin/30*100:50));const inventoryScore=Math.max(0,100-ss.critical.length*12-ss.negative.length*30);const collectionBase=rs.total>0?Math.max(0,100-(rs.overdue.reduce((a,x)=>a+Number(x.balance||0),0)/Math.max(rs.total,1))*100):100;const customerScore=Math.max(0,100-(cs.total?cs.inactive.length/cs.total*100:0));const productionRisk=health.filter(x=>x.coverage<=7&&x.suggested>0).length;const productionScore=Math.max(0,100-productionRisk*12);const salesScore=st.rows.length?Math.min(100,55+Math.log10(st.rows.length+1)*25):35;const personnelScore=personnelScoreV835();const dimensions=[['Ventas',salesScore],['Margen',marginScore],['Inventario',inventoryScore],['Cobranzas',collectionBase],['Clientes',customerScore],['Producción',productionScore],['Personal',personnelScore]].map(([name,value])=>({name,score:Math.round(Number(value))}));const score=Math.round(dimensions.reduce((sum,x)=>sum+x.score,0)/dimensions.length);return {score,label:score>=85?'Sólido':score>=70?'Estable':score>=55?'En observación':'Prioridad alta',dimensions,note:'Indicador operativo interno; no sustituye una auditoría financiera.'};
  }
  function taskOverviewV834(){
    const today=new Date().toISOString().slice(0,10),open=readControlTasksV832().filter(x=>['pending','in_progress'].includes(x.status)),overdue=open.filter(x=>x.dueDate&&x.dueDate<today),dueToday=open.filter(x=>x.dueDate===today),urgent=open.filter(x=>x.priority==='urgent'||x.priority==='high');
    return {today,open,overdue,dueToday,urgent};
  }
  function executiveOverviewV834(){
    const tasks=taskOverviewV834(),alerts=controlAlertsV832(),evaluation=businessEvaluationV832();const priority=tasks.overdue[0]||tasks.urgent[0]||alerts[0]||tasks.dueToday[0]||null;
    return {tasks,alerts,evaluation,priority,title:priority?.title||'Operación bajo control',detail:priority?.detail||'No existen tareas vencidas ni alertas críticas activas.'};
  }
  function dailySummaryV832(){
    const today=salesStats(1),week=salesStats(7),ev=executiveOverviewV834(),tasks=ev.tasks;
    return {date:new Date().toISOString().slice(0,10),createdAt:Date.now(),title:'Resumen ejecutivo automático',body:`Hoy se registran ${today.rows.length} venta(s) por ${money(today.revenue)}. En siete días: ${money(week.revenue)}. Salud operativa: ${ev.evaluation.score}/100 (${ev.evaluation.label}).`,facts:[`${ev.alerts.length} alerta(s) activa(s).`,`${tasks.open.length} tarea(s) abierta(s): ${tasks.overdue.length} vencida(s) y ${tasks.dueToday.length} para hoy.`,ev.priority?`Prioridad principal: ${ev.priority.title}.`:'Sin prioridades críticas activas.']};
  }
  function ensureDailySummaryV832(){
    const summary=dailySummaryV832();try{const old=JSON.parse(localStorage.getItem(dailySummaryKeyV832())||'null');if(old?.date===summary.date)return old;localStorage.setItem(dailySummaryKeyV832(),JSON.stringify(summary));queueControlStateSyncV834(`daily-summary:${summary.date}`,summary);return summary;}catch(_){return summary;}
  }
  function weekStartV835(value=new Date()){const d=new Date(value);const day=(d.getDay()+6)%7;d.setHours(0,0,0,0);d.setDate(d.getDate()-day);return d.toISOString().slice(0,10);}
  function weeklySummaryV835(){
    const current=salesStats(7),fortnight=salesStats(14),previousRevenue=Math.max(0,fortnight.revenue-current.revenue),previousRows=Math.max(0,fortnight.rows.length-current.rows.length),delta=previousRevenue>0?((current.revenue-previousRevenue)/previousRevenue*100):current.revenue>0?100:0;
    const ev=executiveOverviewV834(),top=current.byProduct?.[0],tasks=ev.tasks;
    return {weekStart:weekStartV835(),createdAt:Date.now(),title:'Resumen ejecutivo semanal',body:`En los últimos siete días se registraron ${current.rows.length} venta(s) por ${money(current.revenue)}. Frente a la semana anterior, la variación estimada es ${delta>=0?'+':''}${delta.toFixed(1)}%.`,facts:[top?`Producto con mayor movimiento: ${top.name}, ${Number(top.qty||0)} unidad(es).`:'Sin producto líder identificable esta semana.',`${ev.alerts.length} alerta(s) activa(s) y ${tasks.open.length} tarea(s) abierta(s).`,`${tasks.overdue.length} tarea(s) vencida(s); salud operativa ${ev.evaluation.score}/100.`],metrics:{currentRevenue:current.revenue,previousRevenue,currentSales:current.rows.length,previousSales:previousRows,delta:Number(delta.toFixed(1))}};
  }
  function ensureWeeklySummaryV835(force=false){
    const next=weeklySummaryV835();try{const old=JSON.parse(localStorage.getItem(weeklySummaryKeyV835())||'null');if(!force&&old?.weekStart===next.weekStart)return old;localStorage.setItem(weeklySummaryKeyV835(),JSON.stringify(next));queueControlStateSyncV834(`weekly-summary:${next.weekStart}`,next);return next;}catch(_){return next;}
  }
  function proactiveActionsV835(){
    const overview=executiveOverviewV834(),actions=[];const add=a=>{if(a&&!actions.some(x=>x.id===a.id))actions.push(a);};
    if(overview.tasks.overdue.length)add({id:'resolve-overdue',priority:'urgent',title:'Resolver tareas vencidas',detail:`${overview.tasks.overdue.length} tarea(s) requieren decisión.`,kind:'tasks',tab:'tasks'});
    overview.alerts.slice(0,5).forEach(a=>{
      if(a.id==='receivables-overdue')add({id:a.id,priority:a.priority,title:'Preparar gestión de cobranza',detail:a.detail,kind:'assistant',question:'Analiza las cobranzas vencidas y prepara la acción más prioritaria para revisión.'});
      else if(String(a.id).startsWith('production:'))add({id:a.id,priority:a.priority,title:'Preparar producción',detail:a.detail,kind:'assistant',question:a.question});
      else if(a.id==='inactive-clients')add({id:a.id,priority:a.priority,title:'Preparar seguimiento comercial',detail:a.detail,kind:'assistant',question:'Analiza los clientes inactivos y prepara un seguimiento comercial para revisión.'});
      else if(a.id==='low-margin')add({id:a.id,priority:a.priority,title:'Revisar promoción y margen',detail:a.detail,kind:'assistant',question:'Evalúa el margen actual y prepara una promoción segura para el producto más conveniente.'});
      else add({id:a.id,priority:a.priority,title:a.title,detail:a.detail,kind:'module',module:a.actionTab||'inicio'});
    });
    return actions.slice(0,6);
  }
  function readProactiveStateV835(){try{const v=JSON.parse(localStorage.getItem(proactiveStateKeyV835())||'{}');return v&&typeof v==='object'?v:{};}catch(_){return{};}}
  function saveProactiveStateV835(value){try{localStorage.setItem(proactiveStateKeyV835(),JSON.stringify(value||{}));}catch(_){}queueControlStateSyncV834('proactive-state',value||{});}
  function proactiveFingerprintV835(){const o=executiveOverviewV834();return [o.tasks.overdue.length,o.tasks.dueToday.length,o.alerts.map(x=>x.id).join('|'),o.evaluation.score].join(':');}
  function showProactiveBriefV835(force=false){
    const state=readProactiveStateV835(),today=new Date().toISOString().slice(0,10),fingerprint=proactiveFingerprintV835(),overview=executiveOverviewV834();
    if(!force&&state.date===today&&state.fingerprint===fingerprint)return;
    if(!overview.tasks.overdue.length&&!overview.alerts.some(x=>['urgent','high'].includes(x.priority)))return;
    saveProactiveStateV835({date:today,fingerprint,shownAt:Date.now()});
    window.showToast?.(`Director: ${overview.title}. Abre Control para revisar y actuar.`);
  }
  function showControlReminderV834(){
    const today=new Date().toISOString().slice(0,10);if(controlReminderShownV834===today)return;controlReminderShownV834=today;showProactiveBriefV835(false);
  }
  function updateControlIndicatorsV832(){const alerts=controlAlertsV832(),tasks=readControlTasksV832().filter(x=>['pending','in_progress'].includes(x.status)),evalData=businessEvaluationV832();const count=document.getElementById('nvAiControlCountV832');if(count)count.textContent=String(alerts.length+tasks.length);const health=document.getElementById('nvAiStatHealthV832');if(health)health.textContent=`${evalData.score}/100`;const pending=document.getElementById('nvAiStatTasksV832');if(pending)pending.textContent=String(tasks.length);}
  function snoozeAlertV832(id,days=3){const state=readAlertStateV832();state[id]={snoozeUntil:Date.now()+days*86400000,updatedAt:Date.now()};saveAlertStateV832(state);}
  function taskGroupsV835(tasks){
    const today=new Date().toISOString().slice(0,10),tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10),open=tasks.filter(x=>['pending','in_progress'].includes(x.status));
    return {overdue:open.filter(x=>x.dueDate&&x.dueDate<today),today:open.filter(x=>x.dueDate===today),upcoming:open.filter(x=>x.dueDate>today).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))),completed:tasks.filter(x=>x.status==='completed'),unscheduled:open.filter(x=>!x.dueDate),tomorrow};
  }
  function controlTaskCardV835(t){const today=new Date().toISOString().slice(0,10),late=['pending','in_progress'].includes(t.status)&&t.dueDate&&t.dueDate<today;return `<article class="${esc(t.status)} ${esc(t.priority)} ${late?'overdue':''}"><div><span>${esc(t.area||'administración')} · ${t.syncStatus==='cloud'?'nube':'pendiente'}</span><strong>${esc(t.title)}</strong><p>${esc(t.detail||'Sin detalle')}</p><small>Responsable: ${esc(t.responsible||'Administrador central')} · ${esc(t.dueDate||'sin fecha')}${late?' · VENCIDA':''}</small></div><button data-task-toggle-v832="${esc(t.id)}">${t.status==='completed'?'Reabrir':'Completar'}</button></article>`;}
  function openControlCenterV832(initial='overview'){
    closeActionSheet();let tab=initial;
    const render=()=>{
      const root=document.getElementById('nvAiControlBodyV832');if(!root)return;
      const alerts=controlAlertsV832(),tasks=readControlTasksV832().slice().sort((a,b)=>String(a.status).localeCompare(String(b.status))||String(a.dueDate).localeCompare(String(b.dueDate))),ev=businessEvaluationV832(),summary=ensureDailySummaryV832(),weekly=ensureWeeklySummaryV835(),overview=executiveOverviewV834(),proactive=proactiveActionsV835(),groups=taskGroupsV835(tasks);
      document.querySelectorAll('[data-control-tab-v832]').forEach(b=>b.classList.toggle('active',b.dataset.controlTabV832===tab));
      if(tab==='overview'){
        root.innerHTML=`<section class="nvAiExecutiveOverviewV834"><div class="nvAiExecutivePriorityV834 ${overview.priority?.priority||'normal'}"><span>Prioridad del día</span><strong>${esc(overview.title)}</strong><p>${esc(overview.detail)}</p></div><div class="nvAiExecutiveMetricsV834"><div><b>${overview.tasks.overdue.length}</b><span>Vencidas</span></div><div><b>${overview.tasks.dueToday.length}</b><span>Para hoy</span></div><div><b>${overview.alerts.filter(x=>x.priority==='urgent').length}</b><span>Críticas</span></div><div><b>${overview.evaluation.score}</b><span>Salud /100</span></div></div><section class="nvAiProactiveActionsV835"><div><span>Acciones recomendadas</span><small>El Director prepara; tú revisas y apruebas.</small></div>${proactive.map(a=>`<article class="${esc(a.priority||'normal')}"><div><strong>${esc(a.title)}</strong><p>${esc(a.detail)}</p></div><button data-proactive-action-v835="${esc(a.id)}">Preparar</button></article>`).join('')||'<p class="nvAiNoRec">No existen acciones urgentes para preparar.</p>'}</section><button class="btn outline block" id="nvAiSyncControlV834">Sincronizar ahora</button><small class="nvAiControlSyncLineV834"><i data-control-sync-v834 data-state="${esc(controlSyncStateV834.status)}">${controlSyncStateV834.status==='online'?'Sincronizado':controlSyncStateV834.status==='syncing'?'Sincronizando…':controlSyncStateV834.status==='setup'?'Falta activar nube':'Modo local'}</i>${controlSyncStateV834.lastSyncAt?` · ${new Date(controlSyncStateV834.lastSyncAt).toLocaleString('es-BO')}`:''}</small></section>`;
      }else if(tab==='alerts'){
        root.innerHTML=alerts.length?alerts.map(a=>`<article class="nvAiControlAlertV832 ${a.priority}"><div><span>${a.priority==='urgent'?'Crítica':a.priority==='high'?'Alta':'Normal'}</span><strong>${esc(a.title)}</strong><p>${esc(a.detail)}</p></div><div class="nvAiControlActionsV832"><button data-alert-prepare-v835="${esc(a.id)}">Preparar acción</button><button data-alert-task-v832="${esc(a.id)}">Crear tarea</button><button data-alert-open-v832="${esc(a.actionTab||'inicio')}">Abrir módulo</button><button data-alert-snooze-v832="${esc(a.id)}">Posponer 3 días</button></div></article>`).join(''):'<div class="v7Empty small"><h3>Sin alertas activas</h3><p>No se detectaron condiciones prioritarias con los datos actuales.</p></div>';
      }else if(tab==='tasks'){
        const groupHtml=(title,rows)=>rows.length?`<section class="nvAiTaskGroupV835"><h3>${esc(title)} <b>${rows.length}</b></h3><div class="nvAiControlTaskListV832">${rows.map(controlTaskCardV835).join('')}</div></section>`:'';
        root.innerHTML=`<div class="nvAiTaskToolbarV834"><button class="btn block" id="nvAiNewTaskV832">+ Nueva tarea</button><button class="btn outline" id="nvAiSyncTasksV834">↻ Sincronizar</button></div>${groupHtml('Vencidas',groups.overdue)}${groupHtml('Para hoy',groups.today)}${groupHtml('Próximas',groups.upcoming)}${groupHtml('Sin fecha',groups.unscheduled)}${groupHtml('Completadas',groups.completed)}${tasks.length?'':'<p>Sin tareas registradas.</p>'}`;
      }else if(tab==='evaluation'){
        root.innerHTML=`<div class="nvAiEvaluationHeroV832"><span>Salud operativa</span><strong>${ev.score}/100</strong><b>${esc(ev.label)}</b><small>${esc(ev.note)}</small></div><div class="nvAiEvaluationGridV832">${ev.dimensions.map(x=>`<div><span>${esc(x.name)}</span><b>${x.score}</b><i><em style="width:${x.score}%"></em></i></div>`).join('')}</div>`;
      }else{
        root.innerHTML=`<div class="nvAiSummarySwitchV835"><button class="active" data-summary-kind-v835="daily">Diario</button><button data-summary-kind-v835="weekly">Semanal</button></div><article class="nvAiDailySummaryV832" id="nvAiDailyCardV835"><span>${new Date(summary.createdAt).toLocaleString('es-BO')}</span><h3>${esc(summary.title)}</h3><p>${esc(summary.body)}</p><ul>${summary.facts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><button class="btn outline block" id="nvAiRefreshSummaryV832">Regenerar resumen diario</button></article><article class="nvAiDailySummaryV832 hidden" id="nvAiWeeklyCardV835"><span>Semana desde ${esc(weekly.weekStart)}</span><h3>${esc(weekly.title)}</h3><p>${esc(weekly.body)}</p><div class="nvAiWeeklyMetricsV835"><div><small>Esta semana</small><b>${money(weekly.metrics.currentRevenue)}</b></div><div><small>Anterior</small><b>${money(weekly.metrics.previousRevenue)}</b></div><div><small>Variación</small><b>${weekly.metrics.delta>=0?'+':''}${weekly.metrics.delta}%</b></div></div><ul>${weekly.facts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><button class="btn outline block" id="nvAiRefreshWeeklyV835">Regenerar resumen semanal</button></article>`;
      }
      bind(proactive,overview);
    };
    const runProactive=(action)=>{if(!action)return;if(action.kind==='tasks'){tab='tasks';return render();}closeActionSheet();if(action.kind==='assistant'){window.navigateTo?.('asistente-ia');setTimeout(()=>ask(action.question),100);}else window.navigateTo?.(action.module||'inicio');};
    const bind=(proactive,overview)=>{
      document.querySelectorAll('[data-proactive-action-v835]').forEach(b=>b.onclick=()=>runProactive(proactive.find(x=>x.id===b.dataset.proactiveActionV835)));
      document.querySelectorAll('[data-alert-prepare-v835]').forEach(b=>b.onclick=()=>{const action=proactive.find(x=>x.id===b.dataset.alertPrepareV835);runProactive(action||{kind:'module',module:controlAlertsV832(true).find(x=>x.id===b.dataset.alertPrepareV835)?.actionTab});});
      document.querySelectorAll('[data-alert-task-v832]').forEach(b=>b.onclick=()=>{const a=controlAlertsV832(true).find(x=>x.id===b.dataset.alertTaskV832);if(a){upsertControlTaskV832({id:`alert-task:${a.id}`,title:a.title,detail:a.detail,priority:a.priority,responsible:'Administrador central',area:a.area,source:'alert'});window.showToast?.('Tarea creada y preparada para sincronizar.');tab='tasks';render();}});
      document.querySelectorAll('[data-alert-open-v832]').forEach(b=>b.onclick=()=>{closeActionSheet();window.navigateTo?.(b.dataset.alertOpenV832);});
      document.querySelectorAll('[data-alert-snooze-v832]').forEach(b=>b.onclick=()=>{snoozeAlertV832(b.dataset.alertSnoozeV832,3);render();});
      document.querySelectorAll('[data-task-toggle-v832]').forEach(b=>b.onclick=()=>{const rows=readControlTasksV832();const t=rows.find(x=>String(x.id)===String(b.dataset.taskToggleV832));if(t){t.status=t.status==='completed'?'pending':'completed';t.updatedAt=Date.now();t.syncStatus='pending';saveControlTasksV832(rows);render();}});
      document.getElementById('nvAiNewTaskV832')?.addEventListener('click',()=>openActionReview({type:'create_task',label:'Crear tarea',taskTitle:'',taskResponsible:'Administrador central',taskPriority:'normal',taskDueDate:new Date().toISOString().slice(0,10),summary:'Registrar una tarea interna para seguimiento.'}));
      document.getElementById('nvAiRefreshSummaryV832')?.addEventListener('click',()=>{const next=dailySummaryV832();try{localStorage.setItem(dailySummaryKeyV832(),JSON.stringify(next));}catch(_){}queueControlStateSyncV834(`daily-summary:${next.date}`,next);render();});
      document.getElementById('nvAiRefreshWeeklyV835')?.addEventListener('click',()=>{ensureWeeklySummaryV835(true);render();});
      document.querySelectorAll('[data-summary-kind-v835]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-summary-kind-v835]').forEach(x=>x.classList.toggle('active',x===b));document.getElementById('nvAiDailyCardV835')?.classList.toggle('hidden',b.dataset.summaryKindV835!=='daily');document.getElementById('nvAiWeeklyCardV835')?.classList.toggle('hidden',b.dataset.summaryKindV835!=='weekly');});
      document.getElementById('nvAiSyncControlV834')?.addEventListener('click',async()=>{await syncControlCenterV834({silent:false});render();});
      document.getElementById('nvAiSyncTasksV834')?.addEventListener('click',async()=>{await syncControlCenterV834({silent:false});render();});
    };
    document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiActionOverlay"><section class="nvAiSheet nvAiActionSheet nvAiControlSheetV832" role="dialog" aria-modal="true"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiActionClose" type="button">×</button><div class="nvAiActionSheetHead"><div class="nvAiAvatar">${botSvg()}</div><div><h2>Director Ejecutivo Proactivo</h2><p>Detecta, prioriza y prepara acciones. Nada se ejecuta sin tu aprobación.</p><small data-control-sync-v834 data-state="${esc(controlSyncStateV834.status)}">${controlSyncStateV834.status==='online'?'Sincronizado':controlSyncStateV834.status==='syncing'?'Sincronizando…':controlSyncStateV834.status==='setup'?'Falta activar nube':'Modo local'}</small></div></div><div class="nvAiControlTabsV832"><button data-control-tab-v832="overview">Hoy</button><button data-control-tab-v832="alerts">Alertas</button><button data-control-tab-v832="tasks">Agenda</button><button data-control-tab-v832="evaluation">Evaluación</button><button data-control-tab-v832="summary">Resúmenes</button></div><div id="nvAiControlBodyV832"></div></section></div>`);
    document.getElementById('nvAiActionClose').onclick=closeActionSheet;document.getElementById('nvAiActionOverlay').onclick=e=>{if(e.target.id==='nvAiActionOverlay')closeActionSheet();};document.querySelectorAll('[data-control-tab-v832]').forEach(b=>b.onclick=()=>{tab=b.dataset.controlTabV832;render();});render();syncControlCenterV834({silent:true}).then(render).catch(()=>{});
  }
  function waitForV832(test,callback,attempt=0){if(test())return callback();if(attempt>=12)return callback(new Error('La ventana tardó demasiado en abrir.'));setTimeout(()=>waitForV832(test,callback,attempt+1),80);}
  function openPromotionDraftV832(action){
    window.navigateTo?.('reglas-comerciales');
    waitForV832(()=>typeof window.openPromotionFormV807==='function',(loadError)=>{if(loadError)return window.showToast?.('El módulo de promociones no está disponible.','error');window.openPromotionFormV807();waitForV832(()=>!!document.getElementById('nv807PromoName'),(formError)=>{if(formError)return window.showToast?.('No se pudo preparar la promoción.','error');const product=(dataset().products||[]).find(p=>String(p.id)===String(action.productId||action.items?.[0]?.productId));const set=(id,value)=>{const el=document.getElementById(id);if(el){el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}};set('nv807PromoName',action.promotionName||`Promoción ${product?.name||'Natura Vida'}`);set('nv807PromoPercent',Number(action.promotionPercent||5));set('nv807PromoActive','0');set('nv807PromoScope','product');set('nv807PromoProduct',product?.id||'');set('nv807PromoStart',action.startsAt||new Date().toISOString().slice(0,10));const end=new Date();end.setDate(end.getDate()+Math.max(1,Number(action.durationDays||7)));set('nv807PromoEnd',action.endsAt||end.toISOString().slice(0,10));set('nv807PromoNote',action.note||'Promoción preparada por el Director Comercial IA. Está pausada para revisar margen y activarla manualmente.');window.showToast?.('Promoción preparada en estado pausado. Revisa y guarda.');});});
  }
  function openProductionDraftV832(action){
    window.navigateTo?.('produccion');
    waitForV832(()=>typeof window.openProductionOrderFormV740==='function',(loadError)=>{if(loadError)return window.showToast?.('El módulo de producción no está disponible.','error');window.openProductionOrderFormV740();waitForV832(()=>!!document.getElementById('orderProductV740'),(formError)=>{if(formError)return window.showToast?.('No se pudo preparar la orden de producción.','error');const set=(id,value)=>{const el=document.getElementById(id);if(el){el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}};set('orderProductV740',action.productId||action.items?.[0]?.productId||'');set('orderOutputV740',Number(action.productionQuantity||action.items?.[0]?.quantity||1));set('orderNoteV740',action.note||'Orden preparada por el Director Comercial IA. Revisar insumos antes de crear.');window.showToast?.('Orden de producción preparada. Revisa insumos y guarda.');});});
  }

  function clientCommercialRows(){
    const {clients,sales}=dataset();
    const rs=receivableStats();
    const balanceByClient=new Map();
    rs.open.forEach(x=>{
      const amount=Number(x.balance||0);
      const idKey=String(x.clientId||'');
      const nameKey=normalizedName(x.clientName||x.customerName||'');
      if(idKey) balanceByClient.set(idKey,(balanceByClient.get(idKey)||0)+amount);
      if(nameKey) balanceByClient.set(nameKey,(balanceByClient.get(nameKey)||0)+amount);
    });
    return clients.map(c=>{
      const own=sales.filter(x=>String(x.clientId||'')===String(c.id||''));
      const last=Math.max(0,...own.map(x=>dateMs(x.date||x.createdAt)));
      const revenue=own.reduce((a,x)=>a+(Number(x.total)||0),0);
      const idKey=String(c.id||''); const nameKey=normalizedName(c.name||c.businessName||'');
      const balance=Math.max(balanceByClient.get(idKey)||0,balanceByClient.get(nameKey)||0);
      return {name:clampText(c.name||c.businessName||'Cliente',90),sales:own.length,revenue:Number(revenue.toFixed(2)),daysSinceLast:last?daysSince(last):null,balance:Number(balance.toFixed(2)),region:clampText(c.regionName||c.region||c.city||'',50)};
    });
  }
  function businessSnapshot(question=''){
    const today=salesStats(1), week=salesStats(7), month=salesStats(30), ss=stockStats(), rs=receivableStats();
    const clients=clientCommercialRows();
    const productRows=month.byProduct.slice(0,12).map(x=>({name:clampText(x.name,90),units:Number(x.qty||0),revenue:Number(x.revenue.toFixed(2)),profit:Number((x.revenue-x.cost).toFixed(2)),margin:Number((x.revenue?((x.revenue-x.cost)/x.revenue*100):0).toFixed(1))}));
    const productMap=new Map((dataset().products||[]).map(p=>[normalizedName(p.name),p]));
    productRows.forEach(x=>{ const p=productMap.get(normalizedName(x.name))||{}; x.stock=Number(p.stock||0); x.price=productPriceV827(p); x.cost=productCostV827(p); });
    const topClients=clients.sort((a,b)=>(b.balance-a.balance)||(b.revenue-a.revenue)).slice(0,14);
    const receivables=rs.open.slice().sort((a,b)=>Number(b.balance||0)-Number(a.balance||0)).slice(0,14).map(x=>({client:clampText(x.clientName||x.customerName||'Cliente',90),balance:Number(Number(x.balance||0).toFixed(2)),paid:Number(Number(x.paid||0).toFixed(2)),daysOverdue:Math.max(0,daysSince(x.dueDate||x.originalDate||x.date)),historical:!!x.historical}));
    const settings=dataset().settings||{};
    return {
      generatedAt:new Date().toISOString(),
      context:{tab:assistantContext.tab,label:assistantContext.label,questionTopic:clampText(question,140)},
      privacy:{phonesExcluded:true,addressesExcluded:true,emailsExcluded:true,rawReceiptsExcluded:true},
      metrics:{
        today:{operations:today.rows.length,revenue:Number(today.revenue.toFixed(2)),profit:Number(today.profit.toFixed(2)),margin:Number(today.margin.toFixed(1))},
        sevenDays:{operations:week.rows.length,revenue:Number(week.revenue.toFixed(2)),profit:Number(week.profit.toFixed(2)),margin:Number(week.margin.toFixed(1))},
        thirtyDays:{operations:month.rows.length,revenue:Number(month.revenue.toFixed(2)),profit:Number(month.profit.toFixed(2)),margin:Number(month.margin.toFixed(1)),units:month.units},
        receivables:{operations:rs.open.length,total:Number(rs.total.toFixed(2)),overdue:rs.overdue.length,historical:rs.historical.length},
        inventory:{products:ss.total,critical:ss.critical.length,negative:ss.negative.length},
        customers:{total:(dataset().clients||[]).length,inactive30Days:clientStats().inactive.length,incomplete:clientStats().incomplete.length}
      },
      commercialRules:{minimumMargin:Number(settings.minMargin??settings.minimumMargin??25)||25,maximumDiscount:Number(settings.maxDiscount??settings.maximumDiscount??10)||10,currency:'BOB'},
      topProducts:productRows,
      catalogProducts:(dataset().products||[]).filter(p=>p.status!=='archived').slice(0,40).map(p=>({name:clampText(p.name||'Producto',100),presentation:clampText(p.presentation||p.packageType||'',50),stock:Number(p.stock||0),price:productPriceV827(p),cost:productCostV827(p)})),
      criticalStock:ss.critical.slice(0,12).map(p=>({name:clampText(p.name||'Producto',90),stock:Number(p.stock||0),price:productPriceV827(p),cost:productCostV827(p)})),
      customersForFollowUp:topClients,
      topReceivables:receivables,
      focusedAccount:(()=>{const a=focusedAccountContext();return a?{client:clampText(a.name||'Cliente',90),totalBought:Number(Number(a.totalBought||0).toFixed(2)),totalPaid:Number(Number(a.totalPaid||0).toFixed(2)),totalDebt:Number(Number(a.totalDebt||0).toFixed(2)),pendingOperations:Number(a.pendingCount||0),daysLate:Number(a.daysLate||0),oldestDebtDate:a.oldestDebtDate?new Date(Number(a.oldestDebtDate)).toISOString().slice(0,10):null,lastPaymentDate:a.lastPaymentDate?new Date(Number(a.lastPaymentDate)).toISOString().slice(0,10):null}:null;})(),
      alerts:controlAlertsV832().slice(0,10).map(x=>({level:x.priority,title:clampText(x.title,100),detail:clampText(x.detail,180)})),
      control:{evaluation:businessEvaluationV832(),dailySummary:dailySummaryV832(),weeklySummary:weeklySummaryV835(),proactiveActions:proactiveActionsV835().map(x=>({priority:x.priority,title:x.title,detail:x.detail})),pendingTasks:readControlTasksV832().filter(x=>['pending','in_progress'].includes(x.status)).slice(0,20),production:productCommercialHealthV832().filter(x=>x.suggested>0).slice(0,12).map(x=>({product:x.product.name,stock:x.stock,coverageDays:Number(x.coverage===999?999:x.coverage.toFixed(1)),suggestedProduction:x.suggested,openPlanned:x.openPlanned}))}
    };
  }
  function conversationForEngine(){
    return readConversation().slice(-8).map(x=>x.role==='user'?{role:'user',text:clampText(x.text,600)}:{role:'assistant',text:clampText(`${x.response?.title||''}. ${String(x.response?.body||'').replace(/<[^>]*>/g,' ')}`,700)});
  }
  function normalizeEngineResponse(data){
    const a=data?.answer||{};const draftRaw=a.draft_action&&typeof a.draft_action==='object'?a.draft_action:null;const draftType=String(draftRaw?.type||a.intent||'analysis');const operational=['prepare_sale','create_quote','create_payment_plan','register_payment','generate_receipt','seller_settlement','prepare_promotion','prepare_production','create_task'].includes(draftType);
    const facts=(Array.isArray(a.facts)?a.facts:[]).slice(0,operational?3:6).map(x=>clampText(x,220)).filter(Boolean);
    const rec=(Array.isArray(a.recommendations)?a.recommendations:[]).slice(0,operational?2:5).map(x=>clampText(x,240)).filter(Boolean);
    const risks=(Array.isArray(a.risks)?a.risks:[]).slice(0,operational?2:4).map(x=>clampText(x,220)).filter(Boolean);
    const next=(Array.isArray(a.next_questions)?a.next_questions:[]).slice(0,operational?2:4).map(x=>clampText(x,150)).filter(Boolean);
    const tabMap={ventas:'historial',clientes:'clientes',inventario:'inventario',cobranzas:'por-cobrar','reglas-comerciales':'reglas-comerciales',territorio:'territorio',finanzas:'egresos',rendicion:'rendicion-caja'};
    const area=String(a.action_area||'none');const action=tabMap[area]?{label:`Abrir ${area.replace('-',' ')}`,tab:tabMap[area]}:null;
    const missingFields=(Array.isArray(a.missing_fields)?a.missing_fields:[]).map(friendlyMissingFieldV829).filter(Boolean).filter(field=>!(['prepare_sale','create_quote'].includes(draftType)&&isNonBlockingSaleFieldV829(field)));
    const bodyParts=[safeHtml(a.summary||'Análisis completado con los datos disponibles.')];if(missingFields.length)bodyParts.push(`<span class="nvAiMissingV825">Para continuar necesito: ${esc(missingFields.join(', '))}.</span>`);
    return {title:clampText(a.title||'Análisis inteligente',100),body:bodyParts.join('<br>'),list:[...facts.map(x=>`Dato: ${x}`),...rec.map(x=>`Sugerencia: ${x}`),...risks.map(x=>`Riesgo: ${x}`)],suggestions:next,action,intent:clampText(a.intent||'analysis',60),missingFields,draftAction:draftRaw?{type:clampText(draftRaw.type||'none',60),client_query:clampText(draftRaw.client_query||'',100),amount:Number(draftRaw.amount)||0,installment_amount:Number(draftRaw.installment_amount)||0,frequency:clampText(draftRaw.frequency||'',30),start_date:clampText(draftRaw.start_date||'',20),note:clampText(draftRaw.note||'',240),payment_method:clampText(draftRaw.payment_method||'',20),sale_type:clampText(draftRaw.sale_type||'',30),discount_percent:Number(draftRaw.discount_percent)||0,quantity:Number(draftRaw.quantity)||0,priority:clampText(draftRaw.priority||'',20),due_date:clampText(draftRaw.due_date||'',20),task_title:clampText(draftRaw.task_title||'',140),responsible:clampText(draftRaw.responsible||'',120),items:Array.isArray(draftRaw.items)?draftRaw.items.slice(0,8).map(it=>({product_query:clampText(it?.product_query||'',120),quantity:Math.max(1,Math.min(999,Number(it?.quantity)||1)),discount_amount:Number(it?.discount_amount)||0,discount_percent:Number(it?.discount_percent)||0,final_unit_price:Number(it?.final_unit_price)||0})):[]}:null,confidence:['alta','media','baja'].includes(String(a.confidence))?String(a.confidence):'media',engine:'external',model:clampText(data?.model||engineState.model,60),usage:data?.usage||null,privacy:data?.privacy||{snapshotOnly:true},operationalIntent:operational};
  }
  function shapeOperationalResponseV829(question,response){
    const draft=resolveDraftActionV829(question,response);if(!['prepare_sale','create_quote'].includes(draft.type))return response;
    const base={...response,draftAction:draft,missingFields:draft.missingFields};
    if(draft.missingFields.length)return {...base,title:draft.type==='create_quote'?'Completemos la cotización':'Completemos la venta',body:`Puedo preparar el trabajo, pero necesito: <b>${esc(draft.missingFields.join(' y '))}</b>.`,list:[],suggestions:[],operationalReady:false};
    const units=draft.items.reduce((n,x)=>n+Number(x.quantity||0),0);const total=draft.items.reduce((n,x)=>n+Number(x.quantity||0)*Number((x.manualPrice ?? x.unitPrice) || 0),0);const stockOk=draft.items.every(x=>Number(x.stock||0)>=Number(x.quantity||0));const clientText=draft.clientName?` para <b>${esc(draft.clientName)}</b>`:'';
    return {...base,title:draft.type==='create_quote'?'Cotización lista para revisar':'Venta y recibo listos para revisar',body:`Preparé ${units} unidad(es)${clientText}. ${total>0?`Total estimado: <b>${money(total)}</b>.`:''} La forma de pago se elegirá al confirmar y el recibo se generará después de guardar la venta.`,cards:[['Cliente',draft.clientName||'Por definir'],['Unidades',units],['Total estimado',total>0?money(total):'Revisar precio'],['Stock',stockOk?'Disponible':'Revisar']],list:draft.items.map(x=>`${x.quantity} × ${x.productName} · ${money(x.manualPrice??x.unitPrice)}${Number(x.manualPrice)>0&&Number(x.manualPrice)!==Number(x.unitPrice)?` (antes ${money(x.unitPrice)})`:''} · stock ${x.stock}`),suggestions:[],operationalReady:true};
  }
  async function invokeErrorMessageV824(error){
    let message=clampText(error?.message||'El motor IA no pudo responder.',180);
    let status='';
    try{
      const response=error?.context;
      if(response){
        status=String(response.status||'');
        const clone=typeof response.clone==='function'?response.clone():response;
        let data=null;
        try{ data=await clone.json(); }catch(_){ try{ data={message:await clone.text()}; }catch(__){} }
        const detail=data?.message||data?.error?.message||data?.error||data?.details;
        if(detail) message=clampText(detail,220);
      }
    }catch(_){ }
    return `${status?`Error ${status}: `:''}${message}`;
  }

  async function checkEngine(force=false){
    if(!adminAllowed()) return engineState;
    if(!force && engineState.checkedAt && Date.now()-engineState.checkedAt<ENGINE_HEALTH_TTL) return engineState;
    if(!navigator.onLine){ engineState={...engineState,mode:'local',configured:false,checkedAt:Date.now(),message:'Sin internet: análisis local'}; updateEngineUI(); return engineState; }
    const sb=getSupabaseForAI();
    if(!sb?.functions?.invoke){ engineState={...engineState,mode:'local',configured:false,checkedAt:Date.now(),message:'Edge Functions no disponible'}; updateEngineUI(); return engineState; }
    engineState={...engineState,mode:'checking',message:'Comprobando motor IA'}; updateEngineUI();
    try{
      const result=await withTimeout(sb.functions.invoke(AI_FUNCTION_NAME,{body:{action:'health'}}),12000);
      if(result?.error) throw new Error(result.error.message||'No se pudo comprobar el motor IA.');
      const data=result?.data||{};
      engineState={mode:(data.configured&&data.migrationReady)?'external':'local',configured:!!data.configured,migrationReady:!!data.migrationReady,model:data.model||engineState.model,checkedAt:Date.now(),usage:data.usage||null,message:data.message||((data.configured&&data.migrationReady)?'Motor IA disponible':'Configuración pendiente')};
    }catch(error){ engineState={...engineState,mode:'local',configured:false,checkedAt:Date.now(),message:clampText(error.message||'Motor no disponible',120)}; }
    updateEngineUI();
    return engineState;
  }
  async function answerWithEngine(question){
    const health=await checkEngine(false);
    if(health.mode!=='external') throw new Error(health.message||'Motor externo no disponible.');
    const sb=getSupabaseForAI();
    const result=await withTimeout(sb.functions.invoke(AI_FUNCTION_NAME,{body:{action:'chat',question:clampText(question,1200),context:assistantContext,snapshot:businessSnapshot(question),history:conversationForEngine()}}));
    if(result?.error) throw new Error(await invokeErrorMessageV824(result.error));
    if(!result?.data?.ok) throw new Error(clampText(result?.data?.message||result?.data?.error?.message||'Respuesta IA inválida.',220));
    engineState={...engineState,mode:'external',configured:true,migrationReady:true,model:result.data.model||engineState.model,usage:result.data.usage||engineState.usage,checkedAt:Date.now(),message:'Motor IA conectado'};
    updateEngineUI();
    return shapeOperationalResponseV829(question,normalizeEngineResponse(result.data));
  }
  function updateEngineUI(){
    const badge=document.getElementById('nvAiEngineBadge');
    if(badge){ badge.className=`nvAiEngineBadge ${engineClass()}`; badge.innerHTML=`<i></i><span>${esc(engineLabel())}</span>`; badge.title=engineState.message||engineLabel(); }
    const usage=document.getElementById('nvAiUsage');
    if(usage){ const u=engineState.usage; usage.textContent=u&&Number.isFinite(Number(u.used))?`${u.used}/${u.limit} consultas hoy`:(engineState.mode==='external'?'Motor disponible':'Modo local seguro'); }
    document.querySelectorAll?.('.nvAiEngineMini').forEach(el=>{ el.className=`nvAiEngineMini ${engineClass()}`; el.textContent=engineLabel(); });
  }

  function discountSimulation(product,percent=5,qty=1){
    if(!product) return null; const price=productPriceV827(product); const cost=productCostV827(product); const pct=Math.max(0,Math.min(100,Number(percent)||0)); const final=price*(1-pct/100); const profit=(final-cost)*qty; const margin=final?((final-cost)/final*100):0; const settings=dataset().settings||{}; const minMargin=Number(settings.minMargin??settings.minimumMargin??25)||25; return {price,cost,pct,final,profit,margin,minMargin,allowed:margin>=minMargin};
  }

  function readActionHistory(){
    try{const rows=JSON.parse(localStorage.getItem(actionHistoryKey())||'[]');return (Array.isArray(rows)?rows:[]).slice(-MAX_ACTION_HISTORY);}catch(_){return [];}
  }
  function saveActionHistory(rows){try{localStorage.setItem(actionHistoryKey(),JSON.stringify((rows||[]).slice(-MAX_ACTION_HISTORY)));}catch(_){}}
  function recordAction(action,status='confirmed',detail=''){
    const rows=readActionHistory();action.workId=action.workId||uid();const next={id:action.workId,type:action.type,label:action.label||action.type,status,detail:clampText(detail,240),clientId:action.clientId||'',clientName:action.clientName||'',at:Date.now()};const index=rows.findIndex(x=>String(x.id)===String(action.workId));if(index>=0)rows[index]={...rows[index],...next};else rows.push(next);saveActionHistory(rows);updateActionCount();return next;
  }
  function updateActionCount(){const el=document.getElementById('nvAiActionCount');if(el)el.textContent=String(readActionHistory().filter(x=>x.status==='pending').length);}
  function normalizedPhoneForWa(phone){let digits=String(phone||'').replace(/\D/g,'');if(!digits)return'';if(digits.startsWith('00'))digits=digits.slice(2);if(digits.length===8)digits='591'+digits;if(digits.startsWith('0')&&digits.length===9)digits='591'+digits.slice(1);return digits;}
  function clientMessage(kind,client,account){
    const name=client?.name||client?.businessName||account?.name||'cliente';
    if(kind==='collection') return `Buenas tardes, ${name}. Le escribimos de Natura Vida Bolivia para compartirle el estado actualizado de su cuenta. El saldo pendiente registrado es ${money(account?.totalDebt||0)}. Podemos coordinar el pago o revisar el detalle de sus operaciones. Gracias por su atención.`;
    return `Buenas tardes, ${name}. Esperamos que se encuentre muy bien. Queríamos consultar si necesita reponer sus productos Natura Vida. Podemos prepararle una cotización y coordinar la entrega.`;
  }
  function buildActionProposals(question,response={}){
    const q=normalizedName(question);const account=focusedAccountContext();const client=focusedClientRecord()||resolveClientFromText(question);const actions=[];
    const add=a=>{if(a&&!actions.some(x=>x.type===a.type&&String(x.clientId||'')===String(a.clientId||'')))actions.push(a);};
    const draft=resolveDraftActionV825(question,response);
    if(draft.type!=='none'&&!draft.missingFields.length){
      if(draft.type==='create_payment_plan')add({type:'create_payment_plan',label:'Preparar plan de pagos',clientId:draft.clientId,clientName:draft.clientName,installmentAmount:draft.installmentAmount,frequency:draft.frequency,startDate:draft.startDate,note:draft.note,totalDebt:Number(draft.account?.totalDebt||0),summary:`Crear un borrador ${frequencyLabel(draft.frequency).toLowerCase()} de ${money(draft.installmentAmount)} para revisión.`});
      if(draft.type==='register_payment')add({type:'register_payment',label:'Preparar registro de pago',clientId:draft.clientId,clientName:draft.clientName,amount:draft.amount,note:draft.note,summary:`Abrir el formulario con ${money(draft.amount)}; el pago no se guarda hasta confirmar.`});
      if(draft.type==='generate_receipt')add({type:'generate_receipt',label:'Preparar pago y recibo',clientId:draft.clientId,clientName:draft.clientName,amount:draft.amount,note:draft.note,summary:`Registrar ${money(draft.amount)} después de revisar y generar el recibo correspondiente.`});
      if(draft.type==='seller_settlement')add({type:'seller_settlement',label:'Abrir rendición de caja',summary:'Revisar efectivo bajo custodia, cobros digitales y saldo a entregar.'});
      if(draft.type==='prepare_sale')add({type:'prepare_sale',label:'Preparar venta y recibo',clientId:draft.clientId,clientName:draft.clientName,clientCandidates:draft.clientCandidates,items:draft.items,paymentMethod:draft.paymentMethod,saleType:draft.saleType,note:draft.note,summary:`Cargar ${draft.items.reduce((n,x)=>n+Number(x.quantity||0),0)} unidad(es) en Ventas para revisión.`});
      if(draft.type==='prepare_promotion'){const item=draft.items?.[0];add({type:'prepare_promotion',label:'Preparar promoción',productId:item?.productId||'',productName:item?.productName||'',items:draft.items,promotionPercent:draft.promotionPercent||5,durationDays:7,note:draft.note,summary:`Abrir una promoción de ${Number(draft.promotionPercent||5)}% para revisión y activación manual.`});}
      if(draft.type==='prepare_production'){const item=draft.items?.[0];const health=productCommercialHealthV832().find(x=>String(x.product.id)===String(item?.productId));add({type:'prepare_production',label:'Preparar orden de producción',productId:item?.productId||'',productName:item?.productName||'',items:draft.items,productionQuantity:Number(draft.productionQuantity||health?.suggested||item?.quantity||1),note:draft.note,summary:`Abrir una orden de producción prellenada para revisión de insumos.`});}
      if(draft.type==='create_task')add({type:'create_task',label:'Crear tarea de control',taskTitle:draft.taskTitle||'Tarea del Director',taskResponsible:draft.taskResponsible||'Administrador central',taskPriority:draft.taskPriority||'normal',taskDueDate:draft.taskDueDate,note:draft.note,summary:'Registrar una tarea interna para seguimiento.'});
      if(draft.type==='create_quote')add({type:'create_quote',label:'Preparar cotización',clientId:draft.clientId,clientName:draft.clientName,clientCandidates:draft.clientCandidates,items:draft.items,note:draft.note,summary:`Preparar una cotización con ${draft.items.length} producto(s) para revisión.`});
      if(actions.length)return actions.slice(0,1);
    }
    const activeClient=client||((account?.clientId)?(dataset().clients||[]).find(c=>String(c.id)===String(account.clientId)):null);
    const activeName=clientDisplayName(activeClient)||account?.name;
    const activeId=activeClient?.id||account?.clientId;
    if(activeId){
      const debt=account||clientDebtInfo(activeClient);
      if(Number(debt.totalDebt||0)>.009||/deuda|cobran|pago|estado de cuenta/.test(q)){
        add({type:'prepare_collection_message',label:'Preparar mensaje de cobro',clientId:activeId,clientName:activeName,summary:`Revisar un mensaje por ${money(debt.totalDebt||0)}.`});
        add({type:'generate_collection_document',label:'Generar recibo consolidado',clientId:activeId,clientName:activeName,summary:'Genera el documento de cobro después de tu confirmación.'});
      }
      add({type:'create_quote',label:'Preparar cotización',clientId:activeId,clientName:activeName,summary:'Abre una cotización prellenada para revisión.'});
    }
    if(response.action?.tab)add({type:'open_tab',label:response.action.label||'Abrir módulo',tab:response.action.tab,summary:'Solo cambia de pantalla; no modifica datos.'});
    if(/inventario|stock/.test(q))add({type:'open_tab',label:'Abrir inventario',tab:'inventario',summary:'Revisar existencias y movimientos.'});
    if(/cliente|seguimiento|inactiv/.test(q)&&!activeClient)add({type:'open_tab',label:'Abrir clientes',tab:'clientes',summary:'Revisar la cartera comercial.'});
    if(/deuda|cobran|vencid/.test(q)&&!account)add({type:'open_tab',label:'Abrir cuentas por cobrar',tab:'por-cobrar',summary:'Revisar saldos y estados de cuenta.'});
    if(/descuento|margen|promoci/.test(q))add({type:'open_tab',label:'Abrir reglas comerciales',tab:'reglas-comerciales',summary:'Simular y revisar márgenes antes de autorizar.'});
    return actions.slice(0,5);
  }
  function enrichResponse(response,question){const r=response||{};const draft=resolveDraftActionV829(question,r);r.proposals=buildActionProposals(question,r);if(r.proposals.length&&draft.type!=='none'&&!draft.missingFields.length)r.operationalReady=true;return r;}
  async function auditAssistantAction(action,status){
    try{if(window.writeAudit)await writeAudit('ai_action_'+status,'assistant',action.clientId||action.tab||action.type,null,{type:action.type,label:action.label,clientId:action.clientId||null,clientName:action.clientName||null});}catch(_){ }
  }
  function closeActionSheet(){document.getElementById('nvAiActionOverlay')?.remove();}
  function showActionHistory(){
    closeActionSheet();const rows=readActionHistory().slice().reverse();const labels={pending:'Pendiente',confirmed:'Aprobado',rejected:'Rechazado'};
    document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiActionOverlay"><section class="nvAiSheet nvAiActionSheet" role="dialog" aria-modal="true"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiActionClose" type="button">×</button><div class="nvAiActionSheetHead"><div class="nvAiAvatar">${botSvg()}</div><div><h2>Trabajos del asistente</h2><p>Borradores pendientes, aprobados y rechazados.</p></div></div><div class="nvAiWorkSummaryV827"><span><b>${rows.filter(x=>x.status==='pending').length}</b> pendientes</span><span><b>${rows.filter(x=>x.status==='confirmed').length}</b> aprobados</span><span><b>${rows.filter(x=>x.status==='rejected').length}</b> rechazados</span></div><div class="nvAiActionHistory nvAiWorkListV827">${rows.length?rows.map(x=>`<article class="${esc(x.status||'pending')}"><div><strong>${esc(x.label||x.type)}</strong><small>${esc(x.clientName||x.detail||'Trabajo del asistente')}</small><time>${new Date(Number(x.at)||Date.now()).toLocaleString('es-BO')}</time></div><span>${esc(labels[x.status]||x.status)}</span></article>`).join(''):'<p>Sin trabajos preparados todavía.</p>'}</div></section></div>`);
    document.getElementById('nvAiActionClose').onclick=closeActionSheet;document.getElementById('nvAiActionOverlay').onclick=e=>{if(e.target.id==='nvAiActionOverlay')closeActionSheet();};
  }
  function openMessageReview(action){
    const client=(window.AppState?.clients||[]).find(c=>String(c.id)===String(action.clientId))||{};const account=focusedAccountContext();const kind=action.type==='prepare_collection_message'?'collection':'followup';const message=clientMessage(kind,client,account);
    closeActionSheet();document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiActionOverlay"><section class="nvAiSheet nvAiActionSheet" role="dialog" aria-modal="true"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiActionClose" type="button">×</button><div class="nvAiActionSheetHead"><div class="nvAiAvatar">${botSvg()}</div><div><h2>${esc(action.label)}</h2><p>Revisa el texto. El asistente no lo envía automáticamente.</p></div></div><label class="nvAiMessageDraft"><span>Mensaje</span><textarea id="nvAiDraftText" rows="7">${esc(message)}</textarea></label><div class="nvAiActionButtons"><button class="btn outline" id="nvAiCopyDraft" type="button">Copiar</button><button class="btn" id="nvAiOpenWhatsapp" type="button">Abrir WhatsApp</button></div></section></div>`);
    const close=closeActionSheet;document.getElementById('nvAiActionClose').onclick=close;document.getElementById('nvAiActionOverlay').onclick=e=>{if(e.target.id==='nvAiActionOverlay')close();};
    document.getElementById('nvAiCopyDraft').onclick=async()=>{const text=document.getElementById('nvAiDraftText').value;try{await navigator.clipboard.writeText(text);window.showToast?.('Mensaje copiado.');}catch(_){document.getElementById('nvAiDraftText').select();window.showToast?.('Selecciona y copia el mensaje.');}recordAction(action,'confirmed','Mensaje preparado y copiado');await auditAssistantAction(action,'confirmed');};
    document.getElementById('nvAiOpenWhatsapp').onclick=async()=>{const text=document.getElementById('nvAiDraftText').value;const phone=normalizedPhoneForWa(client.phone||client.whatsapp||account?.phone||'');if(!phone){window.showToast?.('Este cliente no tiene un número de WhatsApp registrado.','error');document.getElementById('nvAiDraftText')?.focus();return;}recordAction(action,'confirmed','Mensaje preparado para WhatsApp');await auditAssistantAction(action,'confirmed');window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank','noopener');};
  }
  function actionDetailHtmlV825(action){
    const rows=[];
    if(action.clientName)rows.push(['Cliente',action.clientName]);
    if(Number(action.totalDebt||0)>0)rows.push(['Deuda actual',money(action.totalDebt)]);
    if(Number(action.amount||0)>0)rows.push(['Monto',money(action.amount)]);
    if(Number(action.installmentAmount||0)>0)rows.push(['Cuota propuesta',money(action.installmentAmount)]);
    if(action.frequency)rows.push(['Frecuencia',frequencyLabel(action.frequency)]);
    if(action.startDate)rows.push(['Inicio',new Date(`${action.startDate}T12:00:00`).toLocaleDateString('es-BO')]);
    if(Array.isArray(action.items)&&action.items.length){rows.push(['Productos',action.items.map(x=>`${Number(x.quantity||1)} × ${x.productName||'Producto'}`).join(' · ')]);const total=action.items.reduce((sum,x)=>sum+Number(x.quantity||0)*Number((x.manualPrice ?? x.unitPrice) || 0),0);if(total>0)rows.push(['Total estimado',money(total)]);}
    if(['prepare_sale','create_quote'].includes(action.type))rows.push(['Tipo de venta',saleTypeLabelV829(action.saleType)]);
    if(action.type==='prepare_promotion'){rows.push(['Producto',action.productName||action.items?.[0]?.productName||'Por definir']);rows.push(['Descuento',`${Number(action.promotionPercent||0)}%`]);rows.push(['Duración',`${Number(action.durationDays||7)} días`]);}
    if(action.type==='prepare_production'){rows.push(['Producto',action.productName||action.items?.[0]?.productName||'Por definir']);rows.push(['Cantidad sugerida',`${Number(action.productionQuantity||0)} unidades`]);}
    if(action.type==='create_task'){rows.push(['Tarea',action.taskTitle||'Por definir']);rows.push(['Responsable',action.taskResponsible||'Administrador central']);rows.push(['Prioridad',action.taskPriority||'normal']);rows.push(['Fecha límite',action.taskDueDate||'Sin fecha']);}
    if(action.type==='prepare_sale')rows.push(['Forma de pago',action.paymentMethod?(({cash:'Efectivo',qr:'QR / transferencia',credit:'A crédito'})[action.paymentMethod]||action.paymentMethod):'Elegir al confirmar']);
    return rows.length?`<div class="nvAiActionFactsV825">${rows.map(x=>`<span><small>${esc(x[0])}</small><b>${esc(x[1])}</b></span>`).join('')}</div>`:'';
  }
  function editableActionFieldsV826(action){
    const moneyTypes=['register_payment','generate_receipt'];const plan=action.type==='create_payment_plan';const sale=['prepare_sale','create_quote'].includes(action.type);const promotion=action.type==='prepare_promotion';const production=action.type==='prepare_production';const task=action.type==='create_task';
    if(!plan&&!moneyTypes.includes(action.type)&&!sale&&!promotion&&!production&&!task)return '';
    return `<div class="nvAiActionEditorV826 hidden" id="nvAiActionEditorV826">
      ${sale?`${(action.clientCandidates||[]).length?`<div class="field"><label>Cliente encontrado</label><select id="nvAiEditClientV8211"><option value="">Seleccionar cliente…</option>${(action.clientCandidates||[]).map(c=>`<option value="${esc(c.id)}" ${String(c.id)===String(action.clientId)?'selected':''}>${esc(c.name)}</option>`).join('')}</select><small>El asistente no sustituirá el nombre escrito por otro cliente sin tu selección.</small></div>`:''}<div class="nvAiSaleItemsV829">${(action.items||[]).map((item,index)=>`<div class="nvAiSaleItemEditorV829 nvAiSaleItemEditorV8211" data-ai-edit-item="${index}"><label>Producto ${index+1}</label><select id="nvAiEditProductV829_${index}">${productOptionsV829(item.productId,item.productName)}</select><label>Cantidad</label><input id="nvAiEditQtyV829_${index}" type="number" inputmode="numeric" min="1" step="1" value="${Number(item.quantity||1)}"><label>Precio unitario</label><input id="nvAiEditPriceV8211_${index}" type="number" inputmode="decimal" min="0.01" step="0.01" value="${Number((item.manualPrice ?? item.unitPrice) || 0)}"><small>${Number(item.manualPrice)>0&&Number(item.manualPrice)!==Number(item.unitPrice)?`Ajuste aplicado: ${money(Number(item.unitPrice)-Number(item.manualPrice))} de rebaja.`:'Precio del catálogo o grupo comercial.'}</small></div>`).join('')}</div>${action.type==='prepare_sale'?`<div class="field-row"><div class="field"><label>Tipo de venta</label><select id="nvAiEditSaleTypeV829"><option value="unit" ${action.saleType==='unit'?'selected':''}>Unitaria</option><option value="market" ${action.saleType==='market'?'selected':''}>Mayorista</option><option value="representative_transfer" ${action.saleType==='representative_transfer'?'selected':''}>Representantes</option><option value="reseller_unit" ${action.saleType==='reseller_unit'?'selected':''}>Reventa unitaria</option><option value="reseller_wholesale" ${action.saleType==='reseller_wholesale'?'selected':''}>Reventa mayorista</option></select></div><div class="field"><label>Forma de pago</label><select id="nvAiEditPaymentV829"><option value="" ${!action.paymentMethod?'selected':''}>Elegir al confirmar</option><option value="cash" ${action.paymentMethod==='cash'?'selected':''}>Efectivo</option><option value="qr" ${action.paymentMethod==='qr'?'selected':''}>QR / transferencia</option><option value="credit" ${action.paymentMethod==='credit'?'selected':''}>A crédito</option></select></div></div>`:''}`:''}
      ${promotion?`<div class="field"><label>Producto</label><select id="nvAiPromoProductV832">${productOptionsV829(action.productId||action.items?.[0]?.productId,action.productName)}</select></div><div class="field-row"><div class="field"><label>Descuento %</label><input id="nvAiPromoPercentV832" type="number" min="0.1" max="100" step="0.1" value="${Number(action.promotionPercent||5)}"></div><div class="field"><label>Duración (días)</label><input id="nvAiPromoDaysV832" type="number" min="1" max="120" value="${Number(action.durationDays||7)}"></div></div>`:''}${production?`<div class="field"><label>Producto a producir</label><select id="nvAiProductionProductV832">${productOptionsV829(action.productId||action.items?.[0]?.productId,action.productName)}</select></div><div class="field"><label>Cantidad planificada</label><input id="nvAiProductionQtyV832" type="number" min="1" step="1" value="${Number(action.productionQuantity||1)}"></div>`:''}${task?`<div class="field"><label>Tarea</label><input id="nvAiTaskTitleV832" value="${esc(action.taskTitle||'')}"></div><div class="field"><label>Responsable</label><input id="nvAiTaskResponsibleV835" value="${esc(action.taskResponsible||'Administrador central')}" placeholder="Persona responsable"></div><div class="field-row"><div class="field"><label>Prioridad</label><select id="nvAiTaskPriorityV832"><option value="urgent" ${action.taskPriority==='urgent'?'selected':''}>Urgente</option><option value="high" ${action.taskPriority==='high'?'selected':''}>Alta</option><option value="normal" ${!action.taskPriority||action.taskPriority==='normal'?'selected':''}>Normal</option><option value="low" ${action.taskPriority==='low'?'selected':''}>Baja</option></select></div><div class="field"><label>Fecha límite</label><input id="nvAiTaskDueV832" type="date" value="${esc(action.taskDueDate||new Date().toISOString().slice(0,10))}"></div></div>`:''}
      ${moneyTypes.includes(action.type)?`<div class="field"><label>Monto</label><input id="nvAiEditAmountV826" type="number" inputmode="decimal" min="0.01" step="0.01" value="${Number(action.amount||0)||''}"></div>`:''}
      ${plan?`<div class="field-row"><div class="field"><label>Cuota</label><input id="nvAiEditInstallmentV826" type="number" inputmode="decimal" min="0.01" step="0.01" value="${Number(action.installmentAmount||0)||''}"></div><div class="field"><label>Frecuencia</label><select id="nvAiEditFrequencyV826"><option value="monthly" ${action.frequency==='monthly'?'selected':''}>Mensual</option><option value="biweekly" ${action.frequency==='biweekly'?'selected':''}>Quincenal</option><option value="weekly" ${action.frequency==='weekly'?'selected':''}>Semanal</option></select></div></div><div class="field"><label>Primera fecha</label><input id="nvAiEditStartV826" type="date" value="${esc(action.startDate||new Date().toISOString().slice(0,10))}"></div>`:''}
      <div class="field"><label>Nota para el formulario</label><textarea id="nvAiEditNoteV826" rows="2">${esc(action.note||'')}</textarea></div><small>Los cambios se aplican únicamente al borrador. El formulario final todavía requerirá confirmación.</small>
    </div>`;
  }
  function applyEditedActionV826(action){
    const amount=document.getElementById('nvAiEditAmountV826');
    const installment=document.getElementById('nvAiEditInstallmentV826');
    const frequency=document.getElementById('nvAiEditFrequencyV826');
    const start=document.getElementById('nvAiEditStartV826');
    const note=document.getElementById('nvAiEditNoteV826');
    if(amount){const value=Number(amount.value||0);if(!(value>0))throw new Error('Ingresa un monto válido.');action.amount=value;}
    if(installment){const value=Number(installment.value||0);if(!(value>0))throw new Error('Ingresa una cuota válida.');action.installmentAmount=value;}
    if(frequency)action.frequency=frequency.value;
    if(start)action.startDate=start.value;
    if(note)action.note=note.value.trim();
    if(action.type==='prepare_promotion'){const product=(dataset().products||[]).find(p=>String(p.id)===String(document.getElementById('nvAiPromoProductV832')?.value||action.productId));const pct=Number(document.getElementById('nvAiPromoPercentV832')?.value||0);const days=Number(document.getElementById('nvAiPromoDaysV832')?.value||0);if(!product)throw new Error('Selecciona un producto.');if(!(pct>0))throw new Error('Ingresa un descuento válido.');if(!(days>0))throw new Error('Ingresa una duración válida.');action.productId=product.id;action.productName=product.name;action.items=[{productId:product.id,productName:product.name,quantity:1,stock:Number(product.stock||0),unitPrice:productPriceV827(product),unitCost:productCostV827(product)}];action.promotionPercent=pct;action.durationDays=Math.floor(days);}
    if(action.type==='prepare_production'){const product=(dataset().products||[]).find(p=>String(p.id)===String(document.getElementById('nvAiProductionProductV832')?.value||action.productId));const qty=Number(document.getElementById('nvAiProductionQtyV832')?.value||0);if(!product)throw new Error('Selecciona un producto.');if(!(qty>0))throw new Error('Ingresa una cantidad válida.');action.productId=product.id;action.productName=product.name;action.productionQuantity=Math.floor(qty);action.items=[{productId:product.id,productName:product.name,quantity:Math.floor(qty),stock:Number(product.stock||0),unitPrice:productPriceV827(product),unitCost:productCostV827(product)}];}
    if(action.type==='create_task'){const title=String(document.getElementById('nvAiTaskTitleV832')?.value||action.taskTitle||'').trim();if(!title)throw new Error('Escribe la tarea.');action.taskTitle=title;action.taskResponsible=String(document.getElementById('nvAiTaskResponsibleV835')?.value||action.taskResponsible||'Administrador central').trim();action.taskPriority=document.getElementById('nvAiTaskPriorityV832')?.value||'normal';action.taskDueDate=document.getElementById('nvAiTaskDueV832')?.value||new Date().toISOString().slice(0,10);}
    if(['prepare_sale','create_quote'].includes(action.type)){
      const clientSelect=document.getElementById('nvAiEditClientV8211');if(clientSelect){const selected=(dataset().clients||[]).find(c=>String(c.id)===String(clientSelect.value));if(!selected)throw new Error('Selecciona el cliente correcto.');action.clientId=selected.id;action.clientName=clientDisplayName(selected);}
      action.items=(action.items||[]).map((item,index)=>{const productId=document.getElementById(`nvAiEditProductV829_${index}`)?.value||item.productId;const product=(dataset().products||[]).find(p=>String(p.id)===String(productId));const qty=Number(document.getElementById(`nvAiEditQtyV829_${index}`)?.value||item.quantity||0);const price=Number(document.getElementById(`nvAiEditPriceV8211_${index}`)?.value||item.manualPrice||item.unitPrice||0);if(!product)throw new Error(`Selecciona un producto válido en la fila ${index+1}.`);if(!(qty>0))throw new Error(`Ingresa una cantidad válida en la fila ${index+1}.`);if(!(price>0))throw new Error(`Ingresa un precio válido en la fila ${index+1}.`);const base=productPriceV827(product);return {productId:product.id,productName:product.name,quantity:Math.floor(qty),stock:Number(product.stock||0),unitPrice:base,unitCost:productCostV827(product),manualPrice:round2(price),adjustmentMode:price!==base?'final':'',adjustmentValue:price!==base?round2(base-price):0,adjustmentReason:price!==base?(item.adjustmentReason||action.note||'Precio ajustado por el Asistente IA'):''};});
      const saleType=document.getElementById('nvAiEditSaleTypeV829');const payment=document.getElementById('nvAiEditPaymentV829');if(saleType)action.saleType=saleType.value;if(payment)action.paymentMethod=payment.value;
    }
    return action;
  }
  function openActionReview(action){
    if(!action||!action.type)return;
    if(action.type==='prepare_collection_message'||action.type==='prepare_followup_message')return openMessageReview(action);
    action={...action};
    recordAction(action,'pending',action.summary||'Pendiente de revisión');
    closeActionSheet();
    document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiActionOverlay"><section class="nvAiSheet nvAiActionSheet" role="dialog" aria-modal="true"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiActionClose" type="button">×</button><div class="nvAiActionSheetHead"><div class="nvAiAvatar">${botSvg()}</div><div><h2>Trabajo preparado por el asistente</h2><p>Revisa, edita, aprueba o rechaza. Nada se guarda automáticamente.</p></div></div><div class="nvAiActionReview"><strong>${esc(action.label||'Acción propuesta')}</strong><p>${esc(action.summary||'La aplicación abrirá el flujo correspondiente para tu revisión.')}</p>${actionDetailHtmlV825(action)}</div>${editableActionFieldsV826(action)}<div id="nvAiActionValidationV826" class="nv826PaymentValidation"></div><div class="nvAiActionButtons nvAiActionButtonsV826"><button class="btn outline danger" id="nvAiRejectAction" type="button">Rechazar</button><button class="btn outline" id="nvAiEditAction" type="button">Editar</button><button class="btn" id="nvAiConfirmAction" type="button">Aprobar y continuar</button></div></section></div>`);
    const close=closeActionSheet;
    const validation=document.getElementById('nvAiActionValidationV826');
    document.getElementById('nvAiActionClose').onclick=close;
    document.getElementById('nvAiActionOverlay').onclick=e=>{if(e.target.id==='nvAiActionOverlay')close();};
    document.getElementById('nvAiRejectAction').onclick=async()=>{recordAction(action,'rejected','Acción rechazada por el administrador');await auditAssistantAction(action,'rejected');close();window.showToast?.('La propuesta fue rechazada.');};
    document.getElementById('nvAiEditAction').onclick=()=>{const editor=document.getElementById('nvAiActionEditorV826');if(!editor)return window.showToast?.('Esta acción se edita en su formulario final.');editor.classList.toggle('hidden');document.getElementById('nvAiEditAction').textContent=editor.classList.contains('hidden')?'Editar':'Ocultar edición';};
    document.getElementById('nvAiConfirmAction').onclick=async()=>{
      const button=document.getElementById('nvAiConfirmAction');
      try{applyEditedActionV826(action);}catch(err){validation.textContent=err.message||'Revisa los datos.';return;}
      button.disabled=true;button.textContent='Preparando…';
      recordAction(action,'confirmed',action.summary||'Acción aprobada');await auditAssistantAction(action,'confirmed');close();
      if(action.type==='open_tab')return window.navigateTo?.(action.tab||'inicio');
      if(action.type==='seller_settlement')return window.navigateTo?.('rendicion-caja');
      if(action.type==='generate_collection_document'&&window.requestClientDocumentV820)return requestClientDocumentV820(action.clientId,'COB');
      if(action.type==='create_payment_plan'&&window.openPaymentPlanFormV820)return openPaymentPlanFormV820(action.clientId,{installmentAmount:action.installmentAmount,frequency:action.frequency,startDate:action.startDate,notes:action.note||'Plan preparado por el Asistente IA',source:'ai'});
      if((action.type==='register_payment'||action.type==='generate_receipt')&&window.openPaymentFormV820)return openPaymentFormV820(action.clientId,{amount:action.amount,note:action.note||'Pago preparado por el Asistente IA',source:'ai'});
      if(action.type==='prepare_sale'&&window.prepareSaleDraftV827)return window.prepareSaleDraftV827({items:action.items||[],clientId:action.clientId||'',paymentMethod:action.paymentMethod||'',saleType:action.saleType||'',note:action.note||'Venta preparada por el Asistente IA',source:'ai'});
      if(action.type==='prepare_promotion')return openPromotionDraftV832(action);
      if(action.type==='prepare_production')return openProductionDraftV832(action);
      if(action.type==='create_task'){upsertControlTaskV832({title:action.taskTitle,detail:action.note||action.summary,priority:action.taskPriority,dueDate:action.taskDueDate,responsible:action.taskResponsible||'Administrador central',area:'administration',source:'assistant'});window.showToast?.('Tarea registrada en Iniciativa y control.');return;}
      if(action.type==='create_quote'&&window.openQuoteForm){const client=(window.AppState?.clients||[]).find(c=>String(c.id)===String(action.clientId));return window.openQuoteForm({client:client||null,priceGroupId:client?.priceGroupId||'',items:action.items||[],source:'ai'});}
      window.showToast?.('La acción quedó preparada, pero el módulo no está disponible en esta sesión.','error');
    };
  }
  function answerLocal(question){
    const q=String(question||'').toLowerCase();
    const st=salesStats(q.includes('hoy')?1:q.includes('semana')?7:30), cs=clientStats(), ss=stockStats(), rs=receivableStats();
    const focused=focusedAccountContext();
    const draft=resolveDraftActionV825(question,{});
    if(draft.type==='prepare_sale'||draft.type==='create_quote'){
      if(draft.missingFields.length)return {title:draft.type==='create_quote'?'Completemos la cotización':'Completemos la venta',body:`Puedo preparar el trabajo, pero necesito: <b>${esc(draft.missingFields.join(' y '))}</b>. Indica producto, presentación y cantidad.`,missingFields:draft.missingFields,draftAction:draft};
      const units=draft.items.reduce((n,x)=>n+Number(x.quantity||0),0);const total=draft.items.reduce((n,x)=>n+Number(x.quantity||0)*Number((x.manualPrice ?? x.unitPrice) || 0),0);const stockOk=draft.items.every(x=>Number(x.stock||0)>=Number(x.quantity||0));
      return {title:draft.type==='create_quote'?'Cotización preparada':'Venta y recibo preparados',body:`Preparé un borrador con <b>${units} unidad(es)</b>${total>0?` por un total estimado de <b>${money(total)}</b>`:''}. ${stockOk?'El stock registrado es suficiente.':'Hay una cantidad que supera el stock disponible y debe revisarse.'}`,cards:[['Unidades',units],['Total estimado',total>0?money(total):'Revisar precio'],['Stock',stockOk?'Disponible':'Revisar'],['Estado','Pendiente de aprobación']],list:draft.items.map(x=>`${x.quantity} × ${x.productName} · stock ${x.stock} · ${money(x.manualPrice??x.unitPrice)}`),draftAction:draft,suggestions:[draft.type==='create_quote'?'Abrir cotización':'Preparar la venta','Editar cantidades']};
    }
    if(draft.type==='prepare_promotion'){if(draft.missingFields.length)return {title:'Completemos la promoción',body:`Necesito: <b>${esc(draft.missingFields.join(' y '))}</b>. Indica el producto y el porcentaje.`,draftAction:draft,missingFields:draft.missingFields};const item=draft.items[0],sim=discountSimulation((dataset().products||[]).find(p=>String(p.id)===String(item.productId)),draft.promotionPercent||5,1);return {title:'Promoción lista para revisar',body:`Preparé una propuesta de <b>${Number(draft.promotionPercent||5)}%</b> para <b>${esc(item.productName)}</b>. ${sim?`Precio promocional ${money(sim.final)} y margen estimado ${sim.margin.toFixed(1)}%.`:''}`,cards:sim?[['Precio normal',money(sim.price)],['Precio promoción',money(sim.final)],['Margen',sim.margin.toFixed(1)+'%'],['Regla',sim.allowed?'Permitida':'Revisar']]:undefined,draftAction:draft,list:['La promoción se abrirá prellenada.','Solo quedará activa después de guardarla manualmente.']};}
    if(draft.type==='prepare_production'){if(draft.missingFields.length)return {title:'Completemos la producción',body:`Necesito: <b>${esc(draft.missingFields.join(' y '))}</b>.`,draftAction:draft,missingFields:draft.missingFields};const item=draft.items[0],health=productCommercialHealthV832().find(x=>String(x.product.id)===String(item.productId)),qty=Number(draft.productionQuantity||health?.suggested||item.quantity||1);draft.productionQuantity=qty;return {title:'Orden de producción lista para revisar',body:`Preparé <b>${qty} unidad(es)</b> de <b>${esc(item.productName)}</b>. La aplicación abrirá la orden para que revises los insumos.`,cards:[['Stock actual',health?.stock??item.stock],['Cobertura',health?.coverage===999?'Sin consumo':`${Number(health?.coverage||0).toFixed(1)} días`],['Órdenes abiertas',health?.openPlanned||0],['Cantidad sugerida',qty]],draftAction:draft};}
    if(draft.type==='create_task')return {title:'Tarea lista para registrar',body:`Preparé la tarea <b>${esc(draft.taskTitle||'Tarea del director')}</b> con prioridad ${esc(draft.taskPriority||'normal')}.`,cards:[['Fecha límite',draft.taskDueDate],['Estado','Pendiente de aprobación']],draftAction:draft};
    if(draft.type==='create_payment_plan'){
      if(draft.missingFields.length)return {title:'Completemos el plan de pagos',body:`Puedo prepararlo, pero necesito: <b>${esc(draft.missingFields.join(' y '))}</b>. Ejemplo: “Plan para Gabriela Espinoza con cuota de Bs 100 al mes”.`,suggestions:['Plan para Gabriela Espinoza con cuota de Bs 100 al mes','Abrir cuentas por cobrar'],missingFields:draft.missingFields,draftAction:draft};
      const debt=Number(draft.account?.totalDebt||0),months=draft.installmentAmount>0?Math.ceil(debt/draft.installmentAmount):0;
      return {title:`Plan de pagos para ${draft.clientName}`,body:`Preparé un borrador de plan <b>${frequencyLabel(draft.frequency).toLowerCase()}</b> con cuota de <b>${money(draft.installmentAmount)}</b>. ${debt>0?`La deuda actual es ${money(debt)} y requeriría aproximadamente ${months} cuota(s).`:''}`,cards:[['Deuda',money(debt)],['Cuota',money(draft.installmentAmount)],['Frecuencia',frequencyLabel(draft.frequency)],['Cuotas aprox.',months||'—']],list:['La fecha y el detalle podrán ajustarse antes de guardar.','No se registra nada hasta tu confirmación.'],draftAction:draft,suggestions:['Preparar el plan','¿Qué pasa si la cuota es mayor?']};
    }
    if(draft.type==='register_payment'||draft.type==='generate_receipt'){
      if(draft.missingFields.length)return {title:'Completemos el pago',body:`Puedo preparar el registro y su recibo, pero necesito: <b>${esc(draft.missingFields.join(' y '))}</b>. Ejemplo: “Gabriela Espinoza pagó Bs 500; prepara el recibo”.`,missingFields:draft.missingFields,draftAction:draft};
      return {title:`Pago de ${draft.clientName}`,body:`Preparé un borrador por <b>${money(draft.amount)}</b>. Al continuar se abrirá el formulario para revisar método, fecha, comprobante y aplicación a la deuda.`,cards:[['Monto',money(draft.amount)],['Cliente',draft.clientName],['Estado','Pendiente de revisión']],draftAction:draft,list:['El pago no se guarda automáticamente.','Después de confirmar, la aplicación genera el recibo correspondiente.']};
    }
    if(draft.type==='seller_settlement')return {title:'Rendición de caja',body:'Puedo abrir el control de efectivo del vendedor, separar cobros digitales y preparar la rendición para confirmación.',draftAction:draft};
    if(focused&&/analiza|resumen|cliente|cuenta|deuda|cobran|qué debo|que debo|prioridad/.test(q)) return {title:`Estado de cuenta de ${focused.name||'cliente'}`,body:`El cliente registra una deuda de <b>${money(focused.totalDebt||0)}</b> en ${Number(focused.pendingCount||0)} operación(es). Ha pagado ${money(focused.totalPaid||0)} de un total comprado de ${money(focused.totalBought||0)}.`,cards:[['Deuda',money(focused.totalDebt||0)],['Pagado',money(focused.totalPaid||0)],['Operaciones',Number(focused.pendingCount||0)],['Atraso',`${Number(focused.daysLate||0)} días`]],list:[focused.oldestDebtDate?`Deuda más antigua: ${new Date(Number(focused.oldestDebtDate)).toLocaleDateString('es-BO')}`:'No hay fecha de deuda antigua registrada.',focused.lastPaymentDate?`Último pago: ${new Date(Number(focused.lastPaymentDate)).toLocaleDateString('es-BO')}`:'No existe un pago posterior registrado.','Revisa el detalle antes de contactar al cliente y conserva cada operación por separado.'],suggestions:['Prepara un mensaje de cobro','Genera el recibo consolidado','¿Qué riesgo tiene esta cuenta?']};
    if (/evaluacion|evaluación|salud operativa|califica el negocio/.test(q)){const ev=businessEvaluationV832();return {title:`Evaluación operativa: ${ev.score}/100`,body:`El negocio se encuentra en estado <b>${esc(ev.label)}</b>. ${esc(ev.note)}`,cards:ev.dimensions.map(x=>[x.name,`${x.score}/100`]),action:{label:'Abrir Iniciativa y control',tab:'asistente-ia'}};}
    if (/tareas|pendientes de hoy|control operativo/.test(q)){const tasks=readControlTasksV832().filter(x=>['pending','in_progress'].includes(x.status));return {title:'Tareas de control',body:`Hay <b>${tasks.length} tarea(s)</b> abiertas.`,list:tasks.slice(0,10).map(x=>`${x.title} · ${x.dueDate} · ${x.priority}`),suggestions:['Crear una tarea urgente','Dame el resumen automático']};}
    if (/produccion|producción|reponer|cobertura/.test(q)){const rows=productCommercialHealthV832().filter(x=>x.suggested>0).slice(0,8);return {title:'Planificación de producción',body:rows.length?'Productos con reposición sugerida según stock y movimiento de 30 días.':'No detecté necesidad inmediata de producción con los datos actuales.',list:rows.map(x=>`${x.product.name}: stock ${x.stock}, cobertura ${x.coverage===999?'sin consumo':x.coverage.toFixed(1)+' días'}, producir ${x.suggested}`),action:{label:'Abrir producción',tab:'produccion'},suggestions:rows.slice(0,3).map(x=>`Prepara una orden de producción de ${x.suggested} unidades de ${x.product.name}`)};}
    if (/resumen semanal|informe semanal|semana ejecutiva/.test(q)){const sum=ensureWeeklySummaryV835();return {title:sum.title,body:sum.body,list:sum.facts,cards:[['Esta semana',money(sum.metrics.currentRevenue)],['Semana anterior',money(sum.metrics.previousRevenue)],['Variación',`${sum.metrics.delta>=0?'+':''}${sum.metrics.delta}%`]],suggestions:['Abrir iniciativa y control','¿Qué acción debo priorizar?']};}
    if (/resumen automatico|resumen automático|informe diario/.test(q)){const sum=ensureDailySummaryV832();return {title:sum.title,body:sum.body,list:sum.facts,suggestions:['Abrir iniciativa y control','Dame el resumen semanal','¿Qué debo atender primero?']};}
    if (/resumen|panorama|cómo va|como va/.test(q)) return {title:'Resumen ejecutivo',body:`En el periodo analizado hay <b>${st.rows.length} ventas</b> por ${money(st.revenue)}, utilidad estimada de ${money(st.profit)} y margen de ${st.margin.toFixed(1)}%.`,cards:[['Ventas',st.rows.length],['Ingresos',money(st.revenue)],['Por cobrar',money(rs.total)],['Alertas',recommendations().length]],list:recommendations().slice(0,4).map(x=>`${x.title}: ${x.detail}`),suggestions:['¿Qué debo atender primero?','¿Qué clientes requieren seguimiento?','¿Tengo stock crítico?']};
    if (/venta|vendimos|factur/.test(q)) return {title:'Análisis de ventas',body:`Se registraron <b>${st.rows.length} operaciones</b> por ${money(st.revenue)}. La utilidad estimada es ${money(st.profit)} y el margen promedio ${st.margin.toFixed(1)}%.`,cards:[['Operaciones',st.rows.length],['Ingresos',money(st.revenue)],['Utilidad',money(st.profit)],['Margen',st.margin.toFixed(1)+'%']],suggestions:['Comparar productos','¿Qué producto deja más utilidad?','¿Cómo está mi margen?']};
    if (/utilidad|margen|producto.*mejor|más rentable/.test(q)) { const top=st.byProduct.slice(0,5); return {title:'Productos con mayor utilidad estimada',body:top.length?'Cálculo basado en ventas y costos registrados.':'No hay ventas suficientes en el periodo.',table:top.map(x=>[x.name,x.qty,money(x.revenue-x.cost),x.revenue?(((x.revenue-x.cost)/x.revenue)*100).toFixed(1)+'%':'0%']),suggestions:['¿Qué producto debería impulsar?','Simular descuento del 5%']}; }
    if (/stock|inventario|agot/.test(q)) return {title:'Estado de inventario',body:`Hay <b>${ss.critical.length} productos</b> en nivel crítico y ${ss.negative.length} con stock negativo.`,list:ss.critical.slice(0,8).map(p=>`${p.name||'Producto'}: ${Number(p.stock||0)} unidad(es)`),action:{label:'Abrir inventario',tab:'inventario'}};
    if (/cliente|seguimiento|inactiv/.test(q)) return {title:'Seguimiento de clientes',body:`Se identificaron <b>${cs.inactive.length} clientes</b> sin movimiento en los últimos 30 días y ${cs.incomplete.length} fichas incompletas.`,list:cs.inactive.slice(0,8).map(c=>`${c.name||c.businessName||'Cliente sin nombre'} · ${c.phone||c.whatsapp||'sin teléfono'}`),action:{label:'Abrir clientes',tab:'clientes'},suggestions:['Preparar mensaje de seguimiento','¿Cuántas fichas están incompletas?']};
    if (/cobran|deuda|vencid|por cobrar/.test(q)) return {title:'Cobranzas',body:`El saldo pendiente estimado es ${money(rs.total)} en ${rs.open.length} cuenta(s). ${rs.overdue.length} están vencidas.`,cards:[['Pendientes',rs.open.length],['Saldo',money(rs.total)],['Vencidas',rs.overdue.length]],list:rs.overdue.slice(0,6).map(x=>`${x.clientName||x.customerName||'Cliente'}: ${money(x.balance)}`),action:{label:'Abrir cuentas por cobrar',tab:'por-cobrar'}};
    if (/qué debo|prioridad|alerta|recomienda|recomendación/.test(q)) { const rec=recommendations(); return {title:'Prioridades recomendadas',body:rec.length?'Estas recomendaciones se basan en datos y reglas locales verificables.':'No detecté alertas relevantes con los datos disponibles.',list:rec.map(x=>`${x.title} — ${x.detail}`),suggestions:rec.slice(0,3).map(x=>x.question)}; }
    if (/mensaje|whatsapp/.test(q)) return {title:'Mensaje sugerido',body:'Buenas tardes. Esperamos que se encuentre muy bien. Queríamos consultar si necesita reponer sus productos Natura Vida. Podemos prepararle su pedido y coordinar la entrega. <br><br><small>Revisa y personaliza el texto antes de enviarlo.</small>'};
    if (/descuento|promoci/.test(q)) { const product=productByQuestion(q); const pm=q.match(/(\d+(?:[.,]\d+)?)\s*%/); const pct=pm?Number(pm[1].replace(',','.')):5; const sim=discountSimulation(product,pct,1); if(sim) return {title:`Simulación: ${product.name||'Producto'}`,body:`Con ${sim.pct}% de descuento, el precio sería ${money(sim.final)}, la utilidad por unidad ${money(sim.final-sim.cost)} y el margen ${sim.margin.toFixed(1)}%. ${sim.allowed?'<b>Está dentro del margen mínimo.</b>':'<b>No cumple el margen mínimo configurado.</b>'}`,cards:[['Precio actual',money(sim.price)],['Precio final',money(sim.final)],['Margen',sim.margin.toFixed(1)+'%'],['Resultado',sim.allowed?'Permitido':'No recomendado']],action:{label:'Abrir reglas comerciales',tab:'reglas-comerciales'}}; return {title:'Simulación comercial segura',body:'Indica el nombre del producto y el porcentaje. Ejemplo: “Simula 5% de descuento para Aceite de Coco 500 ml”.',action:{label:'Abrir reglas comerciales',tab:'reglas-comerciales'}}; }
    return {title:'Director Comercial Inteligente',body:'Puedo analizar y controlar el negocio, preparar ventas, promociones, producción, cotizaciones, pagos, recibos, planes, rendiciones y tareas para que los revises. Ninguna operación se guarda sin tu aprobación.',suggestions:['Dame un resumen','¿Qué debo atender primero?','¿Qué productos dejan mayor utilidad?','¿Qué cuentas están vencidas?']};
  }

  function directorOperationalResponseV830(question){
    const local=answerLocal(question);
    const draft=resolveDraftActionV829(question,local||{});
    if(!draft||draft.type==='none') return null;
    let response=enrichResponse(local||{},question);
    response=shapeOperationalResponseV829(question,response);
    response.engine='director';
    response.model='Núcleo operativo Natura Vida';
    response.confidence=draft.missingFields?.length?'media':'alta';
    response.directorMode='operate';
    response.title=response.title||'Trabajo preparado por el Director Administrativo';
    response.body=`<span class="nvAiDirectorStampV830">Núcleo operativo verificable</span>${response.body||''}`;
    return response;
  }
  function mergeDirectorWithExternalV830(question,external){
    const deterministic=directorOperationalResponseV830(question);
    if(!deterministic) return external;
    const draft=deterministic.draftAction||resolveDraftActionV829(question,deterministic);
    if(external?.body && !draft?.missingFields?.length){
      deterministic.list=[...(deterministic.list||[]),...((external.list||[]).filter(Boolean).slice(0,2))];
      deterministic.externalInsight=true;
    }
    return deterministic;
  }

  function normalizeEntry(entry){
    if(!entry||typeof entry!=='object') return null;
    const base={id:entry.id||uid(),requestId:String(entry.requestId||''),at:Number(entry.at)||Date.now()};
    if(entry.role==='user' && typeof entry.text==='string') return {...base,role:'user',text:entry.text.slice(0,1500)};
    if(entry.role==='assistant' && entry.response && typeof entry.response==='object') return {...base,role:'assistant',response:entry.response};
    return null;
  }
  function entryFingerprintV824(entry){
    if(!entry) return '';
    if(entry.role==='user') return `u:${normalizedName(entry.text)}`;
    const r=entry.response||{};
    return `a:${normalizedName([r.title,r.body,(r.list||[]).join('|')].join('|')).slice(0,900)}`;
  }
  function dedupeEntriesV824(entries){
    const out=[]; const requests=new Set();
    (entries||[]).map(normalizeEntry).filter(Boolean).forEach(entry=>{
      if(entry.requestId && requests.has(`${entry.role}:${entry.requestId}`)) return;
      const last=out[out.length-1];
      if(last && last.role===entry.role && entryFingerprintV824(last)===entryFingerprintV824(entry)) return;
      out.push(entry);
      if(entry.requestId) requests.add(`${entry.role}:${entry.requestId}`);
    });
    return out.slice(-MAX_ENTRIES);
  }
  function readConversation(){
    try {
      const data=JSON.parse(localStorage.getItem(historyKey())||'[]');
      const clean=dedupeEntriesV824(Array.isArray(data)?data:[]);
      if(JSON.stringify(clean)!==JSON.stringify(Array.isArray(data)?data:[])) writeConversation(clean);
      return clean;
    } catch(_) { return []; }
  }
  function writeConversation(entries){
    try { localStorage.setItem(historyKey(),JSON.stringify(dedupeEntriesV824(entries))); }
    catch(_) {}
  }
  function addEntry(entry){
    const rows=readConversation();
    const normalized=normalizeEntry(entry);
    if(!normalized) return null;
    if(normalized.requestId && rows.some(x=>x.role===normalized.role&&x.requestId===normalized.requestId)) return rows.find(x=>x.role===normalized.role&&x.requestId===normalized.requestId)||null;
    const last=rows[rows.length-1];
    if(last && last.role===normalized.role && entryFingerprintV824(last)===entryFingerprintV824(normalized)) return last;
    rows.push(normalized);
    writeConversation(rows);
    return normalized;
  }
  function clearConversation(){
    try { localStorage.removeItem(historyKey()); } catch(_) {}
  }
  function readArchivesV824(){
    try{const rows=JSON.parse(localStorage.getItem(archiveKey())||'[]');return (Array.isArray(rows)?rows:[]).slice(-MAX_ARCHIVES);}catch(_){return[];}
  }
  function saveArchivesV824(rows){try{localStorage.setItem(archiveKey(),JSON.stringify((rows||[]).slice(-MAX_ARCHIVES)));}catch(_){} }
  function conversationTitleV824(entries){
    const first=(entries||[]).find(x=>x.role==='user'&&String(x.text||'').trim());
    return clampText(first?.text||assistantContext.label||'Conversación del asistente',58);
  }
  function archiveCurrentConversationV824(){
    const entries=readConversation(); if(!entries.length) return null;
    const archives=readArchivesV824();
    const fingerprint=entryFingerprintV824(entries[0])+entryFingerprintV824(entries[entries.length-1]);
    if(!archives.some(x=>x.fingerprint===fingerprint)) archives.push({id:uid(),title:conversationTitleV824(entries),context:assistantContext.label,createdAt:entries[0]?.at||Date.now(),updatedAt:entries[entries.length-1]?.at||Date.now(),fingerprint,entries});
    saveArchivesV824(archives); return archives[archives.length-1]||null;
  }
  function startNewConversationV824(){
    archiveCurrentConversationV824(); clearConversation(); pendingQuestion=''; pendingRequestId=''; renderConversation(false); renderThreadPanelV825(); setDashboardCollapsedV824(false);
  }
  function restoreArchiveV824(id){
    const archive=readArchivesV824().find(x=>x.id===id); if(!archive) return;
    archiveCurrentConversationV824(); writeConversation(archive.entries||[]); document.getElementById('nvAiHistoryOverlay')?.remove(); renderConversation(false); renderThreadPanelV825(); setTimeout(()=>scrollLatestV824(true),60);
  }
  function deleteArchiveV824(id){ saveArchivesV824(readArchivesV824().filter(x=>x.id!==id)); renderThreadPanelV825(); showConversationHistoryV824(); }
  function dashboardCollapsedV824(){
    try{const raw=localStorage.getItem(dashboardKey());if(raw!==null)return raw==='1';}catch(_){}
    return readConversation().length>=4;
  }
  function setDashboardCollapsedV824(value){
    try{localStorage.setItem(dashboardKey(),value?'1':'0');}catch(_){}
    const dashboard=document.getElementById('nvAiDashboardV824'); if(dashboard) dashboard.classList.toggle('collapsed',!!value);
    const label=document.getElementById('nvAiDashboardStateV824'); if(label) label.textContent=value?'Mostrar':'Ocultar';
    const arrow=document.getElementById('nvAiDashboardArrowV824'); if(arrow) arrow.textContent=value?'⌄':'⌃';
  }
  function showConversationHistoryV824(){
    document.getElementById('nvAiHistoryOverlay')?.remove();
    const archives=readArchivesV824().slice().reverse();
    document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiHistoryOverlay"><section class="nvAiSheet" role="dialog" aria-modal="true"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiHistoryCloseV824" type="button">×</button><div class="nvAiSheetIntro"><div class="nvAiAvatar">${botSvg()}</div><div><h2>Conversaciones</h2><p>Ordena el chat sin perder análisis anteriores.</p></div></div><div class="nvAiHistoryListV824">${archives.length?archives.map(a=>`<article class="nvAiHistoryItemV824"><strong>${esc(a.title)}</strong><small>${new Date(a.updatedAt||Date.now()).toLocaleString('es-BO')} · ${(a.entries||[]).length} mensajes</small><div><button type="button" data-open-archive="${esc(a.id)}">Abrir</button><button type="button" class="danger" data-delete-archive="${esc(a.id)}">Borrar</button></div></article>`).join(''):'<p class="nvAiNoRec">Todavía no existen conversaciones archivadas.</p>'}</div><div class="nvAiActionButtons" style="margin-top:12px"><button class="btn outline" id="nvAiClearCurrentV824" type="button">Limpiar conversación actual</button><button class="btn" id="nvAiNewFromHistoryV824" type="button">Nueva conversación</button></div></section></div>`);
    document.getElementById('nvAiHistoryCloseV824').onclick=()=>document.getElementById('nvAiHistoryOverlay')?.remove();
    document.getElementById('nvAiHistoryOverlay').onclick=e=>{if(e.target.id==='nvAiHistoryOverlay')e.currentTarget.remove();};
    document.querySelectorAll('[data-open-archive]').forEach(b=>b.onclick=()=>restoreArchiveV824(b.dataset.openArchive));
    document.querySelectorAll('[data-delete-archive]').forEach(b=>b.onclick=()=>{if(!window.confirm||window.confirm('¿Borrar esta conversación archivada?'))deleteArchiveV824(b.dataset.deleteArchive);});
    document.getElementById('nvAiClearCurrentV824').onclick=()=>{if(!window.confirm||window.confirm('¿Limpiar solamente la conversación actual?')){clearConversation();document.getElementById('nvAiHistoryOverlay')?.remove();renderConversation(false);}};
    document.getElementById('nvAiNewFromHistoryV824').onclick=()=>{startNewConversationV824();document.getElementById('nvAiHistoryOverlay')?.remove();};
  }

  function renderThreadPanelV825(){
    const panel=document.getElementById('nvAiThreadPanelV825');if(!panel)return;
    const current=readConversation(),archives=readArchivesV824().slice().reverse();
    panel.innerHTML=`<div class="nvAiThreadsHeadV825"><strong>Conversaciones</strong><button type="button" id="nvAiThreadNewV825">＋</button></div><button type="button" class="nvAiThreadCurrentV825 active"><span>${esc(conversationTitleV824(current)||assistantContext.label||'Conversación actual')}</span><small>${current.length} mensaje(s) · actual</small></button><div class="nvAiThreadArchiveV825">${archives.length?archives.map(a=>`<article><button type="button" data-thread-open="${esc(a.id)}"><span>${esc(a.title)}</span><small>${new Date(a.updatedAt||Date.now()).toLocaleDateString('es-BO')} · ${(a.entries||[]).length}</small></button><button class="delete" type="button" data-thread-delete="${esc(a.id)}" aria-label="Borrar conversación">×</button></article>`).join(''):'<p>Los chats anteriores aparecerán aquí.</p>'}</div><button type="button" class="nvAiThreadAllV825" id="nvAiThreadAllV825">Administrar historial</button>`;
    panel.querySelector('#nvAiThreadNewV825').onclick=()=>{if(!window.confirm||window.confirm('¿Iniciar una conversación nueva?')){startNewConversationV824();panel.classList.remove('open');}};
    panel.querySelector('#nvAiThreadAllV825').onclick=showConversationHistoryV824;
    panel.querySelectorAll('[data-thread-open]').forEach(b=>b.onclick=()=>{restoreArchiveV824(b.dataset.threadOpen);panel.classList.remove('open');});
    panel.querySelectorAll('[data-thread-delete]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(!window.confirm||window.confirm('¿Borrar esta conversación?')){saveArchivesV824(readArchivesV824().filter(x=>x.id!==b.dataset.threadDelete));renderThreadPanelV825();}});
  }
  function toggleThreadsV825(force){const panel=document.getElementById('nvAiThreadPanelV825');if(!panel)return;panel.classList.toggle('open',typeof force==='boolean'?force:!panel.classList.contains('open'));}

  function plainTextV826(value){
    const el=document.createElement('div');el.innerHTML=String(value||'');return String(el.textContent||el.innerText||'').replace(/\s+/g,' ').trim();
  }
  function responseSpeechTextV826(r){
    const parts=[r?.title,plainTextV826(r?.body)];
    (r?.cards||[]).forEach(row=>parts.push(`${row[0]}: ${row[1]}`));
    (r?.list||[]).forEach(item=>parts.push(item));
    return parts.filter(Boolean).join('. ').slice(0,6000);
  }
  function resetSpeechButtonsV826(){
    document.querySelectorAll('[data-ai-speak]').forEach(button=>{button.classList.remove('speaking');button.textContent='🔊 Escuchar';});
    activeSpeechButtonV826=null;activeSpeechV826=null;
  }
  function stopSpeechV826(){
    try{window.speechSynthesis?.cancel();}catch(_){}
    resetSpeechButtonsV826();
  }
  function speakTextV826(text,button){
    if(!('speechSynthesis' in window)||typeof SpeechSynthesisUtterance==='undefined'){window.showToast?.('La lectura en voz alta no está disponible en este dispositivo.','error');return;}
    if(button?.classList.contains('speaking')){stopSpeechV826();return;}
    stopSpeechV826();
    const utterance=new SpeechSynthesisUtterance(String(text||''));
    utterance.lang='es-BO';utterance.rate=.96;utterance.pitch=1;utterance.volume=1;
    const voices=window.speechSynthesis.getVoices?.()||[];
    utterance.voice=voices.find(v=>/^es(-|_)/i.test(v.lang)&&/boliv|latino|español/i.test(v.name))||voices.find(v=>/^es(-|_)/i.test(v.lang))||null;
    utterance.onend=resetSpeechButtonsV826;utterance.onerror=resetSpeechButtonsV826;
    activeSpeechV826=utterance;activeSpeechButtonV826=button;
    if(button){button.classList.add('speaking');button.textContent='■ Detener';}
    window.speechSynthesis.speak(utterance);
  }

  function renderResponse(r,entry={}){
    const source=r.engine==='external'?`<span class="nvAiAnswerSource external">IA · ${esc(r.model||'Gemini')}</span>`:r.engine==='director'?'<span class="nvAiAnswerSource directorV830">Director operativo</span>':r.engine==='local-fallback'?'<span class="nvAiAnswerSource fallback">Respaldo local</span>':'<span class="nvAiAnswerSource local">Cálculo local</span>';
    const confidence=r.confidence?`<span class="nvAiConfidence">Confianza ${esc(r.confidence)}</span>`:'';
    return `<article class="nvAiMessage assistant" data-request-id="${esc(entry.requestId||'')}"><div class="nvAiBotMini">${botSvg('mini')}</div><div class="nvAiBubble"><div class="nvAiAnswerHead"><strong>${esc(r.title)}</strong><span>${source}${confidence}</span></div><p>${r.body||''}</p>${r.cards?`<div class="nvAiMetrics">${r.cards.map(x=>`<div><small>${esc(x[0])}</small><b>${esc(x[1])}</b></div>`).join('')}</div>`:''}${r.table?`<div class="nvAiTable"><div class="head"><span>Producto</span><span>Unid.</span><span>Utilidad</span><span>Margen</span></div>${r.table.map(row=>`<div>${row.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`).join('')}</div>`:''}${r.proposals?.length?`<div class="nvAiActionPanel ${r.operationalReady?'readyV829':''}"><span>${r.operationalReady?'Trabajo listo para revisión':'Acciones con confirmación'}</span><div class="nvAiActionGrid">${r.proposals.map((a,index)=>`<button class="${index===0&&r.operationalReady?'primaryV829':''}" type="button" data-ai-action="${esc(encodeURIComponent(JSON.stringify(a)))}"><b>${esc(a.label)}</b><small>${esc(a.summary||'Revisar antes de continuar')}</small></button>`).join('')}</div></div>`:''}${r.list?.length?`<ul>${r.list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${r.diagnostic?`<div class="nvAiDiagnosticV824"><strong>Diagnóstico del motor</strong><br>${esc(r.diagnostic)}</div>`:''}${r.action&&!r.proposals?.some(a=>a.type==='open_tab'&&a.tab===r.action.tab)?`<button class="nvAiInlineAction" type="button" data-ai-tab="${esc(r.action.tab)}">${esc(r.action.label)}</button>`:''}${r.suggestions?.length?`<div class="nvAiSuggestions">${r.suggestions.map(x=>`<button type="button" data-ai-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`:''}<div class="nvAiSpeechToolsV826"><button type="button" data-ai-speak="${esc(encodeURIComponent(responseSpeechTextV826(r)))}">🔊 Escuchar</button><small>Lectura local del dispositivo · sin micrófono</small></div></div></article>`;
  }
  function renderEntry(entry){
    if(entry.role==='user') return `<article class="nvAiMessage user" data-ai-entry="${esc(entry.id)}" data-request-id="${esc(entry.requestId||'')}"><div class="nvAiBubble">${esc(entry.text)}</div></article>`;
    return renderResponse(entry.response||{title:'Respuesta',body:'Sin contenido.'},entry);
  }
  function welcomeHtml(){
    const name=String(window.AppState?.session?.fullName||window.AppState?.session?.username||'Cristhian').split(' ')[0];
    return `<article class="nvAiMessage assistant nvAiWelcome"><div class="nvAiBotMini">${botSvg('mini')}</div><div class="nvAiBubble"><strong>Hola, ${esc(name)}</strong><p>Puedo preparar operaciones y también detectar prioridades, organizar la agenda y generar resúmenes diarios y semanales. Las respuestas permanecerán guardadas en esta conversación aunque la pantalla se actualice.</p><div class="nvAiSuggestions">${['¿Cómo van las ventas hoy?','¿Qué productos dejan mayor utilidad?','¿Qué clientes requieren seguimiento?','¿Tengo stock crítico?'].map(x=>`<button type="button" data-ai-q="${esc(x)}">${esc(x)}</button>`).join('')}</div></div></article>`;
  }
  function thinkingHtml(){
    return `<article class="nvAiMessage assistant nvAiThinking"><div class="nvAiBotMini">${botSvg('mini')}</div><div class="nvAiBubble"><span class="nvAiTyping"><i></i><i></i><i></i></span><small>${engineState.mode==='external'?'Consultando motor IA y verificando datos…':'Calculando con los datos locales…'}</small></div></article>`;
  }
  function bindInline(root=document){
    root.querySelectorAll?.('[data-ai-tab]').forEach(b=>{ b.onclick=()=>window.navigateTo(b.dataset.aiTab); });
    root.querySelectorAll?.('[data-ai-q]').forEach(b=>{ b.onclick=()=>ask(b.dataset.aiQ); });
    root.querySelectorAll?.('[data-ai-action]').forEach(b=>{ b.onclick=()=>{try{openActionReview(JSON.parse(decodeURIComponent(b.dataset.aiAction)));}catch(_){window.showToast?.('No se pudo abrir la acción propuesta.','error');}}; });
    root.querySelectorAll?.('[data-ai-speak]').forEach(b=>{b.onclick=()=>{try{speakTextV826(decodeURIComponent(b.dataset.aiSpeak||''),b);}catch(_){window.showToast?.('No se pudo iniciar la lectura.','error');}};});
  }
  function scrollLatestV824(force=false){
    const feed=document.getElementById('nvAiFeed'); if(!feed) return;
    const last=feed.lastElementChild; if(!last) return;
    const nearBottom=window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-220;
    if(force||nearBottom||pendingQuestion) last.scrollIntoView({behavior:force?'auto':'smooth',block:'end'});
  }
  function updateJumpV824(){
    const btn=document.getElementById('nvAiJumpLatestV824'); if(!btn) return;
    const nearBottom=window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-260;
    btn.classList.toggle('show',!nearBottom&&readConversation().length>2);
  }
  function renderConversation(preserveBottom=true){
    const feed=document.getElementById('nvAiFeed');
    if(!feed) return;
    const entries=readConversation();
    feed.innerHTML=(entries.length?entries.map(renderEntry).join(''):welcomeHtml())+(pendingQuestion?thinkingHtml():'');
    bindInline(feed);
    if(preserveBottom||pendingQuestion) requestAnimationFrame(()=>scrollLatestV824(false));
    updateJumpV824();
  }

  function setComposerBusyV831(busy,label=''){
    const send=document.getElementById('nvAiSend');
    const input=document.getElementById('nvAiInput');
    if(send){send.disabled=!!busy;send.classList.toggle('busy',!!busy);send.textContent=busy?'…':'➤';send.setAttribute('aria-label',busy?(label||'Procesando'):'Enviar');}
    if(input) input.disabled=!!busy;
  }
  function resetPendingV831(message=''){
    clearTimeout(answerTimer);
    pendingQuestion=''; pendingRequestId='';
    setComposerBusyV831(false);
    if(String(window.AppState?.currentTab)==='asistente-ia') renderConversation(true);
    if(message) window.showToast?.(message,'error');
  }
  function autoGrowComposerV831(input){
    if(!input)return;input.style.height='auto';input.style.height=`${Math.min(124,Math.max(46,input.scrollHeight))}px`;
  }
  async function ask(question){
    const input=document.getElementById('nvAiInput');
    const q=String(question||input?.value||'').trim();
    const now=Date.now();
    if(!q) return;
    if(pendingQuestion){window.showToast?.('La consulta anterior sigue procesándose. Espera unos segundos o usa Recuperar asistente.','error');return;}
    const last=readConversation().slice(-1)[0];
    if(last?.role==='user'&&normalizedName(last.text)===normalizedName(q)&&now-last.at<1800) return;
    if(now-lastQuestionAt<300) return;
    lastQuestionAt=now;
    if(input){input.value='';autoGrowComposerV831(input);}
    clearComposerDraft();
    const requestId=uid();
    try{addEntry({role:'user',text:q,requestId,at:now});}
    catch(error){window.showToast?.('No se pudo guardar la consulta localmente.','error');return;}
    pendingQuestion=q; pendingRequestId=requestId;
    setComposerBusyV831(true,'Procesando consulta');
    renderConversation(true);
    clearTimeout(answerTimer);
    answerTimer=setTimeout(()=>{
      if(pendingRequestId!==requestId)return;
      addEntry({role:'assistant',requestId,response:{title:'El asistente fue recuperado',body:'La consulta excedió el tiempo permitido y fue cancelada para evitar que la pantalla quede bloqueada. Puedes volver a enviarla.',diagnostic:'Tiempo máximo de espera superado.',engine:'local'},at:Date.now()});
      resetPendingV831('El asistente fue liberado automáticamente.');
    },REQUEST_WATCHDOG_MS);
    try{
      let response;
      const mode=effectiveDirectorModeV830(q);
      const deterministic=mode==='operate'?directorOperationalResponseV830(q):null;
      if(deterministic){
        // Las operaciones se preparan de inmediato con datos locales verificables. Gemini no puede bloquear el flujo.
        response=deterministic;
      } else if(mode==='analyze'){
        const local=answerLocal(q); local.engine='local'; response=local;
        if(navigator.onLine){
          try{ response=await withTimeout(answerWithEngine(q),12000); }
          catch(error){response=local;response.engine='local-fallback';response.diagnostic=clampText(error.message||'Motor externo no disponible',220);}
        }
      } else {
        response=answerLocal(q);response.engine='local';
      }
      if(pendingRequestId!==requestId)return;
      response=enrichResponse(response,q);
      response.directorMode=mode;
      addEntry({role:'assistant',response,requestId,at:Date.now()});
      renderThreadPanelV825();
      const primaryWork=response.operationalReady&&response.proposals?.[0]?response.proposals[0]:null;
      if(primaryWork)setTimeout(()=>{if(String(window.AppState?.currentTab)==='asistente-ia')openActionReview(primaryWork);},240);
    }catch(error){
      if(pendingRequestId===requestId)addEntry({role:'assistant',requestId,response:{title:'No pude completar la consulta',body:'La operación fue detenida sin guardar cambios. El asistente ya está disponible para volver a intentar.',diagnostic:clampText(error.message||'',220),engine:'local'},at:Date.now()});
    }finally{
      if(pendingRequestId===requestId)resetPendingV831();
    }
  }

  function statsSnapshot(){
    const st=salesStats(30),cs=clientStats(),ss=stockStats();
    return {st,cs,ss};
  }
  function updateAssistantHeader(){
    const {st,cs,ss}=statsSnapshot();
    const ctxLabel=document.getElementById('nvAiContextLabel');
    if(ctxLabel) ctxLabel.textContent=assistantContext.label;
    const values={nvAiStatSales:money(st.revenue),nvAiStatProfit:money(st.profit),nvAiStatStock:ss.critical.length,nvAiStatFollow:cs.inactive.length,nvAiStatHealthV832:`${businessEvaluationV832().score}/100`,nvAiStatTasksV832:readControlTasksV832().filter(x=>['pending','in_progress'].includes(x.status)).length};
    Object.entries(values).forEach(([id,value])=>{ const el=document.getElementById(id); if(el) el.textContent=String(value); });
  }
  function renderRecommendations(){
    updateControlIndicatorsV832();
    const box=document.getElementById('nvAiRecommendations'); if(!box) return;
    const rec=recommendations(); box.innerHTML=rec.length?rec.map(x=>`<button type="button" class="${esc(x.level)}" data-ai-q="${esc(x.question)}"><span></span><div><strong>${esc(x.title)}</strong><small>${esc(x.detail)}</small></div><b>›</b></button>`).join(''):'<p class="nvAiNoRec">Sin alertas prioritarias con los datos actuales.</p>'; bindInline(box);
    const topics=document.getElementById('nvAiTopicTabs'); if(topics){ topics.innerHTML=['Resumen','Ventas','Clientes','Inventario','Producción','Cobranzas','Descuentos','Control'].map(x=>`<button type="button" data-ai-q="${x==='Resumen'?'Dame un resumen':x==='Ventas'?'Analiza las ventas':x==='Clientes'?'¿Qué clientes requieren seguimiento?':x==='Inventario'?'¿Tengo stock crítico?':x==='Producción'?'¿Qué debo producir?':x==='Cobranzas'?'¿Qué cuentas están vencidas?':x==='Control'?'Dame la evaluación operativa':'Simular descuento del 5%'}">${x}</button>`).join(''); bindInline(topics); }
  }
  function buildAssistantPage(){
    const {st,cs,ss}=statsSnapshot();
    const main=document.getElementById('mainArea');
    main.innerHTML=`<section class="nvAiPage nvAiPageV825">
      <header class="nvAiHead"><button id="nvAiBack" type="button" aria-label="Volver">‹</button><div class="nvAiAvatar">${botSvg()}</div><div><h1>Director Ejecutivo <span>IA</span></h1><p>Detecta, prioriza, prepara y controla el negocio bajo tu aprobación</p></div><div class="nvAiHeadActionsV824"><button id="nvAiThreadsToggleV825" type="button">Chats</button><button id="nvAiNewV824" type="button">＋ Nueva</button><button id="nvAiHistoryV824" type="button">Historial</button></div></header>
      <div class="nvAiWorkspaceV825">
        <aside class="nvAiThreadPanelV825" id="nvAiThreadPanelV825" aria-label="Conversaciones del asistente"></aside>
        <main class="nvAiChatColumnV825">
          <div class="nvAiDirectorModesV830"><span>Modo</span><button type="button" data-ai-mode-v830="auto">Automático</button><button type="button" data-ai-mode-v830="operate">Preparar operación</button><button type="button" data-ai-mode-v830="analyze">Analizar</button><small id="nvAiModeLabelV830">Automático</small></div><div class="nvAiEngineBar"><button type="button" id="nvAiEngineBadge" class="nvAiEngineBadge ${engineClass()}"><i></i><span>${esc(engineLabel())}</span></button><small id="nvAiUsage">${engineState.usage?`${engineState.usage.used}/${engineState.usage.limit} consultas hoy`:'Modo local seguro'}</small><button type="button" id="nvAiOpenActions">Trabajos <b id="nvAiActionCount">${readActionHistory().filter(x=>x.status==='pending').length}</b></button><button type="button" id="nvAiControlV832">Control <b id="nvAiControlCountV832">${controlAlertsV832().length+readControlTasksV832().filter(x=>['pending','in_progress'].includes(x.status)).length}</b></button><button type="button" id="nvAiCheckEngine">Comprobar</button><button type="button" id="nvAiRecoverV831">Recuperar</button></div>
          <div class="nvAiExecutiveStripV834"><span>Director Proactivo</span><strong>${esc(executiveOverviewV834().title)}</strong><button type="button" id="nvAiExecutiveOpenV834">Ver prioridades</button></div><div class="nvAiContext"><span>Analizando</span><strong id="nvAiContextLabel">${esc(assistantContext.label)}</strong><small>Datos empresariales autorizados · ninguna operación se ejecuta sin revisión</small></div>
          <section class="nvAiDashboardV824 ${dashboardCollapsedV824()?'collapsed':''}" id="nvAiDashboardV824"><button type="button" class="nvAiDashboardToggleV824" id="nvAiDashboardToggleV824"><span>Panel gerencial <small id="nvAiDashboardStateV824">${dashboardCollapsedV824()?'Mostrar':'Ocultar'}</small></span><b id="nvAiDashboardArrowV824">${dashboardCollapsedV824()?'⌄':'⌃'}</b></button><div class="nvAiDashboardBodyV824"><div class="nvAiQuickStats"><div><small>Ventas 30 días</small><b id="nvAiStatSales">${money(st.revenue)}</b></div><div><small>Utilidad estimada</small><b id="nvAiStatProfit">${money(st.profit)}</b></div><div><small>Stock crítico</small><b id="nvAiStatStock">${ss.critical.length}</b></div><div><small>Seguimientos</small><b id="nvAiStatFollow">${cs.inactive.length}</b></div><div><small>Salud operativa</small><b id="nvAiStatHealthV832">${businessEvaluationV832().score}/100</b></div><div><small>Tareas pendientes</small><b id="nvAiStatTasksV832">${readControlTasksV832().filter(x=>['pending','in_progress'].includes(x.status)).length}</b></div></div><section class="nvAiRecPanel"><div class="nvAiRecHead"><strong>Recomendaciones de hoy</strong><button id="nvAiRefreshRec" type="button">Actualizar</button></div><div id="nvAiRecommendations" class="nvAiRecommendations"></div></section><div class="nvAiTopicTabs" id="nvAiTopicTabs"></div></div></section>
          <div class="nvAiFeed" id="nvAiFeed" aria-live="polite"></div><button type="button" class="nvAiJumpLatestV824" id="nvAiJumpLatestV824" aria-label="Ir al mensaje más reciente">↓</button>
          <div class="nvAiComposer"><textarea id="nvAiInput" rows="1" placeholder="Escribe una orden o consulta…" aria-label="Consulta para el asistente" data-nv-no-dirty="true"></textarea><button id="nvAiSend" type="button" aria-label="Enviar">➤</button></div>
          <p class="nvAiDisclaimer">Director híbrido: Gemini interpreta; Natura Vida busca, calcula y prepara con datos reales. Tú editas, apruebas o rechazas.</p>
        </main>
      </div>
    </section>`;
    document.getElementById('nvAiBack').onclick=()=>window.navigateTo(lastNonAiTab||'inicio');
    directorModeV830=readDirectorModeV830(); document.querySelectorAll('[data-ai-mode-v830]').forEach(button=>button.onclick=()=>setDirectorModeV830(button.dataset.aiModeV830)); updateDirectorModeUIV830();
    document.getElementById('nvAiThreadsToggleV825').onclick=()=>toggleThreadsV825();
    document.getElementById('nvAiNewV824').onclick=()=>{ if(!window.confirm||window.confirm('¿Iniciar una conversación nueva? La actual quedará guardada en Historial.')) startNewConversationV824(); };
    document.getElementById('nvAiHistoryV824').onclick=showConversationHistoryV824;
    document.getElementById('nvAiDashboardToggleV824').onclick=()=>setDashboardCollapsedV824(!document.getElementById('nvAiDashboardV824').classList.contains('collapsed'));
    document.getElementById('nvAiJumpLatestV824').onclick=()=>scrollLatestV824(true);
    document.getElementById('nvAiSend').onclick=()=>ask();
    document.getElementById('nvAiRefreshRec').onclick=renderRecommendations;
    document.getElementById('nvAiOpenActions').onclick=showActionHistory;
    document.getElementById('nvAiControlV832').onclick=()=>openControlCenterV832();
    document.getElementById('nvAiExecutiveOpenV834').onclick=()=>openControlCenterV832('overview');
    document.getElementById('nvAiCheckEngine').onclick=async()=>{ await checkEngine(true); if(window.showToast) showToast(engineState.message||engineLabel()); };
    document.getElementById('nvAiEngineBadge').onclick=()=>document.getElementById('nvAiCheckEngine')?.click();
    document.getElementById('nvAiRecoverV831').onclick=()=>{resetPendingV831();window.showToast?.('Asistente recuperado y listo para una nueva consulta.');};
    const aiInput=document.getElementById('nvAiInput');
    aiInput.value=readComposerDraft();
    aiInput.addEventListener('input',()=>{saveComposerDraft(aiInput.value);autoGrowComposerV831(aiInput);});
    autoGrowComposerV831(aiInput);
    aiInput.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); ask(); } });
    window.removeEventListener('scroll',updateJumpV824); window.addEventListener('scroll',updateJumpV824,{passive:true});
    renderThreadPanelV825();
    ensureDailySummaryV832();
    syncControlCenterV834({silent:true}).catch(()=>{});
    showControlReminderV834();
    renderRecommendations();
    updateControlIndicatorsV832();
    renderConversation(false);
    updateEngineUI();
    checkEngine(false).catch(()=>{});
  }
  function renderAssistant(options={}){
    if(!adminAllowed()){
      if(oldNavigate) oldNavigate('inicio');
      return;
    }
    const existing=document.querySelector('.nvAiPage');
    if(existing && !options.force){
      updateAssistantHeader();
      renderConversation(false);
      return;
    }
    buildAssistantPage();
  }

  function closeSheet(){ document.getElementById('nvAiOverlay')?.remove(); }
  function openFull(question=''){
    assistantContext=currentContext();
    lastNonAiTab=assistantContext.tab==='asistente-ia'?'inicio':assistantContext.tab;
    closeSheet();
    window.navigateTo('asistente-ia');
    if(question) setTimeout(()=>ask(question),80);
  }
  function openSheet(){
    if(!adminAllowed()) return;
    closeSheet();
    const ctx=currentContext();
    const hasHistory=readConversation().length>0;
    document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiOverlay"><section class="nvAiSheet" role="dialog" aria-modal="true" aria-labelledby="nvAiSheetTitle"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiClose" type="button" aria-label="Cerrar">×</button><div class="nvAiSheetIntro"><div class="nvAiAvatar">${botSvg()}</div><div><h2 id="nvAiSheetTitle">Asistente Natura</h2><p>${hasHistory?'Tu conversación está guardada.':'¿En qué puedo ayudarte?'}</p></div></div><div class="nvAiSheetContext"><span>Contexto: <b>${esc(ctx.label)}</b></span><em class="nvAiEngineMini ${engineClass()}">${esc(engineLabel())}</em></div><div class="nvAiQuickComposerV8211"><textarea id="nvAiQuickInputV8211" rows="2" placeholder="Escribe una orden rápida…" data-nv-no-dirty="true"></textarea><button id="nvAiQuickSendV8211" type="button">Enviar</button></div><div class="nvAiSheetActions">${[['Resumen de hoy','¿Cómo van las ventas hoy?'],['Analizar ventas','¿Qué productos dejan mayor utilidad?'],['Revisar clientes','¿Qué clientes requieren seguimiento?']].map(x=>`<button type="button" data-sheet-q="${esc(x[1])}">${esc(x[0])}</button>`).join('')}<button class="primary" id="nvAiOpenFull" type="button">${hasHistory?'Continuar conversación':'Abrir asistente completo'}</button></div></section></div>`);
    document.getElementById('nvAiClose').onclick=closeSheet;
    document.getElementById('nvAiOverlay').onclick=e=>{ if(e.target.id==='nvAiOverlay') closeSheet(); };
    document.getElementById('nvAiOpenFull').onclick=()=>openFull();
    const quickInput=document.getElementById('nvAiQuickInputV8211');
    document.getElementById('nvAiQuickSendV8211').onclick=()=>{const value=String(quickInput?.value||'').trim();if(!value)return window.showToast?.('Escribe una orden para el asistente.','error');openFull(value);};
    quickInput?.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();document.getElementById('nvAiQuickSendV8211')?.click();}});
    document.querySelectorAll('[data-sheet-q]').forEach(b=>{ b.onclick=()=>openFull(b.dataset.sheetQ); });
  }

  function rectOverlapArea(a,b){const w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));const h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));return w*h;}
  function positionFabSmartV827(){
    const fab=document.getElementById('nvAiFab');if(!fab)return;
    clearTimeout(fabPositionTimer);fabPositionTimer=setTimeout(()=>{
      if(!document.body.contains(fab))return;
      const size=Math.max(52,Math.round(fab.getBoundingClientRect().width||56));const side=12;
      const nav=document.querySelector('.bottomNav,.v7BottomNav');const navTop=nav?.getBoundingClientRect().top||innerHeight-82;const baseTop=Math.max(78,navTop-size-12);
      const candidates=[{name:'right',left:innerWidth-side-size,top:baseTop},{name:'left',left:side,top:baseTop},{name:'right-raised',left:innerWidth-side-size,top:Math.max(82,baseTop-82)},{name:'left-raised',left:side,top:Math.max(82,baseTop-82)}];
      const controls=[...document.querySelectorAll('button:not(#nvAiFab),a[href],input,select,textarea,[role="button"],.btn,.cartBar,#goToCheckout,.stickyActions')].filter(el=>{if(el.closest('.bottomNav,.v7BottomNav,.nvAiOverlay,#nvAiFab')||el.disabled)return false;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return cs.visibility!=='hidden'&&cs.display!=='none'&&r.width>24&&r.height>24&&r.bottom>0&&r.top<innerHeight;}).map(el=>el.getBoundingClientRect());
      let best=candidates[0],bestScore=Infinity;candidates.forEach(c=>{const r={left:c.left-10,right:c.left+size+10,top:c.top-10,bottom:c.top+size+10};let score=0;controls.forEach(x=>score+=rectOverlapArea(r,x));if(score<bestScore){bestScore=score;best=c;}});
      fab.dataset.anchor=best.name;fab.style.left=`${Math.max(8,best.left)}px`;fab.style.right='auto';fab.style.top=`${Math.max(72,best.top)}px`;fab.style.bottom='auto';
    },90);
  }
  function ensureFab(){
    let fab=document.getElementById('nvAiFab');
    const tab=String(window.AppState?.currentTab||'');
    const blocked=!adminAllowed() || tab==='asistente-ia' || document.querySelector('.loginShell') || document.querySelector('.nvAiOverlay');
    if(blocked){ fab?.remove(); return; }
    if(!fab){
      fab=document.createElement('button');
      fab.id='nvAiFab'; fab.className='nvAiFab'; fab.type='button';
      fab.innerHTML=`<span class="nvAiFabFace">${botSvg('is-fab')}</span><span class="nvAiFabBadge">IA</span>`;
      fab.setAttribute('aria-label','Abrir Asistente IA');
      fab.onclick=openSheet;
      document.body.appendChild(fab);
    }
    positionFabSmartV827();
  }

  function openForContext(context={},question=''){
    const ctx={...currentContext(),...context};assistantContext=ctx;lastNonAiTab=ctx.tab==='asistente-ia'?'inicio':ctx.tab;closeSheet();window.navigateTo?.('asistente-ia');if(question)setTimeout(()=>ask(question),100);
  }

  function install(){
    if(window.__NV_AI_V825_INSTALLED) return;
    window.__NV_AI_V825_INSTALLED=true;
    window.__NV_AI_V824_INSTALLED=true;
    oldNavigate=window.navigateTo;
    oldRender=window.render;
    window.navigateTo=function(tab){
      if(tab==='asistente-ia'){
        if(!adminAllowed()) return;
        if(String(window.AppState?.currentTab)!=='asistente-ia'){
          const ctx=currentContext();
          if(ctx.tab!=='asistente-ia'){ assistantContext=ctx; lastNonAiTab=ctx.tab; }
        }
        window.AppState.currentTab=tab;
        if(window.highlightActiveV7) try{ highlightActiveV7(); }catch(_){}
        renderAssistant();
        ensureFab();
        return;
      }
      if(String(window.AppState?.currentTab)==='asistente-ia'){ lastNonAiTab=tab||'inicio'; stopSpeechV826(); }
      return oldNavigate(tab);
    };
    window.render=function(){
      if(String(window.AppState?.currentTab)==='asistente-ia') renderAssistant();
      else oldRender();
      setTimeout(ensureFab,0);
    };
    const main=document.getElementById('mainArea');
    if(main){
      const observer=new MutationObserver(()=>setTimeout(()=>{ensureFab();positionFabSmartV827();},0));
      observer.observe(main,{childList:true,subtree:true});
    }
    window.addEventListener('resize',positionFabSmartV827,{passive:true});
    window.addEventListener('scroll',positionFabSmartV827,{passive:true});
    document.addEventListener('focusin',positionFabSmartV827);
    document.addEventListener('focusout',positionFabSmartV827);
    setTimeout(ensureFab,250);
    setTimeout(()=>checkEngine(false).catch(()=>{}),700);
    setTimeout(()=>{installControlSyncV834();ensureDailySummaryV832();ensureWeeklySummaryV835();setTimeout(()=>showProactiveBriefV835(false),700);},900);
    window.renderAIAssistantV829=renderAssistant;
    window.renderAIAssistantV826=renderAssistant;
    window.renderAIAssistantV825=renderAssistant;
    window.renderAIAssistantV824=renderAssistant;
    window.renderAIAssistantV822=renderAssistant;
    window.renderAIAssistantV821=renderAssistant;
    window.renderAIAssistantV812=renderAssistant;
    window.renderAIAssistantV810=renderAssistant;
    window.openAIAssistantSheetV826=openSheet;
    window.openAIAssistantSheetV825=openSheet;
    window.openAIAssistantSheetV824=openSheet;
    window.openAIAssistantSheetV822=openSheet;
    window.openAIAssistantSheetV821=openSheet;
    window.openAIAssistantSheetV812=openSheet;
    window.openAIAssistantSheetV810=openSheet;
  }

  window.__nvAiV835={VERSION,readConversation,writeConversation,addEntry,clearConversation,readArchivesV824,archiveCurrentConversationV824,startNewConversationV824,dedupeEntriesV824,readActionHistory,answerLocal,businessSnapshot,recommendations,discountSimulation,checkEngine,answerWithEngine,renderAssistant,openSheet,openForContext,openActionReview,ask,botSvg,speakTextV826,stopSpeechV826,resolveDraftActionV829,buildActionProposals,shapeOperationalResponseV829,directorOperationalResponseV830,setDirectorModeV830,resetPendingV831,openControlCenterV832,readControlTasksV832,controlAlertsV832,businessEvaluationV832,dailySummaryV832,weeklySummaryV835,ensureWeeklySummaryV835,proactiveActionsV835,showProactiveBriefV835,productCommercialHealthV832,taskOverviewV834,executiveOverviewV834,syncControlCenterV834,installControlSyncV834,get controlSyncStateV834(){return {...controlSyncStateV834};},get directorMode(){return directorModeV830;},get engineState(){return {...engineState};}}; window.__nvAiV834=window.__nvAiV835; window.__nvAiV832=window.__nvAiV835; window.__nvAiV830=window.__nvAiV835; window.__nvAiV829=window.__nvAiV835;
  window.__nvAiV827=window.__nvAiV829;
  window.__nvAiV826=window.__nvAiV829;
  window.__nvAiV825=window.__nvAiV827;
  window.__nvAiV824=window.__nvAiV827;
  window.__nvAiV822=window.__nvAiV827;
  window.__nvAiV821=window.__nvAiV827;
  window.__nvAiV812=window.__nvAiV827;
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));
  else setTimeout(install,0);
})();
