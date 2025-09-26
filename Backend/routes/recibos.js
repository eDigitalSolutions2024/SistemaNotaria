const express = require('express');

const router = express.Router();

const Recibo = require('../models/Recibo');          // modelo de recibos
const Protocolito = require('../models/Protocolito'); // modelo de protocolitos

// GET /api/recibos/protocolitos/numeros
// Devuelve [{ numeroTramite, cliente, abogado, fecha }, ...] para llenar el <select>
router.get('recibos/protocolitos/numeros', async (_req, res) => {
  try {
    const rows = await Protocolito.find({})
      .select('numeroTramite cliente abogado fecha -_id')
      .sort({ numeroTramite: -1 });
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: 'Error listando protocolitos' });
  }
});


module.exports = router;
