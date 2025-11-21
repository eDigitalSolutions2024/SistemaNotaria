const mongoose = require('mongoose');

const clienteGeneralSchema = new mongoose.Schema({
  // Relación con el cliente de turnos
  clienteId: {
    type: Number,
    ref: 'Cliente',
    required: true,
  },

  nombre_completo: { type: String, required: true },
  lugar_nacimiento: { type: String, required: true },
  fecha_nacimiento: { type: Date, required: true },
  ocupacion: { type: String, required: true },
  estado_civil: { type: String, required: true },
  domicilio: { type: String, required: true },
  colonia: { type: String, required: true },

  telefono_principal: { type: String, required: true },
  telefono_secundario: { type: String, default: '' }, // opcional

  correo_electronico: { type: String, required: true },
  curp: { type: String, required: true },
  rfc: { type: String, required: true },
}, {
  timestamps: true, // createdAt, updatedAt
});

// Para buscar rápido por cliente
clienteGeneralSchema.index({ clienteId: 1 });

module.exports = mongoose.model('ClienteGeneral', clienteGeneralSchema);
