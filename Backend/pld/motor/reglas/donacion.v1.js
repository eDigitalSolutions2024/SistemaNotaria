'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');
const { DOCUMENTOS_IDENTIFICACION_BASICA } = require('../documentosBase');

// ─────────────────────────────────────────────────────────────────────────
// Misma actividad vulnerable que transmisionInmuebles.v1 (Art. 17 Fracc. XII
// inciso a) — pero NO es una copia de esa regla. La donación es un acto
// gratuito (no hay precio pactado), a diferencia de la compraventa, que es
// onerosa. Eso cambia qué campo es jurídicamente válido para el análisis:
//
//   - "monto" presupone un precio pagado. Una donación no tiene precio, así
//     que "monto" NUNCA es la base de cálculo correcta aquí — a diferencia
//     de transmisionInmuebles.v1, donde monto es el campo principal.
//   - El valor de referencia es el valor de avalúo/comercial del bien
//     donado (campoParaCalculo: ['valorAvaluo'] únicamente).
//   - "formaPago" deja de ser un dato obligatorio: no hay pago que
//     registrar en una donación pura.
//   - La advertencia del Art. 32 (restricción de efectivo) NO aplica —
//     ese artículo restringe pagos, y una donación gratuita no tiene pago.
//     El riesgo real y documentado en la práctica AML es distinto:
//     subvaluación del avalúo como técnica para disfrazar transmisión de
//     valor sin dejar rastro de pago.
//
// Sigue existiendo la misma incertidumbre de datos que ya se manejaba: en
// producción, "DONACION" casi nunca especifica el objeto donado. Sin ese
// dato (tipoBien), esta regla NO asume nada — REQUIERE_DATOS
// (aplicaPLD:null + datosFaltantes:['tipoBien']).
//
// "DONACIÓN DE INMUEBLE" (texto ya explícito) la reconoce
// transmisionInmuebles.v1 — se excluye aquí para que las dos reglas nunca
// coincidan a la vez sobre la misma Escritura.
//
// Limitación conocida, no oculta: si la donación incluye alguna
// contraprestación (donación onerosa/mixta), esa porción debería evaluarse
// como compraventa — el sistema no captura ese matiz todavía, así que esta
// regla trata toda donación como puramente gratuita.
//
// Aclaración deliberada: no existe exención por parentesco entre donante y
// donatario para efectos de LFPIORPI (esa exención es de ISR, otra ley) —
// no se implementa aquí para no mezclar criterios de leyes distintas.
// ─────────────────────────────────────────────────────────────────────────
module.exports = crearReglaSimple({
  id: 'a_donacion',
  version: 'v1',
  activo: true,
  nombre: 'Donación (pendiente de confirmar objeto)',

  tipoTramite: {
    patrones: [/donaci[oó]n/i],
    exclusiones: [/donaci[oó]n\s+de\s+inmueble/i],
  },

  actividadVulnerable: {
    aplica: 'CONDICIONAL',
    fundamentoLegal: 'La donación transmite derechos reales sobre un bien de forma gratuita; es actividad vulnerable únicamente cuando el bien donado es un inmueble y su valor de avalúo iguala o supera el umbral legal. Sin conocer el tipo de bien donado, no puede determinarse si aplica.',
    articulo: 'Art. 17 Fracc. XII inciso a) LFPIORPI',
  },

  tipoFEP: null,
  portal: 'DECLARANOT',

  tipoUmbral: 'MONTO_UMA',
  umbralUMAs: 8000, // mismo umbral que transmisionInmuebles.v1 — es el mismo inciso legal
  campoParaCalculo: ['valorAvaluo'], // NUNCA "monto" — una donación no tiene precio

  condiciones: [
    {
      campo: 'tipoBien',
      operador: 'EXISTE',
      faltaSiNoExiste: true,
      motivo: 'No se puede determinar si esta donación es actividad vulnerable sin saber qué tipo de bien se dona (inmueble, mueble, dinero, etc.) — el sistema todavía no captura ese dato.',
    },
    {
      campo: 'tipoBien',
      operador: 'IGUAL',
      valor: 'INMUEBLE',
      faltaSiNoExiste: false,
      motivo: 'El bien donado no es un inmueble — el Art. 17 Fracc. XII inciso a) LFPIORPI solo cubre transmisión de derechos reales sobre inmuebles.',
    },
  ],

  datosObligatorios: ['comparecientes', 'tipoBien', 'valorAvaluo'],
  documentosObligatorios: [
    ...DOCUMENTOS_IDENTIFICACION_BASICA,
    'Avalúo o valor catastral del inmueble donado',
    'Documento que acredite la propiedad del donante',
  ],
  beneficiarioControlador: true,
  advertencias: [
    'Riesgo de subvaluación: la donación es una tipología conocida para transmitir valor sin dejar rastro de pago — verificar que el avalúo refleje el valor comercial real del inmueble.',
  ],

  prioridad: 100,
});
