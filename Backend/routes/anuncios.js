// Backend/routes/anuncios.js
// Anuncios manuales: solo ADMIN los crea; se transmiten en vivo (Socket.io)
// a todos los usuarios conectados y quedan en historial persistente. Cada
// usuario deja prueba de que lo vio al dar clic en el botón de cierre.
const express = require('express');
const router = express.Router();

const Anuncio = require('../models/Anuncio');
const Abogado = require('../models/Abogado');
const { ROLES } = Abogado;

function getUser(req) {
  const u = req.user || {};
  return {
    id: u.id != null ? Number(u.id) : null,
    nombre: u.nombre || '',
    role: String(u.role || u.rol || '').toUpperCase(),
  };
}

function soloAdmin(req, res, next) {
  if (getUser(req).role !== 'ADMIN') {
    return res.status(403).json({ ok: false, msg: 'Solo un administrador puede realizar esta acción' });
  }
  next();
}

/* ---------------------------------------------------------------------- */
/* POST /api/anuncios                                                      */
/* ADMIN crea un anuncio manual y se transmite de inmediato a todos.        */
/* ---------------------------------------------------------------------- */
router.post('/', soloAdmin, async (req, res) => {
  try {
    const user = getUser(req);
    const titulo = String(req.body?.titulo || '').trim();
    const mensaje = String(req.body?.mensaje || '').trim();
    const urgencia = req.body?.urgencia === 'URGENTE' ? 'URGENTE' : 'NORMAL';
    const alcance = req.body?.alcance === 'SEGMENTO' ? 'SEGMENTO' : 'TODOS';

    if (!titulo || !mensaje) {
      return res.status(400).json({ ok: false, msg: 'Título y mensaje son obligatorios' });
    }

    let destinatarios = [];
    let destinatarioRoles = [];

    if (alcance === 'SEGMENTO') {
      const idsPedidos = Array.isArray(req.body?.destinatarioIds)
        ? [...new Set(req.body.destinatarioIds.map(Number).filter(Number.isFinite))]
        : [];
      destinatarioRoles = Array.isArray(req.body?.destinatarioRoles)
        ? [...new Set(req.body.destinatarioRoles.map((r) => String(r).toUpperCase()).filter((r) => ROLES.includes(r)))]
        : [];

      if (!idsPedidos.length && !destinatarioRoles.length) {
        return res.status(400).json({
          ok: false,
          msg: 'Un anuncio segmentado necesita al menos un usuario o un rol de destino',
        });
      }

      if (idsPedidos.length) {
        const abogados = await Abogado.find({ _id: { $in: idsPedidos } }).select('_id nombre').lean();
        destinatarios = abogados.map((a) => ({ usuarioId: a._id, usuarioNombre: a.nombre }));
      }
    }

    const anuncio = await Anuncio.create({
      tipo: 'MANUAL',
      titulo,
      mensaje,
      urgencia,
      alcance,
      destinatarios,
      destinatarioRoles,
      creadoPorId: user.id,
      creadoPorNombre: user.nombre,
    });

    const io = req.app.get('io');
    io.emit('anuncio:nuevo', anuncio.toObject());

    res.status(201).json({ ok: true, data: anuncio });
  } catch (e) {
    console.error('ANUNCIOS CREAR ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error creando el anuncio' });
  }
});

/* ---------------------------------------------------------------------- */
/* GET /api/anuncios/pendientes                                            */
/* Anuncios activos que el usuario logueado aún no ha marcado como visto — */
/* para no perder anuncios si no estaba conectado cuando se emitieron      */
/* (login, recarga de página, reconexión de socket).                       */
/* ---------------------------------------------------------------------- */
router.get('/pendientes', async (req, res) => {
  try {
    const user = getUser(req);
    const items = await Anuncio.find({
      activo: true,
      'vistoPor.usuarioId': { $ne: user.id },
      $or: [
        { alcance: 'TODOS' },
        { alcance: 'SEGMENTO', 'destinatarios.usuarioId': user.id },
        { alcance: 'SEGMENTO', destinatarioRoles: user.role },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ ok: true, data: items });
  } catch (e) {
    console.error('ANUNCIOS PENDIENTES ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo anuncios pendientes' });
  }
});

/* ---------------------------------------------------------------------- */
/* GET /api/anuncios                                                       */
/* Historial paginado (solo ADMIN) con conteo de vistos vs total usuarios. */
/* ---------------------------------------------------------------------- */
router.get('/', soloAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const [items, total, todosLosUsuarios] = await Promise.all([
      Anuncio.find({})
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Anuncio.countDocuments({}),
      Abogado.find({}).select('_id role').lean(),
    ]);
    const totalUsuarios = todosLosUsuarios.length;

    // Para un anuncio TODOS, el universo es todo mundo; para uno SEGMENTO,
    // es cuántos abogados caen hoy en ese usuario o ese rol (puede diferir
    // del historial si a alguien le cambiaron el rol después de enviarlo).
    const data = items.map((a) => {
      let totalObjetivo = totalUsuarios;
      if (a.alcance === 'SEGMENTO') {
        const idsSet = new Set((a.destinatarios || []).map((d) => d.usuarioId));
        const rolesSet = new Set(a.destinatarioRoles || []);
        totalObjetivo = todosLosUsuarios.filter((u) => idsSet.has(u._id) || rolesSet.has(u.role)).length;
      }
      return { ...a, totalUsuarios, totalObjetivo, vistoCount: (a.vistoPor || []).length };
    });

    res.json({ ok: true, data: { items: data, total, page, limit, totalUsuarios } });
  } catch (e) {
    console.error('ANUNCIOS HISTORIAL ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo historial de anuncios' });
  }
});

/* ---------------------------------------------------------------------- */
/* POST /api/anuncios/:id/visto                                            */
/* El usuario deja constancia de que vio el anuncio (clic en "Entendido"/   */
/* cerrar). Idempotente: si ya estaba marcado, no duplica.                 */
/* ---------------------------------------------------------------------- */
router.post('/:id/visto', async (req, res) => {
  try {
    const user = getUser(req);
    if (user.id == null) {
      return res.status(400).json({ ok: false, msg: 'Usuario no identificado' });
    }

    const anuncio = await Anuncio.findById(req.params.id);
    if (!anuncio) return res.status(404).json({ ok: false, msg: 'Anuncio no encontrado' });

    const yaVisto = anuncio.vistoPor.some((v) => v.usuarioId === user.id);
    if (!yaVisto) {
      anuncio.vistoPor.push({ usuarioId: user.id, usuarioNombre: user.nombre, vistoEn: new Date() });
      await anuncio.save();
    }

    res.json({ ok: true, data: anuncio });
  } catch (e) {
    console.error('ANUNCIOS VISTO ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error marcando el anuncio como visto' });
  }
});

/* ---------------------------------------------------------------------- */
/* PATCH /api/anuncios/:id/desactivar                                      */
/* ADMIN cancela un anuncio antes de tiempo (deja de considerarse          */
/* "pendiente" para quien no lo haya visto; el historial no se borra).     */
/* ---------------------------------------------------------------------- */
router.patch('/:id/desactivar', soloAdmin, async (req, res) => {
  try {
    const anuncio = await Anuncio.findByIdAndUpdate(
      req.params.id,
      { activo: false },
      { new: true }
    );
    if (!anuncio) return res.status(404).json({ ok: false, msg: 'Anuncio no encontrado' });

    const io = req.app.get('io');
    io.emit('anuncio:desactivado', { _id: anuncio._id });

    res.json({ ok: true, data: anuncio });
  } catch (e) {
    console.error('ANUNCIOS DESACTIVAR ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error desactivando el anuncio' });
  }
});

module.exports = router;
