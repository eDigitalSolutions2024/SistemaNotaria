// frontend/src/components/anuncios/AnunciosDisplay.jsx
// Recibe anuncios manuales en vivo (Socket.io) y los muestra a TODOS los
// usuarios logueados: URGENTE => modal bloqueante (exige clic en
// "Entendido"), NORMAL => toast que también exige clic para cerrarse. En
// ambos casos el clic es lo que deja la prueba de "visto" (POST /visto) —
// nunca se marca como visto por temporizador ni por click-away.
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Snackbar, Alert, AlertTitle,
} from '@mui/material';
import { useAuth } from '../../auth/AuthContext';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8010/api';
// Socket.io usa la parte de la URL después del host como NAMESPACE, no como
// ruta HTTP — si conectáramos con API (que trae "/api"), el cliente caería
// en el namespace "/api" y nunca recibiría lo que el backend emite sobre el
// namespace por defecto ("/"). Por eso aquí se conecta solo al origen.
const SOCKET_ORIGIN = API.replace(/\/api\/?$/, '');

// Beep generado con Web Audio API (sin depender de un archivo de audio).
// Dos tonos cortos ascendentes — suficiente para llamar la atención sin
// sonar agresivo. Si el navegador bloquea audio sin gesto previo del
// usuario, falla en silencio (ya hubo interacción de sobra para cuando
// llega la primera alerta de una sesión activa).
function reproducirSonidoAlerta() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tono = (freq, inicio, duracion) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracion);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + duracion + 0.05);
    };
    tono(740, 0, 0.16);
    tono(990, 0.18, 0.2);
    setTimeout(() => ctx.close(), 800);
  } catch {
    // silencioso: el sonido es un plus, nunca debe romper la alerta visual
  }
}

export default function AnunciosDisplay() {
  const { token, user, isAuthenticated, logout } = useAuth();
  const authCfg = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const userId = user?.id != null ? Number(user.id) : null;
  const role = String(user?.role || '').toUpperCase();

  const [colaUrgente, setColaUrgente] = useState([]);
  const [colaNormal, setColaNormal] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [errorVisto, setErrorVisto] = useState('');
  const [sesionExpirada, setSesionExpirada] = useState(false);
  const vistosRef = useRef(new Set()); // evita re-encolar lo que ya se marcó en esta sesión

  // El backend ya filtra /pendientes por destinatario, pero el socket
  // transmite en broadcast a todos — este chequeo es lo que evita que un
  // anuncio segmentado le aparezca a quien no es su destinatario.
  const esParaMi = useCallback((anuncio) => {
    if (anuncio?.alcance !== 'SEGMENTO') return true;
    const porUsuario = (anuncio.destinatarios || []).some((d) => Number(d.usuarioId) === userId);
    const porRol = (anuncio.destinatarioRoles || []).includes(role);
    return porUsuario || porRol;
  }, [userId, role]);

  const encolar = useCallback((anuncio) => {
    if (!anuncio?._id || vistosRef.current.has(anuncio._id)) return;
    if (!esParaMi(anuncio)) return;
    const setCola = anuncio.urgencia === 'URGENTE' ? setColaUrgente : setColaNormal;
    setCola((prev) => {
      if (prev.some((a) => a._id === anuncio._id)) return prev;
      if (anuncio.sonido) reproducirSonidoAlerta();
      return [...prev, anuncio];
    });
  }, [esParaMi]);

  const quitarDeColas = useCallback((id) => {
    setColaUrgente((prev) => prev.filter((a) => a._id !== id));
    setColaNormal((prev) => prev.filter((a) => a._id !== id));
  }, []);

  // Anuncios ya activos que el usuario no ha visto (login, recarga, reconexión)
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/anuncios/pendientes`, authCfg);
        (data?.data || []).forEach(encolar);
      } catch {
        // silencioso: si falla, el usuario los verá igual la próxima vez
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token]);

  // Tiempo real
  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = io(SOCKET_ORIGIN, { path: '/socket.io' });
    socket.on('anuncio:nuevo', (anuncio) => encolar(anuncio));
    socket.on('anuncio:desactivado', ({ _id }) => quitarDeColas(_id));
    return () => socket.disconnect();
  }, [isAuthenticated, encolar, quitarDeColas]);

  // Solo se marca como visto y se quita de pantalla si el backend confirmó
  // que guardó el registro. Antes, cualquier falla (p.ej. sesión expirada a
  // media lectura del anuncio) cerraba el aviso igual, dejando al usuario
  // creyendo que quedó registrado cuando en realidad vistoPor nunca se
  // actualizó — el admin seguía viendo "0 vistos" para siempre.
  const marcarVisto = async (anuncio) => {
    setEnviando(true);
    setErrorVisto('');
    try {
      await axios.post(`${API}/anuncios/${anuncio._id}/visto`, {}, authCfg);
      vistosRef.current.add(anuncio._id);
      quitarDeColas(anuncio._id);
    } catch (e) {
      const expiro = e?.response?.status === 401;
      setSesionExpirada(expiro);
      setErrorVisto(
        expiro
          ? 'Tu sesión expiró y no se pudo registrar que lo viste.'
          : 'No se pudo registrar que lo viste. Intenta de nuevo.'
      );
    } finally {
      setEnviando(false);
    }
  };

  const urgente = colaUrgente[0] || null;
  const normal = colaNormal[0] || null;

  // Limpia el error del intento anterior al pasar al siguiente anuncio de la
  // cola, para no arrastrar un mensaje de "sesión expirada" a un anuncio que
  // todavía no se ha intentado confirmar.
  useEffect(() => {
    setErrorVisto('');
    setSesionExpirada(false);
  }, [urgente?._id, normal?._id]);

  return (
    <>
      {urgente && (
        <Dialog open disableEscapeKeyDown onClose={() => {}} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, color: '#b91c1c' }}>
            ⚠️ {urgente.titulo}
          </DialogTitle>
          <DialogContent>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{urgente.mensaje}</p>
            {errorVisto && <p style={{ color: '#b91c1c', fontSize: '0.85rem', marginTop: 12 }}>{errorVisto}</p>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            {/* Solo aparece tras un intento fallido — nadie puede saltarse un
                anuncio urgente sin siquiera intentar confirmarlo, pero si la
                sesión murió a medio camino, nadie se queda atrapado detrás
                del modal sin poder ni cerrar sesión. */}
            {sesionExpirada && (
              <Button color="inherit" onClick={logout}>
                Cerrar sesión
              </Button>
            )}
            <Button
              variant="contained"
              color="error"
              disabled={enviando}
              onClick={() => marcarVisto(urgente)}
            >
              Entendido
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {normal && (
        <Snackbar
          open
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{ maxWidth: 420 }}
        >
          <Alert
            severity="info"
            variant="filled"
            action={
              <Button color="inherit" size="small" disabled={enviando} onClick={() => marcarVisto(normal)}>
                Entendido
              </Button>
            }
            sx={{ alignItems: 'center' }}
          >
            <AlertTitle sx={{ mb: 0.5 }}>{normal.titulo}</AlertTitle>
            <span style={{ whiteSpace: 'pre-wrap' }}>{normal.mensaje}</span>
            {errorVisto && (
              <div style={{ marginTop: 6, fontSize: '0.8rem', opacity: 0.9 }}>{errorVisto}</div>
            )}
          </Alert>
        </Snackbar>
      )}
    </>
  );
}
