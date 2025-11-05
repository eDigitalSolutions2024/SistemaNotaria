// routes/protocolitos.js
const express = require('express');
const router = express.Router();

const multer = require('multer');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');   // <- nuevo
const dayjs = require('dayjs');          // <- nuevo
const fs   = require('fs');
const path = require('path');

const Protocolito = require('../models/Protocolito');
const Cliente     = require('../models/Cliente');
const Abogado     = require('../models/Abogado');

// === Upload (para /import) ===
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});


// --- buscar logo (png/jpg) en ubicaciones típicas + ENV ---
const LOGO_PATH =
  process.env.PDF_LOGO_PATH || ([
    path.join(__dirname, '..', 'assets', 'logo.png'),
    path.join(__dirname, '..', 'assets', 'logo.jpg'),
    path.join(__dirname, '..', '..', 'frontend', 'public', 'logo.png'),
    path.join(__dirname, '..', '..', 'frontend', 'public', 'logo.jpg'),
    path.join(process.cwd(), 'frontend', 'public', 'logo.png'),
    path.join(process.cwd(), 'frontend', 'public', 'logo.jpg'),
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), 'public', 'logo.jpg'),
  ].find(p => { try { return fs.existsSync(p); } catch { return false; } }));

console.log('[PDF] LOGO_PATH =', LOGO_PATH || 'NO ENCONTRADO');

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

// helpers arriba del archivo routes/protocolitos.js
function parseYMDLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  return new Date(y, mo, d); // ← LOCAL, sin UTC
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

  const byId  = new Map();
  const byKey = new Map();

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
    return raw.nombre || null;
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
    let { tipoTramite, cliente, fecha, abogado, motivo } = req.body;

    // --- Completar desde Cliente (si se manda clienteId) ---
    if (clienteId) {
      // si tu esquema de Cliente tiene la ref, esta populate ayuda cuando venga poblado
      const c = await Cliente.findById(clienteId)
        .populate('abogado_asignado', { nombre: 1 }) // no rompe si no existe la ref
        .lean();
      if (!c) return res.status(404).json({ mensaje: 'Cliente no encontrado' });

      const tipoFromC =
        c.motivo || c.tipoTramite || c.servicio || c.accion;

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
      
    }

    if (!cliente)     return res.status(400).json({ mensaje: 'Falta cliente' });
    if (!tipoTramite) return res.status(400).json({ mensaje: 'Falta tipo de trámite' });

    // --- Fecha robusta (mantén Date en Mongo) ---
    const fechaOk = new Date();

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
      tipoTramite: String(tipoTramite || motivo).trim(),
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
// routes/protocolitos.js  (en el handler PUT /:id)
router.put('/:id', async (req, res) => {
  try {
    const { numeroTramite, tipoTramite, cliente, fecha, abogado, observaciones } = req.body;

    const fechaOk = fecha ? (parseYMDLocal(fecha) || parseFechaLoose(fecha) || new Date(fecha)) : undefined;

    const update = {
      // estos suelen venir siempre desde tu UI de edición
      ...(numeroTramite != null ? { numeroTramite } : {}),
      ...(tipoTramite    ? { tipoTramite } : {}),
      ...(cliente        ? { cliente } : {}),
      ...(fechaOk        ? { fecha: fechaOk } : {}),
      ...(abogado        ? { abogado } : {}),
      // === NUEVO === (solo si viene string)
      ...(typeof observaciones === 'string' ? { observaciones: observaciones.trim() } : {}),
    };

    const updated = await Protocolito.findByIdAndUpdate(
      req.params.id,
      update,
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

/* ============================ EXPORT ============================ */
// GET /protocolito/export?format=excel|pdf&from=YYYY-MM-DD&to=YYYY-MM-DD&cliente=...&abogado=...
router.get('/export', async (req, res) => {
  try {
    // deps locales para no tocar el resto del archivo
    const PDFDocument = require('pdfkit');
    const dayjs = require('dayjs');
    const XLSX = require('xlsx');
    const path = require('path');
    const fs = require('fs');

    const { format = 'excel', from, to, cliente, abogado } = req.query;

    // ---- Filtro ----
    const filter = {};
    if (from || to) {
      filter.fecha = {};
      if (from) filter.fecha.$gte = dayjs(from).startOf('day').toDate();
      if (to)   filter.fecha.$lte = dayjs(to).endOf('day').toDate();
    }
    if (cliente) filter.cliente = { $regex: String(cliente).trim(), $options: 'i' };
    if (abogado) filter.abogado = { $regex: String(abogado).trim(), $options: 'i' };

    // ---- Datos ----
    const docs = await Protocolito.find(filter)
  .collation({ locale: 'es', numericOrdering: true })
  .sort({ numeroTramite: 1 })
  .lean();
  
  const rows = docs.map(d => ({
      numeroTramite: d.numeroTramite ?? '',
      tipoTramite: d.tipoTramite ?? '',
      cliente: d.cliente ?? '',
      fecha: d.fecha ? dayjs(d.fecha).format('DD/MM/YYYY') : '',
      abogado: d.abogado ?? '',
      observaciones: d.observaciones ?? '',
    }));

    const filenameBase = `protocolito_${dayjs().format('YYYYMMDD_HHmm')}`;

    // =========================== PDF ===========================
    if (String(format).toLowerCase() === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);

      const doc = new PDFDocument({ margin: 36 });
      doc.pipe(res);

      // --- buscar logo (png/jpg) en ubicaciones típicas ---
      const LOGO_CANDIDATES = [
        path.join(__dirname, '..', '..', 'frontend', 'public', 'logo.png'),
        path.join(process.cwd(), 'frontend', 'public', 'logo.png'),
      ];
      const LOGO_PATH = LOGO_CANDIDATES.find(p => { try { return fs.existsSync(p); } catch { return false; } });

      // --- Config de página ---
      const PAGE = {
        left: doc.page.margins.left,
        right: doc.page.width - doc.page.margins.right,
        top: doc.page.margins.top,
        bottom: doc.page.height - doc.page.margins.bottom,
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      };

      // Columnas (porcentajes que suman 100%)
      const COLS = [
        { key: 'numeroTramite', title: '# Trámite', width: Math.round(PAGE.width * 0.12) },
        { key: 'tipoTramite',   title: 'Tipo',      width: Math.round(PAGE.width * 0.16) },
        { key: 'cliente',       title: 'Cliente',   width: Math.round(PAGE.width * 0.30) },
        { key: 'fecha',         title: 'Fecha',     width: Math.round(PAGE.width * 0.12) },
        { key: 'abogado',       title: 'Abogado',   width: Math.round(PAGE.width * 0.16) },
        { key: 'observaciones', title: 'Observ.',   width: PAGE.width }, // se corrige abajo
      ];
      const sumExceptLast = COLS.slice(0, -1).reduce((a, c) => a + c.width, 0);
      COLS[COLS.length - 1].width = PAGE.width - sumExceptLast;

      const PADDING_X = 4;
      const HEADER_H = 18;
      const CELL_FONT_SIZE = 9;
      const HEADER_FONT_SIZE = 9;

      // =================== RESUMEN / CONTABILIDAD ===================
      const totalTramites = rows.length;
      const conteoPorAbogado = rows.reduce((acc, r) => {
        const nombre = String(r.abogado || '—').trim().toUpperCase();
        acc[nombre] = (acc[nombre] || 0) + 1;
        return acc;
      }, {});
      const listaAbogados = Object.entries(conteoPorAbogado)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));

      // ================= Encabezado (logo izq + textos der) =================
      function drawLogoLeft(yStart) {
        const MAX_W = Math.min(140, PAGE.width * 0.22);
        const MAX_H = 86;

        try {
          if (LOGO_PATH && fs.existsSync(LOGO_PATH)) {
            const x = PAGE.left;
            const y = yStart + 4;
            doc.image(LOGO_PATH, x, y, { fit: [MAX_W, MAX_H] });
            return { top: yStart, height: MAX_H + 8, bandWidth: MAX_W };
          }
        } catch (e) {
          console.warn('[PDF] No se pudo cargar el logo:', e?.message);
        }
        return { top: yStart, height: 0, bandWidth: MAX_W };
      }

      function drawPageHeader() {
        const TITLE_SIZE = 20;
        const SUB_SIZE   = 11;

        const logo = drawLogoLeft(PAGE.top);

        const gap = 14;
        const xRight = PAGE.left + logo.bandWidth + gap;
        const wRight = PAGE.right - xRight;

        let yRight = PAGE.top + 14;
        doc.fillColor('black')
           .fontSize(TITLE_SIZE)
           .text('Reporte Protocolito', xRight, yRight, { width: wRight, align: 'left' });

        const titleBottom = doc.y + 2;
        const accentW = Math.min(90, wRight * 0.25);
        doc.moveTo(xRight, titleBottom)
           .lineTo(xRight + accentW, titleBottom)
           .lineWidth(2)
           .strokeColor('#999')
           .stroke();
        doc.strokeColor('black').lineWidth(1);

        yRight = titleBottom + 6;
        const filtroTxt1 = [
          from ? `Desde: ${dayjs(from).format('DD/MM/YYYY')}` : null,
          to   ? `Hasta: ${dayjs(to).format('DD/MM/YYYY')}`   : null,
        ].filter(Boolean).join('   |   ');

        const filtroTxt2 = [
          cliente ? `Cliente: ${cliente}` : null,
          abogado ? `Abogado: ${abogado}` : null,
        ].filter(Boolean).join('   |   ');

        const emitido = `Emitido: ${dayjs().format('DD/MM/YYYY HH:mm')}`;

        doc.fontSize(SUB_SIZE).fillColor('#666');
        if (filtroTxt1) {
          doc.text(filtroTxt1, xRight, yRight, { width: wRight, align: 'left' });
          yRight = doc.y + 2;
        }
        if (filtroTxt2) {
          doc.text(filtroTxt2, xRight, yRight, { width: wRight, align: 'left' });
          yRight = doc.y + 2;
        }
        doc.fillColor('#888').text(emitido, xRight, yRight, { width: wRight, align: 'left' });
        const textBottom = doc.y;

        const headerBottom = Math.max(PAGE.top + logo.height, textBottom) + 12;

        doc.moveTo(PAGE.left, headerBottom)
           .lineTo(PAGE.right, headerBottom)
           .lineWidth(0.8)
           .strokeColor('#bbb')
           .stroke();
        doc.strokeColor('black').lineWidth(1);

        return headerBottom + 8;
      }

      // --- Header de tabla ---
      function drawTableHeader(y) {
        doc.fontSize(HEADER_FONT_SIZE);
        let x = PAGE.left;
        COLS.forEach(col => {
          doc.rect(x, y, col.width, HEADER_H).stroke();
          doc.text(col.title, x + PADDING_X, y + 4, { width: col.width - 2 * PADDING_X, align: 'left' });
          x += col.width;
        });
        return y + HEADER_H;
      }

      // --- cálculo de alto por celda ---
      function cellHeight(text, width) {
        const h = doc.heightOfString(String(text ?? ''), {
          width: width - 2 * PADDING_X,
          align: 'left',
          fontSize: CELL_FONT_SIZE,
        });
        return Math.max(h + 6, 16);
      }

      // --- dibujar fila con salto de página si es necesario ---
      function drawRow(y, row) {
        doc.fontSize(CELL_FONT_SIZE);
        const rowH = Math.max(...COLS.map(col => cellHeight(row[col.key], col.width)));
        if (y + rowH > PAGE.bottom) {
          doc.addPage();
          const yHeader = drawPageHeader();
          y = drawTableHeader(yHeader + 8);
        }
        let x = PAGE.left;
        COLS.forEach(col => {
          doc.rect(x, y, col.width, rowH).stroke();
          doc.text(String(row[col.key] ?? ''), x + PADDING_X, y + 3, {
            width: col.width - 2 * PADDING_X,
            align: 'left',
          });
          x += col.width;
        });
        return y + rowH;
      }

      // --- Bloque de Resumen / Contabilidad ---
      function drawResumenContabilidad(yStart) {
        // estimación para checar salto de página
        const estimado = 70 + (listaAbogados.length * 16);
        if (yStart + estimado > PAGE.bottom) {
          doc.addPage();
          yStart = drawPageHeader();
        }

        // Separador
        doc.moveTo(PAGE.left, yStart)
           .lineTo(PAGE.right, yStart)
           .lineWidth(0.8)
           .strokeColor('#bbb')
           .stroke();
        doc.strokeColor('black').lineWidth(1);

        let y = yStart + 10;
        doc.fontSize(12).fillColor('#000')
           .text('Resumen / Contabilidad', PAGE.left, y, { width: PAGE.width, align: 'left' });

        y = doc.y + 6;
        doc.fontSize(10).fillColor('#333')
           .text(`Total de trámites exportados: ${totalTramites}`, PAGE.left, y, { width: PAGE.width });

        y = doc.y + 6;
        doc.fontSize(10).fillColor('#333')
           .text('Trámites por abogado:', PAGE.left, y, { width: PAGE.width });

        y = doc.y + 4;
        doc.fontSize(9).fillColor('#000');
        const indent = 12;

        listaAbogados.forEach(([nombre, cnt]) => {
          doc.text(`• ${nombre} — ${cnt}`, PAGE.left + indent, y, {
            width: PAGE.width - indent,
            align: 'left',
          });
          y = doc.y + 2;
          if (y > PAGE.bottom - 24) {
            doc.addPage();
            y = drawPageHeader() + 8;
            doc.fontSize(9);
          }
        });

        return y;
      }

      // --- Render ---
      const headerBottomY = drawPageHeader();
      let y = drawTableHeader(headerBottomY);
      rows.forEach(r => { y = drawRow(y, r); });

      // NUEVO: resumen/contabilidad al final
      y = drawResumenContabilidad(y + 8);

      doc.end();
      return; // importante: salir para no continuar con Excel
    }

    // =========================== EXCEL ===========================
    const wb = XLSX.utils.book_new();
    const header = ['# Trámite', 'Tipo', 'Cliente', 'Fecha', 'Abogado', 'Observ.'];
    const aoa = [header, ...rows.map(r => [
      r.numeroTramite, r.tipoTramite, r.cliente, r.fecha, r.abogado, r.observaciones
    ])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Protocolito');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
    return res.send(buf);
  } catch (err) {
    console.error('EXPORT PROTOCOLITO ERROR:', err);
    res.status(500).json({ mensaje: 'Error al exportar', detalle: err?.message });
  }
});






/* ===================== ENTREGA (estatus de entrega) ===================== */
/**
 * GET /protocolito/:id/entrega-info
 * Devuelve datos para el modal de entrega: cliente, número y teléfono (si existe).
 * El teléfono se busca en la colección Cliente por nombre (coincidencia exacta
 * y, como respaldo, por regex insensible a mayúsculas) priorizando los más recientes.
 */
router.get('/:id/entrega-info', async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Protocolito.findById(id).lean();
    if (!doc) return res.status(404).json({ mensaje: 'Trámite no encontrado' });

    let telefono = '';
    if (doc.cliente) {
      // 1) intento exacto
      let cli = await Cliente.findOne({ nombre: doc.cliente })
        .sort({ hora_llegada: -1, createdAt: -1 })
        .lean();

      // 2) respaldo: regex i si no hubo match exacto
      if (!cli) {
        cli = await Cliente.findOne({ nombre: { $regex: `^${doc.cliente}$`, $options: 'i' } })
          .sort({ hora_llegada: -1, createdAt: -1 })
          .lean();
      }

      telefono =
        cli?.numero_telefono ||
        cli?.telefono ||
        cli?.celular ||
        '';
    }

    return res.json({
      cliente: doc.cliente || '',
      numeroTramite: doc.numeroTramite || '',
      telefono,
      estatus_entrega: doc.estatus_entrega || 'Pendiente',
      fecha_entrega: doc.fecha_entrega || null,
      notas: doc.notas || ''
    });
  } catch (err) {
    console.error('ENTREGA-INFO ERROR:', err);
    return res.status(500).json({ mensaje: 'Error al obtener información de entrega' });
  }
});

/**
 * POST /protocolito/:id/entregar
 * Marca el trámite como ENTREGADO y guarda fecha_entrega.
 * Opcional: actualiza el teléfono del Cliente si se envía.
 * body: { telefono?: string, notas?: string }
 */
router.post('/:id/entregar', async (req, res) => {
  try {
    const { id } = req.params;
    const { telefono, notas } = req.body || {};

    const updated = await Protocolito.findByIdAndUpdate(
      id,
      {
        estatus_entrega: 'Entregado',
        fecha_entrega: new Date(),
        ...(typeof notas === 'string' ? { notas } : {})
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ mensaje: 'Trámite no encontrado' });

    // Si nos mandan teléfono, lo intentamos guardar en el registro del cliente
    if (telefono && updated.cliente) {
      await Cliente.updateOne(
        { nombre: updated.cliente },
        { $set: { numero_telefono: telefono } }
      ).catch(() => {}); // no interrumpir si falla
    }

    return res.json({
      ok: true,
      estatus_entrega: updated.estatus_entrega,
      fecha_entrega: updated.fecha_entrega,
      notas: updated.notas || ''
    });
  } catch (err) {
    console.error('ENTREGAR ERROR:', err);
    return res.status(500).json({ mensaje: 'No se pudo marcar como entregado' });
  }
});

/**
 * (Opcional) Revertir entrega si te sirve en alguna ocasión:
 * POST /protocolito/:id/revertir-entrega
 */
// router.post('/:id/revertir-entrega', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const updated = await Protocolito.findByIdAndUpdate(
//       id,
//       { estatus_entrega: 'Pendiente', fecha_entrega: null },
//       { new: true }
//     ).lean();
//     if (!updated) return res.status(404).json({ mensaje: 'Trámite no encontrado' });
//     return res.json({ ok: true, estatus_entrega: updated.estatus_entrega });
//   } catch (err) {
//     console.error('REVERTIR ENTREGA ERROR:', err);
//     return res.status(500).json({ mensaje: 'No se pudo revertir la entrega' });
//   }
// });



// POST /protocolito/:id/justificante
router.post('/:id/justificante', /*authMiddleware,*/ async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const usuario =
      (req.user?.nombre || req.user?.name || req.user?.username || 'Sistema');

    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ mensaje: 'El motivo es requerido' });
    }

    const doc = await Protocolito.findByIdAndUpdate(
      id,
      {
        $set: {
          estatus_recibo: 'JUSTIFICADO',
          justificante_text: motivo.trim(),
          justificante_by: usuario,
          justificante_at: new Date()
        }
      },
      { new: true }
    );

    if (!doc) return res.status(404).json({ mensaje: 'Trámite no encontrado' });
    res.json({ ok: true, data: doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al guardar justificante' });
  }
});



module.exports = router;
