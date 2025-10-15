// estatus.js
require('dotenv').config({path: `.env.${process.env.NODE_ENV || 'development'}`});
const mongoose = require('mongoose');

const Recibo = require('./models/Recibo'); // ajusta el path si es distinto

(async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGO_URI;
    if (!uri) {
      console.error('❌ No se encontró MONGO_URI en .env');
      process.exit(1);
    }

    // Opcional: si usas filtros previos de Mongoose
    // mongoose.set('strictQuery', false);

    console.log('🔌 Conectando a MongoDB…');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 7000, // más estricto
      socketTimeoutMS: 15000,
      // Si usas SRV (mongodb+srv) no pongas useNewUrlParser/useUnifiedTopology (v8 ya no lo usa)
      // tls/ssl según tu clúster; Atlas ya viene con TLS por defecto
    });

    console.log('✅ Conectado. Haciendo ping…');
    await mongoose.connection.db.admin().command({ ping: 1 });
    console.log('🏓 Ping OK');

    // Backfill: agrega 'Activo' donde no exista estatus
    console.log('🛠️ Ejecutando updateMany…');
    const r1 = await Recibo.updateMany(
      { $or: [{ estatus: { $exists: false } }, { estatus: null }] },
      { $set: { estatus: 'Activo' } }
    );
    console.log(`✔️ Backfill (faltantes/null): matched=${r1.matchedCount ?? r1.matched}, modified=${r1.modifiedCount ?? r1.modified}`);

    // (Opcional) normaliza minúsculas a 'Cancelado'/'Activo'
    const r2 = await Recibo.updateMany(
      { estatus: { $regex: /^cancelado$/i } },
      { $set: { estatus: 'Cancelado' } }
    );
    const r3 = await Recibo.updateMany(
      { estatus: { $regex: /^activo$/i } },
      { $set: { estatus: 'Activo' } }
    );
    console.log(`🔤 Normalización: cancelado->Cancelado mod=${r2.modifiedCount ?? r2.modified}, activo->Activo mod=${r3.modifiedCount ?? r3.modified}`);

  } catch (err) {
    console.error('💥 Error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
    console.log('👋 Conexión cerrada.');
  }
})();
