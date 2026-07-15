'use strict';

// Registro explícito de reglas — a propósito, no hay auto-descubrimiento de
// archivos. En un proyecto sujeto a regulación siempre debe poder
// responderse "¿qué reglas están activas hoy?" leyendo un único arreglo,
// sin adivinar qué archivos del disco cuentan.

const poderIrrevocable_v1          = require('./poderIrrevocable.v1');
const constitucionPersonaMoral_v1  = require('./constitucionPersonaMoral.v1');
const modificacionPatrimonial_v1   = require('./modificacionPatrimonial.v1');
const fusion_v1                    = require('./fusion.v1');
const escision_v1                  = require('./escision.v1');
const compraventaAcciones_v1       = require('./compraventaAcciones.v1');
const fideicomisoTraslativo_v1     = require('./fideicomisoTraslativo.v1');
const cesionDerechosFideicomiso_v1 = require('./cesionDerechosFideicomiso.v1');
const mutuoCredito_v1              = require('./mutuoCredito.v1');
const transmisionInmuebles_v1      = require('./transmisionInmuebles.v1');
const testamento_v1                = require('./testamento.v1');
const donacion_v1                  = require('./donacion.v1');
const adjudicacion_v1              = require('./adjudicacion.v1');

// TODAS_LAS_VERSIONES es append-only: cuando una regla suba de versión (p.ej.
// cambia la ley y nace poderIrrevocable.v2.js), la v1 se queda aquí para
// siempre — es lo que permite reproducir exactamente el resultado de un
// AvisoPLD evaluado hace años, aunque la regla vigente ya sea otra.
const TODAS_LAS_VERSIONES = [
  poderIrrevocable_v1,
  constitucionPersonaMoral_v1,
  modificacionPatrimonial_v1,
  fusion_v1,
  escision_v1,
  compraventaAcciones_v1,
  fideicomisoTraslativo_v1,
  cesionDerechosFideicomiso_v1,
  mutuoCredito_v1,
  transmisionInmuebles_v1,
  testamento_v1,
  donacion_v1,
  adjudicacion_v1,
];

// ACTIVAS es la única lista que el motor usa para evaluar Escrituras nuevas.
// Para "subir de versión" una regla: crear el archivo vN nuevo, agregarlo a
// TODAS_LAS_VERSIONES arriba, y reemplazar la referencia aquí abajo — nunca
// se edita ni se borra el archivo de la versión anterior.
const ACTIVAS = [
  poderIrrevocable_v1,
  constitucionPersonaMoral_v1,
  modificacionPatrimonial_v1,
  fusion_v1,
  escision_v1,
  compraventaAcciones_v1,
  fideicomisoTraslativo_v1,
  cesionDerechosFideicomiso_v1,
  mutuoCredito_v1,
  transmisionInmuebles_v1,
  testamento_v1,
  donacion_v1,
  adjudicacion_v1,
];

// Mapa id@version -> regla, construido a partir del histórico completo.
// Es lo que usa evaluarConVersion() para reproducir un veredicto pasado.
const HISTORICO = {};
for (const regla of TODAS_LAS_VERSIONES) {
  HISTORICO[`${regla.id}@${regla.version}`] = regla;
}

module.exports = { ACTIVAS, HISTORICO, TODAS_LAS_VERSIONES };
