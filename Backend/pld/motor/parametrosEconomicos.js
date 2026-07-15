'use strict';

// Fuente única de verdad de parámetros económicos (UMA, y en el futuro
// cualquier otro índice que una reforma llegue a referenciar). Se
// actualiza UNA vez al año, en UN solo lugar. Ninguna regla jurídica debe
// contener un valor económico fijo: cada regla solo declara QUÉ TIPO de
// umbral usa (tipoUmbral) y CUÁNTAS unidades (umbralUMAs) — el cálculo a
// pesos siempre se delega a este servicio.
const UMA_VIGENTE = {
  anio: 2026,
  valorDiario: 117.31,
  vigenciaDesde: '2026-02-01',
};

/**
 * Convierte un umbral expresado en UMAs a pesos, con el valor de UMA
 * vigente hoy. null-safe: si la regla no usa umbral (umbralUMAs=null),
 * regresa null en vez de forzar un 0 engañoso.
 */
function calcularUmbralPesos(umbralUMAs) {
  if (umbralUMAs === null || umbralUMAs === undefined) return null;
  return +(umbralUMAs * UMA_VIGENTE.valorDiario).toFixed(2);
}

module.exports = { UMA_VIGENTE, calcularUmbralPesos };
