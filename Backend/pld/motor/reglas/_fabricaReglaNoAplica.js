'use strict';

// Fábrica para actividades que el motor reconoce con certeza pero que NO
// son actividad vulnerable bajo la LFPIORPI. A diferencia de
// _fabricaReglaSimple (que siempre evalúa si el trámite aplica), esta
// fábrica siempre resuelve aplicaPLD:false cuando el trámite coincide —
// hay fundamento jurídico explícito de por qué NO aplica, no es una
// omisión ni un REQUIERE_REVISION disfrazado.
function crearReglaNoAplica({ id, version, nombre, motivo, detectar, prioridad = 100, fundamentoLegal = null, articulo = null }) {
  return {
    id,
    version,
    nombre,
    evaluar(escritura) {
      const tipoTramite = String(escritura.tipoTramite || '');
      const coincide = detectar.some((regex) => regex.test(tipoTramite));
      if (!coincide) return null; // esta regla no le concierne a esta Escritura

      return {
        aplicaPLD: false,
        requiereExpediente: false,
        requiereAviso: false,
        fundamentoLegal: fundamentoLegal ? `${fundamentoLegal} (${articulo || 'LFPIORPI'})` : null,
        motivo,
        umbral: null,
        valorAnalizado: null,
        documentosRequeridos: [],
        datosFaltantes: [],
        acciones: [],
        advertencias: [],
        prioridad,
        actividadPLD: null,
      };
    },
  };
}

module.exports = { crearReglaNoAplica };
