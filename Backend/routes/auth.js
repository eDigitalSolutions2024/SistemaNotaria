const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const Abogado = require('../models/Abogado');
const { requireAuth } = require('../middleware/auth');

function signToken(abogado) {
  const payload = { id: abogado._id, nombre: abogado.nombre, role: abogado.role || 'user' };
  const opts = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };
  return jwt.sign(payload, process.env.JWT_SECRET, opts);
}

// POST /auth/login  { usuario, password }
router.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password) {
      return res.status(400).json({ mensaje: 'Usuario y contraseña requeridos' });
    }

    // Busca por usuario o por algunos alias que ya usas (ajusta a tu gusto)
    const user = await Abogado.findOne({
      $or: [
        { usuario },
        { nombre: usuario },
        { iniciales: usuario },
        { codigo: usuario },
        { clave: usuario },
      ],
    }).select('+passwordHash'); // incluir passwordHash

    if (!user) return res.status(401).json({ mensaje: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(String(password), user.passwordHash || '');
    if (!ok) return res.status(401).json({ mensaje: 'Credenciales inválidas' });

    const token = signToken(user);
    return res.json({
      token,
      user: { id: user._id, nombre: user.nombre, usuario: user.usuario, role: user.role || 'user' },
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ mensaje: 'Error en login' });
  }
});

// GET /auth/me  -> datos del usuario autenticado
router.get('/me', requireAuth, async (req, res) => {
  const me = await Abogado.findById(req.user.id).lean();
  if (!me) return res.status(404).json({ mensaje: 'No encontrado' });
  res.json({ id: me._id, nombre: me.nombre, usuario: me.usuario, role: me.role || 'user' });
});

// ⚠️ Solo desarrollo: setear/actualizar contraseña y usuario de un abogado existente
router.post('/dev/set-password', async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ mensaje: 'Solo disponible en development' });
    }
    const { id, usuario, password } = req.body;
    if (!id || !password) return res.status(400).json({ mensaje: 'id y password requeridos' });

    const ab = await Abogado.findById(id).select('+passwordHash');
    if (!ab) return res.status(404).json({ mensaje: 'Abogado no encontrado' });

    if (usuario) ab.usuario = usuario;
    const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
    ab.passwordHash = await bcrypt.hash(String(password), rounds);
    await ab.save();

    res.json({ ok: true });
  } catch (err) {
    console.error('SET PASSWORD ERROR:', err);
    res.status(500).json({ mensaje: 'No se pudo actualizar password' });
  }
});

module.exports = router;
