// Backend/models/Anuncio.js
// Anuncios del sistema: por ahora solo MANUALES (creados por ADMIN y
// transmitidos en vivo a todos los usuarios vía Socket.io). El campo `tipo`
// queda abierto para los anuncios automáticos (p.ej. cambio de volumen en
// Escrituras/Protocolito) que se integrarán después sin migrar el schema.
const { Schema, model } = require('mongoose');
const { ROLES } = require('./Abogado');

const VistoSchema = new Schema(
  {
    usuarioId: { type: Number, required: true },
    usuarioNombre: { type: String, default: '' },
    vistoEn: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DestinatarioSchema = new Schema(
  {
    usuarioId: { type: Number, required: true },
    usuarioNombre: { type: String, default: '' },
  },
  { _id: false }
);

// Marca de un anuncio disparado por el sistema (no por un ADMIN a mano).
// modulo+volumen+umbral es la llave de idempotencia: garantiza que la misma
// alerta (p.ej. "faltan 50" del volumen 17) nunca se dispare dos veces —
// reforzado con el índice único parcial de abajo, mismo criterio que ya usa
// el módulo PLD para sus avisos.
const AutomaticoSchema = new Schema(
  {
    modulo: { type: String, enum: ['PROTOCOLITO_VOLUMEN'], required: true },
    volumen: { type: Schema.Types.Mixed, required: true },
    umbral: { type: Number, required: true }, // 100/50/10 = preaviso; 0 = ya saltó de volumen
  },
  { _id: false }
);

const AnuncioSchema = new Schema(
  {
    tipo: { type: String, enum: ['MANUAL', 'AUTOMATICO'], default: 'MANUAL', required: true, index: true },
    titulo: { type: String, required: true, trim: true },
    mensaje: { type: String, required: true, trim: true },

    // NORMAL => toast no bloqueante; URGENTE => modal bloqueante que exige
    // clic en "Entendido" antes de dejar seguir usando el sistema.
    urgencia: { type: String, enum: ['NORMAL', 'URGENTE'], default: 'NORMAL', required: true },

    // Reproduce un sonido de alerta al llegar (además del efecto visual).
    sonido: { type: Boolean, default: false },

    // TODOS => todo el que tenga sesión; SEGMENTO => solo quien matchee por
    // usuario individual (destinatarios) o por rol (destinatarioRoles) —
    // un usuario califica si cae en cualquiera de los dos.
    alcance: { type: String, enum: ['TODOS', 'SEGMENTO'], default: 'TODOS', required: true },
    destinatarios: { type: [DestinatarioSchema], default: [] },
    destinatarioRoles: { type: [String], enum: ROLES, default: [] },

    // Solo presente en anuncios tipo AUTOMATICO.
    automatico: { type: AutomaticoSchema, default: undefined },

    creadoPorId: { type: Number, default: null },
    creadoPorNombre: { type: String, default: '' },

    activo: { type: Boolean, default: true, index: true },

    // Prueba de que cada usuario lo vio: se agrega SOLO cuando el usuario da
    // clic en el botón de cierre (nunca por temporizador ni auto-dismiss).
    vistoPor: { type: [VistoSchema], default: [] },
  },
  { timestamps: true }
);

AnuncioSchema.index(
  { 'automatico.modulo': 1, 'automatico.volumen': 1, 'automatico.umbral': 1 },
  { unique: true, partialFilterExpression: { 'automatico.modulo': { $exists: true } } }
);

module.exports = model('Anuncio', AnuncioSchema);
