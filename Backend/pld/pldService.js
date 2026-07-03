'use strict';

/**
 * pldService — único punto de entrada del módulo PLD hacia el exterior.
 *
 * Toda la lógica LFPIORPI (detección, umbrales, creación de AvisoPLD,
 * transiciones de estado, historial) permanece aquí.
 *
 * API pública:
 *   processEscritura(escrituraId, usuarioId)   → Promise<void>
 *   cancelByEscritura(escrituraId, usuarioId)  → Promise<void>
 *
 * Reutilizable desde escrituras, importaciones masivas, jobs y scripts
 * sin acoplarse al evento que lo invoca.
 * Ambas funciones capturan errores internamente y nunca lanzan al llamador.
 */

const Escritura      = require('../models/Escritura');
const ClienteGeneral = require('../models/ClienteGeneral');
const AvisoPLD       = require('../models/AvisoPLD');
const { detectarObligacion } = require('./detectorObligacion');

// ── Constantes ────────────────────────────────────────────────────────────────

const RE_PLACEHOLDER = /^(por definir|—|-{1,3}|pendiente|sin definir|s\/d)$/i;

// Estados en los que una actualización de Escritura NO debe modificar el aviso
const ESTADOS_INMUTABLES = ['PRESENTADO', 'CANCELADO', 'RECHAZADO_SPPLD'];

// ── Helpers internos ──────────────────────────────────────────────────────────

function formatFechaPLD(date) {
  if (!date) return undefined;
  const d = new Date(date);
  if (isNaN(d)) return undefined;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function buildCompareciente(persona) {
  return {
    tipoPersona:      'FISICA',
    nombreCompleto:   persona.nombre_completo || undefined,
    fechaNacimiento:  formatFechaPLD(persona.fecha_nacimiento),
    rfc:              persona.rfc  || undefined,
    curp:             persona.curp || undefined,
    nacionalidad:     'MEXICANA',
    domicilio:        [persona.domicilio, persona.colonia].filter(Boolean).join(', ') || undefined,
    rol:              persona.rol  || undefined,
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

function calcularFechaConservacion(fechaOperacion) {
  if (!fechaOperacion) return undefined;
  const fe = new Date(fechaOperacion);
  fe.setFullYear(fe.getFullYear() + 10);
  return fe;
}

async function cargarComparecientes(escritura) {
  const clienteNum = Number(escritura.cliente);
  if (!Number.isFinite(clienteNum) || clienteNum <= 0) return [];
  const personas = await ClienteGeneral
    .find({ clienteId: clienteNum })
    .sort({ createdAt: 1 })
    .lean();
  return personas.map(buildCompareciente);
}

// ── Operaciones sobre AvisoPLD ────────────────────────────────────────────────

async function _crearAviso(escritura, deteccion, usuarioId) {
  const estadoInicial = resolverEstadoInicial(deteccion);
  const anio = escritura.fecha
    ? new Date(escritura.fecha).getUTCFullYear()
    : new Date().getUTCFullYear();

  const aviso = new AvisoPLD({
    escrituraId:     escritura._id,
    numeroControl:   escritura.numeroControl,
    numeroEscritura: escritura.numeroControl,
    tipoAviso:       'ORDINARIO',

    incisoLegal:          deteccion.incisoLegal,
    tipoFEP:              deteccion.tipoFEP,
    descripcionActividad: deteccion.actividad?.nombre,
    confianzaDeteccion:   deteccion.confianza,
    portal:               deteccion.portal,

    monto:           null,
    montoPrellenado: escritura.valorAvaluo ?? null,

    fechaOperacion:   escritura.fecha,
    fechaVencimiento: deteccion.fechaVencimiento,

    referenciaOperador: generarReferenciaOperador(anio, escritura.numeroControl),

    estado: estadoInicial,
    historialEstados: [{
      estadoDesde: '',
      estadoHasta: estadoInicial,
      evento:      'DETECCION_AUTOMATICA',
      fecha:       new Date(),
      usuario:     usuarioId,
      nota:        deteccion.razon,
    }],

    comparecientes: await cargarComparecientes(escritura),

    fechaExpiracionConservacion: calcularFechaConservacion(escritura.fecha),
    noAplicaRazon: deteccion.aplica ? undefined : deteccion.razon,
    justificacion:  deteccion.razon,

    abogado:   escritura.abogado,
    createdBy: usuarioId,
    updatedBy: usuarioId,
  });

  await aviso.save();
}

async function _actualizarAviso(aviso, escritura, deteccion, usuarioId) {
  const estadoObjetivo = resolverEstadoInicial(deteccion);

  aviso.incisoLegal          = deteccion.incisoLegal;
  aviso.tipoFEP              = deteccion.tipoFEP;
  aviso.descripcionActividad = deteccion.actividad?.nombre;
  aviso.confianzaDeteccion   = deteccion.confianza;
  aviso.portal               = deteccion.portal;
  aviso.fechaVencimiento     = deteccion.fechaVencimiento;
  aviso.montoPrellenado      = escritura.valorAvaluo ?? null;
  aviso.abogado              = escritura.abogado;
  aviso.updatedBy            = usuarioId;

  if (escritura.fecha) {
    aviso.fechaOperacion              = escritura.fecha;
    aviso.fechaExpiracionConservacion = calcularFechaConservacion(escritura.fecha);
  }

  if (aviso.estado !== estadoObjetivo) {
    aviso.registrarTransicion(estadoObjetivo, 'ESCRITURA_ACTUALIZADA', usuarioId, deteccion.razon);
  } else {
    aviso.historialEstados.push({
      estadoDesde: aviso.estado,
      estadoHasta: aviso.estado,
      evento:      'DATOS_ACTUALIZADOS',
      fecha:       new Date(),
      usuario:     usuarioId,
      nota:        deteccion.razon,
    });
  }

  await aviso.save();
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Evalúa y sincroniza el AvisoPLD para una Escritura creada o actualizada.
 * Reutilizable desde escrituras, importaciones, jobs y scripts.
 *
 * @param {string|import('mongoose').Types.ObjectId} escrituraId
 * @param {string} [usuarioId='sistema']
 */
async function processEscritura(escrituraId, usuarioId = 'sistema') {
  try {
    const escritura = await Escritura.findById(escrituraId).lean();
    if (!escritura) return;

    if (RE_PLACEHOLDER.test(String(escritura.tipoTramite || '').trim())) return;

    const deteccion = detectarObligacion(escritura);

    const aviso = await AvisoPLD.findOne({
      escrituraId: escritura._id,
      tipoAviso:   'ORDINARIO',
    });

    if (!aviso) {
      if (deteccion.aplica || deteccion.confianza === 'REQUIERE_REVISION') {
        await _crearAviso(escritura, deteccion, usuarioId);
      }
      return;
    }

    if (ESTADOS_INMUTABLES.includes(aviso.estado)) return;

    await _actualizarAviso(aviso, escritura, deteccion, usuarioId);
  } catch (err) {
    console.error('[pldService/process] escrituraId=%s usuario=%s error=%s',
      escrituraId, usuarioId, err.message);
  }
}

/**
 * Cancela el AvisoPLD vinculado a una Escritura eliminada.
 * Reutilizable desde escrituras, importaciones, jobs y scripts.
 *
 * @param {string|import('mongoose').Types.ObjectId} escrituraId
 * @param {string} [usuarioId='sistema']
 */
async function cancelByEscritura(escrituraId, usuarioId = 'sistema') {
  try {
    const aviso = await AvisoPLD.findOne({
      escrituraId,
      tipoAviso: 'ORDINARIO',
    });
    if (!aviso) return;

    if (aviso.estado === 'CANCELADO') return;

    if (aviso.estado === 'PRESENTADO') {
      aviso.historialEstados.push({
        estadoDesde: 'PRESENTADO',
        estadoHasta: 'PRESENTADO',
        evento:      'ALERTA_ESCRITURA_ELIMINADA',
        fecha:       new Date(),
        usuario:     usuarioId,
        nota:        'Escritura eliminada del sistema. El aviso ya fue presentado al SAT — requiere acción manual.',
      });
      await aviso.save();
      return;
    }

    aviso.registrarTransicion(
      'CANCELADO',
      'ESCRITURA_ELIMINADA',
      usuarioId,
      'Escritura eliminada del sistema notarial.'
    );
    await aviso.save();
  } catch (err) {
    console.error('[pldService/cancel] escrituraId=%s usuario=%s error=%s',
      escrituraId, usuarioId, err.message);
  }
}

module.exports = { processEscritura, cancelByEscritura };
