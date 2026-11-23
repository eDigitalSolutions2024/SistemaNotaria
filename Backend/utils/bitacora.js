// Backend/utils/bitacora.js
// Helper compartido para escribir a la bitácora global de auditoría.
// Regla de oro: nunca debe poder romper la operación que la llama.
const Bitacora = require('../models/Bitacora');

function obtenerIp(req) {
  return req.ip || req.connection?.remoteAddress || '';
}

async function registrar(req, { accion, entidad = '', entidadId = null, detalle = '', usuarioIdOverride, usuarioNombreOverride }) {
  try {
    await Bitacora.create({
      usuarioId: usuarioIdOverride ?? req.user?.id ?? null,
      usuarioNombre: usuarioNombreOverride ?? req.user?.nombre ?? 'Desconocido',
      ip: obtenerIp(req),
      accion,
      entidad,
      entidadId,
      detalle,
    });
  } catch (e) {
    console.error('BITACORA ERROR:', e);
  }
}

module.exports = { registrar, obtenerIp };
