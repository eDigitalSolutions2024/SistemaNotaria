// src/components/pld/tabs/HistorialTab.jsx
//
// Historial y Auditoría se muestran juntos a propósito: hoy solo existe
// una fuente de datos (aviso.historialEstados[], append-only por diseño
// del backend) — no hay un "reporte de auditoría" separado todavía. Se
// usa DataGrid, no una tabla HTML plana, para mantener el mismo componente
// de tabla que el resto del sistema (Escrituras, pickers embebidos, etc.).
import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography } from '@mui/material';

const columns = [
  {
    field: 'fecha', headerName: 'Fecha', width: 170,
    valueFormatter: (value) => value ? new Date(value).toLocaleString('es-MX') : '—',
  },
  { field: 'evento', headerName: 'Evento', width: 190 },
  {
    field: 'transicion', headerName: 'Transición', width: 220, sortable: false,
    valueGetter: (_value, row) => `${row.estadoDesde || '—'} → ${row.estadoHasta || '—'}`,
  },
  { field: 'usuario', headerName: 'Usuario', width: 160 },
  { field: 'nota', headerName: 'Nota', flex: 1, minWidth: 200 },
];

export default function HistorialTab({ historialEstados }) {
  const rows = (historialEstados || []).map((h, i) => ({ id: i, ...h }));

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Historial y Auditoría ({rows.length})
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Registro append-only: cada cambio de estado del aviso queda aquí de forma permanente.
      </Typography>
      <div style={{ height: 340, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          density="compact"
          hideFooterSelectedRowCount
          disableRowSelectionOnClick
          initialState={{ sorting: { sortModel: [{ field: 'fecha', sort: 'desc' }] } }}
        />
      </div>
    </Box>
  );
}
