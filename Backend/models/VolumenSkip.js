// backend/models/VolumenSkip.js
// Bitácora de "brincos de volumen" manuales: cuando quedan pocos folios
// utilizables en el volumen actual y no alcanza para el siguiente trámite,
// un ADMIN puede cerrar el volumen a propósito (dejar esos folios sin usar)
// y arrancar limpio en el siguiente. Esto no borra ni reemplaza folios —
// solo marca el volumen como agotado para que siguienteSlot() salte solo.
const mongoose = require('mongoose');

const volumenSkipSchema = new mongoose.Schema(
  {
    volumen: { type: String, required: true, index: true }, // volumen que se cerró
    folioDesde: { type: Number, required: true }, // primer folio que quedó sin usar
    folioHasta: { type: Number, required: true }, // último folio usable del volumen (298)
    volumenNuevo: { type: String, required: true }, // a qué volumen se saltó
    motivo: { type: String, required: true },
    hechoPorId: { type: Number, default: null },
    hechoPorNombre: { type: String, default: '' },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VolumenSkip', volumenSkipSchema);
