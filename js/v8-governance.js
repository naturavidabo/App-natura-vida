/* Natura Vida V8.0.6 — saneamiento, diagnóstico y calidad de datos.
   Funciona con la información autorizada ya cargada desde Supabase.
   No elimina ni corrige datos automáticamente. */
(function(){
  'use strict';

  const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const digits = (v) => String(v || '').replace(/\D/g,'');
  const esc = (v) => window.escapeHtml ? escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function activityForUser(userId){
    const id = String(userId || '');
    const sets = [
      ['ventas', AppState.sales || [], ['sellerId','seller_id','userId','user_id','createdBy']],
      ['clientes', AppState.clients || [], ['ownerUserId','owner_user_id','createdBy','userId']],
      ['cotizaciones', AppState.quotes || [], ['sellerId','seller_id','userId','createdBy']],
      ['mensajes', AppState.messages || [], ['senderUserId','sender_user_id','recipientUserId','recipient_user_id']]
    ];
    const detail = {};
    let total = 0;
    sets.forEach(([label, rows, fields]) => {
      const count = rows.filter(row => fields.some(f => String(row && row[f] || '') === id)).length;
      detail[label] = count; total += count;
    });
    return { total, detail };
  }

  function classifyProfile(p){
    const hay = norm([p.full_name,p.email,p.role,p.notes].join(' '));
    const activity = activityForUser(p.id);
    const demo = /(^| )(demo|prueba|test|ejemplo)( |$)/.test(hay);
    const missing = [];
    if (!p.email) missing.push('correo');
    if (!p.full_name) missing.push('nombre');
    if (!p.role && !p.commercial_role) missing.push('rol');
    if (!p.status) missing.push('estado');
    if ((p.commercial_role === 'linked_seller' || p.role === 'vendedor_vinculado') && !(p.stock_owner_user_id || p.stockOwnerUserId)) missing.push('propietario de stock');
    return { demo, missing, activity };
  }

  function findClientDuplicates(){
    const clients = AppState.clients || [];
    const groups = [];
    const seen = new Set();
    clients.forEach((a, i) => {
      if (seen.has(String(a.id))) return;
      const an = norm(a.name || a.businessName || a.contactName);
      const ap = digits(a.phone || a.whatsapp);
      if (!an && !ap) return;
      const matches = clients.slice(i + 1).filter(b => {
        const bn = norm(b.name || b.businessName || b.contactName);
        const bp = digits(b.phone || b.whatsapp);
        const samePhone = ap.length >= 7 && bp === ap;
        const nameClose = an && bn && (an === bn || (an.length >= 5 && bn.length >= 5 && (an.includes(bn) || bn.includes(an))));
        return samePhone || nameClose;
      });
      if (matches.length) {
        const all = [a, ...matches]; all.forEach(x => seen.add(String(x.id)));
        groups.push(all);
      }
    });
    return groups;
  }

  function inventoryIssues(){
    return (AppState.products || []).flatMap(p => {
      const issues = [];
      const stock = Number(p.stock);
      if (!Number.isFinite(stock)) issues.push('stock inválido');
      if (stock < 0) issues.push('stock negativo');
      if (!p.name) issues.push('sin nombre');
      const cost = Number(p.cost ?? p.baseCost ?? 0);
      const publicPrice = Number(p.publicPrice ?? p.unitPriceFixed ?? 0);
      if (cost < 0 || publicPrice < 0) issues.push('precio/costo negativo');
      if (publicPrice > 0 && cost > publicPrice) issues.push('costo mayor al precio público');
      return issues.length ? [{ product:p, issues }] : [];
    });
  }

  function systemHealth(){
    const conn = window.CloudConnection || {};
    const duplicateGroups = findClientDuplicates();
    const inv = inventoryIssues();
    const checks = [
      { label:'Conexión a internet', ok:navigator.onLine, detail:navigator.onLine ? 'Disponible' : 'Sin conexión' },
      { label:'Supabase', ok:conn.state === 'online', warn:conn.state !== 'error' && conn.state !== 'offline', detail:conn.state || 'sin confirmar' },
      { label:'Sesión', ok:!!(AppState.session && AppState.session.isAuthenticated), detail:AppState.session?.email || AppState.session?.username || 'No identificada' },
      { label:'Clientes duplicados', ok:duplicateGroups.length === 0, warn:duplicateGroups.length > 0, detail:duplicateGroups.length ? `${duplicateGroups.length} grupo(s) para revisar` : 'Sin coincidencias evidentes' },
      { label:'Inventario', ok:inv.length === 0, warn:inv.length > 0, detail:inv.length ? `${inv.length} producto(s) con observaciones` : 'Sin inconsistencias básicas' },
      { label:'Versión', ok:true, detail:'8.0.6' }
    ];
    return { checks, duplicateGroups, inventory:inv };
  }

  function downloadBackup(){
    if (window.NV806QualityAssurance?.createVerifiedBackup) return NV806QualityAssurance.createVerifiedBackup();
    const payload = {
      schema:'natura-vida-safe-export', version:'8.0.6', exportedAt:new Date().toISOString(),
      warning:'Copia de consulta de datos cargados en la sesión. No sustituye el respaldo administrado de Supabase.',
      data:{
        products:AppState.products||[], clients:AppState.clients||[], sales:AppState.sales||[],
        quotes:AppState.quotes||[], messages:AppState.messages||[], expenses:AppState.expenses||[],
        receivablePayments:AppState.receivablePayments||[], settings:AppState.settings||{}
      }
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `natura-vida-respaldo-consulta-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    if (window.writeAudit) writeAudit('backup:export_readonly','system','session',null,{version:'8.0.6'}).catch(()=>{});
  }

  function renderGovernanceCenter(){
    if (window.isAdmin && !isAdmin()) { showToast('Solo el administrador central puede abrir este diagnóstico.','error'); return; }
    const health = systemHealth();
    const profiles = window.NV804Profiles || [];
    const profileAudit = profiles.map(p => ({p, ...classifyProfile(p)}));
    const incomplete = profileAudit.filter(x=>x.missing.length);
    const demos = profileAudit.filter(x=>x.demo);
    const okCount = health.checks.filter(x=>x.ok).length;

    $('#fabAdd')?.classList.add('hidden');
    $('#mainArea').innerHTML = `
      <section class="nv804Head">
        <div><span class="eyebrow">Saneamiento y control</span><h1>Estado del sistema</h1><p>Diagnóstico preventivo. Ninguna corrección ni eliminación se ejecuta automáticamente.</p></div>
        <span class="nv804Score">${okCount}/${health.checks.length}</span>
      </section>
      <div class="nv804Grid">
        ${health.checks.map(c=>`<div class="nv804Check ${c.ok?'ok':c.warn?'warn':'bad'}"><span class="dot"></span><div><strong>${esc(c.label)}</strong><small>${esc(c.detail)}</small></div></div>`).join('')}
      </div>
      <section class="dashboardPanel nv804Panel">
        <div class="panelHeader"><div><span class="eyebrow">Calidad de datos</span><h2>Revisión preventiva</h2></div></div>
        <div class="miniStats">
          <div><span>Posibles duplicados</span><strong>${health.duplicateGroups.length}</strong></div>
          <div><span>Inventario observado</span><strong>${health.inventory.length}</strong></div>
          <div><span>Usuarios demo</span><strong>${demos.length}</strong></div>
          <div><span>Perfiles incompletos</span><strong>${incomplete.length}</strong></div>
        </div>
      </section>
      ${health.duplicateGroups.length ? `<section class="dashboardPanel nv804Panel"><div class="panelHeader"><div><span class="eyebrow">No se fusionan automáticamente</span><h2>Clientes posiblemente duplicados</h2></div></div>${health.duplicateGroups.slice(0,10).map(g=>`<div class="nv804ReviewRow"><div><strong>${g.map(x=>esc(x.name||x.businessName||'Sin nombre')).join(' / ')}</strong><small>${g.map(x=>esc(x.phone||x.whatsapp||'sin teléfono')).join(' · ')}</small></div><span class="nv804Tag">Revisar</span></div>`).join('')}</section>` : ''}
      ${health.inventory.length ? `<section class="dashboardPanel nv804Panel"><div class="panelHeader"><div><span class="eyebrow">Sin ajustes automáticos</span><h2>Observaciones de inventario</h2></div></div>${health.inventory.slice(0,20).map(x=>`<div class="nv804ReviewRow"><div><strong>${esc(x.product.name||'Producto')}</strong><small>${esc(x.issues.join(', '))}</small></div><span class="nv804Tag warn">Atención</span></div>`).join('')}</section>` : ''}
      <section class="dashboardPanel nv804Panel">
        <div class="panelHeader"><div><span class="eyebrow">Copia de consulta</span><h2>Respaldo manual</h2></div></div>
        <p class="nv804Note">Descarga los datos actualmente autorizados y cargados en esta sesión. Esta copia ayuda a verificar información, pero no reemplaza los respaldos automáticos de Supabase.</p>
        <button class="btn block" id="nv804DownloadBackup">Descargar copia JSON</button>
        <button class="btn outline block" id="nv804BackSettings">Volver a configuración</button>
      </section>`;
    $('#nv804DownloadBackup')?.addEventListener('click', downloadBackup);
    $('#nv804BackSettings')?.addEventListener('click', ()=>window.navigateTo ? navigateTo('ajustes') : renderSettings());
  }

  async function collectProfiles(){
    if (!(window.isAdmin && isAdmin()) || !window.fetchAllProfilesForAdmin) return [];
    const res = await fetchAllProfilesForAdmin().catch(()=>({ok:false}));
    window.NV804Profiles = res && res.ok ? (res.profiles||[]) : [];
    return window.NV804Profiles;
  }

  window.NV804Governance = { norm, digits, activityForUser, classifyProfile, findClientDuplicates, inventoryIssues, systemHealth, downloadBackup, renderGovernanceCenter, collectProfiles };
  window.renderGovernanceCenter = renderGovernanceCenter;
})();
