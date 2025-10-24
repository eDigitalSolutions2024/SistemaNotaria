// routes/plantillas.js
console.log('✅ Cargando routes/plantillas.js');


const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();

// Directorio donde guardas los .docx
const PLANTILLAS_DIR = path.join(__dirname, '..', 'Plantillas');

// Manifiesto simple (clave legible -> archivo)
const MANIFIESTO = [
  { id: 'poderirrev', type: 'poder',       label: 'PPCAAAD Irrevocable',           file: 'PPCAAAD Lim Inm Irrevocable en Acta El a El 202509.docx' },
  { id: 'poderrev',   type: 'poder',       label: 'PPCAAAD Revocable',             file: 'PPCAAAD Lim Inm Revocable en Acta El a El 202509.docx' },
  { id: 'poder-ppc-amplio',    type: 'poder',       label: 'PPC Amplio en Acta ',     file: 'PPC Amplio en Acta 202510.docx' },
  { id: 'poder-ppcaa-amplio',  type: 'poder',       label: 'PPCAA Amplio en Acta ',   file: 'PPCAA Amplio en Acta 202510.docx' },
  { id: 'ratif-vehicular',     type: 'ratificacion',label: 'Ratificación Vehicular ', file: 'Ratificación Vehicular 202510.docx' },
];

// Lista (para poblar el menú en el front)
router.get('/', (req, res) => {
  res.json(MANIFIESTO);
});

// GET /api/plantillas/:id/download
router.get('/:id/download', (req, res) => {
  const { id } = req.params;
  const item = MANIFIESTO.find(p => p.id === id);
  if (!item) return res.status(404).json({ ok:false, msg:'Plantilla no encontrada' });

  const abs = path.join(PLANTILLAS_DIR, item.file);
  if (!fs.existsSync(abs)) return res.status(404).json({ ok:false, msg:'Archivo no existe' });

  res.setHeader('Content-Disposition', `attachment; filename="${item.file}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  fs.createReadStream(abs).pipe(res);
});

module.exports = router;
