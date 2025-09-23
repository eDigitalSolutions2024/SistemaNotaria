const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');


const abogadoSchema = new mongoose.Schema({
  _id: {type: Number},// ID personalizado (4 dígitos)
  nombre: { type: String, required: true },
  disponible: { type: Boolean, default: true },
  asignaciones: { type: Number, default: 0 },
  orden: { type: Number, required: true },
  ubicacion: { type: String, default: "sin sala" }, // Nombre de la sala
  passwordHash: { type: String, select: false },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
}, { timestamps: true });// <- importante: desactiva el _id automático


// Métodos de instancia
AbogadoSchema.methods.setPassword = async function (plain) {
  const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
  this.passwordHash = await bcrypt.hash(String(plain), rounds);
};

AbogadoSchema.methods.validatePassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(String(plain), this.passwordHash);
};

module.exports = mongoose.model('Abogado', abogadoSchema);
