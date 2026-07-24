// src/components/pld/DiagnosticoJuridicoPanel.jsx
//
// Motor Jurídico Inteligente — panel lateral fijo con el Diagnóstico
// Jurídico del expediente. Mismo lenguaje visual que ExpedientePLDSidebar.jsx
// (Paper outlined + Stack con divider), a propósito: es el mismo tipo de
// panel de contexto persistente, solo que del lado del análisis legal en
// vez del estado operativo del aviso.
//
// Combina DOS fuentes que ya existen y que a propósito NO se mezclan:
//   - `diagnostico` (prop): GET /pld/avisos/:id/diagnostico — el motor de
//     reglas (Backend/pld/motor) evaluado en vivo contra la Escritura. Dice
//     SI aplica PLD, por qué, qué documentos exige la regla, advertencias y
//     nivel de riesgo. Es información LEGAL — no cambia con lo que el
//     abogado vaya capturando en el expediente.
//   - `completitud` (prop): evaluarCompletitud() (pldHelpers.js), ya
//     calculado por ExpedientePLD.jsx para el Sidebar y ValidacionesTab.jsx.
//     Dice si YA se capturó lo necesario para generar el XML. Es
//     información OPERATIVA — cambia cada vez que se guarda un dato.
// El panel las presenta juntas sin fingir que son la misma cosa.
import React from 'react';
import {
  Box, Paper, Typography, Chip, Stack, Divider, Alert, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, CircularProgress, Tooltip,
} from '@mui/material';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import { nivelRiesgoMeta } from './pldHelpers';

const PANEL_WIDTH = 320;

const ACCIONES_MOTOR = {
  SOLICITAR_DATO_FALTANTE: { texto: 'Completa el dato faltante de la actividad para que el motor pueda decidir.', seccion: 'actividad' },
  IDENTIFICAR_BENEFICIARIO_CONTROLADOR: { texto: 'Identifica al beneficiario controlador — requerido por esta actividad, sin pantalla dedicada todavía.', seccion: null },
};

function VeredictoChip({ aplicaPLD }) {
  if (aplicaPLD === true) {
    return <Chip icon={<CheckCircleOutlineIcon />} label="Genera Aviso PLD" color="primary" sx={{ fontWeight: 600 }} />;
  }
  if (aplicaPLD === false) {
    return <Chip icon={<CancelOutlinedIcon />} label="No genera Aviso PLD" color="success" sx={{ fontWeight: 600 }} />;
  }
  return <Chip icon={<HelpOutlineIcon />} label="Requiere revisión manual" color="warning" sx={{ fontWeight: 600 }} />;
}

function Seccion({ titulo, children }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">{titulo}</Typography>
      <Box sx={{ mt: 0.5 }}>{children}</Box>
    </Box>
  );
}

export default function DiagnosticoJuridicoPanel({ diagnostico, diagnosticoError, cargandoDiagnostico, completitud, onIrA }) {
  if (cargandoDiagnostico) {
    return (
      <Paper variant="outlined" sx={{ width: { xs: '100%', md: PANEL_WIDTH }, flexShrink: 0, p: 2, alignSelf: 'flex-start' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">Calculando diagnóstico jurídico…</Typography>
        </Stack>
      </Paper>
    );
  }

  if (diagnosticoError) {
    return (
      <Paper variant="outlined" sx={{ width: { xs: '100%', md: PANEL_WIDTH }, flexShrink: 0, p: 2, alignSelf: 'flex-start' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <GavelOutlinedIcon fontSize="small" color="disabled" />
          <Typography variant="overline" color="text.secondary">Diagnóstico Jurídico</Typography>
        </Stack>
        <Alert severity="warning">{diagnosticoError}</Alert>
      </Paper>
    );
  }

  if (!diagnostico) return null;

  const riesgo = nivelRiesgoMeta(diagnostico.nivelRiesgo);
  const accionesMotor = (diagnostico.acciones || [])
    .filter((codigo) => codigo !== 'ABRIR_EXPEDIENTE')
    .map((codigo) => ({ codigo, ...(ACCIONES_MOTOR[codigo] || { texto: codigo, seccion: null }) }));

  const pendientesCompletitud = (completitud?.items || []).slice(0, 6);

  return (
    <Paper variant="outlined" sx={{ width: { xs: '100%', md: PANEL_WIDTH }, flexShrink: 0, p: 2, alignSelf: 'flex-start' }}>
      <Stack spacing={2} divider={<Divider />}>
        {/* 1) Veredicto + 7) Nivel de riesgo */}
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <GavelOutlinedIcon fontSize="small" color="action" />
            <Typography variant="overline" color="text.secondary">Diagnóstico Jurídico</Typography>
          </Stack>
          <Stack spacing={1} alignItems="flex-start">
            <VeredictoChip aplicaPLD={diagnostico.aplicaPLD} />
            <Tooltip title="Calculado a partir del veredicto del motor de reglas, la fecha límite del aviso y si la detección automática requiere revisión — nunca es un criterio nuevo, solo una lectura de lo que el sistema ya sabe.">
              <Chip
                size="small"
                variant="outlined"
                icon={diagnostico.nivelRiesgo === 'ALTO' ? <ErrorOutlineIcon /> : diagnostico.nivelRiesgo === 'MEDIO' ? <WarningAmberOutlinedIcon /> : <TaskAltOutlinedIcon />}
                label={riesgo.label}
                color={riesgo.color}
              />
            </Tooltip>
          </Stack>
        </Box>

        {/* 2) Fundamento */}
        <Seccion titulo="Fundamento">
          {diagnostico.fundamentoLegal && (
            <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>{diagnostico.fundamentoLegal}</Typography>
          )}
          <Typography variant="body2" color="text.secondary">{diagnostico.motivo}</Typography>
          {diagnostico.umbral != null && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Umbral: ${diagnostico.umbral.toLocaleString('es-MX')} MXN
              {diagnostico.valorAnalizado != null && ` — valor analizado: $${diagnostico.valorAnalizado.toLocaleString('es-MX')} MXN`}
            </Typography>
          )}
        </Seccion>

        {/* 3) Requisitos cumplidos/pendientes + 5) Validaciones pendientes */}
        {completitud && (
          <Seccion titulo={`Requisitos del expediente (${completitud.avance}%)`}>
            {completitud.completo ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CheckCircleOutlineIcon color="success" fontSize="small" />
                <Typography variant="body2">Todo completo para generar el XML.</Typography>
              </Stack>
            ) : (
              <List dense disablePadding>
                {pendientesCompletitud.map((item, i) => (
                  <ListItemButton key={i} onClick={() => onIrA(item.seccion)} sx={{ py: 0.25, borderRadius: 1 }}>
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <WarningAmberOutlinedIcon fontSize="small" color="warning" />
                    </ListItemIcon>
                    <ListItemText primary={item.texto} primaryTypographyProps={{ variant: 'caption' }} />
                  </ListItemButton>
                ))}
                {completitud.items.length > 6 && (
                  <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                    +{completitud.items.length - 6} más — ver Validaciones
                  </Typography>
                )}
              </List>
            )}
          </Seccion>
        )}

        {/* 4) Documentos obligatorios */}
        <Seccion titulo="Documentos requeridos por esta actividad">
          {diagnostico.documentosRequeridos?.length > 0 ? (
            <>
              <List dense disablePadding>
                {diagnostico.documentosRequeridos.map((doc, i) => (
                  <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <DescriptionOutlinedIcon fontSize="small" color="action" />
                    </ListItemIcon>
                    <ListItemText primary={doc} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItem>
                ))}
              </List>
              <Typography variant="caption" color="text.secondary">
                Pendientes de verificación manual — el sistema no rastrea captura de documentos todavía.
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {diagnostico.aplicaPLD === false ? 'No aplica — esta actividad no genera obligación.' : 'La regla aplicable no exige documentos adicionales.'}
            </Typography>
          )}
        </Seccion>

        {/* 6) Advertencias jurídicas */}
        {diagnostico.advertencias?.length > 0 && (
          <Seccion titulo="Advertencias jurídicas">
            <Stack spacing={1}>
              {diagnostico.advertencias.map((adv, i) => (
                <Alert key={i} severity="warning" sx={{ py: 0 }}>{adv}</Alert>
              ))}
            </Stack>
          </Seccion>
        )}

        {/* 8) Acciones recomendadas — combina lo que pide el motor (acciones
            declaradas por la regla) con lo que ya falta según completitud
            (mismos datos de "Requisitos del expediente" arriba, en forma de
            acción concreta en vez de checklist). */}
        {(accionesMotor.length > 0 || pendientesCompletitud.length > 0) && (
          <Seccion titulo="Acciones recomendadas">
            <List dense disablePadding>
              {accionesMotor.map((a, i) => (
                a.seccion ? (
                  <ListItemButton key={`m${i}`} onClick={() => onIrA(a.seccion)} sx={{ py: 0.25, borderRadius: 1 }}>
                    <ListItemText primary={a.texto} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItemButton>
                ) : (
                  <ListItem key={`m${i}`} disableGutters sx={{ py: 0.25 }}>
                    <ListItemText primary={a.texto} primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                  </ListItem>
                )
              ))}
              {pendientesCompletitud.map((item, i) => (
                <ListItemButton key={`c${i}`} onClick={() => onIrA(item.seccion)} sx={{ py: 0.25, borderRadius: 1 }}>
                  <ListItemText primary={item.texto} primaryTypographyProps={{ variant: 'body2' }} />
                </ListItemButton>
              ))}
            </List>
          </Seccion>
        )}
      </Stack>
    </Paper>
  );
}
