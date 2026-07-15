'use strict';

// ─────────────────────────────────────────────────────────────────────────
// Adjudicación — NO usa crearReglaSimple. A diferencia de Donación (una
// sola condición: tipoBien), Adjudicación tiene una ramificación real que
// el formato lineal de `condiciones` de la fábrica no puede expresar sin
// volverse engañoso: la modalidad de adjudicación determina si hace falta
// una segunda pregunta antes de llegar a tipoBien/umbral. Esta es
// exactamente la salida prevista desde el diseño original del Rule Engine
// ("una regla puede escribir su propio evaluar() si depende de campos que
// el molde no contempla") — no se tocó _fabricaReglaSimple.js ni el motor.
//
// Aun así, respeta el mismo contrato de salida y delega el cálculo de
// umbral a umbralesService.js — nunca compara pesos por su cuenta.
//
// ANÁLISIS JURÍDICO (ver mensaje al usuario para el razonamiento completo):
//
// 1. Herencia y Remate/ejecución judicial: transmiten derechos reales a
//    quien antes no los tenía. Art. 17 Fracc. XII inciso a) no distingue
//    transmisión voluntaria de forzosa, ni inter vivos de causa mortis —
//    se tratan como TRANSLATIVAS (mismo patrón que Compraventa/Donación).
//
// 2. Liquidación de sociedad conyugal y División de cosa común: la
//    partición tiene, en principio, efecto DECLARATIVO (no traslativo)
//    cuando es proporcional a lo que cada quien ya tenía — doctrina civil
//    de la partición. Si hubo compensación económica por diferencias de
//    valor, esa porción SÍ es traslativa. El sistema no sabe cuál es el
//    caso sin preguntar — por eso exige `huboCompensacionEconomica` antes
//    de concluir, en vez de asumir.
//
// 3. Ninguna escritura real de producción especifica la modalidad — todas
//    dicen "ADJUDICACION"/"ADJ" a secas. Por eso `modalidadAdjudicacion`
//    es SIEMPRE un dato obligatorio, nunca inferido del texto libre
//    (aunque un registro real dice literalmente "adjudicacion judicial",
//    deliberadamente no se infiere de ahí para mantener un criterio
//    consistente y no depender de coincidencias de texto).
// ─────────────────────────────────────────────────────────────────────────
const { evaluarUmbral } = require('../umbralesService');
const { DOCUMENTOS_IDENTIFICACION_BASICA } = require('../documentosBase');

const ID = 'a_adjudicacion';
const VERSION = 'v1';
const NOMBRE = 'Adjudicación';
const TIPO_FEP = null;
const PORTAL = 'DECLARANOT';
const UMBRAL_UMAS = 8000; // mismo umbral que transmisionInmuebles.v1 y donacion.v1 — mismo inciso legal
const PRIORIDAD = 100;

const MODALIDADES_TRANSLATIVAS = ['HERENCIA', 'REMATE_JUDICIAL', 'OTRA'];
const MODALIDADES_PARTICION = ['LIQUIDACION_SOCIEDAD_CONYUGAL', 'DIVISION_COSA_COMUN'];
const MODALIDADES_VALIDAS = [...MODALIDADES_TRANSLATIVAS, ...MODALIDADES_PARTICION];

const PATRONES = [/adjudicaci[oó]n/i, /\badj\b/i];
const EXCLUSIONES = [/donaci[oó]n/i, /compraventa/i]; // ya cubiertas por donacion.v1 y transmisionInmuebles.v1

function documentosPara(modalidad) {
  const base = [
    ...DOCUMENTOS_IDENTIFICACION_BASICA,
    'Avalúo o valor catastral del inmueble adjudicado',
  ];
  if (modalidad === 'HERENCIA') {
    base.push('Acta de defunción y resolución de declaración de herederos');
  } else if (modalidad === 'REMATE_JUDICIAL') {
    base.push('Resolución o sentencia judicial que ordena la adjudicación');
  } else if (MODALIDADES_PARTICION.includes(modalidad)) {
    base.push('Documento que acredite el régimen de copropiedad o sociedad conyugal previo');
  }
  return base;
}

function construir({ aplicaPLD, motivo, datosFaltantes = [], umbral = null, valorAnalizado = null, fundamentoLegal, documentosRequeridos = [], advertencias = [] }) {
  const acciones = [];
  if (aplicaPLD === true) {
    acciones.push('ABRIR_EXPEDIENTE');
    acciones.push('IDENTIFICAR_BENEFICIARIO_CONTROLADOR');
  } else if (aplicaPLD === null && datosFaltantes.length > 0) {
    acciones.push('SOLICITAR_DATO_FALTANTE');
  }

  return {
    aplicaPLD,
    requiereExpediente: aplicaPLD !== false,
    requiereAviso: aplicaPLD === true,
    fundamentoLegal: fundamentoLegal ? `${fundamentoLegal} (Art. 17 Fracc. XII inciso a) LFPIORPI)` : null,
    motivo,
    umbral,
    valorAnalizado,
    documentosRequeridos: aplicaPLD === false ? [] : documentosRequeridos,
    datosFaltantes,
    acciones,
    advertencias: aplicaPLD === false ? [] : advertencias,
    prioridad: PRIORIDAD,
    actividadPLD: { id: ID, nombre: NOMBRE, tipoFEP: TIPO_FEP, portal: PORTAL },
  };
}

function evaluarTranslativa(escritura) {
  if (escritura.tipoBien === undefined || escritura.tipoBien === null || escritura.tipoBien === '') {
    return construir({
      aplicaPLD: null,
      motivo: 'No se puede determinar si esta adjudicación es actividad vulnerable sin saber qué tipo de bien se adjudica (inmueble, mueble, dinero, etc.).',
      datosFaltantes: ['tipoBien'],
      fundamentoLegal: 'La adjudicación transmite derechos reales sobre un bien; es actividad vulnerable únicamente cuando el bien adjudicado es un inmueble y su valor iguala o supera el umbral legal.',
    });
  }
  if (escritura.tipoBien !== 'INMUEBLE') {
    return construir({
      aplicaPLD: false,
      motivo: 'El bien adjudicado no es un inmueble — el Art. 17 Fracc. XII inciso a) LFPIORPI solo cubre transmisión de derechos reales sobre inmuebles.',
      fundamentoLegal: 'La adjudicación transmite derechos reales sobre un bien; es actividad vulnerable únicamente cuando el bien adjudicado es un inmueble.',
    });
  }

  const { resultado, umbralPesos } = evaluarUmbral({ tipoUmbral: 'MONTO_UMA', umbralUMAs: UMBRAL_UMAS, valor: escritura.valorAvaluo ?? null });
  const fundamento = 'La adjudicación transmite derechos reales sobre un inmueble; es actividad vulnerable cuando su valor de avalúo iguala o supera el umbral legal.';

  if (resultado === 'FALTA_VALOR') {
    return construir({
      aplicaPLD: null,
      motivo: `Umbral ${umbralPesos} MXN, falta valor de avalúo del inmueble adjudicado.`,
      datosFaltantes: ['valorAvaluo'],
      umbral: umbralPesos,
      fundamentoLegal: fundamento,
    });
  }

  const supera = resultado === 'SUPERA';
  return construir({
    aplicaPLD: supera,
    motivo: supera
      ? `Valor de avalúo $${escritura.valorAvaluo.toLocaleString('es-MX')} supera umbral $${umbralPesos.toLocaleString('es-MX')} MXN.`
      : `Valor de avalúo $${escritura.valorAvaluo.toLocaleString('es-MX')} no supera umbral $${umbralPesos.toLocaleString('es-MX')} MXN.`,
    umbral: umbralPesos,
    valorAnalizado: escritura.valorAvaluo,
    fundamentoLegal: fundamento,
    documentosRequeridos: supera ? documentosPara(escritura.modalidadAdjudicacion) : [],
    advertencias: supera ? ['Verificar que el valor de avalúo utilizado para la adjudicación refleje el valor comercial real del inmueble.'] : [],
  });
}

module.exports = {
  id: ID,
  version: VERSION,
  nombre: NOMBRE,
  activo: true,
  tipoUmbral: 'MONTO_UMA',
  datosObligatorios: ['comparecientes', 'modalidadAdjudicacion', 'tipoBien', 'valorAvaluo'],
  documentosObligatorios: documentosPara(null),
  condiciones: [], // ramificación real — ver evaluar() propio, no cabe en el formato lineal de condiciones

  evaluar(escritura) {
    const tipoTramite = String(escritura.tipoTramite || '');
    if (!PATRONES.some((r) => r.test(tipoTramite))) return null;
    if (EXCLUSIONES.some((r) => r.test(tipoTramite))) return null;

    const modalidad = escritura.modalidadAdjudicacion;
    if (!modalidad || !MODALIDADES_VALIDAS.includes(modalidad)) {
      return construir({
        aplicaPLD: null,
        motivo: 'No se puede determinar si esta adjudicación es actividad vulnerable sin conocer su modalidad (herencia, remate judicial, liquidación de sociedad conyugal, división de cosa común, u otra) — cada una tiene un tratamiento legal distinto.',
        datosFaltantes: ['modalidadAdjudicacion'],
        fundamentoLegal: 'El Art. 17 Fracc. XII inciso a) LFPIORPI cubre la transmisión de derechos reales sobre inmuebles; determinar si esta adjudicación transmite un derecho (y no solo lo declara) depende de su modalidad.',
      });
    }

    if (MODALIDADES_TRANSLATIVAS.includes(modalidad)) {
      return evaluarTranslativa(escritura);
    }

    // MODALIDADES_PARTICION: liquidación de sociedad conyugal / división de cosa común
    const compensacion = escritura.huboCompensacionEconomica;
    if (compensacion === undefined || compensacion === null) {
      return construir({
        aplicaPLD: null,
        motivo: 'La partición entre copropietarios (sociedad conyugal o copropiedad) tiene efecto declarativo, no traslativo, cuando es proporcional a lo que cada quien ya tenía — pero si hubo compensación económica por diferencias de valor, esa porción sí transmite un derecho nuevo. Falta confirmar si hubo compensación.',
        datosFaltantes: ['huboCompensacionEconomica'],
        fundamentoLegal: 'La partición proporcional no constituye transmisión bajo el Art. 17 Fracc. XII inciso a) LFPIORPI (efecto declarativo de la partición); una partición con compensación económica sí puede serlo, por la porción compensada.',
      });
    }
    if (compensacion === false) {
      return construir({
        aplicaPLD: false,
        motivo: 'La división es proporcional a lo que cada copropietario ya tenía, sin compensación económica — tiene efecto declarativo, no traslativo: no transmite un derecho real nuevo a nadie.',
        fundamentoLegal: 'La partición proporcional, sin compensación económica, no constituye "transmisión" para efectos del Art. 17 Fracc. XII inciso a) LFPIORPI.',
      });
    }

    // compensacion === true -> hay una porción traslativa, se analiza igual que una adjudicación translativa
    return evaluarTranslativa(escritura);
  },
};
