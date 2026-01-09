const express = require('express');
const router = express.Router();
const Abogado = require('../models/Abogado');
const Cliente = require('../models/Cliente');
const Sala = require('../models/Sala');

router.post('/', async (req, res) => {
  try {
    // ⬇️ Compatibilidad de nombres + teléfono
    const nombre           = req.body.nombre;
    const tipoServicio     = req.body.tipoServicio ?? req.body.servicio ?? '';
    const tieneCita        = req.body.tieneCita;
    const abogadoPreferido = req.body.abogadoPreferido ?? req.body.abogado_preferido ?? null;
    const numero_telefono  = req.body.numero_telefono ?? ''; // ← NUEVO

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
          nombre,
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
      nombre,
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