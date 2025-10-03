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

  // 🔑 Nuevo enum de roles
  role: { type: String, enum: ROLES, default: 'ABOGADO', index: true },
}, { timestamps: true });

// Métodos de instancia
abogadoSchema.methods.setPassword = async function (plain) {
  const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
  this.passwordHash = await bcrypt.hash(String(plain), rounds);
};

abogadoSchema.methods.validatePassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(String(plain), this.passwordHash);
};

module.exports = mongoose.model('Abogado', abogadoSchema);
module.exports.ROLES = ROLES;
