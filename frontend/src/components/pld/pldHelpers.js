// src/components/pld/pldHelpers.js
//
// Mapas y heurísticas del lado del frontend para el MVP del módulo PLD.
// IMPORTANTE: estos mapas (roles por tipo de actividad, campos por tipoFEP,
// permisos por rol) duplican deliberadamente config que hoy solo vive en el
// backend (Backend/pld/generadorXML.js y Backend/pld/roles.js) porque no
// existe un endpoint que la exponga. Si esos archivos cambian, hay que
// actualizar este archivo a mano — no hay una sola fuente de verdad todavía.
//
// evaluarCompletitud() es un chequeo heurístico para guiar al usuario en la
// UI. NO sustituye la validación real de Backend/pld/generadorXML.js, que
// sigue siendo la única fuente de verdad al momento de generar el XML.

export const ESTADO_META = {
  NO_APLICA:            { label: 'No aplica',              color: 'default' },
  PENDIENTE:            { label: 'Pendiente',               color: 'warning' },
  PENDIENTE_DECLARANOT: { label: 'Pendiente (DeclaraNot)',  color: 'info' },
  LISTO:                { label: 'Listo',                   color: 'info' },
  XML_GENERADO:         { label: 'XML generado',            color: 'primary' },
  RECHAZADO_SPPLD:      { label: 'Rechazado SPPLD',          color: 'error' },
  PRESENTADO:           { label: 'Presentado',               color: 'success' },
  CANCELADO:            { label: 'Cancelado',                color: 'default' },
  // Estados sintéticos del Motor de Reglas (GET /pld/escrituras-pld) — la
  // Escritura aplica PLD pero todavía no existe AvisoPLD, o el motor no
  // pudo decidir solo. Nunca se guardan en Mongo, solo se muestran.
  SIN_EXPEDIENTE:       { label: 'Pendiente de iniciar',     color: 'default' },
  REQUIERE_REVISION:    { label: 'Requiere revisión',        color: 'warning' },
};

export function estadoMeta(estado) {
  return ESTADO_META[estado] || { label: estado || '—', color: 'default' };
}

// Traducción de color/label para el nivel de riesgo que calcula el backend
// (Backend/pld/motor/nivelRiesgo.js, GET /pld/avisos/:id/diagnostico). El
// frontend NO decide el nivel — solo lo pinta, mismo principio que
// estadoMeta() con el estado del aviso.
export const NIVEL_RIESGO_META = {
  ALTO:  { label: 'Riesgo alto',  color: 'error',   severidad: 'error' },
  MEDIO: { label: 'Riesgo medio', color: 'warning', severidad: 'warning' },
  BAJO:  { label: 'Riesgo bajo',  color: 'success', severidad: 'success' },
};

export function nivelRiesgoMeta(nivel) {
  return NIVEL_RIESGO_META[nivel] || { label: nivel || '—', color: 'default', severidad: 'info' };
}

// Progreso aproximado del expediente sobre el camino "feliz" del ciclo de
// vida (PENDIENTE → LISTO → XML_GENERADO → PRESENTADO). null = no aplica
// una barra de progreso (NO_APLICA, CANCELADO).
export const PROGRESO_POR_ESTADO = {
  NO_APLICA: null,
  PENDIENTE: 25,
  PENDIENTE_DECLARANOT: 25,
  LISTO: 50,
  XML_GENERADO: 75,
  RECHAZADO_SPPLD: 75,
  PRESENTADO: 100,
  CANCELADO: null,
};

export function diasRestantesTexto(fecha) {
  if (!fecha) return null;
  const dias = Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000);
  if (dias < 0) return { texto: `Venció hace ${Math.abs(dias)} día(s)`, color: '#c62828' };
  if (dias <= 5) return { texto: `Vence en ${dias} día(s)`, color: '#e65100' };
  return { texto: `Vence en ${dias} día(s)`, color: '#2e7d32' };
}

// Tipos de actividad con generador XML implementado (Fase 3 parcial).
export const TIPOS_FEP_SOPORTADOS = ['1', '8', '9'];

// Roles válidos de compareciente por tipoFEP — debe coincidir con
// ROLES_POR_TIPO en Backend/pld/generadorXML.js.
// `simple: true` = no requiere actividad_economica/giro_mercantil (persona_fisica_simple/persona_moral_simple).
export const ROLES_POR_TIPO_FEP = {
  '1': [
    { value: 'PODERDANTE', label: 'Poderdante', simple: false },
    { value: 'APODERADO', label: 'Apoderado', simple: true },
  ],
  '8': [
    { value: 'CEDENTE', label: 'Cedente', simple: false },
    { value: 'CESIONARIO', label: 'Cesionario', simple: false },
  ],
  '9': [
    { value: 'ACREEDOR', label: 'Acreedor', simple: false },
    { value: 'DEUDOR', label: 'Deudor', simple: false },
  ],
};

// Campos de datosActividad por tipoFEP — debe coincidir con lo que consumen
// los adaptadores en Backend/pld/generadorXML.js (construirOtorgamientoPoder,
// construirCesionDerechos, construirContratoMutuo).
export const CAMPOS_POR_TIPO_FEP = {
  '1': [
    { key: 'tipoPoder', label: 'Tipo de poder', tipo: 'select', catalogoId: 'tipo_poder', requerido: true },
  ],
  '8': [
    { key: 'denominacionFideicomiso', label: 'Denominación del fideicomiso', tipo: 'text', requerido: true },
    { key: 'identificadorFideicomiso', label: 'Identificador del fideicomiso', tipo: 'text', requerido: false },
    { key: 'rfcFideicomiso', label: 'RFC del fideicomiso', tipo: 'text', requerido: false },
    { key: 'tipoCesion', label: 'Tipo de cesión', tipo: 'select', catalogoId: 'tipo_cesion', requerido: true },
    { key: 'montoCesion', label: 'Monto de la cesión', tipo: 'number', requerido: true },
  ],
  '9': [
    { key: 'tipoOtorgamiento', label: 'Tipo de otorgamiento', tipo: 'select', catalogoId: 'tipo_otorgamiento', requerido: true },
    { key: 'monedaCodigo', label: 'Moneda', tipo: 'select', catalogoId: 'moneda', requerido: true },
  ],
};

/** catalogoId que hay que precargar para un tipoFEP dado (incluye los comunes a todos). */
export function catalogosNecesarios(tipoFEP) {
  const propios = (CAMPOS_POR_TIPO_FEP[tipoFEP] || [])
    .filter((c) => c.catalogoId)
    .map((c) => c.catalogoId);
  return Array.from(new Set(['pais_iso', 'tipo_alerta', ...propios]));
}

// Permisos por rol de sistema — debe coincidir con MAPA_ROL_SISTEMA +
// PERMISOS_PLD en Backend/pld/roles.js.
export function puedeAccederPLD(roles = []) {
  return roles.some((r) => ['ADMIN', 'ABOGADO', 'ASISTENTE'].includes(r));
}
export function puedeEditarPLD(roles = []) {
  return puedeAccederPLD(roles);
}
export function puedePresentarPLD(roles = []) {
  return roles.some((r) => ['ADMIN', 'ABOGADO'].includes(r));
}
/** Espejo de PERMISOS_PLD[...].puedeVerTodo en Backend/pld/roles.js — hoy
 * solo ADMIN mapea a ADMINISTRADOR/OFICIAL_PLD (ver roles.js: OFICIAL_PLD
 * "se incorporará cuando se extienda el modelo Abogado"). Se usa para
 * decidir si mostrar el filtro "Abogado responsable" en PLDDashboard.jsx —
 * si el usuario no puede ver todo, el backend ignora ese filtro de todas
 * formas (buildFiltroAvisos), así que no tiene sentido mostrarlo. */
export function puedeVerTodoPLD(roles = []) {
  return roles.some((r) => r === 'ADMIN');
}

function textoPresente(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/**
 * Heurística de completitud del lado del cliente — para guiar al usuario,
 * no para decidir si el backend aceptará generar el XML (eso lo decide
 * únicamente Backend/pld/generadorXML.js).
 *
 * `checks` es la lista completa de requisitos evaluados (cumplidos y no
 * cumplidos), cada uno con:
 *   - label: nombre corto para el checklist ("Nacionalidad")
 *   - mensaje: frase en lenguaje natural cuando falta ("Falta capturar la
 *     nacionalidad de Poderdante para continuar.")
 *   - seccion: tab exacto de ExpedientePLD.jsx al que navegar
 *   - categoria: agrupador visual (Comparecientes/Datos Generales/Actividad)
 *   - cumplido: bool
 *   - severidad: 'error' | 'warning' | 'info'
 *
 * `faltantes`/`items`/`avance`/`completo` se derivan de `checks` y se
 * mantienen con la misma forma de siempre — Sidebar y Dashboard no cambian.
 */
export function evaluarCompletitud({ tipoFEP, comparecientes = [], datosActividad = {}, catalogos = {} }) {
  const checks = [];
  const registrar = (label, mensaje, seccion, categoria, cumplido, severidad = 'error') => {
    checks.push({ label, mensaje, seccion, categoria, cumplido, severidad });
  };

  if (!TIPOS_FEP_SOPORTADOS.includes(tipoFEP)) {
    registrar(
      'Tipo de actividad soportado',
      `Este tipo de actividad (tipoFEP="${tipoFEP}") todavía no tiene generador de XML — no se puede continuar.`,
      'actividad', 'Actividad', false, 'info'
    );
    return construirResultado(checks);
  }

  const rolesRequeridos = ROLES_POR_TIPO_FEP[tipoFEP] || [];
  for (const rolInfo of rolesRequeridos) {
    const encontrados = comparecientes.filter(
      (c) => String(c.rol || '').trim().toUpperCase() === rolInfo.value
    );
    registrar(
      `Compareciente "${rolInfo.label}"`,
      `Falta agregar un compareciente con el rol "${rolInfo.label}".`,
      'datosGenerales', 'Comparecientes', encontrados.length > 0
    );
    if (encontrados.length === 0) continue;

    encontrados.forEach((c, idx) => {
      const etiqueta = encontrados.length > 1 ? `${rolInfo.label} #${idx + 1}` : rolInfo.label;
      if (c.tipoPersona === 'MORAL') {
        registrar(`${etiqueta} — Denominación`, `Falta la denominación o razón social de ${etiqueta}.`, 'datosGenerales', 'Datos Generales', textoPresente(c.denominacionRazon));
        registrar(`${etiqueta} — Nacionalidad`, `Falta la nacionalidad de ${etiqueta}.`, 'datosGenerales', 'Datos Generales', textoPresente(c.nacionalidad));
        if (!rolInfo.simple) {
          registrar(`${etiqueta} — Giro mercantil`, `Falta el giro mercantil de ${etiqueta} (código SAT de 7 dígitos).`, 'datosGenerales', 'Datos Generales', /^\d{7}$/.test(String(c.giroMercantil || '')));
        }
      } else {
        registrar(`${etiqueta} — Nombre`, `Falta el nombre de ${etiqueta}.`, 'datosGenerales', 'Datos Generales', textoPresente(c.nombre));
        registrar(`${etiqueta} — Apellido paterno`, `Falta el apellido paterno de ${etiqueta}.`, 'datosGenerales', 'Datos Generales', textoPresente(c.apellidoPaterno));
        registrar(`${etiqueta} — Apellido materno`, `Falta el apellido materno de ${etiqueta}.`, 'datosGenerales', 'Datos Generales', textoPresente(c.apellidoMaterno));
        registrar(`${etiqueta} — Nacionalidad`, `Falta la nacionalidad de ${etiqueta}.`, 'datosGenerales', 'Datos Generales', textoPresente(c.nacionalidad));
        if (!rolInfo.simple) {
          registrar(`${etiqueta} — Actividad económica`, `Falta la actividad económica de ${etiqueta} (código SAT de 7 dígitos).`, 'datosGenerales', 'Datos Generales', /^\d{7}$/.test(String(c.actividadEconomica || '')));
        }
      }
    });
  }

  const revisarCampoCatalogo = (label, valor, catalogoId) => {
    if (!textoPresente(valor)) {
      registrar(label, `Falta capturar ${label} para continuar.`, 'actividad', 'Actividad', false);
      return;
    }
    const opciones = catalogos[catalogoId]?.valores || [];
    if (opciones.length === 0) {
      // TODO(CatalogService): cuando se conecten los catálogos SAT/UIF reales
      // (tipo_poder, tipo_cesion, tipo_otorgamiento, moneda, tipo_alerta),
      // este caso dejará de ocurrir en la práctica — hoy es esperado.
      registrar(label, `El catálogo oficial de "${label}" todavía no está disponible — no se puede continuar hasta que se cargue.`, 'actividad', 'Actividad', false, 'warning');
    } else if (!opciones.some((o) => o.clave === String(valor))) {
      registrar(label, `El valor capturado para ${label} no es válido.`, 'actividad', 'Actividad', false);
    } else {
      registrar(label, '', 'actividad', 'Actividad', true);
    }
  };

  for (const campo of CAMPOS_POR_TIPO_FEP[tipoFEP] || []) {
    if (!campo.requerido) continue;
    if (campo.tipo === 'select' && campo.catalogoId) {
      revisarCampoCatalogo(campo.label, datosActividad[campo.key], campo.catalogoId);
    } else {
      registrar(campo.label, `Falta capturar ${campo.label} para continuar.`, 'actividad', 'Actividad', textoPresente(datosActividad[campo.key]));
    }
  }

  // tipoAlerta es obligatorio en todos los tipos soportados
  revisarCampoCatalogo('Tipo de alerta', datosActividad.tipoAlerta, 'tipo_alerta');

  return construirResultado(checks);
}

// Estados que permiten generar/regenerar XML — debe coincidir con
// ESTADOS_PERMITEN_GENERAR_XML en Backend/routes/pld.js.
const ESTADOS_PERMITEN_GENERAR_XML = ['PENDIENTE', 'LISTO', 'XML_GENERADO'];

/**
 * Qué le impide al notario generar el XML ahora mismo, en una sola frase.
 * Compartida por ValidacionesTab y GenerarXMLTab para no evaluar el mismo
 * criterio dos veces de formas distintas.
 */
export function estadoXML(aviso, completitud) {
  if (aviso.estado === 'NO_APLICA') {
    return { texto: 'Esta escritura no genera obligación PLD — no aplica generar XML.', severidad: 'success', deshabilitado: true };
  }
  if (aviso.estado === 'CANCELADO') {
    return { texto: 'Este expediente está cancelado — no se puede generar el XML.', severidad: 'warning', deshabilitado: true };
  }
  if (aviso.estado === 'PRESENTADO') {
    return { texto: 'Este aviso ya fue presentado ante el SAT — no es necesario generar un nuevo XML.', severidad: 'success', deshabilitado: true };
  }
  if (aviso.estado === 'RECHAZADO_SPPLD') {
    return { texto: 'El SAT rechazó este aviso — revisa el motivo antes de generar un nuevo XML.', severidad: 'warning', deshabilitado: true };
  }
  if (!ESTADOS_PERMITEN_GENERAR_XML.includes(aviso.estado)) {
    return { texto: `No se puede generar el XML desde el estado actual (${estadoMeta(aviso.estado).label}).`, severidad: 'warning', deshabilitado: true };
  }
  if (!completitud.completo) {
    return { texto: 'Completa los puntos marcados abajo antes de poder generar el XML.', severidad: 'warning', deshabilitado: true };
  }
  return { texto: 'Ya puedes generar el XML — no falta ningún dato.', severidad: 'success', deshabilitado: false };
}

/** Qué le impide al notario enviar el aviso al SAT, en una sola frase. */
export function estadoSAT(aviso) {
  switch (aviso.estado) {
    case 'NO_APLICA':
      return 'Esta escritura no requiere aviso ante el SAT.';
    case 'CANCELADO':
      return 'Este expediente está cancelado — no se enviará al SAT.';
    case 'PRESENTADO':
      return 'Este aviso ya fue presentado ante el SAT.';
    default:
      if (!aviso.xmlContenido) {
        return 'Primero debes generar el XML antes de poder subirlo al portal del SAT.';
      }
      return 'El XML ya está listo: descárgalo y súbelo manualmente al portal SPPLD; luego registra el acuse.';
  }
}

function construirResultado(checks) {
  const pendientes = checks.filter((c) => !c.cumplido);
  const total = checks.length;
  const avance = total > 0 ? Math.round(((total - pendientes.length) / total) * 100) : 100;
  return {
    completo: pendientes.length === 0,
    faltantes: pendientes.map((c) => c.mensaje),
    items: pendientes.map((c) => ({ texto: c.mensaje, seccion: c.seccion, severidad: c.severidad })),
    checks,
    avance,
  };
}
