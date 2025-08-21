const express = require('express');
const router = express.Router();
const Protocolito = require('../models/Protocolito');
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Helpers para mapear columnas
const normalize = (s) => String(s || '').trim().toLowerCase();

const FIELD_ALIASES = {
  numeroTramite: ['numero tramite', 'número trámite', 'numero de tramite', 'número de trámite', '# tramite', 'no tramite', 'folio', 'numero', 'número'],
  tipoTramite:   ['tipo tramite', 'tipo de tramite', 'tipo de trámite'],
  cliente:       ['cliente', 'nombre del cliente', 'nombre'],
  fecha:         ['fecha', 'fecha tramite', 'fecha de tramite', 'fecha de trámite'],
  abogado:       ['abogado', 'abogado responsable', 'letrado']
};

function mapColumns(headerRow) {
  // headerRow: array con encabezados originales (en orden)
  const map = {}; // { idx: 'numeroTramite' | 'tipoTramite' | ... }
  headerRow.forEach((h, idx) => {
    const key = normalize(h);
    for (const field in FIELD_ALIASES) {
      if (FIELD_ALIASES[field].some(alias => key === alias)) {
        map[idx] = field;
        break;
      }
    }
  });
  return map;
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val)) return val;
  if (typeof val === 'number') {
    // Fecha serial de Excel
    return XLSX.SSF ? XLSX.SSF.parse_date_code ? (() => {
      const o = XLSX.SSF.parse_date_code(val);
      if (!o) return null;
      return new Date(Date.UTC(o.y, o.m - 1, o.d));
    })() : new Date(Math.round((val - 25569) * 86400 * 1000)) : new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  // Intenta con string
  const tryISO = new Date(val);
  if (!isNaN(tryISO)) return tryISO;

  // dd/mm/yyyy
  const m = String(val).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const y = parseInt(m[3], 10);
    return new Date(y < 100 ? 2000 + y : y, mo, d);
  }
  return null;
}

// LISTAR con búsqueda simple ?q= (por numero, cliente, tipo, abogado)
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    let filter = {};
    if (q && q.trim()) {
      const n = Number(q);
      filter = {
        $or: [
          ...(Number.isFinite(n) ? [{ numeroTramite: n }] : []),
          { cliente: { $regex: q, $options: 'i' } },
          { tipoTramite: { $regex: q, $options: 'i' } },
          { abogado: { $regex: q, $options: 'i' } },
        ]
      };
    }
    const items = await Protocolito.find(filter).sort({ fecha: -1, numeroTramite: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al listar', error: err.message });
  }
});

// CREAR
router.post('/', async (req, res) => {
  try {
    const { numeroTramite, tipoTramite, cliente, fecha, abogado } = req.body;
    if (!numeroTramite || !tipoTramite || !cliente || !fecha || !abogado) {
      return res.status(400).json({ mensaje: 'Todos los campos son obligatorios' });
    }
    const doc = new Protocolito({
      numeroTramite,
      tipoTramite,
      cliente,
      fecha: new Date(fecha),
      abogado
    });
    const saved = await doc.save();
    res.status(201).json(saved);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ mensaje: 'El número de trámite ya existe' });
    }
    res.status(500).json({ mensaje: 'Error al crear', error: err.message });
  }
});

// ACTUALIZAR
router.put('/:id', async (req, res) => {
  try {
    const { numeroTramite, tipoTramite, cliente, fecha, abogado } = req.body;
    const updated = await Protocolito.findByIdAndUpdate(
      req.params.id,
      { numeroTramite, tipoTramite, cliente, fecha: new Date(fecha), abogado },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ mensaje: 'No encontrado' });
    res.json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ mensaje: 'El número de trámite ya existe' });
    }
    res.status(500).json({ mensaje: 'Error al actualizar', error: err.message });
  }
});

// ELIMINAR
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Protocolito.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ mensaje: 'No encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al eliminar', error: err.message });
  }
});



// IMPORTAR EXCEL/CSV
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'Falta el archivo "file"' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return res.status(400).json({ mensaje: 'Hoja no encontrada en el archivo' });

    // Obtenemos todo como matriz (incluye encabezado)
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!aoa.length) return res.status(400).json({ mensaje: 'Hoja vacía' });
    const header = aoa[0];
    const colMap = mapColumns(header);

    // Verifica columnas mínimas
    const required = ['numeroTramite', 'tipoTramite', 'cliente', 'fecha', 'abogado'];
    const missing = required.filter(f => !Object.values(colMap).includes(f));
    if (missing.length) {
      return res.status(400).json({
        mensaje: 'Encabezados faltantes',
        faltantes: missing,
        esperado: ['numero tramite', 'tipo tramite', 'cliente', 'fecha', 'abogado']
      });
    }

    // Construye registros
    const records = [];
    const errors = [];
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i];
      if (!row || row.every(c => String(c).trim() === '')) continue; // fila vacía
      const rec = {};
      for (const idx in colMap) {
        rec[colMap[idx]] = row[idx];
      }

      // Normaliza
      const numero = Number(rec.numeroTramite);
      const fecha = parseDate(rec.fecha);
      if (!numero || isNaN(numero)) {
        errors.push({ fila: i + 1, error: 'numeroTramite inválido' });
        continue;
      }
      if (!fecha) {
        errors.push({ fila: i + 1, error: 'fecha inválida' });
        continue;
      }
      const clean = {
        numeroTramite: numero,
        tipoTramite: String(rec.tipoTramite || '').trim(),
        cliente: String(rec.cliente || '').trim(),
        fecha,
        abogado: String(rec.abogado || '').trim()
      };
      if (!clean.tipoTramite || !clean.cliente || !clean.abogado) {
        errors.push({ fila: i + 1, error: 'Campos vacíos' });
        continue;
      }
      records.push(clean);
    }

    if (!records.length) {
      return res.status(400).json({ mensaje: 'No hay filas válidas para importar', errores: errors });
    }

    // Dedup por numeroTramite (última aparición gana)
    const lastByNum = new Map();
    for (const r of records) lastByNum.set(r.numeroTramite, r);
    const deduped = Array.from(lastByNum.values());

    // Averigua cuáles existen
    const nums = deduped.map(r => r.numeroTramite);
    const existing = await Protocolito.find({ numeroTramite: { $in: nums } }).select('numeroTramite');
    const existSet = new Set(existing.map(e => e.numeroTramite));

    // Bulk upsert
    const ops = deduped.map(r => ({
      updateOne: {
        filter: { numeroTramite: r.numeroTramite },
        update: { $set: r },
        upsert: true
      }
    }));

    const result = await Protocolito.bulkWrite(ops);
    const inserted = result.upsertedCount || 0;
    const updated = result.modifiedCount || 0;

    return res.json({
      ok: true,
      hoja: sheetName,
      recibidas: aoa.length - 1,
      procesadas: deduped.length,
      insertadas: inserted,
      actualizadas: updated,
      errores: errors
    });
  } catch (err) {
    console.error('IMPORT ERROR:', err);
    res.status(500).json({ mensaje: 'Error al importar', error: err.message });
  }
});

// PLANTILLA
router.get('/template', (req, res) => {
  const wb = XLSX.utils.book_new();
  const data = [
    ['numero tramite','tipo tramite','cliente','fecha','abogado'],
    [12345,'poder','Juan Pérez','2025-08-12','Lic. García']
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Protocolito');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="protocolito_template.xlsx"');
  return res.send(buf);
});

module.exports = router;
