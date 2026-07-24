// backend/models/CustodiaEvento.js
// Bitácora inmutable de movimientos físicos de un trámite entre abogado y
// recepción. Cada acción del flujo crea un evento aquí, independientemente
// del estado "actual" (denormalizado en Escritura.custodia / Protocolito.custodia).
const { Schema, model } = require('mongoose');

const CustodiaEventoSchema = new Schema(
  {
    tipoTramite: { type: String, enum: ['Escritura', 'Protocolito'], required: true, index: true },
    control: { type: Number, required: true, index: true },

    accion: {
      type: String,
      enum: [
        'ENVIADO_A_RECEPCION',
        'RECIBIDO_EN_RECEPCION',
        'ENTREGADO_A_ABOGADO',
        'CONFIRMADO_POR_ABOGADO',
      ],
      required: true,
    },

    deUsuarioId: { type: Number, default: null },
    deUsuarioNombre: { type: String, default: '' },

    paraUsuarioId: { type: Number, default: null },
    paraUsuarioNombre: { type: String, default: '' },

    notas: { type: String, default: '' },
  },
  { timestamps: true }
);

CustodiaEventoSchema.index({ tipoTramite: 1, control: 1, createdAt: -1 });

module.exports = model('CustodiaEvento', CustodiaEventoSchema);
