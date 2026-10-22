// routes/cerveceria.js
// Control de trámites de Cervecería y Controladora — CRUD simple + archivo
// adjunto por trámite. Reemplaza el Excel manual que se llenaba a mano.
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');

const CerveceriaTramite = require('../models/CerveceriaTramite');
const CerveceriaFactura = require('../models/CerveceriaFactura');
const GestionEspecialModulo = require('../models/GestionEspecialModulo');
const auth = require('../middleware/auth');

function esAdmin(req) {
  const role = String(req.user?.role || req.user?.rol || '').toUpperCase();
  return role === 'ADMIN';
}
function puedeFacturar(req) {
  const role = String(req.user?.role || req.user?.rol || '').toUpperCase();
  return ['ADMIN', 'RECEPCION'].includes(role);
}

// La lista de empresas válidas ya no es fija en el código — es el catálogo
// que un ADMIN administra desde la app (GestionEspecialModulo). Por eso
// esto ahora consulta la base en vez de comparar contra un arreglo.
async function validarEmpresa(req, res) {
  const empresa = req.query.empresa || req.body?.empresa;
  const existe = empresa && await GestionEspecialModulo.exists({ nombre: empresa, activo: true });
  if (!existe) {
    res.status(400).json({ mensaje: `"${empresa || ''}" no es un módulo válido o está desactivado.` });
    return null;
  }
  return empresa;
}

const ADJUNTOS_DIR = path.join(__dirname, '..', 'CerveceriaAdjuntos');

const upload = multer({
  dest: path.join(__dirname, '../tmp'),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// Defensa contra el bug que acabamos de pisar: si por un desfase de
// columnas esto recibe una fecha en vez de un número, Number(fecha) da el
// timestamp en milisegundos (un "costo" de billones de pesos) en vez de
// fallar — así que una fecha nunca se trata como número válido aquí.
function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
// "YYYY-MM-DD" (lo que manda <input type="date">) se interpreta como
// medianoche LOCAL, no UTC — si no, en un huso horario atrás de UTC (como
// Chihuahua) la fecha se corre un día para atrás al mostrarla.
function toDateOrNull(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Lee fechas de celda de Excel en varias formas: Date real, resultado de
// fórmula, o texto "dd/mm/aaaa" (así quedan muchas celdas en Excels
// capturados a mano).
function parseFechaCelda(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v.result !== undefined) return parseFechaCelda(v.result);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Las celdas "esclavas" de una fusión (todo salvo la esquina superior
// izquierda) no traen valor propio — hay que leerlo de cell.master.
function leerCeldaFusionada(cell) {
  if (cell && cell.type === ExcelJS.ValueType.Merge && cell.master) return cell.master.value;
  return cell ? cell.value : null;
}

// Guarda un archivo subido por multer (de req.file o de req.files.xxx[0]) en
// disco. `prefijo` distingue el documento propio de la fila del documento
// general compartido, para que no se pisen entre sí en nombre de archivo.
function guardarArchivoSubido(file, tramiteId, prefijo = 'Cerveceria') {
  if (!file) return null;
  if (!fs.existsSync(ADJUNTOS_DIR)) fs.mkdirSync(ADJUNTOS_DIR, { recursive: true });
  const ext = path.extname(file.originalname || '') || '';
  const archivoGuardado = `${prefijo}_${tramiteId}${ext}`;
  fs.copyFileSync(file.path, path.join(ADJUNTOS_DIR, archivoGuardado));
  try { fs.unlinkSync(file.path); } catch { /* best effort */ }
  return { archivoNombre: file.originalname || archivoGuardado, archivoPath: archivoGuardado };
}

// GET /cerveceria?empresa=Cervecería|Controladora&cliente=texto&desde=&hasta=&sinFactura=1
router.get('/', auth, async (req, res) => {
  try {
    const empresa = await validarEmpresa(req, res);
    if (!empresa) return;
    const q = { empresa };
    if (req.query.cliente) {
      q.cliente = { $regex: String(req.query.cliente).trim(), $options: 'i' };
    }
    if (req.query.desde || req.query.hasta) {
      q.fecha = {};
      if (req.query.desde) q.fecha.$gte = new Date(`${req.query.desde}T00:00:00`);
      if (req.query.hasta) q.fecha.$lte = new Date(`${req.query.hasta}T23:59:59`);
    }
    // Para el modal de "nueva factura": solo documentos que aún no pertenecen a ninguna.
    if (req.query.sinFactura === '1') {
      q.facturaId = null;
    }
    const rows = await CerveceriaTramite.find(q)
      .populate('facturaId', 'numeroFactura fecha')
      .sort({ fecha: -1, createdAt: -1 })
      .lean();
    res.json(rows);
  } catch (e) {
    console.error('GET /cerveceria ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo cargar la lista.' });
  }
});

// ───────────────────────── Facturas ─────────────────────────
// Una factura agrupa documentos ya existentes bajo un número real; un
// documento solo puede pertenecer a una factura a la vez.

// GET /cerveceria/facturas?empresa=Cervecería|Controladora
router.get('/facturas', auth, async (req, res) => {
  try {
    const empresa = await validarEmpresa(req, res);
    if (!empresa) return;
    const facturas = await CerveceriaFactura.find({ empresa }).sort({ fecha: -1, createdAt: -1 }).lean();
    const conteos = await CerveceriaTramite.aggregate([
      { $match: { facturaId: { $in: facturas.map((f) => f._id) } } },
      { $group: { _id: '$facturaId', cantidad: { $sum: 1 } } },
    ]);
    const mapaConteo = Object.fromEntries(conteos.map((c) => [String(c._id), c.cantidad]));
    res.json(facturas.map((f) => ({ ...f, cantidadDocumentos: mapaConteo[String(f._id)] || 0 })));
  } catch (e) {
    console.error('GET /cerveceria/facturas ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo cargar la lista de facturas.' });
  }
});

// GET /cerveceria/facturas/:id — detalle + qué documentos incluye
router.get('/facturas/:id', auth, async (req, res) => {
  try {
    const factura = await CerveceriaFactura.findById(req.params.id).lean();
    if (!factura) return res.status(404).json({ mensaje: 'Factura no encontrada.' });
    const tramites = await CerveceriaTramite.find({ facturaId: factura._id }).sort({ fecha: 1 }).lean();
    res.json({ ...factura, tramites });
  } catch (e) {
    console.error('GET /cerveceria/facturas/:id ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo cargar la factura.' });
  }
});

// POST /cerveceria/facturas  { empresa, numeroFactura, fecha, tramiteIds: [...] }
router.post('/facturas', auth, async (req, res) => {
  try {
    if (!puedeFacturar(req)) return res.status(403).json({ mensaje: 'Solo Recepción o un administrador pueden crear facturas.' });
    const empresa = await validarEmpresa(req, res);
    if (!empresa) return;
    const { numeroFactura, fecha, tramiteIds } = req.body || {};
    if (!numeroFactura || !String(numeroFactura).trim()) {
      return res.status(400).json({ mensaje: 'El número de factura es obligatorio.' });
    }
    const ids = Array.isArray(tramiteIds) ? tramiteIds.filter(Boolean) : [];
    if (ids.length === 0) {
      return res.status(400).json({ mensaje: 'Selecciona al menos un documento para la factura.' });
    }

    const tramites = await CerveceriaTramite.find({ _id: { $in: ids } });
    if (tramites.length !== ids.length) {
      return res.status(400).json({ mensaje: 'Algún documento seleccionado ya no existe.' });
    }
    if (tramites.some((t) => t.empresa !== empresa)) {
      return res.status(400).json({ mensaje: 'Todos los documentos deben ser de la misma empresa.' });
    }
    const yaFacturados = tramites.filter((t) => t.facturaId);
    if (yaFacturados.length) {
      return res.status(400).json({
        mensaje: `${yaFacturados.length} documento(s) seleccionado(s) ya pertenece(n) a otra factura: ${yaFacturados.map((t) => t.tipoDocumento).join(', ')}.`,
      });
    }

    const total = tramites.reduce((acc, t) => acc + (Number(t.costo) || 0), 0);

    const factura = await CerveceriaFactura.create({
      empresa,
      numeroFactura: String(numeroFactura).trim(),
      fecha: toDateOrNull(fecha),
      total,
      creadoPorId: req.user?.id ?? null,
      creadoPorNombre: req.user?.nombre || '',
    });

    await CerveceriaTramite.updateMany({ _id: { $in: ids } }, { $set: { facturaId: factura._id } });

    res.status(201).json(factura);
  } catch (e) {
    console.error('POST /cerveceria/facturas ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo crear la factura.' });
  }
});

// DELETE /cerveceria/facturas/:id — libera (des-factura) sus documentos también
router.delete('/facturas/:id', auth, async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ mensaje: 'Solo un administrador puede eliminar facturas.' });
    const factura = await CerveceriaFactura.findByIdAndDelete(req.params.id);
    if (!factura) return res.status(404).json({ mensaje: 'Factura no encontrada.' });
    await CerveceriaTramite.updateMany({ facturaId: factura._id }, { $set: { facturaId: null } });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /cerveceria/facturas/:id ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo eliminar la factura.' });
  }
});

// ── Exportar a Excel, mismo formato que el Excel manual original: bloques
// verdes "Entrego/Tipo de documento/Hojas/Cantidad/Fecha/Costo" por cada
// entrega, con la fecha fusionada una sola vez por bloque. ──
const VERDE_ENCABEZADO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB7DCC2' } };
const BORDE_FINO = { style: 'thin', color: { argb: 'FF888888' } };
const TODOS_LOS_BORDES = { top: BORDE_FINO, left: BORDE_FINO, bottom: BORDE_FINO, right: BORDE_FINO };

function estilarCelda(cell, { header = false, centrado = false } = {}) {
  cell.border = TODOS_LOS_BORDES;
  cell.alignment = { vertical: 'middle', horizontal: centrado ? 'center' : 'left', wrapText: true };
  if (header) {
    cell.fill = VERDE_ENCABEZADO;
    cell.font = { bold: true };
  }
}

// GET /cerveceria/export?empresa=Cervecería|Controladora&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/export', auth, async (req, res) => {
  try {
    const empresa = await validarEmpresa(req, res);
    if (!empresa) return;
    const q = { empresa };
    if (req.query.desde || req.query.hasta) {
      q.fecha = {};
      if (req.query.desde) q.fecha.$gte = new Date(`${req.query.desde}T00:00:00`);
      if (req.query.hasta) q.fecha.$lte = new Date(`${req.query.hasta}T23:59:59`);
    }
    const rows = await CerveceriaTramite.find(q).sort({ fecha: 1, cliente: 1, createdAt: 1 }).lean();

    // Agrupa en "entregas" (mismo Entrego + misma fecha consecutivos) —
    // reconstruye el mismo bloque que se capturó desde el alta en lote, que
    // es como estaba organizado el Excel original.
    const grupos = [];
    rows.forEach((r) => {
      const key = `${r.cliente}__${r.fecha ? new Date(r.fecha).toISOString().slice(0, 10) : ''}`;
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.key === key) {
        ultimo.items.push(r);
      } else {
        grupos.push({ key, cliente: r.cliente, fecha: r.fecha, items: [r] });
      }
    });

    // Columnas reales (confirmadas contra el Excel original del notario,
    // REGISTRO.V.xlsx): A=Entrego, B:C="Tipo de documento" FUSIONADAS
    // (ocupa 2 columnas), D=Hojas, E=Cantidad, F=Fecha, G=Costo. Antes
    // asumíamos "Tipo de documento" en una sola columna, lo cual recorría
    // Hojas/Cantidad/Fecha/Costo una posición — causaba que una fecha real
    // se leyera como costo al importar (y el export no coincidía con el
    // formato real de la empresa).
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(empresa);
    ws.columns = [
      { key: 'entrego', width: 20 },
      { key: 'tipoDocumento', width: 20 },
      { key: 'tipoDocumento2', width: 20 },
      { key: 'hojas', width: 10 },
      { key: 'cantidad', width: 10 },
      { key: 'fecha', width: 14 },
      { key: 'costo', width: 12 },
    ];

    grupos.forEach((g) => {
      const headerRow = ws.addRow(['Entrego', 'Tipo de documento', 'Tipo de documento', 'Hojas', 'Cantidad', 'Fecha', 'Costo']);
      headerRow.eachCell((cell) => estilarCelda(cell, { header: true }));
      ws.mergeCells(headerRow.number, 2, headerRow.number, 3);

      let filaInicioDatos = null;
      let filaFinDatos = null;
      g.items.forEach((item) => {
        const row = ws.addRow({
          entrego: g.cliente,
          tipoDocumento: item.tipoDocumento,
          hojas: item.hojas ?? '',
          cantidad: item.cantidad ?? '',
          costo: item.costo ?? '',
        });
        ws.mergeCells(row.number, 2, row.number, 3);
        if (filaInicioDatos === null) filaInicioDatos = row.number;
        filaFinDatos = row.number;
        [1, 2, 4, 5, 7].forEach((col) => estilarCelda(row.getCell(col)));
      });

      if (filaInicioDatos !== null) {
        const fechaCell = ws.getRow(filaInicioDatos).getCell(6);
        if (g.fecha) {
          fechaCell.value = new Date(g.fecha);
          fechaCell.numFmt = 'dd/mm/yyyy';
        }
        estilarCelda(fechaCell, { centrado: true });
        if (filaFinDatos > filaInicioDatos) {
          ws.mergeCells(filaInicioDatos, 6, filaFinDatos, 6);
        }
      }
    });

    const nombreArchivo = `control_${empresa.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('GET /cerveceria/export ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo generar el Excel.' });
  }
});

function normalizarTexto(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// POST /cerveceria/import — lee un .xlsx con el formato real confirmado
// contra el Excel del notario: A=Entrego, B:C="Tipo de documento" (2
// columnas fusionadas), D=Hojas, E=Cantidad, F=Fecha, G=Costo (columna G no
// siempre existe — algunas empresas no llevan costo en el Excel). Los
// documentos NUNCA vienen en el Excel — quedan sin archivo adjunto, y la
// tabla ya muestra "Sin archivo" para esos casos.
router.post('/import', auth, upload.single('file'), async (req, res) => {
  try {
    const empresa = await validarEmpresa(req, res);
    if (!empresa) return;
    if (!req.file) return res.status(400).json({ mensaje: 'Sube un archivo .xlsx' });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(req.file.path);
    // El archivo real trae varias hojas (una por empresa/cliente) — se usa
    // la que coincide por nombre con la empresa seleccionada; si no hay
    // coincidencia, se cae a la primera hoja (compatibilidad con archivos
    // de una sola hoja, como los que exporta este mismo sistema).
    const empresaNorm = normalizarTexto(empresa);
    const ws = wb.worksheets.find((w) => normalizarTexto(w.name) === empresaNorm) || wb.worksheets[0];
    if (!ws) return res.status(400).json({ mensaje: 'El Excel no tiene hojas.' });

    const candidatos = [];
    const erroresLectura = [];
    let entregoActual = null;
    let fechaActual = null;

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const colA = String(row.getCell(1).value ?? '').trim();
      const colB = String(row.getCell(2).value ?? '').trim();

      // Fila de encabezado de un nuevo bloque: reinicia Entrego/Fecha.
      if (colA.toLowerCase() === 'entrego') {
        entregoActual = null;
        fechaActual = null;
        return;
      }
      // Sin tipo de documento no es una fila de datos real (vacía, suelta, etc.)
      if (!colB || colB.toLowerCase() === 'tipo de documento') return;

      if (colA) entregoActual = colA;
      const fechaCelda = leerCeldaFusionada(row.getCell(6));
      if (fechaCelda) fechaActual = parseFechaCelda(fechaCelda);

      if (!entregoActual) {
        erroresLectura.push({ fila: rowNumber, error: 'No se encontró "Entrego" (nombre) para esta fila.' });
        return;
      }

      candidatos.push({
        empresa,
        cliente: entregoActual,
        tipoDocumento: colB,
        hojas: toNumberOrNull(row.getCell(4).value),
        cantidad: toNumberOrNull(row.getCell(5).value),
        fecha: fechaActual,
        costo: toNumberOrNull(leerCeldaFusionada(row.getCell(7))),
        creadoPorId: req.user?.id ?? null,
        creadoPorNombre: req.user?.nombre || '',
      });
    });

    let insertadas = 0;
    const errores = [...erroresLectura];
    for (const data of candidatos) {
      try {
        await CerveceriaTramite.create(data);
        insertadas++;
      } catch (err) {
        errores.push({ fila: '—', error: `${data.tipoDocumento} (${data.cliente}): ${err.message}` });
      }
    }

    res.json({ recibidas: candidatos.length, insertadas, errores });
  } catch (e) {
    console.error('POST /cerveceria/import ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo importar el Excel.', detalle: e.message });
  } finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* ya movido o no existe */ } }
  }
});

// POST /cerveceria
router.post('/', auth, upload.fields([{ name: 'documento', maxCount: 1 }, { name: 'documentoGeneral', maxCount: 1 }]), async (req, res) => {
  try {
    const empresa = await validarEmpresa(req, res);
    if (!empresa) return;
    const { cliente, tipoDocumento } = req.body;
    if (!cliente || !String(cliente).trim()) {
      return res.status(400).json({ mensaje: 'Entrego es obligatorio.' });
    }
    if (!tipoDocumento || !String(tipoDocumento).trim()) {
      return res.status(400).json({ mensaje: 'El tipo de documento es obligatorio.' });
    }

    const doc = await CerveceriaTramite.create({
      empresa,
      cliente: String(cliente).trim(),
      tipoDocumento: String(tipoDocumento).trim(),
      hojas: toNumberOrNull(req.body.hojas),
      cantidad: toNumberOrNull(req.body.cantidad),
      fecha: toDateOrNull(req.body.fecha),
      costo: toNumberOrNull(req.body.costo),
      entregaId: req.body.entregaId ? String(req.body.entregaId) : null,
      creadoPorId: req.user?.id ?? null,
      creadoPorNombre: req.user?.nombre || '',
    });

    const archivo = guardarArchivoSubido(req.files?.documento?.[0], doc._id, 'Cerveceria');
    if (archivo) {
      doc.archivoNombre = archivo.archivoNombre;
      doc.archivoPath = archivo.archivoPath;
    }
    const archivoGeneral = guardarArchivoSubido(req.files?.documentoGeneral?.[0], doc._id, 'CerveceriaGeneral');
    if (archivoGeneral) {
      doc.archivoGeneralNombre = archivoGeneral.archivoNombre;
      doc.archivoGeneralPath = archivoGeneral.archivoPath;
    }
    if (archivo || archivoGeneral) await doc.save();

    res.status(201).json(doc);
  } catch (e) {
    console.error('POST /cerveceria ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo guardar el trámite.' });
  } finally {
    Object.values(req.files || {}).flat().forEach((f) => {
      if (f?.path) { try { fs.unlinkSync(f.path); } catch { /* ya movido o no existe */ } }
    });
  }
});

// PUT /cerveceria/:id
router.put('/:id', auth, upload.single('documento'), async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ mensaje: 'Solo un administrador puede editar trámites.' });
    const doc = await CerveceriaTramite.findById(req.params.id);
    if (!doc) return res.status(404).json({ mensaje: 'Trámite no encontrado.' });

    if (req.body.cliente !== undefined) doc.cliente = String(req.body.cliente).trim();
    if (req.body.tipoDocumento !== undefined) doc.tipoDocumento = String(req.body.tipoDocumento).trim();
    if (req.body.hojas !== undefined) doc.hojas = toNumberOrNull(req.body.hojas);
    if (req.body.cantidad !== undefined) doc.cantidad = toNumberOrNull(req.body.cantidad);
    if (req.body.fecha !== undefined) doc.fecha = toDateOrNull(req.body.fecha);
    if (req.body.costo !== undefined) doc.costo = toNumberOrNull(req.body.costo);

    const archivo = guardarArchivoSubido(req.file, doc._id, 'Cerveceria');
    if (archivo) {
      doc.archivoNombre = archivo.archivoNombre;
      doc.archivoPath = archivo.archivoPath;
    }

    await doc.save();
    res.json(doc);
  } catch (e) {
    console.error('PUT /cerveceria/:id ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo actualizar el trámite.' });
  } finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* ya movido o no existe */ } }
  }
});

// PATCH /cerveceria/:id/estatus  { campo: 'entregado'|'firmado', hecho: boolean }
// "facturado" ya no se marca aquí — se obtiene creando/borrando una factura.
router.patch('/:id/estatus', auth, async (req, res) => {
  try {
    const CAMPOS = ['entregado', 'firmado'];
    const { campo, hecho } = req.body || {};
    if (!CAMPOS.includes(campo)) {
      return res.status(400).json({ mensaje: 'Campo de estatus inválido.' });
    }

    const doc = await CerveceriaTramite.findById(req.params.id);
    if (!doc) return res.status(404).json({ mensaje: 'Trámite no encontrado.' });

    doc[campo] = { hecho: Boolean(hecho), fecha: hecho ? new Date() : null };
    await doc.save();
    res.json(doc);
  } catch (e) {
    console.error('PATCH /cerveceria/:id/estatus ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo actualizar el estatus.' });
  }
});

// DELETE /cerveceria/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ mensaje: 'Solo un administrador puede eliminar trámites.' });
    const existente = await CerveceriaTramite.findById(req.params.id).lean();
    if (!existente) return res.status(404).json({ mensaje: 'Trámite no encontrado.' });
    if (existente.facturaId) {
      return res.status(400).json({ mensaje: 'Este documento ya está facturado — quita o elimina la factura primero para poder borrarlo.' });
    }
    const doc = await CerveceriaTramite.findByIdAndDelete(req.params.id);
    [doc.archivoPath, doc.archivoGeneralPath].forEach((p) => {
      if (!p) return;
      const full = path.join(ADJUNTOS_DIR, p);
      try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch { /* best effort */ }
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /cerveceria/:id ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo eliminar el trámite.' });
  }
});

// GET /cerveceria/:id/documento — sin auth: se usa con window.location.href,
// que no puede mandar el header Authorization (mismo patrón que el resto de
// las descargas de archivos del sistema).
// ?modo=inline sirve el archivo sin forzar descarga (para la vista previa en
// el modal — PDFs e imágenes se pueden embeber así); sin el query param se
// comporta como antes, forzando la descarga.
// ?tipo=general trae el documento general compartido de la entrega en vez
// del documento propio de la fila (el default).
router.get('/:id/documento', async (req, res) => {
  try {
    const doc = await CerveceriaTramite.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ mensaje: 'Trámite no encontrado.' });
    const esGeneral = req.query.tipo === 'general';
    const archivoPath = esGeneral ? doc.archivoGeneralPath : doc.archivoPath;
    const archivoNombre = esGeneral ? doc.archivoGeneralNombre : doc.archivoNombre;
    if (!archivoPath) return res.status(404).json({ mensaje: 'No hay documento adjunto.' });
    const full = path.join(ADJUNTOS_DIR, archivoPath);
    if (!fs.existsSync(full)) return res.status(404).json({ mensaje: 'El archivo ya no existe en el servidor.' });
    if (req.query.modo === 'inline') return res.sendFile(full);
    res.download(full, archivoNombre || archivoPath);
  } catch (e) {
    console.error('GET /cerveceria/:id/documento ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo descargar el documento.' });
  }
});

module.exports = router;
