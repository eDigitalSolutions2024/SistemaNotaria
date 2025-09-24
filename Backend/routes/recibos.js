const express = require('express');
const { body, validationResult } = require('express-validator');
const Recibo = require('../models/Recibo');
const router = express.Router();

// Crear recibo
router.post('/',
  body('fecha').notEmpty().withMessage('fecha requerida'),
  body('recibiDe').trim().notEmpty().withMessage('recibiDe requerido'),
  body('totalTramite').isFloat({ min: 0 }).withMessage('totalTramite inválido'),
  body('totalPagado').isFloat({ min: 0 }).withMessage('totalPagado inválido'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ ok:false, errors: errors.array() });

      const { totalTramite, totalPagado, ...rest } = req.body;
      const restante = Math.max(0, Number(totalTramite) - Number(totalPagado));

      const doc = await Recibo.create({
        ...rest,
        totalTramite: Number(totalTramite),
        totalPagado: Number(totalPagado),
        restante
      });
      res.json({ ok:true, data: doc });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok:false, msg:'Error al crear recibo' });
    }
  }
);

// Listar últimos (para pruebas)
router.get('/', async (_req, res) => {
  const rows = await Recibo.find().sort({ createdAt: -1 }).limit(50);
  res.json({ ok:true, data: rows });
});

module.exports = router;
