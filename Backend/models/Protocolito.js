const mongoose = require('mongoose');

const protocolitoSchema = new mongoose.Schema({
  numeroTramite: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
  tipoTramite: {
    type: String,
    required: true,
    trim: true
  },
  cliente: {
    type: String,
    required: true,
    trim: true
  },
  fecha: {
    type: Date,
    required: true
  },
  abogado: {
    type: String,
    required: true,
    trim: true
  },
  estatus_entrega: { type: String, default: 'Pendiente' },
  fecha_entrega: { type: Date },
  notas: { type: String, trim: true },


  estatus_recibo: {
    type: String,
    enum: ['SIN_RECIBO', 'JUSTIFICADO', 'CON_RECIBO'],
    default: 'SIN_RECIBO',
    index: true
  },
  justificante_text: { type: String, trim: true, default: '' },
  justificante_by:   { type: String, trim: true, default: '' },
  justificante_at:   { type: Date, default: null },
  
 
  creadoEn: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Protocolito', protocolitoSchema);
