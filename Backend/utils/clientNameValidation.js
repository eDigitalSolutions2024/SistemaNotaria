// utils/clientNameValidation.js
// Validación de nombres de cliente compartida por clientes.js y presupuestos.js
// (para que un nombre inválido/genérico no pueda colarse por ninguna de las
// dos puertas, ni reutilizarse desde un registro viejo ya existente en la BD).
const Abogado = require('../models/Abogado');

function stripAccents(s = '') {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeName(s = '') {
  return String(s)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'"); // normaliza comillas/apóstrofes raros
}

function isAllSameLetter(word) {
  const w = word.toLowerCase();
  if (w.length < 4) return false; // no penalizar palabras cortas tipo "De", "La"
  return /^([a-zñ])\1+$/.test(w); // aaaa, bbbb...
}

function hasLowCharacterVariety(s) {
  // Si 80% o más de las letras son la misma, es basura (aaaaaa aaaaa)
  const letters = s.toLowerCase().replace(/[^a-zñ]/g, '');
  if (letters.length < 8) return false;

  const freq = {};
  for (const ch of letters) freq[ch] = (freq[ch] || 0) + 1;
  const max = Math.max(...Object.values(freq));
  return (max / letters.length) >= 0.8;
}

function hasSequentialGarbage(s) {
  const x = stripAccents(s).toLowerCase().replace(/\s+/g, '');
  const bad = [
    'asdf', 'qwerty', 'zxcv', '1234', '1111', '0000',
    'abcd', 'aaaa', 'bbbb', 'cccc'
  ];
  return bad.some(b => x.includes(b));
}

// Palabras prohibidas (si aparecen como palabra dentro del nombre)
const BANNED_WORDS = new Set([
  'notario', 'notaria', 'notaría',
  'lic', 'lic.', 'licenciado', 'licenciada',
  'abogado', 'dra', 'dr', 'doctor', 'doctora',
  'juez', 'magistrado', 'secretario',
]);

// Frases prohibidas (si el nombre contiene la frase completa) — fragmentos
// específicos curados a mano para casos ya conocidos de abuso.
const BANNED_PHRASES = [
  'carlos javier espinoza leyva',
  'carlos javier', 'carlos espinoza', 'carlos leyva',
  'javier espinoza', 'javier leyva', 'enrique villalba',
  // Hermanos de la Lic. Gabriela Villalba (abogada dada de alta, id 1002):
  // son abogados reales pero deliberadamente NO se dan de alta en el
  // sistema, así que el chequeo dinámico contra el catálogo Abogado nunca
  // los detecta — se curan a mano, mismo criterio que el notario arriba.
  'iveth villalba', 'villalba iveth',
  'villalba enrique',
];

// Lista negra de tokens
const BANNED_TOKENS = new Set([
  'x', 'xx', 'xxx',
  'test', 'prueba', 'demo',
  'cliente',
  'sinnombre', 'sin', 'nombre',
  'desconocido', 'anonimo', 'anonima',
  'na', 'n/a',
  'asdf', 'qwerty',
  // genéricos de persona
  'particular', 'persona', 'individuo', 'sujeto',
  'fulano', 'mengano', 'zutano', 'perengano',
  // números cardinales
  'uno', 'dos', 'tres', 'cuatro', 'cinco',
  'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince',
  // números ordinales
  'primero', 'primera', 'segundo', 'segunda',
  'tercero', 'tercera', 'cuarto', 'cuarta',
  'quinto', 'quinta', 'sexto', 'sexta',
]);

// Conectores permitidos dentro de nombres/apellidos compuestos
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'mc', 'mac']);

// Títulos/prefijos a ignorar al tokenizar el nombre de un abogado del staff
const TITLE_TOKENS = new Set([
  'lic', 'licda', 'licenciado', 'licenciada',
  'dr', 'dra', 'doctor', 'doctora',
  'ing', 'cp', 'mtro', 'mtra',
]);

function tokenizeName(nombre = '') {
  const sinParentesis = String(nombre).replace(/\([^)]*\)/g, ' '); // ej. "(Recepción)"
  const norm = stripAccents(sinParentesis).toLowerCase();
  return norm
    .split(/\s+/)
    .map(t => t.replace(/[^a-z0-9ñ]/g, ''))
    .filter(Boolean);
}

// Junta de tokens (nombre + apellido/s) por cada abogado/staff activo, para
// bloquear que un cliente se registre con el nombre real de alguien del
// equipo. Solo se usan personas con 2+ tokens significativos (nombre +
// apellido) — un solo token (ej. "FATIMA") es demasiado genérico y generaría
// falsos positivos con clientes reales.
async function getAbogadoNameTokenSets() {
  const abogados = await Abogado.find({}).select('nombre').lean();
  const sets = [];
  for (const a of abogados) {
    const tokens = tokenizeName(a.nombre || '')
      .filter(t => !TITLE_TOKENS.has(t) && !CONNECTORS.has(t) && t.length >= 2);
    if (tokens.length >= 2) sets.push(new Set(tokens));
  }
  return sets;
}

// Núcleo síncrono: recibe los token-sets de abogados ya resueltos, para que
// quien valide muchos nombres seguidos (ej. filtrar un listado completo) no
// dispare una consulta a Abogado por cada uno.
function validateRealClientNameSync(nombre = '', abogadoTokenSets = []) {
  const original = normalizeName(nombre);

  if (!original) {
    return { ok: false, mensaje: 'El nombre del cliente es obligatorio.' };
  }

  // Solo letras (con acentos), espacios, guion y apóstrofe
  const allowed = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;
  if (!allowed.test(original)) {
    return { ok: false, mensaje: 'El nombre solo puede contener letras, espacios, guion y apóstrofe.' };
  }

  if (original.length < 8) {
    return { ok: false, mensaje: 'Captura el nombre completo (mínimo 8 caracteres).' };
  }

  const parts = original.split(' ').filter(Boolean);
  if (parts.length < 2) {
    return { ok: false, mensaje: 'Captura Nombre y Apellido del cliente.' };
  }

  const norm = stripAccents(original).toLowerCase();

  // ✅ Bloqueo por frases completas (contiene)
  for (const phrase of BANNED_PHRASES) {
    const p = stripAccents(phrase).toLowerCase().trim().replace(/\s+/g, ' ');
    if (norm.includes(p)) {
      return { ok: false, mensaje: 'Nombre no permitido. Captura el nombre real del cliente.' };
    }
  }

  const tokens = tokenizeName(original);

  if (tokens.some(t => BANNED_TOKENS.has(t) || BANNED_WORDS.has(t))) {
    return { ok: false, mensaje: 'No se permiten nombres genéricos como "Cliente", "Test", "X", etc o de cargos (Notario/Notaría/Lic, etc).' };
  }

  // Bloqueo "cliente 1" / "cliente x" / "cliente123"
  if (tokens[0] === 'cliente') {
    const second = tokens[1] || '';
    const joined = tokens.join('');
    const isSingleLetter = /^[a-zñ]$/.test(second);
    const isNumber = /^\d+$/.test(second);
    const isClienteNumeroPegado = /^cliente\d+$/.test(joined);
    if (!second || isSingleLetter || isNumber || isClienteNumeroPegado) {
      return { ok: false, mensaje: 'No se permiten nombres tipo "Cliente 1" o "Cliente X". Captura el nombre real.' };
    }
  }

  for (const p of parts) {
    const pNorm = stripAccents(p).toLowerCase().replace(/[^a-zñ]/g, '');
    if (!pNorm) continue;

    if (!CONNECTORS.has(pNorm) && pNorm.length < 2) {
      return { ok: false, mensaje: 'Cada parte del nombre debe tener al menos 2 letras (Nombre y Apellido reales).' };
    }

    if (isAllSameLetter(pNorm)) {
      return { ok: false, mensaje: 'El nombre parece inválido (letras repetidas). Captura el nombre real.' };
    }
  }

  if (hasLowCharacterVariety(original)) {
    return { ok: false, mensaje: 'El nombre parece inválido (relleno). Captura el nombre real.' };
  }

  if (hasSequentialGarbage(original)) {
    return { ok: false, mensaje: 'El nombre parece inválido. Captura el nombre real.' };
  }

  // ✅ Nombre real de un abogado/staff (nombre completo, cualquier orden) —
  // evita que se registre un "cliente" usando el nombre de alguien del equipo.
  const tokenSet = new Set(tokens);
  for (const set of abogadoTokenSets) {
    let allPresent = true;
    for (const t of set) {
      if (!tokenSet.has(t)) { allPresent = false; break; }
    }
    if (allPresent) {
      return { ok: false, mensaje: 'Nombre no permitido. Captura el nombre real del cliente.' };
    }
  }

  return { ok: true, nombreLimpio: original };
}

// Wrapper async: resuelve el roster de abogados y valida un solo nombre.
async function validateRealClientName(nombre = '') {
  const abogadoTokenSets = await getAbogadoNameTokenSets();
  return validateRealClientNameSync(nombre, abogadoTokenSets);
}

module.exports = {
  validateRealClientName,
  validateRealClientNameSync,
  getAbogadoNameTokenSets,
  stripAccents,
};
