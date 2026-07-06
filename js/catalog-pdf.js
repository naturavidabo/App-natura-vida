/* catalog-pdf.js — Catálogo comercial PDF para clientes: diseño limpio, sin imágenes de referencia distorsionadas, con compartir inmediato. */

const NATURA_BRAND_LOGO = 'img/brand/natura-vida-logo.jpeg';
let _lastCatalogPdf = null;

function catalogVisibleProducts() {
  const resellerCatalog = window.isReseller && isReseller();
  return (AppState.products || [])
    .filter(p => p.status !== 'archived')
    .sort((a, b) => String(a.category || 'General').localeCompare(String(b.category || 'General')) || String(a.name || '').localeCompare(String(b.name || '')));
}

function catalogPrimaryPrice(product) {
  return window.isReseller && isReseller() ? resellerLocalUnitPrice(product) : publicPrice(product);
}

function catalogSecondaryPrice(product) {
  return window.isReseller && isReseller() ? resellerLocalWholesalePrice(product) : representativePrice(product);
}

function catalogPrimaryLabel() {
  return window.isReseller && isReseller() ? 'Precio unitario' : 'Precio';
}

function catalogSecondaryLabel() {
  return window.isReseller && isReseller() ? 'Mayorista' : 'Representante';
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

async function imageInfoForPdf(src) {
  const data = await imageForPdf(src);
  if (!data) return null;
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ data, type: pdfImageType(data), width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ data, type: pdfImageType(data), width: 1, height: 1 });
    img.src = data;
  });
}

function drawImageContain(doc, img, x, y, w, h) {
  if (!img || !img.data) return false;
  const ratio = Math.min(w / img.width, h / img.height);
  const nw = img.width * ratio;
  const nh = img.height * ratio;
  const nx = x + (w - nw) / 2;
  const ny = y + (h - nh) / 2;
  try {
    doc.addImage(img.data, img.type, nx, ny, nw, nh, undefined, 'FAST');
    return true;
  } catch (_) {
    return false;
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

function drawLeaf(doc, cx, cy, w, h, rotate = 0, color = [132, 178, 65]) {
  doc.setFillColor(...color);
  doc.ellipse(cx, cy, w, h, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1.1);
  doc.line(cx - w * .55, cy + h * .08, cx + w * .48, cy - h * .12);
}

function drawLeafCluster(doc, x, y, scale = 1) {
  drawLeaf(doc, x, y, 16 * scale, 8 * scale, 0, [132, 178, 65]);
  drawLeaf(doc, x + 30 * scale, y + 12 * scale, 14 * scale, 7 * scale, 0, [1, 119, 59]);
  drawLeaf(doc, x - 22 * scale, y + 20 * scale, 12 * scale, 6 * scale, 0, [168, 199, 36]);
  drawLeaf(doc, x + 4 * scale, y + 33 * scale, 11 * scale, 5 * scale, 0, [216, 142, 30]);
}

function drawBenefitIcon(doc, kind, x, y, color) {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(2);
  doc.circle(x, y, 16, 'S');
  if (kind === 'energy') {
    doc.line(x - 2, y - 11, x - 9, y + 1);
    doc.line(x - 9, y + 1, x + 2, y + 1);
    doc.line(x + 2, y + 1, x - 2, y + 12);
    doc.line(x - 2, y + 12, x + 10, y - 3);
  } else if (kind === 'skin') {
    doc.circle(x - 5, y - 3, 1.4, 'F');
    doc.circle(x + 5, y - 3, 1.4, 'F');
    doc.line(x - 7, y + 6, x - 2, y + 9);
    doc.line(x - 2, y + 9, x + 4, y + 9);
    doc.line(x + 4, y + 9, x + 8, y + 6);
  } else if (kind === 'hair') {
    doc.line(x - 10, y - 6, x - 4, y - 13);
    doc.line(x - 4, y - 13, x + 6, y - 11);
    doc.line(x + 6, y - 11, x + 10, y - 4);
    doc.line(x - 8, y + 2, x - 8, y + 13);
    doc.line(x, y + 2, x, y + 13);
    doc.line(x + 8, y + 2, x + 8, y + 13);
  } else {
    doc.line(x - 8, y - 1, x + 8, y - 1);
    doc.line(x - 6, y + 5, x - 1, y + 9);
    doc.line(x - 1, y + 9, x + 6, y + 5);
  }
}

function drawProductPlaceholder(doc, x, y, w, h) {
  doc.setFillColor(239, 247, 241);
  doc.roundedRect(x, y, w, h, 16, 16, 'F');
  doc.setDrawColor(215, 231, 220);
  doc.roundedRect(x + 7, y + 7, w - 14, h - 14, 14, 14, 'S');
  doc.setFillColor(1, 119, 59);
  doc.circle(x + w / 2, y + h / 2 - 6, 19, 'F');
  drawLeaf(doc, x + w / 2 + 20, y + h / 2 - 27, 17, 8, 0, [132, 178, 65]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('NV', x + w / 2, y + h / 2 - 1, { align: 'center' });
}

function catalogFileName() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `NVB_CATALOGO_PRODUCTOS_${stamp}.pdf`;
}

function catalogContactLine(custom = '') {
  if (custom) return custom;
  const pieces = [];
  if (AppState.settings.contactName) pieces.push(AppState.settings.contactName);
  if (AppState.settings.contactPhone) pieces.push(`WhatsApp ${AppState.settings.contactPhone}`);
  if (AppState.settings.contactCity) pieces.push(AppState.settings.contactCity);
  if (pieces.length) return pieces.join(' · ');
  if (AppState.session && AppState.session.fullName) return AppState.session.fullName;
  return '';
}

async function shareCatalogPdf() {
  if (!_lastCatalogPdf || !_lastCatalogPdf.blob) {
    showToast('Primero genera el catálogo PDF.', 'error');
    return;
  }
  if (window.shareBlobFile) {
    return shareBlobFile(
      _lastCatalogPdf.blob,
      _lastCatalogPdf.filename,
      'application/pdf',
      'Catálogo Natura Vida',
      'Catálogo de productos Natura Vida - Te cuida por dentro y por fuera.'
    );
  }
  const file = new File([_lastCatalogPdf.blob], _lastCatalogPdf.filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Catálogo Natura Vida', text: 'Catálogo de productos Natura Vida.' });
      return;
    } catch (_) {}
  }
  downloadBlob(_lastCatalogPdf.blob, _lastCatalogPdf.filename);
  showToast('Catálogo descargado. Puedes adjuntarlo en cualquier aplicación compatible.');
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
        <p>${productsCount} producto(s) incluidos. Comparte de inmediato o revisa la vista previa.</p>
      </div>
    </div>
    <div class="pdfPreviewBox">
      <iframe src="${url}" class="pdfPreviewFrame" title="Vista previa del catálogo"></iframe>
    </div>
    <div class="exportRow catalogExportRow">
      <div class="exportBtn primaryShare" id="btnShareCatalog"><span class="ic">↗</span><span class="lbl">Compartir</span><span class="sub">Cualquier aplicación</span></div>
      <div class="exportBtn" id="btnOpenCatalog"><span class="ic">◫</span><span class="lbl">Previsualizar</span><span class="sub">Abrir PDF</span></div>
    </div>
    <div class="exportRow catalogExportRow">
      <div class="exportBtn" id="btnDownloadCatalog"><span class="ic">↓</span><span class="lbl">Descargar</span><span class="sub">Guardar archivo</span></div>
      <div class="exportBtn" id="btnCloseCatalog"><span class="ic">×</span><span class="lbl">Cerrar</span><span class="sub">Volver</span></div>
    </div>
    <div class="banner catalogShareNote">En celular, <strong>Compartir</strong> abre el menú nativo para elegir WhatsApp, Gmail, Telegram, Drive u otra aplicación. Si el navegador no lo permite, descargará el PDF.</div>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#btnCloseCatalog', overlay).addEventListener('click', close);
    $('#btnShareCatalog', overlay).addEventListener('click', shareCatalogPdf);
    $('#btnOpenCatalog', overlay).addEventListener('click', () => window.open(url, '_blank'));
    $('#btnDownloadCatalog', overlay).addEventListener('click', () => {
      downloadBlob(blob, filename);
      showToast('Catálogo descargado.');
    });
    if (navigator.canShare) {
      const shareFile = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [shareFile] })) setTimeout(() => shareCatalogPdf(), 500);
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
  const includeResellerPrice = (window.isReseller && isReseller()) || (!!options.includeResellerPrice && isAdmin());
  const title = cleanPdfText(options.title || `Catálogo ${AppState.settings.businessName || 'NATURA VIDA'}`, 120);
  const subtitle = cleanPdfText(options.subtitle || AppState.settings.businessSlogan || 'Te cuida por dentro y por fuera', 160);
  const contact = cleanPdfText(catalogContactLine(options.contact || AppState.settings.catalogContact || ''), 180);
  const note = cleanPdfText(options.note || 'Productos naturales para bienestar, belleza y cuidado integral. Consulta presentaciones disponibles y recomendaciones de uso.', 240);

  const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 34;
  const green = [1, 119, 59];
  const deepGreen = [0, 91, 48];
  const leaf = [132, 178, 65];
  const orange = [216, 142, 30];
  const dark = [22, 34, 27];
  const gray = [96, 108, 100];
  const soft = [246, 251, 247];
  const line = [222, 234, 225];
  const brandLogo = await imageInfoForPdf(NATURA_BRAND_LOGO) || await imageInfoForPdf(AppState.settings.logo);

  function footer(pageNo) {
    doc.setDrawColor(...line);
    doc.line(margin, pageH - 34, pageW - margin, pageH - 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(95, 108, 100);
    doc.text(`${AppState.settings.businessName || 'NATURA VIDA'} · ${subtitle}`, margin, pageH - 18, { maxWidth: pageW - 145 });
    doc.text(String(pageNo), pageW - margin, pageH - 18, { align: 'right' });
  }

  function header(label) {
    doc.setFillColor(...soft);
    doc.roundedRect(margin, 22, pageW - margin * 2, 54, 18, 18, 'F');
    if (brandLogo) drawImageContain(doc, brandLogo, margin + 12, 29, 62, 38);
    doc.setTextColor(...deepGreen);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(AppState.settings.businessName || 'NATURA VIDA', margin + 84, 44);
    doc.setTextColor(...orange);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text(label, margin + 84, 60);
    drawLeafCluster(doc, pageW - margin - 55, 40, .82);
  }

  function chip(x, y, w, txt, fillRgb, textRgb) {
    doc.setFillColor(...fillRgb);
    doc.roundedRect(x, y, w, 24, 12, 12, 'F');
    doc.setTextColor(...textRgb);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.3);
    doc.text(txt, x + w / 2, y + 15.5, { align: 'center' });
  }

  // Portada sin usar fotos de referencia pegadas/distorsionadas.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(245, 251, 246);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(233, 245, 237);
  doc.circle(pageW + 18, 92, 132, 'F');
  doc.setFillColor(255, 247, 232);
  doc.circle(-24, pageH - 70, 142, 'F');
  for (let i = 0; i < 20; i++) {
    const lx = 55 + (i % 5) * 100 + (i % 2) * 20;
    const ly = 35 + Math.floor(i / 5) * 38;
    drawLeaf(doc, lx, ly, 11 + (i % 3), 5.5, 0, i % 2 ? leaf : green);
  }
  drawLeafCluster(doc, pageW - 90, 78, 1.4);
  drawLeafCluster(doc, 80, pageH - 120, 1.25);

  doc.setFillColor(255,255,255);
  doc.setDrawColor(...line);
  doc.roundedRect(46, 80, pageW - 92, 422, 30, 30, 'FD');
  if (brandLogo) drawImageContain(doc, brandLogo, pageW / 2 - 138, 112, 276, 136);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...deepGreen);
  doc.setFontSize(30);
  doc.text('Catálogo de Productos', pageW / 2, 305, { align: 'center' });
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...orange);
  doc.setFontSize(15);
  doc.text(subtitle, pageW / 2, 333, { align: 'center', maxWidth: pageW - 120 });

  chip(pageW / 2 - 190, 370, 120, '100% natural', [235, 245, 238], [0, 91, 48]);
  chip(pageW / 2 - 60, 370, 100, 'Orgánico', [1, 119, 59], [255, 255, 255]);
  chip(pageW / 2 + 50, 370, 140, `${products.length} producto(s)`, [255, 248, 235], [216, 142, 30]);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.2);
  doc.setTextColor(...gray);
  addWrappedText(doc, note, 86, 425, pageW - 172, 14, 4);

  const featY = 540;
  const featW = (pageW - 116) / 3;
  const feats = [
    ['Belleza natural', 'Ideal para cuidado de piel, cabello y rutina diaria.'],
    ['Bienestar integral', 'Productos pensados para acompañar tu salud y energía.'],
    ['Presentaciones', 'Consulta tamaños, disponibilidad y recomendaciones.']
  ];
  feats.forEach((f, idx) => {
    const fx = 50 + idx * (featW + 8);
    doc.setFillColor(255,255,255);
    doc.setDrawColor(...line);
    doc.roundedRect(fx, featY, featW, 88, 18, 18, 'FD');
    drawBenefitIcon(doc, idx === 0 ? 'skin' : idx === 1 ? 'energy' : 'hair', fx + 30, featY + 32, idx === 2 ? orange : green);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10.4);
    doc.setTextColor(...deepGreen);
    doc.text(f[0], fx + 56, featY + 26, { maxWidth: featW - 64 });
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...gray);
    addWrappedText(doc, f[1], fx + 56, featY + 43, featW - 68, 10.5, 4);
  });

  if (contact) {
    doc.setFillColor(255, 248, 235);
    doc.setDrawColor(244, 217, 169);
    doc.roundedRect(78, 668, pageW - 156, 50, 16, 16, 'FD');
    doc.setTextColor(...orange);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.4);
    doc.text('Pedidos y consultas', pageW / 2, 688, { align: 'center' });
    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.text(contact, pageW / 2, 706, { align: 'center', maxWidth: pageW - 190 });
  }
  footer(1);

  // Página de beneficios para cliente.
  doc.addPage();
  let pageNo = 2;
  header('Beneficios y usos');
  doc.setTextColor(...deepGreen);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('Beneficios que se sienten', margin, 116);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...gray);
  addWrappedText(doc, 'Elige productos naturales para complementar tu bienestar, tu belleza y tu cuidado diario. Consulta siempre disponibilidad y recomendaciones de uso.', margin, 140, pageW - margin * 2, 14, 3);

  const benefitRows = [
    ['Fuente de energía natural', 'Acompaña tu rutina diaria con alternativas naturales y prácticas.', 'energy'],
    ['Piel hidratada y radiante', 'Ayuda al cuidado de la piel y aporta sensación de suavidad.', 'skin'],
    ['Cabello fuerte y brillante', 'Ideal para rutinas de cuidado personal y bienestar capilar.', 'hair'],
    ['Apoyo al bienestar digestivo', 'Productos seleccionados para acompañar hábitos saludables.', 'digest']
  ];
  let by = 204;
  benefitRows.forEach((b, idx) => {
    doc.setFillColor(idx % 2 ? 255 : 248, idx % 2 ? 255 : 252, idx % 2 ? 255 : 249);
    doc.setDrawColor(...line);
    doc.roundedRect(margin, by, pageW - margin * 2, 74, 18, 18, 'FD');
    drawBenefitIcon(doc, b[2], margin + 36, by + 37, idx === 3 ? orange : green);
    doc.setFont('helvetica','bold');
    doc.setFontSize(13);
    doc.setTextColor(...deepGreen);
    doc.text(b[0], margin + 72, by + 27);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...gray);
    addWrappedText(doc, b[1], margin + 72, by + 45, pageW - margin * 2 - 92, 11.5, 2);
    by += 88;
  });

  doc.setFillColor(...green);
  doc.roundedRect(margin, 592, pageW - margin * 2, 54, 20, 20, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(14);
  doc.text('Sin químicos · Sin conservantes · Natural', pageW / 2, 624, { align: 'center' });
  doc.setFont('helvetica','italic');
  doc.setFontSize(12);
  doc.text('Natura Vida, tu bienestar es natural.', pageW / 2, 690, { align: 'center' });
  footer(pageNo++);

  // Productos.
  doc.addPage();
  header('Productos disponibles');
  const cardW = (pageW - (margin * 2) - 14) / 2;
  const cardH = 258;
  let x = margin;
  let y = 94;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (y + cardH > pageH - 48) {
      footer(pageNo++);
      doc.addPage();
      header('Productos disponibles');
      x = margin; y = 94;
    }
    doc.setFillColor(255,255,255);
    doc.setDrawColor(...line);
    doc.roundedRect(x, y, cardW, cardH, 20, 20, 'FD');
    doc.setFillColor(...green);
    doc.roundedRect(x, y, cardW, 6, 6, 6, 'F');

    const imgX = x + 12, imgY = y + 15, imgW = cardW - 24, imgH = 96;
    doc.setFillColor(248, 252, 249);
    doc.roundedRect(imgX, imgY, imgW, imgH, 16, 16, 'F');
    const img = await imageInfoForPdf(p.photo);
    if (!drawImageContain(doc, img, imgX + 3, imgY + 3, imgW - 6, imgH - 6)) drawProductPlaceholder(doc, imgX, imgY, imgW, imgH);
    if (Number(p.stock || 0) <= 0) {
      doc.setFillColor(230,91,91);
      doc.roundedRect(imgX + imgW - 70, imgY + 8, 58, 18, 9, 9, 'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255,255,255);
      doc.text('AGOTADO', imgX + imgW - 41, imgY + 20, { align: 'center' });
    }

    let ty = y + 131;
    doc.setFillColor(232,244,236);
    doc.roundedRect(x + 14, ty - 12, Math.min(120, cardW - 28), 18, 9, 9, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...green);
    doc.text(cleanPdfText(p.category || 'General', 26).toUpperCase(), x + 22, ty);

    ty += 21;
    doc.setFont('helvetica','bold');
    doc.setFontSize(11.8);
    doc.setTextColor(...dark);
    ty = addWrappedText(doc, cleanPdfText(p.name, 86), x + 14, ty, cardW - 28, 13, 2) + 5;

    doc.setFont('helvetica','normal');
    doc.setFontSize(8.4);
    doc.setTextColor(...gray);
    ty = addWrappedText(doc, cleanPdfText(p.description || 'Producto natural disponible. Consulta presentación y recomendaciones de uso.', 220), x + 14, ty, cardW - 28, 10.5, 4);

    const priceY = y + cardH - 54;
    if (includePrices) {
      doc.setFillColor(...green);
      doc.roundedRect(x + 14, priceY, cardW - 28, 32, 16, 16, 'F');
      doc.setTextColor(255,255,255);
      doc.setFont('helvetica','bold');
      doc.setFontSize(12.2);
      doc.text(`${catalogPrimaryLabel()}: ${safePdfMoney(catalogPrimaryPrice(p))}`, x + cardW / 2, priceY + 21, { align: 'center' });
      if (includeResellerPrice) {
        doc.setTextColor(...orange);
        doc.setFont('helvetica','bold');
        doc.setFontSize(7.4);
        doc.text(`${catalogSecondaryLabel()}: ${safePdfMoney(catalogSecondaryPrice(p))}`, x + 14, y + cardH - 8);
      }
    } else {
      doc.setFillColor(255,248,235);
      doc.roundedRect(x + 14, priceY, cardW - 28, 32, 16, 16, 'F');
      doc.setTextColor(...orange);
      doc.setFont('helvetica','bold');
      doc.setFontSize(10.5);
      doc.text('Consultar precio', x + cardW / 2, priceY + 21, { align: 'center' });
    }
    if (includeStock) {
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.3);
      doc.setTextColor(...gray);
      doc.text(`Stock ref.: ${Number(p.stock || 0)}`, x + cardW - 14, y + cardH - 8, { align: 'right' });
    }
    if (x === margin) x = margin + cardW + 14;
    else { x = margin; y += cardH + 14; }
  }
  footer(pageNo++);

  // Cierre.
  doc.addPage();
  header('Contacto');
  doc.setFillColor(255,255,255);
  doc.setDrawColor(...line);
  doc.roundedRect(margin, 112, pageW - margin * 2, 380, 28, 28, 'FD');
  drawLeafCluster(doc, margin + 55, 155, 1.5);
  drawLeafCluster(doc, pageW - margin - 70, 392, 1.4);
  if (brandLogo) drawImageContain(doc, brandLogo, pageW / 2 - 126, 150, 252, 112);
  doc.setFont('helvetica','bold');
  doc.setFontSize(22);
  doc.setTextColor(...deepGreen);
  doc.text('Gracias por elegir Natura Vida', pageW / 2, 302, { align: 'center' });
  doc.setFont('helvetica','normal');
  doc.setFontSize(11.2);
  doc.setTextColor(...gray);
  addWrappedText(doc, 'Nuestros productos están pensados para acompañar tu bienestar y tu rutina de belleza de manera natural. Escríbenos para conocer disponibilidad, presentaciones y recomendaciones.', margin + 42, 332, pageW - margin * 2 - 84, 14, 5);
  chip(pageW / 2 - 156, 420, 92, 'Orgánico', [235,245,238], [0,91,48]);
  chip(pageW / 2 - 54, 420, 108, 'Sin químicos', [235,245,238], [0,91,48]);
  chip(pageW / 2 + 64, 420, 92, 'Bienestar', [235,245,238], [0,91,48]);
  if (contact) {
    doc.setFillColor(255,248,235);
    doc.setDrawColor(244,217,169);
    doc.roundedRect(margin + 28, 532, pageW - margin * 2 - 56, 58, 18, 18, 'FD');
    doc.setTextColor(...orange);
    doc.setFont('helvetica','bold');
    doc.setFontSize(11.5);
    doc.text('Pide más información o realiza tu pedido', pageW / 2, 554, { align: 'center' });
    doc.setTextColor(...dark);
    doc.setFont('helvetica','normal');
    doc.setFontSize(10.8);
    doc.text(contact, pageW / 2, 574, { align: 'center', maxWidth: pageW - 170 });
  }
  doc.setFont('helvetica','italic');
  doc.setFontSize(14);
  doc.setTextColor(...green);
  doc.text('Natura Vida, tu bienestar es natural.', pageW / 2, 656, { align: 'center' });
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
    <h2>Catálogo PDF para compartir <span class="x" id="closeSheet">✕</span></h2>
    <div class="catalogOptionsHero">
      <img src="${NATURA_BRAND_LOGO}" alt="Natura Vida">
      <div>
        <div class="eyebrow">Pieza comercial</div>
        <h3>Genera un catálogo listo para enviar</h3>
        <p>${isReseller() ? 'PDF con los productos de tu inventario propio y tus precios unitario y mayorista.' : 'PDF con identidad Natura Vida, beneficios, fotos reales, descripción y precios comerciales.'} Sin textos internos ni explicación técnica.</p>
      </div>
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
      <label>Contacto para pedidos</label>
      <input type="text" id="cat_contact" placeholder="Ej.: WhatsApp 7xxxxxxx" value="${escapeHtml(catalogContactLine(AppState.settings.catalogContact || ''))}">
    </div>
    <div class="field">
      <label>Mensaje breve de presentación</label>
      <textarea id="cat_note" placeholder="Ej.: Productos naturales para bienestar y belleza.">${escapeHtml(AppState.settings.catalogNote || 'Productos naturales para bienestar, belleza y cuidado integral. Consulta presentaciones disponibles y recomendaciones de uso.')}</textarea>
    </div>
    <div class="catalogOptionRow">
      <label><input type="checkbox" id="cat_prices" checked> ${isReseller() ? 'Mostrar mis precios' : 'Mostrar precio público'}</label>
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
