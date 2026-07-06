'use strict';

/**
 * Único punto de acceso de lectura a los catálogos oficiales SAT/UIF.
 * Nadie en el módulo PLD (generadorXML, adaptadores, rutas, frontend a
 * través de la ruta HTTP) debe leer Backend/pld/catalogos/data/*.json ni
 * la colección CatalogoPLD directamente — todo pasa por aquí.
 *
 * El cache se puebla exclusivamente desde cargarCatalogos.js (_cargar).
 * Antes de que ese boot termine con éxito, cualquier consulta lanza un
 * error explícito en vez de devolver datos parciales o vacíos silenciosos.
 */

let listo = false;
let cache = new Map(); // catalogoId -> [{ version, vigenciaDesde, vigenciaHasta, fuente, valores }] ordenado por vigenciaDesde asc

function requiereListo() {
  if (!listo) {
    throw new Error('catalogoService no inicializado: cargarCatalogos() no ha completado exitosamente todavía.');
  }
}

function versionVigente(catalogoId, fecha) {
  const versiones = cache.get(catalogoId);
  if (!versiones || versiones.length === 0) return null;
  const f = fecha ? new Date(fecha) : new Date();
  return versiones.find((v) => f >= v.vigenciaDesde && (!v.vigenciaHasta || f < v.vigenciaHasta)) || null;
}

/**
 * Confirma que `clave` pertenece al catálogo `catalogoId` en la versión
 * vigente a `fecha` (normalmente aviso.fechaOperacion, no la fecha de hoy).
 */
function resolver(catalogoId, clave, fecha) {
  requiereListo();
  const version = versionVigente(catalogoId, fecha);
  if (!version) {
    return {
      valido: false,
      motivo: `No hay una versión vigente del catálogo "${catalogoId}" para la fecha indicada. ` +
        `Probablemente falte cargar el catálogo oficial correspondiente.`,
    };
  }
  const claveStr = String(clave ?? '');
  const entrada = version.valores.find((v) => v.clave === claveStr);
  if (!entrada) {
    return {
      valido: false,
      motivo: `"${claveStr}" no existe en el catálogo "${catalogoId}" (versión ${version.version}).`,
      clavesValidas: version.valores.map((v) => v.clave),
    };
  }
  return { valido: true, clave: entrada.clave, descripcion: entrada.descripcion, catalogoVersion: version.version };
}

/** Listado vigente a `fecha`, para poblar selects del frontend. */
function listarVigente(catalogoId, fecha) {
  requiereListo();
  const version = versionVigente(catalogoId, fecha);
  if (!version) return { catalogoId, version: null, valores: [] };
  return { catalogoId, version: version.version, valores: version.valores };
}

/** Metadata completa de la versión vigente (usado para el snapshot congelado en AvisoPLD). */
function obtenerVersionVigente(catalogoId, fecha) {
  requiereListo();
  return versionVigente(catalogoId, fecha);
}

function estaListo() {
  return listo;
}

// Uso exclusivo de cargarCatalogos.js — nadie más debe llamar esto.
function _cargar(nuevoCache) {
  cache = nuevoCache;
  listo = true;
}

function _reiniciar() {
  cache = new Map();
  listo = false;
}

module.exports = {
  resolver,
  listarVigente,
  obtenerVersionVigente,
  estaListo,
  _cargar,
  _reiniciar,
};
