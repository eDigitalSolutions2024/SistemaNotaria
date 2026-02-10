const express = require('express');
const router = express.Router();
const Abogado = require('../models/Abogado');
const Cliente = require('../models/Cliente');
const Sala = require('../models/Sala');



function stripAccents(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeName(s = '') {
  return String(s)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'"); // normaliza comillas/apóstrofes raros
}

function isAllSameLetter(word) {
  const w = word.toLowerCase();
  if (w.length < 4) return false; // no penalizar palabras cortas tipo "De", "La"
  return /^([a-zñ])\1+$/.test(w); // aaaa, bbbb...
}

function hasLowCharacterVariety(s) {
  // Si 80% o más de las letras son la misma, es basura (aaaaaa aaaaa)
  const letters = s.toLowerCase().replace(/[^a-zñ]/g, '');
  if (letters.length < 8) return false;

  const freq = {};
  for (const ch of letters) freq[ch] = (freq[ch] || 0) + 1;
  const max = Math.max(...Object.values(freq));
  return (max / letters.length) >= 0.8;
}

function hasSequentialGarbage(s) {
  const x = stripAccents(s).toLowerCase().replace(/\s+/g, '');
  // teclado / relleno típico
  const bad = [
    'asdf', 'qwerty', 'zxcv', '1234', '1111', '0000',
    'abcd', 'aaaa', 'bbbb', 'cccc'
  ];
  return bad.some(b => x.includes(b));
}

function validateRealClientName(nombre = '') {
  const original = normalizeName(nombre);

  if (!original) {
    return { ok: false, mensaje: 'El nombre del cliente es obligatorio.' };
  }

  // Solo letras (con acentos), espacios, guion y apóstrofe
  const allowed = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;
  if (!allowed.test(original)) {
    return { ok: false, mensaje: 'El nombre solo puede contener letras, espacios, guion y apóstrofe.' };
  }

  // Min longitud total (súper recomendado)
  if (original.length < 8) {
    return { ok: false, mensaje: 'Captura el nombre completo (mínimo 8 caracteres).' };
  }

  // Partes (palabras)
  const parts = original.split(' ').filter(Boolean);
  if (parts.length < 2) {
    return { ok: false, mensaje: 'Captura Nombre y Apellido del cliente.' };
  }

  // Normalizado para comparar
  const norm = stripAccents(original).toLowerCase();

  // Lista negra de tokens
  const bannedTokens = new Set([
    'x','xx','xxx',
    'test','prueba','demo',
    'cliente',
    'sinnombre','sin','nombre',
    'desconocido','anonimo','anonima',
    'na','n/a',
    'asdf','qwerty'
  ]);

  const tokens = norm
    .split(/\s+/)
    .map(t => t.replace(/[^a-z0-9ñ]/g, ''))
    .filter(Boolean);

  if (tokens.some(t => bannedTokens.has(t))) {
    return { ok: false, mensaje: 'No se permiten nombres genéricos como "Cliente", "Test", "X", etc.' };
  }

  // Bloqueo "cliente 1" / "cliente x" / "cliente123"
  if (tokens[0] === 'cliente') {
    const second = tokens[1] || '';
    const joined = tokens.join('');
    const isSingleLetter = /^[a-zñ]$/.test(second);
    const isNumber = /^\d+$/.test(second);
    const isClienteNumeroPegado = /^cliente\d+$/.test(joined);
    if (!second || isSingleLetter || isNumber || isClienteNumeroPegado) {
      return { ok: false, mensaje: 'No se permiten nombres tipo "Cliente 1" o "Cliente X". Captura el nombre real.' };
    }
  }

  // ✅ Palabras mínimas: cada palabra con 2+ letras (evita "Juan X")
  // Permitimos conectores comunes de 1-2 letras si quieres (de, del, la, los, y)
  const connectors = new Set(['de','del','la','las','los','y','mc','mac']);
  for (const p of parts) {
    const pNorm = stripAccents(p).toLowerCase().replace(/[^a-zñ]/g, '');
    if (!pNorm) continue;

    if (!connectors.has(pNorm) && pNorm.length < 2) {
      return { ok: false, mensaje: 'Cada parte del nombre debe tener al menos 2 letras (Nombre y Apellido reales).' };
    }

    // ✅ Bloquear palabras repetidas tipo aaaaaa
    if (isAllSameLetter(pNorm)) {
      return { ok: false, mensaje: 'El nombre parece inválido (letras repetidas). Captura el nombre real.' };
    }
  }

  // ✅ Bloquear baja variedad total (aaaaaa aaaaa)
  if (hasLowCharacterVariety(original)) {
    return { ok: false, mensaje: 'El nombre parece inválido (relleno). Captura el nombre real.' };
  }

  // ✅ Bloquear patrones tipo teclado
  if (hasSequentialGarbage(original)) {
    return { ok: false, mensaje: 'El nombre parece inválido. Captura el nombre real.' };
  }

  return { ok: true, nombreLimpio: original };
}



router.post('/', async (req, res) => {
  try {
    // ⬇️ Compatibilidad de nombres + teléfono
    const nombre           = req.body.nombre;
    const tipoServicio     = req.body.tipoServicio ?? req.body.servicio ?? '';
    const tieneCita        = req.body.tieneCita;
    const abogadoPreferido = req.body.abogadoPreferido ?? req.body.abogado_preferido ?? null;
    const numero_telefono  = req.body.numero_telefono ?? ''; // ← NUEVO


    const allowedServicios = new Set(['Asesoría', 'Trámite', 'Presupuesto']);
if (!allowedServicios.has(tipoServicio)) {
  return res.status(400).json({ mensaje: 'Tipo de servicio inválido.' });
}



    const vName = validateRealClientName(nombre);
if (!vName.ok) {
  return res.status(400).json({ mensaje: vName.mensaje });
}
// si quieres guardar el nombre ya limpio:
const nombreFinal = vName.nombreLimpio;



// ✅ CASO ESPECIAL: PRESUPUESTO
// - SÍ guarda abogado asignado (para mostrar nombre)
// - PERO NO lo marca ocupado
if (String(tipoServicio).toLowerCase() === 'presupuesto') {
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
    if (tieneCita && abogadoPreferido) {
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
    if (!abogadoAsignado) {
      console.log("🔍 Abogado encontrado:", abogadoAsignado);
      abogadoAsignado = await Abogado.findOne({ disponible: true }).sort({ orden: 1 });

      if (abogadoAsignado) {
        abogadoAsignado.disponible = false;
        abogadoAsignado.asignaciones += 1;
        abogadoAsignado.ubicacion = 'Sin sala'; // ✅ Inicializar ubicación
        await abogadoAsignado.save(); // ← no se toca
      }
    }

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

    res.json(
  clientes.map(c => ({
    ...c,
    id: c._id, // ✅ alias para tu frontend
  }))
);
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error al filtrar clientes' });
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