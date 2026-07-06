'use strict';

/**
 * Helpers de normalización y validación de formato contra los simpleType
 * definidos en Backend/pld/xsd/fep.xsd. No sustituyen una validación XSD
 * real (no hay librería de validación XSD instalada en el proyecto);
 * cubren los patrones (xsd:pattern) uno a uno para que generadorXML.js
 * pueda rechazar datos mal formados antes de escribir el XML.
 */

const PATTERNS = {
  nombre:        /^[A-ZÑ ]{1,200}$/,
  denominacion:  /^[A-ZÑ\d #\-.&,_@'()]{1,254}$/,
  rfcFisica:     /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/,
  rfcMoral:      /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/,
  curp:          /^[A-Z]{4}\d{6}[MH][A-Z]{5}[0-9]{2}$/,
  pais:          /^[A-Z]{2}$/,
  fecha:         /^\d{8}$/,
  monto:         /^\d{1,14}\.\d{2}$/,
  referenciaAviso: /^[A-ZÑ0-9]{1,14}$/,
  folio20:       /^[A-Z\d\-_]{1,20}$/,
  digito1:       /^\d{1}$/,
  digito7:       /^\d{7}$/,
  mesReportado:  /^\d{4}[01]\d{1}$/,
};

const NACIONALIDAD_A_PAIS = {
  MEXICANA: 'MX',
  MEXICANO: 'MX',
  MEXICO: 'MX',
};

// Mapa explícito de vocales acentuadas — evita depender de normalize('NFD'),
// que descompondría también la Ñ (N + tilde combinante) y la Ñ SÍ es un
// carácter válido en nombre_type/denominacion_razon_type del xsd.
const MAPA_ACENTOS = {
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': 'U',
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u',
};

function stripDiacriticos(str) {
  return String(str || '').replace(/[ÁÉÍÓÚÜáéíóúü]/g, (ch) => MAPA_ACENTOS[ch] || ch);
}

// nombre_type: solo [A-ZÑ ] — sin dígitos ni puntuación
function normalizarNombre(str) {
  const base = stripDiacriticos(str).toUpperCase();
  return base.replace(/[^A-ZÑ ]/g, '').replace(/\s+/g, ' ').trim();
}

// denominacion_razon_type: charset más amplio (dígitos, # - . & , _ @ ' ())
function normalizarDenominacion(str) {
  const base = stripDiacriticos(str).toUpperCase();
  return base.replace(/[^A-ZÑ\d #\-.&,_@'()]/g, '').replace(/\s+/g, ' ').trim();
}

function formatFechaXSD(fecha) {
  const d = new Date(fecha);
  if (isNaN(d)) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// Los compareciente.fechaNacimiento/fechaConstitucion se guardan como texto
// "DD/MM/AAAA" (ver AvisoPLD.js) — el xsd exige fecha_type sin separadores.
function convertirFechaDDMMAAAAaXSD(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str || '').trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}${mm}${dd}`;
}

function formatMesReportado(fecha) {
  const d = new Date(fecha);
  if (isNaN(d)) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}${mm}`;
}

// monto_type exige exactamente 2 decimales, sin separador de miles
function formatMontoXSD(monto) {
  const n = Number(monto);
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

function limpiarReferenciaAviso(referencia) {
  return String(referencia || '').replace(/[^A-ZÑ0-9]/gi, '').toUpperCase().slice(0, 14);
}

function nacionalidadAPais(nacionalidad) {
  const texto = stripDiacriticos(nacionalidad).toUpperCase().trim();
  if (NACIONALIDAD_A_PAIS[texto]) return NACIONALIDAD_A_PAIS[texto];
  if (PATTERNS.pais.test(texto)) return texto;
  return null;
}

function cumple(patronNombre, valor) {
  const patron = PATTERNS[patronNombre];
  if (!patron) throw new Error(`Patrón desconocido: ${patronNombre}`);
  return typeof valor === 'string' && patron.test(valor);
}

module.exports = {
  PATTERNS,
  stripDiacriticos,
  normalizarNombre,
  normalizarDenominacion,
  formatFechaXSD,
  convertirFechaDDMMAAAAaXSD,
  formatMesReportado,
  formatMontoXSD,
  limpiarReferenciaAviso,
  nacionalidadAPais,
  cumple,
};
