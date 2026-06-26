console.log('✅ Cargando routes/plantillas.js');

const path    = require('path');
const fs      = require('fs');
const express = require('express');
const router  = express.Router();

const Escritura = require('../models/Escritura');
const { buildVariables, generarDocx, PLANTILLAS_DIR, TEMPLATES_DIR, resolveFilePath } = require('../services/plantillaService');
const { injectPlaceholders } = require('../services/docxTransformer');

const MANIFIESTO = [
  { id: 'poderirrev',         type: 'poder',        label: 'PPCAAAD Irrevocable',            file: 'PPCAAAD Lim Inm Irrevocable en Acta El a El 202509.docx' },
  { id: 'poderrev',           type: 'poder',        label: 'PPCAAAD Revocable',              file: 'PPCAAAD Lim Inm Revocable en Acta El a El 202509.docx' },
  { id: 'poder-ppc-amplio',   type: 'poder',        label: 'PPC Amplio en Acta',             file: 'PPC Amplio en Acta 202510.docx' },
  { id: 'poder-ppcaa-amplio', type: 'poder',        label: 'PPCAA Amplio en Acta',           file: 'PPCAA Amplio en Acta 202510.docx' },
  { id: 'ratif-vehicular',    type: 'ratificacion', label: 'Ratificación Vehicular',         file: 'Ratificación Vehicular 202510.docx' },
  { id: 'compraventa-simple', type: 'compraventa',  label: 'EP Compraventa Simple',          file: 'EP Compraventa Simple.docx' },
  { id: 'const-srl',          type: 'constitucion', label: 'EP Constitución de S de RL de CV', file: 'EP Constitución de S de RL de CV.docx' },
  { id: 'const-sociedades',   type: 'constitucion', label: 'EP Constitución de Sociedades',  file: 'EP Constitución de Sociedades.docx' },
];

// GET /api/plantillas  →  lista para poblar menús en el front
router.get('/', (req, res) => {
  res.json(MANIFIESTO);
});

// GET /api/plantillas/:id/download  →  descarga la plantilla en blanco (sin datos)
router.get('/:id/download', (req, res) => {
  const item = MANIFIESTO.find(p => p.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, msg: 'Plantilla no encontrada' });

  const abs = resolveFilePath(PLANTILLAS_DIR, item.file);
  if (!fs.existsSync(abs)) return res.status(404).json({ ok: false, msg: 'Archivo no existe' });

  res.setHeader('Content-Disposition', `attachment; filename="${item.file}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  fs.createReadStream(abs).pipe(res);
});

// GET /api/plantillas/:id/generar?escrituraId=xxx
// GET /api/plantillas/:id/generar?numeroTramite=7&volumen=2&abogado=LIC+WILBER+VIDAL
// →  genera el Word con los datos inyectados
router.get('/:id/generar', async (req, res) => {
  const { id } = req.params;
  const { escrituraId, numeroTramite, volumen, abogado } = req.query;

  console.log(`[plantillas/generar] ── id=${id} escrituraId=${escrituraId ?? '—'} numeroTramite=${numeroTramite ?? '—'} volumen=${volumen ?? '—'} abogado=${abogado ?? '—'}`);

  const item = MANIFIESTO.find(p => p.id === id);
  if (!item) {
    console.error(`[plantillas/generar] Plantilla no encontrada: ${id}`);
    return res.status(404).json({ ok: false, msg: 'Plantilla no encontrada' });
  }
  console.log(`[plantillas/generar] Plantilla: ${item.file}`);

  const abs = resolveFilePath(PLANTILLAS_DIR, item.file);
  if (!fs.existsSync(abs)) {
    console.error(`[plantillas/generar] Archivo no existe: ${abs}`);
    return res.status(404).json({ ok: false, msg: 'Archivo no existe' });
  }

  // 1) Buscar escritura en BD (si se proporcionó escrituraId)
  let escrituraData = {};
  if (escrituraId) {
    try {
      const esc = await Escritura.findById(escrituraId).lean();
      if (esc) {
        escrituraData = esc;
        console.log(`[plantillas/generar] Escritura encontrada: control=${esc.numeroControl} volumen=${esc.volumen} abogado=${esc.abogado}`);
      } else {
        console.warn(`[plantillas/generar] escrituraId=${escrituraId} no encontrado en BD`);
      }
    } catch (e) {
      console.error('[plantillas/generar] Error buscando escritura:', e.message);
    }
  }

  // 2) Fallback: usar query params directos (cuando viene de Protocolito)
  if (!escrituraData.numeroControl) {
    if (numeroTramite) escrituraData.numeroControl = Number(numeroTramite);
    if (volumen)       escrituraData.volumen       = volumen;
    if (abogado)       escrituraData.abogado       = abogado;
    console.log(`[plantillas/generar] Usando params directos: control=${escrituraData.numeroControl} volumen=${escrituraData.volumen} abogado=${escrituraData.abogado}`);
  }

  try {
    const variables = buildVariables(escrituraData);
    console.log(`[plantillas/generar] Variables: NUM_TRAMITE=${variables.NUM_TRAMITE} VOLUMEN_ROMANO=${variables.VOLUMEN_ROMANO} INICIALES=${variables.INICIALES}`);

    const buffer   = generarDocx(abs, variables);
    const numCtrl  = escrituraData.numeroControl ?? 'sincontrol';
    const outName  = `${item.label}_${numCtrl}.docx`;

    console.log(`[plantillas/generar] ✅ Generado OK → ${outName}`);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outName)}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  } catch (err) {
    console.error('[plantillas/generar] Error procesando docx:', err.message);
    res.status(500).json({
      ok:  false,
      msg: 'Error al generar el documento. Revisa que la plantilla use {{VARIABLE}} correctamente.',
      detail: err.message,
    });
  }
});

// POST /api/plantillas/migrar
// → Ejecuta la migración automática (inyecta placeholders en todas las plantillas).
//   Solo accesible en desarrollo o desde un rol ADMIN.
router.post('/migrar', async (req, res) => {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR);

    const resultados = [];

    for (const item of MANIFIESTO) {
      const src = resolveFilePath(PLANTILLAS_DIR, item.file);
      if (!fs.existsSync(src)) {
        resultados.push({ file: item.file, ok: false, msg: 'Archivo origen no encontrado' });
        continue;
      }

      try {
        const srcBuffer             = fs.readFileSync(src);
        const { buffer, report }    = injectPlaceholders(srcBuffer);
        const dest                  = path.join(TEMPLATES_DIR, item.file);
        fs.writeFileSync(dest, buffer);
        resultados.push({ file: item.file, ok: true, modified: report.modified });
      } catch (e) {
        resultados.push({ file: item.file, ok: false, msg: e.message });
      }
    }

    const exitosos = resultados.filter(r => r.ok).length;
    res.json({ ok: true, total: MANIFIESTO.length, exitosos, resultados });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
});

module.exports = router;
