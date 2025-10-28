// backend/models/Escritura.js
const { Schema, model } = require('mongoose');

// Helper: convierte a número o null
const numOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

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
    horaLecturaInicio: { type: String, default: null }, // "HH:mm"
    horaLecturaFin: { type: String, default: null },    // "HH:mm"

    // ===== NUEVOS CAMPOS (recibo/resumen) =====
    // ==== NUEVOS CAMPOS numéricos ====
    totalImpuestos:   { type: Number, default: null, set: numOrNull },
    valorAvaluo:      { type: Number, default: null, set: numOrNull },
    totalGastosExtra: { type: Number, default: null, set: numOrNull },
    totalHonorarios:  { type: Number, default: null, set: numOrNull },

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
