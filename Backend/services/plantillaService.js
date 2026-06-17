const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

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

/**
 * Construye el objeto de variables a inyectar en la plantilla Word.
 * Todos los campos devuelven string vacío si el dato no está disponible,
 * para que docxtemplater no rompa en plantillas sin esos placeholders.
 */
function buildVariables(escritura = {}) {
  const numControl  = Number(escritura.numeroControl) || 0;
  const volumen     = escritura.volumen ?? '';
  const abogado     = escritura.abogado ?? '';
  const volNum      = extractVolumenNumero(volumen);
  const fecha       = formatFechaNotarial(escritura.fecha); // "17 de Junio del 2026"
  const fechaComp   = descomponerFecha(escritura.fecha);    // { dia, diaLetras, mes, anio, anioLetras }

  return {
    // ── Pie de página ──────────────────────────────────────────
    NUM_TRAMITE:          formatConComas(numControl),          // "14,004"
    VOLUMEN_ROMANO:       volNum !== null ? numToRoman(volNum) : String(volumen), // "XIII"
    INICIALES:            getIniciales(abogado),               // "AU"

    // ── Sección VI. Registro ───────────────────────────────────
    NUM_TRAMITE_LETRAS:   numToLetras(numControl),             // "catorce mil cuatro"
    LIBRO_LETRAS:         volumenToOrdinalLetras(volumen),     // "Décimo Tercero"

    // ── Fecha compuesta (Ratificación Notarial) ────────────────
    FECHA_DIA:            fechaComp?.dia        ?? '',  // "17"
    FECHA_DIA_LETRAS:     fechaComp?.diaLetras  ?? '',  // "diecisiete"
    FECHA_MES:            fechaComp?.mes        ?? '',  // "junio"
    FECHA_ANIO:           fechaComp?.anio       ?? '',  // "2026"
    FECHA_ANIO_LETRAS:    fechaComp?.anioLetras ?? '',  // "dos mil veintiséis"

    // ── Datos generales (útiles en fases futuras) ──────────────
    ABOGADO:              abogado,
    TIPO_TRAMITE:         escritura.tipoTramite ?? '',
    FECHA:                fecha,
    CLIENTE:              escritura.cliente ?? '',
    NUMERO_CONTROL:       numControl ? String(numControl) : '',
    FOLIO_DESDE:          String(escritura.folioDesde ?? ''),
    FOLIO_HASTA:          String(escritura.folioHasta ?? ''),
    VOLUMEN:              String(volumen),
    VOLUMEN_NUM:          volNum !== null ? String(volNum) : String(volumen),
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
  const templatePath = path.join(TEMPLATES_DIR, fileName);
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

module.exports = { buildVariables, generarDocx, PLANTILLAS_DIR };
