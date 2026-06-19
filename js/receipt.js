/* receipt.js — Genera el recibo de venta: dibujo en canvas (para JPG), PDF real, compartir e imprimir. */

function drawReceiptCanvas(sale, product) {
  const canvas = document.createElement('canvas');
  const W = 600, lineH = 30;
  canvas.width = W;
  // Altura dinámica según contenido
  const baseH = 520;
  canvas.height = baseH;
  const ctx = canvas.getContext('2d');

  // Fondo blanco
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = 36;

  // Logo (si existe) a la izquierda
  function drawHeader(logoImg) {
    if (logoImg) {
      const logoSize = 64;
      ctx.drawImage(logoImg, 30, y - 10, logoSize, logoSize);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#01773B';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(AppState.settings.businessName || 'NATURA VIDA', logoImg ? 106 : 30, y + 22);
    ctx.fillStyle = '#6B7280';
    ctx.font = '12px Arial';
    ctx.fillText(AppState.settings.businessSlogan || '', logoImg ? 106 : 30, y + 42);

    y += 80;
    ctx.strokeStyle = '#D8DEDA';
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(W - 30, y); ctx.stroke();
    y += 28;

    ctx.fillStyle = '#15171A';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('RECIBO DE VENTA', 30, y);
    ctx.textAlign = 'right';
    ctx.font = '12px Arial';
    ctx.fillStyle = '#6B7280';
    ctx.fillText(new Date(sale.date).toLocaleDateString('es-BO') + '  ' + new Date(sale.date).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }), W - 30, y);
    ctx.textAlign = 'left';
    y += 26;

    ctx.font = '13px Arial';
    ctx.fillStyle = '#15171A';
    ctx.fillText('Cliente: ' + (sale.clientName || '—'), 30, y); y += 20;
    ctx.fillText('Teléfono: ' + (sale.clientPhone || '—'), 30, y); y += 30;

    ctx.strokeStyle = '#D8DEDA';
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(W - 30, y); ctx.stroke();
    y += 24;

    // Tabla encabezado
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#6B7280';
    ctx.fillText('PRODUCTO', 30, y);
    ctx.fillText('CANT.', 340, y);
    ctx.fillText('PRECIO', 410, y);
    ctx.textAlign = 'right';
    ctx.fillText('SUBTOTAL', W - 30, y);
    ctx.textAlign = 'left';
    y += 18;
    ctx.strokeStyle = '#D8DEDA';
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(W - 30, y); ctx.stroke();
    y += 24;

    // Ítem (esta versión: una venta = un producto/línea)
    ctx.font = '13px Arial';
    ctx.fillStyle = '#15171A';
    const qtyLabel = `${sale.qty}`;
    ctx.fillText((product ? product.name : sale.productName).slice(0, 32), 30, y);
    ctx.fillText(qtyLabel, 340, y);
    ctx.fillText(fmtMoney(sale.unitPrice), 410, y);
    ctx.textAlign = 'right';
    ctx.fillText(fmtMoney(sale.total), W - 30, y);
    ctx.textAlign = 'left';
    y += 16;

    if (sale.groupName) {
      ctx.font = 'italic 11px Arial';
      ctx.fillStyle = '#6B7280';
      ctx.fillText('Grupo de precio: ' + sale.groupName, 30, y + 14);
      y += 14;
    }

    y += 30;
    ctx.strokeStyle = '#D8DEDA';
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(W - 30, y); ctx.stroke();
    y += 32;

    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#01773B';
    ctx.textAlign = 'right';
    ctx.fillText('TOTAL: ' + fmtMoney(sale.total), W - 30, y);
    ctx.textAlign = 'left';

    y += 50;
    ctx.font = 'italic 11px Arial';
    ctx.fillStyle = '#9CA395';
    ctx.textAlign = 'center';
    ctx.fillText(AppState.settings.businessSlogan || '¡Gracias por su compra!', W / 2, y);
    ctx.textAlign = 'left';

    canvas._renderedHeight = y + 30;
  }

  return new Promise((resolve) => {
    if (AppState.settings.logo) {
      const img = new Image();
      img.onload = () => { drawHeader(img); resolve(canvas); };
      img.onerror = () => { drawHeader(null); resolve(canvas); };
      img.src = AppState.settings.logo;
    } else {
      drawHeader(null);
      resolve(canvas);
    }
  });
}

async function openReceiptPreview(sale, product) {
  const html = `
    <h2>Recibo generado <span class="x" id="closeSheet">✕</span></h2>
    <div class="receiptCanvasWrap" id="canvasWrap"><div class="loading">Generando recibo…</div></div>
    <div class="exportRow">
      <div class="exportBtn" id="btnJpg"><span class="ic">🖼️</span><span class="lbl">Guardar JPG</span><span class="sub">Imagen del recibo</span></div>
      <div class="exportBtn" id="btnPdf"><span class="ic">📄</span><span class="lbl">Guardar PDF</span><span class="sub">Documento PDF</span></div>
    </div>
    <div class="exportRow">
      <div class="exportBtn" id="btnShare"><span class="ic">📤</span><span class="lbl">Compartir</span><span class="sub">WhatsApp / correo</span></div>
      <div class="exportBtn" id="btnPrint"><span class="ic">🖨️</span><span class="lbl">Imprimir</span><span class="sub">Diálogo del sistema</span></div>
    </div>
    <div class="actions"><button class="btn outline block" id="closeSheet2">Cerrar</button></div>
  `;

  openSheet(html, async (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#closeSheet2', overlay).addEventListener('click', close);

    const canvas = await drawReceiptCanvas(sale, product);
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = canvas.width;
    finalCanvas.height = canvas._renderedHeight || canvas.height;
    finalCanvas.getContext('2d').drawImage(canvas, 0, 0);

    const wrap = $('#canvasWrap', overlay);
    wrap.innerHTML = '';
    wrap.appendChild(finalCanvas);

    $('#btnJpg', overlay).addEventListener('click', () => downloadCanvasAsJpg(finalCanvas, sale));
    $('#btnPdf', overlay).addEventListener('click', () => downloadCanvasAsPdf(finalCanvas, sale));
    $('#btnShare', overlay).addEventListener('click', () => shareReceiptCanvas(finalCanvas, sale));
    $('#btnPrint', overlay).addEventListener('click', () => printCanvas(finalCanvas));
  });
}

function downloadCanvasAsJpg(canvas, sale) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo_${sale.clientName.replace(/\s+/g, '_')}_${todayISO()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast('Imagen descargada');
  }, 'image/jpeg', 0.95);
}

function downloadCanvasAsPdf(canvas, sale) {
  if (typeof window.jspdf === 'undefined') {
    showToast('⚠️ No se pudo cargar el generador de PDF (requiere conexión la primera vez)', 'error');
    return;
  }
  const { jsPDF } = window.jspdf;
  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jsPDF({ unit: 'pt', format: [canvas.width, canvas.height] });
  pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save(`recibo_${sale.clientName.replace(/\s+/g, '_')}_${todayISO()}.pdf`);
  showToast('PDF descargado');
}

async function shareReceiptCanvas(canvas, sale) {
  canvas.toBlob(async (blob) => {
    const file = new File([blob], `recibo_${todayISO()}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Recibo de venta',
          text: `Recibo — ${AppState.settings.businessName} — Total: ${fmtMoney(sale.total)}`
        });
      } catch (e) { /* usuario canceló */ }
    } else {
      showToast('Tu navegador no admite compartir archivos directamente; usa "Guardar JPG" y compártelo manualmente', 'error');
    }
  }, 'image/jpeg', 0.95);
}

function printCanvas(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const win = window.open('', '_blank');
  if (!win) { showToast('⚠️ El navegador bloqueó la ventana de impresión', 'error'); return; }
  win.document.write(`
    <html><head><title>Imprimir recibo</title></head>
    <body style="margin:0; display:flex; justify-content:center;">
      <img src="${dataUrl}" style="max-width:100%;" onload="window.print();">
    </body></html>
  `);
  win.document.close();
}

window.openReceiptPreview = openReceiptPreview;
