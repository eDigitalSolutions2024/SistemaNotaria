// backend/routes/presupuestos.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const Presupuesto = require('../models/Presupuesto');
const PDFDocument = require('pdfkit');

const money = (n) =>
  (Number(n) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const drawBox = (doc, x, y, w, h, lw = 1) => {
  doc.save();
  doc.lineWidth(lw).rect(x, y, w, h).stroke();
  doc.restore();
};

const drawHLine = (doc, x1, x2, y, lw = 1) => {
  doc.save();
  doc.lineWidth(lw).moveTo(x1, y).lineTo(x2, y).stroke();
  doc.restore();
};

// Busca logo en varias rutas posibles (por tu estructura actual)
const findLogoPath = () => {
  const candidates = [
    // 1) Si lo pones en backend/assets/logo.png
    path.join(__dirname, '..', 'assets', 'logo.png'),

    // 2) Tu caso real: frontend/public/logo.png
    // __dirname = backend/routes
    path.join(__dirname, '..', '..', 'frontend', 'public', 'logo.png'),

    // 3) Alternativas (por si cambias la carpeta)
    path.join(process.cwd(), 'frontend', 'public', 'logo.png'),
    path.join(process.cwd(), 'backend', 'assets', 'logo.png'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
};

router.get('/:id/pdf', async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findById(req.params.id).populate(
      'cliente',
      'nombre idCliente rfc RFC rSocial'
    );

    if (!presupuesto) {
      return res.status(404).json({ message: 'Presupuesto no encontrado' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=presupuesto_${presupuesto._id}.pdf`);

    const doc = new PDFDocument({ size: 'LETTER', margin: 28 });
    doc.pipe(res);

    // =============================
    // Layout base
    // =============================
    const pageW = doc.page.width;
    const m = doc.page.margins.left; // 28
    const contentW = pageW - m * 2;

    const now = new Date();
    const fecha = new Date(presupuesto.fecha || presupuesto.createdAt || now);
    const fechaTxt = fecha.toLocaleDateString('es-MX');

    // =============================
    // ENCABEZADO + LOGO
    // =============================
    const headerTopY = doc.y; // normalmente = margen superior
    const logoPath = findLogoPath();

    // Logo arriba izquierda
    if (logoPath) {
      // Ajusta el tamaño si lo quieres más grande/chico
      doc.image(logoPath, m, headerTopY - 4, { width: 52 });
    } else {
      console.warn('No se pudo cargar el logo: no se encontró en rutas esperadas.');
    }

    // Texto centrado (no se mueve aunque el logo esté a la izquierda)
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('LIC. CARLOS JAVIER ESPINOZA LEYVA', m, headerTopY, { width: contentW, align: 'center' });

    doc.fontSize(10);
    doc.text('NOTARIA PUBLICA NUMERO DIECISIETE', m, doc.y + 2, { width: contentW, align: 'center' });

    doc.font('Helvetica').fontSize(9);
    doc.text('BLVD. TEOFILO BORUNDA 8670, COL. PARTIDO IGLESIAS. C.P. 32618', m, doc.y + 1, {
      width: contentW,
      align: 'center',
    });
    doc.text('TEL. (656) 625-7332 Y (656) 625-7334', m, doc.y + 1, { width: contentW, align: 'center' });
    doc.text('MAIL: NOTARIA17CDJ@HOTMAIL.COM', m, doc.y + 1, { width: contentW, align: 'center' });

    doc.moveDown(0.35);
    drawHLine(doc, m, m + contentW, doc.y, 1);
    doc.moveDown(0.6);

    // =============================
    // Datos cliente (arriba)
    // =============================
    const clienteNombre = presupuesto.cliente?.nombre || '';
    const responsable = presupuesto.responsable || '';
    const tipoTramite = presupuesto.tipoTramite || '';

    const yDatos = doc.y;
    doc.font('Helvetica').fontSize(9);
    doc.text(`Cliente: ${clienteNombre}`, m, yDatos);
    doc.text('Particular', m + (contentW / 2) - 25, yDatos, { width: 120, align: 'center' });
    doc.text(`Fecha: ${fechaTxt}`, m + contentW - 160, yDatos, { width: 160, align: 'right' });

    doc.text(`Responsable: ${responsable}`, m, doc.y + 4);

    doc.moveDown(0.6);

    // =============================
    // CAJA: DATOS DE CÁLCULO
    // Orden solicitado:
    // Valor Operación, Valor Terreno, Valor Construcción, Tipo de trámite
    // =============================
    const boxY = doc.y;
    const boxH = 60;
    drawBox(doc, m, boxY, contentW, boxH, 1);

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Datos de Cálculo', m + 10, boxY + 8);

    doc.font('Helvetica').fontSize(9);

    const valorOperacion = Number(presupuesto.valorOperacion) || 0;
    const valorTerreno = Number(presupuesto.valorTerreno) || 0;
    const valorConstruccion = Number(presupuesto.valorConstruccion) || 0;
    const montoCred = Number(presupuesto.montoCredito || 0);

    // 3 “zonas” dentro del box (izq / centro / der)
    const leftZoneX = m + 10;
    const midZoneX = m + Math.floor(contentW * 0.42);
    const rightZoneX = m + Math.floor(contentW * 0.78);

    // Fila 1
    doc.text('Valor Operación', leftZoneX, boxY + 28);
    doc.text(money(valorOperacion), leftZoneX + 110, boxY + 28);
 

    doc.text('Tipo de Trámite', rightZoneX, boxY + 28);
    doc.text(tipoTramite || '-', rightZoneX, boxY + 42, { width: 140 });

    // Fila 2
    doc.text('Valor Terreno', leftZoneX, boxY + 44);
    doc.text(money(valorTerreno), leftZoneX + 110, boxY + 44);

    doc.text('Valor Construcción', midZoneX, boxY + 44);
    doc.text(money(valorConstruccion), midZoneX + 115, boxY + 44);

    doc.moveDown(4);

    // =============================
    // BLOQUE: CARGOS (izq grande) + HONORARIOS (der chico)
    // =============================
    const startY = boxY + boxH + 20;

    const gap = 14;
    const rightW = 205; // <- más chico honorarios
    const leftW = contentW - rightW - gap; // <- más grande cargos


    const leftX = m;
    const rightX = m + leftW + gap;

    const blockH = 320;

    drawBox(doc, leftX, startY, leftW, blockH, 1);
    drawBox(doc, rightX, startY, rightW, blockH, 1);

    // títulos
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Cargos.', leftX + 10, startY + 8);
    doc.text('Honorarios', rightX + 10, startY + 8);

    drawHLine(doc, leftX, leftX + leftW, startY + 26, 1);
    drawHLine(doc, rightX, rightX + rightW, startY + 26, 1);

    const cargos = presupuesto.cargos || {};
    const honor = presupuesto.honorariosCalc || {};

    // =============================
    // CARGOS: 2 columnas con separación (sin verse pegado)
    // =============================
    const cargosCol1 = [
      ['I.S.R.', cargos.isr],
      ['I.S.R. Adquisición', cargos.isrAdquisicion],
      ['Tras. de Dominio', cargos.traslacionDominio],
      ['Tras. Dominio (2)', cargos.traslacionDominio2],
      ['(Recargos) T.D', cargos.traslacionDominioRecargos],
      ['Registro Público', cargos.registroPublico],
      ['Reg. Pub. Vta/Hipot', cargos.registroPubVtaHip],
      ['Reg. Pub. Poderes', cargos.registroPubPoderes],
      ['Reg. Pub. Otros', cargos.registroPubOtros],
      ['(Recargos) R.P', cargos.registroPublicoRecargos],
      ['Soloc. Permiso R.E', cargos.solicPermiso],
      ['Aviso Permiso', cargos.avisoPermiso],
    ];

    const cargosCol2 = [
      ['IVA Local Comerc', cargos.ivaLocalComerc],
      ['Actos Jurídicos', cargos.actosJuridicos],
      ['Impto. Cedular', cargos.impuestoCedular],
      ['Trámite Foráneo', cargos.tramiteForaneo],
      ['Certificados', cargos.certificados1],
      ['Certificados (2)', cargos.certificados2],
      ['Certificados (3)', cargos.certificados3],
      ['Plano', cargos.plano],
      ['Costo de Avalúo', cargos.costoAvaluo],
      ['Gastos y Gestiones', cargos.gastosGestiones],
      ['Impto. Predial', cargos.impuestoPredial],
      ['Otros Conceptos', cargos.otrosConceptos],
    ];

    // Ajustes clave para que NO se encimen:
    // - fuente 9 pero labels en una sola línea con ellipsis
    // - rowH menor
    // - separación real entre columnas
    // --- helper para truncar a 1 línea (sin wrap) ---
const fitOneLine = (doc, text, maxW) => {
  const str = String(text || '');
  if (doc.widthOfString(str) <= maxW) return str;

  let s = str;
  while (s.length > 1 && doc.widthOfString(s + '…') > maxW) {
    s = s.slice(0, -1);
  }
  return s + '…';
};

    doc.font('Helvetica').fontSize(9);

    const rowH = 20;
    const yStart = startY + 38;

    const innerLeftX = leftX + 12;
    const innerW = leftW - 24;

    // separación entre las 2 columnas de CARGOS
    const colGapInner = 30;

    // ancho de cada columna
    const colW = Math.floor((innerW - colGapInner) / 2);

    const renderCargoColumn = (items, x, colWidth) => {
      let y = yStart;

      // haz el monto más compacto para dejar MUCHO espacio al texto
      const amountW = 62;
      const padBetween = 10;

      const labelW = colWidth - amountW - padBetween;
      const amountX = x + labelW + padBetween;

      items.forEach(([label, val]) => {
        // ✅ una sola línea: NO wrap
        doc.text(String(label || ''), x, y, { width: labelW, lineBreak: false });

        doc.text(money(val), amountX, y, {
          width: amountW,
          align: 'right',
          lineBreak: false,
        });

        y += rowH;
      });
    };

    renderCargoColumn(cargosCol1, innerLeftX, colW);
    renderCargoColumn(cargosCol2, innerLeftX + colW + colGapInner, colW);




    // =============================
    // HONORARIOS (derecha)
    // =============================
    let hy = startY + 42;

    const honorItems = [
      ['Honorarios', honor.honorarios ?? honor.subtotal ?? 0],
      ['I.V.A.', honor.iva ?? 0],
      ['Subtotal', honor.subtotal ?? 0],
      ['Reten. I.S.R.', honor.retencionIsr ?? 0],
      ['Reten. I.V.A.', honor.retencionIva ?? 0],
      ['Total Honorarios', honor.totalHonorarios ?? 0],
    ];

    honorItems.forEach(([label, val]) => {
      doc.text(label, rightX + 12, hy);
      doc.text(money(val), rightX + rightW - 12 - 110, hy, { width: 110, align: 'right' });
      hy += 22;
    });

    // =============================
    // TOTAL (dentro de honorarios)
    // =============================
    const total = Number(presupuesto.totalPresupuesto || 0);

    const totalBoxW = rightW - 24;
    const totalBoxH = 66;
    const totalBoxX = rightX + 12;
    const totalBoxY = startY + blockH - totalBoxH - 12;

    drawBox(doc, totalBoxX, totalBoxY, totalBoxW, totalBoxH, 1);

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Total:', totalBoxX + 12, totalBoxY + 16);

    doc.font('Helvetica-Bold').fontSize(13);
    doc.text(money(total), totalBoxX + 12, totalBoxY + 36, {
      width: totalBoxW - 24,
      align: 'right',
    });

    doc.end();
  } catch (err) {
    console.error('Error PDF presupuesto:', err);
    res.status(500).json({ message: 'Error al generar PDF', error: err.message });
  }
});

// Crear presupuesto
router.post('/', async (req, res) => {
  try {
    const presupuesto = new Presupuesto(req.body);
    await presupuesto.save();
    res.status(201).json(presupuesto);
  } catch (err) {
    console.error('Error al crear presupuesto:', err);
    res.status(500).json({ message: 'Error al crear presupuesto', error: err.message });
  }
});

// Listar
router.get('/', async (_req, res) => {
  try {
    const presupuestos = await Presupuesto.find().populate('cliente', 'nombre idCliente');
    res.json(presupuestos);
  } catch (err) {
    console.error('Error al obtener presupuestos:', err);
    res.status(500).json({ message: 'Error al obtener presupuestos', error: err.message });
  }
});


router.get('/ultimo/cliente/:cliente', async (req, res) => {
  try {
    const clienteNum = Number(req.params.cliente);
    if (!Number.isFinite(clienteNum)) {
      return res.status(400).json({ message: 'Cliente inválido' });
    }

    const presupuesto = await Presupuesto.findOne({ cliente: clienteNum })
      .sort({ createdAt: -1 });

    if (!presupuesto) return res.json(null);

    const cargos = presupuesto.cargos || {};
    const honor = presupuesto.honorariosCalc || {};

    const impuestosKeys = [
      'isr','isrAdquisicion',
      'traslacionDominio','traslacionDominio2','traslacionDominioRecargos',
      'ivaLocalComerc','actosJuridicos',
      'impuestoCedular','impuestoPredial',
    ];

    const gastosKeys = [
      'registroPublico','registroPubVtaHip','registroPubPoderes','registroPubOtros','registroPublicoRecargos',
      'solicPermiso','avisoPermiso','costoAvaluo','gastosGestiones',
      'tramiteForaneo','otrosConceptos',
      'certificados1','certificados2','certificados3',
    ];

    const sumKeys = (obj, keys) =>
      keys.reduce((acc, k) => acc + (Number(obj?.[k]) || 0), 0);

    res.json({
      presupuestoId: presupuesto._id,
      cliente: presupuesto.cliente,
      tipoTramite: presupuesto.tipoTramite,
      valorAvaluo: Number(presupuesto.avaluo ?? presupuesto.valorOperacion ?? 0) || 0,
      totalHonorarios: Number(honor.totalHonorarios ?? 0) || 0,
      totalImpuestos: sumKeys(cargos, impuestosKeys),
      totalGastosExtra: sumKeys(cargos, gastosKeys),
      totalPresupuesto: Number(presupuesto.totalPresupuesto || 0) || 0,
      createdAt: presupuesto.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener último presupuesto', error: err.message });
  }
});





// Obtener uno
router.get('/:id', async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findById(req.params.id).populate('cliente', 'nombre idCliente');
    if (!presupuesto) return res.status(404).json({ message: 'Presupuesto no encontrado' });
    res.json(presupuesto);
  } catch (err) {
    console.error('Error al obtener presupuesto:', err);
    res.status(500).json({ message: 'Error al obtener presupuesto', error: err.message });
  }
});

// Actualizar
router.put('/:id', async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!presupuesto) return res.status(404).json({ message: 'Presupuesto no encontrado' });
    res.json(presupuesto);
  } catch (err) {
    console.error('Error al actualizar presupuesto:', err);
    res.status(500).json({ message: 'Error al actualizar presupuesto', error: err.message });
  }
});

// Eliminar
router.delete('/:id', async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findByIdAndDelete(req.params.id);
    if (!presupuesto) return res.status(404).json({ message: 'Presupuesto no encontrado' });
    res.json({ message: 'Presupuesto eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar presupuesto:', err);
    res.status(500).json({ message: 'Error al eliminar presupuesto', error: err.message });
  }
});

module.exports = router;
