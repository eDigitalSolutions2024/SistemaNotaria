// src/components/pld/tabs/ResumenAvisoTab.jsx
//
// Dashboard del expediente — no es un formulario. Da una lectura completa
// del estado del aviso de un vistazo: progreso, qué falta, datos
// principales, comparecientes, fechas y responsable. Todo proviene de
// `aviso` (ya obtenido por el shell vía /pld/detectar) y de `catalogos`
// (ya obtenidos por el shell vía /pld/catalogos/:catalogoId) — cero
// llamadas nuevas, cero datos inventados. Si algo falta, se muestra como
// pendiente explícitamente, nunca se rellena con un valor supuesto.
import React from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, LinearProgress,
  Stack, Button, Alert, Divider,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { estadoMeta, PROGRESO_POR_ESTADO, diasRestantesTexto, evaluarCompletitud } from '../pldHelpers';

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

export default function ResumenAvisoTab({ aviso, row, catalogos, onIrA }) {
  const meta = estadoMeta(aviso.estado);
  const progreso = PROGRESO_POR_ESTADO[aviso.estado];
  const vencimiento = diasRestantesTexto(aviso.fechaVencimiento);
  const comparecientes = aviso.comparecientes || [];

  const completitud = evaluarCompletitud({
    tipoFEP: aviso.tipoFEP,
    comparecientes,
    datosActividad: aviso.datosActividad || {},
    catalogos: catalogos || {},
  });

  const montoTexto = aviso.monto != null
    ? `$${Number(aviso.monto).toLocaleString('es-MX')}`
    : (aviso.montoPrellenado != null
      ? `$${Number(aviso.montoPrellenado).toLocaleString('es-MX')} (heredado, sin confirmar)`
      : null);

  return (
    <Box>
      {/* Banner de estado + progreso + acción principal */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={meta.label} color={meta.color} />
              <Typography variant="body2" color="text.secondary">
                {aviso.descripcionActividad || 'Actividad no determinada'} ({aviso.incisoLegal || '—'})
              </Typography>
            </Stack>
            <Button
              variant="contained"
              onClick={() => onIrA(completitud.completo ? 'xml' : 'datosGenerales')}
            >
              {completitud.completo ? 'Ir a generar XML' : 'Continuar expediente'}
            </Button>
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

          <Alert severity={completitud.completo ? 'success' : 'warning'} sx={{ mt: 2 }} icon={completitud.completo ? <CheckCircleOutlineIcon /> : <WarningAmberOutlinedIcon />}>
            {completitud.completo
              ? 'No falta información para generar el XML.'
              : `Falta información: ${completitud.faltantes.length} punto(s) pendiente(s) (ver pestaña Validaciones).`}
          </Alert>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Datos de la escritura</Typography>
              <Divider sx={{ mb: 1 }} />
              <DatoRenglon label="Número de control" value={row?.numeroControl} pendiente={!row?.numeroControl} />
              <DatoRenglon label="Tipo de trámite" value={row?.tipoTramite} pendiente={!row?.tipoTramite} />
              <DatoRenglon
                label="Fecha de operación"
                value={aviso.fechaOperacion ? new Date(aviso.fechaOperacion).toLocaleDateString('es-MX') : null}
                pendiente={!aviso.fechaOperacion}
              />
              <DatoRenglon label="Monto" value={montoTexto} pendiente={!montoTexto} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Comparecientes ({comparecientes.length})
              </Typography>
              <Divider sx={{ mb: 1 }} />
              {comparecientes.length === 0 ? (
                <Typography variant="body2" color="warning.main">Sin comparecientes registrados</Typography>
              ) : (
                <Stack spacing={0.5}>
                  {comparecientes.map((c, i) => (
                    <Stack key={i} direction="row" justifyContent="space-between">
                      <Typography variant="body2">
                        {c.nombreCompleto || c.nombre || c.denominacionRazon || 'Sin nombre'}
                      </Typography>
                      <Chip size="small" variant="outlined" label={c.rol || 'sin rol'} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Fechas y responsable</Typography>
              <Divider sx={{ mb: 1 }} />
              <DatoRenglon
                label="Creado"
                value={aviso.createdAt ? new Date(aviso.createdAt).toLocaleDateString('es-MX') : null}
                pendiente={!aviso.createdAt}
              />
              <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
                <Typography variant="body2" color="text.secondary">Vencimiento</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }} style={{ color: vencimiento?.color }}>
                  {aviso.fechaVencimiento ? new Date(aviso.fechaVencimiento).toLocaleDateString('es-MX') : 'Pendiente'}
                  {vencimiento ? ` (${vencimiento.texto})` : ''}
                </Typography>
              </Stack>
              <DatoRenglon label="Responsable" value={aviso.abogado} pendiente={!aviso.abogado} />
              <DatoRenglon label="Portal" value={aviso.portal} pendiente={!aviso.portal} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
