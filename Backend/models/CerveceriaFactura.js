// models/CerveceriaFactura.js
// Una factura agrupa varios CerveceriaTramite (documentos) bajo un número
// real de factura — reemplaza el checkbox suelto de "Facturado": ahora un
// trámite solo queda facturado cuando entra a una de estas.
const mongoose = require('mongoose');

const cerveceriaFacturaSchema = new mongoose.Schema(
  {
    // La lista de empresas válidas vive en GestionEspecialModulo (un ADMIN
    // la administra desde la app) — aquí solo se guarda como texto libre,
    // igual que en CerveceriaTramite; la ruta es quien valida contra ese
    // catálogo antes de crear.
    empresa: { type: String, required: true, trim: true },
    numeroFactura: { type: String, required: true, trim: true },
    fecha: { type: Date, default: null },
    total: { type: Number, default: null },

    // Datos propios de la factura (no de cada trámite individual).
    pedido: { type: String, trim: true, default: '' },
    entrada: { type: String, trim: true, default: '' },

    // Acuse del SAT de que la factura ya se subió al portal.
    acuseNombre: { type: String, default: '' },
    acusePath: { type: String, default: '' },

    creadoPorId: { type: Number, default: null },
    creadoPorNombre: { type: String, default: '' },
  },
  { timestamps: true }
);

cerveceriaFacturaSchema.index({ empresa: 1, numeroFactura: 1 });

module.exports = mongoose.model('CerveceriaFactura', cerveceriaFacturaSchema);
