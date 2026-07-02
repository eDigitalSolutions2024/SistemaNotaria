'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Historial de transiciones de estado ──────────────────────────────────────
const HistorialEntradaSchema = new Schema(
  {
    estadoDesde: { type: String, required: true },
    estadoHasta: { type: String, required: true },
    evento:      { type: String, required: true },
    fecha:       { type: Date,   default: Date.now },
    usuario:     { type: String },
    nota:        { type: String },
  },
  { _id: false }
);

// ── Snapshot inmutable de compareciente al momento del aviso ─────────────────
// actividad_economica: requerido por fep.xsd persona_fisica_type (código SAT 7 dígitos)
const ComparecienteSchema = new Schema(
  {
    tipoPersona:        { type: String, enum: ['FISICA', 'MORAL'], required: true },
    // Persona física
    nombre:             { type: String },
    apellidoPaterno:    { type: String },
    apellidoMaterno:    { type: String },
    fechaNacimiento:    { type: String }, // DD/MM/AAAA (formato fep.xsd)
    rfc:                { type: String },
    curp:               { type: String },
    nacionalidad:       { type: String, default: 'MEXICANA' },
    actividadEconomica: { type: String }, // código 7 dígitos SAT (requerido en XML)
    domicilio:          { type: String },
    // Persona moral
    denominacionRazon:  { type: String },
    fechaConstitucion:  { type: String }, // DD/MM/AAAA
    giroMercantil:      { type: String }, // código SAT (requerido en XML para PM)
    // Rol en la operación
    rol:                { type: String },
    clienteGeneralId:   { type: String }, // referencia al ClienteGeneral origen
  },
  { _id: false }
);

// ── Beneficiario controlador ──────────────────────────────────────────────────
const BeneficiarioControladorSchema = new Schema({
  nombre:                  { type: String, required: true },
  apellidoPaterno:         { type: String },
  apellidoMaterno:         { type: String },
  fechaNacimiento:         { type: String },
  rfc:                     { type: String },
  curp:                    { type: String },
  paisNacionalidad:        { type: String, default: 'MEXICO' },
  porcentajeParticipacion: { type: Number, min: 0, max: 100 },
  esCadenaControl:         { type: Boolean, default: false },
});

// ── Versiones del XML generado (Fase 2) ──────────────────────────────────────
const VersionXMLSchema = new Schema(
  {
    version:       { type: Number, required: true },
    xmlContenido:  { type: String, required: true },
    xmlHash:       { type: String, required: true }, // SHA-256
    fechaGenerado: { type: Date,   default: Date.now },
    generadoPor:   { type: String },
    razon:         { type: String },
    activo:        { type: Boolean, default: false },
  },
  { _id: false }
);

// ── Aviso PLD principal ───────────────────────────────────────────────────────
const AvisoPLDSchema = new Schema(
  {
    // Vínculo con Escritura
    escrituraId:    { type: Schema.Types.ObjectId, ref: 'Escritura', required: true },
    numeroControl:  { type: Number, required: true, index: true },
    numeroEscritura: { type: Number },

    // Tipo de aviso
    tipoAviso:           { type: String, enum: ['ORDINARIO', 'MODIFICATORIO'], default: 'ORDINARIO' },
    avisoPLDOriginalId:  { type: Schema.Types.ObjectId, ref: 'AvisoPLD', sparse: true },
    folioAvisoOriginal:  { type: String },

    // Actividad detectada
    incisoLegal:          { type: String },
    tipoFEP:              { type: String }, // '1'..'9' o null (DeclaraNOT)
    descripcionActividad: { type: String },
    confianzaDeteccion:   { type: String, enum: ['AUTOMATICA', 'REQUIERE_REVISION'] },
    portal:               { type: String, enum: ['SPPLD', 'DECLARANOT'] },

    // Operación económica
    monto:           { type: Number, default: null },
    moneda:          { type: String, default: 'MXN' },
    montoPrellenado: { type: Number }, // valorAvaluo de la Escritura (referencia)

    // Fechas críticas
    fechaOperacion:    { type: Date, required: true },
    fechaVencimiento:  { type: Date, required: true, index: true },
    fechaPresentacion: { type: Date },

    // Referencia interna
    referenciaOperador: { type: String, unique: true, sparse: true }, // NOT-YYYY-NNNNN

    // Estado (máquina de estados del módulo PLD)
    estado: {
      type: String,
      enum: [
        'NO_APLICA',
        'PENDIENTE',
        'LISTO',
        'XML_GENERADO',
        'RECHAZADO_SPPLD',
        'PRESENTADO',
        'CANCELADO',
      ],
      default: 'PENDIENTE',
      index: true,
    },
    historialEstados: { type: [HistorialEntradaSchema], default: [] },

    // Comparecientes (snapshot congelado)
    comparecientes:     { type: [ComparecienteSchema], default: [] },
    snapshotCongelado:  { type: Boolean, default: false },

    // Beneficiarios controladores
    beneficiariosControladores: { type: [BeneficiarioControladorSchema], default: [] },
    bcRevisado: { type: Boolean, default: false },

    // KYC
    kycCompleto:  { type: Boolean, default: false },
    kycFaltantes: { type: [String], default: [] },

    // XML (Fase 2 — campos reservados)
    versionesXML:    { type: [VersionXMLSchema], default: [] },
    xmlContenido:    { type: String },
    xmlHash:         { type: String },
    xmlFechaGenerado: { type: Date },
    xmlVersion:      { type: Number },

    // Acuse SPPLD
    folioAvisoSAT:       { type: String, unique: true, sparse: true }, // AAAA-NNNNN
    folioPortalSAT:      { type: String },
    acusePdfPath:        { type: String },
    acuseFechaRegistro:  { type: Date },

    // Auditoría y conservación (Art. 18 Fracc. IV LFPIORPI: 10 años)
    fechaExpiracionConservacion: { type: Date },
    justificacion:   { type: String },
    noAplicaRazon:   { type: String },
    canceladoRazon:  { type: String },
    tieneModificatorio: { type: Boolean, default: false },

    // Trazabilidad
    abogado:                  { type: String },
    alertaVencimientoEnviada: { type: Boolean, default: false },
    createdBy:                { type: String },
    updatedBy:                { type: String },
  },
  { timestamps: true }
);

// Índices compuestos
AvisoPLDSchema.index({ numeroControl: 1, tipoAviso: 1 });
AvisoPLDSchema.index({ fechaVencimiento: 1, estado: 1 });

// Registrar transición de estado (append-only)
AvisoPLDSchema.methods.registrarTransicion = function (estadoHasta, evento, usuario, nota) {
  this.historialEstados.push({
    estadoDesde: this.estado,
    estadoHasta,
    evento,
    fecha: new Date(),
    usuario,
    nota,
  });
  this.estado = estadoHasta;
};

module.exports = mongoose.model('AvisoPLD', AvisoPLDSchema);
