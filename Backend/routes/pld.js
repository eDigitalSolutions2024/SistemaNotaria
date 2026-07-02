'use strict';

const express = require('express');
const router = express.Router();

const Escritura      = require('../models/Escritura');
const ClienteGeneral = require('../models/ClienteGeneral');
const AvisoPLD       = require('../models/AvisoPLD');
const { detectarObligacion } = require('../pld/detectorObligacion');

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFechaPLD(date) {
  if (!date) return undefined;
  const d = new Date(date);
  if (isNaN(d)) return undefined;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function splitNombreCompleto(nombreCompleto) {
  const partes = String(nombreCompleto || '').trim().split(/\s+/);
  if (partes.length === 1) return { nombre: partes[0], apellidoPaterno: '', apellidoMaterno: '' };
  if (partes.length === 2) return { nombre: partes[0], apellidoPaterno: partes[1], apellidoMaterno: '' };
  // Asume: Nombre(s) ApellidoPaterno ApellidoMaterno
  const apellidoMaterno = partes.pop();
  const apellidoPaterno = partes.pop();
  return { nombre: partes.join(' '), apellidoPaterno, apellidoMaterno };
}

function buildCompareciente(persona) {
  const { nombre, apellidoPaterno, apellidoMaterno } = splitNombreCompleto(persona.nombre_completo);
  return {
    tipoPersona:     'FISICA',
    nombre,
    apellidoPaterno,
    apellidoMaterno,
    fechaNacimiento: formatFechaPLD(persona.fecha_nacimiento),
    rfc:             persona.rfc   || undefined,
    curp:            persona.curp  || undefined,
    nacionalidad:    'MEXICANA',
    actividadEconomica: undefined, // debe completarse manualmente (código SAT)
    domicilio:       [persona.domicilio, persona.colonia].filter(Boolean).join(', ') || undefined,
    rol:             persona.rol   || undefined,
    clienteGeneralId: String(persona._id),
  };
}

function generarReferenciaOperador(anio, numeroControl) {
  return `NOT-${anio}-${String(numeroControl).padStart(5, '0')}`;
}

// ── POST /api/pld/detectar/:numeroControl ─────────────────────────────────────
// Detecta obligación de aviso, crea AvisoPLD si no existe, pre-llena comparecientes.
router.post('/detectar/:numeroControl', async (req, res) => {
  try {
    const numeroControl = Number(req.params.numeroControl);
    if (!Number.isFinite(numeroControl) || numeroControl <= 0) {
      return res.status(400).json({ mensaje: 'numeroControl inválido.' });
    }

    const escritura = await Escritura.findOne({ numeroControl }).lean();
    if (!escritura) {
      return res.status(404).json({ mensaje: `Escritura #${numeroControl} no encontrada.` });
    }

    // Si ya existe un aviso ordinario para esta escritura, devolverlo
    const existente = await AvisoPLD.findOne({ numeroControl, tipoAviso: 'ORDINARIO' }).lean();
    if (existente) {
      return res.json({ creado: false, aviso: existente });
    }

    const deteccion = detectarObligacion(escritura);

    // Estado inicial según aplica
    const estadoInicial = deteccion.aplica ? 'PENDIENTE' : 'NO_APLICA';

    const anio = escritura.fecha
      ? new Date(escritura.fecha).getFullYear()
      : new Date().getFullYear();

    const referenciaOperador = generarReferenciaOperador(anio, numeroControl);

    // Calcular fecha de expiración de conservación: fechaOperacion + 10 años (Art. 18 Fracc. IV)
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
        estadoDesde: '',
        estadoHasta: estadoInicial,
        evento:      'DETECCION_AUTOMATICA',
        fecha:       new Date(),
        usuario:     req.user?.email || req.user?.id || 'sistema',
        nota:        deteccion.razon,
      }],

      comparecientes,

      fechaExpiracionConservacion,
      noAplicaRazon: deteccion.aplica ? undefined : deteccion.razon,
      justificacion: deteccion.razon,

      abogado:   escritura.abogado,
      createdBy: req.user?.email || req.user?.id || 'sistema',
      updatedBy: req.user?.email || req.user?.id || 'sistema',
    });

    await aviso.save();
    return res.status(201).json({ creado: true, aviso });
  } catch (err) {
    console.error('[pld/detectar]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

// ── GET /api/pld/avisos ───────────────────────────────────────────────────────
// Lista avisos con filtros opcionales y paginación.
router.get('/avisos', async (req, res) => {
  try {
    const {
      estado,
      abogado,
      portal,
      confianza,
      page = 1,
      limit = 20,
    } = req.query;

    const filtro = {};
    if (estado)    filtro.estado    = estado;
    if (abogado)   filtro.abogado   = { $regex: abogado, $options: 'i' };
    if (portal)    filtro.portal    = portal;
    if (confianza) filtro.confianzaDeteccion = confianza;

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
      page:   Number(page),
      pages:  Math.ceil(total / Number(limit)),
      avisos,
    });
  } catch (err) {
    console.error('[pld/avisos]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

// ── GET /api/pld/avisos/:id ───────────────────────────────────────────────────
// Detalle de un AvisoPLD por su _id de Mongoose.
router.get('/avisos/:id', async (req, res) => {
  try {
    const aviso = await AvisoPLD.findById(req.params.id).lean();
    if (!aviso) {
      return res.status(404).json({ mensaje: 'Aviso PLD no encontrado.' });
    }
    return res.json(aviso);
  } catch (err) {
    console.error('[pld/avisos/:id]', err);
    return res.status(500).json({ mensaje: 'Error interno del servidor.', error: err.message });
  }
});

module.exports = router;
