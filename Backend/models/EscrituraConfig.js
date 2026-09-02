// Backend/models/EscrituraConfig.js
// Documento único (singleton) que controla si el módulo de Escrituras
// acepta altas/ediciones/entregas/etc. Cuando habilitado=false, el módulo
// queda en modo solo lectura para TODOS, incluido ADMIN — el único que
// puede volver a habilitarlo.
const { Schema, model } = require('mongoose');

const EscrituraConfigSchema = new Schema(
  {
    _id: { type: String, default: 'singleton' },
    habilitado: { type: Boolean, default: true },

    actualizadoPorId: { type: Number, default: null },
    actualizadoPorNombre: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = model('EscrituraConfig', EscrituraConfigSchema);
