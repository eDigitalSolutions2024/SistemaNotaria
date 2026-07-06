'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Réplica de lectura de los catálogos oficiales SAT/UIF usados por el
 * generador de XML fep.xsd. La fuente de verdad son los archivos en
 * Backend/pld/catalogos/data/*.json (versionados en git, revisados como
 * código); esta colección es una copia sincronizada al arrancar el backend
 * para poder consultar por fecha de vigencia sin leer/parsear JSON en cada
 * request. Nadie debe escribir aquí salvo Backend/pld/catalogos/cargarCatalogos.js.
 *
 * Un documento = una versión de un catálogo. Puede haber varias versiones
 * históricas del mismo catalogoId, cada una con su propia ventana de vigencia.
 * Una vez que un AvisoPLD referencia una versión (campo datosActividad.*
 * congelado con su catalogoVersion), esa versión se considera inmutable:
 * cargarCatalogos.js rechaza cualquier intento de resubir la misma
 * (catalogoId, version) con contenido distinto (ver contentHash).
 */
const ValorCatalogoSchema = new Schema(
  {
    clave: { type: String, required: true },
    descripcion: { type: String, required: true },
  },
  { _id: false }
);

const CatalogoPLDSchema = new Schema(
  {
    catalogoId: { type: String, required: true }, // p. ej. "tipo_poder", "pais_iso"
    version: { type: String, required: true },    // fecha/id de la publicación oficial que la originó
    vigenciaDesde: { type: Date, required: true },
    vigenciaHasta: { type: Date, default: null },  // null = vigente indefinidamente
    fuente: { type: String, required: true },      // referencia al documento oficial (DOF, Anexo UIF, ISO, etc.)
    valores: { type: [ValorCatalogoSchema], default: [] }, // puede ir vacío mientras no haya catálogo oficial cargado
    contentHash: { type: String, required: true },  // sha256 de `valores`, detecta reescritura silenciosa de una versión ya usada
  },
  { timestamps: true }
);

CatalogoPLDSchema.index({ catalogoId: 1, version: 1 }, { unique: true });
CatalogoPLDSchema.index({ catalogoId: 1, vigenciaDesde: 1 });

module.exports = mongoose.model('CatalogoPLD', CatalogoPLDSchema);
