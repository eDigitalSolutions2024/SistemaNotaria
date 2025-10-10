// routes/recibos.js
const express = require('express');
const router = express.Router();
// routes/recibos.js (arriba de todo con tus otros imports)
const Abogado = require('../models/Abogado'); // 👈 usa tu path real
const Recibo = require('../models/Recibo');
const Protocolito = require('../models/Protocolito');
const { buildReciboPDF } = require('../utils/pdfRecibo');
const XLSX = require('xlsx');

/* ----------------------------- Helpers ----------------------------- */
function escapeRegex(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Construye el filtro para Recibo desde query params */
function buildFilter(query = {}) {
  const { q, desde, hasta, abogados, abogadoQ } = query;
  const filter = {};

  // Rango de fechas (inclusive)
  if (desde || hasta) {
    filter.fecha = {};
    if (desde) filter.fecha.$gte = new Date(`${desde}T00:00:00.000Z`);
    if (hasta) filter.fecha.$lte = new Date(`${hasta}T23:59:59.999Z`);
  }

  // Búsqueda general
  if (q && String(q).trim()) {
    const rx = new RegExp(escapeRegex(String(q).trim()), 'i');
    filter.$or = [
      { recibiDe: rx },
      { concepto: rx },
      { abogado: rx },
      { tipoTramite: rx },
      { control: rx },
    ];
  }

  // Lista exacta de abogados (CSV)
  if (abogados) {
    const list = String(abogados)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (list.length) {
      filter.abogado = { $in: list };
    }
  }

  // Texto parcial por abogado (solo si no se aplicó $in)
  if (abogadoQ && !filter.abogado) {
    const rx = new RegExp(escapeRegex(String(abogadoQ).trim()), 'i');
    filter.abogado = rx;
  }

  return filter;
}

/** Mapea recibo para Excel/listado */
function mapToExcelRow(r) {
  return {
    NoRecibo: (r._id ? String(r._id).slice(-4).toUpperCase() : (r.numeroRecibo || '')),
    Fecha: r.fecha ? new Date(r.fecha).toISOString().slice(0, 10) : '',
    Cliente: r.recibiDe || '',
    Concepto: r.concepto || '',
    Total:
      r.total != null
        ? Number(r.total)
        : (r.totalPagado != null ? Number(r.totalPagado) : 0),
    Abogado: r.abogado || '',
  };
}

/* -------------------------- Protocolitos API -------------------------- */
/**
 * GET /api/recibos/protocolitos/numeros
 * Devuelve [{ numeroTramite, cliente, abogado, fecha, ... }, ...]
 */
router.get('/protocolitos/numeros', async (_req, res) => {
  try {
    const rows = await Protocolito.find({})
      .select('numeroTramite cliente abogado fecha tipoTramite motivo servicio accion -_id')
      .sort({ numeroTramite: -1 })
      .lean();
    return res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('LIST NUMEROS ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error listando protocolitos' });
  }
});

/**
 * GET /api/recibos/protocolitos/:numero
 * Devuelve el protocolito por numeroTramite
 */
router.get('/protocolitos/:numero', async (req, res) => {
  try {
    const numero = Number(req.params.numero);
    if (!Number.isFinite(numero)) {
      return res.status(400).json({ ok: false, msg: 'Número inválido' });
    }
    const row = await Protocolito.findOne({ numeroTramite: numero })
      .select('numeroTramite cliente abogado fecha tipoTramite motivo servicio accion')
      .lean();

    if (!row) return res.status(404).json({ ok: false, msg: 'No encontrado' });
    return res.json({ ok: true, data: row });
  } catch (e) {
    console.error('GET PROTOCOLITO ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error obteniendo protocolito' });
  }
});

/* ----------------------------- Recibos API ---------------------------- */
/**
 * POST /api/recibos
 * Crear un recibo nuevo
 */
// Reemplaza tu handler POST actual por este bloque (o añade la parte de abogadoId):
router.post('/', async (req, res) => {
  try {
    const {
      fecha,
      tipoTramite,
      recibiDe,
      abogado,        // fallback por si quieren escribir el nombre manual
      abogadoId,      // 👈 NUEVO: numérico (id del modelo Abogado)
      concepto,
      control,
      totalTramite,
      totalPagado,
      restante,
      totalImpuestos = 0,
      valorAvaluo = 0,
      totalGastosExtra = 0,
      totalHonorarios = 0,
      creadoPor,
    } = req.body || {};

    if (!fecha || !tipoTramite || !recibiDe) {
      return res.status(400).json({ ok: false, msg: 'Faltan campos obligatorios' });
    }

    // Resolver nombre desde abogadoId si viene
    let abogadoNombre = abogado || '';
    let abogadoRef = undefined;

    if (abogadoId !== undefined && abogadoId !== null && String(abogadoId).trim() !== '') {
      // como tu _id es Number, lo casteamos
      const numId = Number(abogadoId);
      if (Number.isFinite(numId)) {
        const a = await Abogado.findById(numId).lean();
        if (a) {
          abogadoNombre = a.nombre || abogadoNombre;
          abogadoRef = a._id; // Number
        }
      }
    }

    const payload = {
      fecha,
      tipoTramite,
      recibiDe,
      abogado: abogadoNombre,   // guardamos SIEMPRE el nombre visible
      concepto: concepto || '',
      control: control || null,
      totalTramite: Number(totalTramite || 0),
      totalPagado: Number(totalPagado || 0),
      restante: Number(restante || 0),
      totalImpuestos: Number(totalImpuestos || 0),
      valorAvaluo: Number(valorAvaluo || 0),
      totalGastosExtra: Number(totalGastosExtra || 0),
      totalHonorarios: Number(totalHonorarios || 0),
      creadoPor: creadoPor || undefined,
    };

    // (Opcional) si tu schema de Recibo tiene este campo:
    // en tu ReciboSchema agrega: abogadoId: { type: Number, required: false }
    if (abogadoRef !== undefined) {
      payload.abogadoId = abogadoRef;
    }

    const doc = await Recibo.create(payload);

    return res.json({
      ok: true,
      data: { _id: doc._id },
      pdfUrl: `/recibos/${doc._id}/pdf`,
    });
  } catch (e) {
    console.error('CREATE RECIBO ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error creando recibo' });
  }
});


/**
 * GET /api/recibos/by-control/:control/latest
 * Devuelve el último recibo cuyo "control" == :control
 */
router.get('/by-control/:control/latest', async (req, res) => {
  try {
    const controlRaw = req.params.control;
    let rec = await Recibo.findOne({ control: String(controlRaw) })
      .sort({ createdAt: -1 })
      .lean();

    if (!rec) {
      const n = Number(controlRaw);
      if (Number.isFinite(n)) {
        rec = await Recibo.findOne({ control: String(n) })
          .sort({ createdAt: -1 })
          .lean();
      }
    }

    if (!rec) return res.status(404).json({ ok: false, msg: 'No encontrado' });

    return res.json({ ok: true, id: rec._id, data: rec });
  } catch (e) {
    console.error('RECIBO by-control ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error buscando recibo' });
  }
});

/**
 * GET /api/recibos/:id/pdf
 * Genera y responde el PDF del recibo indicado
 */
router.get('/:id/pdf', async (req, res) => {
  try {
    const rec = await Recibo.findById(req.params.id).lean();
    if (!rec) return res.status(404).json({ ok: false, msg: 'Recibo no encontrado' });

    buildReciboPDF(res, rec); // stream del PDF
  } catch (e) {
    console.error('RECIBO PDF ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error generando PDF' });
  }
});

/**
 * GET /api/recibos
 * q, desde, hasta, abogados (CSV), abogadoQ
 * page, limit
 */
router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const skip  = (page - 1) * limit;

    const filter = buildFilter(req.query);
    const sort = { fecha: -1, _id: -1 };

    const [list, total] = await Promise.all([
      Recibo.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Recibo.countDocuments(filter),
    ]);

    const items = list.map(r => ({
      ...r,
      numeroRecibo: String(r?._id || '').slice(-4).toUpperCase(),
    }));

    return res.json({ ok: true, total, page, limit, items });
  } catch (e) {
    console.error('LISTAR RECIBOS ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error listando recibos' });
  }
});

/**
 * GET /api/recibos/export
 * q, desde, hasta, abogados (CSV), abogadoQ
 * Devuelve .xlsx en memoria
 */
router.get('/export', async (req, res) => {
  try {
    const filter = buildFilter(req.query);

    const docs = await Recibo.find(filter).sort({ abogado: 1, fecha: -1, _id: -1 }).lean();
    const rows = docs.map(mapToExcelRow);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Recibos');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');

    res.setHeader('Content-Disposition', `attachment; filename="recibos_${y}-${m}-${d}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  } catch (err) {
    console.error('EXPORT RECIBOS ERROR:', err);
    res.status(500).json({ ok: false, msg: 'No se pudo generar el Excel.' });
  }
});


// GET /api/recibos/abogados
router.get('/abogados', async (_req, res) => {
  try {
    // Filtra por roles válidos (en mayúsculas) y, opcional, solo disponibles
    const rows = await Abogado.find({
      role: { $in: ['ABOGADO', 'ASISTENTE'] },
      // disponible: true, // <- si quieres limitar a los disponibles
    })
      .select('_id nombre role disponible orden ubicacion')
      .sort({ nombre: 1, orden: 1 })
      .lean();

    const data = rows.map(a => ({
      id: a._id,              // <- es Number (tu schema)
      nombre: a.nombre,
      role: a.role,
      disponible: a.disponible,
      ubicacion: a.ubicacion ?? 'sin sala',
    }));

    res.json({ ok: true, data });
  } catch (e) {
    console.error('CATALOGO ABOGADOS ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo catálogo de abogados' });
  }
});


module.exports = router;
