// models/abogado.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Valores permitidos para role
const ROLES = ['ADMIN', 'ABOGADO', 'ASISTENTE', 'PROTOCOLITO', 'RECEPCION'];

const abogadoSchema = new mongoose.Schema({
  _id: { type: Number }, // ID personalizado (4 dígitos)
  nombre: { type: String, required: true },
  disponible: { type: Boolean, default: true },
  asignaciones: { type: Number, default: 0 },
  orden: { type: Number, required: true },
  ubicacion: { type: String, default: 'sin sala' }, // Nombre de la sala

  passwordHash: { type: String, select: false },

  // 🔑 Rol del usuario en el sistema
  role: { type: String, enum: ROLES, default: 'ABOGADO', index: true },

  /**
   * Para ASISTENTES:
   * abogadoJefe es el abogado responsable de este asistente.
   * Solo tiene sentido cuando role === 'ASISTENTE'
   */
  abogadoJefe: {
    type: Number,        // mismo tipo que _id
    ref: 'Abogado',
    default: null,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * Virtual: lista de asistentes que dependen de este abogado.
 *
 * Uso:
 *  const abogado = await Abogado.findById(id).populate('asistentes');
 *  console.log(abogado.asistentes); // array de usuarios con role = 'ASISTENTE'
 */
abogadoSchema.virtual('asistentes', {
  ref: 'Abogado',
  localField: '_id',          // id del abogado
  foreignField: 'abogadoJefe' // campo en los asistentes
});

// Métodos de instancia
abogadoSchema.methods.setPassword = async function (plain) {
  const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
  this.passwordHash = await bcrypt.hash(String(plain), rounds);
};

abogadoSchema.methods.validatePassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(String(plain), this.passwordHash);
};

const Abogado = mongoose.model('Abogado', abogadoSchema);

module.exports = Abogado;
module.exports.ROLES = ROLES;
