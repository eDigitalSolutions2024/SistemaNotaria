// Backend/routes/bitacora.js
// Consulta de la bitácora global de auditoría — solo ADMIN.
const express = require('express');
const router = express.Router();

const Bitacora = require('../models/Bitacora');

function esAdmin(req) {
  const role = String(req.user?.role || req.user?.rol || '').toUpperCase();
  return role === 'ADMIN';
}

function escapeRegex(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/bitacora
// query: usuario (id o texto), accion, desde, hasta, q, page, limit
router.get('/', async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({ ok: false, mensaje: 'Solo un administrador puede ver la bitácora' });
    }

    const { usuario, accion, desde, hasta, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const skip = (page - 1) * limit;

    const filter = {};

    if (usuario) {
      if (/^\d+$/.test(String(usuario))) {
        filter.usuarioId = Number(usuario);
      } else {
        filter.usuarioNombre = new RegExp(escapeRegex(String(usuario)), 'i');
      }
    }

    if (accion) filter.accion = accion;

    if (desde || hasta) {
      filter.createdAt = {};
      if (desde) filter.createdAt.$gte = new Date(`${desde}T00:00:00.000Z`);
      if (hasta) filter.createdAt.$lte = new Date(`${hasta}T23:59:59.999Z`);
    }

    if (q && String(q).trim()) {
      const rx = new RegExp(escapeRegex(String(q).trim()), 'i');
      filter.$or = [{ detalle: rx }, { entidad: rx }, { usuarioNombre: rx }, { ip: rx }];
    }

    const [items, total] = await Promise.all([
      Bitacora.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      Bitacora.countDocuments(filter),
    ]);

    return res.json({ ok: true, items, total, page, limit });
  } catch (e) {
    console.error('BITACORA LIST ERROR:', e);
    return res.status(500).json({ ok: false, mensaje: 'Error listando bitácora' });
  }
});

// GET /api/bitacora/acciones — catálogo de valores de `accion` ya usados,
// para poblar el filtro del frontend sin tener que hardcodear la lista ahí.
router.get('/acciones', async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({ ok: false, mensaje: 'Solo un administrador puede ver la bitácora' });
    }
    const acciones = await Bitacora.distinct('accion');
    return res.json({ ok: true, acciones: acciones.sort() });
  } catch (e) {
    console.error('BITACORA ACCIONES ERROR:', e);
    return res.status(500).json({ ok: false, mensaje: 'Error listando acciones' });
  }
});

module.exports = router;
