const express = require('express');
const router = express.Router();
const Abogado = require('../models/Abogado');
const Cliente = require('../models/Cliente');
const Sala = require('../models/Sala');


// Ruta para registrar abogado
router.post('/', async (req, res) => {
  try {
    const { nombre, orden } = req.body;

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
      ubicacion: '---' // ✅ Inicializar ubicación
    });

    await nuevo.save();

    // 💡 Nueva lógica: revisar si hay clientes en espera
    const clienteEnEspera = await Cliente.findOne({
      en_espera: true,
      estado: 'En espera',
      tieneCita: true
    }).sort({ _id: 1 }) || await Cliente.findOne({
      en_espera: true,
      estado: 'En espera',
      tieneCita: false
    }).sort({ _id: 1 });

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
    
    

await nuevo.save();  // Esto guarda la ubicación correctamente

    res.json({ mensaje, abogado: nuevo });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al guardar abogado' });
  }
});

router.put('/liberar/:clienteId', async (req, res) => {
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
      abogado.ubicacion = '---' // ✅ Limpiar ubicación
      await abogado.save();

      // 4. Liberar la sala asignada a este abogado
      await Sala.findOneAndUpdate(
        { abogado_asignado: abogado._id },
        { disponible: true, abogado_asignado: null }
      );

    // 4. Asignar al siguiente cliente en espera
        // Buscar siguiente cliente en espera (con cita tiene prioridad)
          let siguienteCliente = await Cliente.findOne({ 
        en_espera: true, 
        estado: 'En espera', 
        abogado_preferido: abogado._id, 
        tieneCita: true 
      }).sort({ _id: 1 });

      // Si no hay clientes específicos, se busca alguno general
      if (!siguienteCliente) {
        siguienteCliente = await Cliente.findOne({
          en_espera: true,
          estado: 'En espera',
          tieneCita: true,
          abogado_preferido: null
        }).sort({ _id: 1 }) || await Cliente.findOne({
          en_espera: true,
          estado: 'En espera',
          tieneCita: false,
          abogado_preferido: null
        }).sort({ _id: 1 });
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
router.get('/', async (req, res) => {
  try {
    const abogados = await Abogado.find().sort({ orden: 1 });
    res.json(abogados);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener abogados' });
  }
});


module.exports = router;