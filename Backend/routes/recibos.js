// routes/recibos.js
const express = require('express');
const router = express.Router();

const Recibo = require('../models/Recibo');
const Protocolito = require('../models/Protocolito');

/**
 * GET /api/recibos/protocolitos/numeros
 * Devuelve [{ numeroTramite, cliente, abogado, fecha }, ...]
 */
router.get('/protocolitos/numeros', async (_req, res) => {
  try {
    const rows = await Protocolito.find({})
      .select('numeroTramite cliente abogado fecha -_id')
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
      .select('numeroTramite cliente abogado fecha')
      .lean();

    if (!row) return res.status(404).json({ ok: false, msg: 'No encontrado' });
    return res.json({ ok: true, data: row });
  } catch (e) {
    console.error('GET PROTOCOLITO ERROR:', e);
    return res.status(500).json({ ok: false, msg: 'Error obteniendo protocolito' });
  }
});

module.exports = router;
