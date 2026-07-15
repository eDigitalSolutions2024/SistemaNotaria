'use strict';

const express = require('express');
const router = express.Router();

const Escritura      = require('../models/Escritura');
const ClienteGeneral = require('../models/ClienteGeneral');
const AvisoPLD       = require('../models/AvisoPLD');
const { detectarObligacion }                         = require('../pld/detectorObligacion');
const { requirePermisoPLD, buildFiltroScope }        = require('../pld/roles');
const { generarXML, PLDXMLError }                    = require('../pld/generadorXML');
const catalogoService                                 = require('../pld/catalogos/catalogoService');
const { evaluarEscritura }                            = require('../pld/motor');

// Mismo criterio que pldService.processEscritura(): una Escritura con
// tipoTramite todavía sin capturar no se evalúa — evita ruido en el listado.
const RE_PLACEHOLDER_TRAMITE = /^(por definir|—|-{1,3}|pendiente|sin definir|s\/d)$/i;

// Estados desde los que se puede (re)generar el XML SPPLD
const ESTADOS_PERMITEN_GENERAR_XML = ['PENDIENTE', 'LISTO', 'XML_GENERADO'];

// Estados desde los que ya no se puede editar el aviso — mismo criterio que
// pldService.ESTADOS_INMUTABLES (Backend/pld/pldService.js).
const ESTADOS_INMUTABLES = ['PRESENTADO', 'CANCELADO', 'RECHAZADO_SPPLD'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFechaPLD(date) {
  if (!date) return undefined;
  const d = new Date(date);
  if (isNaN(d)) return undefined;
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// nombre_completo se preserva sin inferencia de partes — separación confirmada por usuario en UI
function buildCompareciente(persona) {
  return {
    tipoPersona:     'FISICA',
    nombreCompleto:  persona.nombre_completo || undefined,
    fechaNacimiento: formatFechaPLD(persona.fecha_nacimiento),
    rfc:             persona.rfc  || undefined,
    curp:            persona.curp || undefined,
    nacionalidad:    'MEXICANA',
    domicilio:       [persona.domicilio, persona.colonia].filter(Boolean).join(', ') || undefined,
    rol:             persona.rol  || undefined,
    clienteGeneralId: String(persona._id),
  };
}

function generarReferenciaOperador(anio, numeroControl) {
  return `NOT-${anio}-${String(numeroControl).padStart(5, '0')}`;
}

function resolverEstadoInicial(deteccion) {
  if (!deteccion.aplica) return 'NO_APLICA';
  if (deteccion.portal === 'DECLARANOT') return 'PENDIENTE_DECLARANOT';
  return 'PENDIENTE';
}

// ── POST /api/pld/detectar/:numeroControl ─────────────────────────────────────
// Detecta obligación de aviso, crea AvisoPLD si no existe, pre-llena comparecientes.
router.post('/detectar/:numeroControl', requirePermisoPLD('puedeDetectar'), async (req, res) => {
  try {
    const numeroControl = Number(req.params.numeroControl);
    if (!Number.isFinite(numeroControl) || numeroControl <= 0) {
      return res.status(400).json({ mensaje: 'numeroControl inválido.' });
    }

    const escritura = await Escritura.findOne({ numeroControl }).lean();
    if (!escritura) {
      return res.status(404).json({ mensaje: `Escritura #${numeroControl} no encontrada.` });
    }

    // Si ya existe un aviso ordinario para esta escritura, devolverlo (idempotente)
    const existente = await AvisoPLD.findOne({ numeroControl, tipoAviso: 'ORDINARIO' }).lean();
    if (existente) {
      return res.json({ creado: false, aviso: existente });
    }

    const deteccion = detectarObligacion(escritura);
    const estadoInicial = resolverEstadoInicial(deteccion);

    const anio = escritura.fecha
      ? new Date(escritura.fecha).getFullYear()
      : new Date().getFullYear();

    const referenciaOperador = generarReferenciaOperador(anio, numeroControl);

    // fechaOperacion + 10 años (Art. 18 Fracc. IV LFPIORPI)
    let fechaExpiracionConservacion;
    if (escritura.fecha) {
      const fe = new Date(escritura.fecha);
      fe.setFullYear(fe.getFullYear() + 10);
      fechaExpiracionConservacion = fe;
    }

    // Pre-cargar comparecientes desde ClienteGeneral
    const clienteNum = Number(escritura.cliente);
    let comparecientes = [];
    if (Number.isFinite(clienteNum) && clienteNum > 0) {
      const personas = await ClienteGeneral
        .find({ clienteId: clienteNum })
        .sort({ createdAt: 1 })
        .lean();
      comparecientes = personas.map(buildCompareciente);
    }

    const usuarioActual = req.user?.nombre || req.user?.id || 'sistema';

    const aviso = new AvisoPLD({
      escrituraId:   escritura._id,
      numeroControl,
      numeroEscritura: escritura.numeroControl,
      tipoAviso:     'ORDINARIO',

      incisoLegal:          deteccion.incisoLegal,
      tipoFEP:              deteccion.tipoFEP,
      descripcionActividad: deteccion.actividad?.nombre,
      confianzaDeteccion:   deteccion.confianza,
      portal:               deteccion.portal,

      monto:           deteccion.monto,
      montoPrellenado: escritura.valorAvaluo ?? null,

      fechaOperacion:   escritura.fecha,
      fechaVencimiento: deteccion.fechaVencimiento,

      referenciaOperador,

      estado: estadoInicial,
      historialEstados: [{
        estadoDesde: 'NINGUNO',
        estadoHasta: estadoInicial,
        evento:      'DETECCION_AUTOMATICA',
        fecha:       new Date(),
        usuario:     usuarioActual,
        nota:        deteccion.razon,
      }],

      comparecientes,

      fechaExpiracionConservacion,
      noAplicaRazon: deteccion.aplica ? undefined : deteccion.razon,
      justificacion: deteccion.razon,

      abogado:   escritura.abogado,
      createdBy: usuarioActual,
      updatedBy: usuarioActual,
    });

    await aviso.save();
    return res.status(201).json({ creado: true, aviso });
  } catch (err) {
    console.error('[pld/detectar]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

// ── GET /api/pld/escrituras-pld ────────────────────────────────────────────────
// Fase 1 del Motor de Reglas: la Escritura es la fuente de verdad, no
// AvisoPLD. Este endpoint NUNCA crea ni modifica un AvisoPLD — solo lee
// Escrituras reales + avisos ya existentes y los cruza en memoria con el
// motor puro (Backend/pld/motor). Si una Escritura ya tiene AvisoPLD, ese
// aviso manda (es la fuente de verdad regulatoria una vez que existe). Si
// no tiene aviso, se evalúa con el motor: aplicaPLD=false → no aparece en
// la lista; true o null (requiere revisión) → aparece con un estado
// sintético, sin escribir nada en Mongo.
router.get('/escrituras-pld', requirePermisoPLD('puedeEditar'), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const filtroScope = buildFiltroScope(req); // {} o { abogado: nombre } — mismo criterio que /avisos

    const [escrituras, avisos] = await Promise.all([
      Escritura.find(filtroScope)
        .select('numeroControl tipoTramite monto valorAvaluo fecha abogado')
        .lean(),
      AvisoPLD.find({ tipoAviso: 'ORDINARIO', ...filtroScope }).lean(),
    ]);

    const avisoPorControl = new Map(avisos.map((a) => [a.numeroControl, a]));

    let evaluadas = 0, aplicaron = 0, fueraDeLista = 0, conAviso = 0, pendientesDeIniciar = 0, requierenRevision = 0;

    const filas = [];
    for (const esc of escrituras) {
      const avisoExistente = avisoPorControl.get(esc.numeroControl);

      // El AvisoPLD, una vez que existe, es la fuente de verdad — no se
      // vuelve a evaluar con el motor aunque la regla vigente haya cambiado.
      if (avisoExistente) {
        conAviso++;
        filas.push({
          escrituraId:     esc._id,
          numeroControl:   esc.numeroControl,
          numeroEscritura: esc.numeroControl, // no existe un folio de escritura separado hoy — mismo valor que numeroControl, igual que ya hace AvisoPLD.numeroEscritura
          tipoTramite:     esc.tipoTramite,
          actividadPLD:    avisoExistente.descripcionActividad ? { id: avisoExistente.incisoLegal, nombre: avisoExistente.descripcionActividad, tipoFEP: avisoExistente.tipoFEP, portal: avisoExistente.portal } : null,
          requiereExpediente: true, // ya existe, no se re-evalúa con el motor: el aviso ya existente es la fuente de verdad
          requiereAviso:   !['NO_APLICA', 'CANCELADO'].includes(avisoExistente.estado),
          fundamentoLegal: null, // este aviso no tiene trazabilidad de regla (se creó antes del Motor de Reglas)
          motivo:          avisoExistente.justificacion ?? null,
          umbral:          null,
          valorAnalizado:  null,
          documentosRequeridos: [],
          datosFaltantes:  [],
          acciones:        [],
          advertencias:    [],
          reglaAplicada:   null,
          versionRegla:    null,
          responsable:     avisoExistente.abogado,
          fechaOperacion:  avisoExistente.fechaOperacion ?? esc.fecha,
          fechaLimite:     avisoExistente.fechaVencimiento,
          avisoPLDId:      avisoExistente._id,
          estado:          avisoExistente.estado,
          tieneExpediente: true,
        });
        continue;
      }

      if (RE_PLACEHOLDER_TRAMITE.test(String(esc.tipoTramite || '').trim())) continue;

      evaluadas++;
      const resultado = evaluarEscritura(esc);

      if (resultado.aplicaPLD === false) {
        fueraDeLista++;
        continue; // certeza de que no aplica -> no aparece
      }

      aplicaron++;
      // aplicaPLD===true -> claramente sujeta, solo falta iniciar el expediente.
      // aplicaPLD===null -> el motor no pudo decidir (dato faltante o trámite
      // no reconocido) -> requiere revisión manual antes de decidir.
      const estadoVirtual = resultado.aplicaPLD === null ? 'REQUIERE_REVISION' : 'SIN_EXPEDIENTE';
      if (estadoVirtual === 'SIN_EXPEDIENTE') pendientesDeIniciar++; else requierenRevision++;

      filas.push({
        escrituraId:     esc._id,
        numeroControl:   esc.numeroControl,
        numeroEscritura: esc.numeroControl,
        tipoTramite:     esc.tipoTramite,
        actividadPLD:    resultado.actividadPLD,
        requiereExpediente: resultado.requiereExpediente,
        requiereAviso:   resultado.requiereAviso,
        fundamentoLegal: resultado.fundamentoLegal,
        motivo:          resultado.motivo,
        umbral:          resultado.umbral,
        valorAnalizado:  resultado.valorAnalizado,
        documentosRequeridos: resultado.documentosRequeridos,
        datosFaltantes:  resultado.datosFaltantes,
        acciones:        resultado.acciones,
        advertencias:    resultado.advertencias,
        reglaAplicada:   resultado.reglaAplicada,
        versionRegla:    resultado.versionRegla,
        responsable:     esc.abogado,
        fechaOperacion:  esc.fecha,
        fechaLimite:     resultado.fechaVencimiento,
        avisoPLDId:      null,
        estado:          estadoVirtual,
        tieneExpediente: false,
      });
    }

    filas.sort((a, b) => {
      const fa = a.fechaLimite ? new Date(a.fechaLimite).getTime() : Infinity;
      const fb = b.fechaLimite ? new Date(b.fechaLimite).getTime() : Infinity;
      return fa - fb;
    });

    const total = filas.length;
    const skip  = (Number(page) - 1) * Number(limit);
    const pagina = filas.slice(skip, skip + Number(limit));

    return res.json({
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
      escrituras: pagina,
      resumen: {
        totalEscrituras: escrituras.length,
        evaluadasPorElMotor: evaluadas,
        aplicaronPLD: aplicaron,
        fueraDeLista,
        conAvisoExistente: conAviso,
        pendientesDeIniciar,
        requierenRevision,
      },
    });
  } catch (err) {
    console.error('[pld/escrituras-pld]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

// ── GET /api/pld/avisos ───────────────────────────────────────────────────────
// Lista avisos. Scope limitado por rol (ADMINISTRADOR / OFICIAL_PLD ven todo;
// resto solo sus propios avisos por abogado).
router.get('/avisos', requirePermisoPLD('puedeEditar'), async (req, res) => {
  try {
    const {
      estado,
      portal,
      confianza,
      abogado: abogadoQuery,
      page  = 1,
      limit = 20,
    } = req.query;

    // Scope base por rol — nunca puede ser sobreescrito por query params para ampliar acceso
    const filtroScope = buildFiltroScope(req);

    const filtro = { ...filtroScope };
    if (estado)        filtro.estado             = estado;
    if (portal)        filtro.portal             = portal;
    if (confianza)     filtro.confianzaDeteccion = confianza;
    // El filtro por abogado vía query solo puede reducir el scope, nunca ampliarlo
    if (abogadoQuery && req.permisos.puedeVerTodo) {
      filtro.abogado = { $regex: abogadoQuery, $options: 'i' };
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await AvisoPLD.countDocuments(filtro);
    const avisos = await AvisoPLD
      .find(filtro)
      .sort({ fechaVencimiento: 1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.json({
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
      avisos,
    });
  } catch (err) {
    console.error('[pld/avisos]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

// ── GET /api/pld/avisos/:id ───────────────────────────────────────────────────
// Detalle de un AvisoPLD. Respeta el scope del usuario.
router.get('/avisos/:id', requirePermisoPLD('puedeEditar'), async (req, res) => {
  try {
    const filtroScope = buildFiltroScope(req);
    const aviso = await AvisoPLD.findOne({ _id: req.params.id, ...filtroScope }).lean();
    if (!aviso) {
      return res.status(404).json({ mensaje: 'Aviso PLD no encontrado.' });
    }
    return res.json(aviso);
  } catch (err) {
    console.error('[pld/avisos/:id]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

// ── PUT /api/pld/avisos/:id/comparecientes ─────────────────────────────────────
// Guardado parcial de la pantalla "Datos generales": reemplaza el arreglo de
// comparecientes del aviso. Endpoint mínimo y de alcance acotado — no expone
// un PATCH genérico del aviso completo, solo lo que esa pantalla edita.
router.put('/avisos/:id/comparecientes', requirePermisoPLD('puedeEditar'), async (req, res) => {
  try {
    const { comparecientes } = req.body || {};
    if (!Array.isArray(comparecientes)) {
      return res.status(400).json({ mensaje: '"comparecientes" debe ser un arreglo.' });
    }

    const filtroScope = buildFiltroScope(req);
    const aviso = await AvisoPLD.findOne({ _id: req.params.id, ...filtroScope });
    if (!aviso) {
      return res.status(404).json({ mensaje: 'Aviso PLD no encontrado.' });
    }
    if (ESTADOS_INMUTABLES.includes(aviso.estado)) {
      return res.status(409).json({ mensaje: `No se puede editar un aviso en estado ${aviso.estado}.` });
    }

    const usuarioActual = req.user?.nombre || req.user?.id || 'sistema';
    aviso.comparecientes = comparecientes;
    aviso.updatedBy = usuarioActual;
    aviso.historialEstados.push({
      estadoDesde: aviso.estado,
      estadoHasta: aviso.estado,
      evento: 'COMPARECIENTES_ACTUALIZADOS',
      fecha: new Date(),
      usuario: usuarioActual,
      nota: `${comparecientes.length} compareciente(s) guardado(s) desde Datos generales.`,
    });

    await aviso.save();
    return res.json({ guardado: true, aviso });
  } catch (err) {
    console.error('[pld/avisos/:id/comparecientes]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

// ── PUT /api/pld/avisos/:id/actividad ──────────────────────────────────────────
// Guardado parcial de la pantalla "Actividad": reemplaza datosActividad.
// Mismo alcance acotado que /comparecientes — no expone un PATCH genérico.
router.put('/avisos/:id/actividad', requirePermisoPLD('puedeEditar'), async (req, res) => {
  try {
    const { datosActividad } = req.body || {};
    if (typeof datosActividad !== 'object' || datosActividad === null || Array.isArray(datosActividad)) {
      return res.status(400).json({ mensaje: '"datosActividad" debe ser un objeto.' });
    }

    const filtroScope = buildFiltroScope(req);
    const aviso = await AvisoPLD.findOne({ _id: req.params.id, ...filtroScope });
    if (!aviso) {
      return res.status(404).json({ mensaje: 'Aviso PLD no encontrado.' });
    }
    if (ESTADOS_INMUTABLES.includes(aviso.estado)) {
      return res.status(409).json({ mensaje: `No se puede editar un aviso en estado ${aviso.estado}.` });
    }

    const usuarioActual = req.user?.nombre || req.user?.id || 'sistema';
    aviso.datosActividad = datosActividad;
    aviso.markModified('datosActividad'); // Mixed: Mongoose no detecta la reasignación sin esto
    aviso.updatedBy = usuarioActual;
    aviso.historialEstados.push({
      estadoDesde: aviso.estado,
      estadoHasta: aviso.estado,
      evento: 'ACTIVIDAD_ACTUALIZADA',
      fecha: new Date(),
      usuario: usuarioActual,
      nota: 'Datos de la actividad guardados desde Actividad.',
    });

    await aviso.save();
    return res.json({ guardado: true, aviso });
  } catch (err) {
    console.error('[pld/avisos/:id/actividad]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

// ── GET /api/pld/catalogos/:catalogoId ─────────────────────────────────────────
// Listado vigente (clave+descripción) de un catálogo oficial SAT/UIF, para
// poblar selects del frontend. ?fecha=YYYY-MM-DD (default: hoy).
router.get('/catalogos/:catalogoId', requirePermisoPLD('puedeEditar'), (req, res) => {
  if (!catalogoService.estaListo()) {
    return res.status(503).json({ mensaje: 'Catálogos PLD no disponibles todavía.' });
  }
  try {
    const fecha = req.query.fecha ? new Date(req.query.fecha) : new Date();
    if (isNaN(fecha)) {
      return res.status(400).json({ mensaje: 'Parámetro "fecha" inválido.' });
    }
    const resultado = catalogoService.listarVigente(req.params.catalogoId, fecha);
    return res.json(resultado);
  } catch (err) {
    console.error('[pld/catalogos/:catalogoId]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

// ── POST /api/pld/avisos/:id/generar-xml ──────────────────────────────────────
// Genera (o regenera) el XML fep.xsd para un AvisoPLD del portal SPPLD.
// No transmite nada al SAT — solo produce el archivo para descarga manual.
router.post('/avisos/:id/generar-xml', requirePermisoPLD('puedePresentar'), async (req, res) => {
  try {
    const filtroScope = buildFiltroScope(req);
    const aviso = await AvisoPLD.findOne({ _id: req.params.id, ...filtroScope });
    if (!aviso) {
      return res.status(404).json({ mensaje: 'Aviso PLD no encontrado.' });
    }
    if (aviso.portal !== 'SPPLD') {
      return res.status(409).json({ mensaje: `El aviso tiene portal="${aviso.portal}"; el generador de XML solo aplica a avisos SPPLD.` });
    }
    if (!ESTADOS_PERMITEN_GENERAR_XML.includes(aviso.estado)) {
      return res.status(409).json({ mensaje: `No se puede generar XML desde el estado actual (${aviso.estado}).` });
    }

    let xml, xmlHash;
    try {
      ({ xml, xmlHash } = generarXML(aviso));
    } catch (err) {
      if (err instanceof PLDXMLError) {
        return res.status(422).json({ mensaje: 'Faltan datos para generar el XML.', errores: err.errores });
      }
      throw err;
    }

    const usuarioActual = req.user?.nombre || req.user?.id || 'sistema';
    const siguienteVersion = (aviso.versionesXML?.length || 0) + 1;

    for (const v of aviso.versionesXML) v.activo = false;
    aviso.versionesXML.push({
      version: siguienteVersion,
      xmlContenido: xml,
      xmlHash,
      fechaGenerado: new Date(),
      generadoPor: usuarioActual,
      activo: true,
    });

    aviso.xmlContenido = xml;
    aviso.xmlHash = xmlHash;
    aviso.xmlFechaGenerado = new Date();
    aviso.xmlVersion = siguienteVersion;

    if (aviso.estado === 'XML_GENERADO') {
      aviso.historialEstados.push({
        estadoDesde: aviso.estado,
        estadoHasta: aviso.estado,
        evento: 'XML_REGENERADO',
        fecha: new Date(),
        usuario: usuarioActual,
        nota: `Versión ${siguienteVersion} del XML regenerada.`,
      });
    } else {
      aviso.registrarTransicion('XML_GENERADO', 'XML_GENERADO', usuarioActual, `Versión ${siguienteVersion} del XML generada.`);
    }

    await aviso.save();
    return res.json({ generado: true, version: siguienteVersion, xmlHash, estado: aviso.estado });
  } catch (err) {
    console.error('[pld/avisos/:id/generar-xml]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

// ── GET /api/pld/avisos/:id/descargar-xml ─────────────────────────────────────
// Descarga la versión activa del XML ya generado (no lo regenera).
router.get('/avisos/:id/descargar-xml', requirePermisoPLD('puedeEditar'), async (req, res) => {
  try {
    const filtroScope = buildFiltroScope(req);
    const aviso = await AvisoPLD.findOne({ _id: req.params.id, ...filtroScope }).lean();
    if (!aviso) {
      return res.status(404).json({ mensaje: 'Aviso PLD no encontrado.' });
    }
    if (!aviso.xmlContenido) {
      return res.status(404).json({ mensaje: 'Este aviso todavía no tiene un XML generado.' });
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${aviso.referenciaOperador || aviso._id}.xml"`);
    return res.send(aviso.xmlContenido);
  } catch (err) {
    console.error('[pld/avisos/:id/descargar-xml]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

module.exports = router;
