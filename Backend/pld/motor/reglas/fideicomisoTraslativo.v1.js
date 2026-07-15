'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');

// LFPIORPI Art. 17 Fracc. XII inciso d.
module.exports = crearReglaSimple({
  id: 'd',
  version: 'v1',
  nombre: 'Constitución o modificación de fideicomiso traslativo de dominio o de garantía',
  tipoFEP: '7',
  portal: 'SPPLD',
  umbralUMAs: 4000,
  detectar: [
    /fideicomiso[a-z\s]*(traslativ[oa]|de\s+garant[ií]a|de\s+dominio)/i,
    /constituci[oó]n[a-z\s]*fideicomiso/i,
    /modificaci[oó]n[a-z\s]*fideicomiso/i,
  ],
});
