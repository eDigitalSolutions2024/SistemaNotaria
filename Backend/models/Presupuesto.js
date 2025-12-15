// backend/models/Presupuesto.js
const mongoose = require('mongoose');

const { Schema } = mongoose;

const cargosSchema = new Schema(
  {
    isr: { type: Number, default: 0 },                 // I.S.R.
    isrAdquisicion: { type: Number, default: 0 },      // I.S.R. Adquisición
    trasladoDominio: { type: Number, default: 0 },     // Trasl. Dominio
    trasladoDominio2: { type: Number, default: 0 },    // Trasl. Dominio (2)
    trasladoDominioRecargos: { type: Number, default: 0 }, // Trasl. Dominio (Recargos)
    registroPublico: { type: Number, default: 0 },     // Reg. Público
    registroPubVtaHip: { type: Number, default: 0 },   // Reg. Pub Vta/Hipot
    registroPubPoderes: { type: Number, default: 0 },  // Reg. Pub. Poderes
    registroPubOtros: { type: Number, default: 0 },    // Reg. Pub. Otros
    registroPublicoRecargos: { type: Number, default: 0 }, // Reg. Pub (Recargos)
    solicPermiso: { type: Number, default: 0 },        // Solic. Permiso
    avisoPermiso: { type: Number, default: 0 },        // Aviso Permiso
    ivaLocalComerc: { type: Number, default: 0 },      // IVA Local Comerc.
    actosJuridicos: { type: Number, default: 0 },      // Actos Jurídicos
    costoAvaluo: { type: Number, default: 0 },         // Costo Avalúo
    gastosGestiones: { type: Number, default: 0 },     // Gastos y Gestiones
    impuestoCedular: { type: Number, default: 0 },     // Impto. Cedular
    impuestoPredial: { type: Number, default: 0 },     // Impto. Predial
    tramiteForaneo: { type: Number, default: 0 },      // Trámite Foráneo
    otrosConceptos: { type: Number, default: 0 },      // Otros Conceptos
    certificados1: { type: Number, default: 0 },       // Certificados (1)
    certificados2: { type: Number, default: 0 },       // Certificados (2)
    certificados3: { type: Number, default: 0 },       // Certificados (3)
  },
  { _id: false }
);

const honorariosSchema = new Schema(
  {
    honorarios: { type: Number, default: 0 },   // Honorarios
    iva: { type: Number, default: 0 },          // I.V.A.
    subtotal: { type: Number, default: 0 },     // Subtotal
    retencionIsr: { type: Number, default: 0 }, // Retenc. I.S.R.
    retencionIva: { type: Number, default: 0 }, // Retenc. I.V.A.
    totalHonorarios: { type: Number, default: 0 }, // Total Honorarios
  },
  { _id: false }
);

const presupuestoSchema = new Schema(
  {
    // Relación con cliente (tomado de tu BD actual)
    cliente: {
      type: Schema.Types.ObjectId,
      ref: 'Cliente',
      required: true,
    },

    // Opcional: responsable / abogado
    responsable: { type: String }, // luego si quieres lo hacemos ref a Abogado

    tipoCliente: { type: String, default: 'Particular' },

    // Datos de cálculo (parte de arriba del formato)
    avaluo: { type: Number, required: true },           // Avalúo
    valorOperacion: { type: Number, required: true },   // Valor de Operación
    montoCreditoHipotecario: { type: Number, default: 0 }, // Monto Créd. Hipot.

    compraVentaHipoteca: { type: Boolean, default: false }, // Compra-venta Hipotec. (S/N)
    progVivienda: { type: Boolean, default: false },        // Prog. Vivienda (S/N)
    propiedadNueva: { type: Boolean, default: false },      // Propiedad Nva (S/N)

    // Sección de cargos
    cargos: { type: cargosSchema, default: () => ({}) },

    // Sección de honorarios
    honorariosCalc: { type: honorariosSchema, default: () => ({}) },

    // Total general del presupuesto (el “Total: 65,833.00”)
    totalPresupuesto: { type: Number, default: 0 },

    observaciones: { type: String },

    fecha: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Presupuesto', presupuestoSchema);
