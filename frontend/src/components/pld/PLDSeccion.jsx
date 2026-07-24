// src/components/pld/PLDSeccion.jsx
//
// Punto de entrada del módulo PLD como sección propia del menú lateral
// (a diferencia del acceso desde la columna PLD en Escrituras, que abre el
// mismo ExpedientePLD dentro de un Dialog). Aquí se renderiza inline,
// dentro del <main class="contenido"> del shell existente — no se crea
// ningún layout de página nuevo.
//
// Dos pestañas:
// - "Panel de control" (PLDDashboard.jsx, nuevo): opera sobre AvisoPLD ya
//   existentes — métricas, filtros, búsqueda, orden, paginación, detalle.
// - "Detección automática" (este archivo, sin cambios de lógica): nace de
//   las Escrituras (Motor de Reglas, GET /pld/escrituras-pld), no de
//   AvisoPLD — una Escritura sujeta a PLD aparece aunque todavía no tenga
//   expediente ("Pendiente de iniciar"). Al elegir una fila se abre el
//   mismo ExpedientePLD de siempre: si no existe AvisoPLD, se crea en ese
//   momento (detectarAviso, ya existente) — nunca antes, por solo mirar la
//   lista.
import React, { useEffect, useState } from 'react';
import { Box, Typography, Chip, Alert, CircularProgress, Tabs, Tab } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { listarEscriturasPLD } from './pldApi';
import { estadoMeta } from './pldHelpers';
import ExpedientePLD from './ExpedientePLD';
import PLDDashboard from './PLDDashboard';

const columns = [
  { field: 'numeroControl', headerName: 'Núm. control', width: 120 },
  { field: 'tipoTramite', headerName: 'Escritura', width: 220 },
  { field: 'actividad', headerName: 'Actividad', flex: 1, minWidth: 220 },
  { field: 'responsable', headerName: 'Responsable', width: 180 },
  {
    field: 'estado', headerName: 'Estado', width: 170,
    renderCell: (params) => {
      const meta = estadoMeta(params.value);
      return <Chip size="small" label={meta.label} color={meta.color} />;
    },
  },
  {
    field: 'fechaLimite', headerName: 'Fecha límite', width: 130,
    valueFormatter: (value) => (value ? new Date(value).toLocaleDateString('es-MX') : '—'),
  },
];

function DeteccionAutomatica() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filas, setFilas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [avisoRow, setAvisoRow] = useState(null); // { numeroControl } — abre el expediente

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { escrituras, resumen: r } = await listarEscriturasPLD({ limit: 1000 });
        if (!cancelado) {
          setFilas((escrituras || []).map((f) => ({ ...f, actividad: f.actividadPLD?.nombre ?? null })));
          setResumen(r || null);
        }
      } catch (err) {
        if (!cancelado) setError(err?.response?.data?.mensaje || err.message);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  if (avisoRow) {
    return (
      <ExpedientePLD
        row={avisoRow}
        onClose={() => setAvisoRow(null)}
      />
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 0.5 }}>SPLD — Escrituras sujetas a PLD</Typography>
      {resumen && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {resumen.totalEscrituras} escrituras evaluadas — {resumen.pendientesDeIniciar} pendientes de iniciar,{' '}
          {resumen.requierenRevision} requieren revisión, {resumen.conAvisoExistente} con expediente ya abierto.
        </Typography>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
          <CircularProgress size={22} />
          <Typography>Cargando escrituras…</Typography>
        </Box>
      ) : (
        <div style={{ height: 560, width: '100%' }}>
          <DataGrid
            rows={filas}
            columns={columns}
            getRowId={(row) => row.numeroControl}
            onRowClick={(params) => setAvisoRow({ numeroControl: params.row.numeroControl })}
            sx={{ cursor: 'pointer' }}
          />
        </div>
      )}
    </Box>
  );
}

export default function PLDSeccion() {
  const [tab, setTab] = useState('dashboard');

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1.5 }}>Expedientes PLD</Typography>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="dashboard" label="Panel de control" />
        <Tab value="deteccion" label="Detección automática" />
      </Tabs>
      {tab === 'dashboard' ? <PLDDashboard /> : <DeteccionAutomatica />}
    </Box>
  );
}
