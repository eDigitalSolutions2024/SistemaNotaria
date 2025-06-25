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
    //Buscar el ultimo ID de abogado creado
    const ultimo = await Abogado.findOne().sort({_id: -1}).exec();
    const nuevoId = ultimo ? ultimo._id + 1 : 1001; //comienza desde 1001
    
    
    const nuevo = new Abogado({
      _id: nuevoId,  // ← ID personalizado
      nombre: req.body.nombre,
      orden: req.body.orden
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

    if (!abogadoDisponible) {
      return res.status(400).json({ mensaje: 'No hay abogados disponibles en este momento.' });
    }

    const ultimo = await Cliente.findOne().sort({_id:-1}).exec();
    const nuevoId= ultimo ? ultimo._id + 1 : 2001;
    
    const nuevoCliente = new Cliente({
     _id: nuevoId,
      nombre: req.body.nombre,
      abogado_asignado: abogadoDisponible._id
    });

    await nuevoCliente.save();

    abogadoDisponible.disponible = false;
    abogadoDisponible.asignaciones += 1;
    await abogadoDisponible.save();

    res.json({ mensaje: 'Cliente registrado y abogado asignado', 
      cliente: nuevoCliente ,
    abogado: {
      id: abogadoDisponible._id,
      nombre: abogadoDisponible.nombre
    } 
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
      estado: cliente.estado
    }));

    res.json(respuesta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener clientes' });
  }
});

app.put('/abogados/liberar/:id', async (req, res) => {
  try {
    const abogado = await Abogado.findById(req.params.id);
    if (!abogado) {
      return res.status(404).json({ mensaje: 'Abogado no encontrado' });
    }

    // Buscar el cliente que tiene asignado este abogado y cambiar su estado
    const cliente = await Cliente.findOne({ 
      abogado_asignado: abogado._id, 
      estado: 'asignado'
     });

    if (cliente) {
      cliente.estado = 'finalizado';
      await cliente.save();
    }

    abogado.disponible = true;
    await abogado.save();

    res.json({
      mensaje: `Abogado ${abogado.nombre} liberado correctamente.`,
      cliente: cliente ? cliente.nombre : 'No se encontró cliente activo'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al liberar abogado' });
  }
});

app.put('/liberar/:clienteId', async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.clienteId);
    if (!cliente || cliente.estado !== 'asignado') {
      return res.status(404).json({ mensaje: 'Cliente no válido o ya finalizado' });
    }

    const abogado = await Abogado.findById(cliente.abogado_asignado);
    if (abogado) {
      abogado.disponible = true;
      await abogado.save();
    }

    cliente.estado = 'finalizado';
    await cliente.save();

    res.json({ mensaje: 'Abogado y cliente actualizados correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al liberar abogado y cliente' });
  }
});




app.listen(3001, () => console.log('Servidor backend en http://localhost:3001'));
