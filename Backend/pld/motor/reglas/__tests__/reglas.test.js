'use strict';

// Prueba cada regla de forma aislada: cada caso importa SOLO el archivo de
// esa regla y le pasa una Escritura de prueba (objeto plano, sin Mongo) —
// exactamente la garantía que pidió el usuario: "posible crear una
// Escritura de prueba y validar únicamente esa regla".
const assert = require('node:assert/strict');

const poderIrrevocable = require('../poderIrrevocable.v1');
const constitucionPersonaMoral = require('../constitucionPersonaMoral.v1');
const modificacionPatrimonial = require('../modificacionPatrimonial.v1');
const fusion = require('../fusion.v1');
const escision = require('../escision.v1');
const compraventaAcciones = require('../compraventaAcciones.v1');
const fideicomisoTraslativo = require('../fideicomisoTraslativo.v1');
const cesionDerechosFideicomiso = require('../cesionDerechosFideicomiso.v1');
const mutuoCredito = require('../mutuoCredito.v1');
const transmisionInmuebles = require('../transmisionInmuebles.v1');
const testamento = require('../testamento.v1');
const donacion = require('../donacion.v1');
const adjudicacion = require('../adjudicacion.v1');

let pasadas = 0;
function caso(nombre, fn) {
  fn();
  pasadas++;
  console.log(`  ok - ${nombre}`);
}

console.log('reglas.test.js');

caso('poderIrrevocable: coincide y aplica sin umbral', () => {
  const r = poderIrrevocable.evaluar({ tipoTramite: 'PODER Irrevocable' });
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.datosFaltantes.length, 0);
  assert.equal(r.actividadPLD.tipoFEP, '1');
});

caso('poderIrrevocable: no coincide con un trámite distinto', () => {
  const r = poderIrrevocable.evaluar({ tipoTramite: 'COMPRAVENTA' });
  assert.equal(r, null);
});

caso('constitucionPersonaMoral: coincide por "acta constitutiva"', () => {
  const r = constitucionPersonaMoral.evaluar({ tipoTramite: 'Acta Constitutiva de S.A. de C.V.' });
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.actividadPLD.id, 'c_constitucion');
});

caso('modificacionPatrimonial: coincide por "aumento de capital"', () => {
  const r = modificacionPatrimonial.evaluar({ tipoTramite: 'Aumento de capital social' });
  assert.equal(r.aplicaPLD, true);
});

caso('fusion: coincide y no requiere monto', () => {
  const r = fusion.evaluar({ tipoTramite: 'Fusión de sociedades' });
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.datosFaltantes.length, 0);
});

caso('escision: no coincide con "fusión"', () => {
  const r = escision.evaluar({ tipoTramite: 'Fusión de sociedades' });
  assert.equal(r, null);
});

caso('compraventaAcciones: coincide con "compraventa de acciones"', () => {
  const r = compraventaAcciones.evaluar({ tipoTramite: 'Compraventa de acciones' });
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.actividadPLD.id, 'c_acciones');
});

caso('fideicomisoTraslativo: falta monto -> indeterminado con datosFaltantes', () => {
  const r = fideicomisoTraslativo.evaluar({ tipoTramite: 'Fideicomiso traslativo de dominio' });
  assert.equal(r.aplicaPLD, null);
  assert.deepEqual(r.datosFaltantes, ['monto']);
});

caso('fideicomisoTraslativo: monto por debajo del umbral -> aplica=false', () => {
  const r = fideicomisoTraslativo.evaluar({ tipoTramite: 'Fideicomiso traslativo de dominio', monto: 1000 });
  assert.equal(r.aplicaPLD, false);
});

caso('fideicomisoTraslativo: monto por encima del umbral -> aplica=true', () => {
  const r = fideicomisoTraslativo.evaluar({ tipoTramite: 'Fideicomiso traslativo de dominio', monto: 999999999 });
  assert.equal(r.aplicaPLD, true);
});

caso('cesionDerechosFideicomiso: coincide con "cesión de derechos...fideicomisario"', () => {
  const r = cesionDerechosFideicomiso.evaluar({ tipoTramite: 'Cesión de derechos de fideicomisario' });
  assert.equal(r.aplicaPLD, true);
});

caso('mutuoCredito: coincide con "contrato de mutuo"', () => {
  const r = mutuoCredito.evaluar({ tipoTramite: 'Contrato de mutuo con garantía hipotecaria' });
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.actividadPLD.portal, 'SPPLD');
});

caso('transmisionInmuebles: "compraventa" simple usa monto = valorAvaluo si no hay monto', () => {
  const r = transmisionInmuebles.evaluar({ tipoTramite: 'Compraventa de inmueble', valorAvaluo: 2000000 });
  assert.equal(r.aplicaPLD, true);
});

caso('transmisionInmuebles: NO coincide con "compraventa de acciones" (mutuamente excluyente)', () => {
  const r = transmisionInmuebles.evaluar({ tipoTramite: 'Compraventa de acciones', monto: 999999999 });
  assert.equal(r, null);
});

caso('compraventaAcciones: tampoco coincide con "compraventa de inmueble"', () => {
  const r = compraventaAcciones.evaluar({ tipoTramite: 'Compraventa de inmueble' });
  assert.equal(r, null);
});

caso('transmisionInmuebles: regla modelo trae fundamentoLegal, documentos y advertencias reales', () => {
  const r = transmisionInmuebles.evaluar({ tipoTramite: 'COMPRAVENTA', monto: 5000000 });
  assert.match(r.fundamentoLegal, /Art\. 17 Fracc\. XII inciso a/);
  assert.equal(r.documentosRequeridos.length, 4);
  assert.equal(r.advertencias.length, 1);
  assert.deepEqual(r.acciones, ['ABRIR_EXPEDIENTE', 'IDENTIFICAR_BENEFICIARIO_CONTROLADOR']);
  assert.equal(r.umbral, 938480); // 8000 UMA * 117.31 — calculado por parametrosEconomicos.js, no fijo en la regla
  assert.equal(r.valorAnalizado, 5000000);
});

caso('transmisionInmuebles: metadata inspeccionable sin ejecutar evaluar()', () => {
  assert.equal(transmisionInmuebles.activo, true);
  assert.deepEqual(transmisionInmuebles.datosObligatorios, ['comparecientes', 'monto', 'formaPago']);
  assert.equal(transmisionInmuebles.documentosObligatorios.length, 4);
});

caso('transmisionInmuebles: monto bajo el umbral -> no aplica, y documentos/advertencias se limpian', () => {
  const r = transmisionInmuebles.evaluar({ tipoTramite: 'COMPRAVENTA', monto: 1000 });
  assert.equal(r.aplicaPLD, false);
  assert.deepEqual(r.documentosRequeridos, []);
  assert.deepEqual(r.advertencias, []);
  assert.deepEqual(r.acciones, []);
});

// Los 4 escenarios obligatorios pedidos explícitamente para dar por
// aprobada la regla modelo — cada uno aislado, sin pasar por el motor.
caso('Escenario 1/4 — Compraventa que NO alcanza el umbral', () => {
  const r = transmisionInmuebles.evaluar({ tipoTramite: 'COMPRAVENTA', monto: 500000 });
  assert.equal(r.aplicaPLD, false);
  assert.equal(r.requiereExpediente, false);
  assert.equal(r.requiereAviso, false);
  assert.equal(r.valorAnalizado, 500000);
  assert.equal(r.umbral, 938480);
});

caso('Escenario 2/4 — Compraventa que SÍ supera el umbral', () => {
  const r = transmisionInmuebles.evaluar({ tipoTramite: 'COMPRAVENTA', monto: 2000000 });
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.requiereExpediente, true);
  assert.equal(r.requiereAviso, true);
  assert.ok(r.documentosRequeridos.length > 0);
  assert.ok(r.acciones.includes('ABRIR_EXPEDIENTE'));
});

caso('Escenario 3/4 — Compraventa con información insuficiente (sin monto ni valorAvaluo)', () => {
  const r = transmisionInmuebles.evaluar({ tipoTramite: 'COMPRAVENTA' });
  assert.equal(r.aplicaPLD, null);
  assert.deepEqual(r.datosFaltantes, ['monto']);
  assert.deepEqual(r.acciones, ['SOLICITAR_DATO_FALTANTE']);
  assert.equal(r.requiereExpediente, true); // se abre para dar seguimiento, aunque el veredicto esté pendiente
  assert.equal(r.requiereAviso, false);      // pero no se avisa hasta que se sepa si aplica
});

caso('Escenario 4/4 — Caso donde jurídicamente NO procede aplicar la regla (tipo de trámite ajeno)', () => {
  const r = transmisionInmuebles.evaluar({ tipoTramite: 'TESTAMENTO' });
  assert.equal(r, null); // la regla ni siquiera se considera candidata
});

// ── Donación ────────────────────────────────────────────────────────────

caso('Donación — coincide con "DONACION" real de producción (sin especificar objeto)', () => {
  const r = donacion.evaluar({ tipoTramite: 'DONACION' });
  assert.notEqual(r, null);
});

caso('Donación — REQUIERE_DATOS: sin tipoBien, no asume ninguna conclusión', () => {
  const r = donacion.evaluar({ tipoTramite: 'DONACION' });
  assert.equal(r.aplicaPLD, null);
  assert.deepEqual(r.datosFaltantes, ['tipoBien']);
  assert.deepEqual(r.acciones, ['SOLICITAR_DATO_FALTANTE']);
  assert.match(r.motivo, /no se puede determinar/i);
});

caso('Donación — tipoBien=INMUEBLE por debajo del umbral (valorAvaluo) -> no aplica', () => {
  const r = donacion.evaluar({ tipoTramite: 'DONACION', tipoBien: 'INMUEBLE', valorAvaluo: 1000 });
  assert.equal(r.aplicaPLD, false);
});

caso('Donación — tipoBien=INMUEBLE por encima del umbral (valorAvaluo) -> aplica, con documentos y advertencia de subvaluación', () => {
  const r = donacion.evaluar({ tipoTramite: 'DONACION', tipoBien: 'INMUEBLE', valorAvaluo: 5000000 });
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.requiereExpediente, true);
  assert.equal(r.requiereAviso, true);
  assert.ok(r.documentosRequeridos.length > 0);
  assert.ok(r.acciones.includes('IDENTIFICAR_BENEFICIARIO_CONTROLADOR'));
  assert.match(r.advertencias[0], /subvaluaci[oó]n/i);
});

caso('Donación — "monto" NUNCA es la base de cálculo (acto gratuito, no oneroso): un monto sin valorAvaluo sigue siendo REQUIERE_DATOS', () => {
  const r = donacion.evaluar({ tipoTramite: 'DONACION', tipoBien: 'INMUEBLE', monto: 5000000 });
  assert.equal(r.aplicaPLD, null);
  assert.deepEqual(r.datosFaltantes, ['valorAvaluo']); // pide valorAvaluo, no "monto" — la regla nunca lee el campo monto
  assert.match(r.motivo, /valor de avalúo/);
  assert.equal(r.valorAnalizado, null);
});

caso('Donación — datosObligatorios y documentosObligatorios NO incluyen formaPago (acto sin pago)', () => {
  assert.ok(!donacion.datosObligatorios.includes('formaPago'));
  assert.ok(!donacion.datosObligatorios.includes('monto'));
  assert.ok(donacion.datosObligatorios.includes('valorAvaluo'));
});

caso('Donación — tipoBien=MUEBLE -> no aplica con certeza (no es inmueble, no requiere más datos)', () => {
  const r = donacion.evaluar({ tipoTramite: 'DONACION', tipoBien: 'MUEBLE', monto: 5000000 });
  assert.equal(r.aplicaPLD, false);
  assert.match(r.motivo, /no es un inmueble/i);
});

caso('Donación — "DONACIÓN DE INMUEBLE" (texto ya explícito) se excluye para no chocar con transmisionInmuebles.v1', () => {
  assert.equal(donacion.evaluar({ tipoTramite: 'DONACIÓN DE INMUEBLE' }), null);
  assert.notEqual(transmisionInmuebles.evaluar({ tipoTramite: 'DONACIÓN DE INMUEBLE', monto: 5000000 }), null);
});

caso('Donación — no coincide con un trámite ajeno', () => {
  const r = donacion.evaluar({ tipoTramite: 'PODER Irrevocable' });
  assert.equal(r, null);
});

// ── Adjudicación ────────────────────────────────────────────────────────

caso('Adjudicación — coincide con las variantes reales de producción', () => {
  assert.notEqual(adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION' }), null);
  assert.notEqual(adjudicacion.evaluar({ tipoTramite: 'ADJ' }), null);
  assert.notEqual(adjudicacion.evaluar({ tipoTramite: 'ESCRITURA ADJ' }), null);
  assert.notEqual(adjudicacion.evaluar({ tipoTramite: 'adjudicacion judicial' }), null);
  assert.notEqual(adjudicacion.evaluar({ tipoTramite: 'ESCRITURA PROTOC ADJ' }), null);
  assert.notEqual(adjudicacion.evaluar({ tipoTramite: 'ADJ/CV' }), null);
});

caso('Adjudicación — se excluye si el texto ya dice "donación" o "compraventa" (las poseen otras reglas)', () => {
  assert.equal(adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION/DONACION' }), null);
  assert.equal(adjudicacion.evaluar({ tipoTramite: 'Adjudicación y Donación' }), null);
  assert.equal(adjudicacion.evaluar({ tipoTramite: 'COMPRAVENTA/ADJUDICACION' }), null);
  // pero SÍ debe coincidir cuando solo hay "DON" abreviado (no "donaci[oó]n" completo)
  assert.notEqual(adjudicacion.evaluar({ tipoTramite: 'ESCRITURA ADJ Y DON' }), null);
});

caso('Adjudicación — sin modalidadAdjudicacion -> REQUIERE_DATOS, nunca asume', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', tipoBien: 'INMUEBLE', valorAvaluo: 5000000 });
  assert.equal(r.aplicaPLD, null);
  assert.deepEqual(r.datosFaltantes, ['modalidadAdjudicacion']);
  assert.match(r.motivo, /modalidad/i);
});

caso('Adjudicación — modalidad inválida/desconocida -> REQUIERE_DATOS, no se ignora silenciosamente', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'ALGO_INVENTADO' });
  assert.equal(r.aplicaPLD, null);
  assert.deepEqual(r.datosFaltantes, ['modalidadAdjudicacion']);
});

caso('Modalidad HERENCIA — translativa: sin tipoBien -> REQUIERE_DATOS', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'HERENCIA' });
  assert.equal(r.aplicaPLD, null);
  assert.deepEqual(r.datosFaltantes, ['tipoBien']);
});

caso('Modalidad HERENCIA — tipoBien=INMUEBLE, supera umbral -> aplica, con documentos de herencia', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'HERENCIA', tipoBien: 'INMUEBLE', valorAvaluo: 2000000 });
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.requiereExpediente, true);
  assert.equal(r.requiereAviso, true);
  assert.ok(r.documentosRequeridos.some((d) => /declaraci[oó]n de herederos/i.test(d)));
});

caso('Modalidad HERENCIA — tipoBien=INMUEBLE, bajo el umbral -> no aplica', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'HERENCIA', tipoBien: 'INMUEBLE', valorAvaluo: 1000 });
  assert.equal(r.aplicaPLD, false);
});

caso('Modalidad REMATE_JUDICIAL — aplica igual que herencia, con documento judicial específico', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'adjudicacion judicial', modalidadAdjudicacion: 'REMATE_JUDICIAL', tipoBien: 'INMUEBLE', valorAvaluo: 3000000 });
  assert.equal(r.aplicaPLD, true);
  assert.ok(r.documentosRequeridos.some((d) => /sentencia judicial/i.test(d)));
});

caso('Modalidad OTRA — se trata como translativa por defecto (más seguro que asumir que no aplica)', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'OTRA', tipoBien: 'INMUEBLE', valorAvaluo: 2000000 });
  assert.equal(r.aplicaPLD, true);
});

caso('Modalidad LIQUIDACION_SOCIEDAD_CONYUGAL — sin huboCompensacionEconomica -> REQUIERE_DATOS, no asume', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'LIQUIDACION_SOCIEDAD_CONYUGAL', tipoBien: 'INMUEBLE', valorAvaluo: 2000000 });
  assert.equal(r.aplicaPLD, null);
  assert.deepEqual(r.datosFaltantes, ['huboCompensacionEconomica']);
});

caso('Modalidad LIQUIDACION_SOCIEDAD_CONYUGAL — sin compensación económica -> NO_APLICA (efecto declarativo, no traslativo)', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'LIQUIDACION_SOCIEDAD_CONYUGAL', huboCompensacionEconomica: false, tipoBien: 'INMUEBLE', valorAvaluo: 5000000 });
  assert.equal(r.aplicaPLD, false);
  assert.equal(r.requiereExpediente, false);
  assert.match(r.motivo, /declarativo/i);
});

caso('Modalidad LIQUIDACION_SOCIEDAD_CONYUGAL — con compensación económica -> se analiza como translativa', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'LIQUIDACION_SOCIEDAD_CONYUGAL', huboCompensacionEconomica: true, tipoBien: 'INMUEBLE', valorAvaluo: 5000000 });
  assert.equal(r.aplicaPLD, true);
});

caso('Modalidad DIVISION_COSA_COMUN — mismo tratamiento que sociedad conyugal (declarativa por defecto)', () => {
  const sinCompensar = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'DIVISION_COSA_COMUN', huboCompensacionEconomica: false, tipoBien: 'INMUEBLE', valorAvaluo: 5000000 });
  assert.equal(sinCompensar.aplicaPLD, false);
  const conCompensar = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'DIVISION_COSA_COMUN', huboCompensacionEconomica: true, tipoBien: 'INMUEBLE', valorAvaluo: 5000000 });
  assert.equal(conCompensar.aplicaPLD, true);
});

caso('Adjudicación — bien MUEBLE en modalidad translativa -> no aplica con certeza', () => {
  const r = adjudicacion.evaluar({ tipoTramite: 'ADJUDICACION', modalidadAdjudicacion: 'HERENCIA', tipoBien: 'MUEBLE', valorAvaluo: 5000000 });
  assert.equal(r.aplicaPLD, false);
});

caso('Adjudicación — metadata inspeccionable sin ejecutar evaluar()', () => {
  assert.equal(adjudicacion.activo, true);
  assert.equal(adjudicacion.tipoUmbral, 'MONTO_UMA');
  assert.deepEqual(adjudicacion.datosObligatorios, ['comparecientes', 'modalidadAdjudicacion', 'tipoBien', 'valorAvaluo']);
});

caso('Adjudicación — no coincide con un trámite ajeno', () => {
  assert.equal(adjudicacion.evaluar({ tipoTramite: 'TESTAMENTO' }), null);
});

caso('testamento: coincide y aplicaPLD=false con certeza (no indeterminado)', () => {
  const r = testamento.evaluar({ tipoTramite: 'TESTAMENTO' });
  assert.equal(r.aplicaPLD, false);
  assert.equal(r.actividadPLD, null);
  assert.match(r.motivo, /no genera obligación PLD/);
});

caso('testamento: coincide con variantes reales de producción', () => {
  assert.notEqual(testamento.evaluar({ tipoTramite: 'testamento' }), null);
  assert.notEqual(testamento.evaluar({ tipoTramite: 'FIRMA DE TESTAMENTO' }), null);
  assert.notEqual(testamento.evaluar({ tipoTramite: 'PROTOCOLIZACION DE UN JUICO TESTAMENTARIO' }), null);
});

caso('testamento: no coincide con un trámite distinto', () => {
  const r = testamento.evaluar({ tipoTramite: 'PODER Irrevocable' });
  assert.equal(r, null);
});

console.log(`reglas.test.js: ${pasadas} casos OK`);
