'use strict';

// Fábrica para reglas jurídicas del Motor PLD. Cubre el patrón común:
// "coincide por tipoTramite, y si aplica un umbral económico, compara un
// campo de la Escritura contra ese umbral". No es obligatoria — una regla
// puede ignorarla por completo y escribir su propio evaluar() si depende
// de campos que este molde no contempla. Usarla no acopla la regla a nada
// del resto del sistema: solo lee del objeto Escritura que recibe.
//
// El cálculo y la comparación del umbral NUNCA viven aquí ni en la regla:
// se delegan siempre a umbralesService.js (que a su vez usa
// parametrosEconomicos.js, única fuente de verdad de UMA y afines). Una
// regla solo declara tipoUmbral + umbralUMAs (cuántas unidades) — nunca un
// valor en pesos fijo, y nunca hace la comparación ">=" por su cuenta.
//
// Acepta dos formas de configurar el reconocimiento y el fundamento legal:
//   - la forma nueva y completa (tipoTramite:{patrones,exclusiones},
//     actividadVulnerable:{fundamentoLegal,articulo}) — la usa
//     transmisionInmuebles.v1 como regla de referencia del Rule Engine.
//   - la forma plana anterior (detectar, fundamentoLegal, articulo) — la
//     siguen usando las 9 reglas todavía no migradas; se admite tal cual
//     para no tocarlas fuera de su turno. Cuando se migre la última regla
//     del catálogo, esta compatibilidad doble deja de ser necesaria y se
//     puede retirar.
const { evaluarUmbral } = require('../umbralesService');

// Nombre humano de cada campo económico posible — para que el mensaje de
// "falta un dato" y el de "supera/no supera" nombren el campo real que la
// regla está pidiendo (monto de una compraventa, valor de avalúo de una
// donación, etc.), nunca "monto" a secas cuando la regla no usa monto.
const ETIQUETAS_CAMPO = {
  monto: 'monto de la operación',
  valorAvaluo: 'valor de avalúo',
};
function etiquetaCampo(campo) {
  return ETIQUETAS_CAMPO[campo] || campo;
}

function cumpleCondicion(escritura, condicion) {
  const valorCampo = escritura[condicion.campo];
  switch (condicion.operador) {
    case 'EXISTE':
      return valorCampo !== undefined && valorCampo !== null && valorCampo !== '';
    case 'IGUAL':
      return valorCampo === condicion.valor;
    default:
      return true; // operador desconocido: no bloquea, pero tampoco se inventa una validación
  }
}

function crearReglaSimple({
  id, version, nombre, tipoFEP, portal, prioridad = 100, activo = true,
  // Reconocimiento del trámite — forma nueva o forma plana (legado)
  tipoTramite, detectar,
  // Fundamento legal — forma nueva o forma plana (legado)
  actividadVulnerable, fundamentoLegal, articulo,
  // Umbral económico
  tipoUmbral, umbralUMAs = null, campoParaCalculo = ['monto', 'valorAvaluo'],
  // Condiciones adicionales, declarativas (más allá del umbral)
  condiciones = [],
  // Requisitos del expediente
  datosObligatorios = [], documentosObligatorios, documentosRequeridos = [],
  beneficiarioControlador = false, advertencias = [],
  requiereExpediente, requiereAviso,
}) {
  const patrones = tipoTramite?.patrones || detectar || [];
  const exclusiones = tipoTramite?.exclusiones || [];
  const fundamentoTexto = actividadVulnerable?.fundamentoLegal || fundamentoLegal || null;
  const articuloTexto = actividadVulnerable?.articulo || articulo || null;
  const documentos = documentosObligatorios || documentosRequeridos;
  const tipoUmbralResuelto = tipoUmbral || (umbralUMAs !== null ? 'MONTO_UMA' : 'NINGUNO');
  const requiereMonto = tipoUmbralResuelto === 'MONTO_UMA';

  function construir({ aplicaPLD, motivo, datosFaltantes = [], umbral = null, valorAnalizado = null }) {
    const acciones = [];
    if (aplicaPLD === true) {
      acciones.push('ABRIR_EXPEDIENTE');
      if (beneficiarioControlador) acciones.push('IDENTIFICAR_BENEFICIARIO_CONTROLADOR');
    } else if (aplicaPLD === null && datosFaltantes.length > 0) {
      acciones.push('SOLICITAR_DATO_FALTANTE');
    }

    return {
      aplicaPLD,
      requiereExpediente: requiereExpediente ?? (aplicaPLD !== false),
      requiereAviso: requiereAviso ?? (aplicaPLD === true),
      fundamentoLegal: fundamentoTexto ? `${fundamentoTexto} (${articuloTexto || 'LFPIORPI'})` : null,
      motivo,
      umbral,
      valorAnalizado,
      documentosRequeridos: aplicaPLD === false ? [] : documentos,
      datosFaltantes,
      acciones,
      advertencias: aplicaPLD === false ? [] : advertencias,
      prioridad,
      actividadPLD: { id, nombre, tipoFEP, portal },
    };
  }

  return {
    id,
    version,
    nombre,
    activo,
    // Metadata inspeccionable sin ejecutar evaluar() — útil para auditoría
    // y para que una futura pantalla explique "por qué esta regla existe"
    // sin tener que correr una Escritura de prueba.
    tipoUmbral: tipoUmbralResuelto,
    datosObligatorios,
    documentosObligatorios: documentos,
    condiciones,

    evaluar(escritura) {
      const tipoTramiteTexto = String(escritura.tipoTramite || '');
      const coincide = patrones.some((regex) => regex.test(tipoTramiteTexto));
      if (!coincide) return null; // esta regla no le concierne a esta Escritura
      if (exclusiones.some((regex) => regex.test(tipoTramiteTexto))) return null;

      const condicionFaltante = condiciones.find((c) => c.faltaSiNoExiste && !cumpleCondicion(escritura, c));
      if (condicionFaltante) {
        return construir({
          aplicaPLD: null,
          motivo: condicionFaltante.motivo || `Inciso ${id}: falta confirmar "${condicionFaltante.campo}" para determinar si aplica.`,
          datosFaltantes: [condicionFaltante.campo],
        });
      }
      const condicionIncumplida = condiciones.find((c) => !c.faltaSiNoExiste && !cumpleCondicion(escritura, c));
      if (condicionIncumplida) {
        return construir({
          aplicaPLD: false,
          motivo: condicionIncumplida.motivo || `Inciso ${id}: no aplica — no cumple la condición "${condicionIncumplida.campo}".`,
        });
      }

      if (!requiereMonto) {
        return construir({ aplicaPLD: true, motivo: `Inciso ${id}: aplica sin umbral de monto.` });
      }

      let monto = null;
      let campoUsado = null;
      for (const campo of campoParaCalculo) {
        if (escritura[campo] !== undefined && escritura[campo] !== null) { monto = escritura[campo]; campoUsado = campo; break; }
      }

      const { resultado, umbralPesos } = evaluarUmbral({ tipoUmbral: tipoUmbralResuelto, umbralUMAs, valor: monto });

      if (resultado === 'FALTA_VALOR') {
        const campoFaltante = campoParaCalculo[0]; // campo principal — el que se reporta cuando ninguno está presente
        return construir({
          aplicaPLD: null,
          motivo: `Inciso ${id}: umbral ${umbralPesos} MXN, falta ${etiquetaCampo(campoFaltante)}.`,
          datosFaltantes: [campoFaltante],
          umbral: umbralPesos,
        });
      }

      const supera = resultado === 'SUPERA';
      return construir({
        aplicaPLD: supera,
        motivo: supera
          ? `Inciso ${id}: ${etiquetaCampo(campoUsado)} $${monto.toLocaleString('es-MX')} supera umbral $${umbralPesos.toLocaleString('es-MX')} MXN.`
          : `Inciso ${id}: ${etiquetaCampo(campoUsado)} $${monto.toLocaleString('es-MX')} no supera umbral $${umbralPesos.toLocaleString('es-MX')} MXN.`,
        umbral: umbralPesos,
        valorAnalizado: monto,
      });
    },
  };
}

module.exports = { crearReglaSimple };
