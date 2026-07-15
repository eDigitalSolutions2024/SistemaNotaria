'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');

// LFPIORPI Art. 17 Fracc. XII inciso c (escisión).
module.exports = crearReglaSimple({
  id: 'c_escision',
  version: 'v1',
  nombre: 'Escisión de personas morales',
  tipoFEP: '5',
  portal: 'SPPLD',
  umbralUMAs: null,
  detectar: [
    /escisi[oó]n/i,
  ],
});
