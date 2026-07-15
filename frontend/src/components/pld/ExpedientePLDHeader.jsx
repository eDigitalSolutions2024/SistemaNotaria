// src/components/pld/ExpedientePLDHeader.jsx
//
// Header de la columna derecha: identifica la escritura y da la acción de
// volver. Estado, progreso, checklist, alertas, responsable y fecha límite
// ya viven en ExpedientePLDSidebar (columna izquierda) — no se repiten aquí.
import React from 'react';
import { Stack, Typography, Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

export default function ExpedientePLDHeader({ row, aviso, onVolver }) {
  return (
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ mb: 2 }}>
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={onVolver}>
        Volver
      </Button>
      <Typography variant="h6">
        Escritura #{row?.numeroControl}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {aviso.descripcionActividad || 'Actividad no determinada'}
      </Typography>
    </Stack>
  );
}
