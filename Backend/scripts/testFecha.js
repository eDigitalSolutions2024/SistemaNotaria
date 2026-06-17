'use strict';
const path = require('path');
const fs   = require('fs');
const PizZip = require('pizzip');
const { buildVariables, generarDocx, PLANTILLAS_DIR } = require('../services/plantillaService');

// Trámite de prueba: numero=8, volumen=2, abogado=LIC WILBER VIDAL, fecha=17/06/2026
const tramite = {
  numeroTramite: 8,
  volumen: 2,
  abogado: 'LIC WILBER VIDAL',
  tipoTramite: 'PODER Revocable',
  cliente: 'CLIENTE DE PRUEBA',
  fecha: new Date('2026-06-17T00:00:00.000Z'),
};

console.log('[DOCX] trámite recibido:   ' + tramite.tipoTramite);
console.log('[DOCX] número:             ' + tramite.numeroTramite);
console.log('[DOCX] volumen:            ' + tramite.volumen);
console.log('[DOCX] abogado:            ' + tramite.abogado);
console.log('[DOCX] fecha almacenada en trámite: ' + tramite.fecha.toISOString());

const escrituraData = {
  numeroControl: tramite.numeroTramite,
  volumen:       String(tramite.volumen),
  abogado:       tramite.abogado,
  tipoTramite:   tramite.tipoTramite,
  cliente:       tramite.cliente,
  fecha:         tramite.fecha,
};

const variables = buildVariables(escrituraData);
console.log('[DOCX] romano:             ' + variables.VOLUMEN_ROMANO);
console.log('[DOCX] iniciales:          ' + variables.INICIALES);
console.log('[DOCX] fecha formateada:   ' + variables.FECHA);
console.log('[DOCX] NUM_TRAMITE:        ' + variables.NUM_TRAMITE);
console.log('[DOCX] NUM_TRAMITE_LETRAS: ' + variables.NUM_TRAMITE_LETRAS);
console.log('[DOCX] LIBRO_LETRAS:       ' + variables.LIBRO_LETRAS);
console.log('[DOCX] FECHA_DIA:          ' + variables.FECHA_DIA);
console.log('[DOCX] FECHA_DIA_LETRAS:   ' + variables.FECHA_DIA_LETRAS);
console.log('[DOCX] FECHA_MES:          ' + variables.FECHA_MES);
console.log('[DOCX] FECHA_ANIO:         ' + variables.FECHA_ANIO);
console.log('[DOCX] FECHA_ANIO_LETRAS:  ' + variables.FECHA_ANIO_LETRAS);
console.log('[DOCX] fecha final generada: el día ' + variables.FECHA_DIA + ' (' + variables.FECHA_DIA_LETRAS + ') del mes de ' + variables.FECHA_MES + ' del año ' + variables.FECHA_ANIO + ' (' + variables.FECHA_ANIO_LETRAS + ')');

const srcPath = path.join(PLANTILLAS_DIR, 'PPCAAAD Lim Inm Revocable en Acta El a El 202509.docx');
const buffer  = generarDocx(srcPath, variables);

// Extraer y verificar los textos reemplazados en el Word generado
const zip      = new PizZip(buffer);
const docText  = zip.files['word/document.xml'].asText().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const footText = zip.files['word/footer2.xml'] ? zip.files['word/footer2.xml'].asText().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '';

const mFecha = docText.match(/Cd\.\s+Ju[aá]rez[^.]*\./i);
console.log('[DOCX] texto reemplazado (fecha):    ' + (mFecha ? mFecha[0].trim() : '⚠ NO ENCONTRADO'));

const mReg = docText.match(/bajo el n[uú]mero[^.]+de Registro/i);
console.log('[DOCX] texto reemplazado (registro): ' + (mReg ? mReg[0].trim().slice(0, 90) : '⚠ NO ENCONTRADO'));

const mFoot = footText.match(/Acta No\.[^\n]{1,60}/i);
console.log('[DOCX] texto reemplazado (pie):      ' + (mFoot ? mFoot[0].trim() : '⚠ NO ENCONTRADO'));

const mRatif = docText.match(/el d[ií]a[^,]{1,120}/i);
console.log('[DOCX] texto reemplazado (ratif):    ' + (mRatif ? mRatif[0].trim().slice(0, 110) : '⚠ NO ENCONTRADO'));

const outPath = path.join(__dirname, 'test_tramite8.docx');
fs.writeFileSync(outPath, buffer);
console.log('');
console.log('[DOCX] ✅ archivo generado: test_tramite8.docx (' + buffer.length + ' bytes)');
console.log('[DOCX] guardado en:        ' + outPath);
