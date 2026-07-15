// src/components/pld/ExpedientePLDStepper.jsx
//
// Indicador visual del avance del expediente — reemplaza la barra de Tabs
// plana. Puramente presentacional: no recalcula nada, solo LEE
// `completitud` (ya calculado una vez en ExpedientePLD.jsx, el mismo
// estado que usa el Dashboard) y campos que ya existen en `aviso`
// (xmlContenido, folioAvisoSAT) para decidir qué círculo marcar como
// completo. Cero lógica de negocio nueva, cero modelo de datos nuevo.
//
// nonLinear: la navegación libre entre pasos ya es un principio aceptado
// del módulo (no es un wizard que obligue a avanzar en orden).
import React from 'react';
import { Stepper, Step, StepButton } from '@mui/material';

const PASOS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'datosGenerales', label: 'Datos generales' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'validaciones', label: 'Validaciones' },
  { key: 'xml', label: 'XML' },
  { key: 'acuse', label: 'Acuse' },
  { key: 'historial', label: 'Historial' },
];

function pasoCompleto(key, completitud, aviso) {
  switch (key) {
    case 'datosGenerales':
      return !completitud.items.some((i) => i.seccion === 'datosGenerales');
    case 'actividad':
      return !completitud.items.some((i) => i.seccion === 'actividad');
    case 'validaciones':
      return completitud.completo;
    case 'xml':
      return !!aviso.xmlContenido;
    case 'acuse':
      return !!aviso.folioAvisoSAT;
    default:
      return false; // dashboard, historial — no aplica "completo"
  }
}

export default function ExpedientePLDStepper({ tabActivo, onChange, completitud, aviso }) {
  const activeIndex = Math.max(0, PASOS.findIndex((p) => p.key === tabActivo));

  return (
    <Stepper nonLinear activeStep={activeIndex} alternativeLabel sx={{ mb: 2 }}>
      {PASOS.map((p) => (
        <Step key={p.key} completed={pasoCompleto(p.key, completitud, aviso)}>
          <StepButton onClick={() => onChange(p.key)}>{p.label}</StepButton>
        </Step>
      ))}
    </Stepper>
  );
}
