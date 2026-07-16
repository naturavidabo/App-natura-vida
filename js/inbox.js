/* inbox.js — Buzón conectado directamente a Supabase. */

let _lastUnreadV725 = 0;
function playNotificationBeatV725() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const start = ctx.currentTime;
    [0, 0.16].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = idx ? 2300 : 1950;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.42, start + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.135);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start + offset); osc.stop(start + offset + 0.145);
    });
    setTimeout(()=>ctx.close && ctx.close(), 600);
  } catch (_) {}
}


function normalizeMessage(m = {}) {
  const now = Date.now();
  return {
    id: m.id || uid('msg'),
    type: m.type || 'general',
    title: m.title || 'Mensaje',
    body: m.body || '',
    senderUserId: m.senderUserId || m.sender_user_id || null,
    senderName: m.senderName || m.sender_name || '',
    senderRole: m.senderRole || m.sender_role || '',
    recipientRole: m.recipientRole || m.recipient_role || 'Administrador',
    recipientUserId: m.recipientUserId || m.recipient_user_id || null,
    status: m.status || 'unread',
    payload: m.payload || {},
    createdAt: Number(m.createdAt || (m.created_at ? new Date(m.created_at).getTime() : now)),
    updatedAt: Number(m.updatedAt || (m.updated_at ? new Date(m.updated_at).getTime() : now))
  };
}

function messageVisibleForCurrentUser(message) {
  if (!requireAuth()) return false;
  const m = normalizeMessage(message);
  if (isAdmin && isAdmin()) return m.recipientRole === 'Administrador' || !m.recipientRole || m.recipientUserId === AppState.session.userId || m.recipientUserId === AppState.session.onlineUserId;
  const uid = AppState.session.userId;
  const onlineId = AppState.session.onlineUserId;
  return m.recipientUserId === uid || m.recipientUserId === onlineId || m.senderUserId === uid || m.senderUserId === onlineId || m.recipientRole === AppState.session.roleName;
}

async function saveLocalMessage(message) {
  const msg = normalizeMessage(message);
  await DB.put('messages', msg);
  AppState.messages = await DB.getAll('messages');
  return msg;
}

async function sendAdminMessage(type, title, body, payload = {}) {
  const msg = normalizeMessage({
    type,
    title,
    body,
    senderUserId: AppState.session ? (AppState.session.onlineUserId || AppState.session.userId) : null,
    senderName: AppState.session ? (AppState.session.fullName || AppState.session.username) : '',
    senderRole: AppState.session ? AppState.session.roleName : '',
    recipientRole: 'Administrador',
    status: 'unread',
    payload
  });
  // El envío inmediato hacia Supabase ahora ocurre dentro de saveLocalMessage
  // conexión en este momento.
  await saveLocalMessage(msg);
  await refreshInboxBadge({ silent: true }).catch(() => {});
  return msg;
}

async function syncInboxFromCloud() {
  if (!isOnlineConfigured() || !window.fetchCloudInboxMessages) return { ok: true, count: 0, localOnly: true };
  const res = await fetchCloudInboxMessages().catch(err => ({ ok: false, message: err.message }));
  if (!res.ok) return res;
  const rows = (res.messages || []).map(normalizeMessage);
  await DB.clear('messages').catch(() => {});
  if (rows.length) await DB.bulkPut('messages', rows, { silent: true }).catch(() => {});
  AppState.messages = await DB.getAll('messages').catch(() => []);
  return { ok: true, count: rows.length };
}

async function refreshInboxBadge(options = {}) {
  // Para evitar congelamientos, el buzón no consulta Supabase en cada render.
  // Sólo actualiza online si se solicita explícitamente con forceCloud.
  if (options.forceCloud && requireAuth()) await syncInboxFromCloud().catch(() => {});
  const messages = (await DB.getAll('messages').catch(() => [])).map(normalizeMessage);
  AppState.messages = messages;
  const unread = messages.filter(m => messageVisibleForCurrentUser(m) && m.status !== 'read').length;
  const btn = document.getElementById('inboxFloatBtn');
  const dot = document.getElementById('inboxDot');
  const count = document.getElementById('inboxCount');
  if (btn) btn.classList.toggle('hidden', !requireAuth());
  if (dot) dot.classList.toggle('hidden', unread === 0);
  if (count) count.textContent = unread ? String(unread) : '';
  if (!options.silent && unread > _lastUnreadV725) playNotificationBeatV725();
  _lastUnreadV725 = unread;
  return unread;
}

function installInboxButton() {
  const stamp = document.getElementById('dateStamp');
  if (!stamp || document.getElementById('inboxFloatBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'inboxFloatBtn';
  btn.className = 'inboxFloatBtn hidden';
  btn.type = 'button';
  btn.innerHTML = `<span class="mailIcon">✉</span><span id="inboxDot" class="inboxDot hidden"></span><span id="inboxCount" class="inboxCount"></span>`;
  btn.title = 'Buzón de mensajes y pedidos';
  stamp.insertAdjacentElement('afterend', btn);
  btn.addEventListener('click', () => openInboxPanel(true));
}

async function markLocalMessageRead(id) {
  const msg = await DB.get('messages', id).catch(() => null);
  if (!msg) return;
  msg.status = 'read';
  msg.updatedAt = Date.now();
  await DB.put('messages', msg, { silent: true });
  if (window.markCloudMessageRead && isOnlineConfigured()) await markCloudMessageRead(id).catch(() => {});
}

async function openMessageComposer(options = {}) {
  if (!requireAuth()) return;
  const adminMode = isAdmin && isAdmin();
  const replyTo = options.replyTo || null;
  const recipientUserId = options.recipientUserId || (replyTo ? replyTo.senderUserId : null);
  const recipientName = options.recipientName || (replyTo ? replyTo.senderName : 'Administrador');
  if (adminMode && !recipientUserId) {
    showToast('Abre un mensaje de un representante para responderle.', 'error');
    return;
  }
  const suggestedTitle = replyTo ? `Respuesta: ${String(replyTo.title || 'Mensaje').replace(/^Respuesta:\s*/i, '')}` : 'Consulta al administrador';
  openSheet(`
    <h2>${replyTo ? 'Responder mensaje' : 'Escribir al administrador'} <span class="x" id="closeSheet">✕</span></h2>
    <div class="v7CashNotice">Destino: <strong>${escapeHtml(recipientName || (adminMode ? 'Representante' : 'Administrador'))}</strong>. Este buzón es para pedidos, consultas breves y coordinación comercial.</div>
    <div class="field"><label>Tipo de mensaje</label><select id="messageType"><option value="general">Consulta general</option><option value="pedido">Pedido o producto</option><option value="soporte">Problema con la aplicación</option><option value="pago">Pago o comprobante</option></select></div>
    <div class="field"><label>Asunto</label><input id="messageTitle" maxlength="100" value="${escapeHtml(suggestedTitle)}" placeholder="Resume el motivo"></div>
    <div class="field"><label>Mensaje</label><textarea id="messageBody" rows="6" maxlength="1200" placeholder="Escribe aquí el detalle necesario…"></textarea></div>
    <div class="nvSheetActions"><button class="btn block" id="sendDirectMessage">Enviar mensaje</button></div>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    const body = $('#messageBody', overlay);
    setTimeout(() => body && body.focus(), 120);
    $('#sendDirectMessage', overlay).addEventListener('click', async () => {
      if (!navigator.onLine) return showToast('Necesitas internet para enviar el mensaje.', 'error');
      const title = $('#messageTitle', overlay).value.trim();
      const text = body.value.trim();
      if (title.length < 3) return showToast('Escribe un asunto breve.', 'error');
      if (text.length < 3) return showToast('Escribe el mensaje.', 'error');
      const btn = $('#sendDirectMessage', overlay);
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      try {
        await saveLocalMessage({
          id: uid('msg'),
          type: $('#messageType', overlay).value,
          title,
          body: text,
          senderUserId: AppState.session.onlineUserId || AppState.session.userId,
          senderName: AppState.session.fullName || AppState.session.email || '',
          senderRole: AppState.session.roleName || '',
          recipientRole: adminMode ? 'Representante' : 'Administrador',
          recipientUserId: adminMode ? recipientUserId : null,
          status: 'unread',
          payload: replyTo ? { replyToMessageId: replyTo.id } : {}
        });
        await syncInboxFromCloud().catch(() => {});
        await refreshInboxBadge({ silent: true }).catch(() => {});
        close();
        showToast('Mensaje enviado correctamente.');
        setTimeout(() => openInboxPanel(), 80);
      } catch (error) {
        btn.disabled = false;
        btn.textContent = 'Reintentar envío';
        showToast((window.messageFromError ? messageFromError(error) : error.message) || 'No se pudo enviar el mensaje.', 'error');
      }
    });
  });
}

async function openInboxPanel() {
  if (navigator.onLine && requireAuth() && window.syncInboxFromCloud) {
    await syncInboxFromCloud().catch(() => {});
  }
  const messages = (await DB.getAll('messages').catch(() => [])).map(normalizeMessage)
    .filter(messageVisibleForCurrentUser)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 80);
  const unread = messages.filter(m => m.status !== 'read').length;
  openSheet(`
    <h2>Buzón <span class="x" id="closeSheet">✕</span></h2>
    <div class="inboxHero">
      <div class="mailBig">✉</div>
      <div>
        <div class="eyebrow">Mensajes, pedidos y avisos</div>
        <h3>${unread} pendiente(s)</h3>
        <p>${isAdmin() ? 'Aquí verás pedidos de representantes, avisos de actualización y mensajes del servidor.' : 'Aquí verás respuestas, avisos o confirmaciones del administrador.'}</p>
      </div>
    </div>
    <div class="livePill inboxLivePill">Mensajes en tiempo real</div>
    ${!isAdmin() ? '<button class="btn block inboxComposeBtn" id="composeAdminMessage">Escribir al administrador</button>' : ''}
    ${messages.length ? messages.map(m => `
      <div class="messageCard ${m.status !== 'read' ? 'unread' : ''}">
        <div class="messageTop">
          <strong>${escapeHtml(m.title)}</strong>
          <span>${fmtDate(m.createdAt)}</span>
        </div>
        <p>${escapeHtml(m.body)}</p>
        <div class="messageMeta">${escapeHtml(m.senderName || 'Sistema')} · ${escapeHtml(m.senderRole || '')} · ${escapeHtml(m.type)}</div>
        <div class="messageActions">
          ${m.status !== 'read' ? `<button class="btn sm outline markReadBtn" data-id="${m.id}">Marcar leído</button>` : `<span class="tinytag">Leído</span>`}
          ${m.type === 'purchase_order' && isAdmin() ? `<button class="btn sm openOrdersBtn">Ver pedidos</button>` : ''}
          ${isAdmin() && m.senderUserId && m.senderUserId !== (AppState.session.onlineUserId || AppState.session.userId) ? `<button class="btn sm replyMessageBtn" data-id="${m.id}">Responder</button>` : ''}
        </div>
      </div>
    `).join('') : `<div class="empty compact"><span class="ic">📭</span><h3>Sin mensajes</h3><p>Cuando llegue un pedido o aviso aparecerá aquí.</p></div>`}
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    const composeBtn = $('#composeAdminMessage', overlay);
    if (composeBtn) composeBtn.addEventListener('click', () => { close(); setTimeout(() => openMessageComposer(), 80); });
    $all('.replyMessageBtn', overlay).forEach(b => b.addEventListener('click', () => {
      const message = messages.find(m => m.id === b.dataset.id);
      if (!message) return;
      close();
      setTimeout(() => openMessageComposer({ replyTo: message, recipientUserId: message.senderUserId, recipientName: message.senderName }), 80);
    }));
    $all('.markReadBtn', overlay).forEach(b => b.addEventListener('click', async () => {
      await markLocalMessageRead(b.dataset.id);
      await refreshInboxBadge({ silent: true });
      close();
      await openInboxPanel();
    }));
    $all('.openOrdersBtn', overlay).forEach(b => b.addEventListener('click', () => { close(); navigateTo(isAdmin() ? 'pedidos' : 'compra'); }));
  });
  await refreshInboxBadge({ silent: true }).catch(() => {});
}

window.normalizeMessage = normalizeMessage;
window.messageVisibleForCurrentUser = messageVisibleForCurrentUser;
window.saveLocalMessage = saveLocalMessage;
window.sendAdminMessage = sendAdminMessage;
window.syncInboxFromCloud = syncInboxFromCloud;
window.refreshInboxBadge = refreshInboxBadge;
window.installInboxButton = installInboxButton;
window.openInboxPanel = openInboxPanel;
window.markLocalMessageRead = markLocalMessageRead;
window.openMessageComposer = openMessageComposer;

window.fetchAndCacheInboxMessages = syncInboxFromCloud;
