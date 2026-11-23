// components/ManualFlotante.jsx
// Botón flotante visible en todo el sistema (se monta una sola vez en
// MainPage.jsx, dentro de AuthedApp) que abre una vista previa del manual
// de usuario completo, con un menú de secciones que salta directo a cada
// módulo, y un botón para descargar el PDF. El HTML de la vista previa y el
// PDF salen del mismo contenido en el backend (Backend/pdf-templates/
// manualSistema.js) — no hay dos copias del texto que puedan desalinearse.
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import axios from 'axios';
import { Dialog, DialogTitle, DialogContent, IconButton, Button, Fab, Tooltip, CircularProgress } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8010/api';
const POS_KEY = 'manualFab.pos';
const FAB = 56; // diámetro del botón

// Mismo orden e ids que las secciones <section id="..."> de
// Backend/pdf-templates/manualSistema.js — si se agrega/renombra una
// sección allá, hay que reflejarlo aquí también.
const SECCIONES = [
  { id: 'bienvenida', label: 'Bienvenida' },
  { id: 'registrar-cliente', label: 'Registrar Cliente' },
  { id: 'generales', label: 'Generales' },
  { id: 'registrar-abogado', label: 'Registrar Abogado' },
  { id: 'protocolito', label: 'Protocolito' },
  { id: 'escrituras', label: 'Escrituras' },
  { id: 'ia-poderes', label: 'IA para validar Poderes' },
  { id: 'pld', label: 'Expedientes PLD' },
  { id: 'custodia', label: 'Custodia de documentos' },
  { id: 'presupuestos', label: 'Presupuesto' },
  { id: 'recibos', label: 'Recibos' },
  { id: 'gestiones-especiales', label: 'Gestiones especiales' },
  { id: 'calendario', label: 'Calendario y Anuncios' },
  { id: 'glosario', label: 'Glosario' },
];

// forwardRef: expone abrir() para que otros disparadores (el ítem "Manual de
// usuario" del sidebar, en MainPage.jsx) puedan abrir este mismo modal sin
// duplicar la lógica de carga del HTML — un solo componente, dos formas de
// abrirlo (el botón flotante y el ítem del sidebar).
const ManualFlotante = forwardRef(function ManualFlotante(_props, ref) {
  const [abierto, setAbierto] = useState(false);
  const [html, setHtml] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState('bienvenida');
  const iframeRef = useRef(null);
  const pendienteRef = useRef(null);

  const abrir = async () => {
    setAbierto(true);
    if (html) return;
    setCargando(true);
    setError('');
    try {
      const { data } = await axios.get(`${API}/manual/html`, { responseType: 'text' });
      setHtml(data);
    } catch (e) {
      setError('No se pudo cargar el manual.');
    } finally {
      setCargando(false);
    }
  };

  useImperativeHandle(ref, () => ({ abrir }));

  // ---- Botón arrastrable ------------------------------------------------
  // La posición se guarda como distancia al borde derecho/inferior (así se
  // conserva razonablemente al cambiar el tamaño de la ventana) y se
  // recuerda en este navegador. Un arrastre NO abre el manual; un clic sí.
  const [pos, setPos] = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (p && Number.isFinite(p.r) && Number.isFinite(p.b)) return p;
    } catch { /* sin almacenamiento: usa la posición por defecto */ }
    return { r: 24, b: 24 };
  });
  const dragRef = useRef(null);
  const huboArrastreRef = useRef(false);

  const limitar = (p) => ({
    r: Math.min(Math.max(0, p.r), Math.max(0, window.innerWidth - FAB)),
    b: Math.min(Math.max(0, p.b), Math.max(0, window.innerHeight - FAB)),
  });

  useEffect(() => {
    const onResize = () => setPos((p) => limitar(p));
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, r: pos.r, b: pos.b };
    huboArrastreRef.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!huboArrastreRef.current && Math.hypot(dx, dy) < 5) return;
    huboArrastreRef.current = true;
    setPos(limitar({ r: d.r - dx, b: d.b - dy }));
  };

  const onPointerUp = (e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (huboArrastreRef.current) {
      setPos((p) => {
        try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignora */ }
        return p;
      });
    }
  };

  const onClickFab = () => {
    // Si venía de un arrastre, no abre el manual.
    if (huboArrastreRef.current) { huboArrastreRef.current = false; return; }
    abrir();
  };

  const restablecerPos = () => {
    const p = { r: 24, b: 24 };
    setPos(p);
    try { localStorage.removeItem(POS_KEY); } catch { /* ignora */ }
  };

  const irASeccion = (id) => {
    setSeccionActiva(id);
    const doc = iframeRef.current?.contentWindow?.document;
    const el = doc?.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else pendienteRef.current = id;
  };

  const onIframeLoad = () => {
    if (pendienteRef.current) {
      irASeccion(pendienteRef.current);
      pendienteRef.current = null;
    }
  };

  const descargarPDF = async () => {
    setDescargando(true);
    try {
      const res = await axios.get(`${API}/manual/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'manual-sistema-notaria17.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('No se pudo descargar el PDF.');
    } finally {
      setDescargando(false);
    }
  };

  return (
    <>
      <Tooltip title="Manual de usuario (arrastra para mover · doble clic para restablecer)" placement="left">
        <Fab
          color="primary"
          onClick={onClickFab}
          onDoubleClick={restablecerPos}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            position: 'fixed',
            right: pos.r,
            bottom: pos.b,
            zIndex: 1250,
            touchAction: 'none',
            cursor: dragRef.current ? 'grabbing' : 'grab',
          }}
        >
          <MenuBookIcon />
        </Fab>
      </Tooltip>

      <Dialog
        open={abierto}
        onClose={() => setAbierto(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{ style: { height: '92vh' } }}
      >
        <DialogTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e3e7ee' }}>
          <span>Manual de usuario del sistema</span>
          <div>
            <Button
              size="small"
              variant="contained"
              startIcon={descargando ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
              onClick={descargarPDF}
              disabled={descargando}
              style={{ marginRight: 8 }}
            >
              {descargando ? 'Generando…' : 'Descargar PDF'}
            </Button>
            <IconButton onClick={() => setAbierto(false)} size="small">
              <CloseIcon />
            </IconButton>
          </div>
        </DialogTitle>
        <DialogContent dividers style={{ display: 'flex', padding: 0, overflow: 'hidden', flex: 1, minHeight: 0 }}>
          <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid #e3e7ee', overflowY: 'auto', background: '#f8fafc', padding: '10px 0' }}>
            <div style={{ padding: '6px 16px 10px', fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Secciones
            </div>
            {SECCIONES.map((s) => {
              const activa = seccionActiva === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => irASeccion(s.id)}
                  style={{
                    padding: '9px 16px',
                    margin: '1px 8px',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: 'pointer',
                    fontWeight: activa ? 700 : 500,
                    color: activa ? '#1d4ed8' : '#475569',
                    background: activa ? '#e0e7ff' : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (!activa) e.currentTarget.style.background = '#eef2ff'; }}
                  onMouseLeave={(e) => { if (!activa) e.currentTarget.style.background = 'transparent'; }}
                >
                  {s.label}
                </div>
              );
            })}
          </div>
          <div style={{ flex: 1, position: 'relative', minWidth: 0, background: '#eef1f6' }}>
            {cargando && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
                Cargando manual…
              </div>
            )}
            {error && !cargando && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c0392b', fontSize: 13 }}>
                {error}
              </div>
            )}
            {html && !error && (
              <iframe
                ref={iframeRef}
                title="Manual de usuario"
                srcDoc={html}
                onLoad={onIframeLoad}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

export default ManualFlotante;
