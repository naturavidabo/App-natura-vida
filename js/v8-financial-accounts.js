/* NATURA VIDA V8.2.0 — Estados de cuenta, deudas activas y documentos de cobro. */
(function(){
  'use strict';
  const Core = window.NVFinancialCoreV820;
  if (!Core) { console.error('NVFinancialCoreV820 no está disponible.'); return; }

  const esc = value => escapeHtml(String(value == null ? '' : value));
  const money = value => fmtMoney(Number(value || 0));
  const currentUserId = () => String(AppState.session?.onlineUserId || AppState.session?.userId || '');
  const isCentral = () => !!(window.isAdmin && isAdmin());
  const norm = value => Core.norm(value);
  let receivableFilters = { query:'', region:'', seller:'', status:'', historical:'all', sort:'debt_desc' };
  let currentAccountClientId = '';
  let currentAccountTab = 'summary';

  function allFinancialOperationsV820(){
    const sales = (AppState.sales || []).filter(row => row && !row.deletedAt).map(row => Object.assign({operationKind:'sale', inventoryImpact:true}, row));
    const historical = (AppState.historicalReceivables || []).filter(row => row && !row.deletedAt).map(row => Object.assign({operationKind:'historical', inventoryImpact:false, historicalActive:true, sourceSystem:'Mi Negocio'}, row));
    return [...sales, ...historical].filter(row => {
      if (window.saleVisibleToCurrentBusinessV801 && row.operationKind === 'sale') return saleVisibleToCurrentBusinessV801(row);
      if (isCentral()) return true;
      return !row.ownerUserId || row.ownerUserId === currentUserId() || row.sellerId === currentUserId();
    });
  }
  function activePaymentsV820(){ return (AppState.receivablePayments || []).filter(p => p && !p.deletedAt && p.status !== 'voided'); }
  function salePaidTotalV820(operation){ return Core.paidTotal(operation, activePaymentsV820()); }
  function saleBalanceV820(operation){ return Core.balance(operation, activePaymentsV820()); }
  function operationStatusV820(operation){ return Core.status(operation, activePaymentsV820()); }
  function receivableSalesV820(){ return allFinancialOperationsV820().filter(op => saleBalanceV820(op) > .009).sort((a,b)=>Core.operationDate(a)-Core.operationDate(b)); }
  function receivableTotalsV820(){
    const rows=receivableSalesV820();
    return {count:rows.length,total:Core.round(rows.reduce((s,x)=>s+saleBalanceV820(x),0)),original:Core.round(rows.reduce((s,x)=>s+Number(x.total||0),0)),paid:Core.round(rows.reduce((s,x)=>s+salePaidTotalV820(x),0)),clients:financialClientSummariesV820().filter(x=>x.totalDebt>.009).length};
  }
  function clientForOperationV820(operation){
    let client = (AppState.clients || []).find(c => operation.clientId && c.id === operation.clientId);
    if (!client) client = (AppState.clients || []).find(c => operation.clientPhone && window.normalizePhoneV723 && normalizePhoneV723(c.phone) === normalizePhoneV723(operation.clientPhone));
    if (!client) client = (AppState.clients || []).find(c => norm(c.name) === norm(operation.clientName));
    return client || { id:`virtual_${norm(operation.clientName||'sin_nombre').replace(/\s/g,'_')}`, name:operation.clientName||'Cliente sin ficha', phone:operation.clientPhone||'', regionName:operation.regionName||'', virtual:true };
  }
  function financialClientSummariesV820(){
    const map=new Map();
    for(const op of allFinancialOperationsV820()){
      const client=clientForOperationV820(op); const key=String(client.id||norm(client.name));
      if(!map.has(key)) map.set(key,{client,operations:[]});
      map.get(key).operations.push(op);
    }
    return Array.from(map.values()).map(group=>Core.aggregateClient(group.client,group.operations,activePaymentsV820(),AppState.financialDocuments||[]));
  }
  function clientAccountV820(clientOrId){
    let client = typeof clientOrId === 'object' ? clientOrId : (AppState.clients||[]).find(c=>c.id===clientOrId);
    if(!client){
      const summary=financialClientSummariesV820().find(x=>x.client.id===clientOrId);
      client=summary?.client;
    }
    if(!client) return null;
    return Core.aggregateClient(client,allFinancialOperationsV820(),activePaymentsV820(),AppState.financialDocuments||[]);
  }
  function dateText(ts){ return ts ? fmtDate(ts) : 'Sin registro'; }
  function daysLabel(days){ return days > 0 ? `${days} día${days===1?'':'s'}` : 'Al día'; }
  function regionForAccount(account){
    return account.client.regionName || account.client.region || account.operations.find(o=>o.regionName)?.regionName || 'Sin región';
  }
  function sellerForAccount(account){
    return account.client.sellerName || account.client.responsibleName || account.operations.find(o=>o.sellerName)?.sellerName || 'Sin responsable';
  }
  function operationLabelV820(op){ return op.originalSaleNumber || op.documentNumber || op.receiptNumber || (op.operationKind==='historical'?'Venta histórica':'Venta'); }
  function itemsSummaryV820(op, detailed=false){
    const items=Array.isArray(op.items)?op.items:[];
    if(!items.length) return op.products || op.detail || 'Productos entregados no detallados';
    if(detailed) return items.map(it=>`${it.qty||1} × ${it.productName||it.name||'Producto'} (${money(it.subtotal || Number(it.qty||1)*Number(it.unitPrice||0))})`).join(' · ');
    return items.length===1 ? (items[0].productName||items[0].name||'Producto') : `${items[0]?.productName||items[0]?.name||'Productos'} +${items.length-1}`;
  }
  function paymentMethodLabelV820(code){ return ({cash:'Efectivo',qr:'QR',transfer:'Transferencia',deposit:'Depósito',other:'Otro'})[code] || code || 'Sin especificar'; }

  async function nextFinancialNumberV820(prefix){
    const clean=String(prefix||'DOC').toUpperCase().replace(/[^A-Z]/g,'').slice(0,5)||'DOC';
    try{
      if(navigator.onLine && window.getSupabaseClient && requireAuth()){
        const {data,error}=await getSupabaseClient().rpc('nv_next_financial_document_number',{p_prefix:clean});
        if(!error && data) return String(data);
      }
    }catch(_){ }
    AppState.settings.financialDocumentSequences = AppState.settings.financialDocumentSequences || {};
    const next=Number(AppState.settings.financialDocumentSequences[clean]||0)+1;
    AppState.settings.financialDocumentSequences[clean]=next;
    await saveSettings();
    return `${clean}-${String(next).padStart(6,'0')}`;
  }

  async function saveFinancialDocumentV820(document){
    const row=Object.assign({id:uid('fdoc'),ownerUserId:currentUserId(),createdAt:Date.now(),updatedAt:Date.now(),status:'issued'},document);
    await DB.put('financialDocuments',row);
    AppState.financialDocuments = await DB.getAll('financialDocuments').catch(()=>[...(AppState.financialDocuments||[]),row]);
    await writeAudit('financial_document_generated','financialDocuments',row.id,null,{documentType:row.documentType,documentNumber:row.documentNumber,clientId:row.clientId,total:row.total});
    return row;
  }

  function filterSummariesV820(rows){
    let out=rows.filter(x=>x.totalDebt>.009);
    const q=norm(receivableFilters.query);
    if(q) out=out.filter(x=>norm([x.client.name,x.client.businessName,x.client.phone,regionForAccount(x),sellerForAccount(x)].join(' ')).includes(q));
    if(receivableFilters.region) out=out.filter(x=>regionForAccount(x)===receivableFilters.region);
    if(receivableFilters.seller) out=out.filter(x=>sellerForAccount(x)===receivableFilters.seller);
    if(receivableFilters.status) out=out.filter(x=>x.active.some(op=>operationStatusV820(op).code===receivableFilters.status));
    if(receivableFilters.historical==='historical') out=out.filter(x=>x.active.some(op=>op.operationKind==='historical'||op.historicalActive));
    if(receivableFilters.historical==='current') out=out.filter(x=>x.active.some(op=>op.operationKind!=='historical'&&!op.historicalActive));
    const sorts={
      debt_desc:(a,b)=>b.totalDebt-a.totalDebt,
      debt_asc:(a,b)=>a.totalDebt-b.totalDebt,
      oldest:(a,b)=>(a.oldestDebtDate||Infinity)-(b.oldestDebtDate||Infinity),
      newest:(a,b)=>(b.oldestDebtDate||0)-(a.oldestDebtDate||0),
      name:(a,b)=>String(a.client.name||'').localeCompare(String(b.client.name||''),'es')
    };
    return out.sort(sorts[receivableFilters.sort]||sorts.debt_desc);
  }

  function receivableCardV820(account){
    const oldest=account.active.slice().sort((a,b)=>Core.operationDate(a)-Core.operationDate(b))[0];
    const status=oldest?operationStatusV820(oldest):{code:'pending',label:'Pendiente'};
    const historical=account.active.some(op=>op.operationKind==='historical'||op.historicalActive);
    return `<article class="nv820DebtCard" data-client-id="${esc(account.client.id)}">
      <div class="nv820DebtMain"><div class="nv820DebtTitle"><span class="nv820ClientAvatar">${esc(String(account.client.name||'C').charAt(0).toUpperCase())}</span><div><strong>${esc(account.client.name||'Cliente')}</strong><small>${esc(account.client.phone||'sin teléfono')} · ${esc(regionForAccount(account))}</small></div></div>
        <div class="nv820DebtFacts"><span><b>${account.pendingCount}</b> operaciones pendientes</span><span>Más antigua: <b>${dateText(account.oldestDebtDate)}</b></span><span>Último pago: <b>${dateText(account.lastPaymentDate)}</b></span><span>Atraso: <b>${daysLabel(account.daysLate)}</b></span></div>
        <div class="nv820DebtBadges"><span class="nv820Status ${status.code}">${esc(status.label)}</span>${historical?'<span class="nv820Status historical">Mi Negocio</span>':''}<span class="nv820Responsible">${esc(sellerForAccount(account))}</span></div>
      </div>
      <div class="nv820DebtAmount"><small>Deuda acumulada</small><strong>${money(account.totalDebt)}</strong><button class="btn sm nv820OpenAccount" data-client-id="${esc(account.client.id)}">Ver estado de cuenta</button><button class="btn sm outline nv820PayAccount" data-client-id="${esc(account.client.id)}">Registrar pago</button><button class="btn sm outline nv820CollectAccount" data-client-id="${esc(account.client.id)}">Generar cobro</button></div>
    </article>`;
  }

  function renderReceivablesV820(){
    window.__nv820ActiveAccountContext=null;
    $('#fabAdd')?.classList.add('hidden');
    const totals=receivableTotalsV820();
    const all=financialClientSummariesV820();
    const rows=filterSummariesV820(all);
    const regions=[...new Set(all.map(regionForAccount).filter(Boolean))].sort();
    const sellers=[...new Set(all.map(sellerForAccount).filter(Boolean))].sort();
    $('#mainArea').innerHTML=`
      <section class="v7PageHead nv820FinanceHead"><span class="v7Eyebrow">Control financiero por cliente</span><h1>Cuentas por cobrar</h1><p>Deudas actuales e históricas, pagos parciales, estados de cuenta y documentos consolidados.</p></section>
      <section class="v7MetricGrid compact nv820Metrics"><article class="v7MetricCard"><span>Clientes con deuda</span><strong>${totals.clients}</strong></article><article class="v7MetricCard"><span>Operaciones</span><strong>${totals.count}</strong></article><article class="v7MetricCard"><span>Pagado registrado</span><strong>${money(totals.paid)}</strong></article><article class="v7MetricCard primary"><span>Saldo pendiente</span><strong>${money(totals.total)}</strong></article></section>
      <section class="nv820ReceivableTools"><div class="nv820Search"><span>⌕</span><input id="nv820DebtSearch" value="${esc(receivableFilters.query)}" placeholder="Buscar cliente, región o responsable"></div><button class="btn outline" id="nv820ExportReceivables">Exportar CSV</button><button class="btn outline" id="nv820GeneralReport">Informe general</button>${isCentral()?'<button class="btn" id="nv820ImportHistorical">Importar deudas históricas</button>':''}</section>
      <section class="nv820Filters"><select id="nv820Region"><option value="">Todas las regiones</option>${regions.map(v=>`<option ${receivableFilters.region===v?'selected':''}>${esc(v)}</option>`).join('')}</select><select id="nv820Seller"><option value="">Todos los responsables</option>${sellers.map(v=>`<option ${receivableFilters.seller===v?'selected':''}>${esc(v)}</option>`).join('')}</select><select id="nv820Status"><option value="">Todos los estados</option><option value="pending">Pendiente</option><option value="partial">Parcial</option><option value="overdue">Vencido</option><option value="delinquent">En mora</option><option value="historical">Histórico activo</option></select><select id="nv820Historical"><option value="all">Actuales e históricas</option><option value="historical">Solo históricas</option><option value="current">Solo actuales</option></select><select id="nv820Sort"><option value="debt_desc">Mayor deuda</option><option value="debt_asc">Menor deuda</option><option value="oldest">Deuda más antigua</option><option value="newest">Deuda más reciente</option><option value="name">Nombre del cliente</option></select></section>
      <div class="nv820ResultLine"><span>${rows.length} cliente(s) encontrados</span><small>Los registros históricos no vuelven a descontar inventario.</small></div>
      <section class="nv820DebtList">${rows.map(receivableCardV820).join('')||'<div class="v7Empty"><span>✓</span><h3>Sin cuentas pendientes</h3><p>No existen deudas con los filtros seleccionados.</p></div>'}</section>`;
    const rerender=()=>renderReceivablesV820();
    $('#nv820DebtSearch')?.addEventListener('input',e=>{receivableFilters.query=e.target.value;rerender();});
    [['nv820Region','region'],['nv820Seller','seller'],['nv820Status','status'],['nv820Historical','historical'],['nv820Sort','sort']].forEach(([id,key])=>$('#'+id)?.addEventListener('change',e=>{receivableFilters[key]=e.target.value;rerender();}));
    $all('.nv820OpenAccount').forEach(b=>b.addEventListener('click',()=>openClientAccountV820(b.dataset.clientId)));
    $all('.nv820PayAccount').forEach(b=>b.addEventListener('click',()=>openPaymentFormV820(b.dataset.clientId)));
    $all('.nv820CollectAccount').forEach(b=>b.addEventListener('click',()=>requestClientDocumentV820(b.dataset.clientId,'COB')));
    $('#nv820ExportReceivables')?.addEventListener('click',exportReceivablesCsvV820);
    $('#nv820GeneralReport')?.addEventListener('click',openGeneralReceivablesReportV820);
    $('#nv820ImportHistorical')?.addEventListener('click',openHistoricalImportV820);
    const statusSelect=$('#nv820Status'); if(statusSelect) statusSelect.value=receivableFilters.status;
    const histSelect=$('#nv820Historical'); if(histSelect) histSelect.value=receivableFilters.historical;
    const sortSelect=$('#nv820Sort'); if(sortSelect) sortSelect.value=receivableFilters.sort;
  }

  function openClientAccountV820(clientId,tab='summary'){
    currentAccountClientId=clientId; currentAccountTab=tab;
    if(window.navigateTo) navigateTo('estado-cuenta');
    else { AppState.currentTab='estado-cuenta'; renderClientAccountV820(); }
  }
  function renderClientAccountV820(){
    const account=clientAccountV820(currentAccountClientId);
    if(!account){ showToast('No se encontró la ficha financiera.','error'); return navigateTo('clientes'); }
    $('#fabAdd')?.classList.add('hidden');
    const tabs=[['summary','Resumen'],['debts','Deudas activas'],['payments','Pagos'],['orders','Pedidos'],['sales','Ventas'],['documents','Documentos']];
    const body={summary:accountSummaryHtmlV820,debts:accountDebtsHtmlV820,payments:accountPaymentsHtmlV820,orders:accountOrdersHtmlV820,sales:accountSalesHtmlV820,documents:accountDocumentsHtmlV820}[currentAccountTab] || accountSummaryHtmlV820;
    window.__nv820ActiveAccountContext={clientId:account.client.id,name:account.client.name||'Cliente',phone:account.client.phone||'',region:regionForAccount(account),seller:sellerForAccount(account),totalBought:account.totalBought,totalPaid:account.totalPaid,totalDebt:account.totalDebt,pendingCount:account.pendingCount,lastPaymentDate:account.lastPaymentDate,oldestDebtDate:account.oldestDebtDate,daysLate:account.daysLate,operationCount:account.operations.length};
    const aiAccountButton=(window.isAdmin&&isAdmin()&&window.__nvAiV822)?'<button class="btn outline nv820AiAccountBtn" id="nv820AccountAi">Analizar con IA</button>':'';
    $('#mainArea').innerHTML=`<section class="nv820AccountHead"><button class="nv820Back" id="nv820BackAccounts">← Cuentas por cobrar</button><span class="v7Eyebrow">Estado de cuenta</span><h1>${esc(account.client.name)}</h1><p>${esc([account.client.phone,regionForAccount(account),sellerForAccount(account)].filter(Boolean).join(' · '))}</p><div class="nv820AccountActions"><button class="btn" id="nv820AccountPay">Registrar pago</button><button class="btn outline" id="nv820AccountStatement">Estado de cuenta</button><button class="btn outline" id="nv820AccountCollection">Recibo consolidado</button><button class="btn outline" id="nv820AccountCsv">Exportar CSV</button>${aiAccountButton}</div></section>
      <section class="nv820AccountMetrics"><article><span>Total comprado</span><strong>${money(account.totalBought)}</strong></article><article><span>Total pagado</span><strong>${money(account.totalPaid)}</strong></article><article class="debt"><span>Total adeudado</span><strong>${money(account.totalDebt)}</strong></article><article><span>Ventas pendientes</span><strong>${account.pendingCount}</strong></article><article><span>Último pago</span><strong>${dateText(account.lastPaymentDate)}</strong></article><article><span>Deuda más antigua</span><strong>${dateText(account.oldestDebtDate)}</strong></article><article><span>Días de atraso</span><strong>${account.daysLate}</strong></article></section>
      <nav class="nv820AccountTabs">${tabs.map(([id,label])=>`<button class="${currentAccountTab===id?'active':''}" data-account-tab="${id}">${label}</button>`).join('')}</nav><section class="nv820AccountBody">${body(account)}</section>`;
    $('#nv820BackAccounts')?.addEventListener('click',()=>navigateTo('por-cobrar'));
    $('#nv820AccountPay')?.addEventListener('click',()=>openPaymentFormV820(account.client.id));
    $('#nv820AccountStatement')?.addEventListener('click',()=>requestClientDocumentV820(account.client.id,'EC'));
    $('#nv820AccountCollection')?.addEventListener('click',()=>requestClientDocumentV820(account.client.id,'COB'));
    $('#nv820AccountCsv')?.addEventListener('click',()=>exportClientFinancialCsvV820(account.client.id));
    $('#nv820AccountAi')?.addEventListener('click',()=>window.__nvAiV822?.openForContext?.({tab:'estado-cuenta',label:`Estado de cuenta: ${account.client.name}`,clientId:account.client.id},'Analiza el estado de cuenta de este cliente y dime qué debería atender primero.'));
    $all('[data-account-tab]').forEach(b=>b.addEventListener('click',()=>{currentAccountTab=b.dataset.accountTab;renderClientAccountV820();}));
    bindAccountBodyActionsV820(account);
  }
  function accountSummaryHtmlV820(account){
    const oldest=account.active.slice().sort((a,b)=>Core.operationDate(a)-Core.operationDate(b)).slice(0,4);
    return `<div class="nv820AccountGrid"><section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Situación actual</span><h2>${account.totalDebt>0?'Cobro pendiente':'Cuenta cancelada'}</h2></div></div><div class="nv820AccountCallout ${account.totalDebt>0?'warning':'ok'}"><strong>${money(account.totalDebt)}</strong><span>${account.pendingCount} operación(es) con saldo · ${daysLabel(account.daysLate)}</span></div><div class="nv820QuickDocGrid"><button data-doc-type="EC">Estado de cuenta</button><button data-doc-type="COB">Recibo consolidado</button><button data-doc-type="INF">Informe de deuda</button><button data-doc-type="HFC">Historial financiero</button><button data-doc-type="PPA">Plan de pagos</button>${account.totalDebt<=.009?'<button data-doc-type="CAN">Constancia de cancelación</button>':''}</div></section><section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Operaciones prioritarias</span><h2>Deudas más antiguas</h2></div></div>${oldest.map(operationLineV820).join('')||'<div class="v7Empty small"><span>✓</span><p>No hay deudas activas.</p></div>'}</section></div>`;
  }
  function operationLineV820(op){
    const st=operationStatusV820(op);
    return `<article class="nv820OperationLine"><div><strong>${esc(operationLabelV820(op))}</strong><small>${dateText(Core.operationDate(op))} · ${esc(itemsSummaryV820(op))}</small><span class="nv820Status ${st.code}">${esc(st.label)}</span></div><div><small>Total ${money(op.total)}</small><small>Pagado ${money(salePaidTotalV820(op))}</small><b>${money(saleBalanceV820(op))}</b></div></article>`;
  }
  function accountDebtsHtmlV820(account){ return account.active.map(operationLineV820).join('')||'<div class="v7Empty"><span>✓</span><h3>Sin deudas activas</h3></div>'; }
  function accountPaymentsHtmlV820(account){
    return `<div class="nv820SubTools"><button class="btn" id="nv820TabPay">+ Registrar pago</button></div>${account.payments.slice().sort((a,b)=>Number(b.date||0)-Number(a.date||0)).map(p=>`<article class="nv820PaymentLine"><div><strong>${money(p.amount)}</strong><small>${fmtDateTime(p.date||p.createdAt)} · ${esc(paymentMethodLabelV820(p.method))}</small><small>${esc(p.note||'Sin observación')}</small><span>${(p.allocations||[]).length} deuda(s) afectada(s)</span></div><div><button class="btn sm outline" data-payment-receipt="${esc(p.id)}">Recibo</button>${isCentral()?`<button class="btn sm danger" data-void-payment="${esc(p.id)}">Anular</button>`:''}</div></article>`).join('')||'<div class="v7Empty"><span>💳</span><h3>Sin pagos adicionales</h3><p>Los pagos iniciales se conservan dentro de cada venta.</p></div>'}`;
  }
  function accountOrdersHtmlV820(account){
    const orders=(AppState.purchaseOrders||[]).filter(o=>o.clientId===account.client.id||norm(o.clientName)===norm(account.client.name));
    return orders.map(o=>`<article class="nv820OperationLine"><div><strong>${esc(o.orderNumber||o.documentNumber||'Pedido')}</strong><small>${dateText(o.createdAt||o.date)} · ${esc(o.status||'pendiente')}</small></div><div><b>${money(o.total)}</b></div></article>`).join('')||'<div class="v7Empty"><span>🛒</span><h3>Sin pedidos vinculados</h3></div>';
  }
  function accountSalesHtmlV820(account){ return account.operations.slice().sort((a,b)=>Core.operationDate(b)-Core.operationDate(a)).map(operationLineV820).join('')||'<div class="v7Empty"><span>🧾</span><h3>Sin ventas registradas</h3></div>'; }
  function accountDocumentsHtmlV820(account){
    return `<div class="nv820QuickDocGrid large"><button data-doc-type="EC">Estado de cuenta</button><button data-doc-type="COB">Recibo consolidado de cobro</button><button data-doc-type="PPA">Plan de pagos</button><button data-doc-type="CAN" ${account.totalDebt>.009?'disabled':''}>Constancia de cancelación</button><button data-doc-type="INF">Informe de deuda</button><button data-doc-type="HFC">Historial financiero</button></div><div class="nv820DocumentList">${account.documents.slice().sort((a,b)=>b.createdAt-a.createdAt).map(d=>`<button data-open-fin-doc="${esc(d.id)}"><span><strong>${esc(d.documentNumber)}</strong><small>${esc(d.title||d.documentType)} · ${fmtDateTime(d.createdAt)}</small></span><b>Ver ›</b></button>`).join('')||'<div class="v7Empty small"><span>📄</span><p>Aún no se generaron documentos para este cliente.</p></div>'}</div>`;
  }
  function bindAccountBodyActionsV820(account){
    $('#nv820TabPay')?.addEventListener('click',()=>openPaymentFormV820(account.client.id));
    $all('[data-doc-type]').forEach(b=>b.addEventListener('click',()=>{ if(!b.disabled) requestClientDocumentV820(account.client.id,b.dataset.docType); }));
    $all('[data-open-fin-doc]').forEach(b=>b.addEventListener('click',()=>{const d=(AppState.financialDocuments||[]).find(x=>x.id===b.dataset.openFinDoc);if(d)openFinancialDocumentPreviewV820(d);}));
    $all('[data-payment-receipt]').forEach(b=>b.addEventListener('click',()=>openPaymentReceiptByIdV820(b.dataset.paymentReceipt)));
    $all('[data-void-payment]').forEach(b=>b.addEventListener('click',()=>voidPaymentV820(b.dataset.voidPayment,account)));
  }

  async function readProofImageV820(file){
    if(!file) return '';
    if(file.size>1_500_000) throw new Error('El comprobante supera 1,5 MB. Reduce el tamaño de la imagen.');
    return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('No se pudo leer el comprobante.'));r.readAsDataURL(file);});
  }
  function openPaymentFormV820(clientId){
    const account=clientAccountV820(clientId); if(!account||!account.active.length)return showToast('Este cliente no tiene deudas activas.','error');
    openSheet(`<h2>Registrar pago <span class="x" id="closeSheet">✕</span></h2><div class="nv820PaySummary"><strong>${esc(account.client.name)}</strong><span>Saldo total: <b>${money(account.totalDebt)}</b></span></div><div class="field"><label>Aplicar pago</label><select id="nv820PayMode"><option value="oldest">A la deuda más antigua</option><option value="specific">A una venta específica</option><option value="multiple">A varias ventas</option><option value="general">Como pago general a cuenta</option><option value="total">Cancelación total</option></select></div><div id="nv820PayOperations" class="nv820PayOperations"></div><div class="field-row"><div class="field"><label>Monto Bs</label><input id="nv820PayAmount" type="number" inputmode="decimal" step="0.01" value="${account.active[0]?saleBalanceV820(account.active[0]):account.totalDebt}"></div><div class="field"><label>Fecha</label><input id="nv820PayDate" type="datetime-local" value="${new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}"></div></div><div class="field-row"><div class="field"><label>Método</label><select id="nv820PayMethod"><option value="cash">Efectivo</option><option value="qr">QR</option><option value="transfer">Transferencia</option><option value="deposit">Depósito</option><option value="other">Otro</option></select></div><div class="field"><label>N.º comprobante</label><input id="nv820Voucher" placeholder="Opcional"></div></div><div class="field"><label>Imagen del comprobante</label><input id="nv820Proof" type="file" accept="image/*"><small>Máximo 1,5 MB.</small></div><div class="field"><label>Observación</label><textarea id="nv820PayNote" placeholder="Pago parcial, compromiso o referencia"></textarea></div><div class="nv820AllocationPreview" id="nv820AllocationPreview"></div><button class="btn block" id="nv820SavePayment">Guardar pago y generar recibo</button>`,(overlay,close)=>{
      const mode=$('#nv820PayMode',overlay), amount=$('#nv820PayAmount',overlay), list=$('#nv820PayOperations',overlay), preview=$('#nv820AllocationPreview',overlay);
      const renderOps=()=>{
        const value=mode.value;
        if(value==='total'){amount.value=account.totalDebt;amount.readOnly=true;}else amount.readOnly=false;
        const selectable=['specific','multiple'].includes(value);
        list.innerHTML=account.active.slice().sort((a,b)=>Core.operationDate(a)-Core.operationDate(b)).map((op,i)=>`<label class="nv820PayChoice ${selectable?'':'disabled'}"><input type="${value==='specific'?'radio':'checkbox'}" name="nv820DebtChoice" value="${esc(op.id)}" ${selectable?(i===0?'checked':''):'disabled'}><span><strong>${esc(operationLabelV820(op))}</strong><small>${dateText(Core.operationDate(op))} · Saldo ${money(saleBalanceV820(op))}</small></span></label>`).join('');
        refreshPreview();
      };
      const selected=()=>Array.from($all('[name="nv820DebtChoice"]:checked',overlay)).map(x=>x.value);
      const refreshPreview=()=>{try{const result=Core.allocatePayment(account.active,activePaymentsV820(),Number(amount.value||0),mode.value,selected());preview.className='nv820AllocationPreview ok';preview.innerHTML=`<strong>Distribución prevista</strong>${result.allocations.map(a=>{const op=account.active.find(x=>x.id===a.operationId);return `<span>${esc(operationLabelV820(op))}: ${money(a.amount)} → saldo ${money(a.balanceAfter)}</span>`;}).join('')}`;}catch(err){preview.className='nv820AllocationPreview error';preview.textContent=err.message||'Revisa el monto.';}};
      $('#closeSheet',overlay).addEventListener('click',close);mode.addEventListener('change',renderOps);amount.addEventListener('input',refreshPreview);list.addEventListener('change',refreshPreview);renderOps();
      $('#nv820SavePayment',overlay).addEventListener('click',async()=>{
        const button=$('#nv820SavePayment',overlay);button.disabled=true;button.textContent='Guardando…';
        try{
          if(!navigator.onLine) throw new Error('Se necesita conexión para registrar el pago. El formulario permanece abierto.');
          const allocation=Core.allocatePayment(account.active,activePaymentsV820(),Number(amount.value||0),mode.value,selected());
          const proof=await readProofImageV820($('#nv820Proof',overlay).files?.[0]);
          const payment={id:uid('pay'),clientId:account.client.id,clientName:account.client.name,amount:allocation.amount,allocations:allocation.allocations,applicationMode:mode.value,method:$('#nv820PayMethod',overlay).value,voucherNumber:$('#nv820Voucher',overlay).value.trim(),proofImage:proof,note:$('#nv820PayNote',overlay).value.trim(),date:new Date($('#nv820PayDate',overlay).value).getTime()||Date.now(),responsibleUserId:currentUserId(),responsibleName:AppState.session.fullName||AppState.session.username||'',ownerUserId:currentUserId(),status:'posted',createdAt:Date.now()};
          payment.saleId=allocation.allocations.length===1?allocation.allocations[0].operationId:'';
          await DB.put('receivablePayments',payment);AppState.receivablePayments=await DB.getAll('receivablePayments');
          await writeAudit('receivable_payment_posted','receivablePayments',payment.id,null,{clientId:payment.clientId,amount:payment.amount,allocations:payment.allocations,method:payment.method});
          const after=clientAccountV820(account.client.id); const kind=after.totalDebt<=.009?'REC':'RPP'; const doc=await createPaymentDocumentV820(payment,after,kind);
          close();showToast('Pago registrado y recibo generado.');openFinancialDocumentPreviewV820(doc);if(AppState.currentTab==='estado-cuenta')renderClientAccountV820();
        }catch(err){button.disabled=false;button.textContent='Guardar pago y generar recibo';showToast(err.message||'No se pudo guardar el pago.','error');}
      });
    });
  }

  async function voidPaymentV820(paymentId,account){
    const payment=(AppState.receivablePayments||[]).find(p=>p.id===paymentId);if(!payment)return;
    const reason=window.prompt('Motivo obligatorio para anular el pago:','');if(!reason?.trim())return showToast('La anulación requiere un motivo.','error');
    if(!window.confirm(`Se anulará el pago de ${money(payment.amount)}. El saldo volverá a calcularse. ¿Continuar?`))return;
    const before=Object.assign({},payment);const updated=Object.assign({},payment,{status:'voided',voidedAt:Date.now(),voidedBy:currentUserId(),voidReason:reason.trim(),updatedAt:Date.now()});
    await DB.put('receivablePayments',updated);AppState.receivablePayments=await DB.getAll('receivablePayments');await writeAudit('receivable_payment_voided','receivablePayments',payment.id,before,{status:'voided',reason:reason.trim()});showToast('Pago anulado. El saldo fue restaurado.');renderClientAccountV820();
  }

  async function createPaymentDocumentV820(payment,account,kind){
    const prefix=kind==='RPP'?'RPP':'REC';const number=await nextFinancialNumberV820(prefix);const title=kind==='RPP'?'RECIBO DE PAGO PARCIAL':'RECIBO DE PAGO';
    const affectedIds=new Set((payment.allocations||[]).map(a=>String(a.operationId||a.saleId||'')));
    const affected=account.operations.filter(op=>affectedIds.has(String(op.id)));
    return saveFinancialDocumentV820({documentType:kind,prefix,documentNumber:number,title,clientId:account.client.id,clientName:account.client.name,total:payment.amount,balanceAfter:account.totalDebt,paymentId:payment.id,snapshot:{client:account.client,payment,accountTotals:{totalBought:account.totalBought,totalPaid:account.totalPaid,totalDebt:account.totalDebt,balanceBefore:Core.round(account.totalDebt+Number(payment.amount||0)),balanceAfter:account.totalDebt},operations:(affected.length?affected:account.operations).map(operationSnapshotV820),region:regionForAccount(account),seller:sellerForAccount(account),generatedBy:AppState.session.fullName||AppState.session.username||'',generatedAt:Date.now()}});
  }
  async function openPaymentReceiptByIdV820(paymentId){
    let doc=(AppState.financialDocuments||[]).find(d=>d.paymentId===paymentId);const payment=(AppState.receivablePayments||[]).find(p=>p.id===paymentId);if(!payment)return;
    if(!doc)doc=await createPaymentDocumentV820(payment,clientAccountV820(payment.clientId),clientAccountV820(payment.clientId).totalDebt<=.009?'REC':'RPP');
    openFinancialDocumentPreviewV820(doc);
  }
  function operationSnapshotV820(op){const due=Core.dueDate(op);const pending=saleBalanceV820(op);const days=pending>.009&&due?Math.max(0,Math.floor((Date.now()-due)/86400000)):0;return {id:op.id,documentNumber:operationLabelV820(op),date:Core.operationDate(op),dueDate:due,items:op.items||[],products:op.products||'',total:Number(op.total||0),paid:salePaidTotalV820(op),balance:pending,status:operationStatusV820(op),daysLate:days,historical:op.operationKind==='historical'||op.historicalActive,origin:op.origin||'',observations:op.observations||op.pendingReason||''}; }

  const DOC_META={EC:{prefix:'EC',title:'ESTADO DE CUENTA'},COB:{prefix:'COB',title:'ESTADO DE CUENTA Y RECIBO CONSOLIDADO DE COBRO'},PPA:{prefix:'PPA',title:'PLAN DE PAGOS'},CAN:{prefix:'CAN',title:'CONSTANCIA DE CANCELACIÓN TOTAL'},INF:{prefix:'INF',title:'INFORME DE DEUDA POR CLIENTE'},HFC:{prefix:'HFC',title:'HISTORIAL FINANCIERO DEL CLIENTE'},CXC:{prefix:'CXC',title:'INFORME GENERAL DE CUENTAS POR COBRAR'}};
  function requestClientDocumentV820(clientId,type='EC'){
    if(type==='PPA') return openPaymentPlanFormV820(clientId);
    if(['EC','COB','INF','HFC'].includes(type)) return openDocumentModePickerV820(clientId,type);
    return generateClientDocumentV820(clientId,type,'detailed');
  }
  function openDocumentModePickerV820(clientId,type){
    const meta=DOC_META[type]||DOC_META.EC;
    openSheet(`<h2>${esc(meta.title)} <span class="x" id="closeSheet">✕</span></h2><div class="nv820SafetyNote"><strong>Selecciona el nivel de detalle</strong><span>La versión resumida presenta saldos por operación. La detallada incluye productos y pagos parciales.</span></div><div class="nv820DocumentMode"><button class="btn outline" data-mode="summary"><strong>Versión resumida</strong><small>Más compacta para compartir o imprimir.</small></button><button class="btn" data-mode="detailed"><strong>Versión detallada</strong><small>Incluye el historial y detalle de productos.</small></button></div>`,(overlay,close)=>{
      $('#closeSheet',overlay)?.addEventListener('click',close);
      $all('[data-mode]',overlay).forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{close();await generateClientDocumentV820(clientId,type,button.dataset.mode);}catch(err){showToast(err.message||'No se pudo generar el documento.','error');}}));
    });
  }
  function addScheduleDateV820(base,index,frequency){
    const d=new Date(base);
    if(frequency==='weekly') d.setDate(d.getDate()+index*7);
    else if(frequency==='biweekly') d.setDate(d.getDate()+index*15);
    else d.setMonth(d.getMonth()+index);
    return d.getTime();
  }
  function buildPaymentScheduleV820(total,count,firstDate,frequency){
    const safeCount=Math.max(1,Math.min(36,Number(count||1)));
    const baseAmount=Core.round(Number(total||0)/safeCount);
    let assigned=0;
    return Array.from({length:safeCount},(_,index)=>{
      const amount=index===safeCount-1?Core.round(Number(total||0)-assigned):baseAmount;
      assigned=Core.round(assigned+amount);
      return {number:index+1,dueDate:addScheduleDateV820(firstDate,index,frequency),amount,status:'pending',paid:0};
    });
  }
  function openPaymentPlanFormV820(clientId){
    const account=clientAccountV820(clientId);if(!account||account.totalDebt<=.009)return showToast('Este cliente no tiene saldo para programar.','error');
    const today=new Date();today.setDate(today.getDate()+7);const dateValue=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
    openSheet(`<h2>Crear plan de pagos <span class="x" id="closeSheet">✕</span></h2><div class="nv820PaySummary"><strong>${esc(account.client.name)}</strong><span>Deuda a programar: <b>${money(account.totalDebt)}</b></span></div><div class="field-row"><div class="field"><label>Número de cuotas</label><input id="nv820PlanCount" type="number" min="1" max="36" value="4"></div><div class="field"><label>Frecuencia</label><select id="nv820PlanFrequency"><option value="monthly">Mensual</option><option value="biweekly">Quincenal</option><option value="weekly">Semanal</option></select></div></div><div class="field"><label>Primera fecha de pago</label><input id="nv820PlanFirst" type="date" value="${dateValue}"></div><div class="field"><label>Observaciones / compromiso</label><textarea id="nv820PlanNotes" placeholder="Condiciones acordadas con el cliente"></textarea></div><div id="nv820PlanPreview" class="nv820PlanPreview"></div><button class="btn block" id="nv820SavePlan">Guardar y generar plan de pagos</button>`,(overlay,close)=>{
      const count=$('#nv820PlanCount',overlay),frequency=$('#nv820PlanFrequency',overlay),first=$('#nv820PlanFirst',overlay),preview=$('#nv820PlanPreview',overlay);
      const refresh=()=>{const firstDate=new Date(`${first.value||dateValue}T12:00:00`).getTime();const schedule=buildPaymentScheduleV820(account.totalDebt,count.value,firstDate,frequency.value);preview.innerHTML=`<strong>${schedule.length} cuotas</strong>${schedule.slice(0,12).map(row=>`<span><b>Cuota ${row.number}</b><small>${dateText(row.dueDate)}</small><em>${money(row.amount)}</em></span>`).join('')}${schedule.length>12?`<small>… y ${schedule.length-12} cuotas adicionales</small>`:''}`;};
      [count,frequency,first].forEach(el=>el.addEventListener('input',refresh));refresh();
      $('#closeSheet',overlay)?.addEventListener('click',close);
      $('#nv820SavePlan',overlay)?.addEventListener('click',async()=>{const button=$('#nv820SavePlan',overlay);button.disabled=true;button.textContent='Generando…';try{const firstDate=new Date(`${first.value}T12:00:00`).getTime();if(!first.value||!Number.isFinite(firstDate))throw new Error('Selecciona una fecha válida.');const schedule=buildPaymentScheduleV820(account.totalDebt,count.value,firstDate,frequency.value);const number=await nextFinancialNumberV820('PPA');const plan={id:uid('plan'),ownerUserId:currentUserId(),clientId:account.client.id,clientName:account.client.name,documentNumber:number,total:account.totalDebt,frequency:frequency.value,schedule,notes:$('#nv820PlanNotes',overlay).value.trim(),status:'active',createdAt:Date.now(),updatedAt:Date.now()};await DB.put('paymentPlans',plan);AppState.paymentPlans=await DB.getAll('paymentPlans');await writeAudit('payment_plan_created','paymentPlans',plan.id,null,{clientId:plan.clientId,total:plan.total,installments:schedule.length,documentNumber:number});const doc=await saveFinancialDocumentV820({documentType:'PPA',prefix:'PPA',documentNumber:number,title:DOC_META.PPA.title,clientId:account.client.id,clientName:account.client.name,total:account.totalDebt,mode:'detailed',paymentPlanId:plan.id,snapshot:{client:account.client,accountTotals:{totalBought:account.totalBought,totalPaid:account.totalPaid,totalDebt:account.totalDebt,pendingCount:account.pendingCount},operations:account.active.map(operationSnapshotV820),planSchedule:schedule,planFrequency:frequency.value,planNotes:plan.notes,region:regionForAccount(account),seller:sellerForAccount(account),generatedBy:AppState.session.fullName||'',generatedAt:Date.now()}});close();openFinancialDocumentPreviewV820(doc);}catch(err){button.disabled=false;button.textContent='Reintentar';showToast(err.message||'No se pudo crear el plan.','error');}});
    });
  }
  async function generateClientDocumentV820(clientId,type='EC',mode='detailed'){
    const account=clientAccountV820(clientId);if(!account)return showToast('No se encontró el cliente.','error');
    if(type==='CAN'&&account.totalDebt>.009)return showToast('No se puede generar constancia mientras exista saldo pendiente.','error');
    const meta=DOC_META[type]||DOC_META.EC;const number=await nextFinancialNumberV820(meta.prefix);
    const doc=await saveFinancialDocumentV820({documentType:type,prefix:meta.prefix,documentNumber:number,title:meta.title,clientId:account.client.id,clientName:account.client.name,total:account.totalDebt,mode,snapshot:{client:account.client,accountTotals:{totalBought:account.totalBought,totalPaid:account.totalPaid,totalDebt:account.totalDebt,pendingCount:account.pendingCount,lastPaymentDate:account.lastPaymentDate,oldestDebtDate:account.oldestDebtDate,daysLate:account.daysLate},operations:(type==='EC'||type==='COB'||type==='INF'?account.active:account.operations).map(operationSnapshotV820),payments:account.payments.map(p=>({id:p.id,date:p.date,amount:p.amount,method:p.method,note:p.note,voucherNumber:p.voucherNumber,status:p.status})),region:regionForAccount(account),seller:sellerForAccount(account),generatedBy:AppState.session.fullName||AppState.session.username||'',generatedAt:Date.now()}});
    openFinancialDocumentPreviewV820(doc);
  }
  async function openGeneralReceivablesReportV820(){
    const rows=filterSummariesV820(financialClientSummariesV820()).map(a=>({clientId:a.client.id,clientName:a.client.name,phone:a.client.phone,region:regionForAccount(a),seller:sellerForAccount(a),operations:a.pendingCount,oldest:a.oldestDebtDate,lastPayment:a.lastPaymentDate,daysLate:a.daysLate,totalDebt:a.totalDebt}));
    const meta=DOC_META.CXC;const number=await nextFinancialNumberV820(meta.prefix);const doc=await saveFinancialDocumentV820({documentType:'CXC',prefix:meta.prefix,documentNumber:number,title:meta.title,total:Core.round(rows.reduce((s,r)=>s+r.totalDebt,0)),snapshot:{generalRows:rows,generatedBy:AppState.session.fullName||'',generatedAt:Date.now()}});openFinancialDocumentPreviewV820(doc);
  }

  async function loadImageV820(src){if(!src)return null;return new Promise(resolve=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src;});}
  function wrapCanvasTextV820(ctx,text,x,y,maxWidth,lineHeight,maxLines=99){const words=String(text||'').split(/\s+/);let line='',lines=0;for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y);y+=lineHeight;line=word;lines++;if(lines>=maxLines)return y;}else line=test;}if(line&&lines<maxLines){ctx.fillText(line,x,y);y+=lineHeight;}return y;}
  async function buildFinancialDocumentCanvasV820(doc){
    const snap=doc.snapshot||{};const general=Array.isArray(snap.generalRows);const rows=general?snap.generalRows:(snap.operations||[]);const detailed=doc.mode!=='summary';
    const commercial=window.myCommercialProfile?myCommercialProfile():{};
    const [logo,qr]=await Promise.all([loadImageV820(AppState.settings.logo||'img/brand/natura-vida-logo.jpeg'),loadImageV820(!general?(commercial.qrUrl||''):'')]);
    const schedule=Array.isArray(snap.planSchedule)?snap.planSchedule:[];
    const baseHeight=general?520:690;const rowHeight=general?52:(detailed?78:56);const height=Math.max(980,baseHeight+Math.min(rows.length,60)*rowHeight+(snap.payments?.length||0)*36+Math.min(schedule.length,24)*48+(snap.payment?128:0)+(qr?245:50));
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=height;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#eef7f1';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(28,24,844,height-48,26);ctx.fill();
    const grad=ctx.createLinearGradient(28,24,872,190);grad.addColorStop(0,'#064b2e');grad.addColorStop(1,'#16a365');ctx.fillStyle=grad;ctx.beginPath();ctx.roundRect(28,24,844,170,[26,26,8,8]);ctx.fill();
    if(logo){ctx.save();ctx.beginPath();ctx.arc(94,108,48,0,Math.PI*2);ctx.clip();ctx.drawImage(logo,46,60,96,96);ctx.restore();}
    ctx.fillStyle='#fff';ctx.font='800 28px Inter,Arial';ctx.fillText('NATURA VIDA BOLIVIA',160,82);ctx.font='700 20px Inter,Arial';ctx.fillText(doc.title||'DOCUMENTO FINANCIERO',160,116);ctx.font='700 16px JetBrains Mono,monospace';ctx.fillText(doc.documentNumber||'SIN-NÚMERO',160,148);
    let y=232;ctx.fillStyle='#153c2b';ctx.font='700 18px Inter,Arial';
    if(general){ctx.fillText('Resumen general de cuentas por cobrar',56,y);ctx.font='500 14px Inter,Arial';ctx.fillStyle='#5b7166';ctx.fillText(`Emisión: ${fmtDateTime(snap.generatedAt||doc.createdAt)} · Responsable: ${snap.generatedBy||'Administrador'}`,56,y+28);y+=76;}
    else {const c=snap.client||{};ctx.fillText(c.name||doc.clientName||'Cliente',56,y);ctx.font='500 14px Inter,Arial';ctx.fillStyle='#5b7166';ctx.fillText([c.phone,snap.region,snap.seller].filter(Boolean).join(' · '),56,y+28);ctx.textAlign='right';ctx.fillText(`Emisión: ${fmtDateTime(doc.createdAt)}`,844,y);ctx.fillText(`Responsable: ${snap.generatedBy||AppState.session.fullName||''}`,844,y+28);ctx.textAlign='left';y+=72;
      const totals=snap.accountTotals||{};const labels=[['TOTAL COMPRADO',totals.totalBought],['TOTAL PAGADO',totals.totalPaid],['DEUDA TOTAL',totals.totalDebt]];labels.forEach((x,i)=>{const bx=56+i*270;ctx.fillStyle=i===2?'#fff3dc':'#eef7f1';ctx.beginPath();ctx.roundRect(bx,y,250,78,14);ctx.fill();ctx.fillStyle='#557064';ctx.font='700 12px Inter,Arial';ctx.fillText(x[0],bx+16,y+25);ctx.fillStyle=i===2?'#9a5b00':'#074c30';ctx.font='800 23px Inter,Arial';ctx.fillText(money(x[1]),bx+16,y+57);});y+=116;if(snap.payment){const pay=snap.payment;ctx.fillStyle='#eaf8f0';ctx.beginPath();ctx.roundRect(56,y-8,788,104,16);ctx.fill();ctx.fillStyle='#075b35';ctx.font='800 14px Inter,Arial';ctx.fillText('PAGO REGISTRADO',76,y+20);ctx.font='800 25px Inter,Arial';ctx.fillText(money(pay.amount),76,y+54);ctx.fillStyle='#566f63';ctx.font='500 12px Inter,Arial';ctx.fillText(`${paymentMethodLabelV820(pay.method)} · ${fmtDateTime(pay.date||pay.createdAt)}${pay.voucherNumber?' · Comp. '+pay.voucherNumber:''}`,250,y+31);ctx.fillText(`Saldo anterior ${money(totals.balanceBefore)} · Saldo posterior ${money(totals.balanceAfter??totals.totalDebt)}`,250,y+58);if(pay.note)wrapCanvasTextV820(ctx,pay.note,250,y+81,560,16,1);y+=126;}}
    ctx.fillStyle='#17472f';ctx.font='800 15px Inter,Arial';ctx.fillText(general?'CLIENTE / RESPONSABLE':'DETALLE DE OPERACIONES',56,y);ctx.textAlign='right';ctx.fillText('SALDO',844,y);ctx.textAlign='left';y+=24;ctx.strokeStyle='#dce9e1';ctx.beginPath();ctx.moveTo(56,y);ctx.lineTo(844,y);ctx.stroke();y+=28;
    rows.slice(0,60).forEach(row=>{
      if(general){ctx.fillStyle='#173a29';ctx.font='700 15px Inter,Arial';ctx.fillText(String(row.clientName||'Cliente').slice(0,38),56,y);ctx.font='400 12px Inter,Arial';ctx.fillStyle='#65796f';ctx.fillText(`${row.operations} operación(es) · ${row.region||'Sin región'} · ${row.daysLate} días`,56,y+19);ctx.textAlign='right';ctx.fillStyle='#9a5b00';ctx.font='800 16px Inter,Arial';ctx.fillText(money(row.totalDebt),844,y+8);ctx.textAlign='left';y+=rowHeight;}
      else {ctx.fillStyle='#173a29';ctx.font='700 15px Inter,Arial';ctx.fillText(String(row.documentNumber||'Operación').slice(0,32),56,y);ctx.font='400 12px Inter,Arial';ctx.fillStyle='#65796f';ctx.fillText(`${dateText(row.date)}${row.dueDate?` · Vence ${dateText(row.dueDate)}`:''}${row.daysLate?` · ${row.daysLate} días de atraso`:''}${row.historical?' · Mi Negocio':''}`,56,y+18);if(detailed){ctx.font='400 12px Inter,Arial';wrapCanvasTextV820(ctx,itemsSummaryV820(row,true),56,y+37,530,16,2);}ctx.textAlign='right';ctx.font='600 12px Inter,Arial';ctx.fillStyle='#5b7166';ctx.fillText(`Total ${money(row.total)} · Pagado ${money(row.paid)}`,844,y);ctx.font='800 17px Inter,Arial';ctx.fillStyle=row.balance>0?'#9a5b00':'#087744';ctx.fillText(money(row.balance),844,y+25);ctx.textAlign='left';y+=rowHeight;}
      ctx.strokeStyle='#edf2ef';ctx.beginPath();ctx.moveTo(56,y-12);ctx.lineTo(844,y-12);ctx.stroke();
    });
    if(rows.length>60){ctx.fillStyle='#8b5a16';ctx.font='600 13px Inter,Arial';ctx.fillText(`Se muestran 60 de ${rows.length} registros. Descarga el informe CSV para el detalle total.`,56,y);y+=34;}
    if(!general&&schedule.length){ctx.fillStyle='#17472f';ctx.font='800 15px Inter,Arial';ctx.fillText('CRONOGRAMA DEL PLAN DE PAGOS',56,y+8);y+=36;schedule.slice(0,24).forEach(row=>{ctx.fillStyle='#173a29';ctx.font='700 14px Inter,Arial';ctx.fillText(`Cuota ${row.number}`,56,y);ctx.fillStyle='#65796f';ctx.font='500 12px Inter,Arial';ctx.fillText(dateText(row.dueDate),190,y);ctx.textAlign='right';ctx.fillStyle='#075b35';ctx.font='800 15px Inter,Arial';ctx.fillText(money(row.amount),844,y);ctx.textAlign='left';ctx.strokeStyle='#edf2ef';ctx.beginPath();ctx.moveTo(56,y+15);ctx.lineTo(844,y+15);ctx.stroke();y+=48;});if(schedule.length>24){ctx.fillStyle='#8b5a16';ctx.font='600 12px Inter,Arial';ctx.fillText(`Se muestran 24 de ${schedule.length} cuotas.`,56,y);y+=28;}if(snap.planNotes){ctx.fillStyle='#566f63';ctx.font='500 12px Inter,Arial';y=wrapCanvasTextV820(ctx,`Condiciones: ${snap.planNotes}`,56,y,788,18,3);}}
    const total=general?doc.total:(snap.payment?Number(snap.payment.amount||doc.total||0):(snap.accountTotals?.totalDebt||doc.total||0));const totalLabel=general?'TOTAL GENERAL POR COBRAR':(snap.payment?'MONTO RECIBIDO':'DEUDA TOTAL ACUMULADA');ctx.fillStyle='#075b35';ctx.beginPath();ctx.roundRect(56,y+12,788,92,18);ctx.fill();ctx.fillStyle='#d9f3e5';ctx.font='700 14px Inter,Arial';ctx.fillText(totalLabel,78,y+48);ctx.fillStyle='#fff';ctx.textAlign='right';ctx.font='800 30px Inter,Arial';ctx.fillText(money(total),820,y+59);ctx.textAlign='left';y+=136;
    if(!general){ctx.fillStyle='#566f63';ctx.font='500 13px Inter,Arial';y=wrapCanvasTextV820(ctx,'Los registros históricos conservan su fecha y saldo original y no generan un nuevo movimiento de inventario.',56,y,788,19,3);const contact=[commercial.businessName,commercial.address,commercial.locationLabel,AppState.session.phone].filter(Boolean).join(' · ');if(qr){ctx.fillStyle='#f5faf7';ctx.beginPath();ctx.roundRect(56,y+18,788,205,16);ctx.fill();ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,76,y+38,165,165);ctx.imageSmoothingEnabled=true;ctx.fillStyle='#17472f';ctx.font='800 15px Inter,Arial';ctx.fillText('QR DE PAGO',270,y+65);ctx.fillStyle='#566f63';ctx.font='500 13px Inter,Arial';let qy=wrapCanvasTextV820(ctx,'Escanee el código para realizar el pago. Verifique el nombre del titular antes de confirmar.',270,y+92,540,19,4);if(contact)wrapCanvasTextV820(ctx,contact,270,qy+6,540,18,3);y+=242;}else{ctx.fillStyle='#8b5a16';ctx.font='600 13px Inter,Arial';ctx.fillText('QR de pago no configurado. Consulte al responsable los datos para realizar el pago.',56,y+24);if(contact){ctx.fillStyle='#566f63';ctx.font='500 12px Inter,Arial';wrapCanvasTextV820(ctx,contact,56,y+46,788,18,2);}y+=82;}ctx.strokeStyle='#aabbb2';ctx.beginPath();ctx.moveTo(56,y+46);ctx.lineTo(330,y+46);ctx.moveTo(570,y+46);ctx.lineTo(844,y+46);ctx.stroke();ctx.fillStyle='#62776d';ctx.font='500 12px Inter,Arial';ctx.fillText('Firma del responsable',120,y+66);ctx.fillText('Conformidad del cliente',650,y+66);}
    ctx.fillStyle='#92a59b';ctx.textAlign='center';ctx.font='500 12px Inter,Arial';ctx.fillText('Documento generado por Natura Vida Bolivia · Control financiero interno',450,height-46);ctx.textAlign='left';return canvas;
  }
  function downloadCanvasPagedPdfV820(canvas,fileName){
    if(!window.jspdf)return window.downloadCanvasV7?downloadCanvasV7(canvas,fileName,'pdf'):null;
    const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'p',unit:'pt',format:'a4'});const pageW=595.28,pageH=841.89,margin=24,usableW=pageW-margin*2,usableH=pageH-margin*2;const scale=usableW/canvas.width;const sliceHeight=Math.floor(usableH/scale);let top=0,page=0;
    while(top<canvas.height){if(page>0)pdf.addPage();const h=Math.min(sliceHeight,canvas.height-top);const part=document.createElement('canvas');part.width=canvas.width;part.height=h;part.getContext('2d').drawImage(canvas,0,top,canvas.width,h,0,0,canvas.width,h);pdf.addImage(part.toDataURL('image/jpeg',.94),'JPEG',margin,margin,usableW,h*scale);top+=h;page++;}pdf.save(`${fileName}.pdf`);showToast('PDF descargado.');
  }
  function printCanvasV820(canvas){const win=window.open('','_blank');if(!win)return showToast('El navegador bloqueó la ventana de impresión.','error');win.document.write(`<html><head><title>Imprimir</title><style>body{margin:0;text-align:center}img{max-width:100%;height:auto}</style></head><body><img src="${canvas.toDataURL('image/jpeg',.94)}" onload="window.print()"></body></html>`);win.document.close();}
  async function shareCanvasV820(canvas,fileName,doc){const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.94));const file=new File([blob],`${fileName}.jpg`,{type:'image/jpeg'});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){try{return await navigator.share({files:[file],title:doc.title,text:`${doc.documentNumber} · ${doc.clientName||''} · ${money(doc.total)}`});}catch(_){}}const phone=doc.snapshot?.client?.phone||'';const url=window.whatsappUrlV723?whatsappUrlV723(phone,`${doc.title} ${doc.documentNumber}. Saldo: ${money(doc.total)}.`):'';if(url)window.open(url,'_blank','noopener');else showToast('No fue posible abrir el menú de compartir.','error');}
  async function openFinancialDocumentPreviewV820(doc){
    const canvas=await buildFinancialDocumentCanvasV820(doc);const file=String(doc.documentNumber||`NV-${Date.now()}`).replace(/[^a-z0-9_-]/gi,'_');
    openSheet(`<h2>${esc(doc.title||'Documento financiero')} <span class="x" id="closeSheet">✕</span></h2><div class="nv820DocPreview"><img id="nv820DocImage" alt="${esc(doc.title||'Documento')}"></div><div class="nv820DocActions"><button class="btn outline" id="nv820Pdf">PDF</button><button class="btn outline" id="nv820Image">Imagen</button><button class="btn outline" id="nv820Print">Imprimir</button><button class="btn" id="nv820Share">Compartir / WhatsApp</button></div>`,(overlay,close)=>{ $('#nv820DocImage',overlay).src=canvas.toDataURL('image/jpeg',.9);$('#closeSheet',overlay).addEventListener('click',close);$('#nv820Pdf',overlay).addEventListener('click',()=>downloadCanvasPagedPdfV820(canvas,file));$('#nv820Image',overlay).addEventListener('click',()=>window.downloadCanvasV7?downloadCanvasV7(canvas,file,'jpg'):null);$('#nv820Print',overlay).addEventListener('click',()=>printCanvasV820(canvas));$('#nv820Share',overlay).addEventListener('click',()=>shareCanvasV820(canvas,file,doc));});
  }

  function csvEscapeV820(value){const s=String(value??'');return /[",\n;]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
  function downloadTextV820(name,text,type='text/plain'){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function exportReceivablesCsvV820(){
    const rows=filterSummariesV820(financialClientSummariesV820());
    const head=['Cliente','WhatsApp','Región','Responsable','Operaciones pendientes','Deuda más antigua','Último pago','Días de atraso','Total adeudado'];
    const lines=[head,...rows.map(a=>[a.client.name||'',a.client.phone||'',regionForAccount(a),sellerForAccount(a),a.pendingCount,a.oldestDebtDate?dateText(a.oldestDebtDate):'',a.lastPaymentDate?dateText(a.lastPaymentDate):'',a.daysLate,a.totalDebt])];
    const csv='\uFEFF'+lines.map(row=>row.map(csvEscapeV820).join(';')).join('\n');downloadTextV820(`cuentas_por_cobrar_${new Date().toISOString().slice(0,10)}.csv`,csv,'text/csv;charset=utf-8');showToast('Cuentas por cobrar exportadas.');
  }
  function exportClientFinancialCsvV820(clientId){
    const account=clientAccountV820(clientId);if(!account)return showToast('No se encontró la ficha financiera.','error');
    const head=['Cliente','Fecha','Documento','Productos','Total venta','Pagado','Saldo','Estado','Origen','Observaciones'];
    const lines=[head,...account.operations.slice().sort((a,b)=>Core.operationDate(a)-Core.operationDate(b)).map(op=>[account.client.name||'',dateText(Core.operationDate(op)),operationLabelV820(op),itemsSummaryV820(op,true),Number(op.total||0),salePaidTotalV820(op),saleBalanceV820(op),operationStatusV820(op).label,op.origin||'',op.observations||op.pendingReason||''])];
    const csv='\uFEFF'+lines.map(row=>row.map(csvEscapeV820).join(';')).join('\n');downloadTextV820(`estado_cuenta_${norm(account.client.name).replace(/\s+/g,'_')||'cliente'}.csv`,csv,'text/csv;charset=utf-8');showToast('Historial financiero exportado.');
  }
  function parseCsvV820(text){
    const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);if(!lines.length)return[];const delimiter=lines[0].includes(';')?';':',';
    const parse=line=>{const out=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out;};
    const headers=parse(lines.shift()).map(h=>norm(h).replace(/\s/g,''));return lines.map(line=>{const cells=parse(line);const o={};headers.forEach((h,i)=>o[h]=cells[i]||'');return {clientName:o.cliente||o.clientname||o.nombre,date:o.fecha||o.date,originalSaleNumber:o.numeroventa||o.venta||o.documento,total:Number(String(o.totalventa||o.total||'0').replace(',','.')),amountPaid:Number(String(o.pagado||o.amountpaid||'0').replace(',','.')),balance:Number(String(o.saldo||o.saldopendiente||'0').replace(',','.')),products:o.productos||o.detalle||'',observations:o.observaciones||o.nota||''};});
  }
  function historicalPreviewHtmlV820(rows){const existing=new Set((AppState.historicalReceivables||[]).map(r=>r.historicalImportKey));const normalized=rows.map(r=>Core.normalizeHistoricalRow(r)).filter(r=>r.clientName&&r.total>0);const fresh=normalized.filter(r=>!existing.has(r.historicalImportKey));return {normalized,fresh,html:`<div class="nv820ImportSummary"><strong>${fresh.length} nuevos</strong><span>${normalized.length-fresh.length} duplicados omitidos</span><b>${money(fresh.reduce((s,r)=>s+r.pendingBalance,0))} saldo a incorporar</b></div><div class="nv820ImportRows">${normalized.slice(0,20).map(r=>`<div class="${existing.has(r.historicalImportKey)?'duplicate':''}"><span><strong>${esc(r.clientName)}</strong><small>${esc(r.originalDate||'sin fecha')} · ${esc(r.originalSaleNumber||'sin número')}</small></span><b>${money(r.pendingBalance)}</b></div>`).join('')}</div>`};}
  async function importHistoricalRowsV820(rows){
    const existing=new Set((AppState.historicalReceivables||[]).map(r=>r.historicalImportKey));let imported=0,skipped=0,total=0;
    for(const raw of rows){let row=Core.normalizeHistoricalRow(raw);if(!row.clientName||row.total<=0){skipped++;continue;}if(existing.has(row.historicalImportKey)){skipped++;continue;}
      let client=(AppState.clients||[]).find(c=>norm(c.name)===norm(row.clientName));if(!client&&row.clientPhone)client=(AppState.clients||[]).find(c=>window.normalizePhoneV723&&normalizePhoneV723(c.phone)===normalizePhoneV723(row.clientPhone));
      if(!client)client=await findOrCreateClientQuick(row.clientName,row.clientPhone||'','unclassified',{notes:'Cliente recuperado desde Mi Negocio'});
      row=Object.assign({},row,{clientId:client.id,clientName:client.name,clientPhone:client.phone||row.clientPhone,ownerUserId:currentUserId(),sellerId:currentUserId(),sellerName:AppState.session.fullName||'',regionName:client.regionName||client.city||'',importedAt:Date.now(),importedBy:currentUserId()});
      await DB.put('historicalReceivables',row);existing.add(row.historicalImportKey);imported++;total+=row.pendingBalance;
    }
    AppState.historicalReceivables=await DB.getAll('historicalReceivables');await writeAudit('historical_receivables_imported','historicalReceivables','batch_'+Date.now(),null,{imported,skipped,total:Core.round(total),origin:'Mi Negocio',inventoryImpact:false});return {imported,skipped,total:Core.round(total)};
  }
  function openHistoricalImportV820(){
    openSheet(`<h2>Importar deudas históricas <span class="x" id="closeSheet">✕</span></h2><div class="nv820SafetyNote"><strong>Importación segura</strong><span>Cada venta se conserva separada, queda activa y no vuelve a descontar inventario.</span></div><div class="field"><label>Archivo JSON o CSV de Mi Negocio</label><input id="nv820ImportFile" type="file" accept=".json,.csv,text/csv,application/json"></div><div class="nv820ImportActions"><button class="btn outline" id="nv820Template">Descargar plantilla CSV</button><button class="btn outline" id="nv820Gabriela">Cargar caso confirmado: Gabriela Espinoza</button></div><div id="nv820ImportPreview" class="nv820ImportPreview"><p>Selecciona un archivo para revisar antes de importar.</p></div><button class="btn block" id="nv820ConfirmImport" disabled>Confirmar importación</button>`,(overlay,close)=>{
      let current=[];const preview=$('#nv820ImportPreview',overlay),confirm=$('#nv820ConfirmImport',overlay);
      const setRows=rows=>{current=rows;const p=historicalPreviewHtmlV820(rows);preview.innerHTML=p.html;confirm.disabled=!p.fresh.length;};
      $('#closeSheet',overlay).addEventListener('click',close);
      $('#nv820ImportFile',overlay).addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;const text=await file.text();setRows(file.name.toLowerCase().endsWith('.json')?JSON.parse(text):parseCsvV820(text));}catch(err){showToast('No se pudo leer el archivo: '+err.message,'error');}});
      $('#nv820Template',overlay).addEventListener('click',()=>downloadTextV820('plantilla_deudas_mi_negocio.csv','cliente;fecha;numero_venta;productos;total_venta;pagado;saldo_pendiente;observaciones\nCliente ejemplo;20/07/2026;VEN-0001;Aceite de coco;500;100;400;Pago parcial','text/csv;charset=utf-8'));
      $('#nv820Gabriela',overlay).addEventListener('click',async()=>{try{const response=await fetch('data/imports/gabriela-espinoza-mi-negocio.json',{cache:'no-store'});setRows(await response.json());}catch(err){showToast('No se pudo cargar el archivo incluido.','error');}});
      confirm.addEventListener('click',async()=>{confirm.disabled=true;confirm.textContent='Importando…';try{const result=await importHistoricalRowsV820(current);close();showToast(`${result.imported} deudas importadas · ${money(result.total)} pendientes.`);renderReceivablesV820();}catch(err){confirm.disabled=false;confirm.textContent='Confirmar importación';showToast(err.message||'No se pudo importar.','error');}});
    });
  }

  Object.assign(window,{renderReceivablesV820,renderReceivablesV725:renderReceivablesV820,renderClientAccountV820,openClientAccountV820,openPaymentFormV820,generateClientDocumentV820,openFinancialDocumentPreviewV820,saleBalanceV820,salePaidTotalV820,receivableSalesV820,receivableTotalsV820,saleBalanceV725:saleBalanceV820,salePaidTotalV725:salePaidTotalV820,receivableSalesV725:receivableSalesV820,receivableTotalsV725:receivableTotalsV820,importHistoricalRowsV820,requestClientDocumentV820,openPaymentPlanFormV820,exportReceivablesCsvV820,exportClientFinancialCsvV820});
})();
