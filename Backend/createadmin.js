// backend/scripts/createAdmin.js
require('dotenv').config({
  // usará .env.development por defecto si no defines NODE_ENV
  path: `.env.${process.env.NODE_ENV || 'development'}`
});

const mongoose = require('mongoose');
const Abogado = require('./models/Abogado');

async function main() {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/notaria17'; // <- cambia el nombre si aplica

  console.log('Conectando a MongoDB:', uri);
  await mongoose.connect(uri);

  // Permite override por argumentos: node scripts/createAdmin.js <password> <nombre>
  const PASSWORD = process.argv[2] || 'admin_it';
  const NAME = process.argv[3] || 'Administrador';

  const ID = 1; // Admin fijo con _id=1

  let doc = await Abogado.findById(ID);
  if (!doc) {
    console.log('No existe admin. Creando…');
    doc = new Abogado({
      _id: ID,
      nombre: NAME,
      disponible: true,
      asignaciones: 0,
      orden: 1,         // requerido por tu esquema
      role: 'admin'
    });
  } else {
    console.log('Admin existente encontrado. Actualizando…');
    doc.nombre = NAME;
    doc.role = 'admin';
    if (doc.orden == null) doc.orden = 1; // por si no lo tenía
  }

  await doc.setPassword(PASSWORD); // usa tu método del modelo (bcrypt + rounds)
  await doc.save();

  console.log(`✅ Admin listo:
  _id: ${doc._id}
  nombre: ${doc.nombre}
  role: ${doc.role}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Error creando admin:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
