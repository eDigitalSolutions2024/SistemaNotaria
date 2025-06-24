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
    const nuevo = new Abogado({
      nombre: req.body.nombre,
      orden: req.body.orden
    });
    await nuevo.save();
    res.json({ mensaje: 'Abogado guardado', abogado: nuevo });
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

    const nuevoCliente = new Cliente({
      nombre: req.body.nombre,
      abogado_asignado: abogadoDisponible._id
    });

    await nuevoCliente.save();

    abogadoDisponible.disponible = false;
    abogadoDisponible.asignaciones += 1;
    await abogadoDisponible.save();

    res.json({ mensaje: 'Cliente registrado y abogado asignado', cliente: nuevoCliente });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar cliente' });
  }
});




app.listen(3001, () => console.log('Servidor backend en http://localhost:3001'));
