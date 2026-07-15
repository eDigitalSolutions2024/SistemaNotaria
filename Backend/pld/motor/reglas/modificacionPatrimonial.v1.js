'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');

// LFPIORPI Art. 17 Fracc. XII inciso c (modificación patrimonial).
module.exports = crearReglaSimple({
  id: 'c_modificacion',
  version: 'v1',
  nombre: 'Modificación patrimonial de personas morales',
  tipoFEP: '3',
  portal: 'SPPLD',
  umbralUMAs: null,
  detectar: [
    /modificaci[oó]n\s+(patrimonial|de\s+estatutos|de\s+capital)/i,
    /aumento\s+de\s+capital/i,
    /reducci[oó]n\s+de\s+capital/i,
    /reforma\s+de\s+estatutos/i,
  ],
});
