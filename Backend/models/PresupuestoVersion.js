// backend/models/PresupuestoVersion.js
// Bitácora inmutable de ediciones a un Presupuesto: cada vez que un ADMIN
// modifica un presupuesto ya creado, se guarda aquí la foto completa de
// "antes" y "después", el motivo y quién la hizo. Nunca se edita ni se
// borra un registro de esta colección — es historial, no estado.
const mongoose = require('mongoose');

const presupuestoVersionSchema = new mongoose.Schema(
  {
    presupuestoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Presupuesto',
      required: true,
      index: true,
    },
    versionAnterior: { type: mongoose.Schema.Types.Mixed, required: true },
    versionNueva: { type: mongoose.Schema.Types.Mixed, required: true },
    motivo: { type: String, required: true },
    // Quién ejecutó el cambio en el sistema (siempre ADMIN, por el candado).
    modificadoPorId: { type: Number, default: null },
    modificadoPorNombre: { type: String, default: '' },
    // Quién (qué abogado) pidió el cambio — puede no ser quien lo ejecutó.
    solicitanteId: { type: Number, default: null },
    solicitanteNombre: { type: String, default: '' },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PresupuestoVersion', presupuestoVersionSchema);
