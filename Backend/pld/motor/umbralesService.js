'use strict';

// Servicio de apoyo: decide si un valor supera un umbral. Las reglas
// jurídicas NUNCA hacen esta comparación por su cuenta ni conocen el
// resultado en pesos — piden aquí, con la unidad que declaran (hoy solo
// UMAs), y este servicio delega la conversión a parametrosEconomicos.js.
// Si mañana existe un tipo de umbral distinto (otro índice, un porcentaje,
// un acumulado), se agrega aquí — nunca dentro de una regla.
const { calcularUmbralPesos } = require('./parametrosEconomicos');

/**
 * @param {{ tipoUmbral: 'NINGUNO'|'MONTO_UMA', umbralUMAs: number|null, valor: number|null }} params
 * @returns {{ resultado: 'SIN_UMBRAL'|'FALTA_VALOR'|'SUPERA'|'NO_SUPERA', umbralPesos: number|null }}
 */
function evaluarUmbral({ tipoUmbral, umbralUMAs, valor }) {
  if (tipoUmbral === 'NINGUNO' || umbralUMAs === null || umbralUMAs === undefined) {
    return { resultado: 'SIN_UMBRAL', umbralPesos: null };
  }
  if (tipoUmbral !== 'MONTO_UMA') {
    throw new Error(`umbralesService: tipoUmbral "${tipoUmbral}" no está soportado todavía.`);
  }

  const umbralPesos = calcularUmbralPesos(umbralUMAs);
  if (valor === null || valor === undefined) {
    return { resultado: 'FALTA_VALOR', umbralPesos };
  }
  return { resultado: valor >= umbralPesos ? 'SUPERA' : 'NO_SUPERA', umbralPesos };
}

module.exports = { evaluarUmbral };
