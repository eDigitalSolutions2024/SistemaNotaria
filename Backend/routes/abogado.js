const express = require('express');
const router = express.Router();
const Abogado = require('../models/Abogado');
const Cliente = require('../models/Cliente');
const Sala = require('../models/Sala');
const auth = require('../middleware/auth');
const { registrar } = require('../utils/bitacora');

const ROLES_VALIDOS = ['ADMIN', 'ABOGADO', 'ASISTENTE', 'PROTOCOLITO', 'RECEPCION'];
const PERMISOS_VALIDOS = ['recibosMontoBajo', 'escriturasVistaTotal', 'cancelarFolios'];

function esAdmin(req) {
  const role = String(req.user?.role || req.user?.rol || '').toUpperCase();
  return role === 'ADMIN';
}

// Ruta para registrar abogado
router.post('/', auth, async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({ mensaje: 'Solo un administrador puede registrar usuarios' });
    }
    const { nombre, orden, role, abogadoJefe } = req.body;

    const existente = await Abogado.findOne({ nombre: new RegExp(`^${nombre}$`, 'i') });
    if (existente) {
      return res.status(400).json({ mensaje: 'Ya existe un abogado con ese nombre' });
    }

    const ultimo = await Abogado.findOne().sort({ _id: -1 }).exec();
    const nuevoId = ultimo ? ultimo._id + 1 : 1001;

    const nuevo = new Abogado({
      _id: nuevoId,
      nombre,
      orden,
      disponible: true,
      asignaciones: 0,
      ubicacion: '---', // ✅ Inicializar ubicación
      // si mandan role y es válido, lo respetamos; si no, se queda el default del schema
      ...(role && ROLES_VALIDOS.includes(role) ? { role } : {})
    });

    // 🔹 Si se crea un ASISTENTE y se manda abogadoJefe, lo ligamos
    if (nuevo.role === 'ASISTENTE' && abogadoJefe) {
      const jefeIdNum = Number(abogadoJefe);
      if (Number.isFinite(jefeIdNum)) {
        const jefe = await Abogado.findById(jefeIdNum);
        if (jefe && jefe.role === 'ABOGADO') {
          nuevo.abogadoJefe = jefe._id;
        }
      }
    }

    await nuevo.save();

    // 💡 Nueva lógica: revisar si hay clientes en espera
    const clienteEnEspera =
      (await Cliente.findOne({
        en_espera: true,
        estado: 'En espera',
        tieneCita: true
      }).sort({ _id: 1 })) ||
      (await Cliente.findOne({
        en_espera: true,
        estado: 'En espera',
        tieneCita: false
      }).sort({ _id: 1 }));

    let mensaje = 'Abogado registrado con éxito';

    if (clienteEnEspera) {
      clienteEnEspera.estado = 'Asignado';
      clienteEnEspera.en_espera = false;
      clienteEnEspera.abogado_asignado = nuevo._id;
      await clienteEnEspera.save();

      nuevo.disponible = false;
      nuevo.asignaciones += 1;
      await nuevo.save();

      mensaje += `. Cliente en espera asignado: ${clienteEnEspera.nombre}`;
    }

    await nuevo.save(); // Esto guarda la ubicación correctamente (y cualquier cambio extra)

    await registrar(req, {
      accion: 'CREAR_USUARIO',
      entidad: 'Abogado',
      entidadId: nuevo._id,
      detalle: `Usuario creado: "${nuevo.nombre}" (${nuevo.role})`,
    });

    res.json({ mensaje, abogado: nuevo });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al guardar abogado' });
  }
});

router.put('/liberar/:clienteId', auth, async (req, res) => {
  try {
    console.log('Cliente ID recibido:', req.params.clienteId);
    console.log('Datos recibidos:', req.body);

    const cliente = await Cliente.findById(req.params.clienteId);
    if (!cliente) {
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }

    const { motivo, accion } = req.body;

    if (!motivo || !accion) {
      return res.status(400).json({ mensaje: 'Debe seleccionar una acción y escribir un motivo.' });
    }

    // 1. Finalizar cliente actual
    cliente.estado = 'Finalizado';
    cliente.motivo = motivo;
    cliente.accion = accion;
    await cliente.save();

    // 2. Obtener abogado actual
    const abogado = await Abogado.findById(cliente.abogado_asignado);
    if (!abogado) {
      return res.status(404).json({ mensaje: 'Abogado no encontrado' });
    }

    // 3. Liberar al abogado
    abogado.disponible = true;
    abogado.ubicacion = '---'; // ✅ Limpiar ubicación
    await abogado.save();

    // 4. Liberar la sala asignada a este abogado
    await Sala.findOneAndUpdate(
      { abogado_asignado: abogado._id },
      { disponible: true, abogado_asignado: null }
    );

    // 5. Asignar al siguiente cliente en espera
    // Buscar siguiente cliente en espera (con cita tiene prioridad)
    let siguienteCliente = await Cliente.findOne({
      en_espera: true,
      estado: 'En espera',
      abogado_preferido: abogado._id,
      tieneCita: true
    }).sort({ _id: 1 });

    // Si no hay clientes específicos, se busca alguno general
    if (!siguienteCliente) {
      siguienteCliente =
        (await Cliente.findOne({
          en_espera: true,
          estado: 'En espera',
          tieneCita: true,
          abogado_preferido: null
        }).sort({ _id: 1 })) ||
        (await Cliente.findOne({
          en_espera: true,
          estado: 'En espera',
          tieneCita: false,
          abogado_preferido: null
        }).sort({ _id: 1 }));
    }

    if (siguienteCliente) {
      siguienteCliente.estado = 'Asignado';
      siguienteCliente.en_espera = false;
      siguienteCliente.abogado_asignado = abogado._id;
      await siguienteCliente.save();

      abogado.disponible = false;
      abogado.asignaciones += 1;
      await abogado.save();

      // Asignar sala al abogado
      const nuevaSala = await Sala.findOne({ disponible: true });

      if (nuevaSala) {
        nuevaSala.disponible = false;
        nuevaSala.abogado_asignado = abogado._id;
        await nuevaSala.save();
        abogado.ubicacion = nuevaSala.nombre;
      } else {
        abogado.ubicacion = 'Sin sala';
      }
    }

    await abogado.save();
    const io = req.app.get('io');
    io.emit('clienteActualizado');

    res.json({
      mensaje: 'Cliente finalizado. Abogado liberado y nuevo cliente asignado (si existía).',
      nuevoClienteAsignado: siguienteCliente ? siguienteCliente.nombre : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al liberar abogado' });
  }
});

// Obtener todos los abogados
router.get('/', auth, async (req, res) => {
  try {
    const abogados = await Abogado.find().sort({ orden: 1 });
    res.json(abogados);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener abogados' });
  }
});

// === EDITAR DATOS DEL ABOGADO ===
// PUT /abogados/:id
router.put('/:id', auth, async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({ mensaje: 'Solo un administrador puede editar usuarios' });
    }
    const id = req.params.id; // tu _id es numérico (p.ej. 1001), pero mongoose acepta string numérico
    const { nombre, orden, disponible, ubicacion, role, abogadoJefe } = req.body;

    // Validar existencia
    const abogado = await Abogado.findById(id);
    if (!abogado) return res.status(404).json({ mensaje: 'Abogado no encontrado' });

    // Si cambia el nombre, verificar duplicado (case-insensitive) ignorando su propio _id
    if (typeof nombre === 'string' && nombre.trim()) {
      const dup = await Abogado.findOne({
        _id: { $ne: abogado._id },
        nombre: new RegExp(`^${nombre.trim()}$`, 'i'),
      });
      if (dup) return res.status(400).json({ mensaje: 'Ya existe un abogado con ese nombre' });
      abogado.nombre = nombre.trim();
    }

    if (orden !== undefined) {
      const n = Number(orden);
      if (!Number.isFinite(n)) return res.status(400).json({ mensaje: 'El orden debe ser numérico' });
      abogado.orden = n;
    }

    if (typeof disponible === 'boolean') {
      abogado.disponible = disponible;
    }

    if (typeof ubicacion === 'string') {
      abogado.ubicacion = ubicacion.trim() || '---';
    }

    // Rol (si viene y es válido)
    if (role && ROLES_VALIDOS.includes(role)) {
      abogado.role = role;
    }

    // 🔹 Manejo de abogadoJefe (solo aplica para asistentes)
    if (abogado.role === 'ASISTENTE') {
      if (abogadoJefe === undefined || abogadoJefe === '' || abogadoJefe === null) {
        // Sin jefe asignado
        abogado.abogadoJefe = null;
      } else {
        const jefeIdNum = Number(abogadoJefe);
        if (!Number.isFinite(jefeIdNum)) {
          return res.status(400).json({ mensaje: 'El ID del abogado responsable no es válido' });
        }
        const jefe = await Abogado.findById(jefeIdNum);
        if (!jefe || jefe.role !== 'ABOGADO') {
          return res.status(400).json({ mensaje: 'El abogado responsable no existe o no es un abogado válido' });
        }
        abogado.abogadoJefe = jefe._id;
      }
    } else {
      // Cualquier otro rol no debe tener abogadoJefe
      abogado.abogadoJefe = null;
    }

    await abogado.save();

    await registrar(req, {
      accion: 'EDITAR_USUARIO',
      entidad: 'Abogado',
      entidadId: abogado._id,
      detalle: `Usuario editado: "${abogado.nombre}" (${abogado.role})`,
    });

    return res.json({ mensaje: 'Abogado actualizado', abogado });
  } catch (err) {
    console.error('UPDATE ABOGADO ERROR:', err);
    return res.status(500).json({ mensaje: 'Error al actualizar abogado', error: err.message });
  }
});

// === ACTUALIZAR CONTRASEÑA ===
// PUT /abogados/:id/password
router.put('/:id/password', auth, async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({ mensaje: 'Solo un administrador puede cambiar contraseñas' });
    }
    const id = req.params.id;
    const { password } = req.body;

    if (!password || String(password).length < 4) {
      return res.status(400).json({ mensaje: 'La contraseña es obligatoria (mínimo 4 caracteres)' });
    }

    const abogado = await Abogado.findById(id);
    if (!abogado) return res.status(404).json({ mensaje: 'Abogado no encontrado' });

    await abogado.setPassword(password);
    await abogado.save();

    await registrar(req, {
      accion: 'CAMBIAR_PASSWORD',
      entidad: 'Abogado',
      entidadId: abogado._id,
      detalle: `Contraseña cambiada para "${abogado.nombre}"`,
    });

    return res.json({ mensaje: 'Contraseña actualizada' });
  } catch (err) {
    console.error('UPDATE PASSWORD ERROR:', err);
    return res.status(500).json({ mensaje: 'Error al actualizar contraseña', error: err.message });
  }
});

// === CANDADOS / PERMISOS ESPECIALES ===
// PATCH /abogados/:id/permisos
// body: { recibosMontoBajo?: boolean, escriturasVistaTotal?: boolean }
router.patch('/:id/permisos', auth, async (req, res) => {
  try {
    if (!esAdmin(req)) {
      return res.status(403).json({ mensaje: 'Solo un administrador puede gestionar permisos especiales' });
    }

    const abogado = await Abogado.findById(req.params.id);
    if (!abogado) return res.status(404).json({ mensaje: 'Abogado no encontrado' });

    if (!abogado.permisosEspeciales) abogado.permisosEspeciales = {};

    const cambios = [];
    for (const clave of PERMISOS_VALIDOS) {
      if (typeof req.body?.[clave] === 'boolean') {
        abogado.permisosEspeciales[clave] = req.body[clave];
        cambios.push(`${clave}=${req.body[clave]}`);
      }
    }

    if (!cambios.length) {
      return res.status(400).json({ mensaje: 'Ningún permiso válido para actualizar' });
    }

    abogado.markModified('permisosEspeciales');
    await abogado.save();

    await registrar(req, {
      accion: 'EDITAR_PERMISOS',
      entidad: 'Abogado',
      entidadId: abogado._id,
      detalle: `Permisos de "${abogado.nombre}": ${cambios.join(', ')}`,
    });

    return res.json({ mensaje: 'Permisos actualizados', abogado });
  } catch (err) {
    console.error('UPDATE PERMISOS ERROR:', err);
    return res.status(500).json({ mensaje: 'Error al actualizar permisos', error: err.message });
  }
});

module.exports = router;
