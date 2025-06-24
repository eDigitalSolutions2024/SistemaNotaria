const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  hora_llegada: { type: Date, default: Date.now },
  abogado_asignado: { type: mongoose.Schema.Types.ObjectId, ref: 'Abogado' },
  estado: { type: String, default: 'asignado' } // puede ser "pendiente", "asignado", etc.
});

module.exports = mongoose.model('Cliente', clienteSchema);
