'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');

// LFPIORPI Art. 17 Fracc. XII inciso c (fusión).
module.exports = crearReglaSimple({
  id: 'c_fusion',
  version: 'v1',
  nombre: 'Fusión de personas morales',
  tipoFEP: '4',
  portal: 'SPPLD',
  umbralUMAs: null,
  detectar: [
    /fusi[oó]n/i,
  ],
});
