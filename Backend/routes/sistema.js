// Backend/routes/sistema.js
// Acciones de mantenimiento del sistema, solo ADMIN.
const express = require('express');
const router = express.Router();
const { registrar } = require('../utils/bitacora');

function esAdmin(req) {
  return String(req.user?.role || req.user?.rol || '').toUpperCase() === 'ADMIN';
}

/* POST /api/sistema/forzar-actualizacion
   Avisa en vivo (Socket.io) a todos los navegadores conectados para que
   recarguen el sistema y tomen la versión nueva. Cada navegador muestra una
   cuenta regresiva para que nadie pierda lo que está capturando. */
router.post('/forzar-actualizacion', async (req, res) => {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, msg: 'Solo un administrador puede realizar esta acción' });
  }
  const segundos = Math.min(120, Math.max(5, Number(req.body?.segundos) || 30));
  const io = req.app.get('io');
  const conectados = io?.engine?.clientsCount ?? 0;
  io?.emit('app:recargar', { segundos, en: Date.now() });

  await registrar(req, {
    accion: 'ACTUALIZACION_FORZADA',
    entidad: 'Sistema',
    detalle: `Se pidió recargar el sistema a ${conectados} navegador(es) conectado(s) (${segundos}s)`,
  });
  res.json({ ok: true, conectados, segundos });
});

module.exports = router;
