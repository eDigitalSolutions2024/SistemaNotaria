// Backend/models/Bitacora.js
// Bitácora global de auditoría: un documento por movimiento relevante de
// cualquier usuario en cualquier módulo (login, recibos, presupuestos,
// escrituras, protocolito, clientes, gestión de usuarios/permisos).
// Mismo patrón que CustodiaEvento.js, generalizado a todo el sistema.
const { Schema, model } = require('mongoose');

const BitacoraSchema = new Schema(
  {
    usuarioId: { type: Number, default: null, index: true },
    usuarioNombre: { type: String, default: 'Desconocido' },
    ip: { type: String, default: '' },

    accion: { type: String, required: true, index: true },
    entidad: { type: String, default: '' },
    entidadId: { type: Schema.Types.Mixed, default: null },
    detalle: { type: String, default: '' },
  },
  { timestamps: true }
);

BitacoraSchema.index({ usuarioId: 1, createdAt: -1 });
BitacoraSchema.index({ accion: 1, createdAt: -1 });

module.exports = model('Bitacora', BitacoraSchema);
