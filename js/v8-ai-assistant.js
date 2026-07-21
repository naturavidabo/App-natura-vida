/* Natura Vida V8.1.2 — Asistente comercial analítico.
   Acceso exclusivo para administrador central, conversación persistente,
   panel rápido y pantalla propia dentro de la aplicación.
   El motor externo continúa desactivado: los análisis son locales y verificables. */
(function(){
  'use strict';

  const VERSION='8.1.2';
  const MAX_ENTRIES=60;
  let oldNavigate=null;
  let oldRender=null;
  let lastNonAiTab='inicio';
  let assistantContext={tab:'inicio',label:'Negocio general'};
  let pendingQuestion='';
  let answerTimer=null;

  function adminAllowed(){
    try { return !!(window.requireAuth && requireAuth() && window.isAdmin && isAdmin()); }
    catch(_) { return false; }
  }
  function userKey(){
    const s=window.AppState?.session||{};
    return String(s.onlineUserId||s.userId||s.email||'central-admin').replace(/[^a-zA-Z0-9_-]/g,'_');
  }
  function historyKey(){ return `nv_ai_conversation_v812_${userKey()}`; }
  function esc(v){
    return window.escapeHtml ? escapeHtml(String(v??'')) : String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function money(v){ return window.fmtMoney ? fmtMoney(Number(v)||0) : `Bs ${(Number(v)||0).toFixed(2)}`; }
  function uid(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }
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
    const map={inicio:'Negocio general',vender:'Venta actual',clientes:'Clientes',inventario:'Inventario',territorio:'Territorio','por-cobrar':'Cobranzas','reglas-comerciales':'Reglas comerciales',produccion:'Producción',egresos:'Finanzas',historial:'Historial de ventas','centro-comercial':'Centro comercial'};
    return {tab,label:map[tab]||'Negocio general'};
  }
  function dataset(){
    const s=window.AppState||{};
    return {sales:s.sales||[],clients:s.clients||[],products:s.products||[],expenses:s.expenses||[],payments:s.receivablePayments||[],settings:s.settings||{}};
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
    const {sales,payments}=dataset();
    const paidBySale=new Map();
    (payments||[]).forEach(x=>paidBySale.set(String(x.saleId||x.receivableId||''),(paidBySale.get(String(x.saleId||x.receivableId||''))||0)+(Number(x.amount)||0)));
    const open=[];
    (sales||[]).forEach(x=>{ const total=Number(x.total)||0; const direct=Number(x.paidAmount||x.amountPaid)||0; const paid=Math.max(direct,paidBySale.get(String(x.id||''))||0); const balance=Math.max(0,total-paid); if(balance>.009 && (x.paymentType==='credit'||x.status==='pending'||paid>0)) open.push({...x,balance}); });
    return {open,total:open.reduce((a,x)=>a+x.balance,0),overdue:open.filter(x=>x.dueDate&&dateMs(x.dueDate)<Date.now())};
  }
  function productByQuestion(q){
    const products=dataset().products||[]; const nq=normalizedName(q);
    return products.map(p=>({p,score:normalizedName(p.name).split(/\s+/).filter(w=>w.length>2&&nq.includes(w)).length})).sort((a,b)=>b.score-a.score)[0]?.score?products.map(p=>({p,score:normalizedName(p.name).split(/\s+/).filter(w=>w.length>2&&nq.includes(w)).length})).sort((a,b)=>b.score-a.score)[0].p:null;
  }
  function promotionCandidates(){
    const st=salesStats(30), products=dataset().products||[];
    const sold=new Map(st.byProduct.map(x=>[normalizedName(x.name),x.qty]));
    return products.map(p=>{ const stock=Number(p.stock||0); const qty=sold.get(normalizedName(p.name))||0; const cost=Number(p.cost??p.baseCost??0)||0; const price=Number(p.price??p.retailPrice??0)||0; const margin=price?((price-cost)/price*100):0; return {p,stock,qty,margin,score:(stock>10?2:0)+(qty<3?2:0)+(margin>25?1:0)}; }).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score).slice(0,6);
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
  function discountSimulation(product,percent=5,qty=1){
    if(!product) return null; const price=Number(product.price??product.retailPrice??product.publicPrice??0)||0; const cost=Number(product.cost??product.baseCost??0)||0; const pct=Math.max(0,Math.min(100,Number(percent)||0)); const final=price*(1-pct/100); const profit=(final-cost)*qty; const margin=final?((final-cost)/final*100):0; const settings=dataset().settings||{}; const minMargin=Number(settings.minMargin??settings.minimumMargin??25)||25; return {price,cost,pct,final,profit,margin,minMargin,allowed:margin>=minMargin};
  }
  function answerLocal(question){
    const q=String(question||'').toLowerCase();
    const st=salesStats(q.includes('hoy')?1:q.includes('semana')?7:30), cs=clientStats(), ss=stockStats(), rs=receivableStats();
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
    if(entry.role==='user' && typeof entry.text==='string') return {id:entry.id||uid(),role:'user',text:entry.text.slice(0,1500),at:Number(entry.at)||Date.now()};
    if(entry.role==='assistant' && entry.response && typeof entry.response==='object') return {id:entry.id||uid(),role:'assistant',response:entry.response,at:Number(entry.at)||Date.now()};
    return null;
  }
  function readConversation(){
    try {
      const data=JSON.parse(localStorage.getItem(historyKey())||'[]');
      return (Array.isArray(data)?data:[]).map(normalizeEntry).filter(Boolean).slice(-MAX_ENTRIES);
    } catch(_) { return []; }
  }
  function writeConversation(entries){
    try { localStorage.setItem(historyKey(),JSON.stringify(entries.slice(-MAX_ENTRIES))); }
    catch(_) {}
  }
  function addEntry(entry){
    const rows=readConversation();
    const normalized=normalizeEntry(entry);
    if(normalized) rows.push(normalized);
    writeConversation(rows);
    return normalized;
  }
  function clearConversation(){
    try { localStorage.removeItem(historyKey()); } catch(_) {}
  }

  function renderResponse(r){
    return `<article class="nvAiMessage assistant"><div class="nvAiBotMini">${botSvg('mini')}</div><div class="nvAiBubble"><strong>${esc(r.title)}</strong><p>${r.body||''}</p>${r.cards?`<div class="nvAiMetrics">${r.cards.map(x=>`<div><small>${esc(x[0])}</small><b>${esc(x[1])}</b></div>`).join('')}</div>`:''}${r.table?`<div class="nvAiTable"><div class="head"><span>Producto</span><span>Unid.</span><span>Utilidad</span><span>Margen</span></div>${r.table.map(row=>`<div>${row.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`).join('')}</div>`:''}${r.list?.length?`<ul>${r.list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${r.action?`<button class="nvAiInlineAction" type="button" data-ai-tab="${esc(r.action.tab)}">${esc(r.action.label)}</button>`:''}${r.suggestions?`<div class="nvAiSuggestions">${r.suggestions.map(x=>`<button type="button" data-ai-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`:''}</div></article>`;
  }
  function renderEntry(entry){
    if(entry.role==='user') return `<article class="nvAiMessage user" data-ai-entry="${esc(entry.id)}"><div class="nvAiBubble">${esc(entry.text)}</div></article>`;
    return renderResponse(entry.response||{title:'Respuesta',body:'Sin contenido.'});
  }
  function welcomeHtml(){
    const name=String(window.AppState?.session?.fullName||window.AppState?.session?.username||'Cristhian').split(' ')[0];
    return `<article class="nvAiMessage assistant nvAiWelcome"><div class="nvAiBotMini">${botSvg('mini')}</div><div class="nvAiBubble"><strong>Hola, ${esc(name)}</strong><p>Puedo ayudarte a interpretar ventas, márgenes, inventario y clientes. Las respuestas permanecerán guardadas en esta conversación aunque la pantalla se actualice.</p><div class="nvAiSuggestions">${['¿Cómo van las ventas hoy?','¿Qué productos dejan mayor utilidad?','¿Qué clientes requieren seguimiento?','¿Tengo stock crítico?'].map(x=>`<button type="button" data-ai-q="${esc(x)}">${esc(x)}</button>`).join('')}</div></div></article>`;
  }
  function thinkingHtml(){
    return `<article class="nvAiMessage assistant nvAiThinking"><div class="nvAiBotMini">${botSvg('mini')}</div><div class="nvAiBubble"><span class="nvAiTyping"><i></i><i></i><i></i></span><small>Analizando los datos actuales…</small></div></article>`;
  }
  function bindInline(root=document){
    root.querySelectorAll?.('[data-ai-tab]').forEach(b=>{ b.onclick=()=>window.navigateTo(b.dataset.aiTab); });
    root.querySelectorAll?.('[data-ai-q]').forEach(b=>{ b.onclick=()=>ask(b.dataset.aiQ); });
  }
  function renderConversation(preserveBottom=true){
    const feed=document.getElementById('nvAiFeed');
    if(!feed) return;
    const nearBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<90;
    const entries=readConversation();
    feed.innerHTML=(entries.length?entries.map(renderEntry).join(''):welcomeHtml())+(pendingQuestion?thinkingHtml():'');
    bindInline(feed);
    if(preserveBottom && (nearBottom||pendingQuestion)) requestAnimationFrame(()=>{ feed.scrollTop=feed.scrollHeight; });
  }

  function ask(question){
    const input=document.getElementById('nvAiInput');
    const q=String(question||input?.value||'').trim();
    if(!q||pendingQuestion) return;
    if(input) input.value='';
    addEntry({role:'user',text:q,at:Date.now()});
    pendingQuestion=q;
    renderConversation(true);
    clearTimeout(answerTimer);
    answerTimer=setTimeout(()=>{
      try {
        const response=answerLocal(q);
        addEntry({role:'assistant',response,at:Date.now()});
      } catch(error) {
        addEntry({role:'assistant',response:{title:'No pude completar el análisis',body:'Ocurrió un problema al leer los datos actuales. Puedes volver a intentarlo sin perder la conversación.'},at:Date.now()});
      } finally {
        pendingQuestion='';
        if(String(window.AppState?.currentTab)==='asistente-ia') renderConversation(true);
      }
    },260);
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
      <header class="nvAiHead"><button id="nvAiBack" type="button" aria-label="Volver">‹</button><div class="nvAiAvatar">${botSvg()}</div><div><h1>Asistente IA <span>ANALÍTICO</span></h1><p>Exclusivo del administrador central</p></div><button id="nvAiClear" class="nvAiGhost" type="button">Nueva conversación</button></header>
      <div class="nvAiContext"><span>Analizando</span><strong id="nvAiContextLabel">${esc(assistantContext.label)}</strong><small>Datos actuales de Natura Vida · conversación guardada en este dispositivo</small></div>
      <div class="nvAiQuickStats"><div><small>Ventas 30 días</small><b id="nvAiStatSales">${money(st.revenue)}</b></div><div><small>Utilidad estimada</small><b id="nvAiStatProfit">${money(st.profit)}</b></div><div><small>Stock crítico</small><b id="nvAiStatStock">${ss.critical.length}</b></div><div><small>Seguimientos</small><b id="nvAiStatFollow">${cs.inactive.length}</b></div></div>
      <section class="nvAiRecPanel"><div class="nvAiRecHead"><strong>Recomendaciones de hoy</strong><button id="nvAiRefreshRec" type="button">Actualizar</button></div><div id="nvAiRecommendations" class="nvAiRecommendations"></div></section><div class="nvAiTopicTabs" id="nvAiTopicTabs"></div><div class="nvAiFeed" id="nvAiFeed" aria-live="polite"></div>
      <div class="nvAiComposer"><textarea id="nvAiInput" rows="1" placeholder="Escribe tu consulta…" aria-label="Consulta para el asistente"></textarea><button id="nvAiSend" type="button" aria-label="Enviar">➤</button></div>
      <p class="nvAiDisclaimer">Análisis local verificable: revisa decisiones importantes. Ninguna acción se ejecuta sin confirmación.</p>
    </section>`;
    document.getElementById('nvAiBack').onclick=()=>window.navigateTo(lastNonAiTab||'inicio');
    document.getElementById('nvAiClear').onclick=()=>{
      const ok=window.confirm?window.confirm('¿Iniciar una conversación nueva? Se borrará únicamente el historial local del asistente.'):true;
      if(!ok) return;
      clearConversation();
      pendingQuestion='';
      renderConversation(false);
    };
    document.getElementById('nvAiSend').onclick=()=>ask();
    document.getElementById('nvAiRefreshRec').onclick=renderRecommendations;
    document.getElementById('nvAiInput').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); ask(); } });
    renderRecommendations();
    renderConversation(false);
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
    document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiOverlay"><section class="nvAiSheet" role="dialog" aria-modal="true" aria-labelledby="nvAiSheetTitle"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiClose" type="button" aria-label="Cerrar">×</button><div class="nvAiSheetIntro"><div class="nvAiAvatar">${botSvg()}</div><div><h2 id="nvAiSheetTitle">Asistente Natura</h2><p>${hasHistory?'Tu conversación está guardada.':'¿En qué puedo ayudarte?'}</p></div></div><div class="nvAiSheetContext">Contexto: <b>${esc(ctx.label)}</b></div><div class="nvAiSheetActions">${[['Resumen de hoy','¿Cómo van las ventas hoy?'],['Analizar ventas','¿Qué productos dejan mayor utilidad?'],['Revisar clientes','¿Qué clientes requieren seguimiento?']].map(x=>`<button type="button" data-sheet-q="${esc(x[1])}">${esc(x[0])}</button>`).join('')}<button class="primary" id="nvAiOpenFull" type="button">${hasHistory?'Continuar conversación':'Abrir asistente completo'}</button></div></section></div>`);
    document.getElementById('nvAiClose').onclick=closeSheet;
    document.getElementById('nvAiOverlay').onclick=e=>{ if(e.target.id==='nvAiOverlay') closeSheet(); };
    document.getElementById('nvAiOpenFull').onclick=()=>openFull();
    document.querySelectorAll('[data-sheet-q]').forEach(b=>{ b.onclick=()=>openFull(b.dataset.sheetQ); });
  }

  function ensureFab(){
    let fab=document.getElementById('nvAiFab');
    const blocked=!adminAllowed() || String(window.AppState?.currentTab)==='asistente-ia' || document.querySelector('.loginShell') || document.querySelector('.nvAiOverlay');
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

  function install(){
    if(window.__NV_AI_V812_INSTALLED) return;
    window.__NV_AI_V812_INSTALLED=true;
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
    window.renderAIAssistantV812=renderAssistant;
    window.renderAIAssistantV810=renderAssistant;
    window.openAIAssistantSheetV812=openSheet;
    window.openAIAssistantSheetV810=openSheet;
  }

  window.__nvAiV812={VERSION,readConversation,writeConversation,addEntry,clearConversation,answerLocal,recommendations,discountSimulation,renderAssistant,openSheet,ask,botSvg};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));
  else setTimeout(install,0);
})();
