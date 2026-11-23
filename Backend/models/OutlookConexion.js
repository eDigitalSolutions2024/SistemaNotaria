// Backend/models/OutlookConexion.js
// Conexión ÚNICA y compartida de la notaría con Outlook (una cuenta para todo
// el sistema). Los tokens se guardan cifrados (AES-256-GCM, ver
// services/outlookService.js). Solo un ADMIN puede conectarla o desconectarla.
const { Schema, model } = require('mongoose');

const CalendarioSchema = new Schema(
  {
    id: { type: String, required: true }, // "primary" = el predeterminado
    graphId: { type: String, default: '' },
    name: { type: String, default: '' },
    canEdit: { type: Boolean, default: false },
    owner: { type: String, default: null },
    color: { type: String, default: null },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false }
);

const CategoriaSchema = new Schema(
  { name: String, color: { type: String, default: null } },
  { _id: false }
);

const OutlookConexionSchema = new Schema(
  {
    clave: { type: String, default: 'principal', unique: true },
    account: { type: String, default: '' },

    refreshTokenEnc: { type: String, default: '' },
    accessTokenEnc: { type: String, default: '' },
    expiresAt: { type: Number, default: 0 },

    conectadoPor: { type: Schema.Types.Mixed, default: null }, // { id, nombre }
    conectadoEn: { type: Date, default: null },
    ultimoError: { type: String, default: '' },

    // Catálogo cacheado (se refresca en cada sincronización)
    calendarios: { type: [CalendarioSchema], default: [] },
    categorias: { type: [CategoriaSchema], default: [] },
    metaEn: { type: Date, default: null },

    // Candado para que solo UNA instancia del servidor sincronice a la vez
    syncLockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = model('OutlookConexion', OutlookConexionSchema);
