// models/CerveceriaFactura.js
// Una factura agrupa varios CerveceriaTramite (documentos) bajo un número
// real de factura — reemplaza el checkbox suelto de "Facturado": ahora un
// trámite solo queda facturado cuando entra a una de estas.
const mongoose = require('mongoose');
const { EMPRESAS } = require('./CerveceriaTramite');

const cerveceriaFacturaSchema = new mongoose.Schema(
  {
    empresa: { type: String, enum: EMPRESAS, required: true },
    numeroFactura: { type: String, required: true, trim: true },
    fecha: { type: Date, default: null },
    total: { type: Number, default: null },

    creadoPorId: { type: Number, default: null },
    creadoPorNombre: { type: String, default: '' },
  },
  { timestamps: true }
);

cerveceriaFacturaSchema.index({ empresa: 1, numeroFactura: 1 });

module.exports = mongoose.model('CerveceriaFactura', cerveceriaFacturaSchema);
