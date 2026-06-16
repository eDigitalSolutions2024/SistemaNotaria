const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
  _id: { type: Number },
  nombre: { type: String, required: true },
  numero_telefono: { type: String, default: ''},
  hora_llegada: { type: Date, default: Date.now },
  abogado_asignado: { type: Number, ref: 'Abogado' },
  estado: { type: String, default: 'Asignado' } ,// puede ser "pendiente", "asignado", etc.
  en_espera:{type: Boolean, default: false},
  motivo: {type: String, default: ''},
  accion: {type: String, default: ''},
  servicio:{ type: String, default: ''},
  tieneCita: { type: Boolean, default: false},
  abogado_preferido: { type: Number, default: null },  // ID numérico del abogado con el que tiene cita
  creadoPor: { type: String, default: '' },

},{_id: false});

module.exports = mongoose.model('Cliente', clienteSchema);
