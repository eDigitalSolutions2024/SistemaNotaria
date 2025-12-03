// routes/escrituras.js
const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const xlsx = require('xlsx');

const Escritura = require('../models/Escritura');

// (Opcional) si tienes modelo Cliente; si no, no pasa nada
let Cliente = null;
try { Cliente = require('../models/Cliente'); } catch { /* opcional */ }

// --- helpers ---

// === Folios por volumen ===
const MAX_FOLIOS_POR_VOLUMEN = 300;

// Normaliza un rango (si solo mandan folio, lo tomamos como desde=hasta=folio)
function rangoDe(r) {
  const d = r.folioDesde ?? r.folio_inicio ?? r.folioStart ?? r.folio ?? null;
  const h = r.folioHasta ?? r.folio_fin ?? r.folioEnd ?? r.folio ?? null;
  if (d == null && h == null) return null;
  const desde = Number(d);
  const hasta = Number(h ?? d);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return null;
  return { desde, hasta };
}

// ¿Traslapa?
function traslapa(a, b) {
  return a && b && a.desde <= b.hasta && b.desde <= a.hasta;
}

// Intenta incrementar etiqueta de volumen (“5” => “6”, “Libro 3” => “Libro 4”)
function incVolumenTag(vol) {
  const s = String(vol ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)(\d+)\s*$/); // captura dígitos finales
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  if (/^\d+$/.test(s)) return String(Number(s) + 1);
  // si no hay número, no sabemos incrementar
  return null;
}

// >>> TESTAMENTO — utilidades HH:mm
function parseHHMM(s) {
  const m = String(s || '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}
function toMinutes(s) {
  const p = parseHHMM(s);
  return p ? (p.h * 60 + p.m) : null;
}
function validRangeHHMM(inicio, fin) {
  const a = toMinutes(inicio), b = toMinutes(fin);
  return a != null && b != null && a < b;
}



// --- Helpers de usuario / recibos pendientes ---

function getUserNameFromReq(req) {
  const u = req.user || {};
  return (
    u.nombre ||
    u.name ||
    u.fullName ||
    u.username ||
    u.userName ||
    ''
  ).trim();
}

function getUserRolesFromReq(req) {
  const u = req.user || {};
  const roles = [];
  if (Array.isArray(u.roles)) roles.push(...u.roles);
  if (u.rol) roles.push(u.rol);
  if (u.role) roles.push(u.role);
  return roles.map(r => String(r).toUpperCase());
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cuenta cuántas escrituras sin recibo / justificante tiene
 * un abogado (según el campo `abogado` en la colección).
 *
 * Criterio "pendiente":
 *   - estatus_recibo NO está en ['CON_RECIBO', 'JUSTIFICADO']  (o no existe)
 */
async function countEscriturasSinReciboPorAbogado(nombreAbogado) {
  if (!nombreAbogado) return 0;

  const regexAbogado = new RegExp(escapeRegex(nombreAbogado), 'i');

  const filter = {
    abogado: regexAbogado,
    $or: [
      { estatus_recibo: { $exists: false } },
      { estatus_recibo: { $nin: ['CON_RECIBO', 'JUSTIFICADO'] } },
    ],
  };

  return Escritura.countDocuments(filter);
}


// ¿traslapan rangos [a,b) y [c,d)?
function overlapped(aIni, aFin, bIni, bFin) {
  return aIni < bFin && bIni < aFin;
}
// <<< TESTAMENTO

// Montos numéricos (acepta '', null, undefined)
const numOrNull = (v) => {
  if (v === undefined) return undefined;   // "no tocar"
  if (v === null || v === '') return null; // limpiar
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};




// Calcula el máximo folio usado en un volumen
async function maxFolioUsado(volumen, excludeId = null) {
  const filter = { volumen: volumen };
  if (excludeId) filter._id = { $ne: excludeId };

  const docs = await Escritura.find(filter, {
    folioDesde: 1, folioHasta: 1, folio: 1, folio_inicio: 1, folio_fin: 1
  }).lean();

  let max = 0;
  for (const d of docs) {
    const r = rangoDe(d);
    if (r) max = Math.max(max, r.hasta);
  }
  return max;
}

// Da el siguiente hueco (inicio) y volumen sugerido para un tamaño “len”
async function siguienteSlot(volumen, len = 1, excludeId = null) {
  len = Math.max(1, Number(len) || 1);
  let vol = volumen;
  if (!vol) return { volumen: null, desde: null };

  const maxUsado = await maxFolioUsado(vol, excludeId);
  const candidato = maxUsado + 1;
  if (candidato + len - 1 <= MAX_FOLIOS_POR_VOLUMEN) {
    return { volumen: vol, desde: candidato };
  }
  // No cabe, saltamos a siguiente volumen y empezamos en 1
  const next = incVolumenTag(vol);
  if (!next) return { volumen: vol, desde: candidato }; // no sabemos incrementar, devolvemos tal cual
  return { volumen: next, desde: 1 };
}

// Verifica traslape en un volumen con un rango dado
async function hayTraslape(volumen, rango, excludeId = null) {
  if (!rango) return false;
  const filter = { volumen: volumen };
  if (excludeId) filter._id = { $ne: excludeId };
  const docs = await Escritura.find(filter, {
    folioDesde: 1, folioHasta: 1, folio: 1, folio_inicio: 1, folio_fin: 1
  }).lean();

  for (const d of docs) {
    const r = rangoDe(d);
    if (traslapa(rango, r)) return true;
  }
  return false;
}

// Ajusta automáticamente (rollover) un rango a 1300 por volumen
async function ajustarRangoAuto({ volumen, desde, hasta, excludeId }) {
  if (!volumen || !Number.isFinite(desde) || !Number.isFinite(hasta))
    return { volumen, desde, hasta };

  const len = Math.max(1, hasta - desde + 1);

  // Colocar en el siguiente hueco disponible (respetando 1300)
  const slot = await siguienteSlot(volumen, len, excludeId);
  if (!slot.volumen || !slot.desde) return { volumen, desde, hasta };

  let v = slot.volumen;
  let d = slot.desde;
  let h = d + len - 1;

  if (h > MAX_FOLIOS_POR_VOLUMEN) {
    // Si aun así no cabe, empezamos en 1 del volumen siguiente
    const next = incVolumenTag(v);
    if (next) { v = next; d = 1; h = len; }
  }

  return { volumen: v, desde: d, hasta: h };
}

const upload = multer({
  dest: path.join(__dirname, '../tmp'),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const pick = (obj, keys) =>
  keys.reduce((acc, k) => (obj[k] !== undefined ? (acc[k] = obj[k], acc) : acc), {});

async function nextNumeroControl() {
  const last = await Escritura.findOne({}, { numeroControl: 1 }).sort({ numeroControl: -1 }).lean();
  return (last?.numeroControl || 0) + 1;
}

// Normalizadores de folios
function normVolumen(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null; // volumen puede ser texto (Libro "A", "2024-2", etc.)
}
function normFolio(n) {
  if (n === undefined || n === null || n === '') return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}
function hasRange(volumen, desde, hasta) {
  return volumen && desde != null && hasta != null;
}
function invalidRange(desde, hasta) {
  return !(Number.isFinite(desde) && Number.isFinite(hasta) && desde > 0 && hasta > 0 && desde <= hasta);
}
function overlapQuery(volumen, desde, hasta, excludeId) {
  const q = {
    volumen,
    folioDesde: { $ne: null },
    folioHasta: { $ne: null },
    $expr: {
      // (folioDesde <= hasta) && (folioHasta >= desde)
      $and: [
        { $lte: ['$folioDesde', hasta] },
        { $gte: ['$folioHasta', desde] }
      ]
    }
  };
  if (excludeId) q._id = { $ne: excludeId };
  return q;
}

// ====== Rutas ======





// GET /escrituras/search?q=texto
// Sugerencias (datalist) devolviendo SOLO los números de escritura (strings)
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ data: [] });

    // Búsqueda por prefijo/contiene en numeroControl convirtiéndolo a string,
    // y también por cliente/abogado si hace falta.
    const findFilter = {
      $and: [
        { tipoTramite: { $regex: 'escritura', $options: 'i' } },
        {
          $or: [
            { $expr: { $regexMatch: { input: { $toString: '$numeroControl' }, regex: q, options: 'i' } } },
            { cliente: { $regex: q, $options: 'i' } },
            { abogado: { $regex: q, $options: 'i' } },
          ]
        }
      ]
    };

    const rows = await Escritura.find(findFilter, { numeroControl: 1 })
      .sort({ numeroControl: -1 })
      .limit(50)
      .lean();

    // devolver como array de strings para el datalist
    const list = [...new Set(rows.map(r => String(r.numeroControl)))];
    res.json({ data: list });
  } catch (e) {
    res.status(500).json({ msg: 'Error en búsqueda de escrituras', detalle: e.message });
  }
});



// GET /escrituras
router.get('/', async (req, res) => {
  try {
    const { q, volumen } = req.query || {};
    const filter = {};
    if (q) {
      const n = Number(q);
      const or = [
        { cliente: { $regex: q, $options: 'i' } },
        { tipoTramite: { $regex: q, $options: 'i' } },
        { abogado: { $regex: q, $options: 'i' } },
        { volumen: { $regex: q, $options: 'i' } },
      ];
      if (!Number.isNaN(n)) {
        or.push({ numeroControl: n });
        or.push({ folioDesde: n });
        or.push({ folioHasta: n });
      }
      filter.$or = or;
    }
    if (volumen) filter.volumen = { $regex: String(volumen), $options: 'i' };

    const items = await Escritura
      .find(filter)
      .sort({ fecha: -1, numeroControl: -1 })
      .lean();

    res.json(items);
  } catch (e) {
    res.status(500).json({ mensaje: 'Error listando escrituras', detalle: e.message });
  }
});

// GET /escrituras/export
router.get('/export', async (req, res) => {
  try {
    const { format = 'excel', from, to, cliente, abogado, volumen } = req.query || {};
    const filter = {};
    if (from || to) {
      filter.fecha = {};
      if (from) filter.fecha.$gte = new Date(from);
      if (to) filter.fecha.$lte = new Date(to);
    }
    if (cliente) filter.cliente = { $regex: cliente, $options: 'i' };
    if (abogado) filter.abogado = abogado;
    if (volumen) filter.volumen = { $regex: String(volumen), $options: 'i' };

    const rows = await Escritura.find(filter).sort({numeroControl: 1 }).lean();

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="escrituras.pdf"');
      const doc = new PDFDocument({ margin: 30 });
      doc.pipe(res);
      doc.fontSize(16).text('Reporte de Escrituras', { align: 'center' });
      doc.moveDown();

      rows.forEach((r) => {
        const fecha = r.fecha ? new Date(r.fecha).toLocaleDateString('es-MX') : '—';
        const folioStr = (r.folioDesde != null && r.folioHasta != null) ? `${r.folioDesde} a ${r.folioHasta}` : '—';
        const volStr = r.volumen ?? '—';

        const montos = [
          r.totalImpuestos != null ? `Imp: $${Number(r.totalImpuestos).toFixed(2)}` : null,
          r.valorAvaluo != null ? `Avalúo: $${Number(r.valorAvaluo).toFixed(2)}` : null,
          r.totalGastosExtra != null ? `Extras: $${Number(r.totalGastosExtra).toFixed(2)}` : null,
          r.totalHonorarios != null ? `Honor: $${Number(r.totalHonorarios).toFixed(2)}` : null,
        ].filter(Boolean).join(' · ');

        doc.fontSize(11).text(
          `#${r.numeroControl} | ${fecha} | Folio: ${folioStr} | Vol: ${volStr} | ${r.cliente} | ${r.tipoTramite} | ${r.abogado}`
        );
        if (montos) doc.text(`  ${montos}`);
        doc.moveDown(0.2);
      });
      doc.end();
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Escrituras');
    ws.columns = [
      { header: '# Control', key: 'numeroControl', width: 12 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Cliente', key: 'cliente', width: 32 },
      { header: 'Tipo de trámite', key: 'tipoTramite', width: 28 },
      { header: 'Abogado', key: 'abogado', width: 18 },
      { header: 'Volumen', key: 'volumen', width: 14 },
      { header: 'Folio desde', key: 'folioDesde', width: 14 },
      { header: 'Folio hasta', key: 'folioHasta', width: 14 },
      { header: 'Total impuestos', key: 'totalImpuestos', width: 16 },
      { header: 'Valor avalúo', key: 'valorAvaluo', width: 16 },
      { header: 'Gastos extra', key: 'totalGastosExtra', width: 16 },
      { header: 'Honorarios', key: 'totalHonorarios', width: 16 },
      { header: 'Estatus entrega', key: 'estatus_entrega', width: 16 },
      { header: 'Estatus recibo', key: 'estatus_recibo', width: 16 },
      { header: 'Observaciones', key: 'observaciones', width: 50 },
    ];
    rows.forEach(r => {
      ws.addRow({
        numeroControl: r.numeroControl,
        fecha: r.fecha ? new Date(r.fecha).toISOString().slice(0, 10) : '',
        cliente: r.cliente,
        tipoTramite: r.tipoTramite,
        abogado: r.abogado,
        volumen: r.volumen ?? '',
        folioDesde: r.folioDesde ?? '',
        folioHasta: r.folioHasta ?? '',
        totalImpuestos:  r.totalImpuestos  ?? '',
        valorAvaluo:     r.valorAvaluo     ?? '',
        totalGastosExtra: r.totalGastosExtra ?? '',
        totalHonorarios:  r.totalHonorarios  ?? '',
        estatus_entrega: r.estatus_entrega ?? '',
        estatus_recibo: r.estatus_recibo ?? '',
        observaciones: r.observaciones || ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="escrituras.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ mensaje: 'Error exportando', detalle: e.message });
  }
});

// POST /escrituras/import
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensaje: 'Sube un archivo .xlsx o .csv' });

    const buf = fs.readFileSync(req.file.path);
    const wb = xlsx.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

    let recibidas = rows.length, procesadas = 0, insertadas = 0, actualizadas = 0, errores = [];

    for (const r of rows) {
      try {
        const numeroControl = Number(r.numeroControl || r.control || r['#control'] || r['# Control']);
        const volumen = normVolumen(r.volumen || r.libro || r['Volumen'] || r['Libro']);
        const folioDesde = normFolio(r.folioDesde || r['Folio desde'] || r.folio_inicio || r.folioStart);
        const folioHasta = normFolio(r.folioHasta || r['Folio hasta'] || r.folio_fin || r.folioEnd);

        // Montos desde Excel/CSV (acepta headers alternos)
        const mTotalImpuestos  = numOrNull(r.totalImpuestos  ?? r['Total impuestos']  ?? r.total_impuestos);
        const mValorAvaluo     = numOrNull(r.valorAvaluo     ?? r['Valor avalúo']     ?? r.valor_avaluo);
        const mGastosExtra     = numOrNull(r.totalGastosExtra ?? r['Gastos extra']     ?? r.total_gastos_extra);
        const mHonorarios      = numOrNull(r.totalHonorarios  ?? r['Honorarios']       ?? r.total_honorarios);

        const data = {
          numeroControl,
          tipoTramite: String(r.tipoTramite || r.tipo || r['Tipo de trámite'] || '—'),
          cliente: String(r.cliente || r['Cliente'] || '—'),
          fecha: r.fecha ? new Date(r.fecha) : new Date(),
          abogado: String(r.abogado || r['Abogado'] || '—'),
          observaciones: String(r.observaciones || ''),
          volumen,
          folioDesde,
          folioHasta,
          ...(mTotalImpuestos  !== undefined ? { totalImpuestos: mTotalImpuestos }   : {}),
          ...(mValorAvaluo     !== undefined ? { valorAvaluo: mValorAvaluo }         : {}),
          ...(mGastosExtra     !== undefined ? { totalGastosExtra: mGastosExtra }     : {}),
          ...(mHonorarios      !== undefined ? { totalHonorarios: mHonorarios }       : {}),
        };
        if (!data.numeroControl || !data.tipoTramite || !data.cliente || !data.fecha || !data.abogado) {
          throw new Error('Fila incompleta');
        }
        if (hasRange(data.volumen, data.folioDesde, data.folioHasta) && invalidRange(data.folioDesde, data.folioHasta)) {
          throw new Error('Rango de folio inválido');
        }
        if (hasRange(data.volumen, data.folioDesde, data.folioHasta)) {
          const clash = await Escritura.findOne(overlapQuery(data.volumen, data.folioDesde, data.folioHasta));
          if (clash) throw new Error(`Traslape de folio con #${clash.numeroControl}`);
        }

        const exists = await Escritura.findOne({ numeroControl: data.numeroControl });
        if (exists) {
          await Escritura.updateOne({ _id: exists._id }, { $set: data });
          actualizadas++;
        } else {
          await Escritura.create(data);
          insertadas++;
        }
        procesadas++;
      } catch (err) {
        errores.push({ fila: procesadas + insertadas + actualizadas + 1, error: err.message });
      }
    }

    res.json({ recibidas, procesadas, insertadas, actualizadas, errores });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error importando', detalle: e.message });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch {}
  }
});

// GET /escrituras/folio/next?volumen=V&len=K
router.get('/folio/next', async (req, res) => {
  try {
    const volumen = String(req.query.volumen || '').trim();
    const len = Number(req.query.len || 1);
    if (!volumen) return res.json({ volumen: null, siguienteDesde: null });

    const slot = await siguienteSlot(volumen, len);
    return res.json({
      volumen: slot.volumen,
      siguienteDesde: slot.desde,
      recomendacion: slot.desde ? `${slot.volumen} · ${slot.desde} a ${slot.desde + Math.max(1, len) - 1}` : null
    });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error obteniendo siguiente folio', detalle: e.message });
  }
});

// POST /escrituras
router.post('/', async (req, res) => {
  try {
    // 🔐 Candado: máximo 2 escrituras sin recibo por abogado
    const userName = getUserNameFromReq(req);
    const roles = getUserRolesFromReq(req);
    const isAdmin = roles.includes('ADMIN');

    // Solo aplicamos candado a usuarios que NO son admin
    // (puedes ajustar si quieres aplicarlo también a RECEPCION, etc.)
    if (userName && !isAdmin) {
      const pendientes = await countEscriturasSinReciboPorAbogado(userName);

      if (pendientes >= 2) {
        return res.status(403).json({
          mensaje:
            `No puedes tomar un nuevo número de escritura: ` +
            `ya tienes ${pendientes} escrituras sin recibo o justificante a tu nombre.`,
        });
      }
    }

    const { clienteId } = req.body || {};
    const now = new Date();
    let base = {
      numeroControl: await nextNumeroControl(),
      tipoTramite: 'Por definir',
      cliente: '—',
      fecha: now,
      abogado: '—',
    };

    if (clienteId && Cliente) {
      const cli = await Cliente.findById(clienteId).lean();
      if (cli) {
        base.cliente = cli.nombre || base.cliente;
        base.abogado = cli.abogado || base.abogado;
        base.tipoTramite = cli.motivo || cli.tipoTramite || cli.servicio || cli.accion || base.tipoTramite;
        base.fecha = cli.hora_llegada ? new Date(cli.hora_llegada) : base.fecha;
      }
    }

    // Soporte de volumen/folio directo en POST (opcional)
    const volumen = normVolumen(req.body.volumen);
    const folioDesde = normFolio(req.body.folioDesde);
    const folioHasta = normFolio(req.body.folioHasta);

    if (hasRange(volumen, folioDesde, folioHasta)) {
      if (invalidRange(folioDesde, folioHasta)) {
        return res.status(400).json({ mensaje: 'Rango de folio inválido' });
      }
      const clash = await Escritura.findOne(overlapQuery(volumen, folioDesde, folioHasta));
      if (clash) return res.status(409).json({ mensaje: `Traslape de folio con #${clash.numeroControl}` });
      base.volumen = volumen;
      base.folioDesde = folioDesde;
      base.folioHasta = folioHasta;
    }

    // >>> TESTAMENTO — guardar rango de lectura si aplica (con alias)
    const tipo = String(req.body.tipoTramite ?? base.tipoTramite ?? '').toLowerCase();
    if (tipo.includes('testamento')) {
      const inicioRaw =
        req.body.horaLecturaInicio ??
        req.body.horaLectura ??   // compat viejo
        req.body.horaInicio ??    // alias camel
        req.body.hora_inicio ??   // alias snake
        null;

      const finRaw =
        req.body.horaLecturaFin ??
        req.body.horaFin ??       // alias camel
        req.body.hora_fin ??      // alias snake
        null;

      const inicio = (typeof inicioRaw === 'string') ? inicioRaw.trim() : inicioRaw;
      const fin    = (typeof finRaw === 'string') ? finRaw.trim() : finRaw;

      if (inicio && fin) {
        if (!validRangeHHMM(inicio, fin)) {
          return res.status(400).json({ mensaje: 'Rango de lectura inválido (HH:mm)' });
        }
        base.horaLecturaInicio = inicio;
        base.horaLecturaFin    = fin;
      } else if (inicio && !fin) {
        base.horaLecturaInicio = inicio;
      }
    }
    // <<< TESTAMENTO

    // Montos (acepta camelCase y snake_case)
    const totalImpuestos = numOrNull(req.body.totalImpuestos ?? req.body.total_impuestos);
    const valorAvaluo = numOrNull(req.body.valorAvaluo ?? req.body.valor_avaluo);
    const totalGastosExtra = numOrNull(req.body.totalGastosExtra ?? req.body.total_gastos_extra);
    const totalHonorarios = numOrNull(req.body.totalHonorarios ?? req.body.total_honorarios);

    if (totalImpuestos !== undefined) base.totalImpuestos = totalImpuestos;
    if (valorAvaluo !== undefined) base.valorAvaluo = valorAvaluo;
    if (totalGastosExtra !== undefined) base.totalGastosExtra = totalGastosExtra;
    if (totalHonorarios !== undefined) base.totalHonorarios = totalHonorarios;

    const created = await Escritura.create(base);
    res.status(201).json(created);
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ mensaje: 'El número de control ya existe' });
    res.status(500).json({ mensaje: 'Error creando escritura', detalle: e.message });
  }
});



// GET /escrituras/:id
router.get('/:id', async (req, res) => {
  try {
    const it = await Escritura.findById(req.params.id).lean();
    if (!it) return res.status(404).json({ mensaje: 'No encontrado' });
    res.json(it);
  } catch (e) {
    res.status(500).json({ mensaje: 'Error obteniendo escritura', detalle: e.message });
  }
});

// PUT /escrituras/:id
router.put('/:id', async (req, res) => {
  try {
    const MAX_FOLIOS_POR_VOLUMEN = 300;

    // --- helpers locales ---
    const normVol = (v) => {
      if (v === undefined) return undefined;  // no tocar
      if (v === null) return null;            // limpiar
      const s = String(v).trim();
      return s ? s : null;
    };
    const normFol = (n) => {
      if (n === undefined) return undefined;  // no tocar
      if (n === null || n === '') return null;
      const x = Number(n);
      return Number.isFinite(x) && x > 0 ? x : null;
    };
    const invalidRange = (d, h) => !(Number.isFinite(d) && Number.isFinite(h) && d > 0 && h >= d);
    const toRange = (d, h) => (d && !h ? { d, h: d } : (!d && h ? { d: h, h } : { d, h }));

    const rangoDeDoc = (doc) => {
      const d = Number(doc.folioDesde ?? doc.folio_inicio ?? doc.folioStart ?? doc.folio ?? 0);
      const h = Number(doc.folioHasta ?? doc.folio_fin ?? doc.folioEnd ?? doc.folio ?? 0);
      if (!Number.isFinite(d) || !Number.isFinite(h) || d <= 0 || h <= 0) return null;
      return { d, h };
    };
    const traslapa = (a, b) => a && b && a.d <= b.h && b.d <= a.h;

    const incVolumenTag = (vol) => {
      const s = String(vol ?? '').trim();
      if (!s) return null;
      const m = s.match(/^(.*?)(\d+)\s*$/);
      if (m) return `${m[1]}${Number(m[2]) + 1}`;
      if (/^\d+$/.test(s)) return String(Number(s) + 1);
      return null; // etiqueta sin número
    };

    async function docsDeVol(vol, excludeId) {
      const filter = { volumen: vol };
      if (excludeId) filter._id = { $ne: excludeId };
      return Escritura.find(filter, {
        folioDesde: 1, folioHasta: 1, folio: 1, folio_inicio: 1, folio_fin: 1
      }).lean();
    }
    async function maxFolioUsado(vol, excludeId) {
      const docs = await docsDeVol(vol, excludeId);
      let max = 0;
      for (const d of docs) {
        const r = rangoDeDoc(d);
        if (r) max = Math.max(max, r.h);
      }
      return max;
    }
    async function hayTraslape(vol, rango, excludeId) {
      if (!vol || !rango) return false;
      const docs = await docsDeVol(vol, excludeId);
      for (const d of docs) {
        const r = rangoDeDoc(d);
        if (traslapa(rango, r)) return true;
      }
      return false;
    }
    async function siguienteSlot(vol, len, excludeId) {
      len = Math.max(1, Number(len) || 1);
      if (!vol) return { vol: null, d: null };
      const max = await maxFolioUsado(vol, excludeId);
      const cand = max + 1;
      if (cand + len - 1 <= MAX_FOLIOS_POR_VOLUMEN) return { vol, d: cand };
      const next = incVolumenTag(vol);
      if (!next) return { vol, d: cand };
      return { vol: next, d: 1 };
    }
    async function ajustarRangoAuto({ vol, d, h, excludeId }) {
      if (!vol || !Number.isFinite(d) || !Number.isFinite(h)) return { vol, d, h };
      const len = Math.max(1, h - d + 1);
      const slot = await siguienteSlot(vol, len, excludeId);
      if (!slot.vol || !slot.d) return { vol, d, h };
      let v = slot.vol;
      let desde = slot.d;
      let hasta = desde + len - 1;
      if (hasta > MAX_FOLIOS_POR_VOLUMEN) {
        const next = incVolumenTag(v);
        if (next) { v = next; desde = 1; hasta = len; }
      }
      return { vol: v, d: desde, h: hasta };
    }

    // Normalizadores de campos básicos
    const trimOrNull = (v) => {
      if (v === undefined) return undefined; // no tocar
      if (v === null) return null;           // limpiar explícito
      if (typeof v === 'string') {
        const t = v.trim();
        return t.length ? t : null;          // "" -> null
      }
      return v;
    };
    const toDateOrNull = (v) => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    // --- datos de entrada ---
    const body = req.body || {};
    const base = pick(body, ['numeroControl', 'tipoTramite', 'cliente', 'fecha', 'abogado', 'observaciones']);

    // normalizar strings / fecha
    base.tipoTramite   = trimOrNull(base.tipoTramite);
    base.cliente       = trimOrNull(base.cliente);
    base.abogado       = trimOrNull(base.abogado);
    base.observaciones = base.observaciones === undefined ? undefined : String(base.observaciones || '').trim();
    base.fecha         = toDateOrNull(base.fecha);

    // obtener actual
    const current = await Escritura.findById(req.params.id);
    if (!current) return res.status(404).json({ mensaje: 'No encontrado' });

    // fusionar para validar obligatorios con el valor final
    const merged = {
      numeroControl : base.numeroControl ?? current.numeroControl,
      tipoTramite   : base.tipoTramite   ?? current.tipoTramite,
      cliente       : base.cliente       ?? current.cliente,
      fecha         : base.fecha         ?? current.fecha,
      abogado       : base.abogado       ?? current.abogado,
    };

    if (!merged.numeroControl || !merged.tipoTramite || !merged.cliente || !merged.fecha || !merged.abogado) {
      return res.status(400).json({ mensaje: 'Todos los campos son obligatorios' });
    }

    // validar duplicado de numeroControl si cambió
    if (Number(merged.numeroControl) !== Number(current.numeroControl)) {
      const exists = await Escritura.findOne({ numeroControl: merged.numeroControl }).lean();
      if (exists) return res.status(409).json({ mensaje: 'El número de control ya existe' });
    }

    // === Volumen/Folios ===
    let volumen = normVol(body.volumen);
    let folioDesde = normFol(body.folioDesde);
    let folioHasta = normFol(body.folioHasta);

    const out = { ...base }; // lo que enviaremos a $set

    if (volumen === null && folioDesde === null && folioHasta === null) {
      out.volumen = null;
      out.folioDesde = null;
      out.folioHasta = null;
    } else {
      let effVol   = (volumen !== undefined)    ? volumen    : current.volumen;
      let effDesde = (folioDesde !== undefined) ? folioDesde : current.folioDesde;
      let effHasta = (folioHasta !== undefined) ? folioHasta : current.folioHasta;

      if ((effDesde && !effHasta) || (!effDesde && effHasta)) {
        const r = toRange(effDesde, effHasta);
        effDesde = r.d; effHasta = r.h;
      }

      if (effVol && effDesde && effHasta) {
        if (invalidRange(effDesde, effHasta)) {
          return res.status(400).json({ mensaje: 'Rango de folio inválido' });
        }
        const adj = await ajustarRangoAuto({ vol: effVol, d: effDesde, h: effHasta, excludeId: current._id });
        effVol = adj.vol; effDesde = adj.d; effHasta = adj.h;

        const choque = await hayTraslape(effVol, { d: effDesde, h: effHasta }, current._id);
        if (choque) {
          const len = effHasta - effDesde + 1;
          const slot = await siguienteSlot(effVol, len, current._id);
          if (slot.vol && slot.d) {
            effVol = slot.vol;
            effDesde = slot.d;
            effHasta = slot.d + len - 1;
            if (effHasta > MAX_FOLIOS_POR_VOLUMEN) {
              const nv = incVolumenTag(effVol);
              if (!nv) {
                return res.status(409).json({ mensaje: 'Traslape de folio y no es posible incrementar el volumen automáticamente' });
              }
              effVol = nv; effDesde = 1; effHasta = len;
            }
          } else {
            return res.status(409).json({ mensaje: 'Traslape de folio en este volumen' });
          }
        }

        out.volumen = effVol;
        out.folioDesde = effDesde;
        out.folioHasta = effHasta;
      } // si enviaron solo parte, no tocamos hasta que sea consistente
    }
    // === FIN Volumen/Folios ===

    // === Horas Testamento ===
    const isTestamento = /testamento/i.test((merged.tipoTramite || '').toString());
    if (isTestamento) {
      // considerar todos los alias que puede enviar el frontend
      const inicioRaw =
        body.horaLecturaInicio ??
        body.horaLectura ??     // compat viejo
        body.horaInicio ??      // alias camel
        body.hora_inicio ??     // alias snake
        null;

      const finRaw =
        body.horaLecturaFin ??
        body.horaFin ??         // alias camel
        body.hora_fin ??        // alias snake
        null;

      // tocar horas sólo si llegó al menos uno de los campos
      const touchedHours =
        ('horaLecturaInicio' in body) || ('horaLecturaFin' in body) || ('horaLectura' in body) ||
        ('horaInicio' in body) || ('horaFin' in body) || ('hora_inicio' in body) || ('hora_fin' in body);

      if (touchedHours) {
        let ini = (typeof inicioRaw === 'string') ? inicioRaw.trim() : inicioRaw;
        let fin = (typeof finRaw === 'string') ? finRaw.trim() : finRaw;

        if (ini === '') ini = null;
        if (fin === '') fin = null;

        if (ini && fin) {
          const okHHMM = (s) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(s));
          const toMin = (s) => { const [h, m] = String(s).split(':'); return (+h) * 60 + (+m); };
          if (!okHHMM(ini) || !okHHMM(fin) || !(toMin(ini) < toMin(fin))) {
            return res.status(400).json({ mensaje: 'Rango de lectura inválido (HH:mm)' });
          }
        }

        // asignar (permitimos inicio solo, o ambos)
        out.horaLecturaInicio = ini ?? null;
        out.horaLecturaFin    = fin ?? null;
      }
    } else {
      // si dejó de ser testamento y llegaron campos de hora, limpiarlos
      if (('horaLecturaInicio' in body) || ('horaLecturaFin' in body) || ('horaLectura' in body) ||
          ('horaInicio' in body) || ('horaFin' in body) || ('hora_inicio' in body) || ('hora_fin' in body)) {
        out.horaLecturaInicio = null;
        out.horaLecturaFin = null;
      }
    }
    // === FIN Horas Testamento ===

    // === Montos ===
    const touchedMontos =
      ('totalImpuestos' in body) || ('total_impuestos' in body) ||
      ('valorAvaluo' in body) || ('valor_avaluo' in body) ||
      ('totalGastosExtra' in body) || ('total_gastos_extra' in body) ||
      ('totalHonorarios' in body) || ('total_honorarios' in body);

    if (touchedMontos) {
      const mTotalImpuestos  = numOrNull(body.totalImpuestos  ?? body.total_impuestos);
      const mValorAvaluo     = numOrNull(body.valorAvaluo     ?? body.valor_avaluo);
      const mGastosExtra     = numOrNull(body.totalGastosExtra ?? body.total_gastos_extra);
      const mHonorarios      = numOrNull(body.totalHonorarios  ?? body.total_honorarios);

      out.totalImpuestos   = mTotalImpuestos;
      out.valorAvaluo      = mValorAvaluo;
      out.totalGastosExtra = mGastosExtra;
      out.totalHonorarios  = mHonorarios;
    }

    // aplicar cambios: construir $set final con merged + out
    await Escritura.updateOne(
      { _id: req.params.id },
      {
        $set: {
          numeroControl: merged.numeroControl,
          tipoTramite  : merged.tipoTramite,
          cliente      : merged.cliente,
          fecha        : merged.fecha,
          abogado      : merged.abogado,
          ...(out.observaciones !== undefined ? { observaciones: out.observaciones } : {}),
          ...(out.volumen     !== undefined ? { volumen: out.volumen } : {}),
          ...(out.folioDesde  !== undefined ? { folioDesde: out.folioDesde } : {}),
          ...(out.folioHasta  !== undefined ? { folioHasta: out.folioHasta } : {}),
          ...(out.horaLecturaInicio !== undefined ? { horaLecturaInicio: out.horaLecturaInicio } : {}),
          ...(out.horaLecturaFin    !== undefined ? { horaLecturaFin: out.horaLecturaFin } : {}),
          ...(out.totalImpuestos   !== undefined ? { totalImpuestos: out.totalImpuestos } : {}),
          ...(out.valorAvaluo      !== undefined ? { valorAvaluo: out.valorAvaluo } : {}),
          ...(out.totalGastosExtra !== undefined ? { totalGastosExtra: out.totalGastosExtra } : {}),
          ...(out.totalHonorarios  !== undefined ? { totalHonorarios: out.totalHonorarios } : {}),
        }
      }
    );

    const updated = await Escritura.findById(req.params.id).lean();
    return res.json(updated);
  } catch (e) {
    return res.status(500).json({ mensaje: 'Error actualizando escritura', detalle: e.message });
  }
});

// DELETE /escrituras/:id
router.delete('/:id', async (req, res) => {
  try {
    const it = await Escritura.findById(req.params.id);
    if (!it) return res.status(404).json({ mensaje: 'No encontrado' });
    await Escritura.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error eliminando escritura', detalle: e.message });
  }
});

// GET /escrituras/:id/entrega-info
router.get('/:id/entrega-info', async (req, res) => {
  try {
    const it = await Escritura.findById(req.params.id).lean();
    if (!it) return res.status(404).json({ mensaje: 'No encontrado' });

    let telefono = '—';
    if (Cliente) {
      const c = await Cliente.findOne({ nombre: it.cliente }).lean();
      if (c?.telefono) telefono = c.telefono;
    }
    res.json({ telefono });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error obteniendo info de entrega', detalle: e.message });
  }
});

// POST /escrituras/:id/entregar
router.post('/:id/entregar', async (req, res) => {
  try {
    const { telefono, notas } = req.body || {};
    const it = await Escritura.findById(req.params.id);
    if (!it) return res.status(404).json({ mensaje: 'No encontrado' });

    await Escritura.updateOne(
      { _id: it._id },
      {
        $set: {
          estatus_entrega: 'Entregado',
          observaciones: notas ? `${it.observaciones || ''}\n[ENTREGA] ${new Date().toISOString()}: ${notas}`.trim() : it.observaciones
        }
      }
    );
    res.json({ ok: true, mensaje: 'Marcado como entregado' });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error marcando como entregado', detalle: e.message });
  }
});

// POST /escrituras/:id/justificante
router.post('/:id/justificante', async (req, res) => {
  try {
    const { motivo } = req.body || {};
    if (!motivo || !motivo.trim()) return res.status(400).json({ mensaje: 'Motivo requerido' });

    const userName =
      req.user?.nombre || req.user?.name || req.user?.fullName || req.user?.username || 'sistema';

    const it = await Escritura.findById(req.params.id);
    if (!it) return res.status(404).json({ mensaje: 'No encontrado' });

    await Escritura.updateOne(
      { _id: it._id },
      {
        $set: {
          estatus_recibo: 'JUSTIFICADO',
          justificante_text: motivo.trim(),
          justificante_by: userName,
          justificante_at: new Date()
        }
      }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error guardando justificante', detalle: e.message });
  }
});

// GET /escrituras/testamento/check
// Compatibilidad:
//  - Legacy: ?fecha=YYYY-MM-DD&hora=HH:mm  -> busca coincidencia exacta en horaLecturaInicio o campo antiguo horaLectura
//  - Nuevo:  ?fecha=YYYY-MM-DD&inicio=HH:mm&fin=HH:mm -> verifica que NO traslape con rangos existentes
router.get('/testamento/check', async (req, res) => {
  try {
    const { fecha, hora, inicio, fin, excludeId } = req.query || {};
    if (!fecha) return res.status(400).json({ mensaje: 'fecha requerida' });

    const dayStart = new Date(`${fecha}T00:00:00.000Z`);
    const dayEnd = new Date(`${fecha}T23:59:59.999Z`);

    // traer todos los testamentos del día (solo campos necesarios)
    const filterBase = {
      fecha: { $gte: dayStart, $lte: dayEnd },
      tipoTramite: { $regex: 'testamento', $options: 'i' },
    };
    if (excludeId) filterBase._id = { $ne: excludeId };

    const docs = await Escritura.find(filterBase, {
      horaLecturaInicio: 1,
      horaLecturaFin: 1,
      horaLectura: 1
    }).lean();

    // Modo nuevo (rango)
    if (inicio && fin) {
      if (!validRangeHHMM(inicio, fin)) {
        return res.status(400).json({ mensaje: 'Rango inválido (HH:mm)' });
      }
      const a = toMinutes(inicio);
      const b = toMinutes(fin);
      for (const d of docs) {
        const di = d.horaLecturaInicio || d.horaLectura || null;
        const df = d.horaLecturaFin || null;
        if (!di) continue;
        const c = toMinutes(di);
        const dmin = df ? toMinutes(df) : (c + 1); // si no hay fin, trátalo como punto
        if (c != null && dmin != null && overlapped(a, b, c, dmin)) {
          return res.json({ available: false });
        }
      }
      return res.json({ available: true });
    }

    // Modo legacy (hora puntual)
    if (!hora) return res.status(400).json({ mensaje: 'hora o inicio/fin requeridos' });
    if (!parseHHMM(hora)) return res.status(400).json({ mensaje: 'hora inválida (HH:mm)' });

    const clash = docs.find(d =>
      d.horaLectura === hora ||
      d.horaLecturaInicio === hora
    );
    return res.json({ available: !clash });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error verificando horario', detalle: e.message });
  }
});

module.exports = router;
