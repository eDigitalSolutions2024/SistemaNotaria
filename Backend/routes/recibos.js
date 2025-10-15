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



function buildFilter(query = {}) {
  const { q, desde, hasta, abogados, abogadoQ, estatus } = query;
  const filter = {};

  // Estatus (por defecto: Activo); usa 'Todos' para no filtrar
  if (estatus === 'Cancelado') filter.estatus = 'Cancelado';
  else if (!estatus || estatus === 'Activo') filter.estatus = 'Activo';

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
    const list = String(abogados).split(',').map(s => s.trim()).filter(Boolean);
    if (list.length) filter.abogado = { $in: list };
  }

  // Texto parcial abogado (si no hay $in)
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
    Estatus: r.estatus || 'Activo', 
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
// POST /api/recibos
router.post('/', async (req, res) => {
  try {
    let {
      fecha,
      tipoTramite,
      recibiDe,
      abogado,             // fallback si escriben manual
      abogadoId,           // id numérico del modelo Abogado
      concepto,
      control,
      totalTramite,
      totalPagado,         // en Escritura: viene = abono (si lo mandas así desde el front)
      abono,               // 👈 NUEVO: explícito
      totalImpuestos = 0,
      valorAvaluo = 0,
      totalGastosExtra = 0,
      totalHonorarios = 0,
      creadoPor,
    } = req.body || {};

    if (!fecha || !tipoTramite || !recibiDe) {
      return res.status(400).json({ ok: false, msg: 'Faltan campos obligatorios' });
    }

    // normaliza números
    totalTramite   = Number(totalTramite || 0);
    totalPagado    = Number(totalPagado  || 0);
    abono          = Number(abono        || 0);
    totalImpuestos = Number(totalImpuestos || 0);
    valorAvaluo    = Number(valorAvaluo    || 0);
    totalGastosExtra = Number(totalGastosExtra || 0);
    totalHonorarios  = Number(totalHonorarios  || 0);

    // resolver nombre desde abogadoId (si llega)
    let abogadoNombre = abogado || '';
    if (abogadoId !== undefined && abogadoId !== null && String(abogadoId).trim() !== '') {
      const numId = Number(abogadoId);
      if (Number.isFinite(numId)) {
        const a = await Abogado.findById(numId).lean();
        if (a) abogadoNombre = a.nombre || abogadoNombre;
      }
    }

    // --- VALIDACIÓN Y CÁLCULO ---
    let restante = 0;

    if (tipoTramite === 'Escritura') {
      if (!control) {
        return res.status(400).json({ ok: false, msg: 'Número de Escritura (control) requerido' });
      }

      // Suma histórica (excluye cancelados)
      const agg = await Recibo.aggregate([
        { $match: { tipoTramite: 'Escritura', control: String(control), estatus: { $ne: 'Cancelado' } } },
        { $group: { _id: null, sum: { $sum: '$totalPagado' } } }
      ]);
      const pagadoAcum = Number(agg?.[0]?.sum || 0);
      const maxAbono   = Math.max(0, totalTramite - pagadoAcum);

      // compatibilidad: si no viene "abono", usa totalPagado como abono
      if (abono <= 0 && totalPagado > 0) abono = totalPagado;

      if (abono <= 0) {
        return res.status(400).json({ ok: false, msg: 'Abono debe ser mayor a 0' });
      }
      if (abono > maxAbono) {
        return res.status(400).json({ ok: false, msg: `Abono excede el restante ($${maxAbono.toFixed(2)})` });
      }

      // Lo que este recibo suma al histórico es su abono
      totalPagado = abono;
      restante = Math.max(0, totalTramite - (pagadoAcum + abono));
    } else {
      // Otros tipos: no puede pagar más que el total del trámite
      if (totalPagado > totalTramite) {
        return res.status(400).json({ ok: false, msg: 'No puedes pagar más que el total del trámite' });
      }
      abono = 0; // solo usamos abono en Escritura
      restante = Math.max(0, totalTramite - totalPagado);
    }

    const payload = {
      fecha,
      tipoTramite,
      recibiDe,
      abogado: abogadoNombre,
      concepto: concepto || '',
      control: control || null,
      totalTramite,
      totalPagado,   // en Escritura: es el abono del recibo
      abono,         // 👈 guarda explícito
      restante,
      totalImpuestos,
      valorAvaluo,
      totalGastosExtra,
      totalHonorarios,
      creadoPor: creadoPor || undefined,
    };

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


// PATCH /recibos/:id/cancel
// body: { motivo: string }
// ✅ Después
router.patch('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ ok: false, msg: 'Motivo requerido' });
    }

    const update = {
      estatus: 'Cancelado',
      cancelacion: {
        motivo: motivo.trim(),
        fecha: new Date(),
        usuarioId: req.user?.id || undefined,       // si tienes auth
        usuarioNombre: req.user?.nombre || undefined
      }
    };

    const doc = await Recibo.findByIdAndUpdate(id, update, { new: true });
    if (!doc) return res.status(404).json({ ok: false, msg: 'No encontrado' });

    res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('CANCEL RECIBO ERROR:', e);
    res.status(500).json({ ok: false, msg: 'No se pudo cancelar el recibo' });
  }
});



// routes/recibos.js  (agrega esto abajo de tus otros endpoints)
// GET /api/recibos/escrituras/:numero/pending
router.get('/escrituras/:numero/pending', async (req, res) => {
  try {
    const numero = String(req.params.numero || '').trim();
    if (!numero) return res.status(400).json({ ok: false, msg: 'Número de Escritura requerido' });

    const pipeline = [
      { $match: {
        tipoTramite: 'Escritura',
        control: numero,
        estatus: { $ne: 'Cancelado' }    // ignorar cancelados
      }},
      { $sort: { createdAt: -1, _id: -1 } }, // último primero
      {
        $group: {
          _id: '$control',
          totalBase:  { $max: '$totalTramite' }, // base más alta registrada
          pagadoAcum: { $sum: '$totalPagado' },  // suma de pagos
          count:      { $sum: 1 },
          last:       { $first: '$$ROOT' }       // el más reciente (referencia visual)
        }
      },
      {
        $project: {
          _id: 0,
          control:      '$_id',
          totalTramite: '$totalBase',
          pagadoAcum:   1,
          restante:     { $max: [{ $subtract: ['$totalBase', '$pagadoAcum'] }, 0] },
          count:        1,
          // ⬇️ manda también los “de sistema” desde el último recibo
          last: {
            _id:              '$last._id',
            fecha:            '$last.fecha',
            recibiDe:         '$last.recibiDe',
            abogado:          '$last.abogado',
            concepto:         '$last.concepto',
            totalTramite:     '$last.totalTramite',
            totalPagado:      '$last.totalPagado',
            restante:         '$last.restante',
            totalImpuestos:   '$last.totalImpuestos',
            valorAvaluo:      '$last.valorAvaluo',
            totalGastosExtra: '$last.totalGastosExtra',
            totalHonorarios:  '$last.totalHonorarios'
          }
        }
      }
    ];

    const [row] = await Recibo.aggregate(pipeline);
    if (!row) {
      return res.json({ ok: true, data: null, msg: 'No hay recibos para ese Número de Escritura (o todos están cancelados).' });
    }

    const liquidado = Number(row.restante || 0) <= 0;

    return res.json({
      ok: true,
      data: {
        control:      row.control,
        totalTramite: row.totalTramite,
        pagadoAcum:   row.pagadoAcum,
        restante:     row.restante,
        count:        row.count,
        liquidado,
        last:         row.last
      }
    });
  } catch (e) {
    console.error('PENDING ESCRITURA ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error calculando pendiente de Escritura' });
  }
});



// GET /api/recibos/escrituras/search?q=2024/
router.get('/escrituras/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const rx = q ? new RegExp(escapeRegex(q), 'i') : null;
  const filter = { tipoTramite: 'Escritura' };
  if (rx) filter.control = rx;
  const rows = await Recibo.find(filter)
    .distinct('control'); // solo lista controles
  res.json({ ok: true, data: rows.slice(0, 20) });
});

// GET /api/recibos/escrituras/:numero/history
router.get('/escrituras/:numero/history', async (req, res) => {
  try {
    const numero = String(req.params.numero || '').trim();
    if (!numero) return res.status(400).json({ ok: false, msg: 'Número de Escritura requerido' });

    const filter = {
      tipoTramite: 'Escritura',
      control: numero,
      estatus: { $ne: 'Cancelado' }
    };

    const items = await Recibo.find(filter).sort({ fecha: 1, _id: 1 }).lean();

    const totalTramiteBase = items.reduce((acc, r) => Math.max(acc, Number(r.totalTramite || 0)), 0);
    const pagadoAcum = items.reduce((acc, r) => acc + Number(r.totalPagado || 0), 0);
    const restante = Math.max(0, totalTramiteBase - pagadoAcum);

    const rows = items.map(r => ({
      _id: r._id,
      numeroRecibo: String(r._id).slice(-4).toUpperCase(),
      fecha: r.fecha,
      recibiDe: r.recibiDe,
      abogado: r.abogado,
      concepto: r.concepto,
      totalTramite: Number(r.totalTramite || 0),
      totalPagado: Number(r.totalPagado || 0),
      estatus: r.estatus || 'Activo',
      pdfUrl: `/recibos/${r._id}/pdf`,
    }));

    res.json({
      ok: true,
      data: { control: numero, totalTramiteBase, pagadoAcum, restante, items: rows }
    });
  } catch (e) {
    console.error('ESCRITURA HISTORY ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo historial' });
  }
});



module.exports = router;
