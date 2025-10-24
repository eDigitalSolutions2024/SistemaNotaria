// backend/models/Escritura.js
const { Schema, model } = require('mongoose');

const EscrituraSchema = new Schema(
  {
    numeroControl: { type: Number, required: true, unique: true, index: true },
    tipoTramite: { type: String, required: true },
    cliente: { type: String, required: true, index: true },
    fecha: { type: Date, required: true },
    abogado: { type: String, required: true, index: true },
    volumen: { type: String },        // si prefieres número, cambia a Number
    folioDesde: { type: Number },
    folioHasta: { type: Number },


    // Campos operativos / estatus
    observaciones: { type: String, default: '' },
    estatus_entrega: { type: String, enum: ['Pendiente', 'Entregado'], default: 'Pendiente', index: true },
    estatus_recibo: { type: String, enum: ['SIN_RECIBO', 'CON_RECIBO', 'JUSTIFICADO'], default: 'SIN_RECIBO', index: true },

    // Justificante
    justificante_text: { type: String },
    justificante_by: { type: String },
    justificante_at: { type: Date },

    
    // Trazabilidad
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

module.exports = model('Escritura', EscrituraSchema);
