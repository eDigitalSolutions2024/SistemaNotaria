// src/components/pld/tabs/ActividadTab.jsx
//
// Envuelve EditorActividadPLD con guardado parcial real (PUT
// /avisos/:id/actividad), mismo patrón que DatosGeneralesTab.
import React, { useState } from 'react';
import { Box, Typography, Button, Stack, Alert, Chip } from '@mui/material';
import EditorActividadPLD from '../EditorActividadPLD';
import { guardarActividad } from '../pldApi';
import { CAMPOS_POR_TIPO_FEP } from '../pldHelpers';

export default function ActividadTab({ aviso, datosActividad, setDatosActividad, catalogos, disabled, onGuardado }) {
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  // Mismos campos que renderiza EditorActividadPLD para este tipoFEP, +
  // tipoAlerta (común a todos) — se recalcula en cada tecleo, sin backend.
  const camposRequeridos = [
    ...(CAMPOS_POR_TIPO_FEP[aviso.tipoFEP] || []).filter((c) => c.requerido).map((c) => c.key),
    'tipoAlerta',
  ];
  const completos = camposRequeridos.filter((k) => String(datosActividad?.[k] ?? '').trim() !== '').length;
  const todoCompleto = completos === camposRequeridos.length;

  async function handleGuardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const { aviso: avisoActualizado } = await guardarActividad(aviso._id, datosActividad);
      onGuardado(avisoActualizado);
      setMensaje({ severidad: 'success', texto: 'Datos de la actividad guardados.' });
    } catch (err) {
      setMensaje({ severidad: 'error', texto: err?.response?.data?.mensaje || err.message });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" spacing={1} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle1">Actividad</Typography>
          <Chip
            size="small"
            label={`${completos}/${camposRequeridos.length} campos completos`}
            color={todoCompleto ? 'success' : 'warning'}
            variant={todoCompleto ? 'filled' : 'outlined'}
          />
        </Stack>
        <Button variant="contained" onClick={handleGuardar} disabled={disabled || guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </Stack>

      {mensaje && (
        <Alert severity={mensaje.severidad} sx={{ mb: 2 }} onClose={() => setMensaje(null)}>
          {mensaje.texto}
        </Alert>
      )}

      <EditorActividadPLD
        tipoFEP={aviso.tipoFEP}
        datosActividad={datosActividad}
        onChange={(cambios) => { setDatosActividad(cambios); setMensaje(null); }}
        catalogos={catalogos}
        disabled={disabled}
      />
    </Box>
  );
}
