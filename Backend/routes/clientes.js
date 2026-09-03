const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Abogado = require('../models/Abogado');
const Cliente = require('../models/Cliente');
const Sala = require('../models/Sala');
const {
  validateRealClientName,
  validateRealClientNameSync,
  getAbogadoNameTokenSets,
} = require('../utils/clientNameValidation');

function stripAccents(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

router.post('/', async (req, res) => {
  try {
    // ⬇️ Compatibilidad de nombres + teléfono
    const nombre           = req.body.nombre;
    const tipoServicio     = req.body.tipoServicio ?? req.body.servicio ?? '';
    const tieneCita        = req.body.tieneCita;
    const abogadoPreferido = req.body.abogadoPreferido ?? req.body.abogado_preferido ?? null;
    const numero_telefono  = req.body.numero_telefono ?? ''; // ← NUEVO

// ✅ NUEVA REGLA: siempre debe venir abogado seleccionado
if (!abogadoPreferido) {
  return res.status(400).json({ mensaje: 'Debes seleccionar un abogado.' });
}

    const allowedServicios = new Set(['Asesoría', 'Trámite', 'Presupuesto']);
if (!allowedServicios.has(tipoServicio)) {
  return res.status(400).json({ mensaje: 'Tipo de servicio inválido.' });
}



    const vName = await validateRealClientName(nombre);
if (!vName.ok) {
  return res.status(400).json({ mensaje: vName.mensaje });
}
// si quieres guardar el nombre ya limpio:
const nombreFinal = vName.nombreLimpio;



// ✅ CASO ESPECIAL: PRESUPUESTO
// - SÍ guarda abogado asignado (para mostrar nombre)
// - PERO NO lo marca ocupado
if (String(tipoServicio).toLowerCase() === 'presupuesto') {
  // Límite: el mismo usuario no puede registrar el mismo nombre más de 2 veces hoy
  const userId = getUserIdFromReq(req);
  const vecesHoy = await contarNombreHoyPorUsuario(nombreFinal, userId);
  if (vecesHoy >= 2) {
    return res.status(429).json({
      mensaje: 'Ya registraste este nombre de cliente 2 veces hoy. No es posible registrarlo de nuevo.',
      code: 'CLIENTE_NOMBRE_LIMITE',
    });
  }

  const ultimo = await Cliente.findOne().sort({ _id: -1 }).exec();
  const nuevoId = ultimo ? ultimo._id + 1 : 2001;

  // 1) Elegir abogado para mostrar (preferido si mandan uno, si no el primero por orden)
  let abogadoMostrar = null;

  if (abogadoPreferido) {
    abogadoMostrar = await Abogado.findOne({ _id: abogadoPreferido }); // 👈 sin filtro disponible
  }

  if (!abogadoMostrar) {
    abogadoMostrar = await Abogado.findOne().sort({ orden: 1 }); // 👈 el primero por orden
  }

  const nuevoCliente = new Cliente({
    _id: nuevoId,
    nombre: nombreFinal,
    numero_telefono,
    servicio: tipoServicio,

    // presupuesto no ocupa flujo normal
    tieneCita: false,
    estado: 'Finalizado',
    en_espera: false,

    // ✅ guardar para que se vea el nombre en tabla
    abogado_asignado: abogadoMostrar ? abogadoMostrar._id : null,
    abogado_preferido: abogadoMostrar ? abogadoMostrar._id : null,

    accion: 'PRESUPUESTO',
    motivo: 'PRESUPUESTO',
    creadoPor: userId,
  });

  await nuevoCliente.save();

  const io = req.app.get('io');
  io.emit('clienteActualizado');

  return res.status(200).json({
    mensaje: 'Cliente registrado como PRESUPUESTO (no ocupa abogado)',
    cliente: nuevoCliente,
    abogado: abogadoMostrar ? { id: abogadoMostrar._id, nombre: abogadoMostrar.nombre } : null
  });
}





    console.log("Body recibido:", req.body);

    const ultimo = await Cliente.findOne().sort({ _id: -1 }).exec();
    const nuevoId = ultimo ? ultimo._id + 1 : 2001;

    let abogadoAsignado = null;

    // Si tiene cita y mandaron abogadoPreferido, se intenta asignar a ese abogado
    if (abogadoPreferido) {
      const abogado = await Abogado.findOne({ _id: abogadoPreferido, disponible: true });
      if (abogado) {
        abogadoAsignado = abogado;
        abogadoAsignado.disponible = false;
        abogadoAsignado.asignaciones += 1;
        abogadoAsignado.ubicacion = 'Sin sala'; // ✅ Inicializar ubicación
        await abogadoAsignado.save(); // ← no se toca
      } else {
        // Si el abogado no está disponible, el cliente queda en espera por ese abogado
        const nuevoCliente = new Cliente({
          _id: nuevoId,
          nombre: nombreFinal,
          numero_telefono,                 // ← guarda teléfono
          servicio: tipoServicio,
          tieneCita,
          estado: 'En espera',
          en_espera: true,
          abogado_asignado: null,
          abogado_preferido: abogadoPreferido  // Se guarda el abogado aunque esté ocupado
        });

        await nuevoCliente.save();
        const abogadoNombre = await Abogado.findOne({ _id: abogadoPreferido });
        return res.status(200).json({
          mensaje: `Cliente registrado en espera con el abogado ${abogadoNombre?.nombre || 'desconocido'}, que actualmente está ocupado.`,
          cliente: nuevoCliente,
          abogado: null
        });
      }
    }

    // Si no se asignó por preferencia, aplicar lógica automática
    /*if (!abogadoAsignado) {
      console.log("🔍 Abogado encontrado:", abogadoAsignado);
      abogadoAsignado = await Abogado.findOne({ disponible: true }).sort({ orden: 1 });

      if (abogadoAsignado) {
        abogadoAsignado.disponible = false;
        abogadoAsignado.asignaciones += 1;
        abogadoAsignado.ubicacion = 'Sin sala'; // ✅ Inicializar ubicación
        await abogadoAsignado.save(); // ← no se toca
      }
    }*/

    const nuevoCliente = new Cliente({
      _id: nuevoId,
      nombre: nombreFinal,
      numero_telefono,                     // ← guarda teléfono
      servicio: tipoServicio,
      tieneCita,
      estado: abogadoAsignado ? 'Asignado' : 'En espera',
      en_espera: !abogadoAsignado,
      abogado_asignado: abogadoAsignado ? abogadoAsignado._id : null,
      abogado_preferido: abogadoPreferido || null
    });

    await nuevoCliente.save();

    const io = req.app.get('io');
    io.emit('clienteActualizado');
    res.status(200).json({
      mensaje: abogadoAsignado
        ? 'Cliente registrado y abogado asignado'
        : 'Cliente registrado en lista de espera',
      cliente: nuevoCliente,
      abogado: abogadoAsignado
        ? { id: abogadoAsignado._id, nombre: abogadoAsignado.nombre }
        : null
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar cliente' });
  }
});





//Regresa datos de clientes con abogados asignados
router.get('/', async (req, res) => {
  try {
    const clientes = await Cliente.find()
    .sort({_id: 1 })
    .populate('abogado_asignado');

    const abogados = await Abogado.find({}, { _id: 1, nombre: 1 });
    const mapaAbogados = {};
    abogados.forEach(ab => { mapaAbogados[ab._id] = ab.nombre; });

    const respuesta = clientes.map(cliente => {
      const abogadoNombre = cliente.abogado_asignado?.nombre ||
                            mapaAbogados[cliente.abogado_preferido] ||
                            "No asignado";

      return {
        id: cliente._id,
        nombre: cliente.nombre,
        numero_telefono: cliente.numero_telefono || '',  // ← NUEVO
        abogado: abogadoNombre,
        abogado_id: cliente.abogado_asignado?._id || cliente.abogado_preferido || null,
        hora_llegada: cliente.hora_llegada,
        estado: cliente.estado,
        accion: cliente.accion || '',
        motivo: cliente.motivo || '',
        servicio: cliente.servicio || '',
        tieneCita: cliente.tieneCita || false
      };
    });

    res.json(respuesta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener clientes' });
  }
});




router.put('/api/clientes/accion/:id', async (req, res) => {
  const clienteId = parseInt(req.params.id);
  const { accion, motivo } = req.body;

  try {
    const cliente = await db.collection('clientes').findOne({ id: clienteId });
    if (!cliente) return res.status(404).json({ mensaje: 'Cliente no encontrado' });

    await db.collection('clientes').updateOne(
      { id: clienteId },
      { $set: { accion, motivo } }
    );

    res.json({ mensaje: 'Acción y motivo actualizados correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
});



// GET /api/clientes/search?q=alberto
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);

  // Regex seguro (escape de caracteres especiales)
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(safe, 'i');

  const items = await Cliente.find({ nombre: re })
    .select('id nombre abogado servicio tieneCita hora_llegada accion motivo')
    .limit(10)
    .lean();

  res.json(items);
});

// GET /clientes/by-servicio?servicio=Presupuesto
router.get('/by-servicio', async (req, res) => {
  try {
    const servicio = String(req.query.servicio || '').trim();
    if (!servicio) return res.status(400).json({ mensaje: 'servicio requerido' });

    const allowedServicios = new Set(['Asesoría', 'Trámite', 'Presupuesto']);
    if (!allowedServicios.has(servicio)) {
      return res.status(400).json({ mensaje: 'servicio inválido' });
    }

    const clientes = await Cliente.find({ servicio })
      .select('_id nombre numero_telefono servicio')
      .sort({ _id: -1 })
      .lean();

    // 🔒 Saca del selector cualquier cliente cuyo nombre ya no pasaría el
    // candado actual (genérico, o nombre real de alguien del staff) — evita
    // que sigan reutilizando registros viejos creados antes de que existiera
    // esta validación (ej. "particular uno", "gabriela villalba").
    const abogadoTokenSets = await getAbogadoNameTokenSets();
    const clientesValidos = clientes.filter(
      c => validateRealClientNameSync(c.nombre, abogadoTokenSets).ok
    );

    res.json(
  clientesValidos.map(c => ({
    ...c,
    id: c._id, // ✅ alias para tu frontend
  }))
);
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error al filtrar clientes' });
  }
});


function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Extrae el identificador del usuario desde el JWT (si viene) o usa fallback
function getUserIdFromReq(req) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
      return String(payload._id || payload.id || payload.nombre || payload.username || '');
    }
  } catch {}
  return String(req.body?.responsable || req.ip || 'anon');
}

// Cuenta cuántas veces el usuario ya registró ese mismo nombre normalizado hoy
async function contarNombreHoyPorUsuario(nombreFinal, userId) {
  const stripped = stripAccents(nombreFinal).toLowerCase().replace(/\s+/g, ' ').trim();
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end   = new Date(now); end.setHours(23, 59, 59, 999);

  // Busca candidatos del mismo usuario hoy cuyo primer token coincida (solo servicio Presupuesto)
  const firstToken = escapeRegex(stripped.split(' ')[0]);
  const candidatos = await Cliente.find({
    creadoPor: userId,
    servicio: 'Presupuesto',
    hora_llegada: { $gte: start, $lte: end },
    nombre: { $regex: new RegExp(firstToken, 'i') },
  }).lean();

  // Filtra en memoria normalizando acentos y mayúsculas
  return candidatos.filter(
    (c) => stripAccents(c.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim() === stripped
  ).length;
}

router.post('/express-presupuesto', async (req, res) => {
  try {
    const nombre = req.body.nombre?.trim();
    const abogadoPreferido = req.body.abogadoPreferido ?? null;
    const numero_telefono = req.body.numero_telefono ?? '';

    if (!nombre) {
      return res.status(400).json({ mensaje: 'El nombre es obligatorio.' });
    }

    const vName = await validateRealClientName(nombre);
    if (!vName.ok) {
      return res.status(400).json({ mensaje: vName.mensaje });
    }

    const nombreFinal = vName.nombreLimpio;

    // Límite: el mismo usuario no puede registrar el mismo nombre más de 2 veces hoy
    const userId = getUserIdFromReq(req);
    const vecesHoy = await contarNombreHoyPorUsuario(nombreFinal, userId);
    if (vecesHoy >= 2) {
      return res.status(429).json({
        mensaje: 'Ya registraste este nombre de cliente 2 veces hoy. No es posible registrarlo de nuevo.',
        code: 'CLIENTE_NOMBRE_LIMITE',
      });
    }

    const ultimo = await Cliente.findOne().sort({ _id: -1 }).exec();
    const nuevoId = ultimo ? ultimo._id + 1 : 2001;

    let abogadoMostrar = null;

    if (abogadoPreferido) {
      abogadoMostrar = await Abogado.findOne({ _id: abogadoPreferido });
    }

    if (!abogadoMostrar) {
      abogadoMostrar = await Abogado.findOne().sort({ orden: 1 });
    }

    const nuevoCliente = new Cliente({
      _id: nuevoId,
      nombre: nombreFinal,
      numero_telefono,
      servicio: 'Presupuesto',
      tieneCita: false,
      estado: 'Finalizado',
      en_espera: false,
      abogado_asignado: abogadoMostrar ? abogadoMostrar._id : null,
      abogado_preferido: abogadoMostrar ? abogadoMostrar._id : null,
      accion: 'PRESUPUESTO',
      motivo: 'PRESUPUESTO',
      creadoPor: userId,
    });

    await nuevoCliente.save();

    const io = req.app.get('io');
    io.emit('clienteActualizado');

    return res.status(201).json(nuevoCliente);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear cliente express de presupuesto' });
  }
});


// GET /clientes/:id  (trae un cliente por _id numérico)
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ mensaje: 'ID inválido' });

    const c = await Cliente.findById(id).lean();
    if (!c) return res.status(404).json({ mensaje: 'Cliente no encontrado' });

    res.json(c);
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error al obtener cliente' });
  }
});





module.exports = router;