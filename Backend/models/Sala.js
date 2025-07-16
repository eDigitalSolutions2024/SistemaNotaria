const mongoose = require('mongoose');
const SalaSchema = new mongoose.Schema({
  nombre: String,
  disponible: { type: Boolean, default: true },
  abogado_asignado: { type: Number, ref: 'Abogado', default: null }
});
module.exports = mongoose.model('Sala', SalaSchema);
