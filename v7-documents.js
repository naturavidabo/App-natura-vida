/* receipt.js — Genera el recibo de venta: dibujo en canvas (para JPG), PDF real, compartir e imprimir.
   Soporta ventas con MÚLTIPLES productos (carrito): sale.items = [{productName, qty, unitPrice, subtotal}] */

function drawReceiptCanvas(sale) {
  const W = 600;
  const items = sale.items || [];
  // Altura dinámica: cabecera fija + una línea por ítem + pie fijo
  const headerH = 230;
  const perItemH = 22;
  const footerH = 140;
  const totalH = headerH + (items.length * perItemH) + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  function drawAll(logoImg) {
    let y = 36;

    if (logoImg) {
      ctx.drawImage(logoImg, 30, y - 10, 64, 64);
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
    ctx.fillText('Teléfono: ' + (sale.clientPhone || '—'), 30, y);
    if (sale.groupName) {
      ctx.fillStyle = '#6B7280';
      ctx.font = 'italic 11px Arial';
      ctx.fillText('Grupo: ' + sale.groupName, 350, y);
    }
    y += 30;

    ctx.strokeStyle = '#D8DEDA';
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(W - 30, y); ctx.stroke();
    y += 24;

    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#6B7280';
    ctx.fillText('PRODUCTO', 30, y);
    ctx.fillText('CANT.', 350, y);
    ctx.fillText('PRECIO', 410, y);
    ctx.textAlign = 'right';
    ctx.fillText('SUBTOTAL', W - 30, y);
    ctx.textAlign = 'left';
    y += 18;
    ctx.strokeStyle = '#D8DEDA';
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(W - 30, y); ctx.stroke();
    y += 22;

    ctx.font = '13px Arial';
    ctx.fillStyle = '#15171A';
    items.forEach(it => {
      ctx.fillText((it.productName || '').slice(0, 30), 30, y);
      ctx.fillText(`${it.qty}`, 350, y);
      ctx.fillText(fmtMoney(it.unitPrice), 410, y);
      ctx.textAlign = 'right';
      ctx.fillText(fmtMoney(it.subtotal), W - 30, y);
      ctx.textAlign = 'left';
      y += perItemH;
    });

    y += 10;
    ctx.strokeStyle = '#D8DEDA';
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(W - 30, y); ctx.stroke();
    y += 36;

    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#01773B';
    ctx.textAlign = 'right';
    ctx.fillText('TOTAL: ' + fmtMoney(sale.total), W - 30, y);
    ctx.textAlign = 'left';

    y += 46;
    ctx.font = 'italic 11px Arial';
    ctx.fillStyle = '#9CA395';
    ctx.textAlign = 'center';
    ctx.fillText(AppState.settings.businessSlogan || '¡Gracias por su compra!', W / 2, y);
    ctx.textAlign = 'left';

    canvas._renderedHeight = y + 24;
  }

  return new Promise((resolve) => {
    if (AppState.settings.logo) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { drawAll(img); resolve(canvas); };
      img.onerror = () => { drawAll(null); resolve(canvas); };
      img.src = AppState.settings.logo;
    } else {
      drawAll(null);
      resolve(canvas);
    }
  });
}

async function openReceiptPreview(sale) {
  const html = `
    <h2>Recibo generado <span class="x" id="closeSheet">✕</span></h2>
    <div class="receiptCanvasWrap" id="canvasWrap"><div class="loading">Generando recibo…</div></div>
    <div class="exportRow">
      <div class="exportBtn" id="btnJpg"><span class="ic">🖼️</span><span class="lbl">Guardar JPG</span><span class="sub">Imagen del recibo</span></div>
      <div class="exportBtn" id="btnPdf"><span class="ic">📄</span><span class="lbl">Guardar PDF</span><span class="sub">Documento PDF</span></div>
    </div>
    <div class="exportRow">
      <div class="exportBtn" id="btnShare"><span class="ic">📤</span><span class="lbl">Compartir</span><span class="sub">Cualquier aplicación</span></div>
      <div class="exportBtn" id="btnPrint"><span class="ic">🖨️</span><span class="lbl">Imprimir</span><span class="sub">Diálogo del sistema</span></div>
    </div>
    <div class="actions"><button class="btn outline block" id="closeSheet2">Cerrar</button></div>
  `;

  openSheet(html, async (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#closeSheet2', overlay).addEventListener('click', close);

    const canvas = await drawReceiptCanvas(sale);
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
    a.download = `recibo_${(sale.clientName || 'cliente').replace(/\s+/g, '_')}_${todayISO()}.jpg`;
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
  pdf.save(`recibo_${(sale.clientName || 'cliente').replace(/\s+/g, '_')}_${todayISO()}.pdf`);
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
