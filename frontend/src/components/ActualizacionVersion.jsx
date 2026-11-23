// components/ActualizacionVersion.jsx
// Mantiene a todos los navegadores en la versión vigente del sistema.
//  1) Cada compilación lleva un BUILD_ID (scripts/genVersion.js). El
//     navegador consulta /version.json al volver a la pestaña y cada pocos
//     minutos; si difiere del suyo, muestra una barra "versión nueva".
//  2) El ADMIN puede forzar la recarga en vivo (Socket.io 'app:recargar'):
//     sale un aviso con cuenta regresiva y luego se recarga solo.
// En desarrollo (sin BUILD_ID) no consulta versión, solo escucha al servidor.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8010/api';
const SOCKET_ORIGIN = API.replace(/\/api\/?$/, '');
const BUILD_ID = process.env.REACT_APP_BUILD_ID || '';
const REVISAR_CADA_MS = 5 * 60 * 1000;
const MIN_ENTRE_REVISIONES_MS = 30 * 1000;

async function recargarConLoNuevo() {
  // Refresca en caché el index.html (para no volver a cargar el viejo) y
  // luego recarga.
  try {
    await fetch(window.location.href, { cache: 'reload' });
  } catch {
    /* si falla, igual recarga */
  }
  window.location.reload();
}

export default function ActualizacionVersion() {
  const [hayNueva, setHayNueva] = useState(false);
  const [forzado, setForzado] = useState(null); // { restante }
  const ultimaRevisionRef = useRef(0);

  const revisar = useCallback(async () => {
    if (!BUILD_ID) return;
    const ahora = Date.now();
    if (ahora - ultimaRevisionRef.current < MIN_ENTRE_REVISIONES_MS) return;
    ultimaRevisionRef.current = ahora;
    try {
      const r = await fetch(`${process.env.PUBLIC_URL || ''}/version.json?t=${ahora}`, { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (version && version !== BUILD_ID) setHayNueva(true);
    } catch {
      /* sin red o respuesta no válida: se intenta en la próxima */
    }
  }, []);

  useEffect(() => {
    revisar();
    const t = setInterval(revisar, REVISAR_CADA_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', revisar);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', revisar);
    };
  }, [revisar]);

  // Orden del administrador en vivo
  useEffect(() => {
    const socket = io(SOCKET_ORIGIN, { path: '/socket.io' });
    socket.on('app:recargar', ({ segundos } = {}) => {
      setForzado((prev) => prev || { restante: Math.min(120, Math.max(5, Number(segundos) || 30)) });
    });
    return () => socket.disconnect();
  }, []);

  // Cuenta regresiva de la recarga forzada
  const activo = !!forzado;
  const restante = forzado?.restante;
  useEffect(() => {
    if (!activo) return undefined;
    if (restante <= 0) {
      recargarConLoNuevo();
      return undefined;
    }
    const t = setTimeout(() => setForzado((f) => (f ? { restante: f.restante - 1 } : f)), 1000);
    return () => clearTimeout(t);
  }, [activo, restante]);

  return (
    <>
      {hayNueva && !forzado && (
        <div
          role="status"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
            padding: '8px 12px', background: '#1d4ed8', color: '#fff', fontSize: 14,
            boxShadow: '0 2px 8px rgba(0,0,0,.25)',
          }}
        >
          <span>Hay una versión nueva del sistema. Guarda lo que estés haciendo y actualiza.</span>
          <Button
            size="small"
            variant="contained"
            onClick={recargarConLoNuevo}
            sx={{ bgcolor: '#fff', color: '#1d4ed8', '&:hover': { bgcolor: '#e0e7ff' } }}
          >
            Actualizar ahora
          </Button>
        </div>
      )}

      {forzado && (
        <Dialog open disableEscapeKeyDown onClose={() => {}} maxWidth="xs" fullWidth sx={{ zIndex: 2100 }}>
          <DialogTitle sx={{ fontWeight: 700 }}>Actualización del sistema</DialogTitle>
          <DialogContent>
            <p style={{ margin: 0 }}>
              El administrador solicitó actualizar el sistema. Guarda lo que estés capturando:
              se recargará automáticamente en <b>{Math.max(0, forzado.restante)}</b> segundo(s).
            </p>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="contained" onClick={recargarConLoNuevo}>Actualizar ahora</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
