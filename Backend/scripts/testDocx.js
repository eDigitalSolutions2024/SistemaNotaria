'use strict';
const path = require('path');
const fs   = require('fs');
const { buildVariables, generarDocx, PLANTILLAS_DIR } = require('../services/plantillaService');

// Simula exactamente los datos del trámite #8 tal como los devuelve MongoDB
const tramite = {
  _id:           'MONGO_ID_DEL_TRAMITE_8',
  tipoTramite:   'PODER Revocable',
  numeroTramite: 8,
  volumen:       2,
  abogado:       'LIC WILBER VIDAL',
  cliente:       'CLIENTE DE PRUEBA',
  fecha:         new Date('2026-06-17'),
};

const plantillaId   = 'poderrev';
const plantillaFile = 'PPCAAAD Lim Inm Revocable en Acta El a El 202509.docx';
const plantillaLabel = 'PPCAAAD Revocable';

console.log('[DOCX] ── Solicitud recibida ──────────────────────────');
console.log('[DOCX] protocolitoId: ' + tramite._id);
console.log('[DOCX] plantillaId:   ' + plantillaId);
console.log('[DOCX] trámite recibido:  ' + tramite.tipoTramite);
console.log('[DOCX] número:            ' + tramite.numeroTramite);
console.log('[DOCX] volumen:           ' + tramite.volumen);
console.log('[DOCX] abogado:           ' + tramite.abogado);

const srcPath = path.join(PLANTILLAS_DIR, plantillaFile);
console.log('[DOCX] plantilla usada:   ' + srcPath);
console.log('[DOCX] plantilla existe:  ' + fs.existsSync(srcPath));

const escrituraData = {
  numeroControl: tramite.numeroTramite,
  volumen:       String(tramite.volumen),
  abogado:       tramite.abogado,
  tipoTramite:   tramite.tipoTramite,
  cliente:       tramite.cliente,
  fecha:         tramite.fecha,
};

const variables = buildVariables(escrituraData);
console.log('[DOCX] romano:            ' + variables.VOLUMEN_ROMANO);
console.log('[DOCX] iniciales:         ' + variables.INICIALES);

try {
  const buffer  = generarDocx(srcPath, variables);
  const outName = plantillaLabel + '_Tramite' + tramite.numeroTramite + '.docx';
  const outPath = path.join(__dirname, outName);
  fs.writeFileSync(outPath, buffer);
  console.log('[DOCX] archivo generado:  ' + outName + ' (' + buffer.length + ' bytes)');
  console.log('[DOCX] guardado en:       ' + outPath);
  console.log('[DOCX] ✅ Test completado exitosamente');
} catch (err) {
  console.error('[DOCX] ERROR:', err.message);
  process.exit(1);
}
