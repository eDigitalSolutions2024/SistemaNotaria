// routes/recibos.js
const express = require('express');
const router = express.Router();

const Abogado = require('../models/Abogado');
const Recibo = require('../models/Recibo');
const ReciboLink = require('../models/ReciboLink');
const Protocolito = require('../models/Protocolito');
const Escritura = require('../models/Escritura');
const Presupuesto = require('../models/Presupuesto');

const { buildReciboPDF } = require('../utils/pdfRecibo');
const XLSX = require('xlsx');

// Si la Escritura tiene presupuesto ligado, el total del trámite lo manda
// el presupuesto (Presupuesto.totalPresupuesto, fuente viva) — no lo que
// algún recibo anterior haya tecleado ni una copia cacheada en la Escritura,
// que puede quedar desactualizada si el presupuesto se edita después.
async function montoPresupuestoDeEscritura(numeroControl) {
  const escritura = await Escritura.findOne({ numeroControl })
    .select('presupuestoId')
    .lean();
  if (!escritura?.presupuestoId) return null;

  const presupuesto = await Presupuesto.findById(escritura.presupuestoId)
    .select('totalPresupuesto')
    .lean();
  if (!presupuesto) return null;

  return Number(presupuesto.totalPresupuesto || 0);
}

// Un recibo puede "pertenecer" a un #Trámite (Escritura o Protocolito) de
// dos formas: directo (Recibo.control === numero) o vinculado después vía
// ReciboLink (p.ej. un recibo creado para otro #trámite que también se
// adjuntó a este). El historial/pendiente de un trámite debe contar ambos,
// sin duplicar.
async function recibosDeTramite(numeroControl) {
  const links = await ReciboLink.find({ control: numeroControl }).lean();
  const linkedIds = links.map((l) => l.reciboId);

  const recibos = await Recibo.find({
    estatus: { $ne: 'Cancelado' },
    $or: [
      { control: numeroControl },
      ...(linkedIds.length ? [{ _id: { $in: linkedIds } }] : []),
    ],
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  return recibos;
}

/* ----------------------------- Helpers ----------------------------- */
function escapeRegex(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Helpers de usuario / roles ---
function getUserRolesFromReq(req) {
  const u = req.user || {};
  const roles = [];
  if (Array.isArray(u.roles)) roles.push(...u.roles);
  if (u.rol) roles.push(u.rol);
  if (u.role) roles.push(u.role);
  return roles.map(r => String(r).toUpperCase());
}

// quienes pueden CREAR / CANCELAR / VINCULAR recibos
function canModifyRecibos(req) {
  const roles = getUserRolesFromReq(req);
  return roles.some(r => ['ADMIN', 'RECEPCION'].includes(r));
}

// quienes pueden VER recibos y catálogos relacionados
function canViewRecibos(req) {
  const roles = getUserRolesFromReq(req);
  // admin, caja, recepción, abogado, asistente
  return roles.some(r =>
    ['ADMIN', 'RECEPCION'].includes(r)
  );
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
      // ✅ control como número exacto si q es num
  ...(Number.isFinite(Number(q)) ? [{ control: Number(q) }] : []),

  // ✅ control como string usando $expr + $toString
  {
    $expr: {
      $regexMatch: {
        input: { $toString: "$control" },
        regex: String(q).trim(),
        options: "i",
      }
    }
  }
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

// 🔐 Candado general: solo ciertos roles pueden VER recibos
/*router.use((req, res, next) => {
  if (!canViewRecibos(req)) {
    return res.status(403).json({ ok: false, msg: 'No tienes permiso para ver recibos' });
  }
  next();
});*/

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

// GET /api/recibos/protocolitos/:numero/pending
// Protocolito no tiene presupuesto: el total del trámite sale de lo que ya
// se haya tecleado en recibos anteriores (directos o vinculados).
router.get('/protocolitos/:numero/pending', async (req, res) => {
  try {
    const numero = Number(req.params.numero);
    if (!Number.isFinite(numero)) {
      return res.status(400).json({ ok: false, msg: 'Número de Protocolito inválido' });
    }

    const items = await recibosDeTramite(numero);

    if (!items.length) {
      return res.json({
        ok: true,
        data: null,
        msg: 'No hay recibos para ese Número de Protocolito (o todos están cancelados).'
      });
    }

    const totalTramite = items.reduce((acc, r) => Math.max(acc, Number(r.totalTramite || 0)), 0);
    const pagadoAcum = items.reduce((acc, r) => acc + Number(r.totalPagado || 0), 0);
    const restante = Math.max(0, totalTramite - pagadoAcum);

    return res.json({
      ok: true,
      data: {
        control: numero,
        totalTramite,
        pagadoAcum,
        restante,
        count: items.length,
        liquidado: restante <= 0,
        last: items[0],
      }
    });
  } catch (e) {
    console.error('PENDING PROTOCOLITO ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error calculando pendiente de Protocolito' });
  }
});

// GET /api/recibos/protocolitos/:numero/history
router.get('/protocolitos/:numero/history', async (req, res) => {
  try {
    const numero = Number(req.params.numero);
    if (!Number.isFinite(numero)) {
      return res.status(400).json({ ok: false, msg: 'Número de Protocolito inválido' });
    }

    const items = (await recibosDeTramite(numero)).sort(
      (a, b) => new Date(a.fecha) - new Date(b.fecha) || String(a._id).localeCompare(String(b._id))
    );

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
      total: Number((r.total ?? r.totalPagado) || 0),
      estatus: r.estatus || 'Activo',
      pdfUrl: `/recibos/${r._id}/pdf`,
      vinculado: Number(r.control) !== numero,
    }));

    res.json({
      ok: true,
      data: { control: numero, totalTramiteBase, pagadoAcum, restante, items: rows }
    });
  } catch (e) {
    console.error('PROTOCOLITO HISTORY ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo historial de Protocolito' });
  }
});

/* --------------------- Escrituras relacionadas --------------------- */

// GET /api/recibos/escrituras/numeros
// Devuelve lista para el <select> del front:
// [{ numeroControl, cliente, abogado, tipoTramite, fecha }]
router.get('/escrituras/numeros', async (req, res) => {
  try {
    const { only } = req.query;
    const filter = {};
    if (String(only || '').toLowerCase() === 'escritura') {
      filter.tipoTramite = { $regex: 'escritura', $options: 'i' };
    }

    const rows = await Escritura.find(filter)
      .select('numeroControl cliente abogado tipoTramite fecha')
      .sort({ numeroControl: -1 })
      .lean();

    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('ESCRITURAS NUMEROS ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error listando números de escrituras' });
  }
});

// GET /api/recibos/escrituras/search?q=texto
// Sugerencias (datalist) devolviendo SOLO los números de escritura (strings) desde la colección Escrituras
router.get('/escrituras/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ data: [] });

    const findFilter = {
      $and: [
        { tipoTramite: { $regex: 'escritura', $options: 'i' } },
        {
          $or: [
            {
              $expr: {
                $regexMatch: {
                  input: { $toString: '$numeroControl' },
                  regex: q,
                  options: 'i'
                }
              }
            },
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

    const list = [...new Set(rows.map(r => String(r.numeroControl)))];
    res.json({ data: list });
  } catch (e) {
    res.status(500).json({ msg: 'Error en búsqueda de escrituras', detalle: e.message });
  }
});

/* ----------------------------- Recibos API ---------------------------- */
/**
 * POST /api/recibos
 * Crear un recibo nuevo
 */
router.post('/', async (req, res) => {
  try {
    // 🔒 Solo admin/recepción pueden CREAR recibos
    if (!canModifyRecibos(req)) {
      return res.status(403).json({ ok: false, msg: 'No tienes permiso para crear recibos' });
    }

    let {
      tipoTramite,
      recibiDe,
      abogado,
      abogadoId,
      concepto,
      control,
      totalTramite,
      totalPagado,
      abono,
      /*totalImpuestos ,
      valorAvaluo ,
      totalGastosExtra ,
      totalHonorarios,*/
      creadoPor,
    } = req.body || {};

    if (!tipoTramite || !recibiDe) {
      return res.status(400).json({ ok: false, msg: 'Faltan campos obligatorios' });
    }

    // normaliza números
    totalTramite = Number(totalTramite || 0);
    totalPagado = Number(totalPagado || 0);
    abono = Number(abono || 0);
    /*totalImpuestos = Number(totalImpuestos || 0);
    valorAvaluo = Number(valorAvaluo || 0);
    totalGastosExtra = Number(totalGastosExtra || 0);
    totalHonorarios = Number(totalHonorarios || 0);*/

    // normaliza control a Number cuando aplique
    const controlNum = control == null || control === '' ? null : Number(control);

    // resolver nombre desde abogadoId (si llega)
    let abogadoNombre = abogado || '';
    if (abogadoId !== undefined && abogadoId !== null && String(abogadoId).trim() !== '') {
      const numId = Number(abogadoId);
      if (Number.isFinite(numId)) {
        const a = await Abogado.findById(numId).lean();
        if (a) abogadoNombre = a.nombre || abogadoNombre;
      }
    }

    let restante = 0;

    if (tipoTramite === 'Escritura' || tipoTramite === 'Protocolito') {
      if (!Number.isFinite(controlNum)) {
        return res.status(400).json({
          ok: false,
          msg: `Número de ${tipoTramite === 'Escritura' ? 'Escritura' : 'Protocolito'} (control) inválido`,
        });
      }

      // Si la Escritura tiene presupuesto ligado, el total del trámite lo
      // manda el presupuesto (fuente viva) — no lo que haya llegado en el
      // body, que puede venir desactualizado o editado a mano. Protocolito
      // no tiene presupuesto: el total siempre lo teclea la recepcionista.
      if (tipoTramite === 'Escritura') {
        const montoPresupuesto = await montoPresupuestoDeEscritura(controlNum);
        if (montoPresupuesto != null) {
          totalTramite = montoPresupuesto;
        }
      }

      // pagadoAcum: directos + vinculados vía ReciboLink (no solo directos,
      // para no permitir sobre-pagar cuando ya hay un abono adjuntado).
      const previos = await recibosDeTramite(controlNum);
      const pagadoAcum = previos.reduce((acc, r) => acc + Number(r.totalPagado || 0), 0);
      const maxAbono = Math.max(0, totalTramite - pagadoAcum);

      if (abono <= 0 && totalPagado > 0) abono = totalPagado;

      if (abono <= 0) return res.status(400).json({ ok: false, msg: 'Abono debe ser mayor a 0' });
      if (abono > maxAbono) {
        return res.status(400).json({ ok: false, msg: `Abono excede el restante ($${maxAbono.toFixed(2)})` });
      }

      totalPagado = abono;
      restante = Math.max(0, totalTramite - (pagadoAcum + abono));
    } else {
      if (totalPagado > totalTramite) {
        return res.status(400).json({ ok: false, msg: 'No puedes pagar más que el total del trámite' });
      }
      abono = 0;
      restante = Math.max(0, totalTramite - totalPagado);
    }

    const payload = {
      fecha: new Date(),
      tipoTramite,
      recibiDe,
      abogado: abogadoNombre,
      concepto: concepto || '',
      control: controlNum, // 👈 numérico consistente
      totalTramite,
      totalPagado,
      abono,
      restante,
      /*totalImpuestos,
      valorAvaluo,
      totalGastosExtra,
      totalHonorarios,*/
      creadoPor: creadoPor || undefined,
    };

    const doc = await Recibo.create(payload);

    // ✅ Actualiza estatus_recibo del trámite relacionado (no pisa JUSTIFICADO)
    if (Number.isFinite(controlNum)) {
      if (tipoTramite === 'Escritura') {
        await Escritura.updateOne(
          { numeroControl: controlNum, estatus_recibo: { $ne: 'JUSTIFICADO' } },
          { $set: { estatus_recibo: 'CON_RECIBO' } }
        );
      }
      if (tipoTramite === 'Protocolito') {
        await Protocolito.updateOne(
          { numeroTramite: controlNum, estatus_recibo: { $ne: 'JUSTIFICADO' } },
          { $set: { estatus_recibo: 'CON_RECIBO' } }
        );
      }
    }

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
 * Devuelve el último recibo con ese control (directo o por vínculo)
 */
router.get('/by-control/:control/latest', async (req, res) => {
  try {
    const controlRaw = req.params.control;
    const controlNum = Number(controlRaw);
    const asString = String(controlRaw);

    // A) directo en el recibo
    let rec = await Recibo.findOne({ control: controlNum })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    // soporte por si guardaste control como número en algunos docs
    if (!rec && Number.isFinite(controlNum)) {
      rec = await Recibo.findOne({ control: String(controlNum) })
        .sort({ createdAt: -1, _id: -1 })
        .lean();
    }

    // B) por vínculo
    if (!rec && Number.isFinite(controlNum)) {
      const link = await ReciboLink.findOne({ control: controlNum })
        .sort({ createdAt: -1, _id: -1 })
        .lean();
      if (link) rec = await Recibo.findById(link.reciboId).lean();
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

    const data = {
      ...rec,
      // prioriza la fecha del recibo; si no hay, usa createdAt
      fecha: rec.fecha || rec.createdAt,
    };

    buildReciboPDF(res, data); // 👈 aquí usamos data
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
    const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit || '500', 10)));
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
    const rows = await Abogado.find({
      role: { $in: ['ABOGADO', 'ASISTENTE'] },
      // disponible: true,
    })
      .select('_id nombre role disponible orden ubicacion')
      .sort({ nombre: 1, orden: 1 })
      .lean();

    const data = rows.map(a => ({
      id: a._id,
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

// PATCH /api/recibos/:id/cancel
// body: { motivo: string }
router.patch('/:id/cancel', async (req, res) => {
  try {
    // 🔒 Solo admin/caja/recepción pueden cancelar
    if (!canModifyRecibos(req)) {
      return res.status(403).json({ ok: false, msg: 'No tienes permiso para cancelar recibos' });
    }

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
        usuarioId: req.user?.id || undefined,
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

// GET /api/recibos/escrituras/:numero/pending
router.get('/escrituras/:numero/pending', async (req, res) => {
  try {
    const numero = Number(req.params.numero);
    if (!Number.isFinite(numero)) {
      return res.status(400).json({ ok: false, msg: 'Número de Escritura inválido' });
    }

    const montoPresupuesto = await montoPresupuestoDeEscritura(numero);

    const items = await recibosDeTramite(numero);

    const row = items.length
      ? {
          control: numero,
          totalTramite: items.reduce((acc, r) => Math.max(acc, Number(r.totalTramite || 0)), 0),
          pagadoAcum: items.reduce((acc, r) => acc + Number(r.totalPagado || 0), 0),
          count: items.length,
          last: items[0], // ya viene ordenado createdAt desc
        }
      : null;

    if (!row) {
      if (montoPresupuesto == null) {
        return res.json({
          ok: true,
          data: null,
          msg: 'No hay recibos para ese Número de Escritura (o todos están cancelados).'
        });
      }
      // Primer pago de un trámite con presupuesto: no hay recibos previos de
      // dónde sacar el total, así que se prellena directo desde el presupuesto.
      return res.json({
        ok: true,
        data: {
          control: numero,
          totalTramite: montoPresupuesto,
          pagadoAcum: 0,
          restante: montoPresupuesto,
          count: 0,
          liquidado: montoPresupuesto <= 0,
          last: {}
        }
      });
    }

    const totalTramite = montoPresupuesto != null ? montoPresupuesto : row.totalTramite;
    const restante = Math.max(0, totalTramite - Number(row.pagadoAcum || 0));
    const liquidado = restante <= 0;

    return res.json({
      ok: true,
      data: {
        control: row.control,
        totalTramite,
        pagadoAcum: row.pagadoAcum,
        restante,
        count: row.count,
        liquidado,
        last: row.last
      }
    });
  } catch (e) {
    console.error('PENDING ESCRITURA ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error calculando pendiente de Escritura' });
  }
});


// 🔎 Búsqueda de controles de Escritura pero desde RECIBOS
// GET /api/recibos/escrituras/controls/search?q=2024/
router.get('/escrituras/controls/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const rx = q ? new RegExp(escapeRegex(q), 'i') : null;

    const pipeline = [
      { $match: { tipoTramite: 'Escritura' } },
      { $addFields: { controlStr: { $toString: '$control' } } },
    ];

    if (rx) pipeline.push({ $match: { controlStr: { $regex: rx } } });

    pipeline.push(
      { $group: { _id: '$control' } },
      { $sort: { _id: -1 } },
      { $limit: 20 }
    );

    const rows = await Recibo.aggregate(pipeline);
    res.json({ ok: true, data: rows.map(r => r._id) });
  } catch (e) {
    console.error('ESCRITURAS CONTROLS SEARCH ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error buscando controles de escrituras en recibos' });
  }
});


// GET /api/recibos/escrituras/:numero/history
router.get('/escrituras/:numero/history', async (req, res) => {
  try {
    const numero = Number(req.params.numero);
if (!Number.isFinite(numero)) return res.status(400).json({ ok:false, msg:'Número de Escritura inválido' });

    // Directos (control === numero) + vinculados vía ReciboLink (p.ej. un
    // recibo creado para otra Escritura que también se adjuntó a esta).
    const items = (await recibosDeTramite(numero)).sort(
      (a, b) => new Date(a.fecha) - new Date(b.fecha) || String(a._id).localeCompare(String(b._id))
    );

    // Mismo criterio que /pending: si el trámite tiene presupuesto, el total
    // lo manda el presupuesto y no lo que se haya tecleado en recibos previos.
    const montoPresupuesto = await montoPresupuestoDeEscritura(numero);

    const totalTramiteGuess = items.reduce(
      (acc, r) => Math.max(acc, Number(r.totalTramite || 0)),
      0
    );
    const totalTramiteBase = montoPresupuesto != null ? montoPresupuesto : totalTramiteGuess;
    const pagadoAcum = items.reduce(
      (acc, r) => acc + Number(r.totalPagado || 0),
      0
    );
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
      total: Number((r.total ?? r.totalPagado) || 0),
      estatus: r.estatus || 'Activo',
      pdfUrl: `/recibos/${r._id}/pdf`,
      // ✅ true si este recibo pertenece originalmente a otro #trámite y
      // fue adjuntado a este vía "Adjuntar recibos" (ReciboLink).
      vinculado: Number(r.control) !== numero,
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

/* --------------------- Vínculos Recibo ⇄ #Trámite --------------------- */

// POST /api/recibos/link
// body: { reciboId: string, control: number }
router.post('/link', async (req, res) => {
  try {
    // 🔒 Solo admin/caja/recepción pueden vincular
    if (!canModifyRecibos(req)) {
      return res.status(403).json({ ok: false, msg: 'No tienes permiso para vincular recibos' });
    }

    const { reciboId, control } = req.body || {};
    if (!reciboId || !Number.isFinite(Number(control))) {
      return res.status(400).json({ ok: false, msg: 'Datos inválidos' });
    }

    const exists = await Recibo.exists({ _id: reciboId });
    if (!exists) return res.status(404).json({ ok: false, msg: 'Recibo no encontrado' });

    await ReciboLink.updateOne(
      { reciboId, control: Number(control) },
      { $setOnInsert: { reciboId, control: Number(control), createdAt: new Date() } },
      { upsert: true }
    );

    // ✅ Después de crear el vínculo, actualiza estatus_recibo del trámite
    const ctrl = Number(control);

    // 1) intenta como Escritura
    const r1 = await Escritura.updateOne(
      { numeroControl: ctrl, estatus_recibo: { $ne: 'JUSTIFICADO' } },
      { $set: { estatus_recibo: 'CON_RECIBO' } }
    );

    // 2) si no fue Escritura, intenta como Protocolito
    if (!r1.matchedCount) {
      await Protocolito.updateOne(
        { numeroTramite: ctrl, estatus_recibo: { $ne: 'JUSTIFICADO' } },
        { $set: { estatus_recibo: 'CON_RECIBO' } }
      );
    }


    return res.json({ ok: true });
  } catch (e) {
    console.error('LINK RECIBO ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error vinculando recibo' });
  }
});

// POST /api/recibos/link/bulk
// body: { reciboId: string, controls: number[] }
router.post('/link/bulk', async (req, res) => {
  try {
    // 🔒 Solo admin/caja/recepción pueden vincular
    if (!canModifyRecibos(req)) {
      return res.status(403).json({ ok: false, msg: 'No tienes permiso para vincular recibos (bulk)' });
    }

    const { reciboId, controls } = req.body || {};
    if (!reciboId || !Array.isArray(controls) || !controls.length) {
      return res.status(400).json({ ok: false, msg: 'Datos inválidos' });
    }
    const exists = await Recibo.exists({ _id: reciboId });
    if (!exists) return res.status(404).json({ ok: false, msg: 'Recibo no encontrado' });

    const ops = controls
      .map(Number)
      .filter(Number.isFinite)
      .map(ctrl => ({
        updateOne: {
          filter: { reciboId, control: ctrl },
          update: { $setOnInsert: { reciboId, control: ctrl, createdAt: new Date() } },
          upsert: true
        }
      }));

    if (!ops.length) return res.status(400).json({ ok: false, msg: 'Sin controles válidos' });
    await ReciboLink.bulkWrite(ops, { ordered: false });

    return res.json({ ok: true, linked: ops.length });
  } catch (e) {
    console.error('BULK LINK RECIBO ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error vinculando recibo (bulk)' });
  }
});

// DELETE /api/recibos/link
// body: { reciboId: string, control: number }
router.delete('/link', async (req, res) => {
  try {
    // 🔒 Solo admin/caja/recepción pueden DESVINCULAR recibos
    if (!canModifyRecibos(req)) {
      return res.status(403).json({ ok: false, msg: 'No tienes permiso para desvincular recibos' });
    }

    const { reciboId, control } = req.body || {};
    if (!reciboId || !Number.isFinite(Number(control))) {
      return res.status(400).json({ ok: false, msg: 'Datos inválidos' });
    }
    await ReciboLink.deleteOne({ reciboId, control: Number(control) });


        const ctrl = Number(control);

    // ¿aún hay algún link a ese control?
    const linksLeft = await ReciboLink.exists({ control: ctrl });

    // ¿hay algún recibo directo (para el caso de Escritura/Protocolito que se guardó directo)?
    const directLeft = await Recibo.exists({
      control: ctrl,
      estatus: { $ne: "Cancelado" }
    });

    if (!linksLeft && !directLeft) {
      const r1 = await Escritura.updateOne(
        { numeroControl: ctrl, estatus_recibo: { $ne: "JUSTIFICADO" } },
        { $set: { estatus_recibo: "SIN_RECIBO" } }
      );

      if (!r1.matchedCount) {
        await Protocolito.updateOne(
          { numeroTramite: ctrl, estatus_recibo: { $ne: "JUSTIFICADO" } },
          { $set: { estatus_recibo: "SIN_RECIBO" } }
        );
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('UNLINK RECIBO ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error desvinculando recibo' });
  }
});

// GET /api/recibos/:id/links
router.get('/:id/links', async (req, res) => {
  try {
    const links = await ReciboLink.find({ reciboId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ ok: true, data: links });
  } catch (e) {
    console.error('LIST LINKS ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error listando vínculos' });
  }
});

// GET /api/recibos/links/by-control/:control
// listar todos los recibos vinculados a ese #Trámite
router.get('/links/by-control/:control', async (req, res) => {
  try {
    const control = Number(req.params.control);
    if (!Number.isFinite(control)) return res.status(400).json({ ok: false, msg: 'control inválido' });

    const links = await ReciboLink.find({ control }).sort({ createdAt: -1 }).lean();
    const ids = links.map(l => l.reciboId);
    const recibos = ids.length ? await Recibo.find({ _id: { $in: ids } }).lean() : [];
    return res.json({ ok: true, data: recibos });
  } catch (e) {
    console.error('BY-CONTROL LINKS ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error listando recibos por vínculo' });
  }
});

// ✅ BUSCAR RECIBOS PARA EL MODAL DE ADJUNTAR
// GET /api/recibos/search?q=texto
// Devuelve: [{ id, _id, folio, cliente, fecha, total, controls: [numsDeTramite] }, ...]
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();

    const match = { estatus: { $ne: 'Cancelado' } };
    const or = [];
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      or.push(
  { recibiDe: rx },
  { concepto: rx },
  { abogado: rx },
  // ✅ control num exacto
  ...(Number.isFinite(Number(q)) ? [{ control: Number(q) }] : []),
  // ✅ control convertido a string para regex
  {
    $expr: {
      $regexMatch: {
        input: { $toString: "$control" },
        regex: q,
        options: "i",
      }
    }
  }
);

    }

    // si parece fecha YYYY-MM-DD, filtrar por ese día
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(q);
    if (isDate) {
      match.fecha = {
        $gte: new Date(`${q}T00:00:00.000Z`),
        $lte: new Date(`${q}T23:59:59.999Z`)
      };
    }

    const isFolioSuffix = /^[a-f0-9]{2,8}$/i.test(q); // para buscar por sufijo del ObjectId

    const pipeline = [
      { $match: match },
      { $addFields: { strId: { $toString: '$_id' } } },
    ];

    if (q && or.length) {
      pipeline.push({ $match: { $or: or } });
    }

    if (q && isFolioSuffix) {
      pipeline.push({ $match: { strId: { $regex: `${q}$`, $options: 'i' } } });
    }

    pipeline.push(
      {
        $lookup: {
          from: 'recibolinks',
          localField: '_id',
          foreignField: 'reciboId',
          as: 'links'
        }
      },
      {
        $project: {
          _id: 1,
          id: '$_id',
          fecha: 1,
          recibiDe: 1,
          concepto: 1,
          abogado: 1,
          control: 1,
          total: { $ifNull: ['$total', '$totalPagado'] },
          folio: { $toUpper: { $substr: ['$strId', 20, 4] } },
          controls: {
            $map: { input: '$links', as: 'l', in: '$$l.control' }
          }
        }
      },
      { $sort: { fecha: -1, _id: -1 } },
      { $limit: 50 }
    );

    const rows = await Recibo.aggregate(pipeline);

    const data = rows.map(r => ({
      id: r._id,
      _id: r._id,
      folio: r.folio,
      cliente: r.recibiDe || '',
      fecha: r.fecha || null,
      total: Number(r.total || 0),
      controls: Array.isArray(r.controls) ? r.controls : []
    }));

    return res.json(data);
  } catch (e) {
    console.error('RECIBOS SEARCH ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error buscando recibos' });
  }
});

module.exports = router;
