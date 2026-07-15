'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');

// LFPIORPI Art. 17 Fracc. XII inciso b.
module.exports = crearReglaSimple({
  id: 'b',
  version: 'v1',
  nombre: 'Otorgamiento de poder irrevocable',
  tipoFEP: '1',
  portal: 'SPPLD',
  umbralUMAs: null,
  detectar: [
    /poder[a-z\s]*irrevocable/i,
    /poder\s+para\s+actos?\s+de\s+dominio/i,
    /poder\s+notarial\s+irrevocable/i,
  ],
});
