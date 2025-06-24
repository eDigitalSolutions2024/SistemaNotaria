const mongoose = require('mongoose');

const abogadoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  disponible: { type: Boolean, default: true },
  asignaciones: { type: Number, default: 0 },
  orden: { type: Number, required: true }
});

module.exports = mongoose.model('Abogado', abogadoSchema);
