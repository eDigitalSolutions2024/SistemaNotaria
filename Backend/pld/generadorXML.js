'use strict';

/**
 * Generador de XML fep.xsd para AvisoPLD — Fase 3 (parcial).
 *
 * Cobertura actual: solo los tipos de actividad cuya información ya se
 * captura hoy en AvisoPLD.comparecientes sin requerir UI nueva compleja
 * (accionistas, capital social, fideicomisos completos, etc.):
 *
 *   tipoFEP '1' — Otorgamiento de poder (irrevocable)
 *   tipoFEP '8' — Cesión de derechos de fideicomitente/fideicomisario
 *   tipoFEP '9' — Contrato de mutuo o crédito con garantía
 *
 * El resto de los tipos (constitución, modificación patrimonial, fusión,
 * escisión, compraventa de acciones, fideicomiso, avalúo) requieren capturar
 * datos que hoy no existen en el modelo (accionistas, capital social, giro
 * mercantil por accionista, comité técnico, etc.) y se rechazan explícitamente.
 *
 * Principio de diseño: nunca inventar valores de catálogo regulatorio
 * (tipo_poder, tipo_otorgamiento, tipo_cesion, moneda, tipo_alerta). Estos
 * códigos deben vener de AvisoPLD.datosActividad, capturados por el abogado
 * a partir del catálogo oficial SAT/UIF. Si faltan, se rechaza la generación
 * con un listado explícito — nunca se produce un aviso con datos adivinados.
 *
 * No hay validación XSD real (no se instaló libxmljs2 u otra librería nativa
 * de validación). normalizadorSAT.js cubre los patrones (xsd:pattern) del
 * esquema uno a uno; antes de subir el XML al portal SPPLD se recomienda
 * validarlo contra Backend/pld/xsd/fep.xsd con una herramienta externa.
 */

const crypto = require('crypto');
const { getSujetoObligadoConfig } = require('./configNotaria');
const {
  normalizarNombre,
  normalizarDenominacion,
  formatFechaXSD,
  convertirFechaDDMMAAAAaXSD,
  formatMesReportado,
  formatMontoXSD,
  limpiarReferenciaAviso,
  nacionalidadAPais,
  cumple,
} = require('./normalizadorSAT');

const NS = 'http://www.uif.shcp.gob.mx/recepcion/fep';
const TIPOS_SOPORTADOS = ['1', '8', '9'];

const ROLES_POR_TIPO = {
  '1': { poderdante: ['PODERDANTE', 'OTORGANTE'], apoderado: ['APODERADO'] },
  '8': { cedente: ['CEDENTE'], cesionario: ['CESIONARIO'] },
  '9': { acreedor: ['ACREEDOR'], deudor: ['DEUDOR'] },
};

class PLDXMLError extends Error {
  constructor(errores) {
    super(`No se puede generar el XML: ${errores.length} error(es) de validación.`);
    this.name = 'PLDXMLError';
    this.errores = errores;
  }
}

// ── Helpers XML ───────────────────────────────────────────────────────────────

function escapeXML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(nombre, valor) {
  return `<${nombre}>${escapeXML(valor)}</${nombre}>`;
}

function normalizarRol(rol) {
  return normalizarNombre(rol); // mismo charset [A-ZÑ ], sirve para comparar roles
}

function agruparPorRol(comparecientes, tipoFEP) {
  const mapaRoles = ROLES_POR_TIPO[tipoFEP];
  const grupos = {};
  for (const clave of Object.keys(mapaRoles)) grupos[clave] = [];
  const sinRol = [];

  for (const c of comparecientes) {
    const rolNorm = normalizarRol(c.rol);
    const entrada = Object.entries(mapaRoles).find(([, sinonimos]) => sinonimos.includes(rolNorm));
    if (entrada) grupos[entrada[0]].push(c);
    else sinRol.push(c);
  }
  return { grupos, sinRol };
}

function nombreCompareciente(c) {
  return c?.nombreCompleto || c?.denominacionRazon || c?.nombre || '(sin nombre)';
}

// ── Persona física / moral (tipo_persona_type y variantes "simple") ───────────

function construirPersonaFisica(c, { simple }, errores, etiqueta) {
  const nombre = normalizarNombre(c.nombre);
  const apellidoPaterno = normalizarNombre(c.apellidoPaterno);
  const apellidoMaterno = normalizarNombre(c.apellidoMaterno);
  const pais = nacionalidadAPais(c.nacionalidad);

  if (!cumple('nombre', nombre)) errores.push(`${etiqueta}: falta o es inválido el nombre.`);
  if (!cumple('nombre', apellidoPaterno)) errores.push(`${etiqueta}: falta o es inválido el apellido paterno.`);
  if (!cumple('nombre', apellidoMaterno)) errores.push(`${etiqueta}: falta o es inválido el apellido materno.`);
  if (!pais) errores.push(`${etiqueta}: nacionalidad "${c.nacionalidad || ''}" no se pudo resolver a código de país (ISO 2 letras).`);
  if (!simple && !cumple('digito7', String(c.actividadEconomica || ''))) {
    errores.push(`${etiqueta}: falta actividad_economica (código SAT de 7 dígitos) — campo reservado en el expediente PLD.`);
  }

  let fechaNac = '';
  if (c.fechaNacimiento) {
    fechaNac = convertirFechaDDMMAAAAaXSD(c.fechaNacimiento);
    if (!fechaNac) errores.push(`${etiqueta}: fecha_nacimiento "${c.fechaNacimiento}" no tiene formato DD/MM/AAAA válido.`);
  }
  if (c.rfc && !cumple('rfcFisica', c.rfc.toUpperCase())) errores.push(`${etiqueta}: rfc "${c.rfc}" no cumple el formato de RFC de persona física.`);
  if (c.curp && !cumple('curp', c.curp.toUpperCase())) errores.push(`${etiqueta}: curp "${c.curp}" no cumple el formato oficial.`);

  return (
    '<persona_fisica>' +
      tag('nombre', nombre) +
      tag('apellido_paterno', apellidoPaterno) +
      tag('apellido_materno', apellidoMaterno) +
      (fechaNac ? tag('fecha_nacimiento', fechaNac) : '') +
      (c.rfc ? tag('rfc', c.rfc.toUpperCase()) : '') +
      (c.curp ? tag('curp', c.curp.toUpperCase()) : '') +
      tag('pais_nacionalidad', pais || '') +
      (!simple ? tag('actividad_economica', c.actividadEconomica || '') : '') +
    '</persona_fisica>'
  );
}

function construirPersonaMoral(c, { simple }, errores, etiqueta) {
  const denom = normalizarDenominacion(c.denominacionRazon);
  const pais = nacionalidadAPais(c.nacionalidad);

  if (!cumple('denominacion', denom)) errores.push(`${etiqueta}: falta o es inválida la denominación o razón social.`);
  if (!pais) errores.push(`${etiqueta}: nacionalidad "${c.nacionalidad || ''}" no se pudo resolver a código de país (ISO 2 letras).`);

  let fechaConst = '';
  if (c.fechaConstitucion) {
    fechaConst = convertirFechaDDMMAAAAaXSD(c.fechaConstitucion);
    if (!fechaConst) errores.push(`${etiqueta}: fecha_constitucion "${c.fechaConstitucion}" no tiene formato DD/MM/AAAA válido.`);
  }
  if (c.rfc && !cumple('rfcMoral', c.rfc.toUpperCase())) errores.push(`${etiqueta}: rfc "${c.rfc}" no cumple el formato de RFC de persona moral.`);
  if (!simple && !cumple('digito7', String(c.giroMercantil || ''))) {
    errores.push(`${etiqueta}: falta giro_mercantil (código SAT de 7 dígitos) — campo reservado en el expediente PLD.`);
  }

  return (
    '<persona_moral>' +
      tag('denominacion_razon', denom) +
      (fechaConst ? tag('fecha_constitucion', fechaConst) : '') +
      (c.rfc ? tag('rfc', c.rfc.toUpperCase()) : '') +
      tag('pais_nacionalidad', pais || '') +
      (!simple ? tag('giro_mercantil', c.giroMercantil || '') : '') +
    '</persona_moral>'
  );
}

// Envuelve en <tipo_persona> — nombre del elemento en todos los complexType
// que lo usan (datos_poderdante, datos_apoderado, datos_cedente/cesionario,
// datos_acreedor/deudor), tanto en la variante completa como la "simple".
function construirTipoPersona(c, { simple }, errores, etiqueta) {
  if (!c) {
    errores.push(`${etiqueta}: no se encontró ningún compareciente con el rol requerido.`);
    return `<tipo_persona></tipo_persona>`;
  }
  const interior = c.tipoPersona === 'MORAL'
    ? construirPersonaMoral(c, { simple }, errores, etiqueta)
    : construirPersonaFisica(c, { simple }, errores, etiqueta);
  return `<tipo_persona>${interior}</tipo_persona>`;
}

// persona_aviso_type: solo campos de persona física, sin pais/actividad económica.
// Las personas morales no tienen cabida directa aquí (representan una entidad,
// no un individuo) — se excluyen y se reporta advertencia si no queda ninguna.
function construirPersonaAviso(c, errores, etiqueta) {
  const nombre = normalizarNombre(c.nombre);
  const apellidoPaterno = normalizarNombre(c.apellidoPaterno);
  const apellidoMaterno = normalizarNombre(c.apellidoMaterno);

  if (!cumple('nombre', nombre)) errores.push(`${etiqueta} (persona_aviso): falta o es inválido el nombre.`);
  if (!cumple('nombre', apellidoPaterno)) errores.push(`${etiqueta} (persona_aviso): falta o es inválido el apellido paterno.`);
  if (!cumple('nombre', apellidoMaterno)) errores.push(`${etiqueta} (persona_aviso): falta o es inválido el apellido materno.`);

  let fechaNac = '';
  if (c.fechaNacimiento) {
    fechaNac = convertirFechaDDMMAAAAaXSD(c.fechaNacimiento);
    if (!fechaNac) errores.push(`${etiqueta} (persona_aviso): fecha_nacimiento "${c.fechaNacimiento}" no tiene formato DD/MM/AAAA válido.`);
  }
  if (c.rfc && !cumple('rfcFisica', c.rfc.toUpperCase())) errores.push(`${etiqueta} (persona_aviso): rfc no cumple el formato de persona física.`);
  if (c.curp && !cumple('curp', c.curp.toUpperCase())) errores.push(`${etiqueta} (persona_aviso): curp no cumple el formato oficial.`);

  return (
    '<persona_aviso>' +
      tag('nombre', nombre) +
      tag('apellido_paterno', apellidoPaterno) +
      tag('apellido_materno', apellidoMaterno) +
      (fechaNac ? tag('fecha_nacimiento', fechaNac) : '') +
      (c.rfc ? tag('rfc', c.rfc.toUpperCase()) : '') +
      (c.curp ? tag('curp', c.curp.toUpperCase()) : '') +
    '</persona_aviso>'
  );
}

// ── tipo_actividad por tipoFEP ─────────────────────────────────────────────────

function construirOtorgamientoPoder(datos, comparecientes, errores) {
  const { grupos, sinRol } = agruparPorRol(comparecientes, '1');
  if (grupos.poderdante.length === 0) errores.push('Falta al menos un compareciente con rol PODERDANTE.');
  if (grupos.apoderado.length === 0) errores.push('Falta al menos un compareciente con rol APODERADO.');
  if (sinRol.length > 0) {
    errores.push(`Compareciente(s) sin rol reconocido para poder (use PODERDANTE o APODERADO): ${sinRol.map(nombreCompareciente).join(', ')}.`);
  }

  const tipoPoder = String(datos.tipoPoder ?? '');
  if (!cumple('digito1', tipoPoder)) {
    errores.push('Falta datosActividad.tipoPoder (dígito 0-9 del catálogo SAT de tipo de poder).');
  }

  const poderdantesXML = grupos.poderdante
    .map((c, i) => `<datos_poderdante>${construirTipoPersona(c, { simple: false }, errores, `Poderdante #${i + 1}`)}</datos_poderdante>`)
    .join('');
  const apoderadosXML = grupos.apoderado
    .map((c, i) => `<datos_apoderado>${tag('tipo_poder', tipoPoder)}${construirTipoPersona(c, { simple: true }, errores, `Apoderado #${i + 1}`)}</datos_apoderado>`)
    .join('');

  return `<otorgamiento_poder>${poderdantesXML}${apoderadosXML}</otorgamiento_poder>`;
}

function construirCesionDerechos(datos, comparecientes, errores) {
  const { grupos, sinRol } = agruparPorRol(comparecientes, '8');
  const cedente = grupos.cedente[0];
  const cesionario = grupos.cesionario[0];
  if (!cedente) errores.push('Falta compareciente con rol CEDENTE.');
  if (!cesionario) errores.push('Falta compareciente con rol CESIONARIO.');
  if (sinRol.length > 0) {
    errores.push(`Compareciente(s) sin rol reconocido (use CEDENTE o CESIONARIO): ${sinRol.map(nombreCompareciente).join(', ')}.`);
  }

  const denom = normalizarDenominacion(datos.denominacionFideicomiso || '');
  if (!cumple('denominacion', denom)) errores.push('Falta datosActividad.denominacionFideicomiso (denominación del fideicomiso).');

  const tipoCesion = String(datos.tipoCesion ?? '');
  if (!cumple('digito1', tipoCesion)) errores.push('Falta datosActividad.tipoCesion (dígito 0-9 del catálogo SAT).');

  const montoCesion = formatMontoXSD(datos.montoCesion);
  if (!montoCesion) errores.push('Falta o es inválido datosActividad.montoCesion.');

  let identificadorXML = '';
  if (datos.identificadorFideicomiso) {
    const ident = normalizarDenominacion(datos.identificadorFideicomiso).slice(0, 40);
    identificadorXML = tag('identificador_fideicomiso', ident);
  }
  let rfcXML = '';
  if (datos.rfcFideicomiso) {
    if (!cumple('rfcMoral', datos.rfcFideicomiso.toUpperCase())) {
      errores.push(`datosActividad.rfcFideicomiso "${datos.rfcFideicomiso}" no cumple el formato de RFC moral.`);
    } else {
      rfcXML = tag('rfc', datos.rfcFideicomiso.toUpperCase());
    }
  }

  return (
    '<cesion_derechos_fideicomitente_fideicomisario>' +
      identificadorXML +
      rfcXML +
      tag('denominacion_razon', denom) +
      tag('tipo_cesion', tipoCesion) +
      `<datos_cedente>${construirTipoPersona(cedente, { simple: false }, errores, 'Cedente')}</datos_cedente>` +
      `<datos_cesionario>${construirTipoPersona(cesionario, { simple: false }, errores, 'Cesionario')}</datos_cesionario>` +
      `<datos_cesion>${tag('monto_cesion', montoCesion || '')}</datos_cesion>` +
    '</cesion_derechos_fideicomitente_fideicomisario>'
  );
}

function construirContratoMutuo(aviso, datos, comparecientes, errores) {
  const { grupos, sinRol } = agruparPorRol(comparecientes, '9');
  if (grupos.acreedor.length === 0) errores.push('Falta al menos un compareciente con rol ACREEDOR.');
  if (grupos.deudor.length === 0) errores.push('Falta al menos un compareciente con rol DEUDOR.');
  if (sinRol.length > 0) {
    errores.push(`Compareciente(s) sin rol reconocido (use ACREEDOR o DEUDOR): ${sinRol.map(nombreCompareciente).join(', ')}.`);
  }

  const tipoOtorgamiento = String(datos.tipoOtorgamiento ?? '');
  if (!cumple('digito1', tipoOtorgamiento)) {
    errores.push('Falta datosActividad.tipoOtorgamiento (dígito 0-9 del catálogo SAT).');
  }

  const monedaCodigo = String(datos.monedaCodigo ?? '');
  if (!/^\d{1,3}$/.test(monedaCodigo)) {
    errores.push('Falta datosActividad.monedaCodigo (código de catálogo SAT de moneda, 1-3 dígitos).');
  }

  const montoOperacion = formatMontoXSD(aviso.monto ?? aviso.montoPrellenado);
  if (!montoOperacion) errores.push('Falta el monto de la operación (aviso.monto).');

  const acreedoresXML = grupos.acreedor
    .map((c, i) => `<datos_acreedor>${construirTipoPersona(c, { simple: false }, errores, `Acreedor #${i + 1}`)}</datos_acreedor>`)
    .join('');
  const deudoresXML = grupos.deudor
    .map((c, i) => `<datos_deudor>${construirTipoPersona(c, { simple: false }, errores, `Deudor #${i + 1}`)}</datos_deudor>`)
    .join('');
  const liquidacionXML = `<datos_liquidacion>${tag('moneda', monedaCodigo)}${tag('monto_operacion', montoOperacion || '')}</datos_liquidacion>`;

  return `<contrato_mutuo_credito>${tag('tipo_otorgamiento', tipoOtorgamiento)}${acreedoresXML}${deudoresXML}${liquidacionXML}</contrato_mutuo_credito>`;
}

function construirTipoActividad(aviso, comparecientes, errores) {
  const datos = aviso.datosActividad || {};
  if (aviso.tipoFEP === '1') return construirOtorgamientoPoder(datos, comparecientes, errores);
  if (aviso.tipoFEP === '8') return construirCesionDerechos(datos, comparecientes, errores);
  if (aviso.tipoFEP === '9') return construirContratoMutuo(aviso, datos, comparecientes, errores);
  errores.push(`tipo_actividad no implementado para tipoFEP="${aviso.tipoFEP}".`);
  return '';
}

// ── Punto de entrada ───────────────────────────────────────────────────────────

/**
 * Genera el XML fep.xsd para un AvisoPLD. Nunca produce un XML parcial:
 * si hay cualquier dato faltante o inválido, lanza PLDXMLError con la
 * lista completa de problemas encontrados (no solo el primero).
 *
 * @param {import('../models/AvisoPLD')} aviso — documento AvisoPLD (Mongoose doc o lean object)
 * @returns {{ xml: string, xmlHash: string }}
 * @throws {PLDXMLError}
 */
function generarXML(aviso) {
  const errores = [];

  if (!TIPOS_SOPORTADOS.includes(aviso.tipoFEP)) {
    throw new PLDXMLError([
      `tipoFEP="${aviso.tipoFEP}" no está soportado todavía por el generador de XML. ` +
      `Soportados: ${TIPOS_SOPORTADOS.join(', ')} (poder irrevocable, cesión de derechos de fideicomiso, mutuo/crédito).`,
    ]);
  }

  const sujetoObligado = getSujetoObligadoConfig();
  errores.push(...sujetoObligado.errores);

  if (!aviso.fechaOperacion) errores.push('Falta fechaOperacion en el aviso.');
  const fechaOperacionXSD = aviso.fechaOperacion ? formatFechaXSD(aviso.fechaOperacion) : null;
  if (aviso.fechaOperacion && !fechaOperacionXSD) errores.push('fechaOperacion no es una fecha válida.');
  const mesReportado = aviso.fechaOperacion ? formatMesReportado(aviso.fechaOperacion) : null;

  const referenciaAviso = limpiarReferenciaAviso(aviso.referenciaOperador);
  if (!cumple('referenciaAviso', referenciaAviso)) {
    errores.push(`referencia_aviso "${referenciaAviso}" (derivado de "${aviso.referenciaOperador}") no cumple el formato requerido.`);
  }

  const instrumento = String(aviso.numeroControl ?? '');
  if (!cumple('folio20', instrumento)) {
    errores.push(`instrumento_publico "${instrumento}" no cumple el formato requerido (folio alfanumérico ≤20 caracteres).`);
  }

  const comparecientes = aviso.comparecientes || [];
  const fisicas = comparecientes.filter((c) => c.tipoPersona !== 'MORAL');
  if (fisicas.length === 0) {
    errores.push('Se requiere al menos un compareciente de tipo FISICA para persona_aviso (las personas morales no aplican aquí).');
  }
  const personaAvisoXML = fisicas
    .map((c, i) => construirPersonaAviso(c, errores, `Compareciente #${i + 1}`))
    .join('');

  const tipoActividadXML = construirTipoActividad(aviso, comparecientes, errores);

  const tipoAlerta = String((aviso.datosActividad && aviso.datosActividad.tipoAlerta) || '');
  if (!/^\d{3,4}$/.test(tipoAlerta)) {
    errores.push(
      'Falta datosActividad.tipoAlerta (código de catálogo SAT/UIF de 3-4 dígitos requerido por <alerta>). ' +
      'Debe capturarse a partir del catálogo oficial vigente — el sistema no asume un valor por default.'
    );
  }

  if (errores.length > 0) {
    throw new PLDXMLError(errores);
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<archivo xmlns="${NS}">` +
      '<informe>' +
        tag('mes_reportado', mesReportado) +
        '<sujeto_obligado>' +
          (sujetoObligado.claveEntidadColegiada ? tag('clave_entidad_colegiada', sujetoObligado.claveEntidadColegiada) : '') +
          tag('clave_sujeto_obligado', sujetoObligado.claveSujetoObligado) +
          tag('clave_actividad', sujetoObligado.claveActividad) +
        '</sujeto_obligado>' +
        '<aviso>' +
          tag('referencia_aviso', referenciaAviso) +
          tag('prioridad', '1') +
          `<alerta>${tag('tipo_alerta', tipoAlerta)}</alerta>` +
          personaAvisoXML +
          '<detalle_operaciones>' +
            '<datos_operacion>' +
              tag('instrumento_publico', instrumento) +
              tag('fecha_operacion', fechaOperacionXSD) +
              `<tipo_actividad>${tipoActividadXML}</tipo_actividad>` +
            '</datos_operacion>' +
          '</detalle_operaciones>' +
        '</aviso>' +
      '</informe>' +
    '</archivo>';

  const xmlHash = crypto.createHash('sha256').update(xml, 'utf8').digest('hex');
  return { xml, xmlHash };
}

module.exports = { generarXML, PLDXMLError, TIPOS_SOPORTADOS };
