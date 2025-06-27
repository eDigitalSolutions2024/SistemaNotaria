const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Abogado = require('./models/Abogado');
const Cliente = require('./models/Cliente');

const app = express();
app.use(express.json());
app.use(cors());

// Conexión a MongoDB
mongoose.connect('mongodb://localhost:27017/notaria', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});



// Ruta para registrar abogado
app.post('/abogados', async (req, res) => {
  try {

    const { nombre, orden } = req.body;

    const existente = await Abogado.findOne({ nombre: new RegExp(`^${nombre}$`,'i') });
    if (existente) {
      return res.status(400).json({ mensaje: 'Ya existe un abogado con ese nombre' });
    }
    //Buscar el ultimo ID de abogado creado
    const ultimo = await Abogado.findOne().sort({_id: -1}).exec();
    const nuevoId = ultimo ? ultimo._id + 1 : 1001; //comienza desde 1001
    
    
    const nuevo = new Abogado({
      _id: nuevoId,  // ← ID personalizado
      nombre,
      orden
    });
    await nuevo.save();
    res.json({ mensaje: 'Abogado registrado con exito', abogado: nuevo });
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

    const nuevoCliente = new Cliente({
      _id: nuevoId,
      nombre: req.body.nombre,
      abogado_asignado: abogadoDisponible ? abogadoDisponible._id : null,
      estado: abogadoDisponible ? 'Asignado' : 'En espera',
      en_espera: !abogadoDisponible
    });

    await nuevoCliente.save();

    if (abogadoDisponible) {
      abogadoDisponible.disponible = false;
      abogadoDisponible.asignaciones += 1;
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
      motivo: cliente.motivo || ''    
    }));

    res.json(respuesta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener clientes' });
  }
});

app.put('/liberar/:clienteId', async (req, res) => {
  try {
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
    await abogado.save();

    // 4. Asignar al siguiente cliente en espera
    const siguiente = await Cliente.findOne({ estado: 'En espera' }).sort({ _id: 1 });
    if (siguiente) {
      siguiente.estado = 'Asignado';
      siguiente.abogado_asignado = abogado._id;
      siguiente.en_espera = false;
      await siguiente.save();

      abogado.disponible = false;
      abogado.asignaciones += 1;
      await abogado.save();
    }

    res.json({
      mensaje: 'Cliente finalizado. Abogado liberado y nuevo cliente asignado (si existía).',
      nuevoClienteAsignado: siguiente ? siguiente.nombre : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al liberar abogado' });
  }
});



/*app.put('/abogados/liberar/:id', async (req, res) => {
  try {
    const abogado = await Abogado.findById(req.params.id);
    if (!abogado) {
      return res.status(404).json({ mensaje: 'Abogado no encontrado' });
    }

    // Buscar el cliente que tiene asignado este abogado y cambiar su estado
    const cliente = await Cliente.findOne({ 
      abogado_asignado: abogado._id, 
      estado: 'Asignado'
     });

    if (cliente) {
      cliente.estado = 'Finalizado';
      await cliente.save();
    }

    abogado.disponible = true;
    await abogado.save();

    res.json({
      mensaje: `Abogado ${abogado.nombre} liberado correctamente.`,
      cliente: cliente?.nombre || null});  
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al liberar abogado' });
  }
});
*/
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



app.listen(3001, () => console.log('Servidor backend en http://localhost:3001'));
