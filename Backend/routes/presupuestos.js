// backend/routes/presupuestos.js
const express = require('express');
const router = express.Router();

const Presupuesto = require('../models/Presupuesto');

// Crear presupuesto
router.post('/', async (req, res) => {
  try {
    const presupuesto = new Presupuesto(req.body);
    await presupuesto.save();

    res.status(201).json(presupuesto);
  } catch (err) {
    console.error('Error al crear presupuesto:', err);
    res.status(500).json({
      message: 'Error al crear presupuesto',
      error: err.message,
    });
  }
});

// Listar todos los presupuestos
router.get('/', async (_req, res) => {
  try {
    const presupuestos = await Presupuesto.find()
      .populate('cliente', 'nombre idCliente'); // ajusta a tus campos reales

    res.json(presupuestos);
  } catch (err) {
    console.error('Error al obtener presupuestos:', err);
    res.status(500).json({
      message: 'Error al obtener presupuestos',
      error: err.message,
    });
  }
});

// Obtener un presupuesto por ID
router.get('/:id', async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findById(req.params.id)
      .populate('cliente', 'nombre idCliente');

    if (!presupuesto) {
      return res.status(404).json({ message: 'Presupuesto no encontrado' });
    }

    res.json(presupuesto);
  } catch (err) {
    console.error('Error al obtener presupuesto:', err);
    res.status(500).json({
      message: 'Error al obtener presupuesto',
      error: err.message,
    });
  }
});

// Actualizar presupuesto
router.put('/:id', async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!presupuesto) {
      return res.status(404).json({ message: 'Presupuesto no encontrado' });
    }

    res.json(presupuesto);
  } catch (err) {
    console.error('Error al actualizar presupuesto:', err);
    res.status(500).json({
      message: 'Error al actualizar presupuesto',
      error: err.message,
    });
  }
});

// (Opcional) Eliminar presupuesto
router.delete('/:id', async (req, res) => {
  try {
    const presupuesto = await Presupuesto.findByIdAndDelete(req.params.id);

    if (!presupuesto) {
      return res.status(404).json({ message: 'Presupuesto no encontrado' });
    }

    res.json({ message: 'Presupuesto eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar presupuesto:', err);
    res.status(500).json({
      message: 'Error al eliminar presupuesto',
      error: err.message,
    });
  }
});

module.exports = router;
