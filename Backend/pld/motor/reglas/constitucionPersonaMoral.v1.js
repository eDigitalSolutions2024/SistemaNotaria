'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');

// LFPIORPI Art. 17 Fracc. XII inciso c (constitución).
module.exports = crearReglaSimple({
  id: 'c_constitucion',
  version: 'v1',
  nombre: 'Constitución de personas morales',
  tipoFEP: '2',
  portal: 'SPPLD',
  umbralUMAs: null,
  detectar: [
    /constituci[oó]n\s+de\s+(sociedad|empresa|persona\s+moral|s\.?\s*a\.?|s\.?\s*r\.?\s*l\.?|s\.?\s*a\.?\s*p\.?\s*i\.?|s\.?\s*c\.?|a\.?\s*c\.?)/i,
    /constituci[oó]n\s+social/i,
    /acta\s+constitutiva/i,
  ],
});
