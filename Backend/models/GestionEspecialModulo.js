// models/GestionEspecialModulo.js
// Catálogo de clientes/módulos dentro de "Gestiones especiales" (Control de
// Cervecería, Controladora, y los que el notario vaya dando de alta a
// futuro). Reemplaza la lista fija EMPRESAS que vivía en el código — ahora
// un ADMIN puede crear un módulo nuevo desde la app sin necesitar un
// despliegue. Cada trámite (CerveceriaTramite) sigue referenciando el
// módulo por su "nombre" (string), no por _id — simple y suficiente, ya que
// el nombre es único.
const mongoose = require('mongoose');

const gestionEspecialModuloSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, unique: true },
    // true = solo lo ve ADMIN; false = lo ve todo el staff con acceso al sistema.
    soloAdmin: { type: Boolean, default: true },
    // Ocultar sin borrar — los trámites que ya existen con este nombre no se tocan.
    activo: { type: Boolean, default: true },

    creadoPorId: { type: Number, default: null },
    creadoPorNombre: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GestionEspecialModulo', gestionEspecialModuloSchema);
