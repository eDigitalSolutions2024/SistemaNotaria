const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
  _id: { type: Number },
  nombre: { type: String, required: true },
  hora_llegada: { type: Date, default: Date.now },
  abogado_asignado: { type: Number, ref: 'Abogado' },
  estado: { type: String, default: 'Asignado' } // puede ser "pendiente", "asignado", etc.
},{_id: false});

module.exports = mongoose.model('Cliente', clienteSchema);
