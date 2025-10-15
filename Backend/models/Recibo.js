const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReciboSchema = new Schema({
  fecha:        { type: Date, required: true },
  tipoTramite:  { type: String, enum: ['Protocolito','Escritura','Contrato','otro'], default: 'Protocolito' },
  recibiDe:     { type: String, required: true, trim: true },
  abogado:      { type: String, trim: true },
  concepto:     { type: String, trim: true },
  control:      { type: String, trim: true },

  totalTramite: { type: Number, required: true, min: 0 },
  totalPagado:  { type: Number, required: true, min: 0 },
   // NUEVO: explícito para Escritura (abono de este recibo). En otros puede ser 0.
  abono:        { type: Number, default: 0, min: 0 },
  restante:     { type: Number, required: true, min: 0 },

  totalImpuestos:   { type: Number, default: 0, min: 0 },
  valorAvaluo:      { type: Number, default: 0, min: 0 },
  totalGastosExtra: { type: Number, default: 0, min: 0 },
  totalHonorarios:  { type: Number, default: 0, min: 0 },

  creadoPor: { type: String },          // opcional: usuario

  // NUEVO:
  estatus: { type: String, enum: ['Activo', 'Cancelado'], default: 'Activo', index: true },

  // Opcional pero recomendado para auditoría de cancelación
  cancelacion: {
    motivo:        { type: String, trim: true },
    fecha:         { type: Date },
    usuarioId:     { type: String },
    usuarioNombre: { type: String }
  }
}, { timestamps: true });

module.exports = mongoose.model('Recibo', ReciboSchema);
