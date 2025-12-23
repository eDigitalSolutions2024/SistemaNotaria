// backend/models/Presupuesto.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const cargosSchema = new Schema(
  {
    isr: { type: Number, default: 0 },
    isrAdquisicion: { type: Number, default: 0 },

    traslacionDominio: { type: Number, default: 0 },
    traslacionDominio2: { type: Number, default: 0 },
    traslacionDominioRecargos: { type: Number, default: 0 },

    registroPublico: { type: Number, default: 0 },
    registroPubVtaHip: { type: Number, default: 0 },
    registroPubPoderes: { type: Number, default: 0 },
    registroPubOtros: { type: Number, default: 0 },
    registroPublicoRecargos: { type: Number, default: 0 },

    solicPermiso: { type: Number, default: 0 },
    avisoPermiso: { type: Number, default: 0 },
    ivaLocalComerc: { type: Number, default: 0 },
    actosJuridicos: { type: Number, default: 0 },
    costoAvaluo: { type: Number, default: 0 },
    gastosGestiones: { type: Number, default: 0 },
    impuestoCedular: { type: Number, default: 0 },
    impuestoPredial: { type: Number, default: 0 },
    tramiteForaneo: { type: Number, default: 0 },
    otrosConceptos: { type: Number, default: 0 },
    certificados1: { type: Number, default: 0 },
    certificados2: { type: Number, default: 0 },
    certificados3: { type: Number, default: 0 },
  },
  { _id: false }
);

const honorariosSchema = new Schema(
  {
    honorarios: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    iva: { type: Number, default: 0 },
    retencionIsr: { type: Number, default: 0 },
    retencionIva: { type: Number, default: 0 },
    totalHonorarios: { type: Number, default: 0 },
  },
  { _id: false }
);

const presupuestoSchema = new Schema(
  {
    // ✅ CORRECCIÓN: Cliente como ObjectId para populate real
    cliente: {
      type: Schema.Types.ObjectId,
      ref: 'Cliente',
      required: true,
    },

    responsable: { type: String, default: '' },

    tipoTramite: {
      type: String,
      enum: ['Compraventa', 'Donacion', 'Adjudicacion', 'Protocolizacion'],
      default: 'Compraventa',
    },

    avaluo: { type: Number, default: 0 },

    valorOperacion: { type: Number, required: true },
    valorTerreno: { type: Number, default: 0 },
    valorConstruccion: { type: Number, default: 0 },

    anioRegistro: { type: Number, default: 2025 },

    porcentajeHonorarios: { type: Number, default: 0 },

    cargos: { type: cargosSchema, default: () => ({}) },
    honorariosCalc: { type: honorariosSchema, default: () => ({}) },

    totalPresupuesto: { type: Number, default: 0 },
    observaciones: { type: String, default: '' },

    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Presupuesto', presupuestoSchema);
