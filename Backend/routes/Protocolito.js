// routes/protocolitos.js
const express = require('express');
const router = express.Router();

const multer = require('multer');
const XLSX = require('xlsx');

const Protocolito = require('../models/Protocolito');
const Cliente     = require('../models/Cliente');
const Abogado     = require('../models/Abogado');

// === Upload (para /import) ===
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* ========================== Helpers ========================== */
// --- Import helpers ---
const normalize = (s) => String(s || '').trim().toLowerCase();

const FIELD_ALIASES = {
  numeroTramite: ['numero tramite','número trámite','numero de tramite','número de trámite','# tramite','no tramite','folio','numero','número'],
  tipoTramite:   ['tipo tramite','tipo de tramite','tipo de trámite'],
  cliente:       ['cliente','nombre del cliente','nombre'],
  fecha:         ['fecha','fecha tramite','fecha de tramite','fecha de trámite'],
  abogado:       ['abogado','abogado responsable','letrado'],
};

function mapColumns(headerRow) {
  const map = {};
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
    if (XLSX.SSF && XLSX.SSF.parse_date_code) {
      const o = XLSX.SSF.parse_date_code(val);
      return o ? new Date(Date.UTC(o.y, o.m - 1, o.d)) : null;
    }
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }

  const tryISO = new Date(val);
  if (!isNaN(tryISO)) return tryISO;

  const m = String(val).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const y = parseInt(m[3], 10);
    return new Date(y < 100 ? 2000 + y : y, mo, d);
  }
  return null;
}

// --- Fechas y abogados ---
function parseFechaLoose(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v;

  const iso = new Date(v);
  if (!isNaN(iso)) return iso;

  const s = String(v).trim();
  const rx = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:[ .]*([ap]\.?m?\.?))?$/i;
  const m = s.match(rx);
  if (!m) return null;

  let d  = parseInt(m[1], 10);
  let mo = parseInt(m[2], 10) - 1;
  let y  = parseInt(m[3], 10);
  let hh = parseInt(m[4] || '0', 10);
  let mi = parseInt(m[5] || '0', 10);
  let ss = parseInt(m[6] || '0', 10);
  const ampm = (m[7] || '').toLowerCase();

  if (ampm.startsWith('p') && hh < 12) hh += 12;
  if (ampm.startsWith('a') && hh === 12) hh = 0;

  return new Date(y < 100 ? 2000 + y : y, mo, d, hh, mi, ss);
}

const K = (x) => String(x ?? '').trim().toUpperCase();
const isObjectId = (s) => typeof s === 'string' && /^[0-9a-f]{24}$/i.test(s);

function toISOorString(v) {
  if (v == null) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString();
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function buildAbogadosMap() {
  const rows = await Abogado.find(
    {},
    { _id: 1, nombre: 1, iniciales: 1, abreviatura: 1, siglas: 1, codigo: 1, clave: 1, numero: 1, id: 1, abogado_id: 1 }
  ).lean();

  const byId  = new Map(); // _id    -> nombre (completo)
  const byKey = new Map(); // key(*) -> nombre (completo)

  for (const a of rows) {
    const nombre = (a.nombre || '').toString().trim();
    if (!nombre) continue;

    if (a._id) byId.set(String(a._id), nombre);

    const keys = [a.iniciales, a.abreviatura, a.siglas, a.codigo, a.clave, a.numero, a.id, a.abogado_id, a.nombre]
      .filter(Boolean)
      .map(K);

    for (const k of keys) byKey.set(k, nombre);
  }
  return { byId, byKey };
}

async function resolveAbogadoNombre(raw, maps) {
  if (raw == null || raw === '') return null;

  if (typeof raw === 'object' && raw !== null) {
    return raw.nombre || null; // solo nombre completo
  }
  if (typeof raw === 'string' && isObjectId(raw)) {
    const hit = maps.byId.get(String(raw));
    if (hit) return hit;
  }
  const hit = maps.byKey.get(K(raw));
  if (hit) return hit;

  const or = [
    { id: raw }, { codigo: raw }, { numero: raw }, { clave: raw },
    { iniciales: raw }, { abreviatura: raw }, { siglas: raw }, { nombre: raw },
  ];
  if (typeof raw === 'string' && isObjectId(raw)) or.push({ _id: raw });

  const found = await Abogado.findOne({ $or: or }, { nombre: 1 }).lean();
  return found?.nombre || null;
}

router.get('/', async (req, res) => {
  try {
    const { q, sort = 'numero_desc' } = req.query;

    // -------- Filtro --------
    let filter = {};
    if (q && q.trim()) {
      const n = Number(q);
      filter = {
        $or: [
          ...(Number.isFinite(n) ? [{ numeroTramite: n }] : []),
          { cliente:     { $regex: q, $options: 'i' } },
          { tipoTramite: { $regex: q, $options: 'i' } },
          { abogado:     { $regex: q, $options: 'i' } },
          
        ],
      };
    }

    // -------- Orden --------
    const SORTS = {
      fecha_desc:  { fecha: -1, numeroTramite: -1 },
      fecha_asc:   { fecha:  1, numeroTramite:  1 },
      numero_desc: { numeroTramite: -1 },
      numero_asc:  { numeroTramite:  1 },
      abogado_asc: { abogado: 1, fecha: -1, numeroTramite: -1 },
      tipo_asc:    { tipoTramite: 1, fecha: -1, numeroTramite: -1 },
    };
    const sortKey  = String(sort).toLowerCase();
    const sortSpec = SORTS[sortKey] || SORTS.numero_desc;

    // -------- Consulta --------
    const docs = await Protocolito
      .find(filter)
      .sort(sortSpec)
      .collation({ locale: 'es', numericOrdering: true });

    const items = docs.map(d => (d.toObject ? d.toObject() : d));

    // -------- Normalización mínima --------
    for (const r of items) {
      if (!r.id && r._id) r.id = String(r._id);
      // ⬇️ No tocar r.fecha ni r.abogado: se envían crudos desde Mongo
      r.fecha = r.fecha;
      // r.abogado = r.abogado;
    }

    return res.json(items);
  } catch (err) {
    console.error('LIST ERROR:', err);
    return res.status(500).json({ mensaje: 'Error al listar', error: err.message });
  }
});


/* ============================ POST / ============================ */
// Crear desde clienteId (o payload directo) con número autogenerado
router.post('/', async (req, res) => {
  try {
    const { clienteId } = req.body;
    let { tipoTramite, cliente, fecha, abogado } = req.body;

    // --- Completar desde Cliente (si se manda clienteId) ---
    if (clienteId) {
      // si tu esquema de Cliente tiene la ref, esta populate ayuda cuando venga poblado
      const c = await Cliente.findById(clienteId)
        .populate('abogado_asignado', { nombre: 1 }) // no rompe si no existe la ref
        .lean();
      if (!c) return res.status(404).json({ mensaje: 'Cliente no encontrado' });

      const tipoFromC =
        c.servicio || c.tipoTramite || c.accion;

      // toma primero nombre si ya viene poblado, si no el _id, o cualquier otro campo
      let abogadoFromC =
        c.abogado_asignado?.nombre ||
        c.abogado_asignado?._id ||
        c.abogado_id ||
        c.idAbogado ||
        (typeof c.abogado === 'object' ? c.abogado?.nombre || c.abogado?._id : c.abogado) ||
        null;

      const fechaFromC =
        c.hora_llegada || c.fecha || c.createdAt || c.updatedAt;

      cliente     = c.nombre       ?? cliente;
      tipoTramite = tipoFromC      ?? tipoTramite;
      abogado     = abogadoFromC   ?? abogado;
      fecha       = fechaFromC     ?? fecha;
    }

    if (!cliente)     return res.status(400).json({ mensaje: 'Falta cliente' });
    if (!tipoTramite) return res.status(400).json({ mensaje: 'Falta tipo de trámite' });

    // --- Fecha robusta (mantén Date en Mongo) ---
    const fechaOk = (() => {
      if (!fecha) return new Date();
      if (fecha instanceof Date && !isNaN(fecha)) return fecha;
      const d = new Date(fecha);
      return isNaN(d) ? new Date() : d;
    })();

    // --- Resolver SIEMPRE nombre completo del abogado ---
    const maps = await buildAbogadosMap();

    async function resolveNombreAbogado(raw) {
      if (raw == null || raw === '') return null;

      // a) objeto con nombre
      if (typeof raw === 'object' && raw !== null && raw.nombre) {
        return String(raw.nombre).trim();
      }

      // b) si es objeto con _id (ObjectId) o es ObjectId/string -> a string
      const rawStr = raw && raw._id ? String(raw._id) : String(raw);

      // c) ObjectId -> mapa y/o consulta directa
      if (isObjectId(rawStr)) {
        const hit = maps.byId.get(rawStr);
        if (hit) return hit;
        const a = await Abogado.findById(rawStr, { nombre: 1 }).lean();
        if (a?.nombre) return a.nombre;
      }

      // d) claves/códigos/iniciales/nombre
      const hit2 = maps.byKey.get(K(rawStr));
      if (hit2) return hit2;

      // e) último recurso: query directa por varios campos
      const ors = [
        isObjectId(rawStr) ? { _id: rawStr } : null,
        { id: rawStr }, { codigo: rawStr }, { numero: rawStr }, { clave: rawStr },
        { iniciales: rawStr }, { abreviatura: rawStr }, { siglas: rawStr }, { nombre: rawStr },
      ].filter(Boolean);

      const found = await Abogado.findOne({ $or: ors }, { nombre: 1 }).lean();
      return found?.nombre || (rawStr?.trim() || null);
    }

    const abogadoNombre = (await resolveNombreAbogado(abogado)) || '—';

    const payload = {
      tipoTramite: String(tipoTramite).trim(),
      cliente:     String(cliente).trim(),
      fecha:       fechaOk,
      abogado:     String(abogadoNombre).trim(), // <-- se guarda NOMBRE
    };

    // --- Generar consecutivo con reintentos por colisión ---
    const MAX_RETRIES = 7;
    const BASE_DELAY_MS = 10;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const last = await Protocolito
          .findOne({}, { numeroTramite: 1 })
          .sort({ numeroTramite: -1 })
          .lean();

        const siguiente = (Number(last?.numeroTramite) || 0) + 1;

        const created = await Protocolito.create({
          ...payload,
          numeroTramite: siguiente,
        });

        return res.status(201).json(created);
      } catch (err) {
        if (err && err.code === 11000) {
          const jitter = Math.floor(Math.random() * 10);
          const wait = BASE_DELAY_MS * (attempt + 1) + jitter;
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        console.error('CREATE ERROR:', err);
        return res.status(500).json({ mensaje: 'Error al crear', error: err.message });
      }
    }

    return res.status(503).json({ mensaje: 'No se pudo generar el consecutivo. Intente de nuevo.' });
  } catch (err) {
    console.error('CREATE OUTER ERROR:', err);
    return res.status(500).json({ mensaje: 'Error al crear', error: err.message });
  }
});


/* ============================ PUT /:id ============================ */
router.put('/:id', async (req, res) => {
  try {
    const { numeroTramite, tipoTramite, cliente, fecha, abogado } = req.body;

    const fechaOk = fecha ? (parseFechaLoose(fecha) || new Date(fecha)) : undefined;

    const updated = await Protocolito.findByIdAndUpdate(
      req.params.id,
      {
        numeroTramite,
        tipoTramite,
        cliente,
        ...(fechaOk ? { fecha: fechaOk } : {}),
        ...(abogado ? { abogado } : {}),
      },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ mensaje: 'No encontrado' });
    res.json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ mensaje: 'El número de trámite ya existe' });
    }
    console.error('UPDATE ERROR:', err);
    res.status(500).json({ mensaje: 'Error al actualizar', error: err.message });
  }
});

/* ============================ DELETE /:id ============================ */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Protocolito.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ mensaje: 'No encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE ERROR:', err);
    res.status(500).json({ mensaje: 'Error al eliminar', error: err.message });
  }
});

/* ============================ IMPORT ============================ */
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'Falta el archivo "file"' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return res.status(400).json({ mensaje: 'Hoja no encontrada en el archivo' });

    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!aoa.length) return res.status(400).json({ mensaje: 'Hoja vacía' });

    const header = aoa[0];
    const colMap = mapColumns(header);

    const required = ['numeroTramite', 'tipoTramite', 'cliente', 'fecha', 'abogado'];
    const missing = required.filter(f => !Object.values(colMap).includes(f));
    if (missing.length) {
      return res.status(400).json({
        mensaje: 'Encabezados faltantes',
        faltantes: missing,
        esperado: ['numero tramite','tipo tramite','cliente','fecha','abogado'],
      });
    }

    const records = [];
    const errors = [];
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i];
      if (!row || row.every(c => String(c).trim() === '')) continue;

      const rec = {};
      for (const idx in colMap) rec[colMap[idx]] = row[idx];

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
        cliente:      String(rec.cliente || '').trim(),
        fecha,
        abogado:      String(rec.abogado || '').trim(),
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

    // Última aparición por numeroTramite
    const lastByNum = new Map();
    for (const r of records) lastByNum.set(r.numeroTramite, r);
    const deduped = Array.from(lastByNum.values());

    const ops = deduped.map(r => ({
      updateOne: {
        filter: { numeroTramite: r.numeroTramite },
        update: { $set: r },
        upsert: true,
      }
    }));

    const result = await Protocolito.bulkWrite(ops);
    const inserted = result.upsertedCount || 0;
    const updated  = result.modifiedCount || 0;

    return res.json({
      ok: true,
      hoja: sheetName,
      recibidas: aoa.length - 1,
      procesadas: deduped.length,
      insertadas: inserted,
      actualizadas: updated,
      errores: errors,
    });
  } catch (err) {
    console.error('IMPORT ERROR:', err);
    res.status(500).json({ mensaje: 'Error al importar', error: err.message });
  }
});

/* ============================ PLANTILLA ============================ */
router.get('/template', (req, res) => {
  const wb = XLSX.utils.book_new();
  const data = [
    ['numero tramite','tipo tramite','cliente','fecha','abogado'],
    [12345,'poder','Juan Pérez','2025-08-12','Lic. García'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Protocolito');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="protocolito_template.xlsx"');
  return res.send(buf);
});

module.exports = router;
