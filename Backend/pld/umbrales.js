'use strict';

// UMA_VIGENTE/calcularUmbralPesos viven en motor/parametrosEconomicos.js —
// única fuente de verdad económica del sistema, para no tener el mismo
// valor de UMA duplicado en dos archivos (este módulo es el detector
// legado; el Motor de Reglas nuevo usa el servicio directamente).
const { UMA_VIGENTE, calcularUmbralPesos } = require('./motor/parametrosEconomicos');

// LFPIORPI Art. 17 Fracc. XII incisos a-e
// tipoFEP: código numérico del catálogo fep.xsd tipo_actividad_type (null = portal DeclaraNOT)
const ACTIVIDADES_PLD = [
  {
    id: 'b',
    tipoFEP: '1',
    portal: 'SPPLD',
    nombre: 'Otorgamiento de poder irrevocable',
    umbralUMAs: null,
    requiereMonto: false,
    detectar: [
      /poder[a-z\s]*irrevocable/i,
      /poder\s+para\s+actos?\s+de\s+dominio/i,
      /poder\s+notarial\s+irrevocable/i,
    ],
  },
  {
    id: 'c_constitucion',
    tipoFEP: '2',
    portal: 'SPPLD',
    nombre: 'Constitución de personas morales',
    umbralUMAs: null,
    requiereMonto: false,
    detectar: [
      /constituci[oó]n\s+de\s+(sociedad|empresa|persona\s+moral|s\.?\s*a\.?|s\.?\s*r\.?\s*l\.?|s\.?\s*a\.?\s*p\.?\s*i\.?|s\.?\s*c\.?|a\.?\s*c\.?)/i,
      /constituci[oó]n\s+social/i,
      /acta\s+constitutiva/i,
    ],
  },
  {
    id: 'c_modificacion',
    tipoFEP: '3',
    portal: 'SPPLD',
    nombre: 'Modificación patrimonial de personas morales',
    umbralUMAs: null,
    requiereMonto: false,
    detectar: [
      /modificaci[oó]n\s+(patrimonial|de\s+estatutos|de\s+capital)/i,
      /aumento\s+de\s+capital/i,
      /reducci[oó]n\s+de\s+capital/i,
      /reforma\s+de\s+estatutos/i,
    ],
  },
  {
    id: 'c_fusion',
    tipoFEP: '4',
    portal: 'SPPLD',
    nombre: 'Fusión de personas morales',
    umbralUMAs: null,
    requiereMonto: false,
    detectar: [
      /fusi[oó]n/i,
    ],
  },
  {
    id: 'c_escision',
    tipoFEP: '5',
    portal: 'SPPLD',
    nombre: 'Escisión de personas morales',
    umbralUMAs: null,
    requiereMonto: false,
    detectar: [
      /escisi[oó]n/i,
    ],
  },
  {
    id: 'c_acciones',
    tipoFEP: '6',
    portal: 'SPPLD',
    nombre: 'Compraventa de acciones o partes sociales',
    umbralUMAs: null,
    requiereMonto: false,
    detectar: [
      /compraventa\s+de\s+acciones/i,
      /compra\s*venta\s+de\s+acciones/i,
      /compraventa\s+de\s+partes\s+sociales/i,
      /cesi[oó]n\s+de\s+partes\s+sociales/i,
      /transmisi[oó]n\s+de\s+acciones/i,
    ],
  },
  {
    id: 'd',
    tipoFEP: '7',
    portal: 'SPPLD',
    nombre: 'Constitución o modificación de fideicomiso traslativo de dominio o de garantía',
    umbralUMAs: 4000,
    requiereMonto: true,
    detectar: [
      /fideicomiso[a-z\s]*(traslativ[oa]|de\s+garant[ií]a|de\s+dominio)/i,
      /constituci[oó]n[a-z\s]*fideicomiso/i,
      /modificaci[oó]n[a-z\s]*fideicomiso/i,
    ],
  },
  {
    id: 'c_cesion',
    tipoFEP: '8',
    portal: 'SPPLD',
    nombre: 'Cesión de derechos de fideicomitente o fideicomisario',
    umbralUMAs: null,
    requiereMonto: false,
    detectar: [
      /cesi[oó]n\s+de\s+derechos[a-z\s]*fideicomis/i,
      /fideicomitente[a-z\s]*cesi[oó]n/i,
      /fideicomisario[a-z\s]*cesi[oó]n/i,
    ],
  },
  {
    id: 'e',
    tipoFEP: '9',
    portal: 'SPPLD',
    nombre: 'Contrato de mutuo o crédito con garantía',
    umbralUMAs: null,
    requiereMonto: false,
    detectar: [
      /contrato\s+de\s+(mutuo|cr[eé]dito)/i,
      /\bmutuo\b/i,
      /cr[eé]dito\s+(hipotecario|personal|empresarial)/i,
      /pr[eé]stamo\s+(hipotecario|con\s+garant[ií]a)/i,
    ],
  },
  // inciso a: inmuebles → DeclaraNOT (tipoFEP null, portal diferente)
  // Posicionado al final para que compraventa de acciones gane primero
  {
    id: 'a',
    tipoFEP: null,
    portal: 'DECLARANOT',
    nombre: 'Transmisión de derechos reales sobre inmuebles',
    umbralUMAs: 8000,
    requiereMonto: true,
    detectar: [
      /compraventa(?!\s+de\s+(acciones|partes\s+sociales))/i,
      /traslado\s+de\s+dominio/i,
      /transmisi[oó]n\s+de\s+(propiedad|dominio|derechos\s+reales)/i,
      /donaci[oó]n\s+de\s+inmueble/i,
      /permuta\s+de\s+inmueble/i,
    ],
  },
];

module.exports = { UMA_VIGENTE, ACTIVIDADES_PLD, calcularUmbralPesos };
