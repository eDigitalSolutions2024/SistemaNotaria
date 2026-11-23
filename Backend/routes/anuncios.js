// Backend/routes/anuncios.js
// Anuncios manuales: solo ADMIN los crea; se transmiten en vivo (Socket.io)
// a todos los usuarios conectados y quedan en historial persistente. Cada
// usuario deja prueba de que lo vio al dar clic en el botón de cierre.
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const Anuncio = require('../models/Anuncio');
const Abogado = require('../models/Abogado');
const { ROLES } = Abogado;

// ---- Capturas de pantalla adjuntas ---------------------------------------
const DIR_ADJUNTOS = path.join(__dirname, '..', 'AnunciosAdjuntos');
const MAX_IMAGENES = 4;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB por imagen

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: MAX_IMAGENES },
});

// Detecta el tipo real por los primeros bytes (no confía en el nombre ni en
// el mimetype que manda el navegador). SVG se excluye a propósito (puede
// llevar scripts).
function detectarImagen(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return { mime: 'image/gif', ext: 'gif' };
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

// Acepta multipart (arrays como JSON string) o JSON normal.
function leerLista(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return []; }
  }
  return [];
}

function subirImagenes(req, res, next) {
  upload.array('imagenes', MAX_IMAGENES)(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Cada imagen debe pesar máximo 5 MB'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
        ? `Máximo ${MAX_IMAGENES} imágenes por anuncio`
        : 'No se pudieron procesar las imágenes';
    res.status(400).json({ ok: false, msg });
  });
}

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
router.post('/', soloAdmin, subirImagenes, async (req, res) => {
  const guardados = [];
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
      const idsPedidos = [...new Set(leerLista(req.body?.destinatarioIds).map(Number).filter(Number.isFinite))];
      destinatarioRoles = [...new Set(leerLista(req.body?.destinatarioRoles).map((r) => String(r).toUpperCase()).filter((r) => ROLES.includes(r)))];

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

    // Valida y guarda las capturas (solo después de pasar las demás validaciones)
    const validas = [];
    for (const f of req.files || []) {
      const tipo = detectarImagen(f.buffer);
      if (!tipo) {
        return res.status(400).json({ ok: false, msg: `"${f.originalname}" no es una imagen válida (PNG, JPG, GIF o WEBP)` });
      }
      validas.push({ f, tipo });
    }
    const imagenesDoc = [];
    if (validas.length) fs.mkdirSync(DIR_ADJUNTOS, { recursive: true });
    for (const { f, tipo } of validas) {
      const archivo = `${crypto.randomBytes(16).toString('hex')}.${tipo.ext}`;
      fs.writeFileSync(path.join(DIR_ADJUNTOS, archivo), f.buffer);
      guardados.push(archivo);
      imagenesDoc.push({ archivo, mime: tipo.mime, nombre: String(f.originalname || '').slice(0, 120), size: f.size });
    }

    const anuncio = await Anuncio.create({
      tipo: 'MANUAL',
      imagenes: imagenesDoc,
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
    guardados.forEach((a) => fs.promises.unlink(path.join(DIR_ADJUNTOS, a)).catch(() => {}));
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
/* GET /api/anuncios/:id/imagenes/:n                                       */
/* Sirve una captura adjunta. Requiere sesión; si el anuncio es segmentado  */
/* solo la ve un destinatario (o ADMIN).                                   */
/* ---------------------------------------------------------------------- */
router.get('/:id/imagenes/:n', async (req, res) => {
  try {
    const user = getUser(req);
    const anuncio = await Anuncio.findById(req.params.id).lean();
    const img = anuncio?.imagenes?.[Number(req.params.n)];
    if (!img) return res.status(404).json({ ok: false, msg: 'Imagen no encontrada' });

    if (anuncio.alcance === 'SEGMENTO' && user.role !== 'ADMIN') {
      const permitido =
        (anuncio.destinatarios || []).some((d) => Number(d.usuarioId) === user.id) ||
        (anuncio.destinatarioRoles || []).includes(user.role);
      if (!permitido) return res.status(403).json({ ok: false, msg: 'Sin acceso a esta imagen' });
    }

    const ruta = path.join(DIR_ADJUNTOS, path.basename(img.archivo));
    if (!fs.existsSync(ruta)) return res.status(404).json({ ok: false, msg: 'Archivo no disponible' });

    res.setHeader('Content-Type', img.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    fs.createReadStream(ruta).pipe(res);
  } catch (e) {
    console.error('ANUNCIOS IMAGEN ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo la imagen' });
  }
});

/* ---------------------------------------------------------------------- */
/* POST /api/anuncios/:id/visto                                           */
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
