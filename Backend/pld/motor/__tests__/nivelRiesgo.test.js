'use strict';

const assert = require('node:assert/strict');
const { calcularNivelRiesgo } = require('../nivelRiesgo');

let pasadas = 0;
function caso(nombre, fn) {
  fn();
  pasadas++;
  console.log(`  ok - ${nombre}`);
}

console.log('nivelRiesgo.test.js');

const MANANA = new Date(Date.now() + 86400000);
const AYER = new Date(Date.now() - 86400000);

caso('aplicaPLD:null (indeterminado) -> ALTO', () => {
  const r = calcularNivelRiesgo({
    diagnostico: { aplicaPLD: null, datosFaltantes: [], advertencias: [] },
    aviso: { estado: 'PENDIENTE', fechaVencimiento: MANANA },
  });
  assert.equal(r, 'ALTO');
});

caso('aplicaPLD:false (no genera obligación) -> BAJO, sin importar lo demás', () => {
  const r = calcularNivelRiesgo({
    diagnostico: { aplicaPLD: false, datosFaltantes: ['x'], advertencias: ['y'] },
    aviso: { estado: 'NO_APLICA', fechaVencimiento: AYER, confianzaDeteccion: 'REQUIERE_REVISION' },
  });
  assert.equal(r, 'BAJO');
});

caso('aplicaPLD:true, sin pendientes, sin vencer -> BAJO', () => {
  const r = calcularNivelRiesgo({
    diagnostico: { aplicaPLD: true, datosFaltantes: [], advertencias: [] },
    aviso: { estado: 'LISTO', fechaVencimiento: MANANA },
  });
  assert.equal(r, 'BAJO');
});

caso('aplicaPLD:true con datosFaltantes pendientes -> MEDIO', () => {
  const r = calcularNivelRiesgo({
    diagnostico: { aplicaPLD: true, datosFaltantes: ['tipoBien'], advertencias: [] },
    aviso: { estado: 'PENDIENTE', fechaVencimiento: MANANA },
  });
  assert.equal(r, 'MEDIO');
});

caso('aplicaPLD:true con advertencias pendientes -> MEDIO', () => {
  const r = calcularNivelRiesgo({
    diagnostico: { aplicaPLD: true, datosFaltantes: [], advertencias: ['posible subvaluación'] },
    aviso: { estado: 'XML_GENERADO', fechaVencimiento: MANANA },
  });
  assert.equal(r, 'MEDIO');
});

caso('fechaVencimiento ya pasada y estado no terminal -> ALTO', () => {
  const r = calcularNivelRiesgo({
    diagnostico: { aplicaPLD: true, datosFaltantes: [], advertencias: [] },
    aviso: { estado: 'PENDIENTE', fechaVencimiento: AYER },
  });
  assert.equal(r, 'ALTO');
});

caso('vencido pero ya PRESENTADO -> BAJO (estado terminal manda sobre la fecha)', () => {
  const r = calcularNivelRiesgo({
    diagnostico: { aplicaPLD: true, datosFaltantes: [], advertencias: [] },
    aviso: { estado: 'PRESENTADO', fechaVencimiento: AYER },
  });
  assert.equal(r, 'BAJO');
});

caso('estado RECHAZADO_SPPLD -> ALTO', () => {
  const r = calcularNivelRiesgo({
    diagnostico: { aplicaPLD: true, datosFaltantes: [], advertencias: [] },
    aviso: { estado: 'RECHAZADO_SPPLD', fechaVencimiento: MANANA },
  });
  assert.equal(r, 'ALTO');
});

caso('confianzaDeteccion REQUIERE_REVISION -> ALTO aunque aplicaPLD sea true', () => {
  const r = calcularNivelRiesgo({
    diagnostico: { aplicaPLD: true, datosFaltantes: [], advertencias: [] },
    aviso: { estado: 'PENDIENTE', fechaVencimiento: MANANA, confianzaDeteccion: 'REQUIERE_REVISION' },
  });
  assert.equal(r, 'ALTO');
});

caso('estado CANCELADO sin condiciones de riesgo -> BAJO', () => {
  const r = calcularNivelRiesgo({
    diagnostico: { aplicaPLD: true, datosFaltantes: ['x'], advertencias: [] },
    aviso: { estado: 'CANCELADO', fechaVencimiento: AYER },
  });
  assert.equal(r, 'BAJO');
});

console.log(`nivelRiesgo.test.js: ${pasadas} casos OK`);
