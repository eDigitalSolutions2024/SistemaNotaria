// src/components/pld/tabs/ValidacionesTab.jsx
//
// Checklist inteligente — no una lista plana de errores. Muestra TODO
// requisito (cumplido y pendiente), agrupado por categoría real
// (Comparecientes / Datos Generales / Actividad — no se inventan
// categorías que no existen en los datos, como "Documentos", que hoy no
// se rastrea en ningún lado del sistema). Lenguaje de asistente, no
// técnico. Todo sale de evaluarCompletitud() (pldHelpers.js), ya calculado
// por el shell — este componente solo organiza y presenta.
import React from 'react';
import {
  Box, Typography, Stack, LinearProgress, List, ListItemButton, ListItem,
  ListItemIcon, ListItemText, Chip, Alert, Divider,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { estadoMeta, estadoXML, estadoSAT } from '../pldHelpers';

const SEVERIDAD_META = {
  error:   { icon: CancelOutlinedIcon, color: 'error.main', etiqueta: 'Obligatorio' },
  warning: { icon: WarningAmberOutlinedIcon, color: 'warning.main', etiqueta: 'Bloqueado' },
  info:    { icon: InfoOutlinedIcon, color: 'info.main', etiqueta: 'Información' },
};

const SECCION_TAB = { datosGenerales: 'datosGenerales', actividad: 'actividad' };

export default function ValidacionesTab({ aviso, completitud, onIrA }) {
  const { checks, avance, completo } = completitud;
  const meta = estadoMeta(aviso.estado);
  const xml = estadoXML(aviso, completitud);
  const sat = estadoSAT(aviso);

  const grupos = checks.reduce((acc, c) => {
    (acc[c.categoria] ||= []).push(c);
    return acc;
  }, {});

  return (
    <Box>
      {/* Estado general del expediente */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip label={meta.label} color={meta.color} size="small" />
        <Typography variant="body2" color="text.secondary">
          El expediente está {meta.label.toLowerCase()} — {avance}% de los requisitos completos.
        </Typography>
      </Stack>
      <LinearProgress variant="determinate" value={avance} sx={{ height: 8, borderRadius: 4, mb: 2 }} />

      {/* Qué impide generar el XML / enviar al SAT */}
      <Stack spacing={1} sx={{ mb: 2 }}>
        <Alert severity={xml.severidad} icon={<DescriptionOutlinedIcon fontSize="small" />}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Generar XML</Typography>
          {xml.texto}
        </Alert>
        <Alert severity="info" icon={<SendOutlinedIcon fontSize="small" />}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Enviar al SAT</Typography>
          {sat}
        </Alert>
      </Stack>

      {completo && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Todo listo — no queda ningún dato pendiente en esta revisión.
        </Alert>
      )}

      {/* Checklist agrupado por categoría, con lo cumplido y lo pendiente */}
      {Object.entries(grupos).map(([categoria, itemsCategoria]) => (
        <Box key={categoria} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{categoria}</Typography>
          <Divider sx={{ mb: 0.5 }} />
          <List dense disablePadding sx={{ bgcolor: '#f8fafc', borderRadius: 1 }}>
            {itemsCategoria.map((c, i) => {
              if (c.cumplido) {
                return (
                  <ListItem key={i} sx={{ py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <CheckCircleOutlineIcon fontSize="small" color="success" />
                    </ListItemIcon>
                    <ListItemText primary={c.label} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItem>
                );
              }
              const sev = SEVERIDAD_META[c.severidad] || SEVERIDAD_META.error;
              const Icono = sev.icon;
              const tab = SECCION_TAB[c.seccion] || c.seccion;
              return (
                <ListItemButton key={i} onClick={() => onIrA(tab)} sx={{ py: 0.5, borderRadius: 1 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Icono fontSize="small" sx={{ color: sev.color }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={c.mensaje}
                    secondary={sev.etiqueta}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </Box>
      ))}
    </Box>
  );
}
