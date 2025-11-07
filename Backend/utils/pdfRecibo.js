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

// Zona horaria por defecto para los PDF
const DEFAULT_TZ = process.env.TZ_PDF || 'America/Ciudad_Juarez';

/** Convierte lo que venga (Date | string) a Date local sin desfasar el día.
 *  Casos resueltos:
 *  - 'YYYY-MM-DD'  → new Date(y, m-1, d)  (medianoche LOCAL)
 *  - ISO con hora:
 *      * Si es exactamente medianoche UTC (hh:mm:ss.ms = 00:00:00.000Z),
 *        se interpreta como fecha-calendario y se reconstruye en LOCAL:
 *        new Date(UTCy, UTCm, UTCd)  (medianoche LOCAL del mismo día calendario)
 *      * En cualquier otro caso, se usa tal cual new Date(...)
 */
function toLocalDate(d) {
  if (!d) return null;

  if (typeof d === 'string') {
    const s = d.trim();

    // Caso 1: sólo fecha, la tratamos como fecha local pura
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, dd] = s.split('-').map(Number);
      return new Date(y, m - 1, dd); // medianoche LOCAL
    }

    // Caso 2: ISO con hora
    const iso = new Date(s);
    if (!isNaN(iso)) {
      // Si es exactamente medianoche UTC, lo tratamos como "fecha pura"
      if (
        iso.getUTCHours() === 0 &&
        iso.getUTCMinutes() === 0 &&
        iso.getUTCSeconds() === 0 &&
        iso.getUTCMilliseconds() === 0
      ) {
        // Reconstruye como medianoche LOCAL del mismo día calendario (usando UTC y-m-d)
        return new Date(iso.getUTCFullYear(), iso.getUTCMonth(), iso.getUTCDate());
      }
      return iso;
    }
    return null;
  }

  // Si ya es Date
  const dt = new Date(d);
  if (isNaN(dt)) return null;

  // Mismo tratamiento: si viene en medianoche UTC exacta, asume "fecha pura"
  if (
    dt.getUTCHours() === 0 &&
    dt.getUTCMinutes() === 0 &&
    dt.getUTCSeconds() === 0 &&
    dt.getUTCMilliseconds() === 0
  ) {
    return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  }

  return dt;
}

function formatFechaES(d, tz = DEFAULT_TZ) {
  const dt = toLocalDate(d);
  if (!dt) return '';
  return dt.toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    timeZone: tz,
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

  // Abono visible cuando > 0
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
  yy += 22;
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

  // Nota al pie
  const notaPie = 'ESTE DOCUMENTO NO TIENE EFECTOS FISCALES Y AMPARA EL IMPORTE QUE ' +
                  'HABRA DE PAGARSE A LAS DIVERSAS DEPENDENCIAS QUIENES EXPEDIRAN LOS ' +
                  'COMPROBANTES FISCALES A NOMBRE DEL INTERESADO';

  yy += 16;
  doc
    .font('Helvetica-Oblique')
    .fontSize(8)
    .fillColor('#666')
    .text(notaPie, x1, yy, { width: wContent, align: 'justify' });

  // cierre del bloque
  doc.y = Math.max(yy + 28, y + 250);
}

function drawSeparator(doc) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const y = doc.y + 16;
  doc
    .lineWidth(0.8)
    .strokeColor('#e5e5e5')
    .moveTo(left, y)
    .lineTo(right, y)
    .stroke();
  doc.y = y + 24;
}

async function buildReciboPDF(res, data) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 64, bottom: 64, left: 64, right: 64 },
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

  // separador
  drawSeparator(doc);

  // COPIA
  await drawBloque(doc, data, 'COPIA', assets);

  doc.end();
}

module.exports = { buildReciboPDF };
