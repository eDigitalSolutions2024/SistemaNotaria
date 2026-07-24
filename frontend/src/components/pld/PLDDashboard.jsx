// src/components/pld/PLDDashboard.jsx
//
// Panel de control operativo del módulo PLD — a diferencia de PLDSeccion.jsx
// (que nace de las Escrituras vía el Motor de Reglas y muestra también las
// que todavía no tienen expediente), este dashboard nace de los AvisoPLD ya
// existentes: es la vista para monitorear, filtrar y actuar sobre avisos que
// ya están en curso. Cero datos inventados — todo viene de
// GET /pld/avisos y GET /pld/avisos/metricas (Backend/routes/pld.js).
//
// El filtro "tipo de acto" es texto libre contra descripcionActividad a
// propósito: cuando se carguen los catálogos oficiales SAT/UIF (hoy vacíos,
// ver Backend/pld/catalogos/data/*.json) este filtro sigue funcionando igual,
// sin acoplarse a un catálogo que todavía no existe.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box, Paper, Stack, Typography, Chip, TextField, MenuItem, Button,
  IconButton, Menu, Alert, CircularProgress, Tooltip, Dialog, DialogContent,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ThemeProvider } from '@mui/material/styles';

import { useAuth } from '../../auth/AuthContext';
import { listarAvisos, listarAvisosMetricas, generarXML, descargarXML, descargarAcuse } from './pldApi';
import { estadoMeta, diasRestantesTexto, puedePresentarPLD, puedeVerTodoPLD } from './pldHelpers';
import pldTheme from './pldTheme';
import ExpedientePLD from './ExpedientePLD';

import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import ClearOutlinedIcon from '@mui/icons-material/ClearOutlined';

// Estados reales del modelo AvisoPLD (Backend/models/AvisoPLD.js) — a
// diferencia de pldHelpers.ESTADO_META, que también incluye los estados
// sintéticos SIN_EXPEDIENTE/REQUIERE_REVISION que solo existen en la vista
// de detección (PLDSeccion.jsx), no en AvisoPLD.
const ESTADOS_AVISO = [
  'PENDIENTE', 'PENDIENTE_DECLARANOT', 'LISTO', 'XML_GENERADO',
  'PRESENTADO', 'RECHAZADO_SPPLD', 'NO_APLICA', 'CANCELADO',
];

const FILTROS_INICIALES = {
  estado: '', desde: '', hasta: '', tipoActo: '', abogado: '', numeroControl: '', compareciente: '', q: '',
};

function getUserRoles(u) {
  const roles = [];
  if (Array.isArray(u?.roles)) roles.push(...u.roles);
  if (u?.role) roles.push(u.role);
  if (u?.rol) roles.push(u.rol);
  return roles.map((r) => String(r).toLocaleUpperCase('es-MX'));
}

function resumenComparecientes(comparecientes) {
  if (!comparecientes || comparecientes.length === 0) return '—';
  const nombres = comparecientes.map((c) =>
    c.nombreCompleto || c.denominacionRazon || [c.nombre, c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(' ') || '—'
  );
  return nombres.join(', ');
}

const CARD_DEFS = [
  { key: 'total', label: 'Total de avisos', icon: AssignmentOutlinedIcon, color: '#334155' },
  { key: 'pendientes', label: 'Pendientes', icon: HourglassEmptyOutlinedIcon, color: '#d97706', estadoFiltro: 'PENDIENTE' },
  { key: 'xmlGenerados', label: 'XML generados', icon: DescriptionOutlinedIcon, color: '#2563eb', estadoFiltro: 'XML_GENERADO' },
  { key: 'presentados', label: 'Presentados', icon: CheckCircleOutlineIcon, color: '#16a34a', estadoFiltro: 'PRESENTADO' },
  { key: 'rechazados', label: 'Rechazados', icon: ErrorOutlineIcon, color: '#dc2626', estadoFiltro: 'RECHAZADO_SPPLD' },
  { key: 'acusesRegistrados', label: 'Acuses registrados', icon: FactCheckOutlinedIcon, color: '#0f766e' },
  { key: 'vencidos', label: 'Vencidos', icon: WarningAmberOutlinedIcon, color: '#b91c1c' },
];

function MetricCard({ def, valor, cargando, activo, onClick }) {
  const Icon = def.icon;
  return (
    <Paper
      variant="outlined"
      onClick={def.estadoFiltro ? onClick : undefined}
      sx={{
        p: 1.75, flex: '1 1 150px', minWidth: 150,
        borderColor: activo ? def.color : undefined,
        borderWidth: activo ? 2 : 1,
        cursor: def.estadoFiltro ? 'pointer' : 'default',
        transition: 'border-color .15s, box-shadow .15s',
        '&:hover': def.estadoFiltro ? { boxShadow: 1, borderColor: def.color } : undefined,
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box sx={{
          width: 34, height: 34, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: `${def.color}1a`, color: def.color, flexShrink: 0,
        }}>
          <Icon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
            {def.label}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {cargando ? <CircularProgress size={16} /> : (valor ?? 0)}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

function AccionesCell({ row, puedeGenerar, onAbrir, onAccionDirecta }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const abierto = Boolean(anchorEl);

  const tieneXML = !!row.xmlContenido;
  const puedeGenerarXML = puedeGenerar && ['PENDIENTE', 'LISTO', 'XML_GENERADO'].includes(row.estado);
  const puedeRegistrarAcuse = puedeGenerar && row.estado === 'XML_GENERADO';
  const puedeDescargarAcuse = row.estado === 'PRESENTADO' && !!row.acusePdfPath;
  const esRechazado = row.estado === 'RECHAZADO_SPPLD';

  const cerrar = () => setAnchorEl(null);

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Tooltip title="Ver expediente">
        <IconButton size="small" onClick={() => onAbrir(row, 'dashboard')}>
          <VisibilityOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={abierto} onClose={cerrar}>
        {puedeGenerarXML && (
          <MenuItem onClick={() => { cerrar(); onAccionDirecta('generarXML', row); }}>
            <DescriptionOutlinedIcon fontSize="small" style={{ marginRight: 8 }} />
            {tieneXML ? 'Regenerar XML' : 'Generar XML'}
          </MenuItem>
        )}
        {tieneXML && (
          <MenuItem onClick={() => { cerrar(); onAccionDirecta('descargarXML', row); }}>
            <DownloadOutlinedIcon fontSize="small" style={{ marginRight: 8 }} />
            Descargar XML
          </MenuItem>
        )}
        {puedeRegistrarAcuse && (
          <MenuItem onClick={() => { cerrar(); onAbrir(row, 'acuse'); }}>
            <CheckCircleOutlineIcon fontSize="small" style={{ marginRight: 8 }} />
            Registrar acuse
          </MenuItem>
        )}
        {puedeDescargarAcuse && (
          <MenuItem onClick={() => { cerrar(); onAccionDirecta('descargarAcuse', row); }}>
            <DownloadOutlinedIcon fontSize="small" style={{ marginRight: 8 }} />
            Descargar acuse
          </MenuItem>
        )}
        <MenuItem onClick={() => { cerrar(); onAbrir(row, 'historial'); }}>
          <HistoryOutlinedIcon fontSize="small" style={{ marginRight: 8 }} />
          Ver historial
        </MenuItem>
        {esRechazado && (
          <Tooltip title="Este aviso quedó cerrado. Corregirlo requiere un aviso modificatorio — funcionalidad todavía no construida.">
            <span>
              <MenuItem disabled>
                <ReplayOutlinedIcon fontSize="small" style={{ marginRight: 8 }} />
                Reintentar
              </MenuItem>
            </span>
          </Tooltip>
        )}
      </Menu>
    </Stack>
  );
}

export default function PLDDashboard() {
  const { user } = useAuth();
  const roles = useMemo(() => getUserRoles(user), [user]);
  const puedeGenerar = puedePresentarPLD(roles);
  const puedeVerTodo = puedeVerTodoPLD(roles);

  const [filtrosInput, setFiltrosInput] = useState(FILTROS_INICIALES);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);

  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 20 });
  const [sortModel, setSortModel] = useState([{ field: 'fechaVencimiento', sort: 'asc' }]);

  const [metricas, setMetricas] = useState(null);
  const [cargandoMetricas, setCargandoMetricas] = useState(true);

  const [filas, setFilas] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [cargandoTabla, setCargandoTabla] = useState(true);
  const [error, setError] = useState(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [mensaje, setMensaje] = useState(null); // { severidad, texto }
  const [expediente, setExpediente] = useState(null); // { row: {numeroControl}, tabInicial }

  // Debounce de 250ms — mismo patrón que onChangePickerQ en Escrituras.jsx
  useEffect(() => {
    const t = setTimeout(() => setFiltros(filtrosInput), 250);
    return () => clearTimeout(t);
  }, [filtrosInput]);

  const paramsFiltro = useMemo(() => {
    const p = {};
    Object.entries(filtros).forEach(([k, v]) => { if (v !== '' && v != null) p[k] = v; });
    return p;
  }, [filtros]);

  const recargar = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    let cancelado = false;
    setCargandoMetricas(true);
    listarAvisosMetricas(paramsFiltro)
      .then((data) => { if (!cancelado) setMetricas(data); })
      .catch(() => { if (!cancelado) setMetricas(null); })
      .finally(() => { if (!cancelado) setCargandoMetricas(false); });
    return () => { cancelado = true; };
  }, [paramsFiltro, refreshTick]);

  useEffect(() => {
    let cancelado = false;
    setCargandoTabla(true);
    setError(null);
    const params = {
      ...paramsFiltro,
      page: paginationModel.page + 1,
      limit: paginationModel.pageSize,
      sortBy: sortModel[0]?.field,
      sortDir: sortModel[0]?.sort,
    };
    listarAvisos(params)
      .then((data) => {
        if (cancelado) return;
        setFilas(data.avisos || []);
        setRowCount(data.total || 0);
      })
      .catch((err) => { if (!cancelado) setError(err?.response?.data?.mensaje || err.message); })
      .finally(() => { if (!cancelado) setCargandoTabla(false); });
    return () => { cancelado = true; };
  }, [paramsFiltro, paginationModel, sortModel, refreshTick]);

  function actualizarFiltro(campo, valor) {
    setFiltrosInput((prev) => ({ ...prev, [campo]: valor }));
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  function limpiarFiltros() {
    setFiltrosInput(FILTROS_INICIALES);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }

  function onClickTarjeta(def) {
    if (!def.estadoFiltro) return;
    actualizarFiltro('estado', filtrosInput.estado === def.estadoFiltro ? '' : def.estadoFiltro);
  }

  function abrirExpediente(row, tabInicial) {
    setExpediente({ row: { numeroControl: row.numeroControl }, tabInicial });
  }

  async function ejecutarDescarga(fn, nombreArchivo) {
    const blob = await fn();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function onAccionDirecta(accion, row) {
    setMensaje(null);
    try {
      if (accion === 'generarXML') {
        await generarXML(row._id);
        setMensaje({ severidad: 'success', texto: `XML generado para el aviso #${row.numeroControl}.` });
        recargar();
      } else if (accion === 'descargarXML') {
        await ejecutarDescarga(() => descargarXML(row._id), `${row.referenciaOperador || row._id}.xml`);
      } else if (accion === 'descargarAcuse') {
        await ejecutarDescarga(() => descargarAcuse(row._id), `acuse-${row.folioAvisoSAT || row._id}.pdf`);
      }
    } catch (err) {
      setMensaje({ severidad: 'error', texto: err?.response?.data?.mensaje || 'No se pudo completar la acción.' });
    }
  }

  const columns = [
    { field: 'numeroControl', headerName: 'Núm. control', width: 110 },
    {
      field: 'descripcionActividad', headerName: 'Tipo de acto', flex: 1, minWidth: 200,
      valueGetter: (value, row) => value || row.tipoFEP || '—',
    },
    {
      field: 'comparecientes', headerName: 'Compareciente(s)', flex: 1, minWidth: 200, sortable: false,
      valueGetter: (value) => resumenComparecientes(value),
    },
    { field: 'abogado', headerName: 'Responsable', width: 170, valueGetter: (value) => value || '—' },
    {
      field: 'estado', headerName: 'Estado', width: 160,
      renderCell: (params) => {
        const meta = estadoMeta(params.value);
        return <Chip size="small" label={meta.label} color={meta.color} />;
      },
    },
    {
      field: 'fechaOperacion', headerName: 'Fecha operación', width: 130,
      valueFormatter: (value) => (value ? new Date(value).toLocaleDateString('es-MX') : '—'),
    },
    {
      field: 'fechaVencimiento', headerName: 'Fecha límite', width: 160,
      renderCell: (params) => {
        const info = diasRestantesTexto(params.value);
        if (!info) return '—';
        return <span style={{ color: info.color, fontWeight: 500 }}>{info.texto}</span>;
      },
    },
    {
      field: 'acciones', headerName: 'Acciones', width: 110, sortable: false, filterable: false,
      renderCell: (params) => (
        <AccionesCell
          row={params.row}
          puedeGenerar={puedeGenerar}
          onAbrir={abrirExpediente}
          onAccionDirecta={onAccionDirecta}
        />
      ),
    },
  ];

  if (expediente) {
    return (
      <ThemeProvider theme={pldTheme}>
        <Dialog open fullWidth maxWidth="xl" onClose={() => { setExpediente(null); recargar(); }}>
          <DialogContent sx={{ bgcolor: '#f8fafc' }}>
            <ExpedientePLD
              row={expediente.row}
              tabInicial={expediente.tabInicial}
              onClose={() => { setExpediente(null); recargar(); }}
            />
          </DialogContent>
        </Dialog>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={pldTheme}>
      <Box>
        {/* Tarjetas de métricas */}
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2.5 }}>
          {CARD_DEFS.map((def) => (
            <MetricCard
              key={def.key}
              def={def}
              valor={metricas?.[def.key]}
              cargando={cargandoMetricas}
              activo={!!def.estadoFiltro && filtrosInput.estado === def.estadoFiltro}
              onClick={() => onClickTarjeta(def)}
            />
          ))}
        </Stack>

        {/* Filtros */}
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap alignItems="center">
            <TextField
              label="Búsqueda instantánea" size="small" value={filtrosInput.q}
              onChange={(e) => actualizarFiltro('q', e.target.value)}
              sx={{ minWidth: 220 }}
              placeholder="Núm. control, actividad, responsable, folio…"
            />
            <TextField
              select label="Estado" size="small" value={filtrosInput.estado}
              onChange={(e) => actualizarFiltro('estado', e.target.value)}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">Todos</MenuItem>
              {ESTADOS_AVISO.map((e) => (
                <MenuItem key={e} value={e}>{estadoMeta(e).label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Desde" type="date" size="small" InputLabelProps={{ shrink: true }}
              value={filtrosInput.desde} onChange={(e) => actualizarFiltro('desde', e.target.value)}
            />
            <TextField
              label="Hasta" type="date" size="small" InputLabelProps={{ shrink: true }}
              value={filtrosInput.hasta} onChange={(e) => actualizarFiltro('hasta', e.target.value)}
            />
            <TextField
              label="Tipo de acto" size="small" value={filtrosInput.tipoActo}
              onChange={(e) => actualizarFiltro('tipoActo', e.target.value)}
              sx={{ minWidth: 170 }}
            />
            <TextField
              label="Núm. de escritura" type="number" size="small" value={filtrosInput.numeroControl}
              onChange={(e) => actualizarFiltro('numeroControl', e.target.value)}
              sx={{ minWidth: 150 }}
            />
            <TextField
              label="Compareciente" size="small" value={filtrosInput.compareciente}
              onChange={(e) => actualizarFiltro('compareciente', e.target.value)}
              sx={{ minWidth: 170 }}
            />
            {puedeVerTodo && (
              <TextField
                label="Abogado responsable" size="small" value={filtrosInput.abogado}
                onChange={(e) => actualizarFiltro('abogado', e.target.value)}
                sx={{ minWidth: 170 }}
              />
            )}
            <Button size="small" startIcon={<ClearOutlinedIcon />} onClick={limpiarFiltros}>
              Limpiar
            </Button>
          </Stack>
        </Paper>

        {mensaje && (
          <Alert severity={mensaje.severidad} sx={{ mb: 2 }} onClose={() => setMensaje(null)}>
            {mensaje.texto}
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper variant="outlined">
          <div style={{ height: 600, width: '100%' }}>
            <DataGrid
              rows={filas}
              columns={columns}
              getRowId={(row) => row._id}
              loading={cargandoTabla}
              rowCount={rowCount}
              paginationMode="server"
              sortingMode="server"
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              pageSizeOptions={[10, 20, 50, 100]}
              sortModel={sortModel}
              onSortModelChange={setSortModel}
              disableRowSelectionOnClick
              density="comfortable"
            />
          </div>
        </Paper>
      </Box>
    </ThemeProvider>
  );
}
