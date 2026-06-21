/* catalog-pdf.js — Generador PDF de catálogo comercial para compartir por WhatsApp.
   Usa jsPDF ya cargado en index.html. No expone costos internos. */

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

async function imageForPdf(src) {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:image/')) return src;
  try {
    // En PWA publicada bajo el mismo dominio puede convertir iconos/rutas locales.
    const res = await fetch(src);
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

async function generateCatalogPdf(options = {}) {
  const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDFCtor) {
    showToast('No se pudo cargar el generador PDF. Revisa conexión o librería jsPDF.', 'error');
    return;
  }
  const products = catalogVisibleProducts();
  if (!products.length) {
    showToast('No hay productos activos para generar catálogo.', 'error');
    return;
  }

  const includePrices = options.includePrices !== false;
  const includeStock = !!options.includeStock;
  const includeResellerPrice = !!options.includeResellerPrice && isAdmin();
  const title = cleanPdfText(options.title || `Catálogo ${AppState.settings.businessName || 'NATURA VIDA'}`, 120);
  const subtitle = cleanPdfText(options.subtitle || AppState.settings.businessSlogan || 'Productos naturales para tu bienestar', 160);
  const contact = cleanPdfText(options.contact || AppState.settings.catalogContact || '', 160);

  const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const green = [1, 119, 59];
  const dark = [20, 29, 23];
  const gray = [105, 113, 120];
  const soft = [241, 247, 243];

  function footer(pageNo) {
    doc.setDrawColor(225, 232, 226);
    doc.line(margin, pageH - 36, pageW - margin, pageH - 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 110, 105);
    doc.text(`${AppState.settings.businessName || 'NATURA VIDA'} · Catálogo generado ${new Date().toLocaleDateString('es-BO')}`, margin, pageH - 20);
    doc.text(String(pageNo), pageW - margin, pageH - 20, { align: 'right' });
  }

  // Portada
  doc.setFillColor(...green);
  doc.roundedRect(28, 28, pageW - 56, 150, 22, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(title, margin + 10, 82, { maxWidth: pageW - 92 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(subtitle, margin + 10, 111, { maxWidth: pageW - 92 });
  doc.setFontSize(10);
  doc.text('Catálogo para compartir por WhatsApp', margin + 10, 145);
  if (contact) doc.text(contact, pageW - margin - 10, 145, { align: 'right' });

  doc.setTextColor(...dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Productos disponibles', margin, 218);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...gray);
  doc.text(`${products.length} producto(s) activo(s). Precios expresados en bolivianos.`, margin, 236);

  let y = 270;
  const cardH = 168;
  let pageNo = 1;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (y + cardH > pageH - 58) {
      footer(pageNo++);
      doc.addPage();
      y = 46;
    }

    doc.setFillColor(...soft);
    doc.setDrawColor(222, 232, 224);
    doc.roundedRect(margin, y, pageW - (margin * 2), cardH - 10, 14, 14, 'FD');

    const imgX = margin + 12;
    const imgY = y + 14;
    const imgSize = 112;
    const imgData = await imageForPdf(p.photo);
    if (imgData) {
      try {
        doc.addImage(imgData, imgData.includes('image/png') ? 'PNG' : 'JPEG', imgX, imgY, imgSize, imgSize, undefined, 'FAST');
      } catch (_) {
        doc.setFillColor(232, 240, 235);
        doc.roundedRect(imgX, imgY, imgSize, imgSize, 12, 12, 'F');
        doc.setTextColor(...green);
        doc.setFontSize(26);
        doc.text('NV', imgX + imgSize / 2, imgY + 64, { align: 'center' });
      }
    } else {
      doc.setFillColor(232, 240, 235);
      doc.roundedRect(imgX, imgY, imgSize, imgSize, 12, 12, 'F');
      doc.setTextColor(...green);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.text('NV', imgX + imgSize / 2, imgY + 64, { align: 'center' });
    }

    const textX = imgX + imgSize + 18;
    const textW = pageW - textX - margin - 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...dark);
    addWrappedText(doc, cleanPdfText(p.name, 90), textX, y + 28, textW, 14, 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...green);
    doc.text(cleanPdfText(p.category || 'General', 40), textX, y + 62);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    addWrappedText(doc, cleanPdfText(p.description || 'Producto disponible. Consulta disponibilidad y forma de entrega.', 240), textX, y + 82, textW, 11, 4);

    if (includePrices) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...green);
      doc.text(`Precio público: ${safePdfMoney(publicPrice(p))}`, textX, y + 132);
      if (includeResellerPrice) {
        doc.setFontSize(9);
        doc.text(`Precio revendedor: ${safePdfMoney(wholesalePrice(p))}`, textX, y + 148);
      }
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...green);
      doc.text('Consultar precio y disponibilidad', textX, y + 132);
    }

    if (includeStock) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...gray);
      doc.text(`Stock referencial: ${Number(p.stock || 0)}`, pageW - margin - 16, y + 148, { align: 'right' });
    }

    y += cardH;
  }

  footer(pageNo);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `NVB_CATALOGO_PRODUCTOS_${stamp}.pdf`;
  doc.save(filename);
  showToast('Catálogo PDF generado: ' + filename);
}

function openCatalogPdfOptions() {
  const defaultTitle = `Catálogo ${AppState.settings.businessName || 'NATURA VIDA'}`;
  openSheet(`
    <h2>Generar catálogo PDF <span class="x" id="closeSheet">✕</span></h2>
    <div class="banner">
      Genera un PDF con productos, fotos, descripción y precio público para enviarlo por WhatsApp a clientes.
      No incluye costos internos.
    </div>
    <div class="field">
      <label>Título del catálogo</label>
      <input type="text" id="cat_title" value="${escapeHtml(defaultTitle)}">
    </div>
    <div class="field">
      <label>Subtítulo / mensaje comercial</label>
      <input type="text" id="cat_subtitle" value="${escapeHtml(AppState.settings.businessSlogan || 'Productos naturales para tu bienestar')}">
    </div>
    <div class="field">
      <label>Contacto o WhatsApp para pedidos</label>
      <input type="text" id="cat_contact" placeholder="Ej.: Pedidos WhatsApp 7xxxxxxx" value="${escapeHtml(AppState.settings.catalogContact || '')}">
    </div>
    <div class="catalogOptionRow">
      <label><input type="checkbox" id="cat_prices" checked> Mostrar precio público</label>
      <label><input type="checkbox" id="cat_stock"> Mostrar stock referencial</label>
      ${isAdmin() ? `<label><input type="checkbox" id="cat_reseller"> Incluir precio revendedor interno</label>` : ''}
    </div>
    <button class="btn block" id="generateCatalogBtn">Generar PDF</button>
  `, (overlay, close) => {
    $('#closeSheet', overlay).addEventListener('click', close);
    $('#generateCatalogBtn', overlay).addEventListener('click', async () => {
      const contact = $('#cat_contact', overlay).value.trim();
      AppState.settings.catalogContact = contact;
      await saveSettings().catch(() => {});
      await generateCatalogPdf({
        title: $('#cat_title', overlay).value.trim(),
        subtitle: $('#cat_subtitle', overlay).value.trim(),
        contact,
        includePrices: $('#cat_prices', overlay).checked,
        includeStock: $('#cat_stock', overlay).checked,
        includeResellerPrice: isAdmin() && $('#cat_reseller', overlay) && $('#cat_reseller', overlay).checked
      });
      close();
    });
  });
}

window.generateCatalogPdf = generateCatalogPdf;
window.openCatalogPdfOptions = openCatalogPdfOptions;
