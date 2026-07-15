// src/components/pld/ExpedientePLD.jsx
//
// Contenedor definitivo del Expediente PLD — layout de dos columnas que
// usan TODAS las pantallas. Se abre en un Dialog desde Escrituras.jsx,
// igual que EscrituraEstatus.
//
// Columna izquierda (ExpedientePLDSidebar): fija, persiste sin importar el
// tab activo — estado, progreso, checklist, acciones rápidas, alertas,
// responsable, última actualización.
//
// Columna derecha: Header + Stepper (indicador de avance, reemplaza la
// barra de Tabs plana) + contenido del paso activo. El flujo es
// Dashboard → Datos generales → Actividad → Validaciones → XML → Acuse →
// Historial. Dashboard es la vista ejecutiva (nunca editable). Datos
// generales y Actividad ya tienen guardado parcial real (PUT
// /avisos/:id/comparecientes y /avisos/:id/actividad). El resto sigue en
// placeholder, a construir pantalla por pantalla en iteraciones aprobadas.
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Alert, CircularProgress, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';

import { useAuth } from '../../auth/AuthContext';
import { detectarAviso, listarCatalogo } from './pldApi';
import { TIPOS_FEP_SOPORTADOS, catalogosNecesarios, ROLES_POR_TIPO_FEP, puedeEditarPLD, puedePresentarPLD, evaluarCompletitud } from './pldHelpers';
import pldTheme from './pldTheme';
import ExpedientePLDSidebar from './ExpedientePLDSidebar';
import ExpedientePLDHeader from './ExpedientePLDHeader';
import ExpedientePLDStepper from './ExpedientePLDStepper';
import DashboardTab from './tabs/DashboardTab';
import DatosGeneralesTab from './tabs/DatosGeneralesTab';
import ActividadTab from './tabs/ActividadTab';
import ValidacionesTab from './tabs/ValidacionesTab';
import GenerarXMLTab from './tabs/GenerarXMLTab';
import AcuseSATTab from './tabs/AcuseSATTab';

const PLACEHOLDERS = {
  historial: 'Aquí irá el historial de estados del aviso. El dato ya existe en el backend (aviso.historialEstados).',
};

function getUserRoles(u) {
  const roles = [];
  if (Array.isArray(u?.roles)) roles.push(...u.roles);
  if (u?.role) roles.push(u.role);
  if (u?.rol) roles.push(u.rol);
  return roles.map((r) => String(r).toLocaleUpperCase('es-MX'));
}

export default function ExpedientePLD({ escrituraId, row, onClose }) {
  const { user } = useAuth();
  const puedeEditar = puedeEditarPLD(getUserRoles(user));
  const puedeGenerar = puedePresentarPLD(getUserRoles(user));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [comparecientes, setComparecientes] = useState([]);
  const [datosActividad, setDatosActividad] = useState({});
  const [catalogos, setCatalogos] = useState({});
  const [tabActivo, setTabActivo] = useState('dashboard');

  useEffect(() => {
    let cancelado = false;
    if (!row?.numeroControl) {
      setError('Esta escritura no tiene número de control — no se puede evaluar PLD.');
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { aviso: avisoObtenido } = await detectarAviso(row.numeroControl);
        if (cancelado) return;
        setAviso(avisoObtenido);
        setComparecientes(avisoObtenido.comparecientes || []);
        setDatosActividad(avisoObtenido.datosActividad || {});

        const idsCatalogo = TIPOS_FEP_SOPORTADOS.includes(avisoObtenido.tipoFEP)
          ? catalogosNecesarios(avisoObtenido.tipoFEP)
          : ['pais_iso'];
        const resultados = await Promise.all(
          idsCatalogo.map((id) => listarCatalogo(id).catch(() => ({ catalogoId: id, version: null, valores: [] })))
        );
        if (cancelado) return;
        const mapa = {};
        idsCatalogo.forEach((id, i) => { mapa[id] = resultados[i]; });
        setCatalogos(mapa);
      } catch (err) {
        if (!cancelado) setError(err?.response?.data?.mensaje || err.message);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => { cancelado = true; };
  }, [row?.numeroControl]);

  // Única fuente de verdad de completitud — Sidebar, Dashboard y
  // Validaciones la reciben por prop en vez de recalcularla cada uno.
  // Refleja el último guardado (aviso.*), no el borrador sin guardar de
  // Datos generales/Actividad — mismo comportamiento ya aprobado.
  // Antes de los early return: los Hooks deben llamarse siempre en el
  // mismo orden, sin importar el estado de carga.
  const completitud = useMemo(() => {
    if (!aviso) return { completo: false, faltantes: [], items: [], avance: 0 };
    return evaluarCompletitud({
      tipoFEP: aviso.tipoFEP,
      comparecientes: aviso.comparecientes || [],
      datosActividad: aviso.datosActividad || {},
      catalogos,
    });
  }, [aviso, catalogos]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
        <CircularProgress size={22} />
        <Typography>Cargando expediente PLD…</Typography>
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }
  if (!aviso) {
    return <Alert severity="warning">No se pudo obtener el aviso PLD de esta escritura.</Alert>;
  }

  function handleGuardadoComparecientes(avisoActualizado) {
    setAviso(avisoActualizado);
    setComparecientes(avisoActualizado.comparecientes || []);
  }

  function handleGuardadoActividad(avisoActualizado) {
    setAviso(avisoActualizado);
    setDatosActividad(avisoActualizado.datosActividad || {});
  }

  const rolesDisponibles = ROLES_POR_TIPO_FEP[aviso.tipoFEP] || [];

  return (
    <ThemeProvider theme={pldTheme}>
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        <ExpedientePLDSidebar aviso={aviso} completitud={completitud} onIrA={setTabActivo} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ExpedientePLDHeader row={row} aviso={aviso} onVolver={onClose} />
          <ExpedientePLDStepper tabActivo={tabActivo} onChange={setTabActivo} completitud={completitud} aviso={aviso} />

          {tabActivo === 'dashboard' && (
            <DashboardTab aviso={aviso} row={row} completitud={completitud} onIrA={setTabActivo} />
          )}

          {tabActivo === 'datosGenerales' && (
            <DatosGeneralesTab
              aviso={aviso}
              comparecientes={comparecientes}
              setComparecientes={setComparecientes}
              rolesDisponibles={rolesDisponibles}
              catalogoPais={catalogos.pais_iso}
              disabled={!puedeEditar}
              onGuardado={handleGuardadoComparecientes}
            />
          )}

          {tabActivo === 'actividad' && (
            <ActividadTab
              aviso={aviso}
              datosActividad={datosActividad}
              setDatosActividad={setDatosActividad}
              catalogos={catalogos}
              disabled={!puedeEditar}
              onGuardado={handleGuardadoActividad}
            />
          )}

          {tabActivo === 'validaciones' && (
            <ValidacionesTab aviso={aviso} completitud={completitud} onIrA={setTabActivo} />
          )}

          {tabActivo === 'xml' && (
            <GenerarXMLTab
              aviso={aviso}
              completitud={completitud}
              puedeGenerar={puedeGenerar}
              onIrA={setTabActivo}
              onGuardado={setAviso}
            />
          )}

          {tabActivo === 'acuse' && (
            <AcuseSATTab aviso={aviso} />
          )}

          {!['dashboard', 'datosGenerales', 'actividad', 'validaciones', 'xml', 'acuse'].includes(tabActivo) && (
            <Box sx={{ minHeight: 400, bgcolor: '#f8fafc', borderRadius: 1, p: 3 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {PLACEHOLDERS[tabActivo]}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
