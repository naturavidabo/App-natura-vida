/* catalog-pdf.js — Catálogo comercial premium PDF + previsualización + compartir.
   Diseñado para WhatsApp: genera PDF, muestra vista previa, permite compartir/descargar. */

const NATURA_BRAND_LOGO = 'img/brand/natura-vida-logo.jpeg';
const NATURA_PROFILE_LEAVES = 'img/brand/natura-vida-perfil-hojas.jpeg';
const NATURA_PROMO_BENEFITS = 'img/brand/natura-vida-coco-benefits.jpg';
const NATURA_PROMO_BEAUTY = 'img/brand/natura-vida-coco-belleza.jpg';
let _lastCatalogPdf = null;

function catalogVisibleProducts() {
  return (AppState.products || [])
    .filter(p => p.status !== 'archived')
    .sort((a, b) => String(a.category || 'General').localeCompare(String(b.category || 'General')) || String(a.name || '').localeCompare(String(b.name || '')));
}

function cleanPdfText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safePdfMoney(value) {
  return fmtMoney(Number(value || 0));
}

function pdfImageType(dataUrl) {
  return String(dataUrl || '').includes('image/png') ? 'PNG' : 'JPEG';
}

async function imageForPdf(src) {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:image/')) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (_) {
    return null;
  }
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight, maxLines) {
  const lines = doc.splitTextToSize(cleanPdfText(text), maxWidth);
  const visible = lines.slice(0, maxLines);
  visible.forEach((line, idx) => doc.text(line, x, y + (idx * lineHeight)));
  return y + (visible.length * lineHeight);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function drawLeafMotif(doc, x, y, scale = 1) {
  doc.setFillColor(132, 178, 65);
  doc.ellipse(x, y, 14 * scale, 7 * scale, 'F');
  doc.setFillColor(1, 119, 59);
  doc.ellipse(x + 22 * scale, y + 10 * scale, 12 * scale, 6 * scale, 'F');
  doc.setFillColor(168, 199, 36);
  doc.ellipse(x - 20 * scale, y + 16 * scale, 11 * scale, 5.5 * scale, 'F');
}

function drawProductPlaceholder(doc, x, y, w, h) {
  doc.setFillColor(239, 247, 241);
  doc.roundedRect(x, y, w, h, 16, 16, 'F');
  doc.setDrawColor(215, 231, 220);
  doc.roundedRect(x + 7, y + 7, w - 14, h - 14, 14, 14, 'S');
  doc.setFillColor(1, 119, 59);
  doc.circle(x + w / 2, y + h / 2 - 5, 18, 'F');
  doc.setFillColor(132, 178, 65);
  doc.ellipse(x + w / 2 + 20, y + h / 2 - 24, 18, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('NV', x + w / 2, y + h / 2, { align: 'center' });
}

function catalogFileName() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `NVB_CATALOGO_PRODUCTOS_${stamp}.pdf`;
}

async function shareCatalogPdf() {
  if (!_lastCatalogPdf || !_lastCatalogPdf.blob) {
    showToast('Primero genera el catálogo PDF.', 'error');
    return;
  }
  const file = new File([_lastCatalogPdf.blob], _lastCatalogPdf.filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Catálogo Natura Vida',
        text: 'Catálogo de productos Natura Vida - Te cuida por dentro y por fuera.'
      });
    } catch (_) {
      // Usuario canceló el menú de compartir.
    }
  } else {
    showToast('Este navegador no permite compartir PDF directo. Usa Descargar y envíalo por WhatsApp como documento.', 'error');
  }
}

function openCatalogResultSheet(blob, filename, productsCount) {
  if (_lastCatalogPdf && _lastCatalogPdf.url) URL.revokeObjectURL(_lastCatalogPdf.url);
  const url = URL.createObjectURL(blob);
  _lastCatalogPdf = { blob, filename, url, createdAt: Date.now() };

  openSheet(`
    <h2>Catálogo listo <span class="x" id="closeSheet">✕</span></h2>
    <div class="catalogReadyHero">
      <div class="readyMark">✓</div>
      <div>
        <div class="eyebrow">PDF generado correctamente</div>
        <h3>${escapeHtml(filename)}</h3>
        <p>${productsCount} producto(s) incluidos. Puedes compartirlo directamente o previsualizarlo antes de enviarlo.</p>
      </div>
    </div>
    <div class="pdfPreviewBox">
      <iframe src="${url}" class="pdfPreviewFrame" title="Vista previa del catálogo"></iframe>
    </div>
    <div class="exportRow catalogExportRow">
      <div class="exportBtn primaryShare" id="btnShareCatalog"><span class="ic">↗</span><span class="lbl">Compartir</span><span class="sub">WhatsApp / sistema</span></div>
      <div class="exportBtn" id="btnOpenCatalog"><span class="ic">◫</span><span class="lbl">Previsualizar</span><span class="sub">Abrir PDF</span></div>
    </div>
    <div class="exportRow catalogExportRow">
      <div class="exportBtn" id="btnDownloadCatalog"><span class="ic">↓</span><span class="lbl">Descargar</span><span class="sub">Guardar archivo</span></div>
      <div class="exportBtn" id="btnCloseCatalog"><span class="ic">×</span><span class="lbl">Cerrar</span><span class="sub">Volver a opciones</span></div>
    </div>
    <div class="banner catalogShareNote">En celular, el botón <strong>Compartir</strong> abrirá el menú del sistema para elegir WhatsApp. En computadora, si no aparece WhatsApp, descarga el PDF y envíalo manualmente.</div>
  `, (overlay, close) => {
    const closeAndKeep = () => close();
    $('#closeSheet', overlay).addEventListener('click', closeAndKeep);
    $('#btnCloseCatalog', overlay).addEventListener('click', closeAndKeep);
    $('#btnShareCatalog', overlay).addEventListener('click', shareCatalogPdf);
    $('#btnOpenCatalog', overlay).addEventListener('click', () => window.open(url, '_blank'));
    $('#btnDownloadCatalog', overlay).addEventListener('click', () => {
      downloadBlob(blob, filename);
      showToast('Catálogo descargado.');
    });
    if (navigator.canShare) {
      const shareFile = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [shareFile] })) {
        setTimeout(() => { shareCatalogPdf().catch?.(() => {}); }, 450);
      }
    }
  });
}

async function generateCatalogPdf(options = {}) {
  const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDFCtor) {
    showToast('No se pudo cargar el generador PDF. Revisa conexión o librería jsPDF.', 'error');
    return null;
  }
  const products = catalogVisibleProducts();
  if (!products.length) {
    showToast('No hay productos activos para generar catálogo.', 'error');
    return null;
  }

  const includePrices = options.includePrices !== false;
  const includeStock = !!options.includeStock;
  const includeResellerPrice = !!options.includeResellerPrice && isAdmin();
  const title = cleanPdfText(options.title || `Catálogo ${AppState.settings.businessName || 'NATURA VIDA'}`, 120);
  const subtitle = cleanPdfText(options.subtitle || AppState.settings.businessSlogan || 'Te cuida por dentro y por fuera', 160);
  const contact = cleanPdfText(options.contact || AppState.settings.catalogContact || '', 180);
  const note = cleanPdfText(options.note || 'Consulta disponibilidad, presentaciones y forma de entrega. Productos naturales para bienestar, belleza y cuidado integral.', 240);

  const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;
  const green = [1, 119, 59];
  const deepGreen = [0, 91, 48];
  const leaf = [132, 178, 65];
  const orange = [216, 142, 30];
  const dark = [22, 34, 27];
  const gray = [99, 110, 104];
  const soft = [245, 250, 246];
  const line = [221, 233, 224];

  const brandLogo = await imageForPdf(NATURA_BRAND_LOGO) || await imageForPdf(AppState.settings.logo);
  const leafFrame = await imageForPdf(NATURA_PROFILE_LEAVES);
  const promoBenefits = await imageForPdf(NATURA_PROMO_BENEFITS);
  const promoBeauty = await imageForPdf(NATURA_PROMO_BEAUTY);

  function footer(pageNo) {
    doc.setDrawColor(...line);
    doc.line(margin, pageH - 32, pageW - margin, pageH - 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(95, 108, 100);
    doc.text(`${AppState.settings.businessName || 'NATURA VIDA'} · ${subtitle}`, margin, pageH - 16, { maxWidth: pageW - 145 });
    doc.text(String(pageNo), pageW - margin, pageH - 16, { align: 'right' });
  }

  function header(label) {
    doc.setFillColor(...soft);
    doc.roundedRect(margin, 20, pageW - margin * 2, 54, 18, 18, 'F');
    if (brandLogo) {
      try { doc.addImage(brandLogo, pdfImageType(brandLogo), margin + 12, 27, 58, 40, undefined, 'FAST'); } catch (_) {}
    }
    doc.setTextColor(...deepGreen);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(AppState.settings.businessName || 'NATURA VIDA', margin + 80, 43);
    doc.setTextColor(...orange);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.7);
    doc.text(label, margin + 80, 59);
    drawLeafMotif(doc, pageW - margin - 54, 41, 0.84);
  }

  function chip(x, y, w, txt, fillRgb, textRgb) {
    doc.setFillColor(...fillRgb);
    doc.roundedRect(x, y, w, 22, 11, 11, 'F');
    doc.setTextColor(...textRgb);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(txt, x + w / 2, y + 14, { align: 'center' });
  }

  // ===== PORTADA PREMIUM =====
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(246, 251, 247);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(234, 245, 236);
  doc.circle(pageW + 30, 90, 120, 'F');
  doc.setFillColor(250, 243, 228);
  doc.circle(-30, pageH - 70, 130, 'F');

  if (leafFrame) {
    try { doc.addImage(leafFrame, pdfImageType(leafFrame), 28, 36, 112, 112, undefined, 'FAST'); } catch (_) {}
  }

  doc.setDrawColor(...line);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(38, 60, pageW - 76, 288, 28, 28, 'FD');

  if (promoBeauty) {
    try { doc.addImage(promoBeauty, pdfImageType(promoBeauty), 50, 74, pageW - 100, 206, undefined, 'FAST'); } catch (_) {}
  } else if (promoBenefits) {
    try { doc.addImage(promoBenefits, pdfImageType(promoBenefits), 50, 74, pageW - 100, 206, undefined, 'FAST'); } catch (_) {}
  }

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(58, 84, 140, 56, 18, 18, 'F');
  if (brandLogo) {
    try { doc.addImage(brandLogo, pdfImageType(brandLogo), 68, 92, 120, 39, undefined, 'FAST'); } catch (_) {}
  }

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(58, 214, 248, 108, 22, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...deepGreen);
  doc.text('Catálogo de', 74, 244);
  doc.setTextColor(...orange);
  doc.text('Productos', 74, 274);
  doc.setTextColor(...dark);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.text(subtitle, 74, 298, { maxWidth: 210 });

  chip(58, 332, 126, 'Natural y premium', [1,119,59], [255,255,255]);
  chip(192, 332, 96, 'WhatsApp listo', [216,142,30], [255,255,255]);
  chip(296, 332, 112, `${products.length} producto(s)`, [235,245,238], [0,91,48]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(27);
  doc.setTextColor(...deepGreen);
  doc.text(title, 50, 400, { maxWidth: pageW - 100 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.2);
  doc.setTextColor(...gray);
  addWrappedText(doc, note, 50, 425, pageW - 100, 13.2, 4);

  const featY = 496;
  const featW = (pageW - 116) / 3;
  [['Belleza natural', 'Ideal para cuidado personal, bienestar y uso diario.'], ['Presentaciones', 'Muestra productos, fotos y descripciones de forma atractiva.'], ['Pedidos rápidos', 'Compártelo por WhatsApp y responde consultas al momento.']].forEach((f, idx) => {
    const fx = 50 + idx * (featW + 8);
    doc.setFillColor(255,255,255);
    doc.setDrawColor(...line);
    doc.roundedRect(fx, featY, featW, 84, 18, 18, 'FD');
    doc.setFont('helvetica','bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...green);
    doc.text(f[0], fx + 12, featY + 22);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.8);
    doc.setTextColor(...gray);
    addWrappedText(doc, f[1], fx + 12, featY + 38, featW - 24, 11, 4);
  });

  if (contact) {
    doc.setFillColor(255, 248, 235);
    doc.setDrawColor(244, 217, 169);
    doc.roundedRect(50, 604, pageW - 100, 56, 18, 18, 'FD');
    doc.setTextColor(...orange);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Contacto para pedidos', pageW / 2, 626, { align: 'center' });
    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11.2);
    doc.text(contact, pageW / 2, 646, { align: 'center', maxWidth: pageW - 170 });
  }

  doc.setTextColor(...gray);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-BO')}`, pageW / 2, pageH - 48, { align: 'center' });
  footer(1);

  // ===== PÁGINA DE ESTILO / BENEFICIOS =====
  doc.addPage();
  let pageNo = 2;
  header('Estilo de marca y beneficios');

  if (promoBenefits) {
    try { doc.addImage(promoBenefits, pdfImageType(promoBenefits), margin, 94, pageW - margin * 2, 270, undefined, 'FAST'); } catch (_) {}
  }
  doc.setFillColor(255,255,255);
  doc.roundedRect(margin, 378, pageW - margin * 2, 120, 22, 22, 'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(18);
  doc.setTextColor(...deepGreen);
  doc.text('Una presentación pensada para vender mejor', margin + 18, 408);
  doc.setFont('helvetica','normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...gray);
  addWrappedText(doc, 'Natura Vida proyecta bienestar, naturalidad y belleza. Este catálogo está pensado para despertar interés, facilitar la explicación de beneficios y convertirse en una pieza lista para compartir con clientes por WhatsApp.', margin + 18, 430, pageW - margin * 2 - 36, 13, 5);
  [['Imagen natural','Diseño visual con identidad vegetal y aspecto premium.'],['Comunicación clara','Productos ordenados con precio, descripción y categoría visibles.'],['Venta práctica','Ideal para mostrar en persona o enviar como documento PDF.']].forEach((f, idx) => {
    const bx = margin + 18 + idx * 176;
    doc.setFillColor(239,247,241);
    doc.roundedRect(bx, 515, 162, 86, 16, 16, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(...green);
    doc.text(f[0], bx + 12, 536);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.8);
    doc.setTextColor(...gray);
    addWrappedText(doc, f[1], bx + 12, 553, 138, 10.8, 4);
  });
  footer(pageNo++);

  // ===== PRODUCTOS =====
  doc.addPage();
  header('Productos seleccionados para venta');
  let x = margin;
  let y = 94;
  let cardW = (pageW - margin * 2 - 14) / 2;
  let cardH = 274;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (y + cardH > pageH - 44) {
      footer(pageNo++);
      doc.addPage();
      header('Productos seleccionados para venta');
      x = margin;
      y = 94;
    }

    doc.setFillColor(255,255,255);
    doc.setDrawColor(...line);
    doc.roundedRect(x, y, cardW, cardH, 20, 20, 'FD');
    doc.setFillColor(...green);
    doc.roundedRect(x, y, cardW, 7, 7, 7, 'F');

    const imgX = x + 12;
    const imgY = y + 16;
    const imgW = cardW - 24;
    const imgH = 110;
    doc.setFillColor(247,251,248);
    doc.roundedRect(imgX, imgY, imgW, imgH, 16, 16, 'F');
    const imgData = await imageForPdf(p.photo);
    if (imgData) {
      try { doc.addImage(imgData, pdfImageType(imgData), imgX, imgY, imgW, imgH, undefined, 'FAST'); } catch (_) { drawProductPlaceholder(doc, imgX, imgY, imgW, imgH); }
    } else {
      drawProductPlaceholder(doc, imgX, imgY, imgW, imgH);
    }

    let ty = y + 146;
    doc.setFillColor(232,244,236);
    doc.roundedRect(x + 14, ty - 12, Math.min(112, cardW - 28), 18, 9, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(...green);
    doc.text(cleanPdfText(p.category || 'General', 24).toUpperCase(), x + 22, ty);

    ty += 20;
    doc.setFont('helvetica','bold');
    doc.setFontSize(11.7);
    doc.setTextColor(...dark);
    ty = addWrappedText(doc, cleanPdfText(p.name, 82), x + 14, ty, cardW - 28, 13.2, 2) + 4;

    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...gray);
    ty = addWrappedText(doc, cleanPdfText(p.description || 'Producto natural disponible. Consulta presentación, disponibilidad y forma de entrega.', 220), x + 14, ty, cardW - 28, 10.8, 4) + 6;

    doc.setFillColor(245,250,246);
    doc.roundedRect(x + 14, ty, cardW - 28, 34, 14, 14, 'F');
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...gray);
    doc.text('Presentación comercial Natura Vida', x + 24, ty + 14);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...deepGreen);
    doc.text('Calidad natural · Bienestar · Belleza', x + 24, ty + 27);

    const priceY = y + cardH - 62;
    if (includePrices) {
      doc.setFillColor(...green);
      doc.roundedRect(x + 14, priceY, cardW - 28, 34, 16, 16, 'F');
      doc.setTextColor(255,255,255);
      doc.setFont('helvetica','bold');
      doc.setFontSize(12.3);
      doc.text(`Precio: ${safePdfMoney(publicPrice(p))}`, x + cardW / 2, priceY + 22, { align: 'center' });
      if (includeResellerPrice) {
        doc.setTextColor(...orange);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.4);
        doc.text(`Revendedor: ${safePdfMoney(wholesalePrice(p))}`, x + 14, y + cardH - 10);
      }
    } else {
      doc.setFillColor(255,248,235);
      doc.roundedRect(x + 14, priceY, cardW - 28, 34, 16, 16, 'F');
      doc.setTextColor(...orange);
      doc.setFont('helvetica','bold');
      doc.setFontSize(10.5);
      doc.text('Consultar precio', x + cardW / 2, priceY + 22, { align: 'center' });
    }
    if (includeStock) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(...gray);
      doc.text(`Stock ref.: ${Number(p.stock || 0)}`, x + cardW - 14, y + cardH - 10, { align: 'right' });
    }

    if (x === margin) { x = margin + cardW + 14; }
    else { x = margin; y += cardH + 14; }
  }
  footer(pageNo++);

  // ===== CIERRE =====
  doc.addPage();
  header('Cierre y contacto');
  if (promoBeauty) {
    try { doc.addImage(promoBeauty, pdfImageType(promoBeauty), margin, 92, pageW - margin * 2, 246, undefined, 'FAST'); } catch (_) {}
  }
  doc.setFillColor(255,255,255);
  doc.roundedRect(margin, 358, pageW - margin * 2, 250, 24, 24, 'FD');
  doc.setFont('helvetica','bold');
  doc.setFontSize(21);
  doc.setTextColor(...deepGreen);
  doc.text('Gracias por elegir Natura Vida', pageW / 2, 390, { align: 'center' });
  doc.setFont('helvetica','normal');
  doc.setFontSize(11);
  doc.setTextColor(...gray);
  addWrappedText(doc, 'Nuestros productos están pensados para acompañar tu bienestar y tu rutina de belleza de manera natural. Escríbenos para conocer disponibilidad, presentaciones y recomendaciones de uso.', margin + 34, 416, pageW - margin * 2 - 68, 14, 5);
  chip(pageW / 2 - 164, 492, 98, 'Sin químicos', [235,245,238], [0,91,48]);
  chip(pageW / 2 - 54, 492, 112, 'Prensado en frío', [235,245,238], [0,91,48]);
  chip(pageW / 2 + 70, 492, 92, 'Bienestar', [235,245,238], [0,91,48]);

  if (contact) {
    doc.setFillColor(255,248,235);
    doc.setDrawColor(244,217,169);
    doc.roundedRect(margin + 28, 538, pageW - margin * 2 - 56, 52, 16, 16, 'FD');
    doc.setTextColor(...orange);
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.text('Pide más información o realiza tu pedido', pageW / 2, 558, { align: 'center' });
    doc.setTextColor(...dark);
    doc.setFont('helvetica','normal');
    doc.setFontSize(10.5);
    doc.text(contact, pageW / 2, 576, { align: 'center', maxWidth: pageW - 160 });
  }
  doc.setFont('helvetica','italic');
  doc.setFontSize(14);
  doc.setTextColor(...green);
  doc.text('Natura Vida, tu bienestar es natural.', pageW / 2, 622, { align: 'center' });
  footer(pageNo);

  const filename = catalogFileName();
  const blob = doc.output('blob');
  openCatalogResultSheet(blob, filename, products.length);
  showToast('Catálogo PDF generado correctamente.');
  return { blob, filename };
}

function openCatalogPdfOptions() {
  const defaultTitle = `Catálogo ${AppState.settings.businessName || 'NATURA VIDA'}`;
  openSheet(`
    <h2>Catálogo PDF para WhatsApp <span class="x" id="closeSheet">✕</span></h2>
    <div class="catalogOptionsHero premiumCatalogOptionsHero">
      <img src="${NATURA_BRAND_LOGO}" alt="Natura Vida">
      <div>
        <div class="eyebrow">Pieza comercial</div>
        <h3>Genera un catálogo listo para enviar</h3>
        <p>Se creará un PDF con identidad Natura Vida, estética comercial inspirada en belleza, bienestar y naturaleza. Al finalizar tendrás opción de previsualizar, compartir o descargar.</p>
      </div>
    </div>
    <div class="catalogMoodboard">
      <img src="${NATURA_PROMO_BENEFITS}" alt="Referencia catálogo Natura Vida">
      <img src="${NATURA_PROMO_BEAUTY}" alt="Referencia visual belleza Natura Vida">
    </div>
    <div class="field">
      <label>Título del catálogo</label>
      <input type="text" id="cat_title" value="${escapeHtml(defaultTitle)}">
    </div>
    <div class="field">
      <label>Subtítulo / mensaje comercial</label>
      <input type="text" id="cat_subtitle" value="${escapeHtml(AppState.settings.businessSlogan || 'Te cuida por dentro y por fuera')}">
    </div>
    <div class="field">
      <label>Contacto o WhatsApp para pedidos</label>
      <input type="text" id="cat_contact" placeholder="Ej.: Pedidos WhatsApp 7xxxxxxx" value="${escapeHtml(AppState.settings.catalogContact || '')}">
    </div>
    <div class="field">
      <label>Mensaje breve de cierre</label>
      <textarea id="cat_note" placeholder="Ej.: Consulta disponibilidad y forma de entrega.">${escapeHtml(AppState.settings.catalogNote || 'Consulta disponibilidad y forma de entrega. Productos naturales para el cuidado integral.')}</textarea>
    </div>
    <div class="catalogOptionRow">
      <label><input type="checkbox" id="cat_prices" checked> Mostrar precio público</label>
      <label><input type="checkbox" id="cat_stock"> Mostrar stock referencial</label>
      ${isAdmin() ? `<label><input type="checkbox" id="cat_reseller"> Incluir precio revendedor interno</label>` : ''}
    </div>
    <button class="btn block" id="generateCatalogBtn">Generar catálogo y compartir</button>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#generateCatalogBtn', overlay).addEventListener('click', async () => {
      const contact = $('#cat_contact', overlay).value.trim();
      const note = $('#cat_note', overlay).value.trim();
      AppState.settings.catalogContact = contact;
      AppState.settings.catalogNote = note;
      await saveSettings().catch(() => {});
      const btn = $('#generateCatalogBtn', overlay);
      btn.disabled = true;
      btn.textContent = 'Generando catálogo…';
      const result = await generateCatalogPdf({
        title: $('#cat_title', overlay).value.trim(),
        subtitle: $('#cat_subtitle', overlay).value.trim(),
        contact,
        note,
        includePrices: $('#cat_prices', overlay).checked,
        includeStock: $('#cat_stock', overlay).checked,
        includeResellerPrice: isAdmin() && $('#cat_reseller', overlay) && $('#cat_reseller', overlay).checked
      }).catch(err => {
        console.error(err);
        showToast('No se pudo generar el catálogo.', 'error');
        return null;
      });
      if (result) close();
      else {
        btn.disabled = false;
        btn.textContent = 'Generar catálogo y compartir';
      }
    });
  });
}

window.generateCatalogPdf = generateCatalogPdf;
window.openCatalogPdfOptions = openCatalogPdfOptions;
window.shareCatalogPdf = shareCatalogPdf;
