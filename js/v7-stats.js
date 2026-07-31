/* v7-stats.js — Inteligencia comercial básica para Natura Vida V7.2.3. */

(() => {
  function userSalesV7() {
    const uid = AppState.session && (AppState.session.onlineUserId || AppState.session.userId);
    return (AppState.sales || []).filter(s => isAdmin() || !uid || s.sellerId === uid).slice().sort((a,b)=>Number(b.date||0)-Number(a.date||0));
  }

  function monthKey(ts) {
    const d = new Date(Number(ts || Date.now()));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }

  function currentMonthSales(sales) {
    const key = monthKey(Date.now());
    return sales.filter(s => monthKey(s.date) === key);
  }

  function summarizeSales(sales) {
    return sales.reduce((acc, s) => {
      acc.total += Number(s.total || 0);
      acc.count += 1;
      acc.units += (s.items || []).reduce((sum, i) => sum + Number(i.qty || 0), 0);
      acc.discount += Number(s.discountTotal || 0) || (s.items || []).reduce((sum, i) => sum + Number(i.discountAmount || 0), 0);
      acc.surcharge += Number(s.surchargeTotal || 0) || (s.items || []).reduce((sum, i) => sum + Number(i.surchargeAmount || 0), 0);
      acc.profit += Number(s.sellerProfit || 0);
      return acc;
    }, { count: 0, total: 0, units: 0, discount: 0, surcharge: 0, profit: 0 });
  }

  function topProducts(sales) {
    const map = new Map();
    sales.forEach(s => (s.items || []).forEach(i => {
      const key = i.productId || i.productName;
      const row = map.get(key) || { name: i.productName || 'Producto', units: 0, total: 0 };
      row.units += Number(i.qty || 0);
      row.total += Number(i.subtotal || 0);
      map.set(key, row);
    }));
    return Array.from(map.values()).sort((a,b)=>b.units-a.units || b.total-a.total).slice(0, 8);
  }

  function topClients(sales) {
    const map = new Map();
    sales.forEach(s => {
      const key = (s.clientPhone || '').trim() || normalizeSearch(s.clientName || 'Cliente');
      const row = map.get(key) || { name: s.clientName || 'Cliente', phone: s.clientPhone || '', count: 0, total: 0, last: 0 };
      row.count += 1;
      row.total += Number(s.total || 0);
      row.last = Math.max(row.last, Number(s.date || 0));
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a,b)=>b.total-a.total || b.count-a.count).slice(0, 8);
  }

  function topRepresentatives(sales) {
    const map = new Map();
    sales.forEach(s => {
      const key = s.sellerId || s.sellerName || 'rep';
      const row = map.get(key) || { name: s.sellerName || 'Representante', count: 0, total: 0, units: 0 };
      row.count += 1;
      row.total += Number(s.total || 0);
      row.units += (s.items || []).reduce((sum, i) => sum + Number(i.qty || 0), 0);
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a,b)=>b.total-a.total).slice(0, 8);
  }

  function commercialStatus(row) {
    const days = row.last ? Math.floor((Date.now() - row.last) / 86400000) : 9999;
    if (days > 90) return { label: 'Inactivo', cls: 'gray' };
    if (row.count >= 8 || row.total >= 3000) return { label: 'Consolidado', cls: 'green' };
    if (row.count >= 3 || row.total >= 800) return { label: 'Recurrente', cls: 'blue' };
    if (days <= 30) return { label: 'Nuevo', cls: 'orange' };
    return { label: 'En seguimiento', cls: 'yellow' };
  }

  function bar(widthPct) {
    return `<span class="statBar"><i style="width:${Math.max(4, Math.min(100, widthPct))}%"></i></span>`;
  }

  function renderRows(rows, type) {
    if (!rows.length) return `<div class="v7Empty small"><span>📊</span><p>Aún no hay datos suficientes.</p></div>`;
    const max = Math.max(...rows.map(r => Number(type === 'products' ? r.units : r.total) || 0), 1);
    return rows.map(r => {
      const value = Number(type === 'products' ? r.units : r.total) || 0;
      const status = type === 'clients' ? commercialStatus(r) : null;
      return `<div class="statRow"><div><strong>${escapeHtml(r.name)}</strong><small>${type === 'products' ? `${r.units} unidad(es) · ${fmtMoney(r.total)}` : type === 'clients' ? `${r.count} compra(s) · ${r.last ? fmtDate(r.last) : 'sin fecha'}` : `${r.count} venta(s) · ${r.units} unidad(es)`}${status ? ` · <em class="trust ${status.cls}">${status.label}</em>` : ''}</small>${bar((value / max) * 100)}</div><b>${type === 'products' ? r.units : fmtMoney(r.total)}</b></div>`;
    }).join('');
  }

  function renderCommercialStatsV7() {
    $('#fabAdd').classList.add('hidden');
    const sales = userSalesV7();
    const month = currentMonthSales(sales);
    const all = summarizeSales(sales);
    const now = summarizeSales(month);
    const avg = now.count ? now.total / now.count : 0;
    const products = topProducts(sales);
    const clients = topClients(sales);
    const reps = isAdmin() ? topRepresentatives(sales) : [];
    $('#mainArea').innerHTML = `
      <section class="v7PageHead"><span class="v7Eyebrow">Medición comercial</span><h1>Estadísticas</h1><p>Productos que más salen, clientes que más compran, descuentos, recargos y rendimiento.</p></section>
      <section class="v7MetricGrid compact statsMetrics">
        <article class="v7MetricCard primary"><span>Ventas del mes</span><strong>${fmtMoney(now.total)}</strong></article>
        <article class="v7MetricCard"><span>Operaciones</span><strong>${now.count}</strong></article>
        <article class="v7MetricCard"><span>Unidades</span><strong>${now.units}</strong></article>
        <article class="v7MetricCard"><span>Ticket promedio</span><strong>${fmtMoney(avg)}</strong></article>
        <article class="v7MetricCard"><span>Rebajas</span><strong>${fmtMoney(now.discount)}</strong></article>
        <article class="v7MetricCard"><span>Recargos</span><strong>${fmtMoney(now.surcharge)}</strong></article>
      </section>
      <section class="statsPanel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Ranking</span><h2>Productos más vendidos</h2></div></div>${renderRows(products, 'products')}</section>
      <section class="statsPanel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Clientes</span><h2>Mejores clientes y estado comercial</h2></div></div>${renderRows(clients, 'clients')}</section>
      ${isAdmin() ? `<section class="statsPanel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Representantes</span><h2>Rendimiento por vendedor</h2></div></div>${renderRows(reps, 'reps')}</section>` : ''}
      <section class="statsPanel soft"><div class="v7PanelHead"><div><span class="v7Eyebrow">Histórico total</span><h2>Resumen acumulado</h2></div></div><div class="statTotals"><span>Total vendido <b>${fmtMoney(all.total)}</b></span><span>Ventas <b>${all.count}</b></span><span>Unidades <b>${all.units}</b></span><span>Rebajas <b>${fmtMoney(all.discount)}</b></span><span>Recargos <b>${fmtMoney(all.surcharge)}</b></span></div></section>
    `;
  }

  window.renderCommercialStatsV7 = renderCommercialStatsV7;
})();
