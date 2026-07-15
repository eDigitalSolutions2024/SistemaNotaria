// src/components/pld/tabs/DatosGeneralesTab.jsx
//
// Edición de comparecientes con guardado parcial real (PUT
// /avisos/:id/comparecientes, único endpoint de escritura además de
// generar-xml). Layout responsive, grupos visuales claros (un Paper por
// compareciente), indicadores de campo obligatorio y validación en tiempo
// real ya viven en ComparecienteEditor.
import React, { useState } from 'react';
import { Box, Typography, Button, Stack, Alert, Chip } from '@mui/material';
import ComparecienteEditor, { COMPARECIENTE_VACIO } from '../ComparecienteEditor';
import { guardarComparecientes } from '../pldApi';

export default function DatosGeneralesTab({ aviso, comparecientes, setComparecientes, rolesDisponibles, catalogoPais, disabled, onGuardado }) {
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { severidad, texto }

  function actualizarCompareciente(idx, cambios) {
    setComparecientes((prev) => prev.map((c, i) => (i === idx ? { ...c, ...cambios } : c)));
    setMensaje(null);
  }
  function quitarCompareciente(idx) {
    setComparecientes((prev) => prev.filter((_, i) => i !== idx));
    setMensaje(null);
  }
  function agregarCompareciente() {
    setComparecientes((prev) => [...prev, { ...COMPARECIENTE_VACIO }]);
    setMensaje(null);
  }

  async function handleGuardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const { aviso: avisoActualizado } = await guardarComparecientes(aviso._id, comparecientes);
      onGuardado(avisoActualizado);
      setMensaje({ severidad: 'success', texto: 'Comparecientes guardados.' });
    } catch (err) {
      setMensaje({ severidad: 'error', texto: err?.response?.data?.mensaje || err.message });
    } finally {
      setGuardando(false);
    }
  }

  const rolesFaltantes = rolesDisponibles.filter(
    (r) => !comparecientes.some((c) => c.rol === r.value)
  );

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" spacing={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="subtitle1">Comparecientes ({comparecientes.length})</Typography>
          {rolesDisponibles.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              {rolesDisponibles.map((r) => (
                <Chip
                  key={r.value}
                  size="small"
                  label={r.label}
                  color={rolesFaltantes.includes(r) ? 'warning' : 'success'}
                  variant={rolesFaltantes.includes(r) ? 'outlined' : 'filled'}
                />
              ))}
            </Stack>
          )}
        </Box>
        <Button variant="contained" onClick={handleGuardar} disabled={disabled || guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </Stack>

      {mensaje && (
        <Alert severity={mensaje.severidad} sx={{ mb: 2 }} onClose={() => setMensaje(null)}>
          {mensaje.texto}
        </Alert>
      )}

      {comparecientes.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sin comparecientes registrados. Agrega al menos uno para cada rol requerido por esta actividad.
        </Typography>
      )}

      {comparecientes.map((c, idx) => (
        <ComparecienteEditor
          key={idx}
          index={idx}
          compareciente={c}
          rolesDisponibles={rolesDisponibles}
          catalogoPais={catalogoPais}
          disabled={disabled}
          onChange={actualizarCompareciente}
          onQuitar={quitarCompareciente}
        />
      ))}

      <Button variant="outlined" disabled={disabled} onClick={agregarCompareciente}>
        + Agregar compareciente
      </Button>
    </Box>
  );
}
