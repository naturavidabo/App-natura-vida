/* NATURA VIDA V8.2.0 — núcleo financiero puro y verificable. */
(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NVFinancialCoreV820 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const round = n => Math.round((Number(n) || 0) * 100) / 100;
  const text = v => String(v == null ? '' : v).trim();
  const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const timestamp = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  function initialPaid(operation){
    const explicit = operation && (operation.amountPaid ?? operation.paidAmount ?? operation.totalPaid);
    if (explicit != null && Number.isFinite(Number(explicit))) return round(Math.max(0, Number(explicit)));
    return operation && operation.paymentStatus === 'paid' ? round(operation.total || 0) : 0;
  }
  function paymentAmount(payment){ return payment && !payment.deletedAt && payment.status !== 'voided' ? round(Math.max(0, payment.amount || 0)) : 0; }
  function paymentsForOperation(operation, payments){
    const id = text(operation && operation.id);
    return (payments || []).filter(p => !p.deletedAt && p.status !== 'voided' && (
      text(p.saleId) === id || text(p.operationId) === id || (p.allocations || []).some(a => text(a.operationId || a.saleId) === id)
    ));
  }
  function allocatedToOperation(payment, operationId){
    const allocations = Array.isArray(payment && payment.allocations) ? payment.allocations : [];
    if (allocations.length) return round(allocations.filter(a => text(a.operationId || a.saleId) === text(operationId)).reduce((s,a)=>s+Number(a.amount||0),0));
    return (text(payment && (payment.operationId || payment.saleId)) === text(operationId)) ? paymentAmount(payment) : 0;
  }
  function paidTotal(operation, payments){
    const id = operation && operation.id;
    const extra = (payments || []).filter(p => !p.deletedAt && p.status !== 'voided').reduce((sum,p)=>sum+allocatedToOperation(p,id),0);
    return round(Math.min(Number(operation && operation.total || 0), initialPaid(operation) + extra));
  }
  function balance(operation, payments){ return round(Math.max(0, Number(operation && operation.total || 0) - paidTotal(operation,payments))); }
  function operationDate(operation){ return timestamp(operation && (operation.originalDate || operation.date || operation.createdAt)); }
  function dueDate(operation){ return timestamp(operation && (operation.dueDate || operation.paymentDueDate || operation.originalDate || operation.date || operation.createdAt)); }
  function daysLate(operation, now){
    if (balance(operation, []) <= 0) return 0;
    const due = dueDate(operation); if (!due) return 0;
    return Math.max(0, Math.floor(((now || Date.now()) - due) / 86400000));
  }
  function status(operation, payments, now){
    const total = round(operation && operation.total || 0);
    const paid = paidTotal(operation,payments);
    const pending = round(Math.max(0,total-paid));
    if (pending <= 0.009) return {code:'paid',label:'Cancelado'};
    const late = Math.max(0, Math.floor(((now || Date.now()) - (dueDate(operation) || operationDate(operation) || (now || Date.now()))) / 86400000));
    const historical = !!(operation && (operation.historicalActive || operation.sourceSystem === 'Mi Negocio' || operation.origin === 'Importado desde Mi Negocio'));
    if (late >= 90) return {code:'delinquent',label: historical ? 'Histórico activo · En mora' : 'En mora'};
    if (late > 0) return {code:'overdue',label: historical ? 'Histórico activo · Vencido' : 'Vencido'};
    if (paid > 0) return {code:'partial',label: historical ? 'Histórico activo · Parcial' : 'Parcial'};
    return {code: historical ? 'historical' : 'pending',label: historical ? 'Histórico activo' : 'Pendiente'};
  }
  function operationClientMatches(operation, client){
    if (!operation || !client) return false;
    if (operation.clientId && client.id && text(operation.clientId) === text(client.id)) return true;
    const opPhone = norm(operation.clientPhone || operation.phone), cPhone = norm(client.phone);
    if (opPhone && cPhone && opPhone === cPhone) return true;
    return norm(operation.clientName || operation.customerName) === norm(client.name || client.businessName);
  }
  function aggregateClient(client, operations, payments, documents, now){
    const rows = (operations || []).filter(op => operationClientMatches(op,client)).sort((a,b)=>operationDate(a)-operationDate(b));
    const active = rows.filter(op => balance(op,payments) > 0.009);
    const clientPayments = (payments || []).filter(p => !p.deletedAt && p.status !== 'voided' && (
      text(p.clientId) === text(client && client.id) || norm(p.clientName) === norm(client && client.name) || (p.allocations || []).some(a => rows.some(op => text(op.id) === text(a.operationId || a.saleId)))
    ));
    const totalBought = round(rows.reduce((s,op)=>s+Number(op.total||0),0));
    const totalPaid = round(rows.reduce((s,op)=>s+paidTotal(op,payments),0));
    const totalDebt = round(rows.reduce((s,op)=>s+balance(op,payments),0));
    const dates = active.map(operationDate).filter(Boolean);
    const payDates = clientPayments.map(p=>timestamp(p.date || p.createdAt)).filter(Boolean);
    const oldest = dates.length ? Math.min(...dates) : 0;
    const latestPay = payDates.length ? Math.max(...payDates) : 0;
    const maxLate = active.reduce((m,op)=>Math.max(m, Math.max(0, Math.floor(((now||Date.now())-(dueDate(op)||operationDate(op)||Date.now()))/86400000))),0);
    return {client,operations:rows,active, payments:clientPayments, documents:(documents||[]).filter(d=>text(d.clientId)===text(client&&client.id)), totalBought,totalPaid,totalDebt,pendingCount:active.length,oldestDebtDate:oldest,lastPaymentDate:latestPay,daysLate:maxLate};
  }
  function allocatePayment(operations, payments, amount, mode, selectedIds){
    let remaining = round(amount);
    if (!(remaining > 0)) throw new Error('El monto debe ser mayor a cero.');
    const active = (operations || []).map(op=>({op,balance:balance(op,payments)})).filter(x=>x.balance>0.009);
    if (!active.length) throw new Error('No existen deudas activas.');
    let candidates = active;
    if (mode === 'oldest' || mode === 'general' || mode === 'total') candidates = active.sort((a,b)=>operationDate(a.op)-operationDate(b.op));
    else if (mode === 'specific') candidates = active.filter(x=>(selectedIds||[]).includes(text(x.op.id)));
    else if (mode === 'multiple') candidates = active.filter(x=>(selectedIds||[]).includes(text(x.op.id))).sort((a,b)=>operationDate(a.op)-operationDate(b.op));
    if (!candidates.length) throw new Error('Selecciona al menos una deuda.');
    const max = round(candidates.reduce((s,x)=>s+x.balance,0));
    if (remaining > max + 0.009) throw new Error('El pago supera el saldo de las operaciones seleccionadas.');
    const allocations=[];
    for (const row of candidates){
      if (remaining <= 0.009) break;
      const applied=round(Math.min(row.balance,remaining));
      if (applied>0){ allocations.push({operationId:row.op.id,saleId:row.op.id,amount:applied,balanceBefore:row.balance,balanceAfter:round(row.balance-applied)}); remaining=round(remaining-applied); }
    }
    return {amount:round(amount),allocations,unapplied:remaining};
  }
  function importKey(row){
    return text(row.importKey || row.historicalImportKey) || `mi_negocio_${norm(row.clientName)}_${String(row.originalDate||row.date||'').replace(/\D/g,'')}_${round(row.total).toFixed(2).replace('.','')}_${round(row.amountPaid||row.paid).toFixed(2).replace('.','')}`;
  }
  function normalizeHistoricalRow(row, defaults){
    const total = round(row.total ?? row.totalSale ?? row.saleTotal);
    const paid = round(row.amountPaid ?? row.paid ?? 0);
    const pending = round(row.balance ?? row.pendingBalance ?? Math.max(0,total-paid));
    return {
      id: text(row.id) || `hist_${importKey(row)}`,
      historicalImportKey: importKey(row),
      clientId: text(row.clientId || defaults && defaults.clientId),
      clientName: text(row.clientName || row.name || defaults && defaults.clientName),
      clientPhone: text(row.clientPhone || row.phone || defaults && defaults.clientPhone),
      originalSaleNumber: text(row.originalSaleNumber || row.saleNumber || row.documentNumber),
      documentNumber: text(row.documentNumber || row.originalSaleNumber || row.saleNumber),
      originalDate: row.originalDate || row.date,
      date: timestamp(row.originalDate || row.date),
      dueDate: row.dueDate || row.originalDate || row.date,
      items: Array.isArray(row.items) ? row.items : (row.products ? [{productName:text(row.products),qty:1,unitPrice:total,subtotal:total}] : []),
      total,
      amountPaid: paid,
      importedPaid: paid,
      pendingBalance: pending,
      paymentStatus: pending <= .009 ? 'paid' : (paid > 0 ? 'partial' : 'pending'),
      observations: text(row.observations || row.note),
      pendingReason: text(row.pendingReason || row.observations || row.note),
      sourceSystem: 'Mi Negocio',
      origin: 'Importado desde Mi Negocio',
      historicalActive: pending > .009,
      inventoryImpact: false,
      stockAlreadyDelivered: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
  return {round,norm,timestamp,initialPaid,paymentAmount,paymentsForOperation,allocatedToOperation,paidTotal,balance,operationDate,dueDate,daysLate,status,operationClientMatches,aggregateClient,allocatePayment,importKey,normalizeHistoricalRow};
});
