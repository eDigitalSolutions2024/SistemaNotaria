// src/components/pld/pldApi.js
//
// Llamadas HTTP al módulo PLD (backend/routes/pld.js). No se cambia nada
// del backend — este archivo solo consume endpoints que ya existen.
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8010';

/**
 * Obtiene el AvisoPLD de una escritura, creándolo si todavía no existe
 * (mismo comportamiento idempotente que ya implementa el backend). Es el
 * único punto de entrada seguro para "abrir el expediente PLD desde una
 * Escritura" — nunca se debe llamar solo para pintar un badge en una lista,
 * porque SÍ puede crear un registro si no existía.
 */
export async function detectarAviso(numeroControl) {
  const { data } = await axios.post(`${API}/pld/detectar/${numeroControl}`);
  return data; // { creado: bool, aviso }
}

/**
 * Lista avisos PLD (de solo lectura, no crea nada). Se usa para poblar el
 * mapa numeroControl -> aviso que pinta la columna PLD en Escrituras sin
 * hacer una llamada por fila.
 */
export async function listarAvisos(params = {}) {
  const { data } = await axios.get(`${API}/pld/avisos`, { params });
  return data; // { total, page, pages, avisos }
}

/**
 * Lista PLD construida desde las Escrituras (Motor de Reglas, Fase 1) — la
 * fuente de verdad es la Escritura, no AvisoPLD. Nunca crea nada: solo lee
 * y evalúa. Cada fila trae `tieneExpediente` (false si el motor detectó
 * obligación pero todavía no existe AvisoPLD) y `estado` puede venir con
 * los valores sintéticos 'SIN_EXPEDIENTE'/'REQUIERE_REVISION' además de los
 * estados reales de AvisoPLD.
 */
export async function listarEscriturasPLD(params = {}) {
  const { data } = await axios.get(`${API}/pld/escrituras-pld`, { params });
  return data; // { total, page, pages, escrituras, resumen }
}

export async function obtenerAviso(avisoId) {
  const { data } = await axios.get(`${API}/pld/avisos/${avisoId}`);
  return data;
}

/**
 * Catálogo oficial SAT/UIF vigente. Puede devolver `valores: []` si el
 * catálogo real todavía no se ha cargado (ver Backend/pld/catalogos/data) —
 * eso es un estado válido y esperado, no un error.
 */
export async function listarCatalogo(catalogoId, fecha) {
  const { data } = await axios.get(`${API}/pld/catalogos/${catalogoId}`, {
    params: fecha ? { fecha: new Date(fecha).toISOString().slice(0, 10) } : {},
  });
  return data; // { catalogoId, version, valores: [{clave, descripcion}] }
}

/**
 * Guardado parcial de comparecientes (pantalla Datos generales). Único
 * endpoint de escritura del módulo además de generar-xml — alcance
 * acotado a ese arreglo, no un PATCH genérico del aviso.
 */
export async function guardarComparecientes(avisoId, comparecientes) {
  const { data } = await axios.put(`${API}/pld/avisos/${avisoId}/comparecientes`, { comparecientes });
  return data; // { guardado: true, aviso }
}

/**
 * Guardado parcial de datosActividad (pantalla Actividad). Mismo patrón
 * acotado que guardarComparecientes.
 */
export async function guardarActividad(avisoId, datosActividad) {
  const { data } = await axios.put(`${API}/pld/avisos/${avisoId}/actividad`, { datosActividad });
  return data; // { guardado: true, aviso }
}

/**
 * Genera (o regenera) el XML fep.xsd del aviso. Si faltan o son inválidos
 * datos que el chequeo del cliente no alcanza a detectar (formato de RFC,
 * CURP, fechas, etc.), el backend responde 422 con
 * { mensaje, errores: string[] } — el llamador debe mostrar `errores` tal
 * cual, es la única fuente de verdad real para el XML.
 */
export async function generarXML(avisoId) {
  const { data } = await axios.post(`${API}/pld/avisos/${avisoId}/generar-xml`);
  return data; // { generado: true, version, xmlHash, estado }
}

/**
 * Descarga el XML ya generado de un aviso (requiere Authorization, por eso
 * no se usa un <a href> plano). Devuelve el Blob para que el llamador arme
 * el enlace de descarga.
 */
export async function descargarXML(avisoId) {
  const res = await axios.get(`${API}/pld/avisos/${avisoId}/descargar-xml`, {
    responseType: 'blob',
  });
  return res.data;
}

export { API };
