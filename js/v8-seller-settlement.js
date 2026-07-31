/* NATURA VIDA V8.2.9 — Rendición de caja visible, movimientos verificables y configuración guiada.
   El efectivo se calcula con ventas y pagos registrados. Los pagos QR/transferencia
   se separan del dinero físico y pueden verificarse manualmente hasta conectar un
   proveedor bancario real. */
(function(){
  'use strict';

  const VERSION='8.2.9';
  const TABLE_SETTLEMENTS='nv_seller_settlements';
  const TABLE_VERIFY='nv_payment_verifications';
  let selectedSellerId='';
  let cache={settlements:[],verifications:[],loading:false,error:'',schemaReady:true};

  const esc=v=>window.escapeHtml?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>window.fmtMoney?fmtMoney(Number(v)||0):`Bs ${(Number(v)||0).toFixed(2)}`;
  const uidNow=()=>String(window.AppState?.session?.onlineUserId||window.AppState?.session?.userId||'');
  const roleNow=()=>String(window.AppState?.session?.commercialRole||'');
  const isAdminUser=()=>!!(window.isAdmin&&isAdmin());
  const canManage=()=>isAdminUser()||!!(window.canManageTeamV800&&canManageTeamV800());
  const canOpen=()=>roleNow()==='field_seller'||canManage();
  const sb=()=>window.getSupabaseClient?getSupabaseClient():null;
  const round=v=>Math.round((Number(v)||0)*100)/100;
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  const dateMs=v=>{const n=Number(new Date(v||0));return Number.isFinite(n)?n:0;};
  const methodLabel=m=>({cash:'Efectivo',qr:'QR',transfer:'Transferencia',deposit:'Depósito',other:'Otro'})[m]||m||'Sin método';
  const isCash=m=>String(m||'cash')==='cash';
  const isDigital=m=>['qr','transfer','deposit'].includes(String(m||''));

  function profiles(){
    const rows=[...(window.AppState?.allProfiles||[]),...(window.AppState?.manageableProfiles||[])];
    const map=new Map(); rows.forEach(p=>p?.id&&map.set(String(p.id),p));
    return [...map.values()];
  }
  function profileName(id){
    const p=profiles().find(x=>String(x.id)===String(id));
    return p?.full_name||p?.fullName||p?.display_name||p?.name||p?.email||'Vendedor';
  }
  function profileFor(id){return profiles().find(x=>String(x.id)===String(id))||null;}
  function sellerIds(){
    const ids=new Set();
    profiles().forEach(p=>{if(String(p.commercial_role||p.commercialRole)==='field_seller')ids.add(String(p.id));});
    (window.AppState?.sales||[]).forEach(s=>{const id=s.sellerId||s.seller_id;if(id)ids.add(String(id));});
    if(roleNow()==='field_seller') ids.add(uidNow());
    return [...ids];
  }
  function currentSeller(){
    if(roleNow()==='field_seller')return uidNow();
    if(selectedSellerId)return selectedSellerId;
    return sellerIds()[0]||uidNow();
  }
  function paidAtSale(sale){
    const total=Number(sale.total)||0;
    const direct=Number(sale.amountPaid??sale.paidAmount??sale.totalPaid);
    if(Number.isFinite(direct))return Math.max(0,Math.min(total||direct,direct));
    return sale.paymentStatus==='paid'?total:0;
  }
  function cashEventsForSeller(sellerId){
    const events=[];
    const sellerProfile=profileFor(sellerId);const sellerNames=new Set([profileName(sellerId),sellerProfile?.full_name,sellerProfile?.fullName,sellerProfile?.display_name,sellerProfile?.name,sellerProfile?.email].map(norm).filter(Boolean));
    (window.AppState?.sales||[]).filter(s=>{if(s.deletedAt||s.deleted_at)return false;const idMatch=String(s.sellerId||s.seller_id||s.createdBy||'')===String(sellerId);const nameMatch=sellerNames.has(norm(s.sellerName||s.seller_name||s.responsibleName||''));return idMatch||nameMatch;}).forEach(s=>{
      const amount=paidAtSale(s); if(amount<=0)return;
      const method=String(s.paymentMethod||s.payment_method||'cash');
      events.push({id:`sale:${s.id}`,sourceKind:'sale',sourceId:String(s.id),amount:round(amount),method,date:dateMs(s.date||s.createdAt),clientName:s.clientName||'Cliente',document:s.documentNumber||s.receiptNumber||'Venta'});
    });
    (window.AppState?.receivablePayments||[]).filter(p=>{if(p.deletedAt||p.status==='voided')return false;const idMatch=String(p.responsibleUserId||p.sellerId||p.createdBy||'')===String(sellerId);const nameMatch=sellerNames.has(norm(p.responsibleName||p.sellerName||p.createdByName||''));return idMatch||nameMatch;}).forEach(p=>{
      const amount=Number(p.amount)||0;if(amount<=0)return;
      const method=String(p.method||'cash');
      events.push({id:`payment:${p.id}`,sourceKind:'payment',sourceId:String(p.id),amount:round(amount),method,date:dateMs(p.date||p.createdAt),clientName:p.clientName||'Cliente',document:p.receiptNumber||p.voucherNumber||'Pago'});
    });
    return events.sort((a,b)=>b.date-a.date);
  }
  function verificationMap(){return new Map(cache.verifications.map(v=>[`${v.source_kind}:${v.source_id}`,v]));}
  function totalsForSeller(sellerId){
    const events=cashEventsForSeller(sellerId),ver=verificationMap();
    const cash=events.filter(e=>isCash(e.method));
    const digital=events.filter(e=>isDigital(e.method));
    const confirmed=cache.settlements.filter(x=>x.status==='confirmed').reduce((s,x)=>s+Number(x.cash_delivered||0),0);
    const pending=cache.settlements.filter(x=>x.status==='pending').reduce((s,x)=>s+Number(x.cash_delivered||0),0);
    const cashCollected=round(cash.reduce((s,e)=>s+e.amount,0));
    const digitalCollected=round(digital.reduce((s,e)=>s+e.amount,0));
    const digitalVerified=round(digital.filter(e=>ver.get(`${e.sourceKind}:${e.sourceId}`)?.status==='verified').reduce((s,e)=>s+e.amount,0));
    return {events,cash,digital,cashCollected,digitalCollected,digitalVerified,confirmed:round(confirmed),pending:round(pending),cashAvailable:round(Math.max(0,cashCollected-confirmed-pending))};
  }

  async function loadRemote(sellerId){
    cache={settlements:[],verifications:[],loading:true,error:'',schemaReady:true};
    if(!navigator.onLine||!sb())return cache={...cache,loading:false,error:'Se necesita conexión para consultar rendiciones compartidas.',schemaReady:false};
    try{
      const client=sb();
      const a=await client.from(TABLE_SETTLEMENTS).select('*').eq('seller_user_id',sellerId).order('created_at',{ascending:false}).limit(100);
      const b=await client.from(TABLE_VERIFY).select('*').eq('seller_user_id',sellerId).order('created_at',{ascending:false}).limit(300);
      const errors=[a.error,b.error].filter(Boolean);
      const missing=errors.find(error=>/could not find the table|schema cache|relation .* does not exist/i.test(String(error?.message||'')));
      if(missing)return cache={settlements:a.data||[],verifications:b.data||[],loading:false,error:'La tabla de rendiciones todavía no está habilitada en Supabase.',schemaReady:false};
      if(errors.length)throw errors[0];
      cache={settlements:a.data||[],verifications:b.data||[],loading:false,error:'',schemaReady:true};
    }catch(error){cache={settlements:[],verifications:[],loading:false,error:String(error?.message||error||'No se pudo cargar el historial compartido.'),schemaReady:false};}
    return cache;
  }

  function sellerSelector(){
    if(roleNow()==='field_seller')return `<div class="nv825SellerIdentity"><span>Vendedora asignada</span><strong>${esc(profileName(uidNow()))}</strong></div>`;
    const ids=sellerIds();
    return `<label class="nv825SellerSelect"><span>Vendedor</span><select id="nv825SellerPicker">${ids.map(id=>`<option value="${esc(id)}" ${String(id)===String(currentSeller())?'selected':''}>${esc(profileName(id))}</option>`).join('')}</select></label>`;
  }
  function statusBadge(status){const map={pending:['Pendiente','pending'],confirmed:['Confirmada','confirmed'],rejected:['Rechazada','rejected']};const x=map[status]||[status,''];return `<span class="nv825State ${x[1]}">${esc(x[0])}</span>`;}
  function digitalStatus(event){const v=verificationMap().get(`${event.sourceKind}:${event.sourceId}`);return v?.status==='verified'?'<span class="nv825DigitalState verified">Verificado</span>':'<span class="nv825DigitalState pending">Por verificar</span>';}
  function digitalRowsHtml(totals){
    return totals.digital.slice(0,20).map(e=>`<article class="nv825DigitalRow"><div><strong>${esc(e.clientName)}</strong><small>${esc(e.document)} · ${new Date(e.date||Date.now()).toLocaleString('es-BO')} · ${esc(methodLabel(e.method))}</small></div><b>${money(e.amount)}</b>${digitalStatus(e)}${canManage()?`<button type="button" class="btn sm outline nv825VerifyDigital" data-kind="${esc(e.sourceKind)}" data-id="${esc(e.sourceId)}" data-seller="${esc(currentSeller())}" data-amount="${e.amount}" data-method="${esc(e.method)}">${verificationMap().get(`${e.sourceKind}:${e.sourceId}`)?.status==='verified'?'Revisar':'Marcar verificado'}</button>`:''}</article>`).join('')||'<div class="v7Empty small"><span>💳</span><p>No hay cobros digitales registrados para este vendedor.</p></div>';
  }
  function settlementRowsHtml(){
    return cache.settlements.map(x=>`<article class="nv825SettlementRow"><div><strong>${money(x.cash_delivered)}</strong><small>${new Date(x.created_at||Date.now()).toLocaleString('es-BO')} · Efectivo declarado</small><span>Saldo posterior declarado: ${money(x.balance_after)}</span>${x.notes?`<em>${esc(x.notes)}</em>`:''}</div><div>${statusBadge(x.status)}${canManage()&&x.status==='pending'?`<button type="button" class="btn sm nv825ConfirmSettlement" data-id="${esc(x.id)}">Confirmar</button><button type="button" class="btn sm danger nv825RejectSettlement" data-id="${esc(x.id)}">Rechazar</button>`:''}</div></article>`).join('')||'<div class="v7Empty small"><span>🧾</span><p>Aún no existen rendiciones registradas.</p></div>';
  }
  function cashMovementRowsHtml(totals){
    const rows=totals.events.slice(0,40);
    return rows.map(e=>`<article class="nv827CashMovement ${isCash(e.method)?'cash':'digital'}"><div><strong>${esc(e.clientName)}</strong><small>${esc(e.document)} · ${new Date(e.date||Date.now()).toLocaleString('es-BO')}</small><span>${esc(methodLabel(e.method))}</span></div><b>${money(e.amount)}</b></article>`).join('')||'<div class="v7Empty small"><span>📋</span><p>No se encontraron ventas o cobros asignados a este vendedor.</p></div>';
  }

  async function renderSellerSettlementV825(){
    if(!canOpen())return window.navigateTo?.('inicio');
    window.AppState.currentTab='rendicion-caja';
    document.getElementById('fabAdd')?.classList.add('hidden');
    const sellerId=currentSeller();
    await loadRemote(sellerId);
    const t=totalsForSeller(sellerId);
    const main=document.getElementById('mainArea');if(!main)return;
    main.innerHTML=`<section class="v7PageHead nv825CashHead"><span class="v7Eyebrow">Control de dinero recibido</span><h1>${roleNow()==='field_seller'?'Mi rendición de caja':'Rendiciones de vendedores'}</h1><p>Separa efectivo bajo custodia del vendedor y cobros digitales que ingresan directamente a la cuenta autorizada.</p></section>
      <section class="nv825SettlementToolbar">${sellerSelector()}<button class="btn" id="nv825NewSettlement" ${t.cashAvailable<=0?'disabled':''}>${cache.schemaReady?'Rendir efectivo':'Configurar rendición'}</button></section>
      ${cache.error?`<div class="nv825MigrationAlert"><strong>${cache.schemaReady?'Aviso de conexión':'Configuración pendiente'}</strong><span>${esc(cache.error)}</span><small>Los montos y movimientos locales siguen visibles. Para registrar y aprobar rendiciones compartidas, ejecuta la migración incluida y vuelve a comprobar.</small><button type="button" class="btn sm outline" id="nv827RetrySettlementSchema">Volver a comprobar</button></div>`:''}
      <section class="nv825CashMetrics"><article class="cash"><span>Efectivo cobrado</span><strong>${money(t.cashCollected)}</strong><small>Registrado por ventas y cobros</small></article><article class="pending"><span>Efectivo por entregar</span><strong>${money(t.cashAvailable)}</strong><small>${t.pending>0?`${money(t.pending)} en rendición pendiente`:'Sin rendición pendiente'}</small></article><article><span>Entregado confirmado</span><strong>${money(t.confirmed)}</strong><small>Rendiciones aprobadas</small></article><article class="digital"><span>Cobros digitales</span><strong>${money(t.digitalCollected)}</strong><small>${money(t.digitalVerified)} verificados</small></article></section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Detalle verificable</span><h2>Ventas y cobros del vendedor</h2><p class="nv825PanelNote">Estos movimientos sustentan el efectivo y los cobros digitales mostrados arriba.</p></div></div><div class="nv827CashMovementList">${cashMovementRowsHtml(t)}</div></section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Dinero físico</span><h2>Historial de rendiciones</h2></div></div><div class="nv825SettlementList">${settlementRowsHtml()}</div></section>
      <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">QR, transferencia y depósito</span><h2>Cobros digitales</h2><p class="nv825PanelNote">La verificación automática requiere una API o webhook del banco/proveedor. Mientras no esté conectado, el administrador puede verificar manualmente el ingreso.</p></div></div><div class="nv825DigitalList">${digitalRowsHtml(t)}</div></section>`;
    document.getElementById('nv825SellerPicker')?.addEventListener('change',e=>{selectedSellerId=e.target.value;renderSellerSettlementV825();});
    document.getElementById('nv825NewSettlement')?.addEventListener('click',()=>cache.schemaReady?openSettlementForm(t):openSettlementSetupV827());
    document.getElementById('nv827RetrySettlementSchema')?.addEventListener('click',()=>renderSellerSettlementV825());
    document.querySelectorAll('.nv825ConfirmSettlement').forEach(b=>b.addEventListener('click',()=>reviewSettlement(b.dataset.id,'confirmed')));
    document.querySelectorAll('.nv825RejectSettlement').forEach(b=>b.addEventListener('click',()=>reviewSettlement(b.dataset.id,'rejected')));
    document.querySelectorAll('.nv825VerifyDigital').forEach(b=>b.addEventListener('click',()=>verifyDigital(b.dataset)));
  }

  function openSettlementSetupV827(){
    window.openSheet?.(`<h2>Activar rendiciones <span class="x" id="closeSheet">✕</span></h2><div class="nv827SetupSteps"><strong>La aplicación ya calcula ventas y efectivo.</strong><p>Falta crear las tablas compartidas en Supabase para registrar entregas, aprobaciones y verificaciones.</p><ol><li>Abre Supabase → SQL Editor.</li><li>Ejecuta <b>supabase/migrations/20260730_v825_seller_settlements.sql</b> incluido en esta versión.</li><li>Regresa aquí y toca “Volver a comprobar”.</li></ol></div><button class="btn block" id="nv827CloseSetup">Entendido</button>`,(overlay,close)=>{overlay.querySelector('#closeSheet').onclick=close;overlay.querySelector('#nv827CloseSetup').onclick=close;});
  }

  function openSettlementForm(totals){
    const sellerId=currentSeller();
    window.openSheet?.(`<h2>Rendir efectivo <span class="x" id="closeSheet">✕</span></h2><div class="nv825SettlementSummary"><strong>${esc(profileName(sellerId))}</strong><span>Efectivo calculado pendiente: <b>${money(totals.cashAvailable)}</b></span></div><div class="field"><label>Monto entregado Bs</label><input id="nv825DeliveredAmount" type="number" inputmode="decimal" step="0.01" min="0.01" max="${totals.cashAvailable}" value="${totals.cashAvailable}"></div><div class="field"><label>Observación</label><textarea id="nv825SettlementNote" placeholder="Lugar de entrega, diferencia, referencia o detalle"></textarea></div><div id="nv825SettlementDifference" class="nv825Difference"></div><button class="btn block" id="nv825SubmitSettlement">Enviar rendición para confirmación</button>`,(overlay,close)=>{
      const amount=overlay.querySelector('#nv825DeliveredAmount'),diff=overlay.querySelector('#nv825SettlementDifference');
      const refresh=()=>{const value=round(amount.value);const balance=round(Math.max(0,totals.cashAvailable-value));diff.className='nv825Difference '+(balance>0?'warning':'ok');diff.innerHTML=`<span>Saldo que quedará bajo custodia</span><strong>${money(balance)}</strong>`;};
      amount.addEventListener('input',refresh);refresh();overlay.querySelector('#closeSheet').onclick=close;
      overlay.querySelector('#nv825SubmitSettlement').onclick=async()=>{const button=overlay.querySelector('#nv825SubmitSettlement');button.disabled=true;button.textContent='Guardando…';try{if(!navigator.onLine)throw new Error('Se necesita conexión para registrar la rendición.');const delivered=round(amount.value);if(delivered<=0||delivered>totals.cashAvailable+.01)throw new Error('El monto debe estar dentro del efectivo pendiente.');const payload={seller_user_id:sellerId,stock_owner_user_id:String(window.AppState?.session?.stockOwnerUserId||sellerId||''),period_start:new Date(Math.min(...totals.events.map(e=>e.date).filter(Boolean),Date.now())).toISOString(),period_end:new Date().toISOString(),cash_collected:totals.cashCollected,cash_delivered:delivered,balance_after:round(totals.cashAvailable-delivered),digital_collected:totals.digitalCollected,status:'pending',notes:overlay.querySelector('#nv825SettlementNote').value.trim(),created_by:uidNow()};const {error}=await sb().from(TABLE_SETTLEMENTS).insert(payload);if(error)throw error;await window.writeAudit?.('seller_cash_settlement_submitted','sellerSettlements',sellerId,null,{cashDelivered:delivered,balanceAfter:payload.balance_after});close();window.showToast?.('Rendición enviada para confirmación.');renderSellerSettlementV825();}catch(error){button.disabled=false;button.textContent='Reintentar';window.showToast?.(error.message||'No se pudo registrar.','error');}};
    });
  }
  async function reviewSettlement(id,status){
    const label=status==='confirmed'?'confirmar':'rechazar';if(!window.confirm(`¿Deseas ${label} esta rendición?`))return;
    try{const patch={status,confirmed_by:uidNow(),confirmed_at:new Date().toISOString()};const {error}=await sb().from(TABLE_SETTLEMENTS).update(patch).eq('id',id);if(error)throw error;await window.writeAudit?.(`seller_cash_settlement_${status}`,'sellerSettlements',id,null,patch);window.showToast?.(status==='confirmed'?'Rendición confirmada.':'Rendición rechazada.');renderSellerSettlementV825();}catch(error){window.showToast?.(error.message||'No se pudo actualizar.','error');}
  }
  async function verifyDigital(data){
    try{const current=verificationMap().get(`${data.kind}:${data.id}`);const status=current?.status==='verified'?'pending':'verified';const payload={source_kind:data.kind,source_id:data.id,seller_user_id:data.seller,method:data.method,amount:round(data.amount),status,verified_by:status==='verified'?uidNow():null,verified_at:status==='verified'?new Date().toISOString():null,provider:'manual',updated_at:new Date().toISOString()};const {error}=await sb().from(TABLE_VERIFY).upsert(payload,{onConflict:'source_kind,source_id'});if(error)throw error;await window.writeAudit?.('digital_payment_verification_changed','paymentVerifications',`${data.kind}:${data.id}`,null,{status,amount:payload.amount,method:payload.method});window.showToast?.(status==='verified'?'Ingreso digital verificado.':'Verificación retirada.');renderSellerSettlementV825();}catch(error){window.showToast?.(error.message||'No se pudo verificar.','error');}
  }

  Object.assign(window,{renderSellerSettlementV825,openSellerSettlementV825:()=>window.navigateTo?.('rendicion-caja'),NVSettlementV825:{VERSION,cashEventsForSeller,totalsForSeller,loadRemote}});
})();
