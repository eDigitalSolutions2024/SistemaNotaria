'use strict';

const assert = require('node:assert/strict');
const { evaluarEscritura, evaluarConVersion } = require('../index');

let pasadas = 0;
function caso(nombre, fn) {
  fn();
  pasadas++;
  console.log(`  ok - ${nombre}`);
}

console.log('motor.test.js');

caso('Pureza — misma Escritura, misma respuesta, 50 corridas seguidas (sin estado, sin I/O)', () => {
  const escritura = { tipoTramite: 'COMPRAVENTA', monto: 2000000, fecha: '2026-03-05' };
  const primera = JSON.stringify(evaluarEscritura(escritura));
  for (let i = 0; i < 50; i++) {
    assert.equal(JSON.stringify(evaluarEscritura(escritura)), primera);
  }
});

caso('Pureza — evaluar una Escritura no muta el objeto de entrada', () => {
  const escritura = { tipoTramite: 'COMPRAVENTA', monto: 2000000 };
  const copia = JSON.stringify(escritura);
  evaluarEscritura(escritura);
  assert.equal(JSON.stringify(escritura), copia);
});

caso('0 candidatos -> indeterminado, "no reconocido"', () => {
  const r = evaluarEscritura({ tipoTramite: 'ALGO QUE NO EXISTE EN NINGUNA REGLA' });
  assert.equal(r.aplicaPLD, null);
  assert.match(r.motivo, /no reconocido/);
  assert.equal(r.reglaAplicada, null);
  assert.equal(r.versionRegla, null);
});

caso('1 candidato -> se usa tal cual y trae trazabilidad {reglaAplicada, versionRegla}', () => {
  const r = evaluarEscritura({ tipoTramite: 'PODER Irrevocable' });
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.reglaAplicada, 'b');
  assert.equal(r.versionRegla, 'v1');
});

caso('1 candidato que resuelve "no aplica" con certeza -> aplicaPLD=false, no null', () => {
  const r = evaluarEscritura({ tipoTramite: 'TESTAMENTO' });
  assert.equal(r.aplicaPLD, false);
  assert.equal(r.reglaAplicada, 'testamento');
  assert.equal(r.versionRegla, 'v1');
});

caso('Contrato estandarizado — caso "aplica sin umbral" (poder irrevocable)', () => {
  const r = evaluarEscritura({ tipoTramite: 'PODER Irrevocable' });
  assert.equal(r.requiereExpediente, true);
  assert.equal(r.requiereAviso, true);
  assert.equal(r.umbral, null);
  assert.equal(r.valorAnalizado, null);
  assert.deepEqual(r.documentosRequeridos, []);
  assert.deepEqual(r.acciones, ['ABRIR_EXPEDIENTE']);
  assert.deepEqual(r.advertencias, []);
});

caso('Contrato estandarizado — caso "aplica con umbral superado" (fideicomiso) trae umbral y valorAnalizado', () => {
  const r = evaluarEscritura({ tipoTramite: 'Fideicomiso traslativo de dominio', monto: 999999999 });
  assert.equal(r.aplicaPLD, true);
  assert.equal(typeof r.umbral, 'number');
  assert.equal(r.valorAnalizado, 999999999);
  assert.deepEqual(r.acciones, ['ABRIR_EXPEDIENTE']);
});

caso('Contrato estandarizado — caso "falta dato" (fideicomiso sin monto) sugiere SOLICITAR_DATO_FALTANTE', () => {
  const r = evaluarEscritura({ tipoTramite: 'Fideicomiso traslativo de dominio' });
  assert.equal(r.aplicaPLD, null);
  assert.deepEqual(r.acciones, ['SOLICITAR_DATO_FALTANTE']);
  assert.deepEqual(r.datosFaltantes, ['monto']);
});

caso('Contrato estandarizado — caso "no aplica" (testamento): sin expediente, sin aviso, sin documentos', () => {
  const r = evaluarEscritura({ tipoTramite: 'TESTAMENTO' });
  assert.equal(r.requiereExpediente, false);
  assert.equal(r.requiereAviso, false);
  assert.deepEqual(r.documentosRequeridos, []);
  assert.deepEqual(r.acciones, []);
});

caso('Donación y transmisionInmuebles nunca compiten a la vez sobre la misma Escritura (sin conflicto 0/1/N)', () => {
  const r1 = evaluarEscritura({ tipoTramite: 'DONACION', tipoBien: 'INMUEBLE', monto: 5000000 });
  assert.equal(r1.reglaAplicada, 'a_donacion');
  const r2 = evaluarEscritura({ tipoTramite: 'DONACIÓN DE INMUEBLE', monto: 5000000 });
  assert.equal(r2.reglaAplicada, 'a');
});

caso('fechaVencimiento se calcula centralizado (Art. 23: día 17 del mes siguiente)', () => {
  const r = evaluarEscritura({ tipoTramite: 'PODER Irrevocable', fecha: '2026-03-05' });
  assert.equal(r.fechaVencimiento.toISOString().slice(0, 10), '2026-04-17');
});

caso('sin fecha en la Escritura -> fechaVencimiento null, no revienta', () => {
  const r = evaluarEscritura({ tipoTramite: 'PODER Irrevocable' });
  assert.equal(r.fechaVencimiento, null);
});

// --- Resolución de conflictos con reglas inyectadas (mock), sin tocar reglas reales de negocio ---

const reglaMockA = {
  id: 'mockA',
  version: 'v1',
  evaluar: (e) => (e.tipoTramite === 'AMBIGUO'
    ? { aplicaPLD: true, motivo: 'mockA aplica', prioridad: 100, datosFaltantes: [], actividadPLD: { id: 'mockA' } }
    : null),
};
const reglaMockB = {
  id: 'mockB',
  version: 'v1',
  evaluar: (e) => (e.tipoTramite === 'AMBIGUO'
    ? { aplicaPLD: true, motivo: 'mockB aplica', prioridad: 100, datosFaltantes: [], actividadPLD: { id: 'mockB' } }
    : null),
};
const reglaMockPrioritaria = {
  id: 'mockC',
  version: 'v1',
  evaluar: (e) => (e.tipoTramite === 'CON_PRIORIDAD'
    ? { aplicaPLD: true, motivo: 'mockC gana', prioridad: 200, datosFaltantes: [], actividadPLD: { id: 'mockC' } }
    : null),
};
const reglaMockBaja = {
  id: 'mockD',
  version: 'v1',
  evaluar: (e) => (e.tipoTramite === 'CON_PRIORIDAD'
    ? { aplicaPLD: true, motivo: 'mockD pierde', prioridad: 50, datosFaltantes: [], actividadPLD: { id: 'mockD' } }
    : null),
};

caso('N candidatos con misma prioridad -> conflicto real, indeterminado', () => {
  const r = evaluarEscritura({ tipoTramite: 'AMBIGUO' }, { activas: [reglaMockA, reglaMockB] });
  assert.equal(r.aplicaPLD, null);
  assert.match(r.motivo, /mockA, mockB/);
});

caso('N candidatos con prioridad distinta -> gana la de mayor prioridad, sin ambigüedad', () => {
  const r = evaluarEscritura({ tipoTramite: 'CON_PRIORIDAD' }, { activas: [reglaMockPrioritaria, reglaMockBaja] });
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.reglaAplicada, 'mockC');
});

// --- Trazabilidad / reproducibilidad histórica ---

caso('evaluarConVersion reproduce el veredicto de una regla real conocida', () => {
  const r = evaluarConVersion({ tipoTramite: 'PODER Irrevocable' }, 'b', 'v1');
  assert.equal(r.aplicaPLD, true);
  assert.equal(r.reglaAplicada, 'b');
  assert.equal(r.versionRegla, 'v1');
});

caso('evaluarConVersion lanza error explícito si la versión no existe en el histórico', () => {
  assert.throws(
    () => evaluarConVersion({ tipoTramite: 'PODER Irrevocable' }, 'b', 'v99'),
    /No existe la regla/
  );
});

caso('evaluarConVersion regresa null si la Escritura ya no coincide con esa regla histórica', () => {
  const r = evaluarConVersion({ tipoTramite: 'COMPRAVENTA' }, 'b', 'v1');
  assert.equal(r, null);
});

console.log(`motor.test.js: ${pasadas} casos OK`);
