'use strict';

/**
 * Boot loader de catálogos oficiales SAT/UIF. Se ejecuta una sola vez al
 * arrancar el backend, después de que Mongo esté conectado.
 *
 * Fuente de verdad: Backend/pld/catalogos/data/*.json (versionados en git,
 * revisados como código). Este loader los valida y los sincroniza (upsert
 * idempotente) hacia la colección CatalogoPLD, que sirve como réplica de
 * lectura rápida, y puebla el cache en memoria de catalogoService.
 *
 * Si CUALQUIER archivo falla su validación, todo el subsistema de catálogos
 * queda "no listo" (fail-closed) — no se hace una carga parcial. El llamador
 * (Backend/index.js) decide qué hacer con las rutas que dependen de esto.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CatalogoPLD = require('../../models/CatalogoPLD');
const catalogoService = require('./catalogoService');

const DATA_DIR = path.join(__dirname, 'data');

function hashValores(valores) {
  const normalizado = JSON.stringify((valores || []).map((v) => ({ clave: v.clave, descripcion: v.descripcion })));
  return crypto.createHash('sha256').update(normalizado, 'utf8').digest('hex');
}

function validarArchivo(nombreArchivo, contenido) {
  const errores = [];
  const catalogoIdEsperado = path.basename(nombreArchivo, '.json');

  if (contenido.catalogoId !== catalogoIdEsperado) {
    errores.push(`${nombreArchivo}: catalogoId="${contenido.catalogoId}" no coincide con el nombre del archivo.`);
  }
  if (!Array.isArray(contenido.versiones)) {
    errores.push(`${nombreArchivo}: falta el arreglo "versiones".`);
    return errores;
  }

  const ordenadas = [...contenido.versiones].sort(
    (a, b) => new Date(a.vigenciaDesde) - new Date(b.vigenciaDesde)
  );

  let anterior = null;
  for (const v of ordenadas) {
    const prefijo = `${nombreArchivo} / versión "${v.version}"`;
    if (!v.version) errores.push(`${prefijo}: falta "version".`);
    if (!v.vigenciaDesde || isNaN(new Date(v.vigenciaDesde))) errores.push(`${prefijo}: "vigenciaDesde" inválida.`);
    if (v.vigenciaHasta && isNaN(new Date(v.vigenciaHasta))) errores.push(`${prefijo}: "vigenciaHasta" inválida.`);
    if (!v.fuente) errores.push(`${prefijo}: falta "fuente".`);
    if (!Array.isArray(v.valores)) {
      errores.push(`${prefijo}: "valores" debe ser un arreglo (puede ir vacío mientras no haya catálogo oficial cargado).`);
    } else {
      for (const val of v.valores) {
        if (!val.clave || !val.descripcion) {
          errores.push(`${prefijo}: entrada de "valores" incompleta (${JSON.stringify(val)}).`);
        }
      }
    }

    if (anterior && v.vigenciaDesde) {
      const anteriorFin = anterior.vigenciaHasta ? new Date(anterior.vigenciaHasta) : null;
      const actualInicio = new Date(v.vigenciaDesde);
      if (anteriorFin === null) {
        errores.push(
          `${nombreArchivo}: la versión "${anterior.version}" no tiene vigenciaHasta pero existe una versión ` +
          `posterior ("${v.version}") — debe cerrarse su vigencia para no traslapar.`
        );
      } else if (actualInicio < anteriorFin) {
        errores.push(`${nombreArchivo}: las versiones "${anterior.version}" y "${v.version}" tienen vigencias traslapadas.`);
      }
    }
    anterior = v;
  }
  return errores;
}

async function cargarCatalogos() {
  const resumen = [];
  const erroresGlobales = [];

  if (!fs.existsSync(DATA_DIR)) {
    return { ok: false, errores: [`No existe el directorio de catálogos: ${DATA_DIR}`], resumen };
  }

  const archivos = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  const nuevoCache = new Map();

  for (const archivo of archivos) {
    const rutaCompleta = path.join(DATA_DIR, archivo);
    let contenido;
    try {
      contenido = JSON.parse(fs.readFileSync(rutaCompleta, 'utf8'));
    } catch (err) {
      erroresGlobales.push(`${archivo}: JSON inválido (${err.message}).`);
      continue;
    }

    const erroresArchivo = validarArchivo(archivo, contenido);
    if (erroresArchivo.length > 0) {
      erroresGlobales.push(...erroresArchivo);
      continue;
    }

    const versionesOrdenadas = [...contenido.versiones].sort(
      (a, b) => new Date(a.vigenciaDesde) - new Date(b.vigenciaDesde)
    );
    const versionesEnMemoria = [];

    for (const v of versionesOrdenadas) {
      const contentHash = hashValores(v.valores);

      const existente = await CatalogoPLD.findOne({ catalogoId: contenido.catalogoId, version: v.version }).lean();
      if (existente && existente.contentHash !== contentHash) {
        erroresGlobales.push(
          `${archivo}: la versión "${v.version}" ya existe en la base de datos con contenido DISTINTO. ` +
          `Una versión ya publicada no debe modificarse — crea una versión nueva en su lugar.`
        );
        continue;
      }

      await CatalogoPLD.updateOne(
        { catalogoId: contenido.catalogoId, version: v.version },
        {
          $set: {
            vigenciaDesde: new Date(v.vigenciaDesde),
            vigenciaHasta: v.vigenciaHasta ? new Date(v.vigenciaHasta) : null,
            fuente: v.fuente,
            valores: v.valores,
            contentHash,
          },
        },
        { upsert: true }
      );

      versionesEnMemoria.push({
        version: v.version,
        vigenciaDesde: new Date(v.vigenciaDesde),
        vigenciaHasta: v.vigenciaHasta ? new Date(v.vigenciaHasta) : null,
        fuente: v.fuente,
        valores: v.valores,
      });
    }

    nuevoCache.set(contenido.catalogoId, versionesEnMemoria);
    const vigente = versionesEnMemoria.find((v) => !v.vigenciaHasta);
    resumen.push({
      catalogoId: contenido.catalogoId,
      versiones: versionesEnMemoria.length,
      versionVigente: vigente ? vigente.version : null,
      valoresVigentes: vigente ? vigente.valores.length : 0,
    });
  }

  if (erroresGlobales.length > 0) {
    return { ok: false, errores: erroresGlobales, resumen };
  }

  catalogoService._cargar(nuevoCache);
  return { ok: true, errores: [], resumen };
}

module.exports = { cargarCatalogos };
