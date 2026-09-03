// backend/routes/presupuestos.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require("axios");
const { uploadMediaFromUrl, sendDocumentTemplate } = require("../services/whatsapp");

const Presupuesto = require('../models/Presupuesto');
const PresupuestoVersion = require('../models/PresupuestoVersion');
const Cliente = require('../models/Cliente');
const Abogado = require('../models/Abogado');
const PDFDocument = require('pdfkit');
const { validateRealClientName } = require('../utils/clientNameValidation');
const auth = require('../middleware/auth');

function getRole(req) {
  return String(req.user?.role || req.user?.rol || '').toUpperCase();
}

function stripAccents(s = '') {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

// Dibuja el PDF de un presupuesto (objeto con forma de Presupuesto: cliente
// poblado {nombre}, cargos, honorariosCalc, totalPresupuesto, etc). Se separó
// del handler de /:id/pdf para poder reusarlo al ver una versión histórica
// (PresupuestoVersion.versionAnterior/versionNueva) con el mismo layout.
function renderPresupuestoPDF(res, presupuesto) {
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

        // espacio extra entre I.S.R Adquisición y Tras. de Dominio
    if (label === 'I.S.R. Adquisición') {
      y += 6; // prueba con 4, 6 u 8 según cómo lo quieras ver
    }

    // espacios extra entre conceptos de Reg. Pub.
    if (
      label === 'Registro Público' ||
      label === 'Reg. Pub. Vta/Hipot' ||
      label === 'Reg. Pub. Poderes'
    ) {
      y += 6;
    }

        // espacios extra en columna derecha
    if (
      label === 'IVA Local Comerc' ||
      label === 'Gastos y Gestiones'
    ) {
      y += 6;
    }

    // Línea de firma justo debajo de Actos Jurídicos
    if (label === 'Actos Jurídicos') {
      y += 4;
      doc.save();
      doc.lineWidth(0.7).moveTo(x, y).lineTo(x + colWidth - 8, y).stroke();
      doc.restore();
      y += 5;
    }

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
}

router.get('/:id/pdf', async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findById(req.params.id).populate(
      'cliente',
      'nombre idCliente rfc RFC rSocial'
    );

    if (!presupuesto) {
      return res.status(404).json({ message: 'Presupuesto no encontrado' });
    }

    renderPresupuestoPDF(res, presupuesto);
  } catch (err) {
    console.error('Error PDF presupuesto:', err);
    res.status(500).json({ message: 'Error al generar PDF', error: err.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    // ✅ NO confiar en responsable del body si puedes evitarlo.
    // Si tienes auth middleware y viene req.user, úsalo.
    const responsableReal =
      (req.user?.nombre || req.user?.name || req.user?.fullName || req.user?.username || "")
        .trim() || String(req.body?.responsable || "").trim();

    const clienteId = req.body?.cliente;

    if (!clienteId) {
      return res.status(400).json({ message: "Falta cliente." });
    }
    if (!responsableReal) {
      return res.status(400).json({ message: "Falta responsable (login)." });
    }

    // ✅ RANGO DEL DÍA
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    // ✅ LÍMITE POR NOMBRE: buscar todos los IDs de clientes con el mismo nombre
    // (cubre el bypass de crear duplicados del mismo cliente)
    const clienteDoc = await Cliente.findById(clienteId).lean();
    if (!clienteDoc) {
      return res.status(404).json({ message: "Cliente no encontrado." });
    }

    // 🔒 Mismo candado de nombre que /api/clientes: por si el cliente elegido
    // es un registro viejo (previo a este candado) que el selector no filtró,
    // o si esta ruta se llama directo sin pasar por el frontend.
    const vName = await validateRealClientName(clienteDoc.nombre || '');
    if (!vName.ok) {
      return res.status(400).json({
        message: `Este cliente tiene un nombre no válido ("${clienteDoc.nombre}"). Registra un cliente nuevo con su nombre real antes de crear el presupuesto.`,
        code: 'CLIENTE_NOMBRE_INVALIDO',
      });
    }

    const nombreCliente = clienteDoc?.nombre || '';
    const nombreStripped = stripAccents(nombreCliente).toLowerCase().replace(/\s+/g, ' ').trim();

    // IDs del cliente actual + cualquier duplicado con el mismo nombre (case-insensitive + sin acentos)
    let clienteIdsAContar = [clienteId];
    if (nombreStripped) {
      const dupes = await Cliente.find({
        nombre: { $regex: new RegExp('^' + escapeRegex(nombreCliente) + '$', 'i') },
      }).lean().select('_id');
      const dupeIds = dupes.map((d) => d._id);

      // Segunda pasada en memoria para variantes con/sin acentos
      const candidatos = await Cliente.find({
        nombre: { $regex: new RegExp(escapeRegex(nombreStripped.split(' ')[0]), 'i') },
      }).lean().select('_id nombre');
      const extraIds = candidatos
        .filter((c) => stripAccents(c.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim() === nombreStripped)
        .map((c) => c._id);

      clienteIdsAContar = [...new Set([...dupeIds, ...extraIds, clienteId])];
    }

    const count = await Presupuesto.countDocuments({
      cliente: { $in: clienteIdsAContar },
      responsable: responsableReal,
      createdAt: { $gte: start, $lte: end },
    });

    if (count >= 2) {
      return res.status(409).json({
        message:
          "Ya hiciste 2 presupuestos hoy con este cliente. Si necesitas modificarlo, acude con nosotros.",
        code: "PRESUPUESTO_DIA_LIMITE",
      });
    }

    // ✅ Forzar responsable real (para que no lo falsifiquen desde el frontend)
    const presupuesto = new Presupuesto({
      ...req.body,
      responsable: responsableReal,
    });

    await presupuesto.save();

    // ✅ responde rápido al frontend
    res.status(201).json(presupuesto);

    // ===== lo demás igual (WhatsApp) =====
    const total = Number(presupuesto.totalPresupuesto || 0);
    if (total <= 100000) return;

    const notarioPhones = [process.env.NOTARIO_PHONE, process.env.NOTARIO_PHONE_2].filter(Boolean);

    // Self-fetch (mismo proceso/máquina): usar el puerto real del backend,
    // no una IP/puerto fijo que puede desincronizarse entre entornos.
    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8010}`;
    const pdfUrl = `${baseUrl}/api/presupuestos/${presupuesto._id}/pdf`;

    setImmediate(async () => {
      try {
        const up = await uploadMediaFromUrl({
          fileUrl: pdfUrl,
          mimeType: "application/pdf",
        });
        console.log("✅ Media subido:", up?.id);

        const bodyParams = [money(total), nombreCliente || '—', responsableReal];

        for (const phone of notarioPhones) {
          try {
            const sent = await sendDocumentTemplate({
              to: phone,
              mediaId: up.id,
              filename: `presupuesto_${presupuesto._id}.pdf`,
              bodyParams,
            });
            console.log(`✅ WhatsApp/PDF enviado a ${phone}:`, sent);
          } catch (e) {
            console.error(`⚠️ WhatsApp/PDF falló para ${phone}:`, e?.response?.data || e.message);
          }
        }
      } catch (e) {
        console.error("⚠️ WhatsApp/PDF falló al subir el media (no afecta guardado):", e?.response?.data || e.message);
      }
    });
  } catch (err) {
    console.error("Error al crear presupuesto:", err);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Error al crear presupuesto", error: err.message });
    }
  }
});




// Listar (con filtros)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const skip = (page - 1) * limit;

    const cliente = req.query.cliente;
    const q = (req.query.q || '').trim();

    const filter = {};
    if (cliente !== undefined && cliente !== '') {
      const cnum = Number(cliente);
      if (!Number.isFinite(cnum)) return res.status(400).json({ message: 'cliente inválido' });
      filter.cliente = cnum;
    }

    // ✅ Búsqueda a nivel de base de datos (antes de paginar), para que encuentre
    // coincidencias en TODO el listado y no solo en la página actualmente cargada.
    if (q) {
      const or = [
        { tipoTramite: { $regex: escapeRegex(q), $options: 'i' } },
      ];

      if (/^[0-9a-fA-F]{24}$/.test(q)) {
        or.push({ _id: q });
      }

      const qNum = Number(q);
      const clienteOr = [{ nombre: { $regex: escapeRegex(q), $options: 'i' } }];
      if (Number.isFinite(qNum)) clienteOr.push({ _id: qNum });

      const clientesMatch = await Cliente.find({ $or: clienteOr }).select('_id').lean();
      if (clientesMatch.length) {
        or.push({ cliente: { $in: clientesMatch.map((c) => c._id) } });
      }

      filter.$or = or;
    }

    const cursor = Presupuesto.find(filter)
      .sort({ createdAt: -1 })
      .populate('cliente', 'nombre idCliente');

    const [items, total] = await Promise.all([
      cursor.skip(skip).limit(limit).lean(),
      Presupuesto.countDocuments(filter),
    ]);

    res.json({
      page,
      limit,
      total,
      items,
    });
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

// 🔒 Actualizar — solo ADMIN, con motivo obligatorio y versión anterior/nueva
// guardada en PresupuestoVersion (bitácora inmutable, nunca se toca desde aquí).
router.put('/:id', auth, async (req, res) => {
  try {
    if (getRole(req) !== 'ADMIN') {
      return res.status(403).json({ message: 'Solo un administrador puede modificar un presupuesto ya creado.' });
    }

    const { motivo, abogadoSolicitanteId, ...cambios } = req.body || {};
    if (!motivo || !String(motivo).trim()) {
      return res.status(400).json({ message: 'Debes indicar el motivo de la modificación.' });
    }

    // El ADMIN ejecuta el cambio, pero la petición casi siempre viene de un
    // abogado — se exige y se resuelve el nombre real desde el catálogo
    // (nunca se confía en un nombre suelto que mande el body).
    if (abogadoSolicitanteId == null || abogadoSolicitanteId === '') {
      return res.status(400).json({ message: 'Indica qué abogado solicitó esta modificación.' });
    }
    const solicitante = await Abogado.findById(Number(abogadoSolicitanteId)).select('nombre').lean();
    if (!solicitante) {
      return res.status(400).json({ message: 'El abogado solicitante no es válido.' });
    }

    // Un presupuesto ya usado en una Escritura no debería moverse por esta
    // vía a la ligera: el monto ya quedó comprometido en el trámite.
    const presupuestoAnterior = await Presupuesto.findById(req.params.id).lean();
    if (!presupuestoAnterior) {
      return res.status(404).json({ message: 'Presupuesto no encontrado' });
    }

    // No permitir tocar el vínculo con la Escritura por esta vía (eso es
    // responsabilidad del flujo de Escrituras, no de una edición manual).
    delete cambios.usadoEnEscritura;
    delete cambios.escrituraId;
    delete cambios.fechaUsoEscritura;
    delete cambios._id;

    const presupuestoActualizado = await Presupuesto.findByIdAndUpdate(
      req.params.id,
      cambios,
      { new: true, runValidators: true }
    );

    await PresupuestoVersion.create({
      presupuestoId: presupuestoActualizado._id,
      versionAnterior: presupuestoAnterior,
      versionNueva: presupuestoActualizado.toObject(),
      motivo: String(motivo).trim(),
      modificadoPorId: req.user?.id != null ? Number(req.user.id) : null,
      modificadoPorNombre: req.user?.nombre || req.user?.name || req.user?.username || '',
      solicitanteId: Number(abogadoSolicitanteId),
      solicitanteNombre: solicitante.nombre || '',
    });

    res.json(presupuestoActualizado);
  } catch (err) {
    console.error('Error al actualizar presupuesto:', err);
    res.status(500).json({ message: 'Error al actualizar presupuesto', error: err.message });
  }
});

// 📜 Historial de versiones de un presupuesto (más reciente primero) —
// cualquier usuario logueado puede consultarlo (mismo criterio que "Ver
// PDF", que hoy ya es visible para todos); solo ADMIN puede modificar.
router.get('/:id/versiones', auth, async (req, res) => {
  try {
    const versiones = await PresupuestoVersion.find({ presupuestoId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ data: versiones });
  } catch (err) {
    console.error('Error al obtener historial de presupuesto:', err);
    res.status(500).json({ message: 'Error al obtener historial', error: err.message });
  }
});

// 📄 PDF de una versión histórica (antes o después de una edición puntual).
// Sin auth — mismo criterio que /:id/pdf: se abre con window.open() y el
// ID de Mongo (impredecible) es la única protección, igual que hoy.
router.get('/:id/versiones/:versionId/pdf', async (req, res) => {
  try {
    const version = await PresupuestoVersion.findOne({
      _id: req.params.versionId,
      presupuestoId: req.params.id,
    }).lean();

    if (!version) {
      return res.status(404).json({ message: 'Versión no encontrada' });
    }

    const campo = req.query.tipo === 'nueva' ? 'versionNueva' : 'versionAnterior';
    const snap = version[campo];
    if (!snap) {
      return res.status(404).json({ message: 'Esa versión no tiene datos para mostrar (fue una eliminación).' });
    }

    const clienteDoc = snap.cliente != null
      ? await Cliente.findById(snap.cliente).select('nombre idCliente').lean()
      : null;

    renderPresupuestoPDF(res, {
      ...snap,
      cliente: clienteDoc || { nombre: '(cliente no disponible)' },
    });
  } catch (err) {
    console.error('Error PDF versión de presupuesto:', err);
    res.status(500).json({ message: 'Error al generar PDF de la versión', error: err.message });
  }
});

// 🔒 Eliminar — solo ADMIN, con motivo obligatorio; queda registrado en
// PresupuestoVersion (versionNueva: null) antes de borrar, para no perder
// el rastro de qué había y quién lo borró.
router.delete('/:id', auth, async (req, res) => {
  try {
    if (getRole(req) !== 'ADMIN') {
      return res.status(403).json({ message: 'Solo un administrador puede eliminar un presupuesto.' });
    }

    const { motivo, abogadoSolicitanteId } = req.body || {};
    if (!motivo || !String(motivo).trim()) {
      return res.status(400).json({ message: 'Debes indicar el motivo de la eliminación.' });
    }
    if (abogadoSolicitanteId == null || abogadoSolicitanteId === '') {
      return res.status(400).json({ message: 'Indica qué abogado solicitó esta eliminación.' });
    }
    const solicitante = await Abogado.findById(Number(abogadoSolicitanteId)).select('nombre').lean();
    if (!solicitante) {
      return res.status(400).json({ message: 'El abogado solicitante no es válido.' });
    }

    const presupuesto = await Presupuesto.findById(req.params.id).lean();
    if (!presupuesto) return res.status(404).json({ message: 'Presupuesto no encontrado' });

    await PresupuestoVersion.create({
      presupuestoId: presupuesto._id,
      versionAnterior: presupuesto,
      versionNueva: null,
      motivo: String(motivo).trim(),
      modificadoPorId: req.user?.id != null ? Number(req.user.id) : null,
      modificadoPorNombre: req.user?.nombre || req.user?.name || req.user?.username || '',
      solicitanteId: Number(abogadoSolicitanteId),
      solicitanteNombre: solicitante.nombre || '',
    });

    await Presupuesto.findByIdAndDelete(req.params.id);
    res.json({ message: 'Presupuesto eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar presupuesto:', err);
    res.status(500).json({ message: 'Error al eliminar presupuesto', error: err.message });
  }
});

module.exports = router;
