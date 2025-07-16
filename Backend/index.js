const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Abogado = require('./models/Abogado');
const Cliente = require('./models/Cliente');
const Sala = require('./models/Sala'); // ✅ IMPORTANTE



const app = express();
app.use(express.json());
app.use(cors());

// Conexión a MongoDB
require('dotenv').config(); // Al inicio

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})


// Ruta para registrar abogado
app.post('/abogados', async (req, res) => {
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


// Ruta para registrar Clientes
app.post('/clientes', async (req, res) => {
  try {
    const abogadoDisponible = await Abogado.findOne({ disponible: true }).sort({ orden: 1 });

    const ultimo = await Cliente.findOne().sort({ _id: -1 }).exec();
    const nuevoId = ultimo ? ultimo._id + 1 : 2001;
    const { nombre, tipoServicio, tieneCita } = req.body;
    console.log("Body recibido:", req.body);
    const nuevoCliente = new Cliente({
      _id: nuevoId,
      nombre,
      servicio: tipoServicio,
      tieneCita,
      estado: abogadoDisponible ? 'Asignado' : 'En espera',
      en_espera: !abogadoDisponible,
      abogado_asignado: abogadoDisponible ? abogadoDisponible._id : null
    });

    await nuevoCliente.save();

    if (abogadoDisponible) {
  // Asignar cliente al abogado
  abogadoDisponible.disponible = false;
  abogadoDisponible.asignaciones += 1;

  // Buscar sala disponible
  const salaDisponible = await Sala.findOne({ disponible: true });

  if (salaDisponible) {
    salaDisponible.disponible = false;
    salaDisponible.abogado_asignado = abogadoDisponible._id;
    await salaDisponible.save();

    // Actualizar ubicación del abogado
    abogadoDisponible.ubicacion = salaDisponible.nombre;
  } else {
    abogadoDisponible.ubicacion = 'Sin sala';
  }

  await abogadoDisponible.save();
}


    res.status(200).json({
      mensaje: abogadoDisponible
        ? 'Cliente registrado y abogado asignado'
        : 'Cliente registrado en lista de espera',
      cliente: nuevoCliente,
      abogado: abogadoDisponible
        ? { id: abogadoDisponible._id, nombre: abogadoDisponible.nombre }
        : null
    });

 
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar cliente' });
  }
});


//Regresa datos de clientes con abogados asignados
app.get('/clientes', async (req, res) => {
  try {
    // Buscar todos los clientes y unir con el nombre del abogado
    const clientes = await Cliente.find().populate('abogado_asignado');

    // Transformar respuesta para incluir nombre del abogado
    const respuesta = clientes.map(cliente => ({
  id: cliente._id,
  nombre: cliente.nombre,
  abogado: cliente.abogado_asignado?.nombre || "No asignado",
  abogado_id: cliente.abogado_asignado?._id || null,
  hora_llegada: cliente.hora_llegada,
  estado: cliente.estado,
  accion: cliente.accion || '',
  motivo: cliente.motivo || '',
  servicio: cliente.servicio || '',            // ✅ AGREGADO
  tieneCita: cliente.tieneCita || false        // ✅ AGREGADO
}));


    res.json(respuesta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener clientes' });
  }
});

app.put('/liberar/:clienteId', async (req, res) => {
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
    const siguienteCliente = await Cliente.findOne({ 
      en_espera: true, 
      estado: 'En espera', 
      tieneCita: true 
    }).sort({ _id: 1 }) || await Cliente.findOne({ 
      en_espera: true, 
      estado: 'En espera', 
      tieneCita: false || null
    }).sort({ _id: 1 });

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
app.get('/abogados', async (req, res) => {
  try {
    const abogados = await Abogado.find().sort({ orden: 1 });
    res.json(abogados);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener abogados' });
  }
});

app.put('/clientes/accion/:id', async (req, res) => {
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

// GET /salas-disponibles
app.get('/salas', async (req, res) => {
  try {
    const salas = await Sala.find().populate('abogado_asignado');

    res.json(salas);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener salas' });
  }
});

app.get('/', (req, res) => {
  res.send('🚀 Servidor de Notaría corriendo correctamente');
});





app.listen(3001, '0.0.0.0', () => {
  console.log('✅ Servidor backend escuchando en todas las IPs: http://192.168.1.90:3001');
});


