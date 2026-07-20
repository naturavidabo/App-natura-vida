/* Natura Vida V8.1.0 — Asistente IA Beta.
   Interfaz exclusiva para administrador central y motor local verificable.
   La conexión a un proveedor externo queda preparada mediante aiEndpoint seguro. */
(function(){
  'use strict';
  const VERSION='8.1.0';
  let oldNavigate=null, oldRender=null;
  const HISTORY_KEY='nv_ai_history_v810';

  function adminAllowed(){
    try { return !!(window.requireAuth && requireAuth() && window.isAdmin && isAdmin()); }
    catch(_) { return false; }
  }
  function esc(v){ return window.escapeHtml ? escapeHtml(String(v??'')) : String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function money(v){ return window.fmtMoney ? fmtMoney(Number(v)||0) : `Bs ${(Number(v)||0).toFixed(2)}`; }
  function dateKey(d){ const x=new Date(d||0); return Number.isNaN(x.getTime())?'':x.toISOString().slice(0,10); }
  function currentContext(){
    const tab=String(window.AppState?.currentTab||'inicio');
    const map={inicio:'Negocio general',vender:'Venta actual',clientes:'Clientes',inventario:'Inventario',territorio:'Territorio','por-cobrar':'Cobranzas','reglas-comerciales':'Reglas comerciales',produccion:'Producción'};
    return {tab,label:map[tab]||'Negocio general'};
  }
  function dataset(){
    const s=window.AppState||{};
    return {sales:s.sales||[],clients:s.clients||[],products:s.products||[],expenses:s.expenses||[],payments:s.receivablePayments||[],settings:s.settings||{}};
  }
  function salesStats(periodDays=30){
    const {sales,products}=dataset(); const now=Date.now(); const from=now-periodDays*86400000;
    const rows=sales.filter(x=>Number(new Date(x.date||x.createdAt||0))>=from && (!window.saleVisibleToCurrentBusinessV801 || saleVisibleToCurrentBusinessV801(x)));
    let revenue=0,cost=0,units=0; const byProduct=new Map();
    rows.forEach(s=>{
      revenue+=Number(s.total)||0;
      (s.items||[]).forEach(it=>{
        const qty=Number(it.qty||it.quantity)||0; units+=qty;
        const product=products.find(p=>String(p.id)===String(it.productId))||{};
        const unitCost=Number(it.cost ?? product.cost ?? product.baseCost ?? (window.grossCost?grossCost(product):0))||0;
        const unitPrice=Number(it.price||it.unitPrice)||0; cost+=unitCost*qty;
        const key=it.productId||it.name||'sin-producto'; const prev=byProduct.get(key)||{name:it.name||product.name||'Producto',qty:0,revenue:0,cost:0};
        prev.qty+=qty; prev.revenue+=unitPrice*qty; prev.cost+=unitCost*qty; byProduct.set(key,prev);
      });
    });
    return {rows,revenue,cost,profit:revenue-cost,margin:revenue?((revenue-cost)/revenue*100):0,units,byProduct:[...byProduct.values()].sort((a,b)=>(b.revenue-b.cost)-(a.revenue-a.cost))};
  }
  function clientStats(){
    const {clients,sales}=dataset(); const cutoff=Date.now()-30*86400000;
    const inactive=clients.filter(c=>{
      const own=sales.filter(s=>String(s.clientId||'')===String(c.id||''));
      const last=Math.max(0,...own.map(s=>Number(new Date(s.date||s.createdAt||0))||0)); return own.length>0 && last<cutoff;
    });
    const incomplete=clients.filter(c=>!String(c.phone||c.whatsapp||'').trim() || !String(c.name||c.businessName||'').trim());
    return {inactive,incomplete,total:clients.length};
  }
  function stockStats(){
    const {products}=dataset(); const threshold=Number(dataset().settings.lowStockThreshold||5);
    const critical=products.filter(p=>Number(p.stock||0)<=threshold);
    const negative=products.filter(p=>Number(p.stock||0)<0);
    return {critical,negative,total:products.length};
  }
  function answerLocal(question){
    const q=String(question||'').toLowerCase(); const st=salesStats(q.includes('hoy')?1:q.includes('semana')?7:30); const cs=clientStats(); const ss=stockStats();
    if (/venta|vendimos|factur/.test(q)) return {title:'Análisis de ventas',body:`En el periodo analizado se registraron <b>${st.rows.length} operaciones</b> por ${money(st.revenue)}. La utilidad estimada es ${money(st.profit)} y el margen promedio ${st.margin.toFixed(1)}%.`,cards:[['Operaciones',st.rows.length],['Ingresos',money(st.revenue)],['Utilidad',money(st.profit)],['Margen',st.margin.toFixed(1)+'%']]};
    if (/utilidad|margen|producto.*mejor|más rentable/.test(q)) { const top=st.byProduct.slice(0,5); return {title:'Productos con mayor utilidad estimada',body:top.length?'Cálculo basado en ventas y costos registrados.':'No hay ventas suficientes en el periodo.',table:top.map(x=>[x.name,x.qty,money(x.revenue-x.cost),x.revenue?(((x.revenue-x.cost)/x.revenue)*100).toFixed(1)+'%':'0%'])}; }
    if (/stock|inventario|agot/.test(q)) return {title:'Estado de inventario',body:`Hay <b>${ss.critical.length} productos</b> en nivel crítico y ${ss.negative.length} con stock negativo.`,list:ss.critical.slice(0,8).map(p=>`${p.name||'Producto'}: ${Number(p.stock||0)} unidad(es)`) };
    if (/cliente|seguimiento|inactiv/.test(q)) return {title:'Seguimiento de clientes',body:`Se identificaron <b>${cs.inactive.length} clientes</b> con compras anteriores y sin movimiento en los últimos 30 días. ${cs.incomplete.length} fichas requieren completar nombre o teléfono.`,list:cs.inactive.slice(0,8).map(c=>c.name||c.businessName||'Cliente sin nombre')};
    if (/descuento|promoci/.test(q)) return {title:'Simulación comercial segura',body:'Puedo analizar un descuento usando costo real, precio mínimo y margen configurado. Abre un producto o indica producto, cantidad y porcentaje. Ningún descuento se aplicará sin tu confirmación.',action:{label:'Abrir reglas comerciales',tab:'reglas-comerciales'}};
    return {title:'Asistente comercial',body:'Puedo analizar ventas, utilidad, margen, inventario, clientes inactivos y reglas de descuento. Esta versión Beta usa cálculos locales verificables; el motor generativo externo todavía no está activado.',suggestions:['¿Cómo van las ventas hoy?','¿Qué productos dejan mayor utilidad?','¿Qué clientes requieren seguimiento?','¿Tengo stock crítico?']};
  }
  function saveHistory(role,text){
    try { const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]'); h.push({role,text:String(text).slice(0,1000),at:Date.now()}); localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(-30))); } catch(_){}
  }
  function renderResponse(r){
    return `<article class="nvAiMessage assistant"><div class="nvAiBotMini">✦</div><div class="nvAiBubble"><strong>${esc(r.title)}</strong><p>${r.body||''}</p>${r.cards?`<div class="nvAiMetrics">${r.cards.map(x=>`<div><small>${esc(x[0])}</small><b>${esc(x[1])}</b></div>`).join('')}</div>`:''}${r.table?`<div class="nvAiTable"><div class="head"><span>Producto</span><span>Unid.</span><span>Utilidad</span><span>Margen</span></div>${r.table.map(row=>`<div>${row.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`).join('')}</div>`:''}${r.list?`<ul>${r.list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${r.action?`<button class="nvAiInlineAction" data-ai-tab="${esc(r.action.tab)}">${esc(r.action.label)}</button>`:''}</div></article>`;
  }
  function ask(q){
    const input=document.getElementById('nvAiInput'); if(!q&&input)q=input.value.trim(); if(!q)return;
    const feed=document.getElementById('nvAiFeed'); if(!feed)return;
    feed.insertAdjacentHTML('beforeend',`<article class="nvAiMessage user"><div class="nvAiBubble">${esc(q)}</div></article>`); saveHistory('user',q); if(input)input.value='';
    setTimeout(()=>{ const r=answerLocal(q); feed.insertAdjacentHTML('beforeend',renderResponse(r)); saveHistory('assistant',r.title); bindInline(); feed.scrollTop=feed.scrollHeight; },180);
  }
  function bindInline(){ document.querySelectorAll('[data-ai-tab]').forEach(b=>b.onclick=()=>window.navigateTo(b.dataset.aiTab)); }
  function renderAssistant(){
    if(!adminAllowed()){ oldNavigate?.('inicio'); return; }
    const ctx=currentContext(); const st=salesStats(30), cs=clientStats(), ss=stockStats();
    document.getElementById('mainArea').innerHTML=`<section class="nvAiPage">
      <header class="nvAiHead"><button id="nvAiBack" type="button" aria-label="Volver">‹</button><div class="nvAiAvatar">✦</div><div><h1>Asistente IA <span>BETA</span></h1><p>Exclusivo del administrador central</p></div><button id="nvAiClear" class="nvAiGhost" type="button">Limpiar</button></header>
      <div class="nvAiContext"><span>Analizando</span><strong>${esc(ctx.label)}</strong><small>Datos actuales de Natura Vida</small></div>
      <div class="nvAiQuickStats"><div><small>Ventas 30 días</small><b>${money(st.revenue)}</b></div><div><small>Utilidad estimada</small><b>${money(st.profit)}</b></div><div><small>Stock crítico</small><b>${ss.critical.length}</b></div><div><small>Seguimientos</small><b>${cs.inactive.length}</b></div></div>
      <div class="nvAiFeed" id="nvAiFeed"><article class="nvAiMessage assistant"><div class="nvAiBotMini">✦</div><div class="nvAiBubble"><strong>Hola, ${esc(String(AppState.session?.fullName||AppState.session?.username||'Cristhian').split(' ')[0])}</strong><p>Puedo ayudarte a interpretar ventas, márgenes, inventario y clientes. Mis cifras salen de los registros actuales de la aplicación.</p><div class="nvAiSuggestions">${['¿Cómo van las ventas hoy?','¿Qué productos dejan mayor utilidad?','¿Qué clientes requieren seguimiento?','¿Tengo stock crítico?'].map(x=>`<button type="button" data-ai-q="${esc(x)}">${esc(x)}</button>`).join('')}</div></div></article></div>
      <div class="nvAiComposer"><textarea id="nvAiInput" rows="1" placeholder="Escribe tu consulta…" aria-label="Consulta para el asistente"></textarea><button id="nvAiSend" type="button" aria-label="Enviar">➤</button></div>
      <p class="nvAiDisclaimer">Beta local: verifica decisiones importantes. Ninguna acción se ejecuta sin confirmación.</p>
    </section>`;
    document.getElementById('nvAiBack').onclick=()=>oldNavigate?.('inicio');
    document.getElementById('nvAiClear').onclick=()=>{ localStorage.removeItem(HISTORY_KEY); renderAssistant(); };
    document.getElementById('nvAiSend').onclick=()=>ask();
    document.getElementById('nvAiInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask();}});
    document.querySelectorAll('[data-ai-q]').forEach(b=>b.onclick=()=>ask(b.dataset.aiQ));
  }
  function openSheet(){
    if(!adminAllowed())return; closeSheet(); const ctx=currentContext();
    document.body.insertAdjacentHTML('beforeend',`<div class="nvAiOverlay" id="nvAiOverlay"><section class="nvAiSheet" role="dialog" aria-modal="true"><div class="nvAiHandle"></div><button class="nvAiClose" id="nvAiClose" type="button">×</button><div class="nvAiSheetIntro"><div class="nvAiAvatar">✦</div><div><h2>Asistente Natura</h2><p>¿En qué puedo ayudarte?</p></div></div><div class="nvAiSheetContext">Contexto: <b>${esc(ctx.label)}</b></div><div class="nvAiSheetActions">${[['Resumen de hoy','¿Cómo van las ventas hoy?'],['Analizar ventas','¿Qué productos dejan mayor utilidad?'],['Revisar clientes','¿Qué clientes requieren seguimiento?']].map(x=>`<button data-sheet-q="${esc(x[1])}">${esc(x[0])}</button>`).join('')}<button class="primary" id="nvAiOpenFull">Hacer una pregunta</button></div></section></div>`);
    document.getElementById('nvAiClose').onclick=closeSheet; document.getElementById('nvAiOverlay').onclick=e=>{if(e.target.id==='nvAiOverlay')closeSheet();};
    document.getElementById('nvAiOpenFull').onclick=()=>{closeSheet(); window.navigateTo('asistente-ia');};
    document.querySelectorAll('[data-sheet-q]').forEach(b=>b.onclick=()=>{const q=b.dataset.sheetQ;closeSheet();window.navigateTo('asistente-ia');setTimeout(()=>ask(q),60);});
  }
  function closeSheet(){ document.getElementById('nvAiOverlay')?.remove(); }
  function ensureFab(){
    let fab=document.getElementById('nvAiFab');
    if(!adminAllowed() || ['asistente-ia'].includes(String(AppState.currentTab)) || document.querySelector('.loginShell')) { fab?.remove(); return; }
    if(!fab){ fab=document.createElement('button');fab.id='nvAiFab';fab.className='nvAiFab';fab.type='button';fab.innerHTML='<span class="nvAiFace"><i></i><i></i></span><b>IA</b>';fab.setAttribute('aria-label','Abrir Asistente IA');fab.onclick=openSheet;document.body.appendChild(fab); }
  }
  function install(){
    oldNavigate=window.navigateTo; oldRender=window.render;
    window.navigateTo=function(tab){ if(tab==='asistente-ia'){AppState.currentTab=tab;renderAssistant();ensureFab();return;} return oldNavigate(tab); };
    window.render=function(){ if(AppState.currentTab==='asistente-ia')renderAssistant(); else oldRender(); setTimeout(ensureFab,0); };
    const observer=new MutationObserver(()=>setTimeout(ensureFab,0)); observer.observe(document.getElementById('mainArea'),{childList:true,subtree:false});
    setTimeout(ensureFab,300);
    window.renderAIAssistantV810=renderAssistant; window.openAIAssistantSheetV810=openSheet;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0)); else setTimeout(install,0);
})();
