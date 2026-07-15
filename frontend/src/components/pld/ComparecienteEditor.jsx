// src/components/pld/ComparecienteEditor.jsx
//
// Un compareciente editable. Indicadores de campo obligatorio y validación
// en tiempo real son heurísticas de UX (formato/requerido) — la validación
// autoritativa sigue siendo Backend/pld/generadorXML.js al momento real de
// generar el XML.
import React from 'react';
import { Paper, Grid, TextField, MenuItem, Button, Typography } from '@mui/material';

export const COMPARECIENTE_VACIO = {
  tipoPersona: 'FISICA',
  rol: '',
  nombre: '',
  apellidoPaterno: '',
  apellidoMaterno: '',
  denominacionRazon: '',
  nacionalidad: '',
  rfc: '',
  curp: '',
  fechaNacimiento: '',
  actividadEconomica: '',
  giroMercantil: '',
};

const RFC_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
const RFC_MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const CURP = /^[A-Z]{4}\d{6}[MH][A-Z]{5}[0-9]{2}$/;

function campoRequerido(valor) {
  return !valor || !String(valor).trim();
}

export default function ComparecienteEditor({ compareciente, index, rolesDisponibles, catalogoPais, disabled, onChange, onQuitar }) {
  const set = (campo) => (e) => onChange(index, { [campo]: e.target.value });
  const opcionesPais = catalogoPais?.valores || [];
  const esMoral = compareciente.tipoPersona === 'MORAL';
  const rolInfo = rolesDisponibles.find((r) => r.value === compareciente.rol);
  const esSimple = rolInfo?.simple ?? false;

  const rfcTocado = !!compareciente.rfc;
  const rfcValido = !rfcTocado || (esMoral ? RFC_MORAL : RFC_FISICA).test(String(compareciente.rfc).toUpperCase());
  const curpTocado = !!compareciente.curp;
  const curpValido = !curpTocado || CURP.test(String(compareciente.curp).toUpperCase());

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField select label="Tipo de persona" value={compareciente.tipoPersona} onChange={set('tipoPersona')}
            fullWidth size="small" disabled={disabled}>
            <MenuItem value="FISICA">Física</MenuItem>
            <MenuItem value="MORAL">Moral</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField select label="Rol *" value={compareciente.rol} onChange={set('rol')}
            fullWidth size="small" disabled={disabled}
            error={campoRequerido(compareciente.rol)}
            helperText={campoRequerido(compareciente.rol) ? 'Requerido' : ' '}>
            <MenuItem value="">— sin definir —</MenuItem>
            {rolesDisponibles.map((r) => (
              <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Nacionalidad *" value={compareciente.nacionalidad || ''} onChange={set('nacionalidad')}
            fullWidth size="small" disabled={disabled || opcionesPais.length === 0}
            error={campoRequerido(compareciente.nacionalidad)}
            helperText={
              opcionesPais.length === 0
                ? 'Catálogo pais_iso todavía no cargado.'
                : (campoRequerido(compareciente.nacionalidad) ? 'Requerido' : ' ')
            }>
            {opcionesPais.map((o) => (
              <MenuItem key={o.clave} value={o.clave}>{o.clave} — {o.descripcion}</MenuItem>
            ))}
          </TextField>
        </Grid>

        {esMoral ? (
          <>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Denominación o razón social *" value={compareciente.denominacionRazon || ''}
                onChange={set('denominacionRazon')} fullWidth size="small" disabled={disabled}
                error={campoRequerido(compareciente.denominacionRazon)}
                helperText={campoRequerido(compareciente.denominacionRazon) ? 'Requerido' : ' '} />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField label={`Giro mercantil (7 dígitos)${esSimple ? '' : ' *'}`} value={compareciente.giroMercantil || ''}
                onChange={set('giroMercantil')} fullWidth size="small" disabled={disabled}
                error={!esSimple && campoRequerido(compareciente.giroMercantil)}
                helperText={!esSimple && campoRequerido(compareciente.giroMercantil) ? 'Requerido para este rol' : ' '} />
            </Grid>
          </>
        ) : (
          <>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField label="Nombre *" value={compareciente.nombre || ''} onChange={set('nombre')}
                fullWidth size="small" disabled={disabled}
                error={campoRequerido(compareciente.nombre)}
                helperText={campoRequerido(compareciente.nombre) ? 'Requerido' : ' '} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField label="Apellido paterno *" value={compareciente.apellidoPaterno || ''} onChange={set('apellidoPaterno')}
                fullWidth size="small" disabled={disabled}
                error={campoRequerido(compareciente.apellidoPaterno)}
                helperText={campoRequerido(compareciente.apellidoPaterno) ? 'Requerido' : ' '} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField label="Apellido materno *" value={compareciente.apellidoMaterno || ''} onChange={set('apellidoMaterno')}
                fullWidth size="small" disabled={disabled}
                error={campoRequerido(compareciente.apellidoMaterno)}
                helperText={campoRequerido(compareciente.apellidoMaterno) ? 'Requerido' : ' '} />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField label={`Actividad económica (7 dígitos)${esSimple ? '' : ' *'}`} value={compareciente.actividadEconomica || ''}
                onChange={set('actividadEconomica')} fullWidth size="small" disabled={disabled}
                error={!esSimple && campoRequerido(compareciente.actividadEconomica)}
                helperText={!esSimple && campoRequerido(compareciente.actividadEconomica) ? 'Requerido para este rol' : ' '} />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField label="Fecha nacimiento (DD/MM/AAAA)" value={compareciente.fechaNacimiento || ''}
                onChange={set('fechaNacimiento')} fullWidth size="small" disabled={disabled} helperText=" " />
            </Grid>
          </>
        )}

        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField label="RFC" value={compareciente.rfc || ''} onChange={set('rfc')}
            fullWidth size="small" disabled={disabled}
            error={!rfcValido}
            helperText={!rfcValido ? `Formato no coincide con RFC ${esMoral ? 'moral' : 'físico'}` : ' '} />
        </Grid>
        {!esMoral && (
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField label="CURP" value={compareciente.curp || ''} onChange={set('curp')}
              fullWidth size="small" disabled={disabled}
              error={!curpValido}
              helperText={!curpValido ? 'Formato de CURP no válido' : ' '} />
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 3 }} sx={{ display: 'flex', alignItems: 'center' }}>
          <Button size="small" color="error" disabled={disabled} onClick={() => onQuitar(index)}>
            Quitar compareciente
          </Button>
        </Grid>
      </Grid>
      {!compareciente.rol && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Selecciona un rol para saber qué campos son obligatorios.
        </Typography>
      )}
    </Paper>
  );
}
