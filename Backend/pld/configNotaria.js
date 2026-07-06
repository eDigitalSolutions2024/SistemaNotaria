'use strict';

/**
 * Datos del sujeto obligado (la notaría) requeridos por el encabezado del
 * XML fep.xsd. Se leen de variables de entorno para no quedar hardcodeados
 * en el repositorio ni exponerse en el control de versiones.
 *
 * Variables esperadas en Backend/.env.production (y .env.development para pruebas):
 *   PLD_CLAVE_SUJETO_OBLIGADO      — clave_so asignada por la UIF al registrarse en SPPLD
 *   PLD_CLAVE_ENTIDAD_COLEGIADA    — opcional, solo si la notaría reporta vía colegio/asociación
 *
 * Sin estos valores el generador de XML rechaza la operación: es preferible
 * fallar explícitamente a producir un aviso con datos de sujeto obligado inválidos.
 */

const CLAVE_SO_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const CLAVE_ENT_COLEGIADA_PATTERN = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;

function getSujetoObligadoConfig() {
  const claveSujetoObligado = (process.env.PLD_CLAVE_SUJETO_OBLIGADO || '').trim().toUpperCase();
  const claveEntidadColegiada = (process.env.PLD_CLAVE_ENTIDAD_COLEGIADA || '').trim().toUpperCase();

  const errores = [];
  if (!claveSujetoObligado) {
    errores.push('Falta configurar PLD_CLAVE_SUJETO_OBLIGADO (clave_so asignada por la UIF en SPPLD).');
  } else if (!CLAVE_SO_PATTERN.test(claveSujetoObligado)) {
    errores.push(`PLD_CLAVE_SUJETO_OBLIGADO="${claveSujetoObligado}" no cumple el formato esperado por fep.xsd.`);
  }
  if (claveEntidadColegiada && !CLAVE_ENT_COLEGIADA_PATTERN.test(claveEntidadColegiada)) {
    errores.push(`PLD_CLAVE_ENTIDAD_COLEGIADA="${claveEntidadColegiada}" no cumple el formato esperado por fep.xsd.`);
  }

  return {
    claveSujetoObligado,
    claveEntidadColegiada: claveEntidadColegiada || undefined,
    claveActividad: 'FEP',
    errores,
  };
}

module.exports = { getSujetoObligadoConfig };
