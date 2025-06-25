const mongoose = require('mongoose');

const abogadoSchema = new mongoose.Schema({
  _id: {type: Number},// ID personalizado (4 dígitos)
  nombre: { type: String, required: true },
  disponible: { type: Boolean, default: true },
  asignaciones: { type: Number, default: 0 },
  orden: { type: Number, required: true }
});// <- importante: desactiva el _id automático

module.exports = mongoose.model('Abogado', abogadoSchema);
