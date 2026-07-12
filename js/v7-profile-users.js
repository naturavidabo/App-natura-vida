/* NATURA VIDA V7 — perfil comercial, QR y gestión de representantes. */

(() => {
  let qrImage = null;
  let qrZoom = 1;
  let qrOffsetX = 0;
  let qrOffsetY = 0;
  let qrDataUrl = '';
  let removeQrRequested = false;

  function pendingOwnChange(field) {
    return (AppState.profileChangeRequests || []).find(r => r.userId === AppState.session.userId && r.fieldName === field && r.status === 'pending');
  }

  function renderProfileV7() {
    // Cada entrada al módulo comienza con el estado confirmado en Supabase.
    // Así un recorte o eliminación no guardados no reaparecen al volver más tarde.
    qrDataUrl = '';
    removeQrRequested = false;
    $('#fabAdd').classList.add('hidden');
    const cp = myCommercialProfile();
    const phoneReq = pendingOwnChange('phone');
    const cityReq = pendingOwnChange('city');
    window.V7_FORM_DIRTY = false;
    $('#mainArea').innerHTML = `
      <section class="v7PageHead"><span class="v7Eyebrow">Identidad y cobros</span><h1>Perfil comercial</h1><p>${isAdmin() ? 'Administra tus datos oficiales, presentación comercial y QR de cobro.' : 'Puedes actualizar tus datos de perfil y presentación comercial. El correo, rol y estado permanecen protegidos.'}</p></section>
      <section class="v7ProfileCardMain">
        <div class="v7Avatar large">${escapeHtml(window.displayInitialV7 ? displayInitialV7() : (AppState.session.fullName || 'N').charAt(0).toUpperCase())}</div>
        <div><h2>${escapeHtml(window.displayNameV7 ? displayNameV7() : (AppState.session.fullName || AppState.session.email || ''))}</h2><span>${escapeHtml(AppState.session.email || '')}</span><small>${isAdmin() ? 'Administrador principal' : 'Representante activo'}</small></div>
      </section>
      <section class="v7Panel">
        <div class="v7PanelHead"><div><span class="v7Eyebrow">Datos de perfil</span><h2>Identificación</h2></div><span class="v7Lock">Correo protegido</span></div>
        <div class="v7ReadonlyGrid">
          <label>Nombre completo<input id="v7FullName" value="${escapeHtml(window.displayNameV7 ? displayNameV7() : (AppState.session.fullName || AppState.session.email || ''))}" placeholder="Nombre y apellidos"></label>
          <label>Correo Gmail<input value="${escapeHtml(AppState.session.email || '')}" readonly></label>
          <label>WhatsApp<input id="v7OfficialPhone" inputmode="tel" value="${escapeHtml(AppState.session.phone || '')}" placeholder="Ej.: 70700000"></label>
          <label>Ciudad<input id="v7OfficialCity" value="${escapeHtml(AppState.session.city || '')}" placeholder="Ej.: Santa Cruz"></label>
        </div>
        <div class="v7CashNotice">Puedes editar tu nombre, WhatsApp y ciudad. El correo, rol y estado no se modifican desde la app.</div>
        <button class="btn outline block" id="saveOfficialProfileV7">Guardar datos de perfil</button>
      </section>
      <section class="v7Panel">
        <div class="v7PanelHead"><div><span class="v7Eyebrow">Presentación en recibos</span><h2>Mi negocio</h2></div></div>
        <div class="field"><label>Nombre comercial opcional</label><input id="v7BusinessName" value="${escapeHtml(cp.businessName || '')}" placeholder="Ej.: Natura Vida La Paz"></div>
        <div class="field"><label>Dirección comercial opcional</label><input id="v7Address" value="${escapeHtml(cp.address || '')}" placeholder="Dirección o zona de atención"></div>
        <div class="field"><label>Ubicación / referencia</label><input id="v7LocationLabel" value="${escapeHtml(cp.locationLabel || '')}" placeholder="Ej.: Barrio Equipetrol, frente a..."></div>
        <div class="field-row"><div class="field"><label>Latitud</label><input id="v7Lat" type="number" step="any" value="${cp.latitude == null ? '' : cp.latitude}"></div><div class="field"><label>Longitud</label><input id="v7Lng" type="number" step="any" value="${cp.longitude == null ? '' : cp.longitude}"></div></div>
        <button class="btn ghost block" id="useLocationV7">Usar mi ubicación actual</button>
        <div class="field"><label>Mensaje para recibos</label><textarea id="v7ReceiptMessage" rows="3" placeholder="Ej.: Gracias por confiar en productos naturales Natura Vida.">${escapeHtml(cp.receiptMessage || '')}</textarea></div>
      </section>
      <section class="v7Panel">
        <div class="v7PanelHead"><div><span class="v7Eyebrow">Cobro al contado</span><h2>Mi QR</h2></div></div>
        <div class="v7QrWarning"><strong>Importante:</strong> sube solamente el QR limpio. No uses capturas completas del banco, marcos, saldos, logotipos decorativos ni información adicional.</div>
        <div class="v7QrCurrent">${cp.qrUrl ? `<img src="${escapeHtml(cp.qrUrl)}" alt="QR actual" loading="lazy" decoding="async"><span>QR actual guardado</span>` : '<div>QR</div><span>Aún no configurado</span>'}</div>
        <button class="btn outline block" id="openQrCropV7">Cargar y recortar QR</button>
        <button class="btn ghost block ${cp.qrUrl ? '' : 'hidden'}" id="removeQrV7">Eliminar QR guardado</button>
      </section>
      <button class="btn block v7SaveProfile" id="saveCommercialProfileV7">Guardar perfil comercial</button>
    `;

    $all('#mainArea input:not([readonly]), #mainArea textarea').forEach(el => el.addEventListener('input', () => { window.V7_FORM_DIRTY = true; }));
    $('#saveOfficialProfileV7').addEventListener('click', async () => {
      const btn = $('#saveOfficialProfileV7');
      const fullName = $('#v7FullName').value.trim();
      const phone = $('#v7OfficialPhone').value.trim();
      const city = $('#v7OfficialCity').value.trim();
      if (!fullName || fullName.length < 3) return showToast('Ingresa un nombre completo válido.', 'error');
      btn.disabled = true; btn.textContent = 'Guardando perfil…';
      const res = await upsertCloudProfileForUser(AppState.session.userId, AppState.session.email, { fullName, phone, city });
      btn.disabled = false; btn.textContent = 'Guardar datos de perfil';
      if (!res.ok) return showToast(res.message || 'No se pudo guardar el perfil.', 'error');
      AppState.session.fullName = res.profile.full_name || fullName;
      AppState.session.phone = res.profile.phone || phone;
      AppState.session.city = res.profile.city || city;
      window.V7_FORM_DIRTY = false;
      showToast('Perfil actualizado correctamente.');
      renderProfileV7();
    });
    $('#openQrCropV7').addEventListener('click', () => openQrCropper(qrDataUrl || cp.qrUrl || ''));
    const currentQrImg = $('.v7QrCurrent img');
    if (currentQrImg) currentQrImg.addEventListener('error', () => {
      const box = $('.v7QrCurrent');
      if (box) box.innerHTML = '<div>!</div><span>No se pudo cargar el QR guardado</span>';
    }, { once: true });
    $('#removeQrV7').addEventListener('click', async () => {
      if (!confirm('¿Eliminar el QR de cobro de tu perfil y de los próximos recibos?')) return;
      qrDataUrl = '';
      removeQrRequested = true;
      window.V7_FORM_DIRTY = true;
      $('.v7QrCurrent').innerHTML = '<div>QR</div><span>Se eliminará al guardar</span>';
      $('#removeQrV7').classList.add('hidden');
      showToast('QR marcado para eliminar. Pulsa Guardar perfil comercial.');
    });
    $('#useLocationV7').addEventListener('click', () => {
      if (!navigator.geolocation) return showToast('El dispositivo no permite obtener ubicación.', 'error');
      const btn = $('#useLocationV7'); btn.disabled = true; btn.textContent = 'Obteniendo ubicación…';
      navigator.geolocation.getCurrentPosition(pos => {
        $('#v7Lat').value = pos.coords.latitude.toFixed(6);
        $('#v7Lng').value = pos.coords.longitude.toFixed(6);
        window.V7_FORM_DIRTY = true;
        btn.disabled = false; btn.textContent = 'Ubicación capturada';
      }, () => { btn.disabled = false; btn.textContent = 'Usar mi ubicación actual'; showToast('No se pudo obtener la ubicación.', 'error'); }, { enableHighAccuracy: true, timeout: 10000 });
    });
    $('#saveCommercialProfileV7').addEventListener('click', async () => {
      const btn = $('#saveCommercialProfileV7'); btn.disabled = true; btn.textContent = 'Guardando en Supabase…';
      const profile = {
        businessName: $('#v7BusinessName').value.trim(),
        address: $('#v7Address').value.trim(),
        locationLabel: $('#v7LocationLabel').value.trim(),
        latitude: $('#v7Lat').value,
        longitude: $('#v7Lng').value,
        receiptMessage: $('#v7ReceiptMessage').value.trim(),
        qrUrl: removeQrRequested ? '' : (qrDataUrl || cp.qrUrl || '')
      };
      if (qrDataUrl && qrDataUrl.startsWith('data:image/')) {
        const upload = await uploadPaymentQrV7(qrDataUrl);
        if (!upload.ok) {
          btn.disabled = false; btn.textContent = 'Reintentar guardado';
          return showToast(upload.message || 'No se pudo subir el QR. No se guardó ningún cambio.', 'error');
        }
        profile.qrUrl = upload.url;
      }
      const res = await saveCommercialProfileV7(profile);
      if (!res.ok) {
        btn.disabled = false; btn.textContent = 'Reintentar guardado';
        return showToast(res.message, 'error');
      }
      const verify = await fetchCommercialProfilesV7();
      const persisted = myCommercialProfile();
      const qrVerified = verify.ok && (removeQrRequested ? !persisted.qrUrl : String(persisted.qrUrl || '') === String(profile.qrUrl || ''));
      if (!qrVerified) {
        btn.disabled = false; btn.textContent = 'Verificar y reintentar';
        return showToast('Supabase no confirmó el QR guardado. No cierres esta pantalla y vuelve a intentarlo.', 'error');
      }
      if (removeQrRequested && window.deletePaymentQrV7) await deletePaymentQrV7().catch(() => {});
      btn.disabled = false; btn.textContent = 'Guardar perfil comercial';
      qrDataUrl = '';
      removeQrRequested = false;
      window.V7_FORM_DIRTY = false;
      showToast('Perfil comercial y QR verificados correctamente.');
      renderProfileV7();
    });
  }

  function openAdminOfficialEditV7() {
    openSheet(`
      <h2>Editar datos oficiales <span class="x" id="closeSheet">✕</span></h2>
      <div class="field"><label>WhatsApp</label><input id="adminPhoneV7" inputmode="tel" value="${escapeHtml(AppState.session.phone || '')}"></div>
      <div class="field"><label>Ciudad</label><input id="adminCityV7" value="${escapeHtml(AppState.session.city || '')}"></div>
      <button class="btn block" id="saveAdminOfficialV7">Guardar datos</button>
    `, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#saveAdminOfficialV7', overlay).addEventListener('click', async () => {
        const btn = $('#saveAdminOfficialV7', overlay);
        btn.disabled = true;
        btn.textContent = 'Guardando…';
        const res = await upsertCloudProfileForUser(AppState.session.userId, AppState.session.email, {
          fullName: AppState.session.fullName,
          phone: $('#adminPhoneV7', overlay).value.trim(),
          city: $('#adminCityV7', overlay).value.trim()
        });
        if (!res.ok) {
          btn.disabled = false;
          btn.textContent = 'Reintentar';
          return showToast(res.message, 'error');
        }
        AppState.session.phone = res.profile.phone || '';
        AppState.session.city = res.profile.city || '';
        close();
        showToast('Datos oficiales actualizados.');
        renderProfileV7();
      });
    });
  }

  function openOfficialChangeRequest() {
    const pendingPhone = pendingOwnChange('phone');
    const pendingCity = pendingOwnChange('city');
    openSheet(`
      <h2>Solicitar cambio <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CashNotice">El administrador revisará la solicitud. El dato actual seguirá vigente hasta su aprobación.</div>
      <div class="field"><label>Nuevo WhatsApp</label><input id="changePhoneV7" inputmode="tel" value="${escapeHtml(pendingPhone ? pendingPhone.newValue : AppState.session.phone || '')}" ${pendingPhone ? 'disabled' : ''}>${pendingPhone ? '<small class="pendingText">Ya existe una solicitud pendiente.</small>' : ''}</div>
      <div class="field"><label>Nueva ciudad</label><input id="changeCityV7" value="${escapeHtml(pendingCity ? pendingCity.newValue : AppState.session.city || '')}" ${pendingCity ? 'disabled' : ''}>${pendingCity ? '<small class="pendingText">Ya existe una solicitud pendiente.</small>' : ''}</div>
      <button class="btn block" id="sendOfficialChangeV7">Enviar solicitud</button>
    `, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#sendOfficialChangeV7', overlay).addEventListener('click', async () => {
        const tasks = [];
        const phone = $('#changePhoneV7', overlay).value.trim();
        const city = $('#changeCityV7', overlay).value.trim();
        if (!pendingPhone && phone && phone !== AppState.session.phone) tasks.push(requestProfileChangeV7('phone', phone));
        if (!pendingCity && city && city !== AppState.session.city) tasks.push(requestProfileChangeV7('city', city));
        if (!tasks.length) return showToast('No hay cambios nuevos para solicitar.', 'error');
        const results = await Promise.all(tasks); const failed = results.find(r => !r.ok);
        if (failed) return showToast(failed.message, 'error');
        close(); showToast('Solicitud enviada al administrador.'); renderProfileV7();
      });
    });
  }

  function drawQrCrop(canvas, image, zoom = 1, offsetX = 0, offsetY = 0, guide = true) {
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    const baseScale = Math.max(size / image.width, size / image.height);
    const scale = baseScale * zoom;
    const w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, (size - w) / 2 + offsetX, (size - h) / 2 + offsetY, w, h);
    if (guide) {
      ctx.strokeStyle = '#11a060'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]);
      ctx.strokeRect(5, 5, size - 10, size - 10); ctx.setLineDash([]);
    }
  }

  function cleanQrCropDataUrl(image, zoom, offsetX, offsetY) {
    const output = document.createElement('canvas');
    output.width = 800; output.height = 800;
    const scaleFactor = output.width / 420;
    drawQrCrop(output, image, zoom, offsetX * scaleFactor, offsetY * scaleFactor, false);
    return output.toDataURL('image/jpeg', 0.96);
  }

  function openQrCropper(existingUrl) {
    qrImage = null; qrZoom = 1; qrOffsetX = 0; qrOffsetY = 0;
    openSheet(`
      <h2>Recortar QR <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7QrWarning"><strong>Solo QR limpio:</strong> centra el código dentro del cuadro. Puedes arrastrar la imagen y acercarla. La línea verde es solo una guía y no aparecerá en el QR guardado.</div>
      <label class="v7QrUpload"><input id="qrFileV7" type="file" accept="image/*"><span>Seleccionar imagen del QR</span></label>
      <canvas id="qrCanvasV7" width="420" height="420" aria-label="Área de recorte del QR"></canvas>
      <div class="field"><label>Acercar / alejar</label><input id="qrZoomV7" type="range" min="1" max="4" step="0.05" value="1"></div>
      <button class="btn ghost block" id="centerQrV7">Centrar nuevamente</button>
      <button class="btn block" id="useQrCropV7" disabled>Usar este recorte limpio</button>
    `, (overlay, close) => {
      const canvas = $('#qrCanvasV7', overlay);
      let dragging = false, lastX = 0, lastY = 0;
      const redraw = () => drawQrCrop(canvas, qrImage, qrZoom, qrOffsetX, qrOffsetY, true);
      const loadImage = src => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          qrImage = img; qrZoom = 1; qrOffsetX = 0; qrOffsetY = 0;
          $('#qrZoomV7', overlay).value = 1; redraw(); $('#useQrCropV7', overlay).disabled = false;
        };
        img.onerror = () => showToast('No se pudo abrir la imagen del QR.', 'error');
        img.src = src;
      };
      if (existingUrl) loadImage(existingUrl);
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#qrFileV7', overlay).addEventListener('change', async e => {
        const file = e.target.files && e.target.files[0]; if (!file) return;
        if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type || '')) return showToast('Usa una imagen PNG, JPG o WEBP.', 'error');
        if (file.size > 8 * 1024 * 1024) return showToast('La imagen supera 8 MB.', 'error');
        loadImage(await readImageFile(file));
      });
      $('#qrZoomV7', overlay).addEventListener('input', e => { qrZoom = Number(e.target.value || 1); redraw(); });
      $('#centerQrV7', overlay).addEventListener('click', () => { qrOffsetX = 0; qrOffsetY = 0; qrZoom = 1; $('#qrZoomV7', overlay).value = 1; redraw(); });
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', e => {
        if (!qrImage) return; dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', e => {
        if (!dragging || !qrImage) return;
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / Math.max(1, rect.width);
        qrOffsetX += (e.clientX - lastX) * scale; qrOffsetY += (e.clientY - lastY) * scale;
        lastX = e.clientX; lastY = e.clientY; redraw();
      });
      const stopDrag = () => { dragging = false; };
      canvas.addEventListener('pointerup', stopDrag); canvas.addEventListener('pointercancel', stopDrag);
      $('#useQrCropV7', overlay).addEventListener('click', () => {
        if (!qrImage) return;
        qrDataUrl = cleanQrCropDataUrl(qrImage, qrZoom, qrOffsetX, qrOffsetY);
        removeQrRequested = false;
        window.V7_FORM_DIRTY = true;
        const box = $('.v7QrCurrent');
        if (box) box.innerHTML = `<img src="${qrDataUrl}" alt="Vista previa del QR recortado"><span>Vista previa lista para guardar</span>`;
        const removeBtn = $('#removeQrV7');
        if (removeBtn) removeBtn.classList.remove('hidden');
        close(); showToast('QR limpio preparado. Guarda el perfil para subirlo y verificarlo.');
      });
    });
  }

  function userStatus(profile) {
    const s = String(profile.status || 'pendiente').toLowerCase();
    return s === 'activo' ? ['Activo', 'success'] : s === 'bloqueado' ? ['Bloqueado', 'danger'] : ['Pendiente', 'warning'];
  }

  async function renderUsersFoundationV7() {
    $('#fabAdd').classList.add('hidden');
    const [profilesRes] = await Promise.all([fetchAllProfilesV7(), fetchProfileChangeRequestsV7()]);
    const profiles = profilesRes && profilesRes.ok ? profilesRes.profiles || [] : AppState.allProfiles || [];
    const requests = (AppState.profileChangeRequests || []).filter(r => r.status === 'pending');
    $('#mainArea').innerHTML = `
      <section class="v7PageHead"><span class="v7Eyebrow">Equipo comercial</span><h1>Representantes</h1><p>Aprueba cuentas, bloquea accesos y asigna descuentos personales.</p></section>
      ${requests.length ? `<section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Solicitudes pendientes</span><h2>Cambios de perfil</h2></div><span class="v7BadgeCount">${requests.length}</span></div>${requests.map(r => { const p=profiles.find(x=>x.id===r.userId)||{}; return `<article class="v7ChangeRequest"><div><strong>${escapeHtml(p.full_name||p.email||'Usuario')}</strong><span>${r.fieldName==='phone'?'WhatsApp':'Ciudad'}: <b>${escapeHtml(r.oldValue||'—')}</b> → <b>${escapeHtml(r.newValue)}</b></span><small>${fmtDateTime(r.createdAt)}</small></div><div><button class="btn sm approveProfileChange" data-id="${r.id}">Aprobar</button><button class="btn sm outline rejectProfileChange" data-id="${r.id}">Rechazar</button></div></article>`; }).join('')}</section>` : ''}
      <section class="v7UsersGrid">${profiles.map(p => { const [label,tone]=userStatus(p); const self=p.id===AppState.session.userId; const admin=String(p.role||'').toLowerCase()==='administrador'; return `<article class="v7UserCard ${admin?'admin':''}"><div class="v7UserTop"><div class="v7Avatar">${escapeHtml((p.full_name||p.email||'U').charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(p.full_name||'Sin nombre')}</strong><span>${escapeHtml(p.email||'')}</span><small>${escapeHtml(p.city||'')} ${p.phone?'· '+escapeHtml(p.phone):''}</small></div><em class="v7Status ${tone}">${label}</em></div>${admin?`<div class="v7AdminPrincipal">Administrador principal</div>`:`<div class="v7DiscountEditor"><label>Grupo de precios<select data-rep-group="${p.id}"><option value="">Sin grupo fijo</option>${AppState.priceGroups.map(g=>`<option value="${g.id}" ${((AppState.representatives||[]).find(r=>r.id===p.id)||{}).priceGroupId===g.id?'selected':''}>${escapeHtml(g.name)} (${g.mode==='discount'?'−':'+'}${g.percent}%)</option>`).join('')}</select></label><label>Descuento personal para compras<input type="number" min="0" max="100" step="0.5" value="${Number(p.representative_discount_percent||0)}" data-discount-input="${p.id}"></label><button class="btn sm outline saveDiscountV7" data-id="${p.id}">Guardar grupo/descuento</button></div><div class="v7UserActions"><button class="btn sm detailRepresentativeV725" data-id="${p.id}">Ver stock y movimientos</button><button class="btn sm ghost editLegalNameV7" data-id="${p.id}">Corregir nombre</button>${String(p.status).toLowerCase()==='pendiente'?`<button class="btn sm approveUserV7" data-id="${p.id}">Aprobar</button>`:''}${String(p.status).toLowerCase()==='activo'?`<button class="btn sm outline blockUserV7" data-id="${p.id}">Bloquear</button>`:''}${String(p.status).toLowerCase()==='bloqueado'?`<button class="btn sm unblockUserV7" data-id="${p.id}">Reactivar</button>`:''}</div>`}</article>`; }).join('')}</section>`;

    $all('.editLegalNameV7').forEach(b=>b.addEventListener('click',()=>openLegalNameCorrection(b.dataset.id, profiles)));
    $all('.approveUserV7').forEach(b=>b.addEventListener('click',()=>runUserAction(b,adminApproveUser,'Cuenta aprobada.')));
    $all('.blockUserV7').forEach(b=>b.addEventListener('click',()=>runUserAction(b,adminBlockUser,'Cuenta bloqueada.')));
    $all('.unblockUserV7').forEach(b=>b.addEventListener('click',()=>runUserAction(b,adminUnblockUser,'Cuenta reactivada.')));
    $all('.saveDiscountV7').forEach(b=>b.addEventListener('click',async()=>{const input=$(`[data-discount-input="${b.dataset.id}"]`);const group=$(`[data-rep-group="${b.dataset.id}"]`);const res=await setRepresentativeDiscountV7(b.dataset.id,Number(input.value||0)); if(res.ok){await saveRepresentativeConfigV725(b.dataset.id,{priceGroupId:group?group.value:'',discountPercent:Number(input.value||0)}).catch(()=>{});} showToast(res.ok?'Grupo/descuento actualizado.':res.message,res.ok?undefined:'error');if(res.ok)renderUsersFoundationV7();}));
    $all('.detailRepresentativeV725').forEach(b=>b.addEventListener('click',()=>openRepresentativeDetailV725(b.dataset.id, profiles)));
    $all('.approveProfileChange').forEach(b=>b.addEventListener('click',()=>reviewChange(b.dataset.id,'approved')));
    $all('.rejectProfileChange').forEach(b=>b.addEventListener('click',()=>reviewChange(b.dataset.id,'rejected')));
  }

  function openLegalNameCorrection(userId, profiles) {
    const profile = profiles.find(p => p.id === userId);
    if (!profile) return;
    openSheet(`
      <h2>Corregir nombre oficial <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7CashNotice">Este dato queda protegido. Solo el administrador puede corregirlo cuando el registro inicial está incompleto.</div>
      <div class="field"><label>Nombre completo</label><input id="legalNameV7" value="${escapeHtml(profile.full_name || '')}" placeholder="Nombre y apellidos"></div>
      <button class="btn block" id="saveLegalNameV7">Guardar corrección</button>
    `, (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#saveLegalNameV7', overlay).addEventListener('click', async () => {
        const value = $('#legalNameV7', overlay).value.trim();
        if (value.length < 3) return showToast('Ingresa un nombre completo válido.', 'error');
        const btn = $('#saveLegalNameV7', overlay);
        btn.disabled = true;
        btn.textContent = 'Guardando…';
        const res = await adminUpdateProfileNameV7(userId, value);
        if (!res.ok) {
          btn.disabled = false;
          btn.textContent = 'Reintentar';
          return showToast(res.message, 'error');
        }
        close();
        showToast('Nombre oficial corregido.');
        renderUsersFoundationV7();
      });
    });
  }


  async function saveRepresentativeConfigV725(userId, data = {}) {
    const existing = (AppState.representatives || []).find(r => r.id === userId) || { id: userId, createdAt: Date.now() };
    const row = Object.assign({}, existing, data, { id: userId, updatedAt: Date.now() });
    await DB.put('representatives', row);
    const idx = (AppState.representatives || []).findIndex(r => r.id === userId);
    if (idx >= 0) AppState.representatives[idx] = row; else AppState.representatives.push(row);
    return row;
  }

  async function openRepresentativeDetailV725(userId, profiles = []) {
    const p = profiles.find(x => x.id === userId) || (AppState.allProfiles || []).find(x => x.id === userId) || {};
    openSheet(`<h2>Representante <span class="x" id="closeSheet">✕</span></h2><div class="v7CashNotice">Cargando stock, pedidos y ventas de ${escapeHtml(p.full_name || p.email || 'representante')}…</div>`, async (overlay, close) => {
      $('#closeSheet', overlay).addEventListener('click', close);
      const stockRes = window.fetchRepresentativeStockForAdminV725 ? await fetchRepresentativeStockForAdminV725(userId) : { ok: true, rows: [] };
      const orderRes = window.fetchRepresentativeOrdersForAdminV725 ? await fetchRepresentativeOrdersForAdminV725(userId) : { ok: true, orders: [] };
      const rows = stockRes.ok ? (stockRes.rows || []) : [];
      const orders = orderRes.ok ? (orderRes.orders || []) : [];
      const sales = (AppState.sales || []).filter(s => s.sellerId === userId || s.ownerUserId === userId || s.representativeId === userId);
      const productMoves = new Map();
      sales.forEach(s => (s.items || []).forEach(it => productMoves.set(it.productName || it.name || it.productId, (productMoves.get(it.productName || it.name || it.productId) || 0) + Number(it.qty || 0))));
      const topProducts = Array.from(productMoves.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
      const stockUnits = rows.reduce((sum,r)=>sum+Number(r.stock||0),0);
      const stockValue = rows.reduce((sum,r)=>sum+(Number(r.stock||0)*Number(r.acquisitionCost||0)),0);
      const cfg = (AppState.representatives || []).find(r => r.id === userId) || {};
      const group = AppState.priceGroups.find(g => g.id === cfg.priceGroupId);
      $('.sheet', overlay).innerHTML = `
        <h2>Representante <span class="x" id="closeSheet">✕</span></h2>
        <section class="v7ProfileCardMain compact"><div class="v7Avatar">${escapeHtml((p.full_name || p.email || 'R').charAt(0).toUpperCase())}</div><div><h2>${escapeHtml(p.full_name || 'Sin nombre')}</h2><span>${escapeHtml(p.email || '')}</span><small>${escapeHtml(p.phone || '')}</small></div></section>
        <section class="v7MetricGrid compact"><article class="v7MetricCard"><span>Stock</span><strong>${stockUnits}</strong><small>unidades</small></article><article class="v7MetricCard"><span>Valor stock</span><strong>${fmtMoney(stockValue)}</strong></article><article class="v7MetricCard primary"><span>Ventas</span><strong>${sales.length}</strong></article></section>
        <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Precios</span><h2>Grupo y descuento</h2></div></div><div class="priceLine"><span>Grupo asignado</span><b>${escapeHtml(group ? group.name : 'Sin grupo')}</b></div><div class="priceLine"><span>Descuento personal</span><b>${Number(cfg.discountPercent ?? p.representative_discount_percent ?? 0)}%</b></div></section>
        <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Stock actual</span><h2>Productos del representante</h2></div></div>${rows.length ? rows.map(r=>`<div class="repStockLineV726"><span><strong>${escapeHtml(r.productName)}</strong><small>${escapeHtml(r.category||'General')}</small></span><b>${Number(r.stock||0)}</b></div>`).join('') : `<div class="v7Empty small"><span>📦</span><p>No se encontró stock registrado para este representante.</p></div>`}</section>
        <section class="v7Panel"><div class="v7PanelHead"><div><span class="v7Eyebrow">Actividad</span><h2>Pedidos y ventas</h2></div></div><div class="priceLine"><span>Pedidos recientes</span><b>${orders.length}</b></div><div class="priceLine"><span>Ventas registradas</span><b>${sales.length}</b></div>${topProducts.length?`<div class="v7CashNotice"><strong>Productos más movidos</strong><br>${topProducts.map(x=>`${escapeHtml(x[0])}: ${x[1]} u.`).join('<br>')}</div>`:''}</section>
      `;
      $('#closeSheet', overlay).addEventListener('click', close);
    });
  }

  async function runUserAction(btn, fn, success) { btn.disabled=true; const res=await fn(btn.dataset.id); showToast(res.ok?success:res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV7(); else btn.disabled=false; }
  async function reviewChange(id, decision) { const res=await reviewProfileChangeV7(id,decision,''); showToast(res.ok?(decision==='approved'?'Cambio aprobado.':'Cambio rechazado.'):res.message,res.ok?undefined:'error'); if(res.ok)renderUsersFoundationV7(); }

  Object.assign(window, { renderProfileV7, openOfficialChangeRequest, openQrCropper, renderUsersFoundation: renderUsersFoundationV7 });
})();
