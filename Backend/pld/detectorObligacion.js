'use strict';

const { ACTIVIDADES_PLD, calcularUmbralPesos } = require('./umbrales');

// Día 17 del mes siguiente a la operación (Art. 23 LFPIORPI)
function calcularFechaVencimiento(fechaOperacion) {
  const d = new Date(fechaOperacion);
  let mes = d.getMonth() + 2; // getMonth() es 0-indexed, +1 para base-1, +1 para siguiente mes
  let anio = d.getFullYear();
  if (mes > 12) {
    mes = 1;
    anio += 1;
  }
  return new Date(anio, mes - 1, 17, 23, 59, 59, 0);
}

/**
 * Detecta si una escritura genera obligación de Aviso PLD.
 *
 * @param {{ tipoTramite: string, monto?: number, valorAvaluo?: number, fecha: Date }} escritura
 * @returns {{
 *   aplica: boolean,
 *   confianza: 'AUTOMATICA'|'REQUIERE_REVISION',
 *   actividad: object|null,
 *   portal: string|null,
 *   tipoFEP: string|null,
 *   incisoLegal: string|null,
 *   requiereMonto: boolean,
 *   monto: number|null,
 *   umbralPesos: number|null,
 *   fechaVencimiento: Date|null,
 *   razon: string
 * }}
 */
function detectarObligacion(escritura) {
  const tipoTramite = String(escritura.tipoTramite || '');
  const monto = escritura.monto ?? escritura.valorAvaluo ?? null;
  const fechaVencimiento = escritura.fecha
    ? calcularFechaVencimiento(escritura.fecha)
    : null;

  const coincidencias = ACTIVIDADES_PLD.filter(act =>
    act.detectar.some(regex => regex.test(tipoTramite))
  );

  if (coincidencias.length === 0) {
    return {
      aplica: true,
      confianza: 'REQUIERE_REVISION',
      actividad: null,
      portal: null,
      tipoFEP: null,
      incisoLegal: null,
      requiereMonto: false,
      monto: null,
      umbralPesos: null,
      fechaVencimiento,
      razon: 'Tipo de trámite no reconocido automáticamente; se requiere revisión manual.',
    };
  }

  if (coincidencias.length > 1) {
    const ids = coincidencias.map(a => a.id).join(', ');
    const primera = coincidencias[0];
    return {
      aplica: true,
      confianza: 'REQUIERE_REVISION',
      actividad: primera,
      portal: primera.portal,
      tipoFEP: primera.tipoFEP,
      incisoLegal: primera.id,
      requiereMonto: false,
      monto: null,
      umbralPesos: null,
      fechaVencimiento,
      razon: `Múltiples actividades detectadas (${ids}); se requiere selección manual.`,
    };
  }

  const actividad = coincidencias[0];
  const umbralPesos = calcularUmbralPesos(actividad.umbralUMAs);

  if (!actividad.requiereMonto) {
    return {
      aplica: true,
      confianza: 'AUTOMATICA',
      actividad,
      portal: actividad.portal,
      tipoFEP: actividad.tipoFEP,
      incisoLegal: actividad.id,
      requiereMonto: false,
      monto: null,
      umbralPesos: null,
      fechaVencimiento,
      razon: `Inciso ${actividad.id}: aplica sin umbral de monto.`,
    };
  }

  if (monto === null || monto === undefined) {
    return {
      aplica: true,
      confianza: 'REQUIERE_REVISION',
      actividad,
      portal: actividad.portal,
      tipoFEP: actividad.tipoFEP,
      incisoLegal: actividad.id,
      requiereMonto: true,
      monto: null,
      umbralPesos,
      fechaVencimiento,
      razon: `Inciso ${actividad.id}: umbral ${umbralPesos} MXN, falta monto de operación.`,
    };
  }

  const supera = monto >= umbralPesos;
  return {
    aplica: supera,
    confianza: 'AUTOMATICA',
    actividad,
    portal: actividad.portal,
    tipoFEP: actividad.tipoFEP,
    incisoLegal: actividad.id,
    requiereMonto: true,
    monto,
    umbralPesos,
    fechaVencimiento,
    razon: supera
      ? `Inciso ${actividad.id}: monto $${monto.toLocaleString('es-MX')} supera umbral $${umbralPesos.toLocaleString('es-MX')} MXN.`
      : `Inciso ${actividad.id}: monto $${monto.toLocaleString('es-MX')} no supera umbral $${umbralPesos.toLocaleString('es-MX')} MXN.`,
  };
}

module.exports = { detectarObligacion, calcularFechaVencimiento };
