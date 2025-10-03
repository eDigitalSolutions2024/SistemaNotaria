// routes/recibos.js
const express = require('express');
const router = express.Router();

const Recibo = require('../models/Recibo');
const Protocolito = require('../models/Protocolito');
const { buildReciboPDF } = require('../utils/pdfRecibo');

/**
 * GET /api/recibos/protocolitos/numeros
 * Devuelve [{ numeroTramite, cliente, abogado, fecha }, ...]
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

/**
 * POST /api/recibos
 * Crear un recibo nuevo
 */
router.post('/', async (req, res) => {
  try {
    const {
      fecha,
      tipoTramite,
      recibiDe,
      abogado,
      concepto,
      control, // en Protocolito será el # Trámite
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

    const doc = await Recibo.create({
      fecha,
      tipoTramite,
      recibiDe,
      abogado: abogado || '',
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
    });

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

    // fallback si el control es numérico
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

module.exports = router;
