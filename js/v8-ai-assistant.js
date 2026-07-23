/* Natura Vida V8.2.4 — Asistente IA organizado, motor diagnosticable y acciones confirmadas.
   Acceso exclusivo para administrador central. Los cálculos críticos continúan
   siendo locales; Gemini interpreta un resumen empresarial limitado a través
   de una Supabase Edge Function y nunca recibe claves desde el navegador. */
(function(){
  'use strict';

  const VERSION='8.2.4';
  const MAX_ENTRIES=40;
  const MAX_ARCHIVES=12;
  const MAX_ACTION_HISTORY=40;
  const AI_FUNCTION_NAME='nv-ai-assistant';
  const ENGINE_TIMEOUT_MS=28000;
  const ENGINE_HEALTH_TTL=5*60*1000;
  let oldNavigate=null;
  let oldRender=null;
  let lastNonAiTab='inicio';
  let assistantContext={tab:'inicio',label:'Negocio general'};
  let pendingQuestion='';
  let pendingRequestId='';
  let lastQuestionAt=0;
  let answerTimer=null;
  let engineState={mode:'checking',configured:false,migrationReady:false,model:'gemini-2.5-flash-lite',checkedAt:0,usage:null,message:'Comprobando motor IA'};

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
    return `<svg class="nvAiBotSvg ${extraClass}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs><linearGradient id="nvAiBotGlow" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dff8e9"/><stop offset="1" stop-color="#aee7c9"/></linearGradient><linearGradient id="nvAiBotScreen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#064e34"/><stop offset="1" stop-color="#0b8555"/></linearGradient></defs>
      <circle cx="32" cy="32" r="30" fill="url(#nvAiBotGlow)"/>
      <path d="M32 10v7" stroke="#0a754b" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="8" r="3.5" fill="#d4ae45"/>
      <rect x="13" y="18" width="38" height="31" rx="13" fill="#fff" stroke="#0a754b" stroke-width="2.5"/>
      <rect x="18" y="24" width="28" height="17" rx="8.5" fill="url(#nvAiBotScreen)"/>
      <circle cx="26" cy="32" r="2.8" fill="#dfff76"/><circle cx="38" cy="32" r="2.8" fill="#dfff76"/>
      <path d="M27 37c3 2 7 2 10 0" fill="none" stroke="#bdf46b" stroke-width="2" stroke-linecap="round"/>
      <path d="M13 28H9v10h4M51 28h4v10h-4" fill="#d4ae45" stroke="#0a754b" stroke-width="2" stroke-linejoin="round"/>
      <path d="M23 50h18" stroke="#0a754b" stroke-width="3" stroke-linecap="round"/>
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
    return {sales:s.sales||[],historicalReceivables:s.historicalReceivables||[],clients:s.clients||[],products:s.products||[],expenses:s.expenses||[],payments:s.receivablePayments||[],settings:s.settings||{}};
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
  function productByQuestion(q){
    const products=dataset().products||[]; const nq=normalizedName(q);
    return products.map(p=>({p,score:normalizedName(p.name).split(/\s+/).filter(w=>w.length>2&&nq.includes(w)).length})).sort((a,b)=>b.score-a.score)[0]?.score?products.map(p=>({p,score:normalizedName(p.name).split(/\s+/).filter(w=>w.length>2&&nq.includes(w)).length})).sort((a,b)=>b.score-a.score)[0].p:null;
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
    productRows.forEach(x=>{ const p=productMap.get(normalizedName(x.name))||{}; x.stock=Number(p.stock||0); x.price=Number(p.price??p.retailPrice??0)||0; x.cost=Number(p.cost??p.baseCost??0)||0; });
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
      criticalStock:ss.critical.slice(0,12).map(p=>({name:clampText(p.name||'Producto',90),stock:Number(p.stock||0),price:Number(p.price??p.retailPrice??0)||0,cost:Number(p.cost??p.baseCost??0)||0})),
      customersForFollowUp:topClients,
      topReceivables:receivables,
      focusedAccount:(()=>{const a=focusedAccountContext();return a?{client:clampText(a.name||'Cliente',90),totalBought:Number(Number(a.totalBought||0).toFixed(2)),totalPaid:Number(Number(a.totalPaid||0).toFixed(2)),totalDebt:Number(Number(a.totalDebt||0).toFixed(2)),pendingOperations:Number(a.pendingCount||0),daysLate:Number(a.daysLate||0),oldestDebtDate:a.oldestDebtDate?new Date(Number(a.oldestDebtDate)).toISOString().slice(0,10):null,lastPaymentDate:a.lastPaymentDate?new Date(Number(a.lastPaymentDate)).toISOString().slice(0,10):null}:null;})(),
      alerts:recommendations().map(x=>({level:x.level,title:clampText(x.title,100),detail:clampText(x.detail,180)}))
    };
  }
  function conversationForEngine(){
    return readConversation().slice(-8).map(x=>x.role==='user'?{role:'user',text:clampText(x.text,600)}:{role:'assistant',text:clampText(`${x.response?.title||''}. ${String(x.response?.body||'').replace(/<[^>]*>/g,' ')}`,700)});
  }
  function normalizeEngineResponse(data){
    const a=data?.answer||{};
    const facts=(Array.isArray(a.facts)?a.facts:[]).slice(0,6).map(x=>clampText(x,220)).filter(Boolean);
    const rec=(Array.isArray(a.recommendations)?a.recommendations:[]).slice(0,5).map(x=>clampText(x,240)).filter(Boolean);
    const risks=(Array.isArray(a.risks)?a.risks:[]).slice(0,4).map(x=>clampText(x,220)).filter(Boolean);
    const next=(Array.isArray(a.next_questions)?a.next_questions:[]).slice(0,4).map(x=>clampText(x,150)).filter(Boolean);
    const tabMap={ventas:'historial',clientes:'clientes',inventario:'inventario',cobranzas:'por-cobrar','reglas-comerciales':'reglas-comerciales',territorio:'territorio',finanzas:'egresos'};
    const area=String(a.action_area||'none');
    const action=tabMap[area]?{label:`Abrir ${area.replace('-',' ')}`,tab:tabMap[area]}:null;
    const bodyParts=[safeHtml(a.summary||'Análisis completado con los datos disponibles.')];
    if(facts.length) bodyParts.push(`<span class="nvAiSectionLabel">Datos verificados</span>`);
    return {
      title:clampText(a.title||'Análisis inteligente',100),
      body:bodyParts.join('<br>'),
      list:[...facts.map(x=>`Dato: ${x}`),...rec.map(x=>`Sugerencia: ${x}`),...risks.map(x=>`Riesgo: ${x}`)],
      suggestions:next,
      action,
      confidence:['alta','media','baja'].includes(String(a.confidence))?String(a.confidence):'media',
      engine:'external',
      model:clampText(data?.model||engineState.model,60),
      usage:data?.usage||null,
      privacy:data?.privacy||{snapshotOnly:true}
    };
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
    return normalizeEngineResponse(result.data);
  }
  function updateEngineUI(){
    const badge=document.getElementById('nvAiEngineBadge');
    if(badge){ badge.className=`nvAiEngineBadge ${engineClass()}`; badge.innerHTML=`<i></i><span>${esc(engineLabel())}</span>`; badge.title=engineState.message||engineLabel(); }
    const usage=document.getElementById('nvAiUsage');
    if(usage){ const u=engineState.usage; usage.textContent=u&&Number.isFinite(Number(u.used))?`${u.used}/${u.limit} consultas hoy`:(engineState.mode==='external'?'Motor disponible':'Modo local seguro'); }
    document.querySelectorAll?.('.nvAiEngineMini').forEach(el=>{ el.className=`nvAiEngineMini ${engineClass()}`; el.textContent=engineLabel(); });
  }

  function discountSimulation(product,percent=5,qty=1){
    if(!product) return null; const price=Number(product.price??product.retailPrice??product.publicPrice??0)||0; const cost=Number(product.cost??product.baseCost??0)||0; const pct=Math.max(0,Math.min(100,Number(percent)||0)); const final=price*(1-pct/100); const profit=(final-cost)*qty; const margin=final?((final-cost)/final*100):0; const settings=dataset().settings||{}; const minMargin=Number(settings.minMargin??settings.minimumMargin??25)||25; return {price,cost,pct,final,profit,margin,minMargin,allowed:margin>=minMargin};
  }

  function readActionHistory(){
    try{const rows=JSON.parse(localStorage.getItem(actionHistoryKey())||'[]');return (Array.isArray(rows)?rows:[]).slice(-MAX_ACTION_HISTORY);}catch(_){return [];}
  }
  function saveActionHistory(rows){try{localStorage.setItem(actionHistoryKey(),JSON.stringify((rows||[]).slice(-MAX_ACTION_HISTORY)));}catch(_){}}
  function recordAction(action,status='confirmed',detail=''){
    const rows=readActionHistory();rows.push({id:uid(),type:action.type,label:action.label||action.type,status,detail:clampText(detail,240),clientId:action.clientId||'',clientName:action.clientName||'',at:Date.now()});saveActionHistory(rows);updateActionCount();
  }
  function updateActionCount(){const el=document.getElementById('nvAiActionCount');if(el)el.textContent=String(readActionHistory().filter(x=>x.status==='confirmed').length);}
  function normalizedPhoneForWa(phone){let digits=String(phone||'').replace(/\D/g,'');if(!digits)return'';if(digits.startsWith('00'))digits=digits.slice(2);if(digits.length===8)digits='591'+digits;if(digits.startsWith('0')&&digits.length===9)digits='591'+digits.slice(1);return digits;}
  function clientMessage(kind,client,account){
    const name=client?.name||client?.businessName||account?.name||'cliente';
    if(kind==='collection') return `Buenas tardes, ${name}. Le escribimos de Natura Vida Bolivia para compartirle el estado actualizado de su cuenta. El saldo pendiente registrado es ${money(account?.totalDebt||0)}. Podemos coordinar el pago o revisar el detalle de sus operaciones. Gracias por su atención.`;
    return `Buenas tardes, ${name}. Esperamos que se encuentre muy bien. Queríamos consultar si necesita reponer sus productos Natura Vida. Podemos prepararle una cotización y coordinar la entrega.`;
  }
  function buildActionProposals(question,response={}){
    const q=normalizedName(question);const account=focusedAccountContext();const client=focusedClientRecord();const actions=[];
    const add=a=>{if(a&&!actions.some(x=>x.type===a.type&&String(x.clientId||'')===String(a.clientId||'')))actions.push(a);};
    if(account?.clientId){
      if(Number(account.totalDebt||0)>.009||/deuda|cobran|pago|estado de cuenta/.test(q)){
        add({type:'prepare_collection_message',label:'Preparar mensaje de cobro',clientId:account.clientId,clientName:account.name,summary:`Revisar y preparar un mensaje por ${money(account.totalDebt||0)}.`});
        add({type:'generate_collection_document',label:'Generar recibo consolidado',clientId:account.clientId,clientName:account.name,summary:'Genera el documento de cobro después de tu confirmación.'});
        add({type:'register_payment',label:'Registrar un pago',clientId:account.clientId,clientName:account.name,summary:'Abre el formulario de pago sin registrar nada automáticamente.'});
      }
      add({type:'create_quote',label:'Preparar cotización',clientId:account.clientId,clientName:account.name,summary:'Abre una cotización prellenada para revisión.'});
    }else if(client?.id){
      add({type:'prepare_followup_message',label:'Preparar seguimiento',clientId:client.id,clientName:client.name||client.businessName,summary:'Redacta un mensaje que podrás revisar antes de abrir WhatsApp.'});
      add({type:'create_quote',label:'Preparar cotización',clientId:client.id,clientName:client.name||client.businessName,summary:'Abre una cotización prellenada para revisión.'});
    }
    if(response.action?.tab)add({type:'open_tab',label:response.action.label||'Abrir módulo',tab:response.action.tab,summary:'Solo cambia de pantalla; no modifica datos.'});
    if(/inventario|stock/.test(q))add({type:'open_tab',label:'Abrir inventario',tab:'inventario',summary:'Revisar existencias y movimientos.'});
    if(/cliente|seguimiento|inactiv/.test(q)&&!client)add({type:'open_tab',label:'Abrir clientes',tab:'clientes',summary:'Revisar la cartera comercial.'});
    if(/deuda|cobran|vencid/.test(q)&&!account)add({type:'open_tab',label:'Abrir cuentas por cobrar',tab:'por-cobrar',summary:'Revisar saldos y estados de cuenta.'});
    if(/descuento|margen|promoci/.test(q))add({type:'open_tab',label:'Abrir reglas comerciales',tab:'reglas-comerciales',summary:'Simular y revisar márgenes antes de autorizar.'});
    return actions.slice(0,4);
  }
  function enrichResponse(response,question){const r=response||{};r.proposals=buildActionProposals(question,r);return r;}
  async function auditAssistantAction(action,status){
    try{if(window.writeAudit)await writeAudit('ai_action_'+status,'assistant',action.clientId||action.tab||action.type,null,{type:action.type,label:action.label,clientId:action.clientId||null,clientName:action.clientName||null});}catch(_){ }
  }
  function closeActionSheet(){document.getElementById('nvAiActionOverlay')?.remove();}
  function showActionHistory(){
    closeActionSheet();const rows=readActionHistory().slice().reverse();
    document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiActionOverlay"><section class="nvAiSheet nvAiActionSheet" role="dialog" aria-modal="true"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiActionClose" type="button">×</button><div class="nvAiActionSheetHead"><div class="nvAiAvatar">${botSvg()}</div><div><h2>Acciones confirmadas</h2><p>Historial local de propuestas revisadas por el administrador.</p></div></div><div class="nvAiActionHistory">${rows.length?rows.map(x=>`<article><strong>${esc(x.label||x.type)}</strong><small>${esc(x.clientName||x.detail||'Acción del asistente')}</small><time>${new Date(Number(x.at)||Date.now()).toLocaleString('es-BO')}</time></article>`).join(''):'<p>Sin acciones confirmadas todavía.</p>'}</div></section></div>`);
    document.getElementById('nvAiActionClose').onclick=closeActionSheet;document.getElementById('nvAiActionOverlay').onclick=e=>{if(e.target.id==='nvAiActionOverlay')closeActionSheet();};
  }
  function openMessageReview(action){
    const client=(window.AppState?.clients||[]).find(c=>String(c.id)===String(action.clientId))||{};const account=focusedAccountContext();const kind=action.type==='prepare_collection_message'?'collection':'followup';const message=clientMessage(kind,client,account);
    closeActionSheet();document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiActionOverlay"><section class="nvAiSheet nvAiActionSheet" role="dialog" aria-modal="true"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiActionClose" type="button">×</button><div class="nvAiActionSheetHead"><div class="nvAiAvatar">${botSvg()}</div><div><h2>${esc(action.label)}</h2><p>Revisa el texto. El asistente no lo envía automáticamente.</p></div></div><label class="nvAiMessageDraft"><span>Mensaje</span><textarea id="nvAiDraftText" rows="7">${esc(message)}</textarea></label><div class="nvAiActionButtons"><button class="btn outline" id="nvAiCopyDraft" type="button">Copiar</button><button class="btn" id="nvAiOpenWhatsapp" type="button">Abrir WhatsApp</button></div></section></div>`);
    const close=closeActionSheet;document.getElementById('nvAiActionClose').onclick=close;document.getElementById('nvAiActionOverlay').onclick=e=>{if(e.target.id==='nvAiActionOverlay')close();};
    document.getElementById('nvAiCopyDraft').onclick=async()=>{const text=document.getElementById('nvAiDraftText').value;try{await navigator.clipboard.writeText(text);window.showToast?.('Mensaje copiado.');}catch(_){document.getElementById('nvAiDraftText').select();window.showToast?.('Selecciona y copia el mensaje.');}recordAction(action,'confirmed','Mensaje preparado y copiado');await auditAssistantAction(action,'confirmed');};
    document.getElementById('nvAiOpenWhatsapp').onclick=async()=>{const text=document.getElementById('nvAiDraftText').value;const phone=normalizedPhoneForWa(client.phone||client.whatsapp||account?.phone||'');if(!phone){window.showToast?.('Este cliente no tiene un número de WhatsApp registrado.','error');document.getElementById('nvAiDraftText')?.focus();return;}recordAction(action,'confirmed','Mensaje preparado para WhatsApp');await auditAssistantAction(action,'confirmed');window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank','noopener');};
  }
  function openActionReview(action){
    if(!action||!action.type)return;if(action.type==='prepare_collection_message'||action.type==='prepare_followup_message')return openMessageReview(action);
    closeActionSheet();document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiActionOverlay"><section class="nvAiSheet nvAiActionSheet" role="dialog" aria-modal="true"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiActionClose" type="button">×</button><div class="nvAiActionSheetHead"><div class="nvAiAvatar">${botSvg()}</div><div><h2>Revisar acción</h2><p>Nada se ejecuta hasta que confirmes.</p></div></div><div class="nvAiActionReview"><strong>${esc(action.label||'Acción propuesta')}</strong><p>${esc(action.summary||'La aplicación abrirá el flujo correspondiente para tu revisión.')}</p>${action.clientName?`<small>Cliente: ${esc(action.clientName)}</small>`:''}</div><div class="nvAiActionButtons"><button class="btn outline" id="nvAiCancelAction" type="button">Cancelar</button><button class="btn" id="nvAiConfirmAction" type="button">Confirmar</button></div></section></div>`);
    const close=closeActionSheet;document.getElementById('nvAiActionClose').onclick=close;document.getElementById('nvAiCancelAction').onclick=close;document.getElementById('nvAiActionOverlay').onclick=e=>{if(e.target.id==='nvAiActionOverlay')close();};
    document.getElementById('nvAiConfirmAction').onclick=async()=>{const button=document.getElementById('nvAiConfirmAction');button.disabled=true;button.textContent='Abriendo…';recordAction(action,'confirmed',action.summary||'Acción confirmada');await auditAssistantAction(action,'confirmed');close();
      if(action.type==='open_tab')return window.navigateTo?.(action.tab||'inicio');
      if(action.type==='generate_collection_document'&&window.requestClientDocumentV820)return requestClientDocumentV820(action.clientId,'COB');
      if(action.type==='register_payment'&&window.openPaymentFormV820)return openPaymentFormV820(action.clientId);
      if(action.type==='create_quote'&&window.openQuoteForm){const client=(window.AppState?.clients||[]).find(c=>String(c.id)===String(action.clientId));if(client)return openQuoteForm({client,priceGroupId:client.priceGroupId||''});}
      window.showToast?.('La acción quedó preparada, pero el módulo no está disponible en esta sesión.','error');
    };
  }
  function answerLocal(question){
    const q=String(question||'').toLowerCase();
    const st=salesStats(q.includes('hoy')?1:q.includes('semana')?7:30), cs=clientStats(), ss=stockStats(), rs=receivableStats();
    const focused=focusedAccountContext();
    if(focused&&/analiza|resumen|cliente|cuenta|deuda|cobran|qué debo|que debo|prioridad/.test(q)) return {title:`Estado de cuenta de ${focused.name||'cliente'}`,body:`El cliente registra una deuda de <b>${money(focused.totalDebt||0)}</b> en ${Number(focused.pendingCount||0)} operación(es). Ha pagado ${money(focused.totalPaid||0)} de un total comprado de ${money(focused.totalBought||0)}.`,cards:[['Deuda',money(focused.totalDebt||0)],['Pagado',money(focused.totalPaid||0)],['Operaciones',Number(focused.pendingCount||0)],['Atraso',`${Number(focused.daysLate||0)} días`]],list:[focused.oldestDebtDate?`Deuda más antigua: ${new Date(Number(focused.oldestDebtDate)).toLocaleDateString('es-BO')}`:'No hay fecha de deuda antigua registrada.',focused.lastPaymentDate?`Último pago: ${new Date(Number(focused.lastPaymentDate)).toLocaleDateString('es-BO')}`:'No existe un pago posterior registrado.','Revisa el detalle antes de contactar al cliente y conserva cada operación por separado.'],suggestions:['Prepara un mensaje de cobro','Genera el recibo consolidado','¿Qué riesgo tiene esta cuenta?']};
    if (/resumen|panorama|cómo va|como va/.test(q)) return {title:'Resumen ejecutivo',body:`En el periodo analizado hay <b>${st.rows.length} ventas</b> por ${money(st.revenue)}, utilidad estimada de ${money(st.profit)} y margen de ${st.margin.toFixed(1)}%.`,cards:[['Ventas',st.rows.length],['Ingresos',money(st.revenue)],['Por cobrar',money(rs.total)],['Alertas',recommendations().length]],list:recommendations().slice(0,4).map(x=>`${x.title}: ${x.detail}`),suggestions:['¿Qué debo atender primero?','¿Qué clientes requieren seguimiento?','¿Tengo stock crítico?']};
    if (/venta|vendimos|factur/.test(q)) return {title:'Análisis de ventas',body:`Se registraron <b>${st.rows.length} operaciones</b> por ${money(st.revenue)}. La utilidad estimada es ${money(st.profit)} y el margen promedio ${st.margin.toFixed(1)}%.`,cards:[['Operaciones',st.rows.length],['Ingresos',money(st.revenue)],['Utilidad',money(st.profit)],['Margen',st.margin.toFixed(1)+'%']],suggestions:['Comparar productos','¿Qué producto deja más utilidad?','¿Cómo está mi margen?']};
    if (/utilidad|margen|producto.*mejor|más rentable/.test(q)) { const top=st.byProduct.slice(0,5); return {title:'Productos con mayor utilidad estimada',body:top.length?'Cálculo basado en ventas y costos registrados.':'No hay ventas suficientes en el periodo.',table:top.map(x=>[x.name,x.qty,money(x.revenue-x.cost),x.revenue?(((x.revenue-x.cost)/x.revenue)*100).toFixed(1)+'%':'0%']),suggestions:['¿Qué producto debería impulsar?','Simular descuento del 5%']}; }
    if (/stock|inventario|agot/.test(q)) return {title:'Estado de inventario',body:`Hay <b>${ss.critical.length} productos</b> en nivel crítico y ${ss.negative.length} con stock negativo.`,list:ss.critical.slice(0,8).map(p=>`${p.name||'Producto'}: ${Number(p.stock||0)} unidad(es)`),action:{label:'Abrir inventario',tab:'inventario'}};
    if (/cliente|seguimiento|inactiv/.test(q)) return {title:'Seguimiento de clientes',body:`Se identificaron <b>${cs.inactive.length} clientes</b> sin movimiento en los últimos 30 días y ${cs.incomplete.length} fichas incompletas.`,list:cs.inactive.slice(0,8).map(c=>`${c.name||c.businessName||'Cliente sin nombre'} · ${c.phone||c.whatsapp||'sin teléfono'}`),action:{label:'Abrir clientes',tab:'clientes'},suggestions:['Preparar mensaje de seguimiento','¿Cuántas fichas están incompletas?']};
    if (/cobran|deuda|vencid|por cobrar/.test(q)) return {title:'Cobranzas',body:`El saldo pendiente estimado es ${money(rs.total)} en ${rs.open.length} cuenta(s). ${rs.overdue.length} están vencidas.`,cards:[['Pendientes',rs.open.length],['Saldo',money(rs.total)],['Vencidas',rs.overdue.length]],list:rs.overdue.slice(0,6).map(x=>`${x.clientName||x.customerName||'Cliente'}: ${money(x.balance)}`),action:{label:'Abrir cuentas por cobrar',tab:'por-cobrar'}};
    if (/qué debo|prioridad|alerta|recomienda|recomendación/.test(q)) { const rec=recommendations(); return {title:'Prioridades recomendadas',body:rec.length?'Estas recomendaciones se basan en datos y reglas locales verificables.':'No detecté alertas relevantes con los datos disponibles.',list:rec.map(x=>`${x.title} — ${x.detail}`),suggestions:rec.slice(0,3).map(x=>x.question)}; }
    if (/mensaje|whatsapp/.test(q)) return {title:'Mensaje sugerido',body:'Buenas tardes. Esperamos que se encuentre muy bien. Queríamos consultar si necesita reponer sus productos Natura Vida. Podemos prepararle su pedido y coordinar la entrega. <br><br><small>Revisa y personaliza el texto antes de enviarlo.</small>'};
    if (/descuento|promoci/.test(q)) { const product=productByQuestion(q); const pm=q.match(/(\d+(?:[.,]\d+)?)\s*%/); const pct=pm?Number(pm[1].replace(',','.')):5; const sim=discountSimulation(product,pct,1); if(sim) return {title:`Simulación: ${product.name||'Producto'}`,body:`Con ${sim.pct}% de descuento, el precio sería ${money(sim.final)}, la utilidad por unidad ${money(sim.final-sim.cost)} y el margen ${sim.margin.toFixed(1)}%. ${sim.allowed?'<b>Está dentro del margen mínimo.</b>':'<b>No cumple el margen mínimo configurado.</b>'}`,cards:[['Precio actual',money(sim.price)],['Precio final',money(sim.final)],['Margen',sim.margin.toFixed(1)+'%'],['Resultado',sim.allowed?'Permitido':'No recomendado']],action:{label:'Abrir reglas comerciales',tab:'reglas-comerciales'}}; return {title:'Simulación comercial segura',body:'Indica el nombre del producto y el porcentaje. Ejemplo: “Simula 5% de descuento para Aceite de Coco 500 ml”.',action:{label:'Abrir reglas comerciales',tab:'reglas-comerciales'}}; }
    return {title:'Asistente comercial analítico',body:'Puedo analizar ventas, utilidad, margen, inventario, cobranzas, clientes inactivos, prioridades y descuentos. Los cálculos son locales y verificables; Ninguna acción se ejecuta automáticamente.',suggestions:['Dame un resumen','¿Qué debo atender primero?','¿Qué productos dejan mayor utilidad?','¿Qué cuentas están vencidas?']};
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
    archiveCurrentConversationV824(); clearConversation(); pendingQuestion=''; pendingRequestId=''; renderConversation(false); setDashboardCollapsedV824(false);
  }
  function restoreArchiveV824(id){
    const archive=readArchivesV824().find(x=>x.id===id); if(!archive) return;
    archiveCurrentConversationV824(); writeConversation(archive.entries||[]); document.getElementById('nvAiHistoryOverlay')?.remove(); renderConversation(false); setTimeout(()=>scrollLatestV824(true),60);
  }
  function deleteArchiveV824(id){ saveArchivesV824(readArchivesV824().filter(x=>x.id!==id)); showConversationHistoryV824(); }
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

  function renderResponse(r,entry={}){
    const source=r.engine==='external'?`<span class="nvAiAnswerSource external">IA · ${esc(r.model||'Gemini')}</span>`:r.engine==='local-fallback'?'<span class="nvAiAnswerSource fallback">Respaldo local</span>':'<span class="nvAiAnswerSource local">Cálculo local</span>';
    const confidence=r.confidence?`<span class="nvAiConfidence">Confianza ${esc(r.confidence)}</span>`:'';
    return `<article class="nvAiMessage assistant" data-request-id="${esc(entry.requestId||'')}"><div class="nvAiBotMini">${botSvg('mini')}</div><div class="nvAiBubble"><div class="nvAiAnswerHead"><strong>${esc(r.title)}</strong><span>${source}${confidence}</span></div><p>${r.body||''}</p>${r.cards?`<div class="nvAiMetrics">${r.cards.map(x=>`<div><small>${esc(x[0])}</small><b>${esc(x[1])}</b></div>`).join('')}</div>`:''}${r.table?`<div class="nvAiTable"><div class="head"><span>Producto</span><span>Unid.</span><span>Utilidad</span><span>Margen</span></div>${r.table.map(row=>`<div>${row.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`).join('')}</div>`:''}${r.list?.length?`<ul>${r.list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${r.diagnostic?`<div class="nvAiDiagnosticV824"><strong>Diagnóstico del motor</strong><br>${esc(r.diagnostic)}</div>`:''}${r.proposals?.length?`<div class="nvAiActionPanel"><span>Acciones con confirmación</span><div class="nvAiActionGrid">${r.proposals.map(a=>`<button type="button" data-ai-action="${esc(encodeURIComponent(JSON.stringify(a)))}"><b>${esc(a.label)}</b><small>${esc(a.summary||'Revisar antes de continuar')}</small></button>`).join('')}</div></div>`:''}${r.action&&!r.proposals?.some(a=>a.type==='open_tab'&&a.tab===r.action.tab)?`<button class="nvAiInlineAction" type="button" data-ai-tab="${esc(r.action.tab)}">${esc(r.action.label)}</button>`:''}${r.suggestions?.length?`<div class="nvAiSuggestions">${r.suggestions.map(x=>`<button type="button" data-ai-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`:''}</div></article>`;
  }
  function renderEntry(entry){
    if(entry.role==='user') return `<article class="nvAiMessage user" data-ai-entry="${esc(entry.id)}" data-request-id="${esc(entry.requestId||'')}"><div class="nvAiBubble">${esc(entry.text)}</div></article>`;
    return renderResponse(entry.response||{title:'Respuesta',body:'Sin contenido.'},entry);
  }
  function welcomeHtml(){
    const name=String(window.AppState?.session?.fullName||window.AppState?.session?.username||'Cristhian').split(' ')[0];
    return `<article class="nvAiMessage assistant nvAiWelcome"><div class="nvAiBotMini">${botSvg('mini')}</div><div class="nvAiBubble"><strong>Hola, ${esc(name)}</strong><p>Puedo ayudarte a interpretar ventas, márgenes, inventario y clientes. Las respuestas permanecerán guardadas en esta conversación aunque la pantalla se actualice.</p><div class="nvAiSuggestions">${['¿Cómo van las ventas hoy?','¿Qué productos dejan mayor utilidad?','¿Qué clientes requieren seguimiento?','¿Tengo stock crítico?'].map(x=>`<button type="button" data-ai-q="${esc(x)}">${esc(x)}</button>`).join('')}</div></div></article>`;
  }
  function thinkingHtml(){
    return `<article class="nvAiMessage assistant nvAiThinking"><div class="nvAiBotMini">${botSvg('mini')}</div><div class="nvAiBubble"><span class="nvAiTyping"><i></i><i></i><i></i></span><small>${engineState.mode==='external'?'Consultando motor IA y verificando datos…':'Calculando con los datos locales…'}</small></div></article>`;
  }
  function bindInline(root=document){
    root.querySelectorAll?.('[data-ai-tab]').forEach(b=>{ b.onclick=()=>window.navigateTo(b.dataset.aiTab); });
    root.querySelectorAll?.('[data-ai-q]').forEach(b=>{ b.onclick=()=>ask(b.dataset.aiQ); });
    root.querySelectorAll?.('[data-ai-action]').forEach(b=>{ b.onclick=()=>{try{openActionReview(JSON.parse(decodeURIComponent(b.dataset.aiAction)));}catch(_){window.showToast?.('No se pudo abrir la acción propuesta.','error');}}; });
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

  async function ask(question){
    const input=document.getElementById('nvAiInput');
    const q=String(question||input?.value||'').trim();
    const now=Date.now();
    if(!q||pendingQuestion) return;
    const last=readConversation().slice(-1)[0];
    if(last?.role==='user'&&normalizedName(last.text)===normalizedName(q)&&now-last.at<2500) return;
    if(now-lastQuestionAt<450) return;
    lastQuestionAt=now;
    if(input) input.value='';
    clearComposerDraft();
    const requestId=uid();
    addEntry({role:'user',text:q,requestId,at:now});
    pendingQuestion=q; pendingRequestId=requestId;
    renderConversation(true);
    clearTimeout(answerTimer);
    try{
      let response;
      if(navigator.onLine){
        try { response=await answerWithEngine(q); }
        catch(error){
          response=answerLocal(q);
          response.engine='local-fallback';
          response.diagnostic=clampText(error.message||'Motor externo no disponible',220);
          response.body=`${response.body||''}<br><small>Se utilizó el cálculo local para conservar la consulta. Puedes revisar el diagnóstico o volver a intentar después de actualizar la función externa.</small>`;
          engineState={...engineState,mode:'local-fallback',message:response.diagnostic,checkedAt:Date.now()};
          updateEngineUI();
        }
      } else {
        response=answerLocal(q); response.engine='local';
      }
      response=enrichResponse(response,q);
      addEntry({role:'assistant',response,requestId,at:Date.now()});
    }catch(error){
      addEntry({role:'assistant',requestId,response:{title:'No pude completar el análisis',body:'Ocurrió un problema al leer los datos actuales. Puedes volver a intentarlo sin perder la conversación.',diagnostic:clampText(error.message||'',180),engine:'local'},at:Date.now()});
    }finally{
      pendingQuestion=''; pendingRequestId='';
      if(String(window.AppState?.currentTab)==='asistente-ia') renderConversation(true);
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
    const values={nvAiStatSales:money(st.revenue),nvAiStatProfit:money(st.profit),nvAiStatStock:ss.critical.length,nvAiStatFollow:cs.inactive.length};
    Object.entries(values).forEach(([id,value])=>{ const el=document.getElementById(id); if(el) el.textContent=String(value); });
  }
  function renderRecommendations(){
    const box=document.getElementById('nvAiRecommendations'); if(!box) return;
    const rec=recommendations(); box.innerHTML=rec.length?rec.map(x=>`<button type="button" class="${esc(x.level)}" data-ai-q="${esc(x.question)}"><span></span><div><strong>${esc(x.title)}</strong><small>${esc(x.detail)}</small></div><b>›</b></button>`).join(''):'<p class="nvAiNoRec">Sin alertas prioritarias con los datos actuales.</p>'; bindInline(box);
    const topics=document.getElementById('nvAiTopicTabs'); if(topics){ topics.innerHTML=['Resumen','Ventas','Clientes','Inventario','Cobranzas','Descuentos'].map(x=>`<button type="button" data-ai-q="${x==='Resumen'?'Dame un resumen':x==='Ventas'?'Analiza las ventas':x==='Clientes'?'¿Qué clientes requieren seguimiento?':x==='Inventario'?'¿Tengo stock crítico?':x==='Cobranzas'?'¿Qué cuentas están vencidas?':'Simular descuento del 5%'}">${x}</button>`).join(''); bindInline(topics); }
  }
  function buildAssistantPage(){
    const {st,cs,ss}=statsSnapshot();
    const main=document.getElementById('mainArea');
    main.innerHTML=`<section class="nvAiPage">
      <header class="nvAiHead"><button id="nvAiBack" type="button" aria-label="Volver">‹</button><div class="nvAiAvatar">${botSvg()}</div><div><h1>Asistente IA <span>ORGANIZADO</span></h1><p>Exclusivo del administrador central</p></div><div class="nvAiHeadActionsV824"><button id="nvAiNewV824" type="button">＋ Nueva</button><button id="nvAiHistoryV824" type="button">Historial</button></div></header><div class="nvAiEngineBar"><button type="button" id="nvAiEngineBadge" class="nvAiEngineBadge ${engineClass()}"><i></i><span>${esc(engineLabel())}</span></button><small id="nvAiUsage">${engineState.usage?`${engineState.usage.used}/${engineState.usage.limit} consultas hoy`:'Modo local seguro'}</small><button type="button" id="nvAiOpenActions">Acciones <b id="nvAiActionCount">${readActionHistory().filter(x=>x.status==='confirmed').length}</b></button><button type="button" id="nvAiCheckEngine">Comprobar</button></div>
      <div class="nvAiContext"><span>Analizando</span><strong id="nvAiContextLabel">${esc(assistantContext.label)}</strong><small>Resumen empresarial sin teléfonos, direcciones ni correos · conversación guardada en este dispositivo</small></div>
      <section class="nvAiDashboardV824 ${dashboardCollapsedV824()?'collapsed':''}" id="nvAiDashboardV824"><button type="button" class="nvAiDashboardToggleV824" id="nvAiDashboardToggleV824"><span>Panel gerencial <small id="nvAiDashboardStateV824">${dashboardCollapsedV824()?'Mostrar':'Ocultar'}</small></span><b id="nvAiDashboardArrowV824">${dashboardCollapsedV824()?'⌄':'⌃'}</b></button><div class="nvAiDashboardBodyV824"><div class="nvAiQuickStats"><div><small>Ventas 30 días</small><b id="nvAiStatSales">${money(st.revenue)}</b></div><div><small>Utilidad estimada</small><b id="nvAiStatProfit">${money(st.profit)}</b></div><div><small>Stock crítico</small><b id="nvAiStatStock">${ss.critical.length}</b></div><div><small>Seguimientos</small><b id="nvAiStatFollow">${cs.inactive.length}</b></div></div><section class="nvAiRecPanel"><div class="nvAiRecHead"><strong>Recomendaciones de hoy</strong><button id="nvAiRefreshRec" type="button">Actualizar</button></div><div id="nvAiRecommendations" class="nvAiRecommendations"></div></section><div class="nvAiTopicTabs" id="nvAiTopicTabs"></div></div></section><div class="nvAiFeed" id="nvAiFeed" aria-live="polite"></div><button type="button" class="nvAiJumpLatestV824" id="nvAiJumpLatestV824" aria-label="Ir al mensaje más reciente">↓</button>
      <div class="nvAiComposer"><textarea id="nvAiInput" rows="1" placeholder="Escribe tu consulta…" aria-label="Consulta para el asistente" data-nv-no-dirty="true"></textarea><button id="nvAiSend" type="button" aria-label="Enviar">➤</button></div>
      <p class="nvAiDisclaimer">Motor híbrido: cálculos verificables + interpretación IA cuando esté conectada. Ninguna acción se ejecuta sin confirmación.</p>
    </section>`;
    document.getElementById('nvAiBack').onclick=()=>window.navigateTo(lastNonAiTab||'inicio');
    document.getElementById('nvAiNewV824').onclick=()=>{ if(!window.confirm||window.confirm('¿Iniciar una conversación nueva? La actual quedará guardada en Historial.')) startNewConversationV824(); };
    document.getElementById('nvAiHistoryV824').onclick=showConversationHistoryV824;
    document.getElementById('nvAiDashboardToggleV824').onclick=()=>setDashboardCollapsedV824(!document.getElementById('nvAiDashboardV824').classList.contains('collapsed'));
    document.getElementById('nvAiJumpLatestV824').onclick=()=>scrollLatestV824(true);
    document.getElementById('nvAiSend').onclick=()=>ask();
    document.getElementById('nvAiRefreshRec').onclick=renderRecommendations;
    document.getElementById('nvAiOpenActions').onclick=showActionHistory;
    document.getElementById('nvAiCheckEngine').onclick=async()=>{ await checkEngine(true); if(window.showToast) showToast(engineState.message||engineLabel()); };
    document.getElementById('nvAiEngineBadge').onclick=()=>document.getElementById('nvAiCheckEngine')?.click();
    const aiInput=document.getElementById('nvAiInput');
    aiInput.value=readComposerDraft();
    aiInput.addEventListener('input',()=>saveComposerDraft(aiInput.value));
    aiInput.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); ask(); } });
    window.removeEventListener('scroll',updateJumpV824); window.addEventListener('scroll',updateJumpV824,{passive:true});
    renderRecommendations();
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
    document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiOverlay"><section class="nvAiSheet" role="dialog" aria-modal="true" aria-labelledby="nvAiSheetTitle"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiClose" type="button" aria-label="Cerrar">×</button><div class="nvAiSheetIntro"><div class="nvAiAvatar">${botSvg()}</div><div><h2 id="nvAiSheetTitle">Asistente Natura</h2><p>${hasHistory?'Tu conversación está guardada.':'¿En qué puedo ayudarte?'}</p></div></div><div class="nvAiSheetContext"><span>Contexto: <b>${esc(ctx.label)}</b></span><em class="nvAiEngineMini ${engineClass()}">${esc(engineLabel())}</em></div><div class="nvAiSheetActions">${[['Resumen de hoy','¿Cómo van las ventas hoy?'],['Analizar ventas','¿Qué productos dejan mayor utilidad?'],['Revisar clientes','¿Qué clientes requieren seguimiento?']].map(x=>`<button type="button" data-sheet-q="${esc(x[1])}">${esc(x[0])}</button>`).join('')}<button class="primary" id="nvAiOpenFull" type="button">${hasHistory?'Continuar conversación':'Abrir asistente completo'}</button></div></section></div>`);
    document.getElementById('nvAiClose').onclick=closeSheet;
    document.getElementById('nvAiOverlay').onclick=e=>{ if(e.target.id==='nvAiOverlay') closeSheet(); };
    document.getElementById('nvAiOpenFull').onclick=()=>openFull();
    document.querySelectorAll('[data-sheet-q]').forEach(b=>{ b.onclick=()=>openFull(b.dataset.sheetQ); });
  }

  function ensureFab(){
    let fab=document.getElementById('nvAiFab');
    const tab=String(window.AppState?.currentTab||'');
    const blocked=!adminAllowed() || ['asistente-ia','estado-cuenta'].includes(tab) || document.querySelector('.loginShell') || document.querySelector('.nvAiOverlay');
    if(blocked){ fab?.remove(); return; }
    if(!fab){
      fab=document.createElement('button');
      fab.id='nvAiFab'; fab.className='nvAiFab'; fab.type='button';
      fab.innerHTML=`${botSvg('fab')}<b>IA</b>`;
      fab.setAttribute('aria-label','Abrir Asistente IA');
      fab.onclick=openSheet;
      document.body.appendChild(fab);
    }
  }

  function openForContext(context={},question=''){
    const ctx={...currentContext(),...context};assistantContext=ctx;lastNonAiTab=ctx.tab==='asistente-ia'?'inicio':ctx.tab;closeSheet();window.navigateTo?.('asistente-ia');if(question)setTimeout(()=>ask(question),100);
  }

  function install(){
    if(window.__NV_AI_V824_INSTALLED) return;
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
      if(String(window.AppState?.currentTab)==='asistente-ia') lastNonAiTab=tab||'inicio';
      return oldNavigate(tab);
    };
    window.render=function(){
      if(String(window.AppState?.currentTab)==='asistente-ia') renderAssistant();
      else oldRender();
      setTimeout(ensureFab,0);
    };
    const main=document.getElementById('mainArea');
    if(main){
      const observer=new MutationObserver(()=>setTimeout(ensureFab,0));
      observer.observe(main,{childList:true,subtree:false});
    }
    setTimeout(ensureFab,250);
    setTimeout(()=>checkEngine(false).catch(()=>{}),700);
    window.renderAIAssistantV824=renderAssistant;
    window.renderAIAssistantV822=renderAssistant;
    window.renderAIAssistantV821=renderAssistant;
    window.renderAIAssistantV812=renderAssistant;
    window.renderAIAssistantV810=renderAssistant;
    window.openAIAssistantSheetV824=openSheet;
    window.openAIAssistantSheetV822=openSheet;
    window.openAIAssistantSheetV821=openSheet;
    window.openAIAssistantSheetV812=openSheet;
    window.openAIAssistantSheetV810=openSheet;
  }

  window.__nvAiV824={VERSION,readConversation,writeConversation,addEntry,clearConversation,readArchivesV824,archiveCurrentConversationV824,startNewConversationV824,dedupeEntriesV824,readActionHistory,answerLocal,businessSnapshot,recommendations,discountSimulation,checkEngine,answerWithEngine,renderAssistant,openSheet,openForContext,openActionReview,ask,botSvg,get engineState(){return {...engineState};}};
  window.__nvAiV822=window.__nvAiV824;
  window.__nvAiV821=window.__nvAiV824;
  window.__nvAiV812=window.__nvAiV824;
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));
  else setTimeout(install,0);
})();
