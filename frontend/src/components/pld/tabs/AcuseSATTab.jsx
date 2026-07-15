// src/components/pld/tabs/AcuseSATTab.jsx
//
// Pantalla de confirmación del envío al SAT — no un formulario, no una
// tabla. El backend no expone ningún endpoint para enviar el aviso,
// registrar el acuse ni reintentar un envío (el modelo ya reserva
// folioAvisoSAT/folioPortalSAT/acusePdfPath/acuseFechaRegistro, pero nada
// los llena todavía — ver Backend/models/AvisoPLD.js). Por eso esta
// pantalla es de solo lectura: refleja el estado real del aviso y marca
// como placeholder deshabilitado cualquier acción que dependa de un
// endpoint que no existe.
//
// "Enviar al SAT" no se muestra ni como botón deshabilitado: como el
// backend nunca lo permite hoy, se reemplaza directamente por el motivo,
// usando estadoSAT() (pldHelpers.js) — la misma función que ya usan
// Validaciones y XML, sin reimplementar el criterio.
import React from 'react';
import { Box, Card, CardContent, Typography, Chip, Stack, Button, Divider } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import { estadoMeta, estadoSAT } from '../pldHelpers';

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

export default function AcuseSATTab({ aviso }) {
  const meta = estadoMeta(aviso.estado);

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
        <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} disabled sx={{ mt: 3 }} fullWidth>
          Descargar acuse
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Disponible próximamente — todavía no existe el endpoint para descargar el archivo.
        </Typography>
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
          Revisa el motivo, corrige lo necesario y genera un nuevo XML.
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
          Disponible próximamente — todavía no existe el endpoint para reenviar el aviso.
        </Typography>
      </TarjetaConfirmacion>
    );
  }

  // Estado 1 — aviso no enviado (PENDIENTE, LISTO, XML_GENERADO, NO_APLICA, CANCELADO, PENDIENTE_DECLARANOT)
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
