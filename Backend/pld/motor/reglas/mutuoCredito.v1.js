'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');

// LFPIORPI Art. 17 Fracc. XII inciso e.
module.exports = crearReglaSimple({
  id: 'e',
  version: 'v1',
  nombre: 'Contrato de mutuo o crédito con garantía',
  tipoFEP: '9',
  portal: 'SPPLD',
  umbralUMAs: null,
  detectar: [
    /contrato\s+de\s+(mutuo|cr[eé]dito)/i,
    /\bmutuo\b/i,
    /cr[eé]dito\s+(hipotecario|personal|empresarial)/i,
    /pr[eé]stamo\s+(hipotecario|con\s+garant[ií]a)/i,
  ],
});
