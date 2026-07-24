// backend/routes/custodia.js
// Control de custodia física de trámites (Escritura/Protocolito) entre
// abogados y recepción. Objetivo: nunca perder de vista quién tiene un
// expediente, y dejar una bitácora a prueba de "yo nunca lo recibí" —
// la confirmación final SOLO la puede dar el abogado destinatario, desde
// su propia sesión.
const express = require('express');
const router = express.Router();

const Escritura = require('../models/Escritura');
const Protocolito = require('../models/Protocolito');
const Abogado = require('../models/Abogado');
const CustodiaEvento = require('../models/CustodiaEvento');

const MODELOS = { Escritura, Protocolito };
const CAMPO_CONTROL = { Escritura: 'numeroControl', Protocolito: 'numeroTramite' };

function getUser(req) {
  const u = req.user || {};
  return {
    id: u.id != null ? Number(u.id) : null,
    nombre: u.nombre || '',
    role: String(u.role || u.rol || '').toUpperCase(),
  };
}

function esAbogadoLike(role) {
  return ['ABOGADO', 'ASISTENTE', 'ADMIN'].includes(role);
}
function esRecepcionLike(role) {
  return ['RECEPCION', 'ADMIN'].includes(role);
}

// ADMIN y RECEPCION ven todos los trámites (los necesitan para gestionar la
// custodia); ABOGADO/ASISTENTE solo ven los suyos — mismo criterio que ya
// usan Escrituras.jsx/Protocolito.jsx (coincidencia de nombre, sin distinguir
// mayúsculas/acentos).
function puedeVerTodo(role) {
  return ['ADMIN', 'RECEPCION'].includes(role);
}

const DIACRITICOS_RE = new RegExp('[̀-ͯ]', 'g');
function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(DIACRITICOS_RE, '')
    .toLowerCase()
    .trim();
}

function esPropio(abogadoTramite, userNombre) {
  const u = normalizar(userNombre);
  if (!u) return false;
  return normalizar(abogadoTramite).includes(u);
}

function escapeRegex(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Filtro Mongo equivalente a esPropio(), para no traer de la base lo que de
// todos modos se va a descartar (regex simple: no hace fold de acentos, pero
// los nombres se guardan igual que en el catálogo de abogados).
function filtroPropiedad(user) {
  if (puedeVerTodo(user.role)) return {};
  if (!user.nombre) return { abogado: '__nadie__' };
  return { abogado: new RegExp(escapeRegex(user.nombre), 'i') };
}

// Resuelve, a partir del texto libre guardado en Escritura.abogado /
// Protocolito.abogado, a qué cuenta del catálogo de Abogado corresponde —
// para que "entregar" no dependa de que recepción elija bien a mano.
async function resolverAbogadoAsignado(nombreTramite) {
  if (!nombreTramite) return null;
  const nTramite = normalizar(nombreTramite);
  const candidatos = await Abogado.find({}).select('_id nombre').lean();
  return candidatos.find((a) => nTramite.includes(normalizar(a.nombre))) || null;
}

function parseTipoControl(req, res) {
  const tipo = req.params.tipo;
  const control = Number(req.params.control);
  if (!MODELOS[tipo]) {
    res.status(400).json({ ok: false, msg: 'tipo debe ser Escritura o Protocolito' });
    return null;
  }
  if (!Number.isFinite(control)) {
    res.status(400).json({ ok: false, msg: 'control inválido' });
    return null;
  }
  return { tipo, control, Modelo: MODELOS[tipo], campoControl: CAMPO_CONTROL[tipo] };
}

async function cargarTramite(tipo, control) {
  const Modelo = MODELOS[tipo];
  const campo = CAMPO_CONTROL[tipo];
  return Modelo.findOne({ [campo]: control });
}

function resumenTramite(tipo, doc) {
  const campo = CAMPO_CONTROL[tipo];
  return {
    tipoTramite: tipo,
    control: doc[campo],
    cliente: doc.cliente,
    abogadoAsignado: doc.abogado,
    custodia: doc.custodia || { estado: 'CON_ABOGADO' },
  };
}

/* ---------------------------------------------------------------------- */
/* GET /api/custodia/pendientes                                            */
/* Trámites entregados a un abogado que aún no ha confirmado. Por defecto  */
/* solo los del usuario logueado (para el aviso al iniciar sesión); ADMIN  */
/* puede pedir ?todos=1 para verlos todos.                                 */
/* ---------------------------------------------------------------------- */
router.get('/pendientes', async (req, res) => {
  try {
    const user = getUser(req);
    const verTodos = req.query.todos === '1' && user.role === 'ADMIN';

    const filtroBase = { 'custodia.estado': 'ENTREGADO_PENDIENTE_CONFIRMACION' };
    const filtro = verTodos ? filtroBase : { ...filtroBase, 'custodia.abogadoId': user.id };

    const [escrituras, protocolitos] = await Promise.all([
      Escritura.find(filtro)
        .select('numeroControl tipoTramite cliente custodia')
        .lean(),
      Protocolito.find(filtro)
        .select('numeroTramite tipoTramite cliente custodia')
        .lean(),
    ]);

    const items = [
      ...escrituras.map((d) => resumenTramite('Escritura', d)),
      ...protocolitos.map((d) => resumenTramite('Protocolito', d)),
    ].sort((a, b) => new Date(b.custodia.actualizadoEn) - new Date(a.custodia.actualizadoEn));

    res.json({ ok: true, data: items });
  } catch (e) {
    console.error('CUSTODIA PENDIENTES ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo pendientes de confirmación' });
  }
});

/* ---------------------------------------------------------------------- */
/* GET /api/custodia/estado-actual                                         */
/* Para la pantalla de bitácora: estado actual de trámites, filtrable.     */
/* ---------------------------------------------------------------------- */
router.get('/estado-actual', async (req, res) => {
  try {
    const user = getUser(req);
    const { estado, tipoTramite, q } = req.query;
    const LIMITE = 300;

    const tipos = tipoTramite && MODELOS[tipoTramite] ? [tipoTramite] : ['Escritura', 'Protocolito'];

    const construirFiltro = (tipo) => {
      const f = { ...filtroPropiedad(user) };
      if (estado && estado !== 'Todos') f['custodia.estado'] = estado;
      if (q && q.trim()) {
        const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const campoNum = Number(q);
        f.$or = [
          { cliente: rx },
          { abogado: rx },
          { 'custodia.abogadoNombre': rx },
          ...(Number.isFinite(campoNum) ? [{ [CAMPO_CONTROL[tipo]]: campoNum }] : []),
        ];
      }
      return f;
    };

    const resultados = await Promise.all(
      tipos.map((tipo) =>
        MODELOS[tipo]
          .find(construirFiltro(tipo))
          .select(`${CAMPO_CONTROL[tipo]} cliente abogado custodia`)
          .sort({ [CAMPO_CONTROL[tipo]]: -1 })
          .limit(LIMITE)
          .lean()
          .then((docs) => docs.map((d) => resumenTramite(tipo, d)))
      )
    );

    // Orden por # de trámite (más reciente primero), igual criterio que las
    // listas de Escrituras/Protocolito — antes se ordenaba por
    // custodia.actualizadoEn, que es null para trámites sin movimientos y
    // hacía que la lista se viera "desordenada".
    const items = resultados
      .flat()
      .sort((a, b) => (b.control || 0) - (a.control || 0) || a.tipoTramite.localeCompare(b.tipoTramite))
      .slice(0, LIMITE);

    res.json({ ok: true, data: items });
  } catch (e) {
    console.error('CUSTODIA ESTADO-ACTUAL ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo estado de custodia' });
  }
});

/* ---------------------------------------------------------------------- */
/* GET /api/custodia/eventos                                               */
/* Bitácora completa (paginada) de movimientos.                            */
/* ---------------------------------------------------------------------- */
router.get('/eventos', async (req, res) => {
  try {
    const user = getUser(req);
    const { tipoTramite, control, accion, desde, hasta } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const filtro = {};
    if (tipoTramite && MODELOS[tipoTramite]) filtro.tipoTramite = tipoTramite;
    if (control && Number.isFinite(Number(control))) filtro.control = Number(control);
    if (accion) filtro.accion = accion;
    if (desde || hasta) {
      filtro.createdAt = {};
      if (desde) filtro.createdAt.$gte = new Date(`${desde}T00:00:00.000Z`);
      if (hasta) filtro.createdAt.$lte = new Date(`${hasta}T23:59:59.999Z`);
    }

    // Sin visibilidad total: solo eventos de trámites propios. Se resuelve
    // primero el universo de #control propios por tipo y se intersecta con
    // el filtro ya armado (si pidió un tipo/control puntual que no es suyo,
    // el $or de abajo simplemente no calza con nada).
    if (!puedeVerTodo(user.role)) {
      const tiposAConsultar = filtro.tipoTramite ? [filtro.tipoTramite] : ['Escritura', 'Protocolito'];
      const propios = await Promise.all(
        tiposAConsultar.map((tipo) =>
          MODELOS[tipo]
            .find(filtroPropiedad(user))
            .select(CAMPO_CONTROL[tipo])
            .lean()
            .then((docs) => ({ tipo, controles: docs.map((d) => d[CAMPO_CONTROL[tipo]]) }))
        )
      );
      filtro.$or = propios.map(({ tipo, controles }) => ({ tipoTramite: tipo, control: { $in: controles } }));
      delete filtro.tipoTramite; // ya va implícito en cada rama del $or
    }

    const [items, total] = await Promise.all([
      CustodiaEvento.find(filtro)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CustodiaEvento.countDocuments(filtro),
    ]);

    res.json({ ok: true, data: { items, total, page, limit } });
  } catch (e) {
    console.error('CUSTODIA EVENTOS ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo bitácora' });
  }
});

/* ---------------------------------------------------------------------- */
/* GET /api/custodia/:tipo/:control                                        */
/* Estado actual + historial de un trámite puntual.                        */
/* ---------------------------------------------------------------------- */
router.get('/:tipo/:control', async (req, res) => {
  try {
    const user = getUser(req);
    const parsed = parseTipoControl(req, res);
    if (!parsed) return;
    const { tipo, control } = parsed;

    const doc = await cargarTramite(tipo, control);
    if (!doc) return res.status(404).json({ ok: false, msg: 'Trámite no encontrado' });

    if (!puedeVerTodo(user.role) && !esPropio(doc.abogado, user.nombre)) {
      return res.status(403).json({ ok: false, msg: 'No tienes acceso a este trámite' });
    }

    const eventos = await CustodiaEvento.find({ tipoTramite: tipo, control }).sort({ createdAt: -1 }).lean();

    res.json({ ok: true, data: { ...resumenTramite(tipo, doc), eventos } });
  } catch (e) {
    console.error('CUSTODIA DETALLE ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo custodia del trámite' });
  }
});

/* ---------------------------------------------------------------------- */
/* POST /api/custodia/:tipo/:control/enviar                                */
/* El abogado (o asistente) marca que envía el expediente a recepción.     */
/* ---------------------------------------------------------------------- */
router.post('/:tipo/:control/enviar', async (req, res) => {
  try {
    const user = getUser(req);
    if (!esAbogadoLike(user.role)) {
      return res.status(403).json({ ok: false, msg: 'Solo un abogado/asistente puede enviar el trámite a recepción' });
    }

    const parsed = parseTipoControl(req, res);
    if (!parsed) return;
    const { tipo, control } = parsed;

    const doc = await cargarTramite(tipo, control);
    if (!doc) return res.status(404).json({ ok: false, msg: 'Trámite no encontrado' });

    if (user.role !== 'ADMIN' && !esPropio(doc.abogado, user.nombre)) {
      return res.status(403).json({ ok: false, msg: 'Solo puedes enviar trámites que sean tuyos' });
    }

    const estadoActual = doc.custodia?.estado || 'CON_ABOGADO';
    if (estadoActual !== 'CON_ABOGADO') {
      return res.status(400).json({
        ok: false,
        msg: `Este trámite no está contigo actualmente (estado: ${estadoActual}).`,
      });
    }

    doc.custodia = {
      estado: 'ENVIADO_A_RECEPCION',
      abogadoId: user.id,
      abogadoNombre: user.nombre,
      actualizadoEn: new Date(),
      actualizadoPor: user.nombre,
    };
    await doc.save();

    await CustodiaEvento.create({
      tipoTramite: tipo,
      control,
      accion: 'ENVIADO_A_RECEPCION',
      deUsuarioId: user.id,
      deUsuarioNombre: user.nombre,
      notas: req.body?.notas || '',
    });

    res.json({ ok: true, data: resumenTramite(tipo, doc) });
  } catch (e) {
    console.error('CUSTODIA ENVIAR ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error marcando envío a recepción' });
  }
});

/* ---------------------------------------------------------------------- */
/* POST /api/custodia/:tipo/:control/recibir                               */
/* Recepción confirma que ya tiene físicamente el expediente.              */
/* ---------------------------------------------------------------------- */
router.post('/:tipo/:control/recibir', async (req, res) => {
  try {
    const user = getUser(req);
    if (!esRecepcionLike(user.role)) {
      return res.status(403).json({ ok: false, msg: 'Solo recepción puede marcar un trámite como recibido' });
    }

    const parsed = parseTipoControl(req, res);
    if (!parsed) return;
    const { tipo, control } = parsed;

    const doc = await cargarTramite(tipo, control);
    if (!doc) return res.status(404).json({ ok: false, msg: 'Trámite no encontrado' });

    const estadoActual = doc.custodia?.estado || 'CON_ABOGADO';
    if (estadoActual !== 'ENVIADO_A_RECEPCION') {
      return res.status(400).json({
        ok: false,
        msg:
          estadoActual === 'CON_ABOGADO'
            ? 'El abogado todavía no ha marcado este trámite como enviado a recepción.'
            : `Este trámite no está esperando ser recibido (estado: ${estadoActual}).`,
      });
    }

    doc.custodia = {
      ...(doc.custodia?.toObject ? doc.custodia.toObject() : doc.custodia || {}),
      estado: 'EN_RECEPCION',
      actualizadoEn: new Date(),
      actualizadoPor: user.nombre,
    };
    await doc.save();

    await CustodiaEvento.create({
      tipoTramite: tipo,
      control,
      accion: 'RECIBIDO_EN_RECEPCION',
      deUsuarioId: user.id,
      deUsuarioNombre: user.nombre,
      notas: req.body?.notas || '',
    });

    res.json({ ok: true, data: resumenTramite(tipo, doc) });
  } catch (e) {
    console.error('CUSTODIA RECIBIR ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error marcando recibido en recepción' });
  }
});

/* ---------------------------------------------------------------------- */
/* POST /api/custodia/:tipo/:control/entregar                              */
/* Recepción marca que le regresó el expediente al abogado. NO es una      */
/* entrega a "quien sea": siempre va al abogado que el propio trámite      */
/* tiene asignado (doc.abogado) — se resuelve solo, sin elegir a nadie.    */
/* Queda "pendiente" hasta que ese abogado confirme.                       */
/* ---------------------------------------------------------------------- */
router.post('/:tipo/:control/entregar', async (req, res) => {
  try {
    const user = getUser(req);
    if (!esRecepcionLike(user.role)) {
      return res.status(403).json({ ok: false, msg: 'Solo recepción puede entregar un trámite a un abogado' });
    }

    const parsed = parseTipoControl(req, res);
    if (!parsed) return;
    const { tipo, control } = parsed;

    const doc = await cargarTramite(tipo, control);
    if (!doc) return res.status(404).json({ ok: false, msg: 'Trámite no encontrado' });

    const estadoActual = doc.custodia?.estado || 'CON_ABOGADO';
    if (estadoActual !== 'EN_RECEPCION') {
      return res.status(400).json({
        ok: false,
        msg: `Este trámite no está en recepción todavía (estado: ${estadoActual}).`,
      });
    }

    const abogado = await resolverAbogadoAsignado(doc.abogado);
    if (!abogado) {
      return res.status(400).json({
        ok: false,
        msg: `No se encontró en el catálogo de abogados a quién coincida con "${doc.abogado || 'sin asignar'}". Pide a un administrador que revise el nombre del abogado en este trámite.`,
      });
    }

    doc.custodia = {
      estado: 'ENTREGADO_PENDIENTE_CONFIRMACION',
      abogadoId: abogado._id,
      abogadoNombre: abogado.nombre,
      actualizadoEn: new Date(),
      actualizadoPor: user.nombre,
    };
    await doc.save();

    await CustodiaEvento.create({
      tipoTramite: tipo,
      control,
      accion: 'ENTREGADO_A_ABOGADO',
      deUsuarioId: user.id,
      deUsuarioNombre: user.nombre,
      paraUsuarioId: abogado._id,
      paraUsuarioNombre: abogado.nombre,
      notas: req.body?.notas || '',
    });

    res.json({ ok: true, data: resumenTramite(tipo, doc) });
  } catch (e) {
    console.error('CUSTODIA ENTREGAR ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error entregando el trámite al abogado' });
  }
});

/* ---------------------------------------------------------------------- */
/* POST /api/custodia/:tipo/:control/confirmar                             */
/* El ABOGADO DESTINATARIO confirma, desde su propia sesión, que ya tiene  */
/* el expediente. Esta es la única acción que "cierra" el ciclo y la que   */
/* protege a recepción — nadie más puede confirmar en su nombre.           */
/* ---------------------------------------------------------------------- */
router.post('/:tipo/:control/confirmar', async (req, res) => {
  try {
    const user = getUser(req);

    const parsed = parseTipoControl(req, res);
    if (!parsed) return;
    const { tipo, control } = parsed;

    const doc = await cargarTramite(tipo, control);
    if (!doc) return res.status(404).json({ ok: false, msg: 'Trámite no encontrado' });

    if (doc.custodia?.estado !== 'ENTREGADO_PENDIENTE_CONFIRMACION') {
      return res.status(400).json({ ok: false, msg: 'Este trámite no tiene una entrega pendiente de confirmar' });
    }

    const esDestinatario = doc.custodia.abogadoId != null && doc.custodia.abogadoId === user.id;
    if (!esDestinatario && user.role !== 'ADMIN') {
      return res.status(403).json({ ok: false, msg: 'Solo el abogado al que se le entregó el trámite puede confirmarlo' });
    }

    doc.custodia = {
      ...(doc.custodia?.toObject ? doc.custodia.toObject() : doc.custodia),
      estado: 'CON_ABOGADO',
      actualizadoEn: new Date(),
      actualizadoPor: user.nombre,
    };
    await doc.save();

    await CustodiaEvento.create({
      tipoTramite: tipo,
      control,
      accion: 'CONFIRMADO_POR_ABOGADO',
      deUsuarioId: user.id,
      deUsuarioNombre: user.nombre,
      notas: req.body?.notas || '',
    });

    res.json({ ok: true, data: resumenTramite(tipo, doc) });
  } catch (e) {
    console.error('CUSTODIA CONFIRMAR ERROR:', e);
    res.status(500).json({ ok: false, msg: 'Error confirmando recepción del trámite' });
  }
});

module.exports = router;
