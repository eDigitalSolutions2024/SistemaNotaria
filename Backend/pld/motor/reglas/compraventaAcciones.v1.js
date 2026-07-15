'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');

// LFPIORPI Art. 17 Fracc. XII inciso c (compraventa de acciones/partes sociales).
module.exports = crearReglaSimple({
  id: 'c_acciones',
  version: 'v1',
  nombre: 'Compraventa de acciones o partes sociales',
  tipoFEP: '6',
  portal: 'SPPLD',
  umbralUMAs: null,
  detectar: [
    /compraventa\s+de\s+acciones/i,
    /compra\s*venta\s+de\s+acciones/i,
    /compraventa\s+de\s+partes\s+sociales/i,
    /cesi[oó]n\s+de\s+partes\s+sociales/i,
    /transmisi[oó]n\s+de\s+acciones/i,
  ],
});
