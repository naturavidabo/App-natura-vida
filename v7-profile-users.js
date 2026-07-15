/* NATURA VIDA V7 — recibos virtuales, PDF y compartir con cualquier aplicación. */

(() => {
  async function loadImageV7(src) {
    if (!src) return null;
    const source = String(src);

    const openImage = (url, crossOrigin = false) => new Promise(resolve => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });

    // Los dataURL ya son seguros para el canvas.
    if (source.startsWith('data:image/')) return openImage(source);

    // Convierte la imagen remota a Blob local. Esto evita que el QR desaparezca
    // del recibo por caché o por restricciones CORS del canvas.
    try {
      const response = await fetch(source, { mode: 'cors', cache: 'no-store' });
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const image = await openImage(objectUrl);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        if (image) return image;
      }
    } catch (_) {}

    // Compatibilidad para URLs públicas que permiten carga directa.
    return openImage(source, true);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let line = '';
    let lines = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        lines += 1;
        line = word;
        if (lines >= maxLines - 1) break;
      } else line = test;
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y);
    return y + lineHeight;
  }

  function documentOwnerProfile(userId, documentData = {}) {
    const exact = userId && window.commercialProfileFor ? commercialProfileFor(userId) : null;
    if (exact) return exact;

    const own = window.myCommercialProfile ? myCommercialProfile() : null;
    if (own && (!userId || own.userId === userId || userId === AppState.session.onlineUserId || userId === AppState.session.userId)) {
      return own;
    }

    return {
      userId: userId || null,
      businessName: documentData.sellerBusinessName || documentData.businessName || '',
      receiptMessage: documentData.sellerReceiptMessage || documentData.receiptMessage || '',
      qrUrl: documentData.sellerQrUrl || documentData.qrUrl || ''
    };
  }

  function documentOwnerName(userId, fallback, documentData = {}) {
    const cp = documentOwnerProfile(userId, documentData);
    return cp.businessName || documentData.sellerBusinessName || fallback || AppState.settings.businessName || 'NATURA VIDA';
  }

  async function buildV7ReceiptCanvas(documentData, kind = 'sale') {
    const items = documentData.items || [];
    const isPendingOrder = kind === 'order' && documentData.paymentStatus !== 'paid' && documentData.status !== 'paid';
    const saleBalance = window.saleBalanceV725 ? saleBalanceV725(documentData) : Number(documentData.pendingBalance || 0);
    const isPartialSale = kind === 'sale' && saleBalance > 0;
    const ownerId = kind === 'order' ? documentData.sellerUserId : documentData.sellerId;

    // Antes de dibujar, vuelve a consultar el perfil si todavía no está en memoria.
    // Así el recibo toma el QR recién guardado incluso en otro dispositivo.
    if (window.fetchCommercialProfilesV7 && (!AppState.commercialProfiles || !AppState.commercialProfiles.length || !commercialProfileFor(ownerId))) {
      await fetchCommercialProfilesV7().catch(() => null);
    }

    const ownerProfile = documentOwnerProfile(ownerId, documentData);
    const ownerName = documentOwnerName(ownerId, documentData.sellerName, documentData);
    const qrSource = ownerProfile.qrUrl || documentData.sellerQrUrl || documentData.qrUrl || '';
    const qr = await loadImageV7(qrSource);
    const logo = await loadImageV7(AppState.settings.logo || 'img/brand/natura-vida-logo.jpeg');
    const width = 720;
    const itemHeight = 38;
    const qrBlock = qr ? 280 : 90;
    const messageBlock = ownerProfile.receiptMessage ? 70 : 20;
    const height = 410 + items.length * itemHeight + qrBlock + messageBlock;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f7fbf8';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(26, 22, width - 52, height - 44, 28);
    ctx.fill();

    const grad = ctx.createLinearGradient(26, 22, width - 26, 170);
    grad.addColorStop(0, '#075b35');
    grad.addColorStop(1, '#18a566');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(26, 22, width - 52, 148, [28, 28, 8, 8]);
    ctx.fill();

    if (logo) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(88, 90, 42, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logo, 46, 48, 84, 84);
      ctx.restore();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 30px Inter, Arial';
    ctx.fillText(ownerName, logo ? 150 : 58, 82);
    ctx.font = '500 15px Inter, Arial';
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(isPendingOrder ? 'Orden de pago al contado' : (isPartialSale ? 'Recibo con saldo pendiente' : (kind === 'order' ? 'Recibo de compra al contado' : 'Recibo de venta al contado')), logo ? 150 : 58, 108);
    ctx.font = '700 16px JetBrains Mono, monospace';
    ctx.fillText(documentData.receiptNumber || documentData.orderNumber || documentData.documentNumber || 'DOCUMENTO', logo ? 150 : 58, 136);

    let y = 208;
    ctx.fillStyle = '#153c2b';
    ctx.font = '700 17px Inter, Arial';
    ctx.fillText(kind === 'order' ? 'Representante' : 'Cliente', 58, y);
    ctx.font = '600 18px Inter, Arial';
    ctx.fillStyle = '#102a20';
    ctx.fillText(documentData.clientName || documentData.representativeName || 'Sin nombre', 58, y + 30);
    ctx.font = '400 14px Inter, Arial';
    ctx.fillStyle = '#60766b';
    const contact = [documentData.clientPhone || documentData.representativePhone, documentData.clientCity || ''].filter(Boolean).join(' · ');
    if (contact) ctx.fillText(contact, 58, y + 54);

    ctx.textAlign = 'right';
    ctx.font = '600 14px Inter, Arial';
    ctx.fillText(new Date(documentData.paidAt || documentData.date || documentData.createdAt || Date.now()).toLocaleString('es-BO'), width - 58, y + 12);
    ctx.fillStyle = '#0a7a45';
    ctx.font = '800 18px Inter, Arial';
    ctx.fillText(isPendingOrder ? 'PENDIENTE DE PAGO' : (isPartialSale ? 'PAGO PARCIAL' : 'PAGO AL CONTADO'), width - 58, y + 43);
    ctx.textAlign = 'left';

    y += 95;
    ctx.strokeStyle = '#dce9e1';
    ctx.beginPath(); ctx.moveTo(58, y); ctx.lineTo(width - 58, y); ctx.stroke();
    y += 34;

    ctx.font = '700 14px Inter, Arial';
    ctx.fillStyle = '#315c47';
    ctx.fillText('Producto', 58, y);
    ctx.textAlign = 'center'; ctx.fillText('Cant.', 480, y);
    ctx.textAlign = 'right'; ctx.fillText('Subtotal', width - 58, y);
    ctx.textAlign = 'left';
    y += 26;

    ctx.font = '500 15px Inter, Arial';
    items.forEach(item => {
      ctx.fillStyle = '#173a29';
      const product = String(item.productName || item.name || 'Producto');
      ctx.fillText(product.length > 37 ? product.slice(0, 35) + '…' : product, 58, y);
      ctx.fillStyle = '#60766b';
      ctx.font = '400 12px Inter, Arial';
      ctx.fillText(`${fmtMoney(item.unitPrice || 0)} c/u`, 58, y + 17);
      ctx.font = '600 15px Inter, Arial';
      ctx.textAlign = 'center'; ctx.fillText(String(item.qty || 0), 480, y + 7);
      ctx.textAlign = 'right'; ctx.fillText(fmtMoney(item.subtotal || ((item.qty || 0) * (item.unitPrice || 0))), width - 58, y + 7);
      ctx.textAlign = 'left';
      y += itemHeight;
    });

    y += 8;
    ctx.strokeStyle = '#dce9e1';
    ctx.beginPath(); ctx.moveTo(58, y); ctx.lineTo(width - 58, y); ctx.stroke();
    y += 42;
    ctx.fillStyle = '#60766b';
    ctx.font = '600 16px Inter, Arial';
    ctx.fillText(isPendingOrder ? 'TOTAL A DEPOSITAR' : (isPartialSale ? 'TOTAL VENTA' : 'TOTAL PAGADO'), 58, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#075b35';
    ctx.font = '800 30px Inter, Arial';
    ctx.fillText(fmtMoney(documentData.total || 0), width - 58, y + 4);
    ctx.textAlign = 'left';
    if (isPartialSale) {
      y += 36;
      ctx.fillStyle = '#8a5a12';
      ctx.font = '700 15px Inter, Arial';
      ctx.fillText('Pagado: ' + fmtMoney(window.salePaidTotalV725 ? salePaidTotalV725(documentData) : Number(documentData.amountPaid || 0)), 58, y);
      ctx.textAlign = 'right';
      ctx.fillText('Saldo: ' + fmtMoney(saleBalance), width - 58, y);
      ctx.textAlign = 'left';
    }
    y += 52;

    if (qr) {
      const qrSize = 160;
      const qrX = width - 58 - qrSize;
      const boxY = y;
      ctx.fillStyle = '#f5faf7';
      ctx.beginPath(); ctx.roundRect(qrX - 16, boxY - 14, qrSize + 32, qrSize + 52, 20); ctx.fill();
      ctx.drawImage(qr, qrX, boxY, qrSize, qrSize);
      ctx.fillStyle = '#315c47';
      ctx.font = '700 13px Inter, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(isPendingOrder ? 'QR de pago' : 'QR de cobro', qrX + qrSize / 2, boxY + qrSize + 24);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#60766b';
      ctx.font = '600 15px Inter, Arial';
      wrapText(ctx, isPendingOrder ? 'Escanea el QR para realizar el pago.' : 'Gracias por su compra. Escanea el QR para próximos pagos o consultas.', 58, boxY + 16, qrX - 92, 21, 4);
      y += qrSize + 55;
    }

    if (ownerProfile.receiptMessage) {
      ctx.fillStyle = '#60766b';
      ctx.font = '400 14px Inter, Arial';
      ctx.textAlign = 'center';
      wrapText(ctx, ownerProfile.receiptMessage, width / 2, y, width - 130, 19, 3);
      ctx.textAlign = 'left';
      y += 48;
    }

    ctx.fillStyle = '#8ba096';
    ctx.font = '400 12px Inter, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Natura Vida Bolivia · Gracias por su preferencia', width / 2, height - 36);
    ctx.textAlign = 'left';
    return canvas;
  }

  function downloadCanvasV7(canvas, fileName, type = 'pdf') {
    if (type === 'pdf' && window.jspdf) {
      const { jsPDF } = window.jspdf;
      const img = canvas.toDataURL('image/jpeg', 0.94);
      const pdf = new jsPDF({ unit: 'pt', format: [canvas.width, canvas.height] });
      pdf.addImage(img, 'JPEG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${fileName}.pdf`);
      showToast('PDF descargado.');
      return;
    }
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast('Imagen descargada.');
    }, 'image/jpeg', 0.94);
  }

  async function shareCanvasV7(canvas, fileName, title, text) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94));
    const file = new File([blob], `${fileName}.jpg`, { type: 'image/jpeg' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ files: [file], title, text }); }
      catch (_) {}
      return;
    }
    downloadCanvasV7(canvas, fileName, 'jpg');
    showToast('Tu navegador no abrió el menú de compartir; se descargó la imagen.');
  }

  async function openV7ReceiptPreview(data, kind = 'sale') {
    const canvas = await buildV7ReceiptCanvas(data, kind);
    const fileName = String(data.receiptNumber || data.orderNumber || data.documentNumber || `NV-${Date.now()}`).replace(/[^a-z0-9_-]/gi, '_');
    openSheet(`
      <h2>${kind === 'order' && data.paymentStatus !== 'paid' && data.status !== 'paid' ? 'Orden de pago' : 'Recibo virtual'} <span class="x" id="closeSheet">✕</span></h2>
      <div class="v7ReceiptPreview"><img id="v7ReceiptImage" alt="Recibo virtual"></div>
      <div class="v7DocActions">
        <button class="btn outline block" id="v7DownloadReceipt">Descargar PDF</button>
        <button class="btn block" id="v7ShareReceipt">Compartir</button>
      </div>
    `, (overlay, close) => {
      $('#v7ReceiptImage', overlay).src = canvas.toDataURL('image/jpeg', 0.9);
      $('#closeSheet', overlay).addEventListener('click', close);
      $('#v7DownloadReceipt', overlay).addEventListener('click', () => downloadCanvasV7(canvas, fileName, 'pdf'));
      $('#v7ShareReceipt', overlay).addEventListener('click', () => {
        const pending = kind === 'order' && data.paymentStatus !== 'paid' && data.status !== 'paid';
        return shareCanvasV7(canvas, fileName, pending ? 'Orden de pago Natura Vida' : 'Recibo Natura Vida', `${fileName} · Total ${fmtMoney(data.total || 0)}`);
      });
    });
  }

  Object.assign(window, {
    buildV7ReceiptCanvas,
    downloadCanvasV7,
    shareCanvasV7,
    openV7ReceiptPreview
  });
})();
