// models/CerveceriaTramite.js
// Control de trámites de "Gestiones especiales" — cada cliente (Cervecería,
// Controladora, y los que se den de alta después desde la app) es un
// "empresa" distinto. Comparten la misma colección, diferenciados por ese
// campo, para no duplicar modelo/rutas/UI — pero cada pantalla solo ve y
// exporta los suyos. La lista de empresas válidas YA NO vive aquí como
// enum fijo — vive en GestionEspecialModulo (un ADMIN la administra desde
// la app); este modelo solo guarda el nombre como texto libre, y la ruta es
// quien valida contra ese catálogo antes de crear/filtrar. Cada documento
// (fila del Excel) es un trámite independiente, con su propio archivo
// adjunto. "Facturado" ya no es una bandera suelta — un trámite está
// facturado si pertenece a una CerveceriaFactura (facturaId); "entregado" y
// "firmado" siguen siendo banderas simples con fecha.
const mongoose = require('mongoose');

const estatusSchema = {
  hecho: { type: Boolean, default: false },
  fecha: { type: Date, default: null },
};

const cerveceriaTramiteSchema = new mongoose.Schema(
  {
    empresa: { type: String, required: true, trim: true },
    cliente: { type: String, required: true, trim: true },
    tipoDocumento: { type: String, required: true, trim: true },
    hojas: { type: Number, default: null },
    cantidad: { type: Number, default: null },
    fecha: { type: Date, default: null },
    costo: { type: Number, default: null },

    facturaId: { type: mongoose.Schema.Types.ObjectId, ref: 'CerveceriaFactura', default: null },
    entregado: { type: estatusSchema, default: () => ({}) },
    firmado: { type: estatusSchema, default: () => ({}) },

    archivoNombre: { type: String, default: '' },
    archivoPath: { type: String, default: '' },

    // Documento general: el mismo archivo compartido por todas las filas de
    // una entrega (ej. el expediente completo escaneado), guardado aparte
    // del documento propio de la fila — ambos se pueden ver por separado.
    archivoGeneralNombre: { type: String, default: '' },
    archivoGeneralPath: { type: String, default: '' },

    // Id compartido por todas las filas capturadas juntas en una misma
    // "Nueva entrega" — permite agruparlas/distinguirlas visualmente en la
    // tabla aunque coincidan en fecha con otra entrega distinta.
    entregaId: { type: String, default: null, index: true },

    creadoPorId: { type: Number, default: null },
    creadoPorNombre: { type: String, default: '' },
  },
  { timestamps: true }
);

cerveceriaTramiteSchema.index({ empresa: 1, cliente: 1 });

module.exports = mongoose.model('CerveceriaTramite', cerveceriaTramiteSchema);
