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
  lugar_nacimiento_estado: { type: String, default: '' },
  lugar_nacimiento_ciudad: { type: String, default: '' },
  fecha_nacimiento: { type: Date, required: true },
  ocupacion: { type: String, required: true },
  estado_civil: { type: String, required: true },
  estado_civil_con_quien: { type: String, default: '' }, 
  estado_civil_lugar_fecha: { type: String, default: '' },
  estado_civil_regimen: { type: String, default: '' },
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
