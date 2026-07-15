// src/components/pld/EditorActividadPLD.jsx
//
// Editor dinámico de `datosActividad`: solo renderiza los campos que
// corresponden al tipoFEP detectado (CAMPOS_POR_TIPO_FEP), nunca todos los
// campos posibles de todos los tipos. Los selects se pueblan con catálogos
// reales (GET /api/pld/catalogos/:catalogoId) — si un catálogo todavía no
// tiene valores oficiales cargados, el select queda deshabilitado con un
// mensaje explícito, nunca con opciones inventadas.
import React from 'react';
import { TextField, MenuItem, Alert, Paper, Grid, Typography } from '@mui/material';
import { CAMPOS_POR_TIPO_FEP, TIPOS_FEP_SOPORTADOS } from './pldHelpers';

function campoVacio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

export default function EditorActividadPLD({ tipoFEP, datosActividad, onChange, catalogos, disabled }) {
  if (!TIPOS_FEP_SOPORTADOS.includes(tipoFEP)) {
    return (
      <Alert severity="info">
        Este tipo de actividad (tipoFEP=&quot;{tipoFEP || 'desconocido'}&quot;) todavía no tiene generador XML
        implementado (pendiente de la Fase 3.1). No hay campos que capturar por ahora.
      </Alert>
    );
  }

  const handleChange = (key) => (e) => {
    onChange({ ...datosActividad, [key]: e.target.value });
  };

  const renderSelect = (key, label, catalogoId, requerido) => {
    const opciones = catalogos?.[catalogoId]?.valores || [];
    const vacio = campoVacio(datosActividad?.[key]);
    return (
      <Grid key={key} size={{ xs: 12, sm: 6 }}>
        <TextField
          select
          label={label}
          value={datosActividad?.[key] ?? ''}
          onChange={handleChange(key)}
          fullWidth
          size="small"
          required={requerido}
          disabled={disabled || opciones.length === 0}
          error={requerido && vacio && opciones.length > 0}
          helperText={
            opciones.length === 0
              ? `Catálogo oficial "${catalogoId}" pendiente de cargar — sin opciones disponibles todavía.`
              : (requerido && vacio ? 'Requerido' : ' ')
          }
        >
          {opciones.map((o) => (
            <MenuItem key={o.clave} value={o.clave}>
              {o.clave} — {o.descripcion}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
    );
  };

  const renderCampo = (campo) => {
    if (campo.tipo === 'select') {
      return renderSelect(campo.key, campo.label, campo.catalogoId, campo.requerido);
    }
    const vacio = campoVacio(datosActividad?.[campo.key]);
    return (
      <Grid key={campo.key} size={{ xs: 12, sm: 6 }}>
        <TextField
          label={campo.label}
          type={campo.tipo === 'number' ? 'number' : 'text'}
          value={datosActividad?.[campo.key] ?? ''}
          onChange={handleChange(campo.key)}
          fullWidth
          size="small"
          required={campo.requerido}
          disabled={disabled}
          error={campo.requerido && vacio}
          helperText={campo.requerido && vacio ? 'Requerido' : ' '}
        />
      </Grid>
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Datos específicos de la actividad
      </Typography>
      <Grid container spacing={1.5}>
        {(CAMPOS_POR_TIPO_FEP[tipoFEP] || []).map(renderCampo)}
        {renderSelect('tipoAlerta', 'Tipo de alerta (UIF)', 'tipo_alerta', true)}
      </Grid>
    </Paper>
  );
}
