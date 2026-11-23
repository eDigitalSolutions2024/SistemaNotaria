// components/VistaAdminSwitcher.jsx
// Botón flotante EXCLUSIVO de la cuenta ADMIN real (ver AuthContext.js:
// esAdminReal) que deja "ver" el sistema como lo vería otro rol, sin cerrar
// sesión ni cambiar de cuenta. Es solo una vista de desarrollo: el token que
// se manda al backend en cada request sigue siendo el de ADMIN, así que
// cualquier candado real del servidor se sigue evaluando como ADMIN — esto
// únicamente cambia qué botones/menús se muestran en el frontend.
//
// Por eso este botón nunca se monta/desmonta según la vista activa (a
// diferencia del resto del sidebar, que sí reacciona a `role`): su propia
// visibilidad depende de `esAdminReal`, no de `role`, para poder volver
// siempre a la vista real. Al estar montado una sola vez en MainPage (fuera
// del contenido de cada sección), con position:fixed, se queda en pantalla
// sin importar a qué parte del sistema te muevas — igual que ManualFlotante.
//
// Es arrastrable: se puede mover con el mouse a cualquier parte de la
// pantalla, y su posición se recuerda (localStorage) para la próxima vez.
import React, { useEffect, useRef, useState } from 'react';
import { Fab, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CheckIcon from '@mui/icons-material/Check';
import { useAuth } from '../auth/AuthContext';

const VISTAS = [
  { rol: 'ADMIN',       label: 'Administrador' },
  { rol: 'RECEPCION',   label: 'Recepción' },
  { rol: 'ABOGADO',     label: 'Abogado' },
  { rol: 'ASISTENTE',   label: 'Asistente' },
  { rol: 'PROTOCOLITO', label: 'Protocolito' },
];

const LS_POS_KEY = 'vistaAdminSwitcherPos';
// Debajo del topbar (--topbar-h: 60px) y a la altura del título de la
// página, pegado al borde del contenido — no choca con el sidebar.
const POS_DEFAULT = { top: 76, left: 270 };
const BTN_SIZE = 56;
const DRAG_THRESHOLD = 4; // px — menos que esto se considera un clic, no arrastre

function clamp(pos) {
  const maxLeft = Math.max(0, window.innerWidth - BTN_SIZE - 8);
  const maxTop = Math.max(0, window.innerHeight - BTN_SIZE - 8);
  return {
    left: Math.min(Math.max(0, pos.left), maxLeft),
    top: Math.min(Math.max(0, pos.top), maxTop),
  };
}

function cargarPosGuardada() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_POS_KEY));
    if (raw && typeof raw.top === 'number' && typeof raw.left === 'number') return clamp(raw);
  } catch {}
  return POS_DEFAULT;
}

export default function VistaAdminSwitcher() {
  const { esAdminReal, realRole, vistaSimulada, cambiarVistaSimulada } = useAuth() || {};
  const [anchorEl, setAnchorEl] = useState(null);
  const [pos, setPos] = useState(cargarPosGuardada);
  const [arrastrando, setArrastrando] = useState(false);
  const dragRef = useRef(null); // { startX, startY, startLeft, startTop, movido }

  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!esAdminReal) return null;

  const vistaActivaRol = vistaSimulada || realRole;
  const simulando = !!vistaSimulada && vistaSimulada !== realRole;
  const labelActiva = VISTAS.find((v) => v.rol === vistaActivaRol)?.label || vistaActivaRol;

  const cerrar = () => setAnchorEl(null);
  const elegir = (rol) => {
    cambiarVistaSimulada(rol);
    cerrar();
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: pos.left,
      startTop: pos.top,
      movido: false,
    };
    setArrastrando(true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.movido && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      d.movido = true;
    }
    if (d.movido) {
      setPos(clamp({ left: d.startLeft + dx, top: d.startTop + dy }));
    }
  };

  const onPointerUp = (e) => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    setArrastrando(false);
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.movido) {
      // Fue un arrastre: guarda la posición nueva y NO abre el menú.
      setPos((p) => {
        const clamped = clamp(p);
        localStorage.setItem(LS_POS_KEY, JSON.stringify(clamped));
        return clamped;
      });
    } else {
      // Fue un clic real (casi sin movimiento): abre el menú.
      setAnchorEl(e.target.closest('button'));
    }
  };

  return (
    <>
      <Tooltip
        title={simulando ? `Viendo como: ${labelActiva} (clic para cambiar · arrastra para mover)` : 'Vista de administrador — clic para probar otros roles, arrastra para mover'}
        placement="right"
      >
        <Fab
          onPointerDown={onPointerDown}
          size="medium"
          sx={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 1250,
            bgcolor: simulando ? '#f59e0b' : '#1e293b',
            color: '#fff',
            cursor: arrastrando ? 'grabbing' : 'grab',
            touchAction: 'none',
            '&:hover': { bgcolor: simulando ? '#d97706' : '#0f172a' },
          }}
        >
          <SwapHorizIcon />
        </Fab>
      </Tooltip>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={cerrar}>
        <MenuItem disabled style={{ opacity: 1 }}>
          <ListItemText
            primary="Vista de administrador"
            secondary={simulando ? `Viendo como ${labelActiva} · tu cuenta sigue siendo ADMIN` : 'Vista real — tu cuenta es ADMIN'}
          />
        </MenuItem>
        <Divider />
        {VISTAS.map((v) => (
          <MenuItem key={v.rol} onClick={() => elegir(v.rol)} selected={v.rol === vistaActivaRol}>
            <ListItemIcon>{v.rol === vistaActivaRol ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
            <ListItemText primary={v.label} secondary={v.rol === realRole ? 'Vista real' : null} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
