'use strict';

const { crearReglaNoAplica } = require('./_fabricaReglaNoAplica');

// No es actividad vulnerable: el testamento no transmite patrimonio en el
// momento del otorgamiento — surte efectos hasta el fallecimiento del
// testador. No está listado en ninguno de los incisos del Art. 17
// Fracc. XII LFPIORPI (que exige una transmisión u operación patrimonial
// presente, no futura).
module.exports = crearReglaNoAplica({
  id: 'testamento',
  version: 'v1',
  nombre: 'Testamento',
  motivo: 'El testamento no genera obligación PLD: no transmite patrimonio en el momento del otorgamiento (no está contemplado en el Art. 17 Fracc. XII LFPIORPI).',
  detectar: [
    /testamento/i,
    /testamentari[oa]/i,
  ],
});
