// src/components/pld/tabs/DashboardTab.jsx
//
// Vista ejecutiva del expediente — NO es un formulario. Es la pantalla a
// la que el usuario regresa constantemente: qué está pasando, qué falta,
// qué sigue. Datos generales/Actividad/Validaciones/XML/Acuse/Historial
// son las pantallas donde se edita o se visualiza información específica;
// aquí solo se resume y se recomienda.
//
// Se solapa a propósito con ExpedientePLDSidebar (estado, progreso,
// checklist, alertas): el sidebar es el recordatorio compacto siempre
// visible mientras se trabaja en otro tab; este Dashboard es la versión
// completa, con el detalle y la recomendación de siguiente paso.
import React from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, LinearProgress,
  Stack, Button, Alert, Divider, List, ListItem, ListItemIcon, ListItemText,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { estadoMeta, PROGRESO_POR_ESTADO, diasRestantesTexto } from '../pldHelpers';

function recomendacion(aviso, completitud) {
  switch (aviso.estado) {
    case 'NO_APLICA':
      return { texto: 'Esta escritura no genera obligación PLD. No se requiere ninguna acción.', tab: null };
    case 'CANCELADO':
      return { texto: `Expediente cancelado${aviso.canceladoRazon ? `: ${aviso.canceladoRazon}` : '.'}`, tab: null };
    case 'PRESENTADO':
      return { texto: 'Aviso presentado ante el SAT. No se requiere ninguna acción adicional.', tab: null };
    case 'RECHAZADO_SPPLD':
      return { texto: 'El SAT rechazó el aviso. Corrige los datos y genera un nuevo XML.', tab: 'xml' };
    case 'XML_GENERADO':
      return { texto: 'Descarga el XML, súbelo al portal SPPLD y registra el acuse.', tab: 'acuse' };
    case 'LISTO':
      return { texto: 'Los datos están completos. Genera el XML para continuar.', tab: 'xml' };
    default:
      if (!completitud.completo) {
        return { texto: 'Completa los datos generales y de la actividad para poder generar el XML.', tab: 'datosGenerales' };
      }
      return { texto: 'Los datos están completos. Revisa las validaciones antes de continuar.', tab: 'validaciones' };
  }
}

function DatoRenglon({ label, value, pendiente }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }} color={pendiente ? 'warning.main' : 'text.primary'}>
        {pendiente ? 'Pendiente' : value}
      </Typography>
    </Stack>
  );
}

export default function DashboardTab({ aviso, row, completitud, onIrA }) {
  const meta = estadoMeta(aviso.estado);
  const progreso = PROGRESO_POR_ESTADO[aviso.estado];
  const vencimiento = diasRestantesTexto(aviso.fechaVencimiento);
  const comparecientes = aviso.comparecientes || [];

  const rec = recomendacion(aviso, completitud);

  const alertas = [];
  if (!completitud.completo) alertas.push(`${completitud.faltantes.length} dato(s) pendiente(s) para generar el XML`);
  if (aviso.confianzaDeteccion === 'REQUIERE_REVISION') alertas.push('La detección automática requiere revisión manual');
  if (vencimiento && vencimiento.color !== '#2e7d32') alertas.push(vencimiento.texto);

  const montoTexto = aviso.monto != null
    ? `$${Number(aviso.monto).toLocaleString('es-MX')}`
    : (aviso.montoPrellenado != null
      ? `$${Number(aviso.montoPrellenado).toLocaleString('es-MX')} (heredado, sin confirmar)`
      : null);

  const acciones = [
    { label: 'Datos generales', tab: 'datosGenerales' },
    { label: 'Actividad', tab: 'actividad' },
    { label: 'Validaciones', tab: 'validaciones' },
  ];
  if (aviso.estado === 'LISTO' || aviso.estado === 'XML_GENERADO' || aviso.estado === 'RECHAZADO_SPPLD') {
    acciones.push({ label: 'XML', tab: 'xml' });
  }

  return (
    <Box>
      {/* Estado + progreso */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={meta.label} color={meta.color} />
              <Typography variant="body2" color="text.secondary">
                {aviso.descripcionActividad || 'Actividad no determinada'} ({aviso.incisoLegal || '—'})
              </Typography>
            </Stack>
          </Stack>

          {progreso != null ? (
            <Box sx={{ mt: 2 }}>
              <LinearProgress
                variant="determinate"
                value={progreso}
                color={aviso.estado === 'RECHAZADO_SPPLD' ? 'error' : 'primary'}
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="caption" color="text.secondary">{progreso}% del ciclo del aviso</Typography>
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {aviso.estado === 'CANCELADO' ? 'Expediente cancelado — sin progreso aplicable.' : 'Esta escritura no genera obligación PLD.'}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Próxima acción recomendada */}
      <Alert
        severity={rec.tab ? 'info' : 'success'}
        action={rec.tab && (
          <Button color="inherit" size="small" endIcon={<ArrowForwardIcon />} onClick={() => onIrA(rec.tab)}>
            Ir
          </Button>
        )}
        sx={{ mb: 2 }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>Próxima acción recomendada</Typography>
        {rec.texto}
      </Alert>

      <Grid container spacing={2}>
        {/* Información principal de la escritura */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Información de la escritura</Typography>
              <Divider sx={{ mb: 1 }} />
              <DatoRenglon label="Número de control" value={row?.numeroControl} pendiente={!row?.numeroControl} />
              <DatoRenglon label="Tipo de trámite" value={row?.tipoTramite} pendiente={!row?.tipoTramite} />
              <DatoRenglon
                label="Fecha de operación"
                value={aviso.fechaOperacion ? new Date(aviso.fechaOperacion).toLocaleDateString('es-MX') : null}
                pendiente={!aviso.fechaOperacion}
              />
              <DatoRenglon label="Monto" value={montoTexto} pendiente={!montoTexto} />
              <DatoRenglon label="Comparecientes" value={comparecientes.length} pendiente={comparecientes.length === 0} />
              <DatoRenglon label="Responsable" value={aviso.abogado} pendiente={!aviso.abogado} />
            </CardContent>
          </Card>
        </Grid>

        {/* Checklist completo */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Checklist del expediente</Typography>
              <Divider sx={{ mb: 1 }} />
              {completitud.completo ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CheckCircleOutlineIcon color="success" fontSize="small" />
                  <Typography variant="body2">Todos los datos requeridos están completos</Typography>
                </Stack>
              ) : (
                <List dense disablePadding>
                  {completitud.faltantes.map((f, i) => (
                    <ListItem key={i} disableGutters sx={{ py: 0.25, alignItems: 'flex-start' }}>
                      <ListItemIcon sx={{ minWidth: 26, mt: 0.3 }}>
                        <WarningAmberOutlinedIcon color="warning" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={f} primaryTypographyProps={{ variant: 'body2' }} />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Alertas */}
      {alertas.length > 0 && (
        <Stack spacing={1} sx={{ mt: 2 }}>
          {alertas.map((a, i) => (
            <Alert key={i} severity="warning">{a}</Alert>
          ))}
        </Stack>
      )}

      {/* Acciones disponibles */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Acciones disponibles</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {acciones.map((a) => (
            <Button key={a.tab} variant="outlined" onClick={() => onIrA(a.tab)}>
              {a.label}
            </Button>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
