'use strict';

// Motor de Reglas PLD — puro. No importa mongoose, no importa express, no
// conoce rutas ni el modelo AvisoPLD. Recibe un objeto Escritura (plano,
// puede venir de Mongo con .lean() o ser un objeto de prueba hecho a mano) y
// regresa un veredicto. Reutilizable desde cualquier módulo: el endpoint de
// listado, el guardado/modificación de Escritura, procesos automáticos o
// scripts de revalidación — todos llaman exactamente a la misma función.
const { ACTIVAS, HISTORICO } = require('./reglas');
const { calcularNivelRiesgo } = require('./nivelRiesgo');

// Día 17 del mes siguiente a la operación (Art. 23 LFPIORPI). Es una regla
// transversal a TODAS las actividades, no específica de ninguna — por eso
// vive en el motor y no dentro de cada regla individual.
function calcularFechaVencimiento(fechaOperacion) {
  const d = new Date(fechaOperacion);
  let mes = d.getUTCMonth() + 2;
  let anio = d.getUTCFullYear();
  if (mes > 12) {
    mes = 1;
    anio += 1;
  }
  return new Date(Date.UTC(anio, mes - 1, 17, 23, 59, 59, 0));
}

// Contrato de salida — independiente del frontend, el mismo sin importar
// quién llame al motor (endpoint de listado, hook de guardado, auditoría,
// tarea automática). Un consumidor solo debe renderizar/persistir esto, no
// reinterpretar nada. Todas las reglas, sin importar el tipo de trámite,
// regresan exactamente esta forma.
//
// requiereExpediente/requiereAviso/documentosRequeridos/acciones/
// advertencias/fundamentoLegal/umbral/valorAnalizado los declara cada
// regla (ver _fabricaReglaSimple.js y _fabricaReglaNoAplica.js). Las
// reglas que todavía no fueron migradas al esquema completo del Rule
// Engine simplemente los dejan en su default (null/[]) — nunca se inventa
// un valor legal que la regla no haya declarado.
//
// reglaAplicada/actividadPLD/fechaVencimiento no están en la lista mínima
// pedida, pero son necesarios estructuralmente: reglaAplicada (junto con
// versionRegla) es indispensable para evaluarConVersion(); actividadPLD
// (tipoFEP/portal) lo necesita generadorXML.js; fechaVencimiento es el
// cálculo transversal del Art. 23.
function resultadoFinal(parcial, escritura) {
  return {
    aplicaPLD: parcial.aplicaPLD,
    requiereExpediente: parcial.requiereExpediente ?? (parcial.aplicaPLD !== false),
    requiereAviso: parcial.requiereAviso ?? (parcial.aplicaPLD === true),
    fundamentoLegal: parcial.fundamentoLegal ?? null,
    motivo: parcial.motivo,
    umbral: parcial.umbral ?? null,
    valorAnalizado: parcial.valorAnalizado ?? null,
    documentosRequeridos: parcial.documentosRequeridos || [],
    datosFaltantes: parcial.datosFaltantes || [],
    acciones: parcial.acciones || [],
    advertencias: parcial.advertencias || [],
    versionRegla: parcial.regla?.version ?? null,
    reglaAplicada: parcial.regla?.id ?? null,
    actividadPLD: parcial.actividadPLD || null,
    fechaVencimiento: escritura?.fecha ? calcularFechaVencimiento(escritura.fecha) : null,
  };
}

/**
 * Evalúa una Escritura contra el conjunto de reglas ACTIVAS. No escribe
 * nada, no lee nada de una base de datos: solo calcula.
 *
 * Resolución de candidatos:
 *   0 reglas responden  → indeterminado, "tipo de trámite no reconocido".
 *   1 regla responde    → se usa tal cual.
 *   N reglas responden con la misma prioridad máxima → conflicto real,
 *     indeterminado, se listan los incisos en pugna (requiere revisión
 *     manual — el motor nunca adivina).
 *   N reglas responden con prioridades distintas → gana la de mayor
 *     prioridad, sin ambigüedad.
 *
 * @param {object} escritura
 * @param {{ activas?: object[] }} [opciones] — permite inyectar un conjunto
 *   de reglas distinto a ACTIVAS (usado en tests para probar la resolución
 *   de conflictos sin depender de las reglas reales de negocio).
 */
function evaluarEscritura(escritura, { activas = ACTIVAS } = {}) {
  const candidatos = [];
  for (const regla of activas) {
    const resultado = regla.evaluar(escritura);
    if (resultado) candidatos.push({ regla, resultado });
  }

  if (candidatos.length === 0) {
    return resultadoFinal({
      aplicaPLD: null,
      motivo: 'Tipo de trámite no reconocido automáticamente; se requiere revisión manual.',
      datosFaltantes: [],
      actividadPLD: null,
      regla: null,
    }, escritura);
  }

  const prioridadMax = Math.max(...candidatos.map((c) => c.resultado.prioridad));
  const finalistas = candidatos.filter((c) => c.resultado.prioridad === prioridadMax);

  if (finalistas.length > 1) {
    const ids = finalistas.map((c) => c.regla.id).join(', ');
    return resultadoFinal({
      aplicaPLD: null,
      motivo: `Múltiples actividades detectadas (${ids}); se requiere selección manual.`,
      datosFaltantes: [],
      actividadPLD: null,
      regla: null,
    }, escritura);
  }

  const { regla, resultado } = finalistas[0];
  return resultadoFinal({ ...resultado, regla: { id: regla.id, version: regla.version } }, escritura);
}

/**
 * Reproduce el veredicto usando EXACTAMENTE la regla histórica id@version
 * indicada, ignorando cuál sea la versión vigente hoy. Para esto sirve la
 * trazabilidad: un AvisoPLD guarda { id, version } de la regla que lo
 * evaluó, y años después esto reconstruye el mismo resultado aunque la ley
 * — y por lo tanto la regla activa — ya haya cambiado.
 *
 * Regresa null si la Escritura ya no coincide con esa regla histórica (no
 * debería pasar en la práctica, pero es una garantía honesta en vez de
 * fabricar un resultado).
 */
function evaluarConVersion(escritura, reglaId, version) {
  const regla = HISTORICO[`${reglaId}@${version}`];
  if (!regla) {
    throw new Error(`No existe la regla "${reglaId}@${version}" en el histórico del motor.`);
  }
  const resultado = regla.evaluar(escritura);
  if (!resultado) return null;
  return resultadoFinal({ ...resultado, regla: { id: regla.id, version: regla.version } }, escritura);
}

module.exports = { evaluarEscritura, evaluarConVersion, calcularFechaVencimiento, calcularNivelRiesgo };
