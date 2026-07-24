// Backend/models/ProtocolitoConfig.js
// Documento único (singleton) que controla si el módulo de Protocolito
// acepta escrituras (crear/editar/entregar/etc). Cuando habilitado=false,
// el módulo queda en modo solo lectura para TODOS, incluido ADMIN — el
// único que puede volver a habilitarlo.
const { Schema, model } = require('mongoose');

const ProtocolitoConfigSchema = new Schema(
  {
    _id: { type: String, default: 'singleton' },
    habilitado: { type: Boolean, default: true },

    // Umbrales de preaviso (números de trámite restantes) para la alerta
    // automática de cambio de volumen. El salto de volumen en sí (faltan=0)
    // no es editable: siempre dispara, además de estos.
    umbralesAlerta: { type: [Number], default: [100, 50, 10] },

    actualizadoPorId: { type: Number, default: null },
    actualizadoPorNombre: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = model('ProtocolitoConfig', ProtocolitoConfigSchema);
