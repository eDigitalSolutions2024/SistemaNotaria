'use strict';

// Clasificación de riesgo del expediente — capa de UX sobre el veredicto del
// motor, NO una regla legal nueva. No decide si aplica PLD (eso ya lo
// resolvió evaluarEscritura()); solo traduce lo que el motor y el modelo ya
// produjeron a una señal Bajo/Medio/Alto para que el abogado priorice qué
// expediente atender primero. Deliberadamente no usa ningún campo que el
// motor o AvisoPLD no hayan calculado ya — no se inventa un criterio legal
// nuevo aquí.
//
// ESTADOS_TERMINALES_SIN_RIESGO: una vez que el aviso llegó a uno de estos
// estados ya no hay una decisión pendiente que tomar sobre él (se presentó,
// no aplicaba, o se canceló) — mismo criterio que ya usa
// Backend/pld/pldService.ESTADOS_INMUTABLES para "ya no se edita", aplicado
// aquí a "ya no representa riesgo pendiente".
const ESTADOS_TERMINALES_SIN_RIESGO = ['PRESENTADO', 'NO_APLICA', 'CANCELADO'];

/**
 * @param {object} params
 * @param {{ aplicaPLD: boolean|null, datosFaltantes: string[], advertencias: string[] }} params.diagnostico
 *   — resultado de evaluarEscritura() (Backend/pld/motor/index.js).
 * @param {{ estado: string, confianzaDeteccion?: string, fechaVencimiento?: Date|string|null }} params.aviso
 * @returns {'ALTO'|'MEDIO'|'BAJO'}
 */
function calcularNivelRiesgo({ diagnostico, aviso }) {
  const estado = aviso?.estado;
  const esTerminalSinRiesgo = ESTADOS_TERMINALES_SIN_RIESGO.includes(estado);

  // No genera obligación PLD -> sin riesgo de cumplimiento, sin importar lo demás.
  if (diagnostico?.aplicaPLD === false) return 'BAJO';

  if (estado === 'RECHAZADO_SPPLD') return 'ALTO';

  const vencido = aviso?.fechaVencimiento && new Date(aviso.fechaVencimiento).getTime() < Date.now();
  if (vencido && !esTerminalSinRiesgo) return 'ALTO';

  if (esTerminalSinRiesgo) return 'BAJO';

  if (diagnostico?.aplicaPLD === null) return 'ALTO'; // indeterminado -> requiere revisión manual
  if (aviso?.confianzaDeteccion === 'REQUIERE_REVISION') return 'ALTO';

  const tienePendientes = (diagnostico?.datosFaltantes?.length > 0) || (diagnostico?.advertencias?.length > 0);
  if (tienePendientes) return 'MEDIO';

  return 'BAJO';
}

module.exports = { calcularNivelRiesgo, ESTADOS_TERMINALES_SIN_RIESGO };
