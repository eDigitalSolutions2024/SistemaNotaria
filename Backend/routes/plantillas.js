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
  { key: 'poder',        label: 'PPCAAAD Irrevocable',           file: 'PPCAAAD Lim Inm Irrevocable en Acta El a El 202509.docx' },
  { key: 'ratificacion', label: 'PPCAAAD Revocable',    file: 'PPCAAAD Lim Inm Revocable en Acta El a El 202509.docx' },
  
];

// Lista (para poblar el menú en el front)
router.get('/', (req, res) => {
  res.json(MANIFIESTO);
});

// Descarga segura por clave
router.get('/:key/download', (req, res) => {
  const { key } = req.params;
  const item = MANIFIESTO.find(p => p.key === key);
  if (!item) return res.status(404).json({ ok:false, msg:'Plantilla no encontrada' });

  const abs = path.join(PLANTILLAS_DIR, item.file);
  if (!fs.existsSync(abs)) return res.status(404).json({ ok:false, msg:'Archivo no existe' });

  res.setHeader('Content-Disposition', `attachment; filename="${item.file}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  fs.createReadStream(abs).pipe(res);
});

module.exports = router;
