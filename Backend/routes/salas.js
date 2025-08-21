const express = require('express');
const router = express.Router();
const Sala = require('../models/Sala');
const Abogado = require('../models/Abogado');
const mongoose = require('mongoose');
// GET /salas-disponibles

router.get('/', async (req, res) => {
  try {
    const salas = await Sala.find()

    res.json(salas);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener salas' });
  }
});



router.put('/asignar', async (req, res) => {
  try {
     console.log("📥 Body recibido:", req.body);
    const { abogadoId, salaId } = req.body;

    const sala = await Sala.findById(salaId);
    const abogado = await Abogado.findById(abogadoId);

    console.log("🧠 Sala encontrada:", sala);
    console.log("🧠 Abogado encontrado:", abogado);
    
    if (!sala || !abogado) {
      return res.status(404).json({ mensaje: 'Sala o abogado no encontrados' });
    }

    if (!sala.disponible) {
      return res.status(400).json({ mensaje: 'La sala ya está ocupada' });
    }

    // Asignar sala al abogado
    sala.disponible = false;
    sala.abogado_asignado = abogado._id;
    await sala.save();

    // Actualizar ubicación del abogado
    abogado.ubicacion = sala.nombre;
    await abogado.save();

    const io = req.app.get('io');
  io.emit('Sala Actualizada');
    res.json({ mensaje: `✅ Sala '${sala.nombre}' asignada al abogado '${abogado.nombre}'` });
  } catch (error) {
    console.error('❌ Error al asignar sala manualmente:', error);
    res.status(500).json({ mensaje: 'Error interno al asignar sala' });
  }
});


router.put('/liberar/:salaId', async (req, res) => {
  try {
    const sala = await Sala.findById(req.params.salaId);

    if (!sala) return res.status(404).json({ mensaje: 'Sala no encontrada' });

    const abogadoId = sala.abogado_asignado;

    sala.abogado_asignado = null;
    sala.disponible = true;
    await sala.save();

    if (abogadoId) {
      const abogado = await Abogado.findById(abogadoId);
      if (abogado) {
        abogado.ubicacion = '---';
        await abogado.save();
      }
    }

    res.json({ mensaje: '✅ Sala liberada correctamente' });
  } catch (err) {
    console.error('❌ Error al liberar sala:', err);
    res.status(500).json({ mensaje: 'Error al liberar sala' });
  }
});


module.exports = router;