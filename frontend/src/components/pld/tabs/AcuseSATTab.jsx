// src/components/pld/tabs/AcuseSATTab.jsx
//
// Pantalla de confirmación del envío al SAT. Desde XML_GENERADO permite
// registrar el resultado real de la subida manual al portal SPPLD:
// "Registrar acuse" (folio + PDF) pasa el aviso a PRESENTADO; "Marcar como
// rechazado" (motivo) pasa a RECHAZADO_SPPLD. Ambos son estados terminales —
// RECHAZADO_SPPLD queda inmutable (ESTADOS_INMUTABLES en el backend); la
// corrección es vía un aviso modificatorio, que todavía no existe como
// funcionalidad, por eso "Reintentar envío" se queda deshabilitado.
import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Chip, Stack, Button, Divider,
  TextField, Alert, CircularProgress,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import { estadoMeta, estadoSAT } from '../pldHelpers';
import { registrarAcuse, rechazarSPPLD, descargarAcuse } from '../pldApi';

function Renglon({ label, value }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right' }}>{value || 'Pendiente de registrar'}</Typography>
    </Stack>
  );
}

function TarjetaConfirmacion({ children }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <Card variant="outlined" sx={{ maxWidth: 480, width: '100%' }}>
        <CardContent sx={{ textAlign: 'center', py: 5, px: 4 }}>
          {children}
        </CardContent>
      </Card>
    </Box>
  );
}

function RegistrarAcuseForm({ aviso, onGuardado }) {
  const [folioAvisoSAT, setFolioAvisoSAT] = useState('');
  const [folioPortalSAT, setFolioPortalSAT] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);
    try {
      const { aviso: avisoActualizado } = await registrarAcuse(aviso._id, { folioAvisoSAT, folioPortalSAT, archivo });
      onGuardado(avisoActualizado);
    } catch (err) {
      setMensaje({ severidad: 'error', texto: err?.response?.data?.mensaje || 'No se pudo registrar el acuse.' });
    } finally {
      setEnviando(false);
    }
  }

  const puedeEnviar = folioAvisoSAT.trim() !== '' && !!archivo && !enviando;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Registrar acuse</Typography>
        <Stack component="form" onSubmit={handleSubmit} spacing={2}>
          <TextField
            label="Folio del aviso (SAT)"
            size="small"
            value={folioAvisoSAT}
            onChange={(e) => setFolioAvisoSAT(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Folio de portal (opcional)"
            size="small"
            value={folioPortalSAT}
            onChange={(e) => setFolioPortalSAT(e.target.value)}
            fullWidth
          />
          <Button component="label" variant="outlined" startIcon={<UploadFileOutlinedIcon />} sx={{ alignSelf: 'flex-start' }}>
            {archivo ? archivo.name : 'Seleccionar PDF del acuse'}
            <input type="file" accept="application/pdf" hidden onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
          </Button>
          {mensaje && <Alert severity={mensaje.severidad} onClose={() => setMensaje(null)}>{mensaje.texto}</Alert>}
          <Button
            type="submit"
            variant="contained"
            disabled={!puedeEnviar}
            startIcon={enviando ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
          >
            {enviando ? 'Registrando…' : 'Registrar acuse'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function RechazarForm({ aviso, onGuardado }) {
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);
    try {
      const { aviso: avisoActualizado } = await rechazarSPPLD(aviso._id, nota);
      onGuardado(avisoActualizado);
    } catch (err) {
      setMensaje({ severidad: 'error', texto: err?.response?.data?.mensaje || 'No se pudo registrar el rechazo.' });
    } finally {
      setEnviando(false);
    }
  }

  const puedeEnviar = nota.trim() !== '' && !enviando;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Marcar como rechazado por el SAT</Typography>
        <Stack component="form" onSubmit={handleSubmit} spacing={2}>
          <TextField
            label="Motivo del rechazo"
            size="small"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            required
            multiline
            minRows={2}
            fullWidth
          />
          {mensaje && <Alert severity={mensaje.severidad} onClose={() => setMensaje(null)}>{mensaje.texto}</Alert>}
          <Button
            type="submit"
            color="error"
            variant="outlined"
            disabled={!puedeEnviar}
            startIcon={enviando ? <CircularProgress size={16} /> : <BlockOutlinedIcon />}
          >
            {enviando ? 'Registrando…' : 'Marcar como rechazado'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function AcuseSATTab({ aviso, puedeGenerar, onGuardado }) {
  const meta = estadoMeta(aviso.estado);
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState(null);

  async function handleDescargarAcuse() {
    setDescargando(true);
    setErrorDescarga(null);
    try {
      const blob = await descargarAcuse(aviso._id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acuse-${aviso.folioAvisoSAT || aviso._id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorDescarga(err?.response?.data?.mensaje || 'No se pudo descargar el acuse.');
    } finally {
      setDescargando(false);
    }
  }

  // Estado 2 — enviado correctamente
  if (aviso.estado === 'PRESENTADO') {
    return (
      <TarjetaConfirmacion>
        <CheckCircleOutlineIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
        <Typography variant="h6" sx={{ mb: 0.5 }}>Aviso presentado ante el SAT</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          El expediente quedó registrado correctamente.
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ textAlign: 'left' }}>
          <Renglon label="Estado" value={meta.label} />
          <Renglon label="Fecha de envío" value={aviso.acuseFechaRegistro ? new Date(aviso.acuseFechaRegistro).toLocaleString('es-MX') : null} />
          <Renglon label="Folio del aviso" value={aviso.folioAvisoSAT} />
          <Renglon label="Número de acuse" value={aviso.folioPortalSAT} />
          <Renglon label="Responsable" value={aviso.abogado} />
        </Box>
        {errorDescarga && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setErrorDescarga(null)}>{errorDescarga}</Alert>}
        <Button
          variant="outlined"
          startIcon={descargando ? <CircularProgress size={16} /> : <DownloadOutlinedIcon />}
          onClick={handleDescargarAcuse}
          disabled={descargando}
          sx={{ mt: 3 }}
          fullWidth
        >
          {descargando ? 'Descargando…' : 'Descargar acuse'}
        </Button>
      </TarjetaConfirmacion>
    );
  }

  // Estado 3 — error de envío
  if (aviso.estado === 'RECHAZADO_SPPLD') {
    const ultimoRechazo = [...(aviso.historialEstados || [])].reverse().find((h) => h.estadoHasta === 'RECHAZADO_SPPLD');
    return (
      <TarjetaConfirmacion>
        <ErrorOutlineIcon color="error" sx={{ fontSize: 56, mb: 1 }} />
        <Typography variant="h6" sx={{ mb: 0.5 }}>El SAT rechazó el aviso</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Este expediente quedó cerrado con el motivo registrado abajo.
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ textAlign: 'left' }}>
          <Renglon label="Mensaje recibido del backend" value={ultimoRechazo?.nota} />
          <Renglon label="Fecha" value={ultimoRechazo?.fecha ? new Date(ultimoRechazo.fecha).toLocaleString('es-MX') : null} />
        </Box>
        <Button variant="outlined" startIcon={<ReplayOutlinedIcon />} disabled sx={{ mt: 3 }} fullWidth>
          Reintentar envío
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Este aviso quedó cerrado y ya no se puede editar. Corregirlo requiere presentar un aviso modificatorio —
          esa funcionalidad todavía no está construida en el sistema.
        </Typography>
      </TarjetaConfirmacion>
    );
  }

  // Estado 1a — XML listo: se puede registrar el resultado del envío manual
  if (aviso.estado === 'XML_GENERADO') {
    if (!puedeGenerar) {
      return (
        <Box>
          <Chip label={meta.label} color={meta.color} size="small" sx={{ mb: 2 }} />
          <Alert severity="info">
            Tu rol no tiene permiso para registrar el resultado del envío al SAT. Contacta a un notario o administrador.
          </Alert>
        </Box>
      );
    }
    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
          <Chip label={meta.label} color={meta.color} size="small" />
          <Typography variant="body2" color="text.secondary">
            Sube el XML al portal SPPLD manualmente y luego registra aquí lo que pasó.
          </Typography>
        </Stack>
        <Stack spacing={2}>
          <RegistrarAcuseForm aviso={aviso} onGuardado={onGuardado} />
          <RechazarForm aviso={aviso} onGuardado={onGuardado} />
        </Stack>
      </Box>
    );
  }

  // Estado 1b — aviso todavía no llega a XML_GENERADO (PENDIENTE, LISTO,
  // NO_APLICA, CANCELADO, PENDIENTE_DECLARANOT)
  return (
    <TarjetaConfirmacion>
      <HourglassEmptyOutlinedIcon color="disabled" sx={{ fontSize: 56, mb: 1 }} />
      <Typography variant="h6" sx={{ mb: 1 }}>Aviso todavía no enviado</Typography>
      <Chip label={meta.label} color={meta.color} size="small" sx={{ mb: 2 }} />
      <Typography variant="body2" color="text.secondary">
        {estadoSAT(aviso)}
      </Typography>
    </TarjetaConfirmacion>
  );
}
