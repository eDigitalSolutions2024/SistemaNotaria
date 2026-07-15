'use strict';

const { crearReglaSimple } = require('./_fabricaReglaSimple');
const { DOCUMENTOS_IDENTIFICACION_BASICA } = require('../documentosBase');

// ─────────────────────────────────────────────────────────────────────────
// REGLA MODELO del Motor Jurídico PLD — este es el molde a replicar para
// migrar el resto del catálogo aprobado.
//
// Se conserva el nombre "transmisionInmuebles" (no "compraventa") porque
// jurídicamente el inciso a) no distingue la vía de transmisión: compraventa,
// donación de inmueble, permuta de inmueble y traslado de dominio caen bajo
// el mismo fundamento y el mismo umbral. "Compraventa" habría descrito solo
// un subconjunto de lo que esta regla ya reconoce.
//
// Limitación conocida, no oculta: Adjudicación (hereditaria/judicial) y
// Dación en pago también transmiten derechos reales sobre inmuebles, pero
// el sistema todavía no captura "tipo de bien" — sin ese dato no se puede
// confirmar que el bien adjudicado/dado en pago sea un inmueble sin
// adivinar. Por eso NO se agregaron sus patrones aquí; quedan pendientes
// en el catálogo (Adjudicación, Hipoteca/Adeudo/Dación en pago) hasta que
// se resuelva esa captura de datos.
// ─────────────────────────────────────────────────────────────────────────
module.exports = crearReglaSimple({
  id: 'a',
  version: 'v1',
  activo: true,
  nombre: 'Transmisión de derechos reales sobre inmuebles',

  tipoTramite: {
    patrones: [
      /compraventa(?!\s+de\s+(acciones|partes\s+sociales))/i,
      /traslado\s+de\s+dominio/i,
      /transmisi[oó]n\s+de\s+(propiedad|dominio|derechos\s+reales)/i,
      /donaci[oó]n\s+de\s+inmueble/i,
      /permuta\s+de\s+inmueble/i,
    ],
    // El regex negativo de "compraventa" ya evita solaparse con
    // "compraventa de acciones/partes sociales" (regla c_acciones) — no
    // hace falta una exclusión aparte.
    exclusiones: [],
  },

  actividadVulnerable: {
    aplica: 'CONDICIONAL', // depende de si el monto/valor avalúo supera el umbral
    fundamentoLegal: 'La transmisión o constitución de derechos reales sobre inmuebles es actividad vulnerable cuando el monto de la operación (o, en su defecto, el valor de avalúo) iguala o supera el umbral legal.',
    articulo: 'Art. 17 Fracc. XII inciso a) LFPIORPI',
  },

  tipoFEP: null,          // portal DeclaraNOT, no genera XML fep.xsd (generadorXML.js no cubre esta vía todavía)
  portal: 'DECLARANOT',

  tipoUmbral: 'MONTO_UMA',
  umbralUMAs: 8000,        // el valor en pesos SIEMPRE se calcula en parametrosEconomicos.js, nunca aquí
  campoParaCalculo: ['monto', 'valorAvaluo'],

  condiciones: [], // ninguna todavía — ver limitación conocida arriba (tipo de bien)

  datosObligatorios: ['comparecientes', 'monto', 'formaPago'],
  documentosObligatorios: [
    ...DOCUMENTOS_IDENTIFICACION_BASICA,
    'Avalúo o valor catastral del inmueble',
    'Documento que acredite la propiedad del transmitente',
  ],
  beneficiarioControlador: true,
  advertencias: [
    'Verificar la forma de pago: el Art. 32 LFPIORPI restringe el uso de efectivo en la transmisión de inmuebles por montos que superen los límites legales establecidos.',
  ],

  prioridad: 100,
});
