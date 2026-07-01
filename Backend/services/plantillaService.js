const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

/**
 * Resuelve la ruta real de un archivo en `dir` con nombre `filename`,
 * tolerando diferencias de normalización Unicode (NFC vs NFD).
 * En Windows los archivos creados en macOS suelen quedar en NFD,
 * mientras que los strings de JS son NFC.
 */
function resolveFilePath(dir, filename) {
  const nfc = path.join(dir, filename.normalize('NFC'));
  if (fs.existsSync(nfc)) return nfc;
  const nfd = path.join(dir, filename.normalize('NFD'));
  if (fs.existsSync(nfd)) return nfd;
  // fallback: busca en el directorio ignorando normalización
  try {
    const normName = filename.normalize('NFD').toLowerCase();
    const match = fs.readdirSync(dir).find(
      f => f.normalize('NFD').toLowerCase() === normName
    );
    if (match) return path.join(dir, match);
  } catch {}
  return nfc; // devuelve algo; el llamador manejará el not-found
}

const {
  numToRoman,
  numToLetras,
  volumenToOrdinalLetras,
  extractVolumenNumero,
  formatConComas,
  getIniciales,
  formatFechaNotarial,
  descomponerFecha,
} = require('../utils/numUtils');

const PLANTILLAS_DIR  = path.join(__dirname, '..', 'Plantillas');
const TEMPLATES_DIR   = path.join(__dirname, '..', 'PlantillasTemplate');

const MAX_PERSONAS = 6;

function composeLugarNacimiento(ciudad = '', estado = '') {
  const c = String(ciudad || '').trim();
  const e = String(estado || '').trim();
  if (c && e) return `${c}, ${e}`;
  return c || e;
}

function buildPersonaVars(p, prefix) {
  p = p || {};
  return {
    [`${prefix}_ROL`]:             p.rol || '',
    [`${prefix}_NOMBRE`]:          p.nombre_completo || '',
    [`${prefix}_CURP`]:            p.curp || '',
    [`${prefix}_RFC`]:             p.rfc || '',
    [`${prefix}_DOMICILIO`]:       p.domicilio || '',
    [`${prefix}_COLONIA`]:         p.colonia || '',
    [`${prefix}_OCUPACION`]:       p.ocupacion || '',
    [`${prefix}_ESTADO_CIVIL`]:    p.estado_civil || '',
    [`${prefix}_EC_CONYUGUE`]:     p.estado_civil_con_quien || '',
    [`${prefix}_EC_LUGAR_FECHA`]:  p.estado_civil_lugar_fecha || '',
    [`${prefix}_EC_REGIMEN`]:      p.estado_civil_regimen || '',
    [`${prefix}_LUGAR_NACIMIENTO`]: composeLugarNacimiento(p.lugar_nacimiento_ciudad, p.lugar_nacimiento_estado) || p.lugar_nacimiento || '',
    [`${prefix}_FECHA_NACIMIENTO`]: p.fecha_nacimiento ? formatFechaNotarial(p.fecha_nacimiento) : '',
    [`${prefix}_TELEFONO`]:        p.telefono_principal || '',
    [`${prefix}_CORREO`]:          p.correo_electronico || '',
  };
}

/**
 * Construye el objeto de variables a inyectar en la plantilla Word.
 * Todos los campos devuelven string vacío si el dato no está disponible,
 * para que docxtemplater no rompa en plantillas sin esos placeholders.
 *
 * @param {object} escritura  - Documento Escritura de MongoDB
 * @param {Array}  personas   - Array de documentos ClienteGeneral (opcional)
 */
function buildVariables(escritura = {}, personas = []) {
  const numControl  = Number(escritura.numeroControl) || 0;
  const volumen     = escritura.volumen ?? '';
  const abogado     = escritura.abogado ?? '';
  const volNum      = extractVolumenNumero(volumen);
  const fecha       = formatFechaNotarial(escritura.fecha);
  const fechaComp   = descomponerFecha(escritura.fecha);

  // ── Variables por índice: PERSONA1_*, PERSONA2_*, ... PERSONA6_* ──
  const personaIndexVars = {};
  for (let i = 0; i < MAX_PERSONAS; i++) {
    Object.assign(personaIndexVars, buildPersonaVars(personas[i], `PERSONA${i + 1}`));
  }

  // ── Variables por rol semántico (para plantillas de Poder) ──
  const poderdante = personas.find(p => p.rol === 'Poderdante') || null;
  const apoderado  = personas.find(p => p.rol === 'Apoderado')  || null;

  return {
    // ── Pie de página ──────────────────────────────────────────
    NUM_TRAMITE:          formatConComas(numControl),
    VOLUMEN_ROMANO:       volNum !== null ? numToRoman(volNum) : String(volumen),
    INICIALES:            getIniciales(abogado),

    // ── Sección VI. Registro ───────────────────────────────────
    NUM_TRAMITE_LETRAS:   numToLetras(numControl),
    LIBRO_LETRAS:         volumenToOrdinalLetras(volumen),

    // ── Fecha compuesta ────────────────────────────────────────
    FECHA_DIA:            fechaComp?.dia        ?? '',
    FECHA_DIA_LETRAS:     fechaComp?.diaLetras  ?? '',
    FECHA_MES:            fechaComp?.mes        ?? '',
    FECHA_ANIO:           fechaComp?.anio       ?? '',
    FECHA_ANIO_LETRAS:    fechaComp?.anioLetras ?? '',

    // ── Datos de la escritura ──────────────────────────────────
    ABOGADO:              abogado,
    TIPO_TRAMITE:         escritura.tipoTramite ?? '',
    FECHA:                fecha,
    CLIENTE:              escritura.cliente ?? '',
    NUMERO_CONTROL:       numControl ? String(numControl) : '',
    FOLIO_DESDE:          String(escritura.folioDesde ?? ''),
    FOLIO_HASTA:          String(escritura.folioHasta ?? ''),
    VOLUMEN:              String(volumen),
    VOLUMEN_NUM:          volNum !== null ? String(volNum) : String(volumen),
    VOLUMEN_LETRAS:       volNum !== null ? numToLetras(volNum) : String(volumen),

    // ── Personas por índice (EP: Compraventa, Constitución…) ───
    ...personaIndexVars,

    // ── Personas por rol semántico (Poderes) ───────────────────
    ...buildPersonaVars(poderdante, 'PODERDANTE'),
    ...buildPersonaVars(apoderado,  'APODERADO'),
  };
}

/**
 * Carga una plantilla .docx, inyecta las variables y devuelve un Buffer.
 *
 * Busca primero en PlantillasTemplate/ (versión con {{PLACEHOLDERS}} ya inyectados
 * por el script de migración). Si no existe, usa la plantilla original de Plantillas/.
 *
 * docxtemplater reemplaza todos los {{VAR}} en cuerpo, encabezados y pies de página.
 */
function generarDocx(templateAbsPath, variables) {
  const fileName    = path.basename(templateAbsPath);
  const templatePath = resolveFilePath(TEMPLATES_DIR, fileName);
  const filePath    = fs.existsSync(templatePath) ? templatePath : templateAbsPath;

  const content = fs.readFileSync(filePath, 'binary');
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks:    true,
    delimiters:    { start: '{{', end: '}}' },
    nullGetter()   { return ''; },
  });

  doc.render(variables);

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { buildVariables, generarDocx, PLANTILLAS_DIR, TEMPLATES_DIR, resolveFilePath };
