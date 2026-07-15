// src/components/pld/ExpedientePLDSidebar.jsx
//
// Columna izquierda fija del Expediente PLD — persiste sin importar qué
// tab esté activo a la derecha, para que el usuario nunca pierda contexto
// del expediente (estado, qué falta, qué puede hacer). Todo el contenido
// viene de `aviso`/`catalogos` ya obtenidos por el shell — nada nuevo del
// backend, nada inventado.
import React from 'react';
import {
  Box, Paper, Typography, Chip, LinearProgress, Stack, Divider,
  Button, List, ListItem, ListItemIcon, ListItemText, Alert,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { estadoMeta, PROGRESO_POR_ESTADO, diasRestantesTexto } from './pldHelpers';
import { descargarXML } from './pldApi';

const SIDEBAR_WIDTH = 300;

export default function ExpedientePLDSidebar({ aviso, completitud, onIrA }) {
  const meta = estadoMeta(aviso.estado);
  const progreso = PROGRESO_POR_ESTADO[aviso.estado];
  const vencimiento = diasRestantesTexto(aviso.fechaVencimiento);

  const alertas = [];
  if (!completitud.completo) {
    alertas.push(`${completitud.faltantes.length} dato(s) pendiente(s) para generar el XML`);
  }
  if (aviso.confianzaDeteccion === 'REQUIERE_REVISION') {
    alertas.push('La detección automática requiere revisión manual');
  }
  if (vencimiento && vencimiento.color !== '#2e7d32') {
    alertas.push(vencimiento.texto);
  }

  async function handleDescargarXML() {
    const blob = await descargarXML(aviso._id);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${aviso.referenciaOperador || aviso._id}.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <Paper
      variant="outlined"
      sx={{ width: { xs: '100%', md: SIDEBAR_WIDTH }, flexShrink: 0, p: 2, alignSelf: 'flex-start' }}
    >
      <Stack spacing={2} divider={<Divider />}>
        <Box>
          <Typography variant="overline" color="text.secondary">Estado</Typography>
          <Box sx={{ mt: 0.5 }}>
            <Chip label={meta.label} color={meta.color} />
          </Box>
          {progreso != null ? (
            <Box sx={{ mt: 1.5 }}>
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
              {aviso.estado === 'CANCELADO' ? 'Sin progreso aplicable (cancelado).' : 'No genera obligación PLD.'}
            </Typography>
          )}
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary">Checklist</Typography>
          {completitud.completo ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
              <CheckCircleOutlineIcon color="success" fontSize="small" />
              <Typography variant="body2">Todo completo</Typography>
            </Stack>
          ) : (
            <List dense disablePadding sx={{ mt: 0.5 }}>
              {completitud.faltantes.slice(0, 4).map((f, i) => (
                <ListItem key={i} disableGutters sx={{ py: 0.25, alignItems: 'flex-start' }}>
                  <ListItemIcon sx={{ minWidth: 26, mt: 0.3 }}>
                    <WarningAmberOutlinedIcon color="warning" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={f} primaryTypographyProps={{ variant: 'caption' }} />
                </ListItem>
              ))}
              {completitud.faltantes.length > 4 && (
                <Typography variant="caption" color="text.secondary">
                  +{completitud.faltantes.length - 4} más — ver Validaciones
                </Typography>
              )}
            </List>
          )}
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary">Acciones rápidas</Typography>
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            <Button size="small" variant="outlined" onClick={() => onIrA('datosGenerales')}>
              Datos generales
            </Button>
            <Button size="small" variant="outlined" onClick={() => onIrA('validaciones')}>
              Ver validaciones
            </Button>
            {aviso.xmlContenido && (
              <Button size="small" variant="outlined" onClick={handleDescargarXML}>
                Descargar XML
              </Button>
            )}
          </Stack>
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary">Alertas</Typography>
          {alertas.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Sin alertas</Typography>
          ) : (
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              {alertas.map((a, i) => (
                <Alert key={i} severity="warning" sx={{ py: 0 }}>{a}</Alert>
              ))}
            </Stack>
          )}
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary">Responsable</Typography>
          <Typography variant="body2" color={aviso.abogado ? 'text.primary' : 'warning.main'}>
            {aviso.abogado || 'Pendiente'}
          </Typography>
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary">Última actualización</Typography>
          <Typography variant="body2">
            {aviso.updatedAt ? new Date(aviso.updatedAt).toLocaleString('es-MX') : 'Pendiente'}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
