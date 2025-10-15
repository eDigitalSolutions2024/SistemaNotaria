// Backend/utils/pdfRecibo.js
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

function money(n) {
  const v = Number(n || 0);
  return `$${v.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatFechaES(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  // Ajusta la zona horaria si te conviene
  return dt.toLocaleDateString('es-MX', {
    weekday: 'long',   // lunes, martes…
    year: 'numeric',   // 2025
    month: 'long',     // septiembre
    day: '2-digit',    // 28
    timeZone: 'America/Mexico_City',
  });
}


function shortId(id) {
  if (!id) return '';
  const s = String(id);
  return s.slice(-5);
}

/** Intenta cargar el logo en varias rutas y extensiones; devuelve Buffer o null */
function tryLoadLogo() {
  const names = [
    'logo_notaria17.png',
    'logo_notaria17.jpg',
    'logo_notaria17.jpeg',
    'logo.png',
    'logo.jpg',
    'logo.jpeg',
    'notaria17.png',
    'notaria17.jpg',
  ];

  const bases = [
    path.resolve(__dirname, '..', 'public'),
    path.resolve(__dirname, '..', '..', 'public'),
    path.resolve(__dirname, '..', '..', 'frontend', 'public'),
    path.resolve(__dirname, '..', '..', 'uploads'),
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'frontend', 'public'),
    path.resolve(process.cwd(), 'uploads'),
  ];

  for (const base of bases) {
    for (const name of names) {
      const p = path.join(base, name);
      try {
        if (fs.existsSync(p)) return fs.readFileSync(p); // Buffer
      } catch {}
    }
  }
  return null;
}

async function makeQR(text) {
  try {
    return await QRCode.toBuffer(text, {
      errorCorrectionLevel: 'M',
      margin: 0,
      scale: 4,
    });
  } catch {
    return null;
  }
}

/**
 * Encabezado con:
 * - Logo izq (grande)
 * - "Notaría 17"
 * - "RECIBO # folio"
 * - Cajas Presupuesto / Total
 * - Etiqueta ORIGINAL/COPIA arriba a la derecha
 */
// + añadimos el parámetro opcional notarioNombre
function drawHeaderBar(
  doc, y, etiqueta, folioText, totalTramite, totalPagado, logoBuf, notarioNombre
) {
  const pageW = doc.page.width;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;

  const barH = 40;
  const boxW = 95;
  const boxH = barH;
  const gap = 8;

  const box2x = right - boxW;
  const box1x = box2x - gap - boxW;

  // Etiqueta (ORIGINAL/COPIA)
  if (etiqueta) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#333')
      .text(etiqueta, right - 90, Math.max(10, y - 14), { width: 85, align: 'right' });
  }

  // marco
  doc
    .lineWidth(0.8)
    .strokeColor('#d3d3d3')
    .rect(left, y, right - left, barH)
    .stroke();

  // logo
  const logoSide = 40;
  const xLogo = left + 6;
  const yLogo = y + (barH - logoSide) / 2;
  if (logoBuf) {
    try { doc.image(logoBuf, xLogo, yLogo, { width: logoSide, height: logoSide }); } catch {}
  }

  // Título
  const xTitle = (logoBuf ? xLogo + logoSide + 8 : left + 8);
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#000')
    .text('Notaría 17', xTitle, y + 5, { width: 260 });

  // --- NUEVO: línea con el nombre del notario, si existe ---
  if (notarioNombre) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#444')
      .text(String(notarioNombre), xTitle, y + 22, { width: 260 });
  }
  // ----------------------------------------------------------

  // Cajas Presupuesto / Total (derecha)
  doc.lineWidth(0.8).strokeColor('#d3d3d3').rect(box1x, y, boxW, boxH).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
     .text('Presupuesto', box1x + 6, y + 4, { width: boxW - 12, align: 'left' });
  doc.font('Helvetica').fontSize(10).fillColor('#000')
     .text(money(totalTramite), box1x + 6, y + 12, { width: boxW - 12, align: 'right' });

  doc.lineWidth(0.8).strokeColor('#d3d3d3').rect(box2x, y, boxW, boxH).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
     .text('Total', box2x + 6, y + 4, { width: boxW - 12, align: 'left' });
  doc.font('Helvetica').fontSize(10).fillColor('#000')
     .text(money(totalPagado), box2x + 6, y + 12, { width: boxW - 12, align: 'right' });

  // “RECIBO # <folio>”
  const safeLeft = xTitle + 160;
  const safeRight = box1x - 8;
  const reciboW = Math.max(80, safeRight - safeLeft);
  const reciboX = safeLeft;

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
     .text('RECIBO #', reciboX, y + 6, { width: 65, continued: true })
     .font('Helvetica')
     .text(` ${folioText || ''}`, { width: Math.max(60, reciboW - 65), continued: false });

  return y + barH + 20;
}


function drawRowLine(doc, x1, x2, y) {
  doc
    .lineWidth(0.5)
    .strokeColor('#d3d3d3')
    .moveTo(x1, y)
    .lineTo(x2, y)
    .stroke();
}

function drawLabelValue(doc, label, value, x, y, wLabel, wValue) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text(label + ':', x, y, {
    width: wLabel,
  });
  doc.font('Helvetica').fontSize(9).fillColor('#000').text(value || '—', x + wLabel + 4, y, {
    width: wValue,
  });
  return y + 16;
}

async function drawBloque(doc, data, etiqueta, assets) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  let y = doc.y;

  const folioText = data.folio || shortId(data._id);
  // HEADER con logo en la barra

  // Obtener nombre del notario: prioriza data.notarioNombre, si no usa env
  const notarioNombre = data?.notarioNombre || process.env.NOTARIO_NOMBRE || 'Lic. Carlos Javier Espinoza Leyva';


  y = drawHeaderBar(
    doc,
    y,
    etiqueta,
    folioText,
    data.totalTramite,
    data.totalPagado,
    assets?.logoBuf || null,
    notarioNombre
  );

  // Columna izquierda: solo QR — 2px más pequeño
  const qrSize = 60;
  const xLeftCol = left;
  const qrBuf = await makeQR(
    `Recibo:${folioText || data._id || ''}|Tipo:${data.tipoTramite || ''}|Control:${data.control || ''}`
  );
  if (qrBuf) {
    doc.image(qrBuf, xLeftCol + 8, y, { width: qrSize, height: qrSize });
  }

  // Contenido (tipo tabla)
  const colLeftW = 90;
  const x1 = left + colLeftW + 8;
  const x2 = right;
  const wContent = right - x1;

  let yy = y;

  yy = drawLabelValue(doc, 'Fecha', formatFechaES(data.fecha), x1, yy, 110, wContent - 110);

  drawRowLine(doc, x1, x2, yy - 2);

  yy = drawLabelValue(doc, 'Tipo de trámite', data.tipoTramite || '—', x1, yy, 120, wContent - 120);
  drawRowLine(doc, x1, x2, yy - 2);

  yy = drawLabelValue(doc, 'Recibí de', data.recibiDe || '—', x1, yy, 120, wContent - 120);
  drawRowLine(doc, x1, x2, yy - 2);

  yy = drawLabelValue(
    doc,
    'Abogado Responsable',
    data.abogado || '—',
    x1,
    yy,
    120,
    wContent - 120
  );
  drawRowLine(doc, x1, x2, yy - 2);

  yy = drawLabelValue(doc, 'Concepto', data.concepto || '—', x1, yy, 120, wContent - 120);
  drawRowLine(doc, x1, x2, yy - 2);

  const etiquetaControl = data.tipoTramite === 'Protocolito' ? '# Trámite' : 'Control';
  yy = drawLabelValue(doc, etiquetaControl, data.control || '—', x1, yy, 120, wContent - 120);
  drawRowLine(doc, x1, x2, yy - 2);

  yy = drawLabelValue(doc, 'Total del Trámite', money(data.totalTramite), x1, yy, 120, 140);
  drawRowLine(doc, x1, x2, yy - 2);

  // 👇 NUEVO: abono visible cuando > 0
  if (Number(data.abono || 0) > 0) {
    yy = drawLabelValue(doc, 'Abono (este recibo)', money(data.abono), x1, yy, 120, 140);
    drawRowLine(doc, x1, x2, yy - 2);
  }

  yy = drawLabelValue(doc, 'Total Pagado', money(data.totalPagado), x1, yy, 120, 140);
  drawRowLine(doc, x1, x2, yy - 2);

  const restante = Number(
    data.restante ?? Math.max(0, (data.totalTramite || 0) - (data.totalPagado || 0))
  );
  yy = drawLabelValue(doc, 'Restante', money(restante), x1, yy, 120, 140);
  drawRowLine(doc, x1, x2, yy - 2);

  // Firmas
  yy += 22; // << un poco más de espacio antes de firmas
  const lineLen = 170;
  const gap = 60;
  const signX1 = x1;
  const signX2 = x1 + lineLen + gap;

  doc
    .lineWidth(0.8)
    .strokeColor('#999')
    .moveTo(signX1, yy)
    .lineTo(signX1 + lineLen, yy)
    .stroke();

  doc
    .moveTo(signX2, yy)
    .lineTo(signX2 + lineLen, yy)
    .stroke();

  yy += 4;
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#444')
    .text('Recibí conforme', signX1, yy, { width: lineLen, align: 'center' })
    .text('Notaría 17', signX2, yy, { width: lineLen, align: 'center' });


    // --- NUEVO: nota al pie del recibo ---
   const notaPie = 'ESTE DOCUMENTO NO TIENE EFECTOS FISCALES Y AMPARA EL IMPORTE QUE ' +
                  'HABRA DE PAGARSE A LAS DIVERSAS DEPENDENCIAS QUIENES EXPEDIRAN LOS ' +
                  'COMPROBANTES FISCALES A NOMBRE DEL INTERESADO';


                   // Un poco de espacio y nota en letra pequeña
  yy += 16;
  doc
    .font('Helvetica-Oblique')
    .fontSize(8)
    .fillColor('#666')
    .text(notaPie, x1, yy, { width: wContent, align: 'justify' });
  // -------------------------------------

  // más espacio de cierre del bloque
  doc.y = Math.max(yy + 28, y + 250); // << antes 150
}

function drawSeparator(doc) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const y = doc.y + 16; // << más espacio antes de la línea
  doc
    .lineWidth(0.8)
    .strokeColor('#e5e5e5')
    .moveTo(left, y)
    .lineTo(right, y)
    .stroke();
  doc.y = y + 24; // << más espacio después de la línea
}

async function buildReciboPDF(res, data) {
  const doc = new PDFDocument({
    size: 'LETTER',
    // márgenes más amplios en toda la página
    margins: { top: 64, bottom: 64, left: 64, right: 64 }, // << antes 36
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="recibo-${data._id || 'notaria17'}.pdf"`
  );

  doc.pipe(res);

  const assets = { logoBuf: tryLoadLogo() };

  // ORIGINAL
  await drawBloque(doc, data, 'ORIGINAL', assets);

  // separador con amplio margen
  drawSeparator(doc);

  // COPIA
  await drawBloque(doc, data, 'COPIA', assets);

  doc.end();
}

module.exports = { buildReciboPDF };
