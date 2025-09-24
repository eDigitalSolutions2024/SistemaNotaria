// Backend/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Abogado = require('../models/Abogado');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { user, password } = req.body || {};
    if (!user || !password) {
      return res.status(400).json({ mensaje: 'Usuario y contraseña son obligatorios' });
    }

    let abogado = null;

    // Si el user son solo dígitos, lo tratamos como _id numérico
    if (/^\d+$/.test(String(user))) {
      abogado = await Abogado.findById(Number(user)).select('+passwordHash');
    }

    // Como respaldo, intenta por nombre exacto
    if (!abogado) {
      abogado = await Abogado.findOne({ nombre: user }).select('+passwordHash');
    }

    if (!abogado) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    const ok = await abogado.validatePassword(password);
    if (!ok) return res.status(401).json({ mensaje: 'Credenciales inválidas' });

    const payload = { id: abogado._id, role: abogado.role, nombre: abogado.nombre };
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: process.env.JWT_EXPIRES || '1d' }
    );

    return res.json({ token, user: payload });
  } catch (err) {
    return res.status(500).json({ mensaje: 'Error en login', error: err.message });
  }
});

// GET /api/auth/me (protegida)
const requireAuth = require('../middleware/auth');
router.get('/me', requireAuth, async (req, res) => {
  const a = await Abogado.findById(req.user.id).lean();
  if (!a) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
  res.json({ id: a._id, nombre: a.nombre, role: a.role });
});

module.exports = router;
