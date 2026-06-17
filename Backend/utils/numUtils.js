// Utilidades numéricas para generación de documentos notariales

const UNIDADES = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];

const DECENAS = [
  '', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta',
  'sesenta', 'setenta', 'ochenta', 'noventa',
];

const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

// Ordinales hasta 35 (suficiente para volúmenes/libros notariales)
const ORDINALES = {
  1:  'Primero',         2:  'Segundo',         3:  'Tercero',
  4:  'Cuarto',          5:  'Quinto',           6:  'Sexto',
  7:  'Séptimo',         8:  'Octavo',           9:  'Noveno',
  10: 'Décimo',
  11: 'Décimo Primero',  12: 'Décimo Segundo',   13: 'Décimo Tercero',
  14: 'Décimo Cuarto',   15: 'Décimo Quinto',    16: 'Décimo Sexto',
  17: 'Décimo Séptimo',  18: 'Décimo Octavo',    19: 'Décimo Noveno',
  20: 'Vigésimo',
  21: 'Vigésimo Primero', 22: 'Vigésimo Segundo', 23: 'Vigésimo Tercero',
  24: 'Vigésimo Cuarto',  25: 'Vigésimo Quinto',  26: 'Vigésimo Sexto',
  27: 'Vigésimo Séptimo', 28: 'Vigésimo Octavo',  29: 'Vigésimo Noveno',
  30: 'Trigésimo',
  31: 'Trigésimo Primero', 32: 'Trigésimo Segundo', 33: 'Trigésimo Tercero',
  34: 'Trigésimo Cuarto',  35: 'Trigésimo Quinto',
};

const ROMAN_VALS = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
const ROMAN_SYMS = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];

/**
 * Convierte un entero positivo a numeración romana.
 * Ejemplos: 13 → 'XIII', 14 → 'XIV', 25 → 'XXV'
 */
function numToRoman(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n <= 0) return '';
  let result = '';
  for (let i = 0; i < ROMAN_VALS.length; i++) {
    while (n >= ROMAN_VALS[i]) {
      result += ROMAN_SYMS[i];
      n -= ROMAN_VALS[i];
    }
  }
  return result;
}

/**
 * Convierte un entero no negativo a letras en español.
 * Ejemplos: 14004 → 'catorce mil cuatro', 10670 → 'diez mil seiscientos setenta'
 */
function numToLetras(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'cero';
  if (n < 0) return 'menos ' + numToLetras(-n);

  if (n < 30) return UNIDADES[n];

  if (n < 100) {
    const dec = Math.floor(n / 10);
    const uni = n % 10;
    return uni === 0 ? DECENAS[dec] : `${DECENAS[dec]} y ${UNIDADES[uni]}`;
  }

  if (n === 100) return 'cien';

  if (n < 1000) {
    const cen = Math.floor(n / 100);
    const resto = n % 100;
    return resto === 0 ? CENTENAS[cen] : `${CENTENAS[cen]} ${numToLetras(resto)}`;
  }

  if (n === 1000) return 'mil';

  // 1001–1999: "mil ..."
  if (n < 2000) {
    const resto = n % 1000;
    return resto === 0 ? 'mil' : `mil ${numToLetras(resto)}`;
  }

  // 2000–999999
  if (n < 1000000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    // "veintiuno" → "veintiún" antes de "mil"; igual para terminados en "uno"
    let prefMiles = numToLetras(miles)
      .replace(/\bveintiuno\b$/, 'veintiún')
      .replace(/(?<!\w)uno$/, 'un');
    const prefijo = `${prefMiles} mil`;
    return resto === 0 ? prefijo : `${prefijo} ${numToLetras(resto)}`;
  }

  // Millones (para completitud, aunque no se usen en folios)
  const mill = Math.floor(n / 1000000);
  const resto = n % 1000000;
  const prefijo = mill === 1 ? 'un millón' : `${numToLetras(mill)} millones`;
  return resto === 0 ? prefijo : `${prefijo} ${numToLetras(resto)}`;
}

/**
 * Extrae el número entero de un string de volumen.
 * Acepta: "13", "Libro 13", "Vol. 13", etc.
 */
function extractVolumenNumero(volumen) {
  const m = String(volumen ?? '').trim().match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Convierte un volumen a su ordinal en letras (para "Libro Décimo Tercero...").
 * Ejemplos: "13" → 'Décimo Tercero', "Libro 20" → 'Vigésimo'
 */
function volumenToOrdinalLetras(volumen) {
  const n = extractVolumenNumero(volumen);
  if (n === null) return String(volumen ?? '');
  return ORDINALES[n] ?? numToLetras(n); // fallback al cardinal si supera el mapa
}

/**
 * Formatea un número con comas de millar estilo es-MX.
 * Ejemplo: 14004 → '14,004'
 */
function formatConComas(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? '');
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Obtiene las iniciales de un nombre: primera letra del primer y último token
 * que no sea un título profesional (LIC, DR, ING, etc.).
 * Ejemplos: "Angel Ulloa" → 'AU', "LIC WILBER VIDAL" → 'WV'
 */
function getIniciales(nombre) {
  const TITULOS = new Set(['LIC', 'LICDA', 'LDA', 'DR', 'DRA', 'ING', 'ARQ', 'MTRO', 'MTRA', 'LIC.', 'DR.', 'ING.', 'ARQ.']);
  const partes = String(nombre ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter(p => !TITULOS.has(p.toUpperCase().replace(/\.$/, '')));
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const MESES_MIN = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

/**
 * Formatea una fecha al estilo notarial: "17 de Junio del 2026".
 * Usa UTC para evitar el desfase de zona horaria cuando la fecha
 * viene de MongoDB como medianoche UTC ("2026-06-17T00:00:00.000Z").
 */
function formatFechaNotarial(fecha) {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return '';
  const dia  = d.getUTCDate();
  const mes  = MESES_ES[d.getUTCMonth()];
  const anio = d.getUTCFullYear();
  return `${dia} de ${mes} del ${anio}`;
}

/**
 * Descompone una fecha en sus partes para el formato jurídico largo:
 * "el día 17 (diecisiete) del mes de junio del año 2026 (dos mil veintiséis)"
 *
 * Devuelve { dia, diaLetras, mes, anio, anioLetras } o null si la fecha es inválida.
 */
function descomponerFecha(fecha) {
  if (!fecha) return null;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const dia  = d.getUTCDate();
  const anio = d.getUTCFullYear();
  return {
    dia:       String(dia),
    diaLetras: numToLetras(dia),
    mes:       MESES_MIN[d.getUTCMonth()],
    anio:      String(anio),
    anioLetras: numToLetras(anio),
  };
}

module.exports = {
  numToRoman,
  numToLetras,
  volumenToOrdinalLetras,
  extractVolumenNumero,
  formatConComas,
  getIniciales,
  formatFechaNotarial,
  descomponerFecha,
};
