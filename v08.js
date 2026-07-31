'use strict';

const V08_VERSION = '0.8.0';
const originalRenderModuleV07 = renderModule;
const originalPushQueueItemV07 = pushQueueItem;
const originalPullRemoteCoreDataV07 = pullRemoteCoreData;
const originalVerifyDataIntegrityV07 = verifyDataIntegrity;
let reportModeV08 = 'month';
let reportDateV08 = localDateKey();
let reportMonthV08 = localDateKey().slice(0, 7);

const EXPENSE_CATEGORIES_V08 = [
  'Gas', 'Electricidad', 'Agua', 'Internet / Wi-Fi', 'Alquiler',
  'Sueldo ayudante', 'Transporte / taxi', 'Limpieza', 'Mantenimiento', 'Otros'
];

function dateFromRecordV08(record) {
  return String(record?.date || record?.expenseDate || record?.purchaseDate || record?.createdAt || '').slice(0, 10);
}

function inDateRangeV08(date, start, end) {
  const key = String(date || '').slice(0, 10);
  return key >= start && key <= end;
}

function monthRangeV08(month) {
  const safe = /^\d{4}-\d{2}$/.test(month) ? month : localDateKey().slice(0, 7);
  const [year, monthNumber] = safe.split('-').map(Number);
  const last = new Date(year, monthNumber, 0).getDate();
  return { start: `${safe}-01`, end: `${safe}-${String(last).padStart(2, '0')}` };
}

function expensePaymentLabelV08(value) {
  return ({ cash: 'Efectivo de caja', qr: 'QR del negocio', external: 'Dinero externo' })[value] || 'Dinero externo';
}

async function loadExpensesV08() {
  return (await getAllRecords('expensesLocal'))
    .filter(item => item.status !== 'cancelled')
    .sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
}

function openExpenseDialogV08(expense = null) {
  if (!canManageBusiness()) return toast('Solo la propietaria o el administrador pueden registrar gastos.');
  $('expenseDialogTitle').textContent = expense ? 'Editar gasto' : 'Registrar gasto';
  $('expenseId').value = expense?.id || '';
  $('expenseDate').value = expense?.date || localDateKey();
  $('expenseCategory').value = expense?.category || EXPENSE_CATEGORIES_V08[0];
  $('expenseDescription').value = expense?.description || '';
  $('expenseAmount').value = Number(expense?.amount || 0) || '';
  $('expensePaymentMethod').value = expense?.paymentMethod || 'cash';
  $('expenseRecurring').checked = Boolean(expense?.recurring);
  $('expenseRecurrence').value = expense?.recurrence || 'monthly';
  $('expenseRecurrenceRow').hidden = !$('expenseRecurring').checked;
  $('expenseDialog').showModal();
}

async function saveExpenseV08(event) {
  event.preventDefault();
  if (!canManageBusiness()) return toast('No tienes permiso para registrar gastos.');
  const id = $('expenseId').value || uid();
  const existing = await getRecord('expensesLocal', id);
  const date = $('expenseDate').value || localDateKey();
  const amount = Number($('expenseAmount').value || 0);
  const paymentMethod = $('expensePaymentMethod').value;
  if (!Number.isFinite(amount) || amount <= 0) return toast('Ingresa un monto válido.');
  if (paymentMethod === 'cash' && (!currentCash || date !== localDateKey())) {
    return toast('Para pagar desde caja, la caja debe estar abierta y el gasto debe corresponder a hoy.', 5200);
  }
  const movementId = existing?.cashMovementId || uid();
  const expense = {
    ...(existing || {}), id, date,
    category: $('expenseCategory').value,
    description: $('expenseDescription').value.trim() || $('expenseCategory').value,
    amount, paymentMethod,
    recurring: $('expenseRecurring').checked,
    recurrence: $('expenseRecurring').checked ? $('expenseRecurrence').value : null,
    status: 'active',
    cashSessionId: paymentMethod === 'cash' ? currentCash.id : null,
    cashMovementId: movementId,
    createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION
  };
  const stores = ['expensesLocal', 'movements', 'syncQueue', 'auditLogs'];
  const transaction = db.transaction(stores, 'readwrite');
  transaction.objectStore('expensesLocal').put(expense);
  transaction.objectStore('movements').put({
    id: movementId, date, createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso(),
    type: 'expense', method: paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'qr' ? 'QR' : 'Externo',
    amount: paymentMethod === 'cash' ? -amount : 0,
    expenseId: id, cashSessionId: paymentMethod === 'cash' ? currentCash.id : null,
    status: paymentMethod === 'cash' ? 'active' : 'non_cash'
  });
  transaction.objectStore('syncQueue').put(queueRecord('expensesLocal', expense));
  transaction.objectStore('auditLogs').put({
    id: uid(), action: existing ? 'expense_updated' : 'expense_created', entity: 'expensesLocal', entityId: id,
    details: { category: expense.category, amount, paymentMethod }, createdAt: nowIso(), appVersion: APP_VERSION
  });
  await transactionPromise(transaction);
  $('expenseDialog').close();
  scheduleAutoBackup('registro de gasto');
  await renderModule('expenses');
  await refreshStatus();
  toast('Gasto guardado correctamente.');
}

async function cancelExpenseV08(id) {
  const expense = await getRecord('expensesLocal', id);
  if (!expense || expense.status === 'cancelled') return toast('El gasto ya está anulado.');
  if (!confirm(`¿Anular el gasto “${expense.description}” por ${money(expense.amount)}?`)) return;
  const updated = { ...expense, status: 'cancelled', cancelledAt: nowIso(), updatedAt: nowIso() };
  const transaction = db.transaction(['expensesLocal', 'movements', 'syncQueue', 'auditLogs'], 'readwrite');
  transaction.objectStore('expensesLocal').put(updated);
  if (expense.cashMovementId) {
    transaction.objectStore('movements').put({
      id: expense.cashMovementId, date: expense.date, createdAt: expense.createdAt, updatedAt: nowIso(),
      type: 'expense', method: 'Efectivo', amount: 0, expenseId: expense.id,
      cashSessionId: expense.cashSessionId || null, status: 'cancelled'
    });
  }
  transaction.objectStore('syncQueue').put(queueRecord('expensesLocal', updated));
  transaction.objectStore('auditLogs').put({ id: uid(), action: 'expense_cancelled', entity: 'expensesLocal', entityId: id, details: { amount: expense.amount }, createdAt: nowIso(), appVersion: APP_VERSION });
  await transactionPromise(transaction);
  scheduleAutoBackup('anulación de gasto');
  await renderModule('expenses');
  await refreshStatus();
  toast('Gasto anulado.');
}

async function repeatExpenseV08(id) {
  const expense = await getRecord('expensesLocal', id);
  if (!expense) return;
  openExpenseDialogV08({ ...expense, id: '', date: localDateKey(), createdAt: null, updatedAt: null, cashMovementId: null });
}

function nextExpenseDueV08(expense) {
  const date = new Date(`${expense.date}T12:00:00`);
  if (expense.recurrence === 'weekly') date.setDate(date.getDate() + 7);
  else if (expense.recurrence === 'quarterly') date.setMonth(date.getMonth() + 3);
  else if (expense.recurrence === 'annual') date.setFullYear(date.getFullYear() + 1);
  else date.setMonth(date.getMonth() + 1);
  return localDateKey(date);
}

async function renderExpensesModuleV08() {
  const all = await loadExpensesV08();
  const selectedMonth = reportMonthV08;
  const monthExpenses = all.filter(item => String(item.date).startsWith(selectedMonth));
  const total = monthExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cash = monthExpenses.filter(item => item.paymentMethod === 'cash').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const recurring = monthExpenses.filter(item => item.recurring).length;
  const latestRecurring = new Map();
  all.filter(item => item.recurring).forEach(item => {
    const key = `${item.category}|${item.description}`;
    const current = latestRecurring.get(key);
    if (!current || String(item.date) > String(current.date)) latestRecurring.set(key, item);
  });
  const today = localDateKey();
  const reminderLimit = new Date(); reminderLimit.setDate(reminderLimit.getDate() + 7);
  const limitKey = localDateKey(reminderLimit);
  const reminders = [...latestRecurring.values()].map(item => ({ ...item, nextDue: nextExpenseDueV08(item) })).filter(item => item.nextDue <= limitKey).sort((a,b)=>a.nextDue.localeCompare(b.nextDue));
  const reminderHtml = reminders.map(item => `<div class="expense-reminder ${item.nextDue < today ? 'overdue' : ''}"><span>${item.nextDue < today ? 'Vencido' : 'Próximo'}</span><div><b>${escapeHTML(item.description)}</b><small>${new Date(`${item.nextDue}T12:00:00`).toLocaleDateString('es-BO')} · ${money(item.amount)}</small></div><button class="button-light repeat-expense" data-id="${item.id}">Registrar pago</button></div>`).join('');
  const rows = monthExpenses.map(item => `<article class="expense-row">
    <div class="expense-icon">${item.category === 'Gas' ? '🔥' : item.category.includes('Electricidad') ? '⚡' : item.category.includes('Transporte') ? '🚕' : '↘'}</div>
    <div><b>${escapeHTML(item.description)}</b><small>${escapeHTML(item.category)} · ${new Date(`${item.date}T12:00:00`).toLocaleDateString('es-BO')} · ${escapeHTML(expensePaymentLabelV08(item.paymentMethod))}${item.recurring ? ' · Recurrente' : ''}</small></div>
    <strong>${money(item.amount)}</strong>
    <div class="expense-actions"><button class="button-light edit-expense" data-id="${item.id}">Editar</button><button class="button-light repeat-expense" data-id="${item.id}">Repetir</button><button class="text-button cancel-expense" data-id="${item.id}">Anular</button></div>
  </article>`).join('');
  return `<div class="module-summary"><div><small>Gastos del mes</small><strong>${monthExpenses.length}</strong></div><div><small>Total</small><strong>${money(total)}</strong></div><div><small>Pagados desde caja</small><strong>${money(cash)}</strong></div><div><small>Recurrentes</small><strong>${recurring}</strong></div><button id="newExpenseBtn" class="primary-action">＋ Registrar gasto</button></div>
    <div class="module-filter-row"><label>Mes<input id="expenseMonthFilter" type="month" value="${escapeHTML(selectedMonth)}" /></label><small>Los gastos en efectivo se descuentan del efectivo esperado de la caja.</small></div>
    ${reminderHtml ? `<section class="expense-reminders"><h3>Recordatorios recurrentes</h3>${reminderHtml}</section>` : ''}
    <div class="expense-list">${rows || '<div class="empty-state">No hay gastos registrados en este mes.</div>'}</div>`;
}

async function recipeCostMapV08() {
  const [recipes, recipeItems, ingredients] = await Promise.all([
    getAllRecords('recipesLocal'), getAllRecords('recipeItemsLocal'), loadInventoryLocal()
  ]);
  const map = new Map();
  for (const recipe of recipes.filter(item => item.active !== false)) {
    const lines = recipeItems.filter(item => item.recipeId === recipe.id && item.active !== false);
    map.set(recipe.productId, recipeUnitCost(recipe, lines, ingredients).unit);
  }
  return map;
}

async function reportDataV08(start, end) {
  const [sales, expenses, purchases, clients, recipes] = await Promise.all([
    getAllRecords('sales'), loadExpensesV08(), getAllRecords('purchasesLocal'), getAllRecords('clients'), recipeCostMapV08()
  ]);
  const validSales = sales.filter(item => item.status === 'confirmed' && inDateRangeV08(item.date, start, end));
  const rangeExpenses = expenses.filter(item => inDateRangeV08(item.date, start, end));
  const rangePurchases = purchases.filter(item => inDateRangeV08(dateFromRecordV08(item), start, end));
  const totalSales = validSales.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const cashSales = validSales.filter(item => item.payment === 'Efectivo').reduce((sum, item) => sum + Number(item.total || 0), 0);
  const qrSales = validSales.filter(item => item.payment === 'QR').reduce((sum, item) => sum + Number(item.total || 0), 0);
  const estimatedCost = validSales.reduce((saleSum, sale) => saleSum + Number(sale.estimatedCost || (sale.items || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(recipes.get(line.id) || 0), 0)), 0);
  const expenseTotal = rangeExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const purchaseTotal = rangePurchases.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const grossProfit = totalSales - estimatedCost;
  const netProfit = grossProfit - expenseTotal;
  const productMap = new Map();
  validSales.forEach(sale => (sale.items || []).forEach(line => {
    const current = productMap.get(line.name) || { name: line.name, quantity: 0, amount: 0 };
    current.quantity += Number(line.qty || 0);
    current.amount += Number(line.qty || 0) * Number(line.price || 0);
    productMap.set(line.name, current);
  }));
  const topProducts = [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8);
  return {
    start, end, sales: validSales, expenses: rangeExpenses, purchases: rangePurchases,
    totalSales, cashSales, qrSales, estimatedCost, expenseTotal, purchaseTotal, grossProfit, netProfit,
    topProducts, outstandingDebt: clients.reduce((sum, item) => sum + Number(item.balance || 0), 0)
  };
}

function currentReportRangeV08() {
  if (reportModeV08 === 'day') return { start: reportDateV08, end: reportDateV08 };
  return monthRangeV08(reportMonthV08);
}

async function renderReportsModuleV08() {
  const range = currentReportRangeV08();
  const data = await reportDataV08(range.start, range.end);
  const top = data.topProducts.map((item, index) => `<div class="report-rank-row"><span>${index + 1}</span><div><b>${escapeHTML(item.name)}</b><small>${inventoryNumber(item.quantity)} unidad(es)</small></div><strong>${money(item.amount)}</strong></div>`).join('');
  return `<div class="report-controls">
      <div class="segmented report-mode"><button data-report-mode="day" class="${reportModeV08 === 'day' ? 'active' : ''}">Diario</button><button data-report-mode="month" class="${reportModeV08 === 'month' ? 'active' : ''}">Mensual</button></div>
      <label class="report-day-filter" ${reportModeV08 === 'day' ? '' : 'hidden'}>Fecha<input id="reportDateFilter" type="date" value="${reportDateV08}" /></label>
      <label class="report-month-filter" ${reportModeV08 === 'month' ? '' : 'hidden'}>Mes<input id="reportMonthFilter" type="month" value="${reportMonthV08}" /></label>
      <button id="printReportBtn" class="secondary-action">Imprimir</button><button id="exportReportBtn" class="button-light">Exportar CSV</button>
    </div>
    <div id="reportPrintable" class="report-sheet">
      <div class="report-title"><div><p class="eyebrow">Good King</p><h2>${reportModeV08 === 'day' ? 'Reporte diario' : 'Reporte mensual'}</h2><small>${new Date(`${data.start}T12:00:00`).toLocaleDateString('es-BO')} — ${new Date(`${data.end}T12:00:00`).toLocaleDateString('es-BO')}</small></div><span>V${APP_VERSION}</span></div>
      <div class="report-metrics">
        <div><small>Ventas</small><strong>${money(data.totalSales)}</strong><span>${data.sales.length} pedidos</span></div>
        <div><small>Efectivo</small><strong>${money(data.cashSales)}</strong><span>ventas cobradas</span></div>
        <div><small>QR</small><strong>${money(data.qrSales)}</strong><span>ventas cobradas</span></div>
        <div><small>Costo estimado</small><strong>${money(data.estimatedCost)}</strong><span>según recetas</span></div>
        <div><small>Gastos</small><strong>${money(data.expenseTotal)}</strong><span>${data.expenses.length} registros</span></div>
        <div><small>Ganancia neta estimada</small><strong class="${data.netProfit < 0 ? 'negative' : ''}">${money(data.netProfit)}</strong><span>ventas − costos − gastos</span></div>
      </div>
      <div class="report-columns"><section><h3>Productos más vendidos</h3>${top || '<div class="empty-state">Sin ventas en el periodo.</div>'}</section><section><h3>Compras y cuentas</h3><div class="report-detail-row"><span>Compras de insumos</span><b>${money(data.purchaseTotal)}</b></div><div class="report-detail-row"><span>Ganancia bruta estimada</span><b>${money(data.grossProfit)}</b></div><div class="report-detail-row"><span>Deudas pendientes actuales</span><b>${money(data.outstandingDebt)}</b></div><p class="report-note">Las compras aumentan inventario; no se restan nuevamente de la ganancia cuando el costo de receta ya representa el consumo.</p></section></div>
    </div>`;
}

async function exportReportCsvV08() {
  const range = currentReportRangeV08();
  const data = await reportDataV08(range.start, range.end);
  const rows = [['Tipo', 'Fecha', 'Descripción', 'Método', 'Monto']];
  data.sales.forEach(item => rows.push(['Venta', item.date, `Pedido ${String(item.orderNumber).padStart(3, '0')}`, item.payment, Number(item.total || 0).toFixed(2)]));
  data.expenses.forEach(item => rows.push(['Gasto', item.date, item.description, expensePaymentLabelV08(item.paymentMethod), (-Number(item.amount || 0)).toFixed(2)]));
  data.purchases.forEach(item => rows.push(['Compra', dateFromRecordV08(item), item.ingredientName || item.description, item.paymentSource || 'external', (-Number(item.total || 0)).toFixed(2)]));
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `good-king-reporte-${range.start}-${range.end}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
  toast('Reporte CSV descargado.');
}

function printReportV08() {
  const printable = $('reportPrintable');
  if (!printable) return;
  const printWindow = window.open('', '_blank', 'width=900,height=900');
  if (!printWindow) return toast('Permite ventanas emergentes para imprimir el reporte.');
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Reporte Good King</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#222}.report-title{display:flex;justify-content:space-between;border-bottom:3px solid #c9101a;padding-bottom:14px}.report-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.report-metrics>div,.report-columns section{border:1px solid #ddd;border-radius:12px;padding:12px}.report-metrics small,.report-metrics span{display:block;color:#666}.report-metrics strong{font-size:20px}.report-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.report-rank-row,.report-detail-row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #eee;padding:8px 0}.report-rank-row div{flex:1}.eyebrow{color:#c9101a;font-weight:bold}.negative{color:#b00020}@media print{button{display:none}}</style></head><body>${printable.innerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

async function loadUsersV08({ forceRemote = false } = {}) {
  const cached = (await getRecord('remoteSnapshots', 'users-v08'))?.data || [];
  if (!supabaseClient || !authContext || authContext.offline || !navigator.onLine) return cached;
  if (!forceRemote && cached.length) return cached;
  const { data: members, error: memberError } = await supabaseClient.from('business_members').select('business_id,user_id,role,active,created_at,updated_at').eq('business_id', authContext.businessId);
  if (memberError) throw memberError;
  const ids = (members || []).map(item => item.user_id);
  let profiles = [];
  if (ids.length) {
    const { data, error } = await supabaseClient.from('profiles').select('id,display_name,phone,active').in('id', ids);
    if (error) throw error;
    profiles = data || [];
  }
  const profileMap = Object.fromEntries(profiles.map(item => [item.id, item]));
  const result = (members || []).map(member => ({ ...member, profile: profileMap[member.user_id] || {} }));
  await putRecord('remoteSnapshots', { id: 'users-v08', data: result, updatedAt: nowIso() });
  return result;
}

async function renderUsersModuleV08() {
  let users = [];
  let errorMessage = '';
  try { users = await loadUsersV08(); } catch (error) { errorMessage = error.message || String(error); users = (await getRecord('remoteSnapshots', 'users-v08'))?.data || []; }
  const canEdit = authContext?.role === 'admin' && navigator.onLine && !authContext?.offline;
  const rows = users.map(item => `<article class="user-row">
    <div class="user-avatar">${escapeHTML((item.profile?.display_name || 'U').slice(0, 1).toUpperCase())}</div>
    <div><b>${escapeHTML(item.profile?.display_name || item.user_id)}</b><small>${escapeHTML(item.profile?.phone || 'Sin teléfono')} · ${item.active ? 'Activo' : 'Deshabilitado'}</small></div>
    <select class="user-role-select" data-user-id="${item.user_id}" ${canEdit ? '' : 'disabled'}><option value="admin" ${item.role === 'admin' ? 'selected' : ''}>Administrador</option><option value="owner" ${item.role === 'owner' ? 'selected' : ''}>Propietaria</option><option value="helper" ${item.role === 'helper' ? 'selected' : ''}>Ayudante</option></select>
    <label class="user-active-toggle"><input type="checkbox" class="user-active-check" data-user-id="${item.user_id}" ${item.active ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /> Activo</label>
  </article>`).join('');
  return `<div class="module-summary"><div><small>Usuarios asignados</small><strong>${users.length}</strong></div><div><small>Tu acceso</small><strong>${escapeHTML(roleLabel(authContext?.role))}</strong></div><button id="refreshUsersBtn" class="secondary-action">Actualizar lista</button></div>
    ${errorMessage ? `<div class="notice-box error">No se pudo actualizar en línea: ${escapeHTML(errorMessage)}. Se muestra la última copia disponible.</div>` : ''}
    <div class="notice-box">Los usuarios nuevos se crean primero en <b>Supabase → Authentication → Users</b>. Luego el administrador los asigna al negocio. La aplicación nunca usa una clave service_role.</div>
    <div class="users-list">${rows || '<div class="empty-state">No se encontraron usuarios asignados.</div>'}</div>`;
}

async function updateUserMembershipV08(userId, changes) {
  if (authContext?.role !== 'admin') return toast('Solo el administrador puede cambiar roles.');
  if (!navigator.onLine || authContext?.offline) return toast('Conéctate a internet para cambiar permisos.');
  const { error } = await supabaseClient.from('business_members').update({ ...changes, updated_at: nowIso() }).eq('business_id', authContext.businessId).eq('user_id', userId);
  if (error) return toast(`No se pudo actualizar: ${error.message}`, 5200);
  await writeAudit('business_member_updated', 'business_members', userId, changes);
  await loadUsersV08({ forceRemote: true });
  await renderModule('users');
  toast('Permiso actualizado.');
}

async function calculateInventoryConsumptionV08(items) {
  const [recipes, recipeItems, ingredients] = await Promise.all([
    getAllRecords('recipesLocal'), getAllRecords('recipeItemsLocal'), getAllRecords('inventoryIngredients')
  ]);
  const recipeByProduct = new Map(recipes.filter(item => item.active !== false).map(item => [item.productId, item]));
  const ingredientMap = new Map(ingredients.map(item => [item.id, item]));
  const aggregate = new Map();
  let estimatedCost = 0;
  for (const saleLine of items) {
    const recipe = recipeByProduct.get(saleLine.id);
    if (!recipe) continue;
    const yieldQuantity = Math.max(0.001, Number(recipe.yieldQuantity || 1));
    const lines = recipeItems.filter(item => item.recipeId === recipe.id && item.active !== false);
    for (const line of lines) {
      const ingredient = ingredientMap.get(line.ingredientId);
      if (!ingredient) continue;
      const quantity = Number(line.quantity || 0) / yieldQuantity * Number(saleLine.qty || 0);
      if (quantity <= 0) continue;
      const current = aggregate.get(ingredient.id) || { ingredient, quantity: 0 };
      current.quantity += quantity;
      aggregate.set(ingredient.id, current);
      estimatedCost += quantity * Number(ingredient.averageCost || 0);
    }
  }
  return { consumption: [...aggregate.values()], estimatedCost };
}

saveSaleAtomically = async function(saleDraft) {
  return withAppLock('sale', async () => {
    const date = localDateKey();
    const counterId = `order-counter-${date}`;
    const inventoryData = await calculateInventoryConsumptionV08(saleDraft.items || []);
    const stores = ['settings', 'sales', 'movements', 'syncQueue', 'auditLogs', 'inventoryIngredients', 'inventoryMovementsLocal'];
    const transaction = db.transaction(stores, 'readwrite');
    const settingsStore = transaction.objectStore('settings');
    const existingCounter = await requestPromise(settingsStore.get(counterId));
    let currentNumber = Number(existingCounter?.value || 0);
    if (!existingCounter) {
      const allSales = await requestPromise(transaction.objectStore('sales').getAll());
      currentNumber = Math.max(0, ...allSales.filter(sale => sale.date === date).map(sale => Number(sale.orderNumber || 0)));
    }
    const orderNumber = currentNumber + 1;
    const saleId = uid();
    const consumptionRecords = [];
    for (const entry of inventoryData.consumption) {
      const before = Number(entry.ingredient.theoreticalQuantity || 0);
      const after = before - entry.quantity;
      const updatedIngredient = { ...entry.ingredient, theoreticalQuantity: after, updatedAt: nowIso(), appVersion: APP_VERSION };
      const movement = {
        id: uid(), ingredientId: entry.ingredient.id, inventoryItemId: entry.ingredient.inventoryItemId,
        type: 'sale', quantity: -entry.quantity, absoluteQuantity: entry.quantity,
        beforeQuantity: before, afterQuantity: after, unitCost: Number(entry.ingredient.averageCost || 0),
        referenceType: 'sale', referenceId: saleId, detail: `Consumo del pedido ${orderNumber}`,
        createdAt: nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION
      };
      transaction.objectStore('inventoryIngredients').put(updatedIngredient);
      transaction.objectStore('inventoryMovementsLocal').put(movement);
      transaction.objectStore('syncQueue').put(queueRecord('inventoryMovementsLocal', { ...movement, ingredient: updatedIngredient }));
      consumptionRecords.push({ ingredientId: entry.ingredient.id, inventoryItemId: entry.ingredient.inventoryItemId, quantity: entry.quantity, unitCost: Number(entry.ingredient.averageCost || 0), movementId: movement.id });
    }
    const sale = {
      ...saleDraft, id: saleId, date, orderNumber, createdAt: nowIso(), updatedAt: nowIso(),
      status: 'confirmed', cashSessionId: currentCash.id, appVersion: APP_VERSION,
      estimatedCost: inventoryData.estimatedCost, inventoryConsumption: consumptionRecords
    };
    settingsStore.put({ id: counterId, value: orderNumber, updatedAt: nowIso() });
    transaction.objectStore('sales').put(sale);
    transaction.objectStore('movements').put({ id: uid(), date, createdAt: nowIso(), type: 'sale', method: sale.payment, amount: sale.total, saleId: sale.id, cashSessionId: sale.cashSessionId, status: 'active' });
    transaction.objectStore('syncQueue').put(queueRecord('sales', sale));
    transaction.objectStore('auditLogs').put({ id: uid(), action: 'sale_created', entity: 'sales', entityId: sale.id, details: { orderNumber, total: sale.total, estimatedCost: sale.estimatedCost, inventoryLines: consumptionRecords.length }, createdAt: nowIso(), appVersion: APP_VERSION });
    await transactionPromise(transaction);
    return sale;
  });
};

annulSale = async function(id) {
  const sale = await getRecord('sales', id);
  if (!sale || sale.status === 'cancelled') return toast('La venta ya está anulada o no existe.');
  const reason = prompt(`Motivo para anular el pedido ${String(sale.orderNumber).padStart(3, '0')}:`, 'Error en el pedido');
  if (!reason?.trim()) return;
  if (!confirm(`¿Anular el pedido ${String(sale.orderNumber).padStart(3, '0')} por ${money(sale.total)}?\nLa operación quedará registrada.`)) return;
  try {
    await withAppLock('sale', async () => {
      const consumption = Array.isArray(sale.inventoryConsumption) ? sale.inventoryConsumption : [];
      const stores = ['sales', 'movements', 'syncQueue', 'auditLogs', 'inventoryIngredients', 'inventoryMovementsLocal'];
      const transaction = db.transaction(stores, 'readwrite');
      const updated = { ...sale, status: 'cancelled', cancelledAt: nowIso(), cancellationReason: reason.trim(), updatedAt: nowIso() };
      transaction.objectStore('sales').put(updated);
      transaction.objectStore('movements').put({ id: uid(), date: sale.date, createdAt: nowIso(), type: 'sale_reversal', method: sale.payment, amount: -Number(sale.total), saleId: sale.id, cashSessionId: sale.cashSessionId, status: 'active', reason: reason.trim() });
      for (const entry of consumption) {
        const ingredient = await requestPromise(transaction.objectStore('inventoryIngredients').get(entry.ingredientId));
        if (!ingredient) continue;
        const before = Number(ingredient.theoreticalQuantity || 0);
        const quantity = Number(entry.quantity || 0);
        const after = before + quantity;
        const updatedIngredient = { ...ingredient, theoreticalQuantity: after, updatedAt: nowIso(), appVersion: APP_VERSION };
        const movement = { id: uid(), ingredientId: ingredient.id, inventoryItemId: ingredient.inventoryItemId, type: 'reversal', quantity, absoluteQuantity: quantity, beforeQuantity: before, afterQuantity: after, unitCost: Number(entry.unitCost || ingredient.averageCost || 0), referenceType: 'sale', referenceId: sale.id, detail: `Reversión pedido ${sale.orderNumber}`, createdAt: nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION };
        transaction.objectStore('inventoryIngredients').put(updatedIngredient);
        transaction.objectStore('inventoryMovementsLocal').put(movement);
        transaction.objectStore('syncQueue').put(queueRecord('inventoryMovementsLocal', { ...movement, ingredient: updatedIngredient }));
      }
      transaction.objectStore('syncQueue').put(queueRecord('sales', updated));
      transaction.objectStore('auditLogs').put({ id: uid(), action: 'sale_cancelled', entity: 'sales', entityId: sale.id, details: { orderNumber: sale.orderNumber, total: sale.total, reason: reason.trim(), inventoryReversed: consumption.length }, createdAt: nowIso(), appVersion: APP_VERSION });
      await transactionPromise(transaction);
    });
    scheduleAutoBackup(`anulación pedido ${sale.orderNumber}`);
    await refreshStatus();
    notifyOtherTabs('sale-changed');
    toast('Venta anulada, caja e inventario revertidos.');
    await renderModule('orders');
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo anular la venta.', 4200);
  }
};

saveClientTransaction = async function(event) {
  event.preventDefault();
  if (!canManageBusiness()) return toast('Este movimiento requiere autorización de la propietaria o del administrador.');
  const clientId = $('clientTxnClientId').value;
  const type = $('clientTxnType').value;
  const amount = Number($('clientTxnAmount').value);
  const method = type === 'payment' ? $('clientTxnMethod').value : 'Fiado';
  if (!Number.isFinite(amount) || amount <= 0) return toast('Ingresa un monto válido.');
  if (type === 'payment' && method === 'Efectivo' && !currentCash) return toast('Abre la caja antes de registrar un abono en efectivo.');
  await withAppLock('client-account', async () => {
    const stores = ['clients', 'clientPayments', 'movements', 'syncQueue', 'auditLogs'];
    const transaction = db.transaction(stores, 'readwrite');
    const clientsStore = transaction.objectStore('clients');
    const client = await requestPromise(clientsStore.get(clientId));
    if (!client) throw new Error('El cliente ya no existe.');
    if (type === 'charge' && !client.creditAllowed) throw new Error('El cliente no está autorizado para fiado.');
    const currentBalance = Number(client.balance || 0);
    const applied = type === 'payment' ? Math.min(amount, currentBalance) : amount;
    if (type === 'payment' && currentBalance <= 0) throw new Error('El cliente no tiene saldo pendiente.');
    client.balance = type === 'charge' ? currentBalance + applied : currentBalance - applied;
    client.updatedAt = nowIso();
    const movement = { id: uid(), clientId, type, amount: applied, requestedAmount: amount, method, detail: $('clientTxnDetail').value.trim(), date: localDateKey(), createdAt: nowIso(), appVersion: APP_VERSION };
    clientsStore.put(client);
    transaction.objectStore('clientPayments').put(movement);
    if (type === 'payment') transaction.objectStore('movements').put({ id: uid(), date: localDateKey(), createdAt: nowIso(), type: 'client_payment', method, amount: method === 'Efectivo' ? applied : 0, clientId, cashSessionId: method === 'Efectivo' ? currentCash.id : null, status: method === 'Efectivo' ? 'active' : 'non_cash' });
    transaction.objectStore('syncQueue').put(queueRecord('clients', client));
    transaction.objectStore('syncQueue').put(queueRecord('clientPayments', movement));
    transaction.objectStore('auditLogs').put({ id: uid(), action: type === 'charge' ? 'credit_charge_created' : 'client_payment_created', entity: 'clients', entityId: clientId, details: { amount: applied, balance: client.balance, method }, createdAt: nowIso(), appVersion: APP_VERSION });
    await transactionPromise(transaction);
  });
  $('clientTxnDialog').close();
  scheduleAutoBackup('movimiento de cliente');
  await renderModule('clients');
  await refreshStatus();
  toast(type === 'charge' ? 'Consumo fiado registrado.' : 'Abono registrado correctamente.');
};

savePurchase = async function(event) {
  event.preventDefault();
  if (!canManageBusiness()) return toast('Solo la propietaria o el administrador pueden registrar compras.');
  const ingredient = await getRecord('inventoryIngredients', $('purchaseIngredient').value);
  if (!ingredient) return toast('Selecciona un insumo.');
  const purchaseQty = Number($('purchaseQuantity').value || 0);
  const total = Number($('purchaseTotal').value || 0);
  const paymentSource = $('purchasePaymentSource').value;
  const converted = purchaseQty * Number(ingredient.conversionFactor || 1);
  if (purchaseQty <= 0 || total < 0) return toast('Revisa cantidad y precio.');
  if (paymentSource === 'cash' && !currentCash) return toast('Abre la caja antes de pagar una compra con dinero de caja.');
  const purchase = { id: uid(), purchaseItemId: uid(), ingredientId: ingredient.id, inventoryItemId: ingredient.inventoryItemId, ingredientName: ingredient.name, description: ingredient.name, purchaseUnit: ingredient.purchaseUnit, quantity: purchaseQty, convertedQuantity: converted, baseUnit: ingredient.baseUnit, total, supplier: $('purchaseSupplier').value.trim(), paymentSource, notes: $('purchaseNotes').value.trim(), date: localDateKey(), cashSessionId: paymentSource === 'cash' ? currentCash.id : null, createdAt: nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION };
  const purchaseItem = { id: purchase.purchaseItemId, purchaseId: purchase.id, ingredientId: ingredient.id, description: ingredient.name, purchaseUnit: ingredient.purchaseUnit, quantity: purchaseQty, convertedQuantity: converted, unitPrice: purchaseQty > 0 ? total / purchaseQty : 0, lineTotal: total, createdAt: purchase.createdAt, updatedAt: purchase.updatedAt, appVersion: APP_VERSION };
  const before = Number(ingredient.theoreticalQuantity || 0);
  const after = before + converted;
  const unitCost = converted > 0 ? total / converted : 0;
  const updated = { ...ingredient, theoreticalQuantity: after, averageCost: before + converted > 0 ? ((before * Number(ingredient.averageCost || 0)) + total) / (before + converted) : unitCost, updatedAt: nowIso() };
  const inventoryMovement = { id: uid(), ingredientId: ingredient.id, inventoryItemId: ingredient.inventoryItemId, type: 'purchase', quantity: converted, beforeQuantity: before, afterQuantity: after, unitCost, detail: `Compra: ${purchaseQty} ${ingredient.purchaseUnit}`, referenceType: 'purchase', referenceId: purchase.id, createdAt: nowIso(), updatedAt: nowIso(), appVersion: APP_VERSION };
  const cashMovement = { id: uid(), date: localDateKey(), createdAt: nowIso(), type: 'purchase', method: paymentSource === 'cash' ? 'Efectivo' : 'Externo', amount: paymentSource === 'cash' ? -total : 0, purchaseId: purchase.id, cashSessionId: paymentSource === 'cash' ? currentCash.id : null, status: paymentSource === 'cash' ? 'active' : 'non_cash' };
  const stores = ['inventoryIngredients', 'inventoryMovementsLocal', 'purchasesLocal', 'purchaseItemsLocal', 'movements', 'syncQueue', 'auditLogs'];
  const transaction = db.transaction(stores, 'readwrite');
  transaction.objectStore('inventoryIngredients').put(updated);
  transaction.objectStore('inventoryMovementsLocal').put(inventoryMovement);
  transaction.objectStore('purchasesLocal').put(purchase);
  transaction.objectStore('purchaseItemsLocal').put(purchaseItem);
  transaction.objectStore('movements').put(cashMovement);
  transaction.objectStore('syncQueue').put(queueRecord('purchasesLocal', { ...purchase, purchaseItem, ingredient: updated, movement: inventoryMovement }));
  transaction.objectStore('auditLogs').put({ id: uid(), action: 'purchase_created', entity: 'purchasesLocal', entityId: purchase.id, details: { ingredient: ingredient.name, total, converted, paymentSource }, createdAt: nowIso(), appVersion: APP_VERSION });
  await transactionPromise(transaction);
  const linkedMarketItemId = $('purchaseMarketItemId')?.value;
  if (linkedMarketItemId && typeof markMarketItemPurchased === 'function') await markMarketItemPurchased(linkedMarketItemId, purchase);
  $('purchaseDialog').close();
  await renderModule(currentModuleKey === 'purchases' ? 'purchases' : currentModuleKey === 'market' ? 'market' : 'inventory');
  await refreshStatus();
  scheduleAutoBackup('registro de compra');
  toast('Compra registrada, stock y caja actualizados.');
};

async function cashFlowForDateV08(date = localDateKey()) {
  const movements = (await getAllRecords('movements')).filter(item => item.date === date && item.status === 'active');
  const cashIncome = movements.filter(item => ['sale', 'sale_reversal', 'client_payment'].includes(item.type) && item.method === 'Efectivo').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cashOut = movements.filter(item => ['expense', 'purchase', 'withdrawal'].includes(item.type) && item.method === 'Efectivo').reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0);
  return { movements, cashIncome, cashOut, net: cashIncome - cashOut };
}

showSummary = async function() {
  const sales = await salesForDate();
  const cancelled = (await salesForDate(localDateKey(), true)).filter(sale => sale.status === 'cancelled').length;
  const total = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const cash = sales.filter(sale => sale.payment === 'Efectivo').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const qr = sales.filter(sale => sale.payment === 'QR').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const flow = await cashFlowForDateV08();
  const expenses = (await loadExpensesV08()).filter(item => item.date === localDateKey()).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const estimatedCost = sales.reduce((sum, sale) => sum + Number(sale.estimatedCost || 0), 0);
  const expected = Number(currentCash?.openingAmount || 0) + flow.net;
  $('summaryContent').innerHTML = `<div class="summary-grid">
    <div class="summary-metric"><span>Pedidos válidos</span><strong>${sales.length}</strong></div>
    <div class="summary-metric"><span>Total vendido</span><strong>${money(total)}</strong></div>
    <div class="summary-metric"><span>Efectivo vendido</span><strong>${money(cash)}</strong></div>
    <div class="summary-metric"><span>QR</span><strong>${money(qr)}</strong></div>
    <div class="summary-metric"><span>Otros ingresos de caja</span><strong>${money(Math.max(0, flow.cashIncome - cash))}</strong></div>
    <div class="summary-metric"><span>Salidas de caja</span><strong>${money(flow.cashOut)}</strong></div>
    <div class="summary-metric"><span>Gastos del día</span><strong>${money(expenses)}</strong></div>
    <div class="summary-metric"><span>Costo estimado vendido</span><strong>${money(estimatedCost)}</strong></div>
    <div class="summary-metric"><span>Fondo inicial</span><strong>${money(currentCash?.openingAmount || 0)}</strong></div>
    <div class="summary-metric"><span>Efectivo esperado</span><strong>${money(expected)}</strong></div>
    <div class="summary-metric"><span>Anulaciones</span><strong>${cancelled}</strong></div>
    <div class="summary-metric"><span>Persistencia</span><strong>Local + Supabase</strong></div>
  </div>`;
  $('closeCashBtn').style.display = currentCash ? 'inline-block' : 'none';
  $('summaryDialog').showModal();
};

prepareCloseCash = async function() {
  if (!currentCash) return toast('No hay una caja abierta.');
  const flow = await cashFlowForDateV08();
  const expected = Number(currentCash.openingAmount || 0) + flow.net;
  $('expectedCashText').textContent = `Efectivo esperado: ${money(expected)} · Ingresos ${money(flow.cashIncome)} · Salidas ${money(flow.cashOut)}`;
  $('countedCash').value = Math.max(0, expected).toFixed(2);
  $('nextDayFund').value = String(currentCash.nextFund || 80);
  $('closeCashDialog').dataset.expected = String(expected);
  updateCashDifference();
  $('summaryDialog').close();
  $('closeCashDialog').showModal();
};

pushQueueItem = async function(item, deviceId) {
  const client = supabaseClient;
  const businessId = authContext.businessId;
  const userId = authContext.userId;
  const payload = item.payload;
  if (item.entity === 'expensesLocal') {
    const row = {
      id: payload.id, business_id: businessId, expense_date: payload.date,
      category: payload.category, description: payload.description, amount: Number(payload.amount || 0),
      payment_method: payload.paymentMethod === 'cash' ? 'cash' : payload.paymentMethod === 'qr' ? 'qr' : 'external',
      recurring: Boolean(payload.recurring), recurrence: payload.recurrence || null,
      cash_session_id: payload.cashSessionId || null,
      created_by: userId, device_id: deviceId, created_at: payload.createdAt || nowIso(), updated_at: payload.updatedAt || nowIso(),
      deleted_at: payload.status === 'cancelled' ? (payload.cancelledAt || nowIso()) : null
    };
    const { error } = await client.from('expenses').upsert(row, { onConflict: 'id' });
    if (error) throw error;
  } else if (item.entity === 'inventoryMovementsLocal') {
    const p = payload;
    const ing = p.ingredient;
    let { error } = await client.from('ingredients').upsert({ id: ing.id, business_id: businessId, name: ing.name, base_unit: ing.baseUnit, purchase_unit: ing.purchaseUnit || null, conversion_factor: Number(ing.conversionFactor || 1), average_cost: Number(ing.averageCost || 0), minimum_stock: Number(ing.minimumStock || 0), active: ing.active !== false, payload: {}, created_by: userId, created_at: ing.createdAt || nowIso(), updated_at: ing.updatedAt || nowIso() }, { onConflict: 'id' });
    if (error) throw error;
    ({ error } = await client.from('inventory_items').upsert({ id: ing.inventoryItemId, business_id: businessId, ingredient_id: ing.id, theoretical_quantity: 0, physical_quantity: ing.physicalQuantity == null ? null : Number(ing.physicalQuantity), last_counted_at: ing.lastCountedAt || null, updated_by: userId, updated_at: ing.updatedAt || nowIso() }, { onConflict: 'id', ignoreDuplicates: true }));
    if (error) throw error;
    const movementType = p.type === 'purchase' ? 'purchase' : p.type === 'sale' ? 'sale' : p.type === 'waste' ? 'waste' : p.type === 'reversal' ? 'reversal' : 'adjustment';
    ({ error } = await client.rpc('apply_inventory_movement_v080', { p_id: p.id, p_business_id: businessId, p_inventory_item_id: p.inventoryItemId, p_movement_type: movementType, p_quantity: Number(p.quantity || 0), p_unit_cost: Number(p.unitCost || 0), p_reference_type: p.referenceType || 'manual_adjustment', p_reference_id: p.referenceId || null, p_detail: p.detail || null, p_device_id: deviceId, p_created_at: p.createdAt || nowIso() }));
    if (error) throw error;
  } else if (item.entity === 'purchasesLocal') {
    const p = payload;
    const ing = p.ingredient;
    const m = p.movement;
    const purchaseItem = p.purchaseItem || { id: p.purchaseItemId, quantity: p.quantity, convertedQuantity: p.convertedQuantity, lineTotal: p.total, purchaseUnit: p.purchaseUnit, description: p.ingredientName };
    let { error } = await client.from('ingredients').upsert({ id: ing.id, business_id: businessId, name: ing.name, base_unit: ing.baseUnit, purchase_unit: ing.purchaseUnit || null, conversion_factor: Number(ing.conversionFactor || 1), average_cost: Number(ing.averageCost || 0), minimum_stock: Number(ing.minimumStock || 0), active: true, payload: {}, created_by: userId, created_at: ing.createdAt || nowIso(), updated_at: ing.updatedAt || nowIso() }, { onConflict: 'id' });
    if (error) throw error;
    ({ error } = await client.from('inventory_items').upsert({ id: ing.inventoryItemId, business_id: businessId, ingredient_id: ing.id, theoretical_quantity: 0, physical_quantity: ing.physicalQuantity == null ? null : Number(ing.physicalQuantity), updated_by: userId, updated_at: ing.updatedAt || nowIso() }, { onConflict: 'id', ignoreDuplicates: true }));
    if (error) throw error;
    ({ error } = await client.from('purchases').upsert({ id: p.id, business_id: businessId, purchase_date: p.date || String(p.createdAt).slice(0, 10), supplier: p.supplier || null, payment_source: p.paymentSource === 'cash' ? 'cash_register' : p.paymentSource === 'credit' ? 'credit' : 'external', total: Number(p.total || 0), notes: p.notes || null, created_by: userId, device_id: deviceId, created_at: p.createdAt || nowIso(), updated_at: p.updatedAt || nowIso() }, { onConflict: 'id' }));
    if (error) throw error;
    ({ error } = await client.from('purchase_items').upsert({ id: purchaseItem.id || p.purchaseItemId, business_id: businessId, purchase_id: p.id, ingredient_id: p.ingredientId, description: purchaseItem.description || p.ingredientName, purchase_unit: purchaseItem.purchaseUnit || p.purchaseUnit, quantity: Number(purchaseItem.quantity || p.quantity), converted_quantity: Number(purchaseItem.convertedQuantity || p.convertedQuantity), unit_price: Number(purchaseItem.quantity || p.quantity) > 0 ? Number(p.total) / Number(purchaseItem.quantity || p.quantity) : 0, line_total: Number(p.total), created_at: p.createdAt || nowIso(), updated_at: p.updatedAt || nowIso() }, { onConflict: 'id' }));
    if (error) throw error;
    ({ error } = await client.rpc('apply_inventory_movement_v080', { p_id: m.id, p_business_id: businessId, p_inventory_item_id: m.inventoryItemId, p_movement_type: 'purchase', p_quantity: Number(m.quantity), p_unit_cost: Number(m.unitCost || 0), p_reference_type: 'purchase', p_reference_id: p.id, p_detail: m.detail || null, p_device_id: deviceId, p_created_at: m.createdAt || nowIso() }));
    if (error) throw error;
  } else {
    return originalPushQueueItemV07(item, deviceId);
  }
  const eventRow = { id: item.id, business_id: businessId, device_id: deviceId, user_id: userId, entity: item.entity, entity_id: String(item.entityId), operation: item.operation || 'upsert', payload: item.payload || {}, sync_status: 'processed', created_at: item.createdAt || nowIso(), updated_at: nowIso() };
  const { error: eventError } = await client.from('sync_events').upsert(eventRow, { onConflict: 'id' });
  if (eventError) throw eventError;
};

pullRemoteCoreData = async function() {
  const result = await originalPullRemoteCoreDataV07();
  if (!supabaseClient || !authContext || !navigator.onLine) return result;
  const pendingIds = new Set((await getAllRecords('syncQueue')).filter(item => item.status !== 'synced').map(item => `${item.entity}:${item.entityId}`));
  const { data: expenses, error } = await supabaseClient.from('expenses').select('*').eq('business_id', authContext.businessId).order('expense_date', { ascending: false }).limit(1000);
  if (error) throw error;
  for (const row of expenses || []) {
    if (pendingIds.has(`expensesLocal:${row.id}`)) continue;
    await putRecord('expensesLocal', { id: row.id, date: row.expense_date, category: row.category, description: row.description, amount: Number(row.amount || 0), paymentMethod: row.payment_method === 'cash' ? 'cash' : row.payment_method === 'qr' ? 'qr' : 'external', recurring: Boolean(row.recurring), recurrence: row.recurrence || null, cashSessionId: row.cash_session_id || null, status: row.deleted_at ? 'cancelled' : 'active', cancelledAt: row.deleted_at || null, createdAt: row.created_at, updatedAt: row.updated_at, appVersion: APP_VERSION, remote: true });
    result.pulled = (result.pulled || 0) + 1;
  }
  await putRecord('remoteSnapshots', { id: 'expenses-v08', updatedAt: nowIso(), count: (expenses || []).length });
  return result;
};

verifyDataIntegrity = async function() {
  const report = await originalVerifyDataIntegrityV07();
  const [expenses, purchases, inventory, inventoryMovements] = await Promise.all([
    getAllRecords('expensesLocal'), getAllRecords('purchasesLocal'), getAllRecords('inventoryIngredients'), getAllRecords('inventoryMovementsLocal')
  ]);
  expenses.forEach(item => {
    if (!item.date || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) report.errors.push(`Gasto inválido: ${item.description || item.id}.`);
    if (item.paymentMethod === 'cash' && !item.cashSessionId && item.status !== 'cancelled') report.warnings.push(`El gasto ${item.description || item.id} fue marcado en efectivo sin sesión de caja.`);
  });
  purchases.forEach(item => {
    if (Number(item.quantity || 0) <= 0 || Number(item.total || 0) < 0) report.errors.push(`Compra inválida: ${item.ingredientName || item.id}.`);
    if (item.paymentSource === 'cash' && !item.cashSessionId) report.warnings.push(`La compra ${item.ingredientName || item.id} fue pagada desde caja sin sesión asociada.`);
  });
  inventory.forEach(item => {
    if (!Number.isFinite(Number(item.theoreticalQuantity))) report.errors.push(`Stock inválido en ${item.name}.`);
    if (Number(item.theoreticalQuantity || 0) < 0) report.warnings.push(`El stock teórico de ${item.name} es negativo (${inventoryNumber(item.theoreticalQuantity)} ${item.baseUnit}). Realiza un conteo físico.`);
  });
  const saleMovementRefs = new Set(inventoryMovements.filter(item => item.type === 'sale').map(item => item.referenceId));
  const sales = await getAllRecords('sales');
  sales.filter(item => item.status === 'confirmed' && Array.isArray(item.inventoryConsumption) && item.inventoryConsumption.length).forEach(item => {
    if (!saleMovementRefs.has(item.id)) report.warnings.push(`El pedido ${item.orderNumber} tiene consumo calculado, pero falta su movimiento de inventario.`);
  });
  report.counts.expenses = expenses.length;
  report.counts.purchases = purchases.length;
  report.counts.inventory = inventory.length;
  await putRecord('appMeta', { id: 'last-health-check', ...report });
  return report;
};

renderModule = async function(key) {
  if (!['expenses', 'reports', 'users'].includes(key)) return originalRenderModuleV07(key);
  const module = modules.find(item => item[0] === key);
  $('salesView').classList.remove('active');
  $('moduleView').classList.add('active');
  let body = '';
  if (key === 'expenses') body = await renderExpensesModuleV08();
  if (key === 'reports') body = await renderReportsModuleV08();
  if (key === 'users') body = await renderUsersModuleV08();
  $('moduleContent').innerHTML = `<div class="module-hero"><p class="eyebrow" style="color:#ffd54d">Good King V${V08_VERSION}</p><h1>${escapeHTML(module[2])}</h1><p>${escapeHTML(module[3])}</p></div>${body}`;
  if (key === 'expenses') {
    $('newExpenseBtn')?.addEventListener('click', () => openExpenseDialogV08());
    $('expenseMonthFilter')?.addEventListener('change', async event => { reportMonthV08 = event.target.value || reportMonthV08; await renderModule('expenses'); });
    $('moduleContent').querySelectorAll('.edit-expense').forEach(button => button.onclick = async () => openExpenseDialogV08(await getRecord('expensesLocal', button.dataset.id)));
    $('moduleContent').querySelectorAll('.repeat-expense').forEach(button => button.onclick = () => repeatExpenseV08(button.dataset.id));
    $('moduleContent').querySelectorAll('.cancel-expense').forEach(button => button.onclick = () => cancelExpenseV08(button.dataset.id));
  }
  if (key === 'reports') {
    $('moduleContent').querySelectorAll('[data-report-mode]').forEach(button => button.onclick = async () => { reportModeV08 = button.dataset.reportMode; await renderModule('reports'); });
    $('reportDateFilter')?.addEventListener('change', async event => { reportDateV08 = event.target.value || reportDateV08; await renderModule('reports'); });
    $('reportMonthFilter')?.addEventListener('change', async event => { reportMonthV08 = event.target.value || reportMonthV08; await renderModule('reports'); });
    $('printReportBtn')?.addEventListener('click', printReportV08);
    $('exportReportBtn')?.addEventListener('click', exportReportCsvV08);
  }
  if (key === 'users') {
    $('refreshUsersBtn')?.addEventListener('click', async () => { try { await loadUsersV08({ forceRemote: true }); await renderModule('users'); toast('Usuarios actualizados.'); } catch (error) { toast(error.message || 'No se pudo actualizar.', 5200); } });
    $('moduleContent').querySelectorAll('.user-role-select').forEach(select => select.onchange = () => updateUserMembershipV08(select.dataset.userId, { role: select.value }));
    $('moduleContent').querySelectorAll('.user-active-check').forEach(check => check.onchange = () => updateUserMembershipV08(check.dataset.userId, { active: check.checked }));
  }
};

function bindV08() {
  $('expenseCategory').innerHTML = EXPENSE_CATEGORIES_V08.map(item => `<option>${escapeHTML(item)}</option>`).join('');
  $('expenseForm')?.addEventListener('submit', saveExpenseV08);
  $('dismissExpense').onclick = $('cancelExpense').onclick = () => $('expenseDialog').close();
  $('expenseRecurring')?.addEventListener('change', () => { $('expenseRecurrenceRow').hidden = !$('expenseRecurring').checked; });
}

window.addEventListener('DOMContentLoaded', () => setTimeout(bindV08, 0));
