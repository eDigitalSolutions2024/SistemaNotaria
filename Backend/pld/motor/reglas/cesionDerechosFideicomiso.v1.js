'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');

// LFPIORPI Art. 17 Fracc. XII inciso c (cesión de derechos de fideicomitente/fideicomisario).
module.exports = crearReglaSimple({
  id: 'c_cesion',
  version: 'v1',
  nombre: 'Cesión de derechos de fideicomitente o fideicomisario',
  tipoFEP: '8',
  portal: 'SPPLD',
  umbralUMAs: null,
  detectar: [
    /cesi[oó]n\s+de\s+derechos[a-z\s]*fideicomis/i,
    /fideicomitente[a-z\s]*cesi[oó]n/i,
    /fideicomisario[a-z\s]*cesi[oó]n/i,
  ],
});
