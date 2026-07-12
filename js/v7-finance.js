/* NATURA VIDA V7.2.6 — cuentas por cobrar, egresos/insumos editables y balance básico. */

(function(){
  const EXPENSE_CATEGORIES = ['Materia prima','Envases','Etiquetas','Servicios','Alquiler','Transporte','Mano de obra','Otros gastos'];

  function currentUserIdV725(){ return AppState.session ? (AppState.session.onlineUserId || AppState.session.userId || '') : ''; }
  function ownScopeV725(row){ return isAdmin() || !row.sellerId || row.sellerId === currentUserIdV725() || row.ownerUserId === currentUserIdV725(); }
  function saleAmountPaidV725(sale){ return Number(sale.amountPaid ?? sale.paidAmount ?? sale.totalPaid ?? (sale.paymentStatus === 'paid' ? sale.total : 0) ?? 0); }
  function paymentsForSaleV725(saleId){ return (AppState.receivablePayments || []).filter(p => p.saleId === saleId && !p.deletedAt); }
  function salePaidTotalV725(sale){ return roundBs(saleAmountPaidV725(sale) + paymentsForSaleV725(sale.id).reduce((s,p)=>s+Number(p.amount||0),0)); }
  function saleBalanceV725(sale){ return roundBs(Math.max(0, Number(sale.total||0) - salePaidTotalV725(sale))); }
  function receivableSalesV725(){ return (AppState.sales || []).filter(s => ownScopeV725(s) && saleBalanceV725(s) > 0.009).sort((a,b)=>Number(b.date||0)-Number(a.date||0)); }
  function receivableTotalsV725(){ const rows=receivableSalesV725(); return {count:rows.length,total:roundBs(rows.reduce((s,x)=>s+saleBalanceV725(x),0)),original:roundBs(rows.reduce((s,x)=>s+Number(x.total||0),0)),paid:roundBs(rows.reduce((s,x)=>s+salePaidTotalV725(x),0))}; }

  async function saveReceivablePaymentV725(sale, amount, note){
    const clean=roundBs(Number(amount||0));
    if(!clean || clean<=0) throw new Error('Ingresa un monto válido.');
    const balance=saleBalanceV725(sale);
    if(clean>balance+0.009) throw new Error('El pago no puede ser mayor al saldo pendiente.');
    const row=window.nvPrepareOwnedRecord ? nvPrepareOwnedRecord({ id:uid('pay'), saleId:sale.id, clientId:sale.clientId||'', clientName:sale.clientName||'', amount:clean, note:note||'', date:Date.now(), ownerUserId:currentUserIdV725(), createdAt:Date.now() }, 'receivablePayments') : { id:uid('pay'), saleId:sale.id, clientId:sale.clientId||'', clientName:sale.clientName||'', amount:clean, note:note||'', date:Date.now(), ownerUserId:currentUserIdV725(), createdAt:Date.now() };
    await DB.put('receivablePayments', row);
    AppState.receivablePayments = await DB.getAll('receivablePayments').catch(()=>AppState.receivablePayments||[]);
    return row;
  }

  function renderReceivablesV725(){
    $('#fabAdd').classList.add('hidden');
    const rows=receivableSalesV725(); const totals=receivableTotalsV725();
    $('#mainArea').innerHTML=`
      <section class="v7PageHead"><span class="v7Eyebrow">Control de saldos</span><h1>Ventas por cobrar</h1><p>No es venta a crédito permanente: aquí se registran saldos pendientes por cualquier motivo.</p></section>
      <section class="v7MetricGrid compact"><article class="v7MetricCard"><span>Operaciones</span><strong>${totals.count}</strong></article><article class="v7MetricCard"><span>Pagado</span><strong>${fmtMoney(totals.paid)}</strong></article><article class="v7MetricCard primary"><span>Saldo pendiente</span><strong>${fmtMoney(totals.total)}</strong></article></section>
      <section class="v7HistoryList">${rows.map(s=>`<article class="v7HistoryCard receivableCardV725"><span><strong>${escapeHtml(s.documentNumber||s.receiptNumber||'Venta')}</strong><small>${escapeHtml(s.clientName||'Cliente')} · ${fmtDateTime(s.date)}</small><small>Total ${fmtMoney(s.total)} · Pagado ${fmtMoney(salePaidTotalV725(s))}</small>${s.pendingReason?`<small>Motivo: ${escapeHtml(s.pendingReason)}</small>`:''}</span><span><b>${fmtMoney(saleBalanceV725(s))}</b><small>pendiente</small><button class="btn sm payReceivableV725" data-id="${s.id}">Registrar pago</button><button class="btn sm outline receiptReceivableV725" data-id="${s.id}">Recibo</button></span></article>`).join('')||`<div class="v7Empty"><span>✓</span><h3>Sin saldos pendientes</h3><p>Cuando una venta quede parcialmente pagada aparecerá aquí.</p></div>`}</section>`;
    $all('.payReceivableV725').forEach(b=>b.addEventListener('click',()=>openPayReceivableV725(b.dataset.id)));
    $all('.receiptReceivableV725').forEach(b=>b.addEventListener('click',()=>{const s=AppState.sales.find(x=>x.id===b.dataset.id); if(s) openV7ReceiptPreview(s,'sale');}));
  }

  function openPayReceivableV725(saleId){
    const sale=(AppState.sales||[]).find(s=>s.id===saleId); if(!sale)return;
    const balance=saleBalanceV725(sale);
    openSheet(`<h2>Registrar pago <span class="x" id="closeSheet">✕</span></h2><div class="v7CashNotice"><strong>${escapeHtml(sale.clientName||'Cliente')}</strong><br>Saldo pendiente: <b>${fmtMoney(balance)}</b></div><div class="field"><label>Monto pagado</label><input id="payAmountV725" type="number" inputmode="decimal" step="0.01" max="${balance}" value="${balance}"></div><div class="field"><label>Nota opcional</label><input id="payNoteV725" placeholder="Ej.: pago parcial, transferencia, efectivo"></div><button class="btn block" id="savePayV725">Guardar pago</button>`,(overlay,close)=>{
      $('#closeSheet',overlay).addEventListener('click',close);
      $('#savePayV725',overlay).addEventListener('click',async()=>{const btn=$('#savePayV725',overlay); btn.disabled=true; btn.textContent='Guardando…'; try{await saveReceivablePaymentV725(sale,$('#payAmountV725',overlay).value,$('#payNoteV725',overlay).value.trim()); close(); showToast('Pago registrado.'); renderReceivablesV725();}catch(err){btn.disabled=false;btn.textContent='Guardar pago';showToast(err.message||'No se pudo guardar el pago.','error');}});
    });
  }

  function expenseTotalYield(e){ return Number(e.yieldQty || (Number(e.quantity||0) * Number(e.yieldPerUnit||0)) || 0); }
  function expenseUnitCostV725(e){ const q=expenseTotalYield(e); return q>0?roundBs(Number(e.totalCost||0)/q):0; }
  function monthKeyV725(ts){ const d=new Date(ts||Date.now()); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
  function visibleExpensesV725(){ return (AppState.expenses||[]).filter(e=>!e.deletedAt && (isAdmin() || e.ownerUserId===currentUserIdV725())).sort((a,b)=>Number(b.date||0)-Number(a.date||0)); }
  function incomeThisMonthV725(){ const key=monthKeyV725(Date.now()); return (AppState.sales||[]).filter(s=>ownScopeV725(s)&&monthKeyV725(s.date)===key).reduce((sum,s)=>sum+Number(s.total||0),0); }
  function expenseThisMonthV725(){ const key=monthKeyV725(Date.now()); return visibleExpensesV725().filter(e=>monthKeyV725(e.date)===key).reduce((sum,e)=>sum+Number(e.totalCost||0),0); }

  async function saveExpenseV725(data){
    const base = data.id ? (AppState.expenses || []).find(e=>e.id===data.id) || {} : {};
    const row=window.nvPrepareOwnedRecord ? nvPrepareOwnedRecord(Object.assign({}, base, data, {id:data.id || uid('exp'), updatedAt:Date.now()}), 'expenses') : Object.assign({id:data.id||uid('exp'), createdAt:Date.now(), ownerUserId:currentUserIdV725()}, base, data, {updatedAt:Date.now()});
    await DB.put('expenses', row);
    AppState.expenses = await DB.getAll('expenses').catch(()=>AppState.expenses||[]);
    return row;
  }
  async function deleteExpenseV726(id){
    const e=(AppState.expenses||[]).find(x=>x.id===id); if(!e)return;
    const row=Object.assign({}, e, {deletedAt:Date.now(), updatedAt:Date.now()});
    await DB.put('expenses', row);
    AppState.expenses = await DB.getAll('expenses').catch(()=>AppState.expenses||[]);
  }
  function expenseCalcText(e){
    const parts=[]; const q=Number(e.quantity||0); const unit=e.unit||''; const unitCost=Number(e.unitCost||0); const total=Number(e.totalCost||0); const yieldTotal=expenseTotalYield(e); const yu=e.yieldUnit||'u.';
    if(unitCost && q) parts.push(`${q} ${unit} × ${fmtMoney(unitCost)} = ${fmtMoney(total)}`);
    else if(q) parts.push(`${q} ${unit} · total ${fmtMoney(total)}`);
    if(e.yieldPerUnit && q) parts.push(`Rinde ${Number(e.yieldPerUnit)} ${yu} por ${unit || 'unidad'} · total ${yieldTotal} ${yu}`);
    else if(yieldTotal) parts.push(`Rendimiento total: ${yieldTotal} ${yu}`);
    if(yieldTotal) parts.push(`Costo unitario: ${fmtMoney(expenseUnitCostV725(e))} por ${yu}`);
    return parts.join(' · ');
  }

  function renderFinanceV725(){
    $('#fabAdd').classList.remove('hidden'); $('#fabAdd').onclick=()=>openExpenseFormV725();
    const expenses=visibleExpensesV725(); const income=roundBs(incomeThisMonthV725()); const out=roundBs(expenseThisMonthV725());
    const byCat=EXPENSE_CATEGORIES.map(cat=>({cat,total:roundBs(expenses.filter(e=>e.category===cat).reduce((s,e)=>s+Number(e.totalCost||0),0))})).filter(x=>x.total>0);
    $('#mainArea').innerHTML=`
      <section class="v7PageHead"><span class="v7Eyebrow">Costos y balance</span><h1>Egresos e insumos</h1><p>Registra materia prima, envases, etiquetas y gastos operativos. Todo es editable.</p></section>
      <section class="v7MetricGrid compact"><article class="v7MetricCard"><span>Ingresos mes</span><strong>${fmtMoney(income)}</strong></article><article class="v7MetricCard"><span>Egresos mes</span><strong>${fmtMoney(out)}</strong></article><article class="v7MetricCard primary"><span>Balance básico</span><strong>${fmtMoney(income-out)}</strong></article></section>
      <div class="toolrow"><button class="btn" id="newExpenseV725">+ Registrar egreso</button></div>
      ${byCat.length?`<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Resumen por categoría</span><h2>Gastos registrados</h2></div></div>${byCat.map(x=>`<div class="priceLine"><span>${escapeHtml(x.cat)}</span><b>${fmtMoney(x.total)}</b></div>`).join('')}</section>`:''}
      <section class="v7HistoryList">${expenses.map(e=>`<article class="v7HistoryCard"><span><strong>${escapeHtml(e.name||e.category)}</strong><small>${escapeHtml(e.category)} · ${fmtDate(e.date)}</small><small>${escapeHtml(expenseCalcText(e))}</small>${e.note?`<small>${escapeHtml(e.note)}</small>`:''}</span><span><b>${fmtMoney(e.totalCost)}</b><small>${escapeHtml(e.quantity?`${e.quantity} ${e.unit||''}`:'egreso')}</small><button class="btn sm editExpenseV726" data-id="${e.id}">Editar</button><button class="btn sm outline dupExpenseV726" data-id="${e.id}">Duplicar</button><button class="btn sm danger delExpenseV726" data-id="${e.id}">Eliminar</button></span></article>`).join('')||`<div class="v7Empty"><span>📒</span><h3>Sin egresos registrados</h3><p>Toca + para registrar materia prima, frascos, etiquetas o gastos operativos.</p></div>`}</section>`;
    $('#newExpenseV725').addEventListener('click',()=>openExpenseFormV725());
    $all('.editExpenseV726').forEach(b=>b.addEventListener('click',()=>openExpenseFormV725(b.dataset.id)));
    $all('.dupExpenseV726').forEach(b=>b.addEventListener('click',()=>openExpenseFormV725(b.dataset.id,{duplicate:true})));
    $all('.delExpenseV726').forEach(b=>b.addEventListener('click',async()=>{if(!confirmDialog('¿Eliminar este egreso?'))return; await deleteExpenseV726(b.dataset.id); showToast('Egreso eliminado.'); renderFinanceV725();}));
  }

  function openExpenseFormV725(id=null, opts={}){
    const existing=id ? (AppState.expenses||[]).find(e=>e.id===id) : null;
    const e=existing && !opts.duplicate ? existing : (existing ? Object.assign({}, existing, {id:null, date:Date.now(), name:(existing.name||'')+' copia'}) : {});
    const qty=Number(e.quantity||0); const unitCost=Number(e.unitCost || (qty>0 && e.totalCost ? Number(e.totalCost)/qty : 0) || 0); const total=Number(e.totalCost || (unitCost*qty) || 0); const yieldPer=Number(e.yieldPerUnit || (qty>0 && e.yieldQty ? Number(e.yieldQty)/qty : 0) || 0); const yieldTotal=Number(e.yieldQty || (qty*yieldPer) || 0);
    openSheet(`<h2>${e.id?'Editar':'Registrar'} egreso / insumo <span class="x" id="closeSheet">✕</span></h2><div class="v7CashNotice">Para materia prima puedes colocar: costo por saco, cantidad de sacos y rendimiento por saco. La app calcula total y costo por ml.</div><div class="field"><label>Tipo</label><select id="expCatV725">${EXPENSE_CATEGORIES.map(c=>`<option ${e.category===c?'selected':''}>${c}</option>`).join('')}</select></div><div class="field"><label>Descripción</label><input id="expNameV725" value="${escapeHtml(e.name||'')}" placeholder="Ej.: saco de coco 25 kg, frascos 200 ml, etiquetas"></div><div class="field-row"><div class="field"><label>Costo por unidad/lote Bs</label><input id="expUnitCostV726" type="number" inputmode="decimal" step="0.01" value="${unitCost||''}" placeholder="Ej.: 1250"></div><div class="field"><label>Cantidad comprada</label><input id="expQtyV725" type="number" inputmode="decimal" step="0.01" value="${qty||''}" placeholder="Ej.: 9"></div></div><div class="field-row"><div class="field"><label>Unidad compra</label><input id="expUnitV725" value="${escapeHtml(e.unit||'')}" placeholder="saco, unidad, lote, mes"></div><div class="field"><label>Fecha</label><input id="expDateV725" type="date" value="${e.date ? new Date(e.date).toISOString().slice(0,10) : todayISO()}"></div></div><div class="field-row"><div class="field"><label>Rendimiento por unidad</label><input id="expYieldPerV726" type="number" inputmode="decimal" step="0.01" value="${yieldPer||''}" placeholder="Ej.: 15000"></div><div class="field"><label>Unidad resultado</label><input id="expYieldUnitV725" value="${escapeHtml(e.yieldUnit||'ml')}" placeholder="ml, frasco, etiqueta"></div></div><div class="field"><label>Total compra Bs</label><input id="expCostV725" type="number" inputmode="decimal" step="0.01" value="${total||''}"><small>Se calcula automáticamente, pero puedes corregirlo manualmente.</small></div><div class="field"><label>Rendimiento total</label><input id="expYieldV725" type="number" inputmode="decimal" step="0.01" value="${yieldTotal||''}"><small>Se calcula automáticamente: cantidad × rendimiento por unidad.</small></div><div class="v7CashNotice" id="expPreviewV725">Completa costo y rendimiento para calcular costo unitario.</div><div class="field"><label>Nota</label><textarea id="expNoteV725" rows="3" placeholder="Proveedor, detalle o referencia">${escapeHtml(e.note||'')}</textarea></div><div class="actions keyboardSafeActions"><button class="btn outline block" id="cancelExpenseV726">Cancelar</button><button class="btn block" id="saveExpenseV725">Guardar egreso</button></div>`,(overlay,close)=>{
      let manualTotalTouched=Boolean(total && (!unitCost || !qty)); let manualYieldTouched=Boolean(yieldTotal && (!yieldPer || !qty));
      const calc=()=>{const q=Number($('#expQtyV725',overlay).value||0), uc=Number($('#expUnitCostV726',overlay).value||0), yp=Number($('#expYieldPerV726',overlay).value||0); if(!manualTotalTouched) $('#expCostV725',overlay).value=(q&&uc?roundBs(q*uc):''); if(!manualYieldTouched) $('#expYieldV725',overlay).value=(q&&yp?roundBs(q*yp):''); const cost=Number($('#expCostV725',overlay).value||0), y=Number($('#expYieldV725',overlay).value||0); $('#expPreviewV725',overlay).textContent=(cost&&y)?`Total: ${fmtMoney(cost)} · Rendimiento: ${y} ${$('#expYieldUnitV725',overlay).value||'u.'} · Costo: ${fmtMoney(cost/y)} por ${$('#expYieldUnitV725',overlay).value||'unidad'}`:'Completa costo y rendimiento para calcular costo unitario.';};
      ['#expQtyV725','#expUnitCostV726','#expYieldPerV726','#expYieldUnitV725'].forEach(sel=>$(sel,overlay).addEventListener('input',calc));
      $('#expCostV725',overlay).addEventListener('input',()=>{manualTotalTouched=true; calc();});
      $('#expYieldV725',overlay).addEventListener('input',()=>{manualYieldTouched=true; calc();});
      calc();
      $('#closeSheet',overlay).addEventListener('click',close); $('#cancelExpenseV726',overlay).addEventListener('click',close);
      $('#saveExpenseV725',overlay).addEventListener('click',async()=>{const cost=roundBs(Number($('#expCostV725',overlay).value||0)); if(cost<=0)return showToast('Ingresa el costo total.','error'); const btn=$('#saveExpenseV725',overlay); btn.disabled=true; btn.textContent='Guardando…'; try{await saveExpenseV725({id:e.id||undefined,category:$('#expCatV725',overlay).value,name:$('#expNameV725',overlay).value.trim()||$('#expCatV725',overlay).value,totalCost:cost,unitCost:roundBs(Number($('#expUnitCostV726',overlay).value||0)),date:new Date($('#expDateV725',overlay).value+'T12:00:00').getTime(),quantity:Number($('#expQtyV725',overlay).value||0),unit:$('#expUnitV725',overlay).value.trim(),yieldPerUnit:Number($('#expYieldPerV726',overlay).value||0),yieldQty:Number($('#expYieldV725',overlay).value||0),yieldUnit:$('#expYieldUnitV725',overlay).value.trim(),note:$('#expNoteV725',overlay).value.trim()}); close(); showToast(e.id?'Egreso actualizado.':'Egreso registrado.'); renderFinanceV725();}catch(err){btn.disabled=false;btn.textContent='Guardar egreso';showToast(err.message||'No se pudo guardar.','error');}});
    });
  }

  Object.assign(window,{renderReceivablesV725, renderFinanceV725, saleBalanceV725, salePaidTotalV725, openExpenseFormV725});
})();
