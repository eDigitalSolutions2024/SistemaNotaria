// src/components/pld/tabs/HistorialTab.jsx
//
// Timeline vertical de auditoría. `historialEstados` es append-only por
// diseño del backend (AvisoPLD.registrarTransicion en Backend/models/AvisoPLD.js)
// — es la única fuente de verdad de trazabilidad, no hace falta un reporte
// aparte. Sin @mui/lab: el resto del módulo PLD no usa esa dependencia, así
// que el timeline se arma con Box/Stack/Paper para no introducir un paquete
// nuevo solo para esto.
import React from 'react';
import { Box, Paper, Stack, Typography, Chip } from '@mui/material';
import { estadoMeta } from '../pldHelpers';

const DOT_COLORS = {
  default: '#94a3b8',
  primary: '#2563eb',
  info: '#0284c7',
  warning: '#d97706',
  error: '#dc2626',
  success: '#16a34a',
};

function EventoRenglon({ entrada, esUltimo }) {
  const meta = estadoMeta(entrada.estadoHasta);
  const color = DOT_COLORS[meta.color] || DOT_COLORS.default;

  return (
    <Stack direction="row" spacing={2}>
      <Stack alignItems="center" sx={{ pt: 0.5 }}>
        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
        {!esUltimo && <Box sx={{ width: 2, flex: 1, bgcolor: '#e2e8f0', minHeight: 28, mt: 0.5 }} />}
      </Stack>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, flex: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" spacing={1}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{entrada.evento || '—'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {entrada.fecha ? new Date(entrada.fecha).toLocaleString('es-MX') : '—'}
          </Typography>
        </Stack>
        <Chip
          size="small"
          variant="outlined"
          label={`${entrada.estadoDesde || '—'} → ${entrada.estadoHasta || '—'}`}
          sx={{ mt: 0.75, mb: entrada.nota ? 0.75 : 0 }}
        />
        {entrada.nota && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{entrada.nota}</Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {entrada.usuario ? `Por: ${entrada.usuario}` : 'Sistema (automático)'}
        </Typography>
      </Paper>
    </Stack>
  );
}

export default function HistorialTab({ historialEstados }) {
  const eventos = [...(historialEstados || [])].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 0.5 }}>Historial y auditoría</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Registro append-only ({eventos.length} evento{eventos.length === 1 ? '' : 's'}) — cada cambio de estado del
        aviso queda aquí de forma permanente, del más reciente al más antiguo.
      </Typography>
      {eventos.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Este expediente todavía no tiene eventos registrados.
        </Typography>
      ) : (
        <Box>
          {eventos.map((entrada, i) => (
            <EventoRenglon key={i} entrada={entrada} esUltimo={i === eventos.length - 1} />
          ))}
        </Box>
      )}
    </Box>
  );
}
