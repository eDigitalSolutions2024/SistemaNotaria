// src/components/Escrituras.jsx
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { DataGrid } from '@mui/x-data-grid';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Menu, MenuItem
} from '@mui/material';

import { useAuth } from '../auth/AuthContext';
import '../css/styles.css';
import EscrituraEstatus from './EscriturasEstatus';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8010';

// ----- utils -----
const emptyRow = {
  _id: null,
  numeroControl: '',
  tipoTramite: '',
  cliente: '',
  clienteNumero: '',
  fecha: '',
  abogado: '',
  // nuevos campos monetarios
  totalImpuestos: null,
  valorAvaluo: null,
  totalGastosExtra: null,
  totalHonorarios: null,

  // --- ESTATUS / CHECKLIST ---
  documentos: {},
  anticipos: { anticipo1: '', anticipo2: '', anticipo3: '' },
  comentariosEstatus: '',
};

const same = (a, b) => String(a ?? '') === String(b ?? '');
const fmtRange = (d, h) => (d && h ? `${d} a ${h}` : '—');

// formato dinero simple
const fmtMoney = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};


// --- Helpers para totales de presupuesto ---
const PRES_IMPUESTOS_KEYS = [
  'isr', 'isrAdquisicion',
  'traslacionDominio', 'traslacionDominio2', 'traslacionDominioRecargos',
  'ivaLocalComerc', 'actosJuridicos',
  'impuestoCedular', 'impuestoPredial',
];

const PRES_GASTOS_KEYS = [
  'registroPublico', 'registroPubVtaHip', 'registroPubPoderes',
  'registroPubOtros', 'registroPublicoRecargos',
  'solicPermiso', 'avisoPermiso', 'costoAvaluo', 'gastosGestiones',
  'tramiteForaneo', 'otrosConceptos',
  'certificados1', 'certificados2', 'certificados3',
];

const sumKeys = (obj, keys) =>
  keys.reduce((acc, k) => acc + (Number(obj?.[k]) || 0), 0);

const numSafe = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};



function formatDateInput(raw) {
  if (!raw) return '';

  // Si viene como string con formato "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss",
  // tomamos SOLO la parte de fecha sin crear un Date (evitamos el cambio por huso horario)
  if (typeof raw === 'string') {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) {
      return m[1]; // "YYYY-MM-DD"
    }
  }

  // Para objetos Date (por ejemplo: new Date() para hoy) sí usamos la zona local del navegador
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return '';

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// Muestra en el picker tanto "Iniciar trámite" como "Finalizar trámite"
const isEligible = (c) => {
  const a = norm(c?.accion);
  return a.includes('iniciar') || a.includes('finalizar');
};

// ====== TESTAMENTO: helpers HH:mm ======
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const isHHMM = (s) => HHMM_RE.test(String(s || '').trim());

async function checkHorarioTestamento({ apiBase, fecha, inicio, fin, excludeId }) {
  // Compat: backend actual acepta "hora", así que consultamos con la hora de inicio.
  const params = { fecha };
  if (inicio) params.hora = inicio;
  if (excludeId) params.excludeId = excludeId;
  const { data } = await axios.get(`${apiBase}/escrituras/testamento/check`, { params });
  return Boolean(data?.available);
}

const isTestamentoTipo = (tipo) => /testamento/i.test(String(tipo || ''));

const TIPOS_MONTOS_KEYWORDS = [
  'ESCRITURA',
  'COMPRA VENTA',
  'COMPRAVENTA',
  'PROTOCOLIZACION',
  'DONACION',
];

// 💰 Solo estos tipos de trámite llevan montos (impuestos, avalúo, etc.)
const isTramiteConMontos = (tipo) => {
  const t = norm(tipo);
  if (!t) return false;

  // Nunca aplicar montos a testamentos
  if (isTestamentoTipo(tipo)) return false;

  return TIPOS_MONTOS_KEYWORDS.some((k) => t.includes(norm(k)));
};


const timeOf = (r) => {
  const v = r?.hora_llegada ?? r?.horaLlegada ?? r?.createdAt ?? r?.fecha;
  const t = v ? new Date(v).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

// helpers para filtrado por tipo
const tipoFromRow = (r) =>
  (r?.tipoTramite || r?.motivo || r?.servicio || r?.accion || '').trim();
const incluye = (txt, needle) => norm(txt).includes(norm(needle));





// ✅ Confirmación de folios antes de guardar
function folioCount(desde, hasta) {
  const d = Number(desde), h = Number(hasta);
  if (!Number.isFinite(d) || !Number.isFinite(h)) return 0;
  if (d <= 0 || h <= 0) return 0;
  return Math.max(0, h - d + 1);
}

function confirmFoliosBeforeSave({ volumen, desde, hasta, tipo, control }) {
  const v = String(volumen ?? '').trim();
  const d = Number(desde), h = Number(hasta);

  // Si no capturaron folios, no preguntamos
  const hasAny = v || String(desde ?? '').trim() || String(hasta ?? '').trim();
  if (!hasAny) return true;

  // Si están incompletos/invalidos, deja que tus validaciones lo manejen
  if (!v || !Number.isFinite(d) || !Number.isFinite(h) || d <= 0 || h <= 0) return true;

  const qty = folioCount(d, h);

  const msg =
    `⚠️ Confirmación de folios\n\n` +
    `${control ? `# Control: ${control}\n` : ''}` +
    `${tipo ? `Trámite: ${tipo}\n` : ''}` +
    `Volumen: ${v}\n` +
    `Folios: ${d} a ${h}\n` +
    `Cantidad: ${qty} folio(s)\n\n` +
    `¿Confirmas que este rango es correcto?`;

  return window.confirm(msg);
}

// ---------- Volumen y folios (helpers alineados a tus rutas) ----------
// Límite máximo de folios por libro/volumen
const MAX_FOLIO_POR_LIBRO = 300;

// ⚠️ REGLA REAL DE USO DE FOLIOS (no se usa 1,2 ni 299,300)
const FIRST_USABLE_FOLIO = 3;
const LAST_USABLE_FOLIO = 298; // 300 - 2 últimos reservados


// Incrementa etiquetas de volumen “Libro 3” -> “Libro 4” o “5” -> “6”
function incVolumenTag(vol) {
  const s = String(vol ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)(\d+)\s*$/);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  if (/^\d+$/.test(s)) return String(Number(s) + 1);
  return null;
}

// Volumen vigente: toma el último con volumen y consulta /escrituras/folio/next
async function fetchVolumenActual(apiBase) {
  const { data: items } = await axios.get(`${apiBase}/escrituras`);
  const arr = Array.isArray(items) ? items : [];
  const lastWithVol = arr.find(r =>
    r?.volumen != null || r?.libro != null || r?.numLibro != null || r?.numeroLibro != null
  );
  if (!lastWithVol) return null;

  const lastVol =
    lastWithVol.volumen ?? lastWithVol.libro ?? lastWithVol.numLibro ?? lastWithVol.numeroLibro;

  try {
    const { data } = await axios.get(`${apiBase}/escrituras/folio/next`, {
      params: { volumen: String(lastVol), len: 1 }
    });
    return data?.volumen ?? lastVol; // si el libro está lleno, backend devuelve el siguiente
  } catch {
    return lastVol;
  }
}

// Sugiere el siguiente folio disponible para un volumen
async function suggestNextFolioFor(apiBase, volumen, len = 1) {
  if (!volumen && volumen !== 0) return null;
  try {
    const { data } = await axios.get(`${apiBase}/escrituras/folio/next`, {
      params: { volumen: String(volumen).trim(), len }
    });
    return data?.siguienteDesde ?? null;
  } catch {
    return null;
  }
}

// Chequeo local de traslape (UI). El backend sigue siendo autoridad (409).
function foliosTraslapanLocal(rows, volumen, desde, hasta, excludeId = null) {
  const v = String(volumen ?? '').trim();
  const d = Number(desde), h = Number(hasta);
  if (!v || !Number.isFinite(d) || !Number.isFinite(h)) return null;

  const overlaps = (a1, a2, b1, b2) => a1 <= b2 && b1 <= a2;

  for (const r of rows || []) {
    if (excludeId && (r?._id === excludeId)) continue;
    const rv = r?.volumen ?? r?.libro ?? r?.numLibro ?? r?.numeroLibro;
    const rd = Number(r?.folioDesde ?? r?.folio_inicio ?? r?.folioStart ?? r?.folio);
    const rh = Number(r?.folioHasta ?? r?.folio_fin ?? r?.folioEnd ?? r?.folio);
    if (String(rv) === v && Number.isFinite(rd) && Number.isFinite(rh)) {
      if (overlaps(d, h, rd, rh)) return { conflict: true, with: r };
    }
  }
  return { conflict: false };
}

// --- Subtipos extensibles por tipo de trámite ---
const SUBTIPOS_BY_TIPO = {
  poder: ['Revocable', 'Irrevocable'],
};
const getSubtipoFromTipo = (tipo) => {
  const t = norm(tipo);
  if (!t) return '';
  if (t.includes('irrevocable')) return 'Irrevocable';
  if (t.includes('revocable')) return 'Revocable';
  return '';
};
const stripSubtipo = (tipo) =>
  String(tipo || '')
    .replace(/\b(ir)?revocable\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

function applyClienteToEscritura(cliente, prev) {
  const numero =
    cliente?.idCliente ?? cliente?.idClienteNumero ?? cliente?.numeroCliente ?? cliente?.id ?? null;
 const nombre = String(cliente?.nombre || '').trim();
  return {
    ...prev,
    // ✅ guardar NOMBRE en "cliente"
    cliente: nombre || prev.cliente,

    // ✅ guardar NUMERO aparte (opcional pero recomendado)
    clienteNumero: numero != null ? String(numero) : (prev.clienteNumero ?? ''),

    tipoTramite:
      cliente?.motivo ||
      cliente?.tipoTramite ||
      cliente?.servicio ||
      cliente?.accion ||
      prev.tipoTramite,
    abogado: cliente?.abogado || prev.abogado,
  };
}


const pickRowFromVG = (p, row) => (p && p.row) ? p.row : (row || p || {});

// dd/mm/aa
const onlyDateDMY2 = (raw) => {
  if (!raw) return '—';

  // 1) Si es string con "YYYY-MM-DD" (con o sin hora), tomamos solo la parte de fecha
  if (typeof raw === 'string') {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const [y, mo, da] = m[1].split('-');
      return `${da}/${mo}/${String(y).slice(-2)}`; // dd/mm/yy
    }
  }

  // 2) Si es Date (por ejemplo algo que tú mismo creaste con new Date())
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};


// ---- Horario (testamento) helpers ----
const hhmmOrNull = (s) => (isHHMM(s) ? s : null);
const getHoraInicio = (r) =>
  hhmmOrNull(r?.horaLecturaInicio) ||
  hhmmOrNull(r?.horaLectura) ||     // compat legacy: único campo
  hhmmOrNull(r?.hora_inicio) ||
  hhmmOrNull(r?.horaInicio) || null;

const getHoraFin = (r) =>
  hhmmOrNull(r?.horaLecturaFin) ||
  hhmmOrNull(r?.hora_fin) ||
  hhmmOrNull(r?.horaFin) || null;

const formatHorarioCell = (row) => {
  const tipo = tipoFromRow(row);
  if (!isTestamentoTipo(tipo)) return '—';
  const i = getHoraInicio(row);
  const f = getHoraFin(row);
  if (i && f) return `${i} a ${f}`;
  if (i) return i;   // legacy: solo inicio
  return '—';
};

// ----- componente -----
// ----- componente -----
export default function Escrituras({ onOpenRecibo }) {
  const { user } = useAuth();
 

  // 🔹 Helpers de usuario
  const getUserName = (u) =>
    (u?.nombre || u?.name || u?.fullName || u?.username || '').trim();

  const getUserRoles = (u) => {
    const roles = [];
    if (Array.isArray(u?.roles)) roles.push(...u.roles);
    if (u?.role) roles.push(u.role);
    if (u?.rol) roles.push(u.rol);
    return roles.map((r) => String(r).toLocaleUpperCase('es-MX'));
  };

  const getUserId = (u) =>
    u?.id ?? u?._id ?? u?.ID ?? u?.userId ?? u?.numeroEmpleado ?? null;

  // 🔹 Datos del usuario actual
  const currentUserId = getUserId(user);
  const currentUserName = getUserName(user);
  const roles = getUserRoles(user);

  const isAdmin = roles.includes('ADMIN');
  const isSpecialViewer = String(currentUserId) === '1008';

  // 🔹 Permisos
  const canExport =
    isSpecialViewer ||
    roles.some((r) => ['ADMIN', 'PROTOCOLITO', 'RECEPCION'].includes(r));

  const canDeliver =
    !isSpecialViewer &&
    roles.some((r) => ['ADMIN', 'RECEPCION'].includes(r));

  const canSeeAll =
    isSpecialViewer ||
    roles.some((r) => ['ADMIN', 'RECEPCION'].includes(r));

      // 🔹 Quién puede ver el botón de Recibo
  const canSeeReciboBtn =
    isSpecialViewer ||
    roles.some((r) => ['ADMIN', 'RECEPCION', 'ABOGADO'].includes(r));

  // 🔹 Quién puede HACER cosas con recibos (generar, adjuntar, justificar)
  const canModifyRecibos =
    roles.some((r) => ['ADMIN', 'RECEPCION'].includes(r));

  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState(emptyRow);
  const [newSubtipo, setNewSubtipo] = useState('');
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  // Volumen (auto) y Folios (editables) para alta
  const [newVolumen, setNewVolumen] = useState('');
  const [newFolioDesde, setNewFolioDesde] = useState('');
  const [newFolioHasta, setNewFolioHasta] = useState('');

  const [volumenEditable, setVolumenEditable] = useState(false);
  // TESTAMENTO (alta)
  const [newHoraInicio, setNewHoraInicio] = useState('');
  const [newHoraFin, setNewHoraFin] = useState('');

  // Picker clientes
 
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerRows, setPickerRows] = useState([]);
  const [pickerTarget, setPickerTarget] = useState(null); // 'new' | id
  const pickerTimer = useRef(null);

  // plantillas .docx
  const [plantillas, setPlantillas] = useState([]);
  const [tplAnchorEl, setTplAnchorEl] = useState(null);
  const [tplRow, setTplRow] = useState(null);
  const [tplOptions, setTplOptions] = useState([]);

  // --- Export ---
  const [exportOpen, setExportOpen] = useState(false);
  const [filtroFrom, setFiltroFrom] = useState('');
  const [filtroTo, setFiltroTo] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroAbogado, setFiltroAbogado] = useState('');

  // --- Entregar ---
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliverRow, setDeliverRow] = useState(null);
  const [deliverPhone, setDeliverPhone] = useState('—');
  const [deliverNotes, setDeliverNotes] = useState('');
  const [deliverLoading, setDeliverLoading] = useState(false);

// --- Modal Estatus (detalle) ---
const [estatusOpen, setEstatusOpen] = useState(false);
const [estatusRow, setEstatusRow] = useState(null);


  // Abogados (export)
  const [abogadosOpts, setAbogadosOpts] = useState([]);
  const [abogadosLoading, setAbogadosLoading] = useState(false);

  // --- Modal: opciones cuando NO hay recibo ---
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingRow, setMissingRow] = useState(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachQ, setAttachQ] = useState('');
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachRows, setAttachRows] = useState([]);
  const [attachSelectedId, setAttachSelectedId] = useState(null);
  const [justifyOpen, setJustifyOpen] = useState(false);
  const [justifyText, setJustifyText] = useState('');

    // --- Modal: selección de presupuesto ---
  const [presupOpen, setPresupOpen] = useState(false);
  const [presupLoading, setPresupLoading] = useState(false);
  const [presupRows, setPresupRows] = useState([]);
  const [presupTarget, setPresupTarget] = useState(null); // 'new' | (en futuro: id de edición)


  // --- Modal: lectura de justificante ---
  const [justifyViewOpen, setJustifyViewOpen] = useState(false);
  const [justifyViewRow, setJustifyViewRow] = useState(null);

  // Observaciones locales por fila
  const [obsDrafts, setObsDrafts] = useState({}); // { [rowId]: "texto" }
  const [obsSaving, setObsSaving] = useState({});   // { [rowId]: boolean }

  const getRowKey = (r) => r?._id ?? r?.id ?? r?.numeroControl;

  /** Guarda solo 'observaciones' (PUT completo de la escritura) */
  const saveObs = async (id, fallbackRow) => {
    const row = rows.find((r) => getRowKey(r) === id) || fallbackRow;
    if (!row) return;

    const payload = {
      numeroControl: Number(row.numeroControl),
      tipoTramite: (row.tipoTramite || row.motivo || row.servicio || row.accion || '').trim(),
      cliente: String(row.cliente || '').trim(),
      fecha: row.fecha,
      abogado: String(row.abogado || '').trim(),
      observaciones: String(obsDrafts[id] ?? '').trim(),
    };

    try {
      setObsSaving((p) => ({ ...p, [id]: true }));
      await axios.put(`${API}/escrituras/${id}`, payload);
      setMsg({ type: 'ok', text: 'Observaciones guardadas' });
      await fetchData();
      setObsDrafts((p) => ({ ...p, [id]: payload.observaciones }));
    } catch (e) {
      setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo guardar observaciones' });
    } finally {
      setObsSaving((p) => ({ ...p, [id]: false }));
    }
  };

  const openMissing = (row) => {
    setMissingRow(row || null);
    setMissingOpen(true);
  };
  const closeMissing = () => {
    setMissingOpen(false);
    setMissingRow(null);
  };

  // Navega a la pantalla de generar recibo
  const goToGenerarRecibo = (row) => {
    const payload = {
      control: row?.numeroControl ?? '',
      cliente: row?.cliente ?? '',
      protocoloId: row?._id ?? '',
      tipoTramite: row?.tipoTramite ?? row?.motivo ?? row?.servicio ?? row?.accion ?? ''
    };
    if (typeof onOpenRecibo === 'function') onOpenRecibo(payload);
  };

  // Busca recibos existentes
  const searchReceipts = async (q) => {
    setAttachLoading(true);
    try {
      const { data } = await axios.get(`${API}/recibos/search`, { params: { q } });
      const arr = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      const normed = arr.map((r) => {
        const id = r.id || r._id;
        const folio =
          r.folio || r.numero || r.numeroRecibo || (id ? String(id).slice(-4).toUpperCase() : '—');
        const cliente = r.cliente || r.recibiDe || r.nombreCliente || '—';
        const totalRaw = r.total ?? r.totalPagado ?? r.monto ?? r.importe;
        const fechaRaw = r.fecha || r.createdAt || r.fechaEmision || r.fechaPago;
        let controls = r.controls || r.controles || r.vinculos || r.vinculados || null;
        if (!Array.isArray(controls)) {
          const c1 = r.control ?? r.numeroControl ?? r.protocoloControl ?? null;
          controls = c1 != null ? [c1] : [];
        }
        return {
          id,
          folio,
          cliente,
          total: (totalRaw != null) ? Number(totalRaw) : null,
          fecha: fechaRaw ? new Date(fechaRaw).toISOString() : null,
          controls
        };
      });
      setAttachRows(normed);
    } catch {
      setAttachRows([]);
    } finally {
      setAttachLoading(false);
    }
  };

  // Vincula recibo
  const linkReceipt = async () => {
    if (!attachSelectedId || !missingRow?.numeroControl) return;
    try {
      await axios.post(`${API}/recibos/link`, {
        reciboId: attachSelectedId,
        control: Number(missingRow.numeroControl)
      });
      setMsg({ type: 'ok', text: 'Recibo vinculado al control.' });
      setAttachOpen(false);
      setMissingOpen(false);
      setAttachSelectedId(null);
      fetchData();
    } catch (e) {
      setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo vincular.' });
    }
  };


  // ---- Validaciones de "alta" (new) ----
const isNonEmpty = (v) => String(v ?? '').trim().length > 0;

function isNewCoreComplete(newRow) {
  return (
    isNonEmpty(newRow?.tipoTramite) &&
    isNonEmpty(newRow?.cliente) &&
    isNonEmpty(newRow?.fecha) &&
    isNonEmpty(newRow?.abogado)
  );
}



const isNum = (v) => v !== '' && v !== null && v !== undefined && !Number.isNaN(Number(v));
const isNonNeg = (v) => isNum(v) && Number(v) >= 0;

function isNewMoneyComplete(row) {
  // Si el trámite NO es de los que llevan montos, consideramos esto como "ok"
  if (!isTramiteConMontos(row?.tipoTramite)) return true;

  return (
    isNonNeg(row?.totalImpuestos) &&
    isNonNeg(row?.valorAvaluo) &&
    isNonNeg(row?.totalGastosExtra) &&
    isNonNeg(row?.totalHonorarios)
  );
}



function isNewFoliosValid(volumen, desde, hasta) {
  const hasAny = isNonEmpty(volumen) || isNonEmpty(desde) || isNonEmpty(hasta);
  if (!hasAny) return true;

  const vOk = isNonEmpty(volumen);
  const dNum = Number(desde), hNum = Number(hasta);

  const nums = Number.isFinite(dNum) && Number.isFinite(hNum) && dNum > 0 && hNum > 0;
  const orden = dNum <= hNum;

  // ✅ NUEVO: rango utilizable
  const dentroRangoUtil =
    dNum >= FIRST_USABLE_FOLIO &&
    hNum <= LAST_USABLE_FOLIO;

  return vOk && nums && orden && dentroRangoUtil;
}




function isNewTestamentoValid(tipo, hi, hf) {
  if (!isTestamentoTipo(tipo)) return true;
  if (!isHHMM(hi) || !isHHMM(hf)) return false;
  return hi < hf;
}

function getNewFormErrors({ newRow, newVolumen, newFolioDesde, newFolioHasta, newHoraInicio, newHoraFin }) {
  const errors = [];
  if (!isNewCoreComplete(newRow)) errors.push('Tipo de trámite, Cliente, Fecha y Abogado son obligatorios.');
  if (!isNewFoliosValid(newVolumen, newFolioDesde, newFolioHasta)) {
  errors.push(
  `Si registras folios: Volumen, “Desde” y “Hasta” son obligatorios y deben estar dentro del rango utilizable ${FIRST_USABLE_FOLIO} a ${LAST_USABLE_FOLIO} (no se usan 1, 2, ${LAST_USABLE_FOLIO + 1}, ${LAST_USABLE_FOLIO + 2}).`
);

}

  if (!isNewTestamentoValid(newRow?.tipoTramite, newHoraInicio, newHoraFin)) {
    errors.push('Para testamento: Hora inicio/fin en formato HH:mm y fin mayor a inicio.');
  }
  if (isTramiteConMontos(newRow?.tipoTramite) && !isNewMoneyComplete(newRow)) {
    errors.push('Total Impuestos, Valor Avalúo, Gastos Extra y Honorarios son obligatorios y deben ser números ≥ 0 para este tipo de trámite.');
  }


  return errors;
}


  // --- Filas visibles por rol ---
  const visibleRows = React.useMemo(() => {
    if (canSeeAll) return rows;
    const me = norm(currentUserName);
    if (!me) return [];
    return rows.filter(r => norm(r?.abogado).includes(me));
  }, [rows, canSeeAll, currentUserName]);

  
  // --- Candado: máximo 2 escrituras sin recibo por abogado ---
  const hasReciboLocal = (row) => {
    const estatus = String(row?.estatus_recibo || '').toUpperCase();
    // CON_RECIBO = tiene recibo
    // JUSTIFICADO = tiene justificante autorizado
    if (estatus === 'CON_RECIBO' || estatus === 'JUSTIFICADO') return true;
    // Por si el backend aún no pone estatus pero ya hay justificante
    if (row?.justificante_text) return true;
    return false;
  };

  const mySinReciboCount = React.useMemo(() => {
    const me = norm(currentUserName);
    if (!me) return 0;
    return rows.filter((r) =>
      norm(r?.abogado).includes(me) && !hasReciboLocal(r)
    ).length;
  }, [rows, currentUserName]);

  // Candado solo para abogados / asistentes (no para ADMIN)
  const bloqueoPorRecibo = !isAdmin && mySinReciboCount >= 5;




  // Cargar catálogo de abogados (para export)
  const loadAbogadosFromRegistry = async () => {
    setAbogadosLoading(true);
    try {
      const attempt = async (url, params) => {
        try {
          const { data } = await axios.get(url, params ? { params } : undefined);
          return data;
        } catch {
          return null;
        }
      };

      let raw =
        (await attempt(`${API}/abogados`)) ||
        (await attempt(`${API}/usuarios`, { rol: 'ABOGADO' })) ||
        (await attempt(`${API}/users`, { role: 'ABOGADO' })) ||
        (await attempt(`${API}/usuarios`)) ||
        (await attempt(`${API}/users`));

      let arr = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
      if (!Array.isArray(arr)) arr = [];

      const soloAbogados = arr.filter((u) => {
        const roles = getUserRoles(u);
        return roles.some((r) => /(ABOGADO|ASISTENTE)/i.test(r));
      });

      const uniq = new Set();
      for (const u of soloAbogados) {
        const name = getUserName(u);
        if (name) uniq.add(name.toLocaleUpperCase('es-MX'));
      }

      setAbogadosOpts(Array.from(uniq).sort((a, b) => a.localeCompare(b, 'es')));
    } finally {
      setAbogadosLoading(false);
    }
  };

  useEffect(() => {
    if (exportOpen) loadAbogadosFromRegistry();
  }, [exportOpen]);

  // Rehidrata obsDrafts solo si cambian realmente las filas visibles
  useEffect(() => {
    const vis = Array.isArray(visibleRows) ? visibleRows : [];
    setObsDrafts((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const r of vis) {
        const id = r?._id ?? r?.id ?? r?.numeroControl;
        if (id == null) continue;
        if (!(id in next)) { next[id] = r?.observaciones ?? ''; changed = true; }
      }

      const visIds = new Set(
        vis.map((r) => r?._id ?? r?.id ?? r?.numeroControl).filter((x) => x != null)
      );
      for (const k of Object.keys(next)) {
        if (!visIds.has(k)) { delete next[k]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [visibleRows]);

  // Data inicial
  const buildExportUrl = (format) => {
    const url = new URL(`${API}/escrituras/export`);
    url.searchParams.set('format', format);
    if (filtroFrom) url.searchParams.set('from', filtroFrom);
    if (filtroTo) url.searchParams.set('to', filtroTo);
    if (filtroCliente) url.searchParams.set('cliente', filtroCliente);
    if (filtroAbogado) url.searchParams.set('abogado', filtroAbogado);
    return url.toString();
  };

  const handleExport = (format) => {
    const href = buildExportUrl(format);
    window.open(href, '_blank');
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/plantillas`);
        setPlantillas(Array.isArray(data) ? data : []);
      } catch {
        setPlantillas([]);
      }
    })();
  }, []);

  const openTplMenu = (evt, row) => {
    setTplAnchorEl(evt.currentTarget);
    setTplRow(row);

    const tipo = tipoFromRow(row);
    const opciones = incluye(tipo, 'poder')
      ? plantillas.filter(p => incluye(p.label, 'PPCAAAD'))
      : [];

    setTplOptions(opciones);
  };

  const closeTplMenu = () => { setTplAnchorEl(null); setTplRow(null); setTplOptions([]); };
  const descargarPlantilla = (key) => {
    window.location.href = `${API}/plantillas/${key}/download`;
    closeTplMenu();
  };

  async function fetchUltimoPresupuesto(apiBase, clienteNumero) {
  if (!clienteNumero) return null;
  try {
    const { data } = await axios.get(`${apiBase}/presupuestos/ultimo/cliente/${clienteNumero}`);
    return data; // puede ser null
  } catch (e) {
    return null;
  }
}
async function fetchPresupuestosCliente(apiBase, clienteNumero) {
  if (!clienteNumero) return [];

  try {
    const { data } = await axios.get(
      `${apiBase}/escrituras/presupuestos/cliente/${clienteNumero}`
    );

    const arr = Array.isArray(data) ? data : [];

    const normed = arr.map((p) => {
      const cargos = p.cargos || {};
      const honor = p.honorariosCalc || {};

      // 💰 Impuestos (acepta camelCase y snake_case)
      const totalImpuestos =
        p.totalImpuestos != null || p.total_impuestos != null
          ? numSafe(p.totalImpuestos ?? p.total_impuestos)
          : sumKeys(cargos, PRES_IMPUESTOS_KEYS);

      // 💰 Gastos extra (camel + snake)
      const totalGastosExtra =
        p.totalGastosExtra != null || p.total_gastos_extra != null
          ? numSafe(p.totalGastosExtra ?? p.total_gastos_extra)
          : sumKeys(cargos, PRES_GASTOS_KEYS);

      // 💰 Avalúo (camel + snake)
      const valorAvaluo =
        p.valorAvaluo != null || p.valor_avaluo != null
          ? numSafe(p.valorAvaluo ?? p.valor_avaluo)
          : p.avaluo != null && p.avaluo !== 0
          ? numSafe(p.avaluo)
          : numSafe(p.valorOperacion);

      // 💰 Honorarios (camel + snake, y dentro de honorariosCalc)
      const totalHonorarios =
        p.totalHonorarios != null ||
        p.total_honorarios != null ||
        honor.totalHonorarios != null ||
        honor.total_honorarios != null
          ? numSafe(
              p.totalHonorarios ??
                p.total_honorarios ??
                honor.totalHonorarios ??
                honor.total_honorarios
            )
          : 0;

      // Descripción amigable (ampliamos un poco)
      const descripcion =
        p.descripcion ||
        p.concepto ||
        p.observaciones ||
        p.tipoTramite ||
        '';

      const fecha = p.fecha || p.createdAt || null;

      return {
        id: String(p._id || p.id),

        cliente: p.cliente,
        fecha,
        descripcion,

        totalImpuestos,
        valorAvaluo,
        totalGastosExtra,
        totalHonorarios,

        raw: p,
      };
    });

    console.log('[RAW presupuestos]', arr);
    console.log('[presupuestos normalizados]', normed);
    return normed;
  } catch (e) {
    console.error('Error cargando presupuestos por cliente:', e);
    return [];
  }
}





  const fetchPicker = async (query) => {
    setPickerLoading(true);
    try {
      let list = [];
      try {
        const { data } = await axios.get(`${API}/clientes/search`, { params: { q: query} });
        if (Array.isArray(data) && data.length) list = data;
      } catch { /* fallback */ }

      if (!Array.isArray(list) || list.length === 0) {
        const { data } = await axios.get(`${API}/clientes`);
        list = Array.isArray(data) ? data : [];
      }

      const qstr = norm(query);
      let elegibles = list.filter(isEligible);
      if (qstr) {
        elegibles = elegibles.filter(
          (c) =>
            norm(c?.nombre).includes(qstr) ||
            norm(c?.abogado).includes(qstr) ||
            norm(c?.motivo).includes(qstr)
        );
      }
      elegibles = elegibles.filter(Boolean).sort((a, b) => timeOf(b) - timeOf(a));
      setPickerRows(elegibles);
    } catch {
      setPickerRows([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const openPickerFor = (target) => {
    setPickerTarget(target);
    setPickerOpen(true);
    setPickerQ('');
    fetchPicker('');
  };
  const onChangePickerQ = (v) => {
    setPickerQ(v);
    clearTimeout(pickerTimer.current);
    pickerTimer.current = setTimeout(() => fetchPicker(v), 250);
  };

  const selectClienteFromPicker = async (cliente) => {
  if (!cliente) return;

  const clienteNumero =
    cliente?.idCliente ?? cliente?.numeroCliente ?? cliente?.id ?? null;

  if (pickerTarget === 'new') {
    setSelectedCliente(cliente);

    // 1) aplica datos base
    setNewRow((prev) => {
      const next = applyClienteToEscritura(cliente, prev);
      return {
        ...next,
        // limpia montos antes de cargar (opcional)
        totalImpuestos: null,
        valorAvaluo: null,
        totalGastosExtra: null,
        totalHonorarios: null,
      };
    });

    const baseTipo =
      cliente?.motivo || cliente?.tipoTramite || cliente?.servicio || cliente?.accion || '';
    setNewSubtipo(getSubtipoFromTipo(baseTipo));

    // 2) si el trámite lleva montos, trae presupuesto y rellena
    const tipoFinal =
      (cliente?.motivo || cliente?.tipoTramite || cliente?.servicio || cliente?.accion || '').trim();

    if (isTramiteConMontos(tipoFinal) && clienteNumero) {
      const p = await fetchUltimoPresupuesto(API, clienteNumero);

      if (p) {
        setNewRow((prev) => ({
          ...prev,
          totalImpuestos: p.totalImpuestos ?? 0,
          valorAvaluo: p.valorAvaluo ?? 0,
          totalGastosExtra: p.totalGastosExtra ?? 0,
          totalHonorarios: p.totalHonorarios ?? 0,
          presupuestoId: p.presupuestoId ?? null, // opcional
        }));
      } else {
        // si no hay presupuesto para ese cliente
        setNewRow((prev) => ({
          ...prev,
          totalImpuestos: 0,
          valorAvaluo: 0,
          totalGastosExtra: 0,
          totalHonorarios: 0,
          presupuestoId: null,
        }));
      }
    }
  } else if (pickerTarget) {
    // edición: también podrías cargar presupuesto aquí si quieres
    setDrafts((prev) => ({
      ...prev,
      [pickerTarget]: applyClienteToEscritura(cliente, prev[pickerTarget] || {})
    }));
  }

  setPickerOpen(false);
};


const openPresupuestoPicker = async (target) => {
  if (target === 'new') {
    const clienteNumero =
      selectedCliente?.idCliente ??
      selectedCliente?.numeroCliente ??
      selectedCliente?.id ??
      null;

    if (!clienteNumero) {
      setMsg({
        type: 'warn',
        text: 'Primero selecciona un cliente para buscar sus presupuestos.',
      });
      return;
    }

    setPresupTarget('new');
    setPresupOpen(true);
    setPresupLoading(true);

    try {
      const lista = await fetchPresupuestosCliente(API, clienteNumero);

      const nombreCliente =
        selectedCliente?.nombre ||
        selectedCliente?.clienteNombre ||
        selectedCliente?.cliente ||
        '';

      const rowsNorm = lista.map((p) => ({
        ...p, // ← aquí vienen: id, cliente, fecha, descripcion, montos
        clienteNombre:
          p.clienteNombre ||
          p.cliente ||
          p.nombreCliente ||
          nombreCliente ||
          '',
      }));

      setPresupRows(rowsNorm);
    } catch {
      setPresupRows([]);
    } finally {
      setPresupLoading(false);
    }
  } else {
    setMsg({
      type: 'warn',
      text: 'Selector de presupuesto aún no disponible en edición.',
    });
  }
};


  const closePresupuestoPicker = () => {
    setPresupOpen(false);
    setPresupRows([]);
    setPresupTarget(null);
  };

  // ✅ Aplica el presupuesto seleccionado al formulario correspondiente
  const applyPresupuestoToTarget = (presupuesto) => {
    if (!presupuesto || !presupTarget) return;

    const valores = {
      totalImpuestos: presupuesto.totalImpuestos ?? presupuesto.total_impuestos ?? 0,
      valorAvaluo: presupuesto.valorAvaluo ?? presupuesto.valor_avaluo ?? 0,
      totalGastosExtra: presupuesto.totalGastosExtra ?? presupuesto.total_gastos_extra ?? 0,
      totalHonorarios: presupuesto.totalHonorarios ?? presupuesto.total_honorarios ?? 0,
      presupuestoId:
        presupuesto.presupuestoId ??
        presupuesto._id ??
        presupuesto.id ??
        null,
    };

    if (presupTarget === 'new') {
      setNewRow((prev) => ({
        ...prev,
        ...valores,
      }));
    }

    // si más adelante quieres que funcione en edición:
    // if (typeof presupTarget === 'string' && presupTarget !== 'new') {
    //   setDrafts((prev) => ({
    //     ...prev,
    //     [presupTarget]: {
    //       ...(prev[presupTarget] || {}),
    //       ...valores,
    //     },
    //   }));
    // }

    closePresupuestoPicker();
  };


  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/escrituras`, {
        params: q ? { q } : {}
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.mensaje || 'Error cargando datos' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchData(); }, [q]);

  // acciones
  const onEdit = (row) => {
    setEditingId(row._id);
    setDrafts(prev => ({
      ...prev,
      [row._id]: {
        numeroControl: row.numeroControl,
        tipoTramite: row.tipoTramite || row.motivo || row.servicio || row.accion || '',
        cliente: row.cliente,
        fecha: formatDateInput(row.fecha),
        abogado: row.abogado,
        // traer volumen y folios existentes si los hay
        volumen: row.volumen ?? row.libro ?? row.numLibro ?? row.numeroLibro ?? '',
        folioDesde: (row.folioDesde ?? row.folio_inicio ?? row.folioStart ?? ''),
        folioHasta: (row.folioHasta ?? row.folio_fin ?? row.folioEnd ?? ''),
        observaciones: row.observaciones || '',
        // TESTAMENTO (compat legacy y nuevo)
        horaLecturaInicio: row.horaLecturaInicio || row.horaLectura || '',
        horaLecturaFin: row.horaLecturaFin || '',
        // montos
        totalImpuestos: row.totalImpuestos ?? row.total_impuestos ?? null,
        valorAvaluo: row.valorAvaluo ?? row.valor_avaluo ?? null,
        totalGastosExtra: row.totalGastosExtra ?? row.total_gastos_extra ?? null,
        totalHonorarios: row.totalHonorarios ?? row.total_honorarios ?? null,
      }
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onCancel = (id) => {
    if (adding && id === 'new') {
      setNewRow({ ...emptyRow, fecha: formatDateInput(new Date()) });
      setSelectedCliente(null);
      setAdding(false);
      setNewSubtipo('');
      setNewVolumen('');
      setNewFolioDesde('');
      setNewFolioHasta('');
      setNewHoraInicio('');
      setNewHoraFin('');
    }
    setEditingId(null);
    setDrafts(prev => {
      const cp = { ...prev };
      delete cp[id];
      return cp;
    });
  };

  const onChangeDraft = (id, field, value) => {
    if (id === 'new') setNewRow(prev => ({ ...prev, [field]: value }));
    else setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const validateRow = ({ numeroControl, tipoTramite, cliente, fecha, abogado }) => {
    if (!numeroControl || !tipoTramite || !cliente || !fecha || !abogado) {
      return 'Todos los campos son obligatorios';
    }
    if (isNaN(Number(numeroControl))) return 'El número de control debe ser numérico';
    return null;
  };

  const onSaveNew = async () => {
  // 1) Validación central (obligatorios + folios + testamento HH:mm + montos si aplica)
  const errs = getNewFormErrors({
    newRow,
    newVolumen,
    newFolioDesde,
    newFolioHasta,
    newHoraInicio,
    newHoraFin
  });

  if (errs.length) {
    return setMsg({ type: 'warn', text: errs.join(' ') });
  }

  // 2) Cliente seleccionado
  const cid = selectedCliente?._id || selectedCliente?.id;
  if (!cid) {
    return setMsg({ type: 'warn', text: 'Selecciona un cliente primero' });
  }

  // 3) Si es testamento: validar disponibilidad (solo una vez)
  const finalTipo = String(newRow.tipoTramite || '').trim();

  if (isTestamentoTipo(finalTipo)) {
    try {
      const disponible = await checkHorarioTestamento({
        apiBase: API,
        fecha: newRow.fecha,
        inicio: newHoraInicio,
        fin: newHoraFin
      });

      if (!disponible) {
        return setMsg({
          type: 'error',
          text: 'La hora de lectura seleccionada ya está ocupada para ese día.'
        });
      }
    } catch (e) {
      return setMsg({
        type: 'error',
        text: 'No se pudo validar disponibilidad de horario. Intenta de nuevo.'
      });
    }
  }

  // 4) Confirmación de folios (si capturaron rango)
  const okFolios = confirmFoliosBeforeSave({
    volumen: newVolumen,
    desde: newFolioDesde,
    hasta: newFolioHasta,
    tipo: finalTipo,
    control: null // aún no existe en alta
  });

  if (!okFolios) {
    return setMsg({ type: 'warn', text: 'Guardado cancelado por confirmación de folios.' });
  }

  try {
    // 5) Crear escritura (backend genera # de control)
    const postPayload = {
      clienteId: cid,
      // ✅ este es el que usa Presupuesto.cliente (ej. 2679)
  clienteNumero: selectedCliente?.idCliente ?? selectedCliente?.id ?? selectedCliente?.numeroCliente ?? null,

      volumen: newVolumen || null,
      folioDesde: newFolioDesde ? Number(newFolioDesde) : null,
      folioHasta: newFolioHasta ? Number(newFolioHasta) : null,
      ...(isTestamentoTipo(finalTipo)
        ? { horaLecturaInicio: newHoraInicio, horaLecturaFin: newHoraFin }
        : {})
    };

    const { data: resp } = await axios.post(`${API}/escrituras`, postPayload);

    let createdId = resp?.id || resp?._id || resp?.data?._id || null;
    let createdNumero = resp?.numeroControl || resp?.data?.numeroControl || null;

    // Fallback: si el POST no devolvió _id pero sí numeroControl, lo buscamos
    if (!createdId && createdNumero != null) {
      try {
        const { data: list } = await axios.get(`${API}/escrituras`, {
          params: { q: String(createdNumero) }
        });
        const arr = Array.isArray(list) ? list : [];
        const found = arr.find((r) => Number(r?.numeroControl) === Number(createdNumero));
        if (found?._id) {
          createdId = found._id;
          createdNumero = createdNumero ?? found.numeroControl;
        }
      } catch {}
    }

    const aplicaMontos = isTramiteConMontos(finalTipo);
    const userPusoMontos =
  newRow.totalImpuestos !== '' && newRow.totalImpuestos != null &&
  newRow.valorAvaluo !== '' && newRow.valorAvaluo != null &&
  newRow.totalGastosExtra !== '' && newRow.totalGastosExtra != null &&
  newRow.totalHonorarios !== '' && newRow.totalHonorarios != null;

    // 6) PUT de aseguramiento (por si POST ignora campos)
    if (createdId) {
      const payloadPut = {
        numeroControl: Number(createdNumero || 0),
        tipoTramite: finalTipo || undefined,
        cliente: String(newRow.cliente || '').trim(),
        fecha: newRow.fecha,
        abogado: String(newRow.abogado || '').trim(),
        ...(newVolumen ? { volumen: newVolumen } : {}),
        ...(newFolioDesde ? { folioDesde: Number(newFolioDesde) } : {}),
        ...(newFolioHasta ? { folioHasta: Number(newFolioHasta) } : {}),
        ...(isTestamentoTipo(finalTipo)
          ? { horaLecturaInicio: newHoraInicio, horaLecturaFin: newHoraFin }
          : {}),
        ...(aplicaMontos && userPusoMontos
  ? {
      totalImpuestos: Number(newRow.totalImpuestos),
      valorAvaluo: Number(newRow.valorAvaluo),
      totalGastosExtra: Number(newRow.totalGastosExtra),
      totalHonorarios: Number(newRow.totalHonorarios)
    }
  : {})
      };

      const { data: updated } = await axios.put(`${API}/escrituras/${createdId}`, payloadPut);

      const volDespues = updated?.volumen ?? newVolumen ?? '';
      const dDespues = updated?.folioDesde ?? newFolioDesde ?? '';
      const hDespues = updated?.folioHasta ?? newFolioHasta ?? '';

      if (volDespues || dDespues || hDespues) {
        setMsg({
          type: 'ok',
          text: `Escritura ${createdNumero ?? ''} creada. Volumen ${volDespues || '—'}, Folios ${fmtRange(dDespues, hDespues)}.`
        });
      } else {
        setMsg({ type: 'ok', text: `Escritura ${createdNumero ?? ''} creada` });
      }
    } else {
      // Si no tenemos id, al menos avisamos (y refrescamos)
      setMsg({ type: 'ok', text: `Escritura ${createdNumero ?? ''} creada` });
    }

    // 7) Refrescar y limpiar formulario
    await fetchData();
    setNewRow(emptyRow);
    setSelectedCliente(null);
    setAdding(false);
    setNewSubtipo('');
    setNewVolumen('');
    setNewFolioDesde('');
    setNewFolioHasta('');
    setNewHoraInicio('');
    setNewHoraFin('');
  } catch (err2) {
    const t = err2?.response?.data?.mensaje || 'Error al crear';
    setMsg({ type: 'error', text: t });
  }
};


const onSaveEdit = async (id) => {
  const draft = drafts[id] || {};

  // ---------- helpers locales ----------
  const isNonEmpty = (v) => String(v ?? '').trim().length > 0;
  const isNum = (v) => v !== '' && v !== null && v !== undefined && !Number.isNaN(Number(v));
  const isNonNeg = (v) => isNum(v) && Number(v) >= 0;

  const validateEditCore = (d) => {
    if (!isNonEmpty(d.numeroControl) || !isNonEmpty(d.tipoTramite) || !isNonEmpty(d.cliente) || !isNonEmpty(d.fecha) || !isNonEmpty(d.abogado)) {
      return 'Todos los campos son obligatorios';
    }
    if (Number.isNaN(Number(d.numeroControl))) return 'El número de control debe ser numérico';
    return null;
  };

  const validateEditFolios = (volumen, desde, hasta) => {
    const hasAny = isNonEmpty(volumen) || isNonEmpty(desde) || isNonEmpty(hasta);
    if (!hasAny) return null; // no capturaron folios → ok

    if (!isNonEmpty(volumen)) return 'Volumen es obligatorio si registras folios';

    const d = Number(desde), h = Number(hasta);
    if (!Number.isFinite(d) || !Number.isFinite(h) || d <= 0 || h <= 0) {
      return 'Folio inválido: usa números positivos';
    }
    if (d > h) return 'Folio inválido: "desde" no puede ser mayor que "hasta"';

    if (d < FIRST_USABLE_FOLIO || h > LAST_USABLE_FOLIO) {
      return `Folios inválidos: solo se permite del ${FIRST_USABLE_FOLIO} al ${LAST_USABLE_FOLIO} (no se usan 1, 2, ${LAST_USABLE_FOLIO + 1} y ${LAST_USABLE_FOLIO + 2}).`;
    }

    return null;
  };

  const validateEditMoney = (d) => {
    if (!isTramiteConMontos(d?.tipoTramite)) return null;
    if (!isNonNeg(d.totalImpuestos) || !isNonNeg(d.valorAvaluo) || !isNonNeg(d.totalGastosExtra) || !isNonNeg(d.totalHonorarios)) {
      return 'Total Impuestos, Valor Avalúo, Gastos Extra y Honorarios son obligatorios y deben ser números ≥ 0 para este tipo de trámite.';
    }
    return null;
  };

  const validateEditTestamento = (d) => {
    if (!isTestamentoTipo(d?.tipoTramite)) return null;
    const hi = String(d.horaLecturaInicio || '').trim();
    const hf = String(d.horaLecturaFin || '').trim();

    if (!isHHMM(hi) || !isHHMM(hf)) return 'Para testamento: usa formato HH:mm en Hora inicio y Hora fin.';
    if (hi >= hf) return 'Hora fin debe ser mayor que hora inicio.';
    return null;
  };

  // ---------- 1) Validaciones ----------
  const errCore = validateEditCore(draft);
  if (errCore) return setMsg({ type: 'warn', text: errCore });

  const errFolios = validateEditFolios(draft?.volumen, draft?.folioDesde, draft?.folioHasta);
  if (errFolios) return setMsg({ type: 'warn', text: errFolios });

  // Traslape local (solo si hay rango)
  if (isNonEmpty(draft?.folioDesde) || isNonEmpty(draft?.folioHasta)) {
    const vol = draft?.volumen ?? '';
    const chk = foliosTraslapanLocal(rows, vol, draft?.folioDesde, draft?.folioHasta, id);
    if (chk?.conflict) {
      const r = chk.with || {};
      return setMsg({
        type: 'error',
        text: `Folio ocupado en Volumen ${vol}. Traslapa con el control ${r?.numeroControl ?? 'desconocido'} (${fmtRange(r?.folioDesde ?? r?.folio, r?.folioHasta ?? r?.folio)}).`
      });
    }
  }

  const errTest = validateEditTestamento(draft);
  if (errTest) return setMsg({ type: 'warn', text: errTest });

  const errMoney = validateEditMoney(draft);
  if (errMoney) return setMsg({ type: 'warn', text: errMoney });

  // Disponibilidad de testamento (solo una vez)
  if (isTestamentoTipo(draft?.tipoTramite)) {
    const hi = String(draft.horaLecturaInicio || '').trim();
    const hf = String(draft.horaLecturaFin || '').trim();
    try {
      const disponible = await checkHorarioTestamento({
        apiBase: API,
        fecha: draft.fecha,
        inicio: hi,
        fin: hf,
        excludeId: id
      });
      if (!disponible) {
        return setMsg({ type: 'error', text: 'La hora de lectura seleccionada ya está ocupada para ese día.' });
      }
    } catch {
      return setMsg({ type: 'error', text: 'No se pudo validar disponibilidad de horario. Intenta de nuevo.' });
    }
  }

  // Confirmación de folios
  const okFolios = confirmFoliosBeforeSave({
    volumen: draft?.volumen,
    desde: draft?.folioDesde,
    hasta: draft?.folioHasta,
    tipo: draft?.tipoTramite,
    control: draft?.numeroControl
  });

  if (!okFolios) {
    return setMsg({ type: 'warn', text: 'Guardado cancelado por confirmación de folios.' });
  }

  // ---------- 2) Payload ----------
  const aplicaMontos = isTramiteConMontos(draft?.tipoTramite);

  const horasEdit =
    isTestamentoTipo(draft?.tipoTramite) && isHHMM(draft?.horaLecturaInicio) && isHHMM(draft?.horaLecturaFin)
      ? { horaLecturaInicio: draft.horaLecturaInicio, horaLecturaFin: draft.horaLecturaFin }
      : {};

  const payload = {
    numeroControl: Number(draft.numeroControl),
    tipoTramite: String(draft.tipoTramite || '').trim(),
    cliente: String(draft.cliente || '').trim(),
    fecha: draft.fecha,
    abogado: String(draft.abogado || '').trim(),

    ...(draft.volumen != null && String(draft.volumen).trim() !== '' ? { volumen: draft.volumen } : {}),
    ...(draft.folioDesde != null && String(draft.folioDesde).trim() !== '' ? { folioDesde: Number(draft.folioDesde) } : {}),
    ...(draft.folioHasta != null && String(draft.folioHasta).trim() !== '' ? { folioHasta: Number(draft.folioHasta) } : {}),

    ...(isAdmin ? { observaciones: String(draft.observaciones || '').trim() } : {}),
    ...horasEdit,

    ...(aplicaMontos
      ? {
          totalImpuestos: Number(draft.totalImpuestos),
          valorAvaluo: Number(draft.valorAvaluo),
          totalGastosExtra: Number(draft.totalGastosExtra),
          totalHonorarios: Number(draft.totalHonorarios)
        }
      : {})
  };

  // ---------- 3) Guardar ----------
  try {
    const { data: updated } = await axios.put(`${API}/escrituras/${id}`, payload);

    await fetchData();
    onCancel(id);

    // mensaje final
    const volDespues = updated?.volumen ?? draft?.volumen ?? '';
    const dDespues = updated?.folioDesde ?? draft?.folioDesde ?? '';
    const hDespues = updated?.folioHasta ?? draft?.folioHasta ?? '';

    if (volDespues || dDespues || hDespues) {
      setMsg({
        type: 'ok',
        text: `Registro actualizado. Rango final: Volumen ${volDespues || '—'}, Folios ${fmtRange(dDespues, hDespues)}.`
      });
    } else {
      setMsg({ type: 'ok', text: 'Registro actualizado' });
    }
  } catch (err2) {
    const t =
      err2?.response?.status === 409
        ? (err2?.response?.data?.mensaje || 'Traslape de folio en este volumen')
        : (err2?.response?.data?.mensaje || 'Error al actualizar');

    setMsg({ type: 'error', text: t });
  }
};


  const onDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta escritura?')) return;
    try {
      await axios.delete(`${API}/escrituras/${id}`);
      await fetchData();
      setMsg({ type: 'ok', text: 'Registro eliminado' });
    } catch (err2) {
      setMsg({ type: 'error', text: err2.response?.data?.mensaje || 'Error al eliminar' });
    }
  };

    const startAdd = async () => {
    // Candado por recibos pendientes
    if (bloqueoPorRecibo) {
      setMsg({
        type: 'warn',
        text: `No puedes tomar un nuevo número de escritura: tienes ${mySinReciboCount} escritura(s) sin recibo o justificante.`
      });
      return;
    }

    setAdding(true);
    setNewRow({ ...emptyRow, fecha: formatDateInput(new Date()) });

    setSelectedCliente(null);
    setNewSubtipo('');
    setNewVolumen('');
    setNewFolioDesde('');
    setNewFolioHasta('');
    setNewHoraInicio('');
    setNewHoraFin('');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // volumen automático (bloqueado)
    try {
      const vol = await fetchVolumenActual(API);
      if (vol != null) {
        setNewVolumen(String(vol));
        setVolumenEditable(false);
        const sugerido = await suggestNextFolioFor(API, vol);
        if (sugerido != null) {
          setNewFolioDesde(String(sugerido));
          setNewFolioHasta((prev) => prev || String(sugerido));
        }
      } else {
        setVolumenEditable(true);
        setMsg({ type: 'warn', text: 'No fue posible determinar el volumen actual.' });
      }
    } catch {
      setVolumenEditable(true);
      setMsg({ type: 'warn', text: 'No fue posible determinar el volumen actual.' });
    }
  };


  const handleSelectFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API}/escrituras/import`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchData();
      setMsg({
        type: 'ok',
        text:
          `Importado: recibidas=${data.recibidas}, procesadas=${data.procesadas}, insertadas=${data.insertadas}, actualizadas=${data.actualizadas}` +
          (data.errores?.length ? `, con ${data.errores.length} fila(s) con error` : '')
      });
    } catch (err2) {
      const t = err2.response?.data?.mensaje || 'Error al importar';
      setMsg({ type: 'error', text: t });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ======= Entregar =======
  const openDeliver = async (row) => {
    try {
      setDeliverRow(row);
      setDeliverPhone('—');
      setDeliverNotes('');
      setDeliverOpen(true);

      const { data } = await axios.get(`${API}/escrituras/${row._id}/entrega-info`);
      setDeliverPhone(data?.telefono || '—');
    } catch {
      setDeliverPhone('—');
    }
  };

  const closeDeliver = () => {
    setDeliverOpen(false);
    setDeliverRow(null);
    setDeliverPhone('—');
    setDeliverNotes('');
    setDeliverLoading(false);
  };

  const confirmDeliver = async () => {
    if (!deliverRow?._id) return;
    setDeliverLoading(true);
    try {
      await axios.post(`${API}/escrituras/${deliverRow._id}/entregar`, {
        telefono: deliverPhone && deliverPhone !== '—' ? String(deliverPhone) : undefined,
        notas: deliverNotes || undefined
      });
      setMsg({ type: 'ok', text: 'Escritura marcada como entregada' });
      closeDeliver();
      fetchData();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.mensaje || 'No se pudo marcar como entregada' });
      setDeliverLoading(false);
    }
  };
  // ======= FIN Entregar =======

  // Abrir PDF de recibo
  const openReciboPdf = async (row) => {
    try {
      const numero = row?.numeroControl;
      if (!numero) {
        setMsg({ type: 'warn', text: 'Este registro no tiene # de control.' });
        return;
      }
      const { data } = await axios.get(
        `${API}/recibos/by-control/${encodeURIComponent(numero)}/latest`
      );
      const pdfUrl = `${API}/recibos/${data.id}/pdf`;
      window.open(pdfUrl, '_blank');
    } catch (e) {
      const m =
        e?.response?.data?.msg ||
        (e?.response?.status === 404
          ? 'No existe un recibo guardado para este control.'
          : 'No se pudo abrir el PDF del recibo.');
      setMsg({ type: 'warn', text: m });
    }
  };

  // Indicador Recibo
    const ReciboIndicator = ({ row }) => {
    const numero = row?.numeroControl;
    const estatus = row?.estatus_recibo;
    const [estado, setEstado] = React.useState('loading');

    React.useEffect(() => {
      let alive = true;
      if (estatus === 'JUSTIFICADO') { setEstado('justificado'); return; }
      if (estatus === 'CON_RECIBO') { setEstado('si'); return; }
      if (!numero) { setEstado('no'); return; }

      (async () => {
        try {
          await axios.get(`${API}/recibos/by-control/${encodeURIComponent(numero)}/latest`);
          if (alive) setEstado('si');
        } catch {
          if (alive) setEstado(estatus === 'JUSTIFICADO' ? 'justificado' : 'no');
        }
      })();
      return () => { alive = false; };
    }, [numero, estatus]);

    // ✅ Hay recibo → cualquiera que tenga canSeeReciboBtn puede abrir el PDF
    if (estado === 'si') {
      return (
        <button
          className="btn btn-primary"
          style={{ padding: '6px 10px', fontSize: 13 }}
          onClick={() => openReciboPdf(row)}
        >
          Recibo
        </button>
      );
    }

    // ✅ Justificado → botón solo para ver el texto del justificante
    if (estado === 'justificado') {
      return (
        <button
          type="button"
          onClick={() => { setJustifyViewRow(row); setJustifyViewOpen(true); }}
          style={{
            padding: '6px 10px',
            fontSize: 13,
            background: '#e6f4ea',
            border: '1px solid #b7dfc5',
            borderRadius: 6,
            lineHeight: 1.2,
            cursor: 'pointer'
          }}
          title="Ver justificante"
        >
          Justificado
        </button>
      );
    }

    // ⛔ NO hay recibo:
    //    - Si NO puede modificar recibos → SOLO ve texto "Sin recibo" (no clic)
    //    - Si SÍ puede modificar → botón "No tiene recibo" que abre el modal
    if (estado === 'no') {
      if (!canModifyRecibos) {
        return (
          <span
            style={{
              padding: '6px 10px',
              fontSize: 13,
              color: '#6b7280',
              borderRadius: 6,
              border: '1px solid #dcdcdc',
              background: '#f9fafb'
            }}
            title="Sin recibo registrado"
          >
            Sin recibo
          </span>
        );
      }

      return (
        <button
          type="button"
          onClick={() => openMissing(row)}
          style={{
            padding: '6px 10px',
            fontSize: 13,
            background: '#e9ecef',
            border: '1px solid #dcdcdc',
            borderRadius: 6,
            lineHeight: 1.2,
            cursor: 'pointer'
          }}
          title="Opciones para generar/adjuntar justificante"
        >
          No tiene recibo
        </button>
      );
    }

    return null;
  };


  // columnas tabla principal
  const baseColumns = [
    {
  field: 'numeroControl',
  headerName: 'Núm. de Escritura',
  width: 150,
  minWidth: 130,
  type: 'number',
  renderCell: (params) => (
    <span
      className="escritura-num-link"
      title="Doble click en la fila para abrir Estatus"
    >
      {params.value ?? '—'}
    </span>
  )
},

    {
      field: 'fecha',
      headerName: 'Fecha',
      width: 110, minWidth: 100,
      renderCell: (params) => onlyDateDMY2(params?.row?.createdAt ?? params?.row?.fecha),
      sortComparator: (_v1, _v2, a, b) => {
        const ta = Date.parse(a?.row?.createdAt ?? a?.row?.fecha);
        const tb = Date.parse(b?.row?.createdAt ?? b?.row?.fecha);
        return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
      },

    },
    {
      field: 'folio',
      headerName: 'Número de Folio',
      width: 160, minWidth: 150,
      valueGetter: (p, row) => {
        const r = p?.row ?? row ?? {};
        const d = r.folioDesde ?? r.folio_inicio ?? r.folioStart;
        const h = r.folioHasta ?? r.folio_fin ?? r.folioEnd;
        if (Number.isFinite(Number(d)) && Number.isFinite(Number(h))) return `${d} a ${h}`;
        return r.folio ?? r.numeroFolio ?? r.noFolio ?? r.folioEscritura ?? '—';
      }
    },
    {
      field: 'volumen',
      headerName: 'Volumen',
      width: 120, minWidth: 110,
      valueGetter: (p, row) => {
        const r = p?.row ?? row ?? {};
        return r.volumen ?? r.libro ?? r.numLibro ?? r.numeroLibro ?? '—';
      }
    },
    { field: 'cliente', headerName: 'Otorgante', flex: 1.2, minWidth: 220 },
    {
      field: 'tipoTramite',
      headerName: 'Tipo de trámite',
      flex: 1, minWidth: 160,
      valueGetter: (p, row) => {
        const r = p?.row ?? row ?? {};
        return r.tipoTramite || r.motivo || r.servicio || r.accion || '—';
      }
    },
    // >>> NUEVA COLUMNA: Horario (después de Tipo de trámite)
    {
      field: 'horario',
      headerName: 'Horario',
      width: 140,
      minWidth: 120,
      sortable: true,
      valueGetter: (p, row) => formatHorarioCell(p?.row ?? row ?? {}),
      sortComparator: (_v1, _v2, a, b) => {
        const ha = formatHorarioCell(a?.row ?? {});
        const hb = formatHorarioCell(b?.row ?? {});
        return String(ha).localeCompare(String(hb));
      },
    },
    // Abogado
    {
      field: 'abogado',
      headerName: 'Abogado responsable',
      width: 180,
      minWidth: 160,
    },
  ];

  // columnas de montos
  const moneyCols = [
    {
      field: 'totalImpuestos',
      headerName: 'Total Impuestos',
      width: 140, minWidth: 130,
      valueGetter: (p, row) => {
        const r = p?.row ?? row ?? {};
        return r.totalImpuestos ?? r.total_impuestos ?? null;
      },
      renderCell: (p) => `$ ${fmtMoney(p.value)}`,
      sortComparator: (a, b) => Number(a ?? 0) - Number(b ?? 0),
    },
    {
      field: 'valorAvaluo',
      headerName: 'Valor Avalúo',
      width: 140, minWidth: 130,
      valueGetter: (p, row) => (p?.row ?? row ?? {}).valorAvaluo ?? (p?.row ?? row ?? {}).valor_avaluo ?? null,
      renderCell: (p) => `$ ${fmtMoney(p.value)}`,
      sortComparator: (a, b) => Number(a ?? 0) - Number(b ?? 0),
    },
    {
      field: 'totalGastosExtra',
      headerName: 'Gastos Extra',
      width: 140, minWidth: 130,
      valueGetter: (p, row) => (p?.row ?? row ?? {}).totalGastosExtra ?? (p?.row ?? row ?? {}).total_gastos_extra ?? null,
      renderCell: (p) => `$ ${fmtMoney(p.value)}`,
      sortComparator: (a, b) => Number(a ?? 0) - Number(b ?? 0),
    },
    {
      field: 'totalHonorarios',
      headerName: 'Honorarios',
      width: 140, minWidth: 130,
      valueGetter: (p, row) => (p?.row ?? row ?? {}).totalHonorarios ?? (p?.row ?? row ?? {}).total_honorarios ?? null,
      renderCell: (p) => `$ ${fmtMoney(p.value)}`,
      sortComparator: (a, b) => Number(a ?? 0) - Number(b ?? 0),
    },
  ];

  const plantillasColumn = {
    field: 'plantillas',
    headerName: 'Plantillas',
    width: 150, minWidth: 140,
    sortable: false,
    filterable: false,
    renderCell: (params) => (
      <button
        className="btn btn-editar"
        style={{ padding: '6px 10px', fontSize: 13 }}
        onClick={(e) => openTplMenu(e, params.row)}
      >
        {incluye(tipoFromRow(params.row), 'poder') ? 'Descargar (Poder)' : 'Descargar'}
      </button>
    )
  };

  const actionsColumn = {
    field: 'acciones',
    headerName: 'Acciones',
    width: 360, minWidth: 300,
    sortable: false,
    filterable: false,
    renderCell: (params) => {
      const r = params.row || {};
      const entregado = r?.estatus_entrega === 'Entregado';
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && (
            <>
              <button
                className="btn btn-editar"
                style={{ padding: '6px 10px', fontSize: 13 }}
                onClick={() => onEdit(r)}
              >
                Editar
              </button>
              <button
                className="btn btn-danger"
                style={{ padding: '6px 10px', fontSize: 13 }}
                onClick={() => onDelete(r._id)}
              >
                Eliminar
              </button>
            </>
          )}
          {canSeeReciboBtn && <ReciboIndicator row={r} />}


          {canDeliver && (
            <button
              className="btn btn-editar"
              style={{ padding: '6px 10px', fontSize: 13, background: entregado ? '#e8e8e8' : undefined }}
              disabled={entregado}
              onClick={() => openDeliver(r)}
              title={entregado ? 'Ya entregada' : 'Marcar como entregada'}
            >
              {entregado ? 'Entregado' : 'Entregar'}
            </button>
          )}
        </div>
      );
    }
  };

  const observacionesColumn = {
    field: 'observaciones',
    headerName: 'Observaciones',
    flex: 1.4,
    minWidth: 260,
    sortable: false,
    filterable: false,
    renderCell: (params) => {
      const row = params?.row || {};
      const id = getRowKey(row) ?? params?.id;
      const value = obsDrafts[id] ?? '';

      const stopGrid = (e) => {
        e.stopPropagation();
        if (e.nativeEvent?.stopImmediatePropagation) e.nativeEvent.stopImmediatePropagation();
      };

      const onKeyDown = async (e) => {
        stopGrid(e);
        if (e.key === 'Enter' && e.shiftKey) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!obsSaving[id]) await saveObs(id, row);
        }
      };

      return (
        <div style={{ display: 'flex', alignItems: 'stretch', width: '100%', gap: 6 }}>
          <textarea
            rows={3}
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              setObsDrafts((prev) => (prev[id] === v ? prev : { ...prev, [id]: v }));
            }}
            onKeyDown={onKeyDown}
            onKeyDownCapture={stopGrid}
            onClick={stopGrid}
            onFocus={stopGrid}
            placeholder="Escribe aquí…  (Enter = guardar · Shift+Enter = salto de línea)"
            style={{
              width: '100%',
              minHeight: 56,
              resize: 'vertical',
              padding: 6,
              borderRadius: 8,
              border: '1px solid #ddd',
              lineHeight: 1.35,
              fontSize: 13,
              boxSizing: 'border-box'
            }}
          />
          {obsSaving[id] && (
            <span style={{ fontSize: 12, alignSelf: 'center', whiteSpace: 'nowrap' }}>
              Guardando…
            </span>
          )}
        </div>
      );
    }
  };

  const showActionsColumn = isAdmin || canDeliver|| canSeeReciboBtn;
  const columns = [
    ...baseColumns,
    ...moneyCols,
    plantillasColumn,
    ...(showActionsColumn ? [actionsColumn] : []),
    ...(isAdmin ? [observacionesColumn] : []),
  ];

  // columnas picker
  const pickerCols = [
    {
      field: 'id',
      headerName: 'ID',
      width: 90,
      valueGetter: (p, row) => {
        const r = pickRowFromVG(p, row);
        return r?.id ?? r?._id ?? '';
      }
    },
    { field: 'nombre', headerName: 'Cliente', flex: 1, minWidth: 220 },
    {
      field: 'abogado',
      headerName: 'Abogado',
      width: 180,
      valueGetter: (p, row) => pickRowFromVG(p, row)?.abogado || '—'
    },
    {
      field: 'motivo',
      headerName: 'Motivo / Servicio',
      width: 200,
      valueGetter: (p, row) => {
        const r = pickRowFromVG(p, row);
        return r?.motivo || r?.servicio || r?.accion || r?.tipoTramite || '—';
      }
    },
    {
      field: 'hora_llegada',
      headerName: 'Llegada',
      width: 180,
      valueGetter: (p, row) => {
        const v = pickRowFromVG(p, row)?.hora_llegada;
        return v ? new Date(v).toLocaleString() : '—';
      }
    },
    {
      field: 'pick',
      headerName: 'Seleccionar',
      width: 150,
      sortable: false,
      renderCell: (p) => (
        <button onClick={() => selectClienteFromPicker(p.row)}>Usar</button>
      )
    }
  ];

  return (
    <div style={{ padding: 16 }}>
      <h2>Escrituras</h2>

      {/* Barra de acciones */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={startAdd}
          disabled={adding || editingId || bloqueoPorRecibo}
        >
          + Agregar escritura
        </button>

{bloqueoPorRecibo && (
  <span style={{ fontSize: 12, color: '#b45309' }}>
    No puedes tomar un nuevo número de escritura: tienes{' '}
    {mySinReciboCount} escritura(s) sin recibo o sin justificante.
    Genera/adjunta el recibo o captura justificante en alguna de ellas
    para poder tomar una nueva.
  </span>
)}


       {/* Importar Excel (solo admin) */}
          {isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleSelectFile}
              />
              <button
                className="btn btn-primary btn-excel"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? 'Importando…' : 'Importar Excel'}
              </button>
            </>
          )}


        {/* Exportar */}
        {canExport && (
          <Button variant="text" onClick={() => setExportOpen(true)}>
            Exportar escrituras
          </Button>
        )}

        <input
          type="text"
          placeholder="Buscar por control, cliente, tipo o abogado"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 260, maxWidth: 520 }}
        />
        <button className='btn btn-primary' onClick={fetchData}>Actualizar</button>
      </div>

      {/* Mensajes */}
      {msg && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            borderRadius: 8,
            background: msg.type === 'ok' ? '#e8fff1' : msg.type === 'warn' ? '#fff9e6' : '#ffecec',
            border: `1px solid ${msg.type === 'ok' ? '#62c28e' : msg.type === 'warn' ? '#f2c200' : '#e57373'}`
          }}
          onClick={() => setMsg(null)}
        >
          {msg.text}
        </div>
      )}

      {/* Panel de agregar */}
      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1.2fr 180px 220px auto', gap: 8, marginBottom: 12 }}>
          <Button variant="outlined" onClick={() => openPickerFor('new')}>
            SELECCIONAR CLIENTE
          </Button>

          <input type="hidden" value={newRow.numeroControl ? String(newRow.numeroControl) : ''} readOnly />

          <input type="text" value={newRow.tipoTramite} readOnly disabled placeholder="Tipo de trámite" />

          {incluye(newRow.tipoTramite, 'poder') && (
            <select
              value={newSubtipo}
              onChange={(e) => {
                const v = e.target.value;
                setNewSubtipo(v);
                setNewRow((prev) => {
                  const base = stripSubtipo(prev.tipoTramite || 'Poder');
                  return { ...prev, tipoTramite: v ? `${base} ${v}` : base };
                });
              }}
            >
              <option value="">— Tipo de poder —</option>
              {SUBTIPOS_BY_TIPO.poder.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          <input type="text" value={newRow.cliente} readOnly disabled placeholder="Nombre del cliente" />
          <input type="text" value={newRow.fecha} readOnly disabled placeholder="Fecha" />
          <input type="text" value={newRow.abogado} readOnly disabled placeholder="Abogado responsable" />

          {/* Volumen y Folios */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Volumen (libro)"
              value={newVolumen}
              onChange={(e) => setNewVolumen(e.target.value)}
              readOnly={!volumenEditable}
              disabled={!volumenEditable}
              title={volumenEditable ? 'Escribe el volumen' : 'Seleccionado automáticamente por el sistema'}
              style={{
                minWidth: 160,
                background: volumenEditable ? undefined : '#f3f4f6',
                cursor: volumenEditable ? 'text' : 'not-allowed'
              }}
            />
            <input
              type="number"
              placeholder="Folio desde"
              value={newFolioDesde}
              onChange={(e) => {
                const v = e.target.value;
                setNewFolioDesde(v);
                if (!newFolioHasta) setNewFolioHasta(v);
              }}
              style={{ minWidth: 140 }}
            />
            <input
              type="number"
              placeholder="Folio hasta"
              value={newFolioHasta}
              onChange={(e) => setNewFolioHasta(e.target.value)}
              style={{ minWidth: 140 }}
            />
            <Button
              variant="outlined"
              onClick={async () => {
                if (!newVolumen) return;
                const sugerido = await suggestNextFolioFor(API, newVolumen);

if (sugerido != null) {
  let s = Number(sugerido);

  // ✅ evita 1 y 2
  if (s < FIRST_USABLE_FOLIO) s = FIRST_USABLE_FOLIO;

  // ✅ si ya no cabe ni siquiera el primer folio utilizable, fuerza aviso
  if (s > LAST_USABLE_FOLIO) {
    return setMsg({
      type: 'warn',
      text: `Este volumen ya no tiene folios utilizables (${FIRST_USABLE_FOLIO}-${LAST_USABLE_FOLIO}). Debe usarse el siguiente volumen.`
    });
  }

  setNewFolioDesde(String(s));
  if (!newFolioHasta) setNewFolioHasta(String(s));
}

              }}
              disabled={!newVolumen}
            >
              Siguiente disponible
            </Button>
          </div>

          {/* Testamento - Horas */}
          {isTestamentoTipo(newRow.tipoTramite) && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <TextField
                label="Hora inicio (HH:mm)"
                size="small"
                placeholder="HH:mm"
                value={newHoraInicio}
                onChange={(e) => setNewHoraInicio(e.target.value)}
                inputProps={{ inputMode: 'numeric', pattern: '[0-2][0-9]:[0-5][0-9]' }}
              />
              <TextField
                label="Hora fin (HH:mm)"
                size="small"
                placeholder="HH:mm"
                value={newHoraFin}
                onChange={(e) => setNewHoraFin(e.target.value)}
                inputProps={{ inputMode: 'numeric', pattern: '[0-2][0-9]:[0-5][0-9]' }}
                helperText="Para validar disponibilidad se usa la hora de inicio"
              />
            </div>
          )}

          {/* Montos del recibo (solo para escrituras / compra venta / protocolización / donación) */}
{isTramiteConMontos(newRow.tipoTramite) && (
  <>
    {/* 🔴 NUEVO: botón para abrir el modal de presupuestos */}
    <div
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        justifyContent: 'flex-end',
        marginTop: 4,
        marginBottom: 4,
      }}
    >
      <Button
        variant="outlined"
        size="small"
        onClick={() => openPresupuestoPicker('new')}
        disabled={!selectedCliente}
      >
        Elegir presupuesto…
      </Button>
    </div>

    <div
      style={{
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))',
        gap: 8,
      }}
    >
      <TextField
        label="Total Impuestos (sistema)"
        type="number"
        size="small"
        value={newRow.totalImpuestos ?? ''}
        onChange={(e) =>
          setNewRow((prev) => ({ ...prev, totalImpuestos: e.target.value }))
        }
      />
      <TextField
        label="Valor Avalúo (sistema)"
        type="number"
        size="small"
        value={newRow.valorAvaluo ?? ''}
        onChange={(e) =>
          setNewRow((prev) => ({ ...prev, valorAvaluo: e.target.value }))
        }
      />
      <TextField
        label="Total Gastos Extra (sistema)"
        type="number"
        size="small"
        value={newRow.totalGastosExtra ?? ''}
        onChange={(e) =>
          setNewRow((prev) => ({ ...prev, totalGastosExtra: e.target.value }))
        }
      />
      <TextField
        label="Total Honorarios (sistema)"
        type="number"
        size="small"
        value={newRow.totalHonorarios ?? ''}
        onChange={(e) =>
          setNewRow((prev) => ({ ...prev, totalHonorarios: e.target.value }))
        }
      />
    </div>
  </>
)}


          <div style={{ whiteSpace: 'nowrap' }}>
  <button
      onClick={onSaveNew}
      disabled={
        !isNewCoreComplete(newRow) ||
        !isNewFoliosValid(newVolumen, newFolioDesde, newFolioHasta) ||
        !isNewTestamentoValid(newRow?.tipoTramite, newHoraInicio, newHoraFin) ||
        !selectedCliente ||
        (isTramiteConMontos(newRow?.tipoTramite) && !isNewMoneyComplete(newRow))
      }
    >
  Guardar
</button>

  <button onClick={() => onCancel('new')} style={{ marginLeft: 8 }}>Cancelar</button>
</div>

        </div>
      )}

      {/* Panel de edición */}
      {editingId && (
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1.2fr 180px 220px auto', gap: 8, marginBottom: 12, background: '#f9fafb', padding: 8, borderRadius: 8 }}>
          <input
            type="number"
            value={drafts[editingId]?.numeroControl ?? ''}
            onChange={e => onChangeDraft(editingId, 'numeroControl', e.target.value)}
            placeholder="# Control"
          />
          <input
            type="text"
            value={drafts[editingId]?.tipoTramite ?? ''}
            onChange={e => onChangeDraft(editingId, 'tipoTramite', e.target.value)}
            placeholder="Tipo de trámite"
          />

          {incluye(drafts[editingId]?.tipoTramite || '', 'poder') && (
            <select
              value={getSubtipoFromTipo(drafts[editingId]?.tipoTramite || '')}
              onChange={(e) => {
                const v = e.target.value;
                setDrafts((prev) => {
                  const cur = prev[editingId] || {};
                  const base = stripSubtipo(cur.tipoTramite || 'Poder');
                  return { ...prev, [editingId]: { ...cur, tipoTramite: v ? `${base} ${v}` : base } };
                });
              }}
            >
              <option value="">— Tipo de poder —</option>
              {SUBTIPOS_BY_TIPO.poder.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={drafts[editingId]?.cliente ?? ''}
              onChange={e => onChangeDraft(editingId, 'cliente', e.target.value)}
              placeholder="Nombre del cliente"
              style={{ flex: 1 }}
            />
            <Button variant="outlined" onClick={() => openPickerFor(editingId)}>
              Seleccionar cliente
            </Button>
          </div>
          <input type="date" value={drafts[editingId]?.fecha ?? ''} onChange={e => onChangeDraft(editingId, 'fecha', e.target.value)} />
          <input
            type="text"
            value={drafts[editingId]?.abogado ?? ''}
            onChange={e => onChangeDraft(editingId, 'abogado', e.target.value)}
            placeholder="Abogado responsable"
          />

          {/* Volumen y Folios */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Volumen (libro)"
              value={drafts[editingId]?.volumen ?? ''}
              readOnly
              disabled
              title="No editable (asignado automáticamente)"
              style={{ minWidth: 160, background: '#f3f4f6', cursor: 'not-allowed' }}
            />
            <input
              type="number"
              placeholder="Folio desde"
              value={drafts[editingId]?.folioDesde ?? ''}
              onChange={(e) => onChangeDraft(editingId, 'folioDesde', e.target.value)}
              style={{ minWidth: 140 }}
            />
            <input
              type="number"
              placeholder="Folio hasta"
              value={drafts[editingId]?.folioHasta ?? ''}
              onChange={(e) => onChangeDraft(editingId, 'folioHasta', e.target.value)}
              style={{ minWidth: 140 }}
            />
            <Button
              variant="outlined"
              onClick={async () => {
                const vol = drafts[editingId]?.volumen;
                const sugerido = await suggestNextFolioFor(API, vol);
                if (sugerido != null) {
  let s = Number(sugerido);
  if (s < FIRST_USABLE_FOLIO) s = FIRST_USABLE_FOLIO;

  if (s > LAST_USABLE_FOLIO) {
    return setMsg({
      type: 'warn',
      text: `Este volumen ya no tiene folios utilizables (${FIRST_USABLE_FOLIO}-${LAST_USABLE_FOLIO}). Debe usarse el siguiente volumen.`
    });
  }

  onChangeDraft(editingId, 'folioDesde', String(s));
  if (!drafts[editingId]?.folioHasta) onChangeDraft(editingId, 'folioHasta', String(s));
}

              }}
            >
              Siguiente disponible
            </Button>
          </div>

          {/* Testamento - Horas */}
          {isTestamentoTipo(drafts[editingId]?.tipoTramite) && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <TextField
                label="Hora inicio (HH:mm)"
                size="small"
                placeholder="HH:mm"
                value={drafts[editingId]?.horaLecturaInicio || ''}
                onChange={(e) => onChangeDraft(editingId, 'horaLecturaInicio', e.target.value)}
                inputProps={{ inputMode: 'numeric', pattern: '[0-2][0-9]:[0-5][0-9]' }}
              />
              <TextField
                label="Hora fin (HH:mm)"
                size="small"
                placeholder="HH:mm"
                value={drafts[editingId]?.horaLecturaFin || ''}
                onChange={(e) => onChangeDraft(editingId, 'horaLecturaFin', e.target.value)}
                inputProps={{ inputMode: 'numeric', pattern: '[0-2][0-9]:[0-5][0-9]' }}
                helperText="Para validar disponibilidad se usa la hora de inicio"
              />
            </div>
          )}

          {/* Montos del recibo (opcionales) */}
          {/* Montos del recibo (solo para escrituras / compra venta / protocolización / donación) */}
{isTramiteConMontos(drafts[editingId]?.tipoTramite) && (
  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 8 }}>
    <TextField
      label="Total Impuestos (sistema)"
      type="number"
      size="small"
      value={drafts[editingId]?.totalImpuestos ?? ''}
      onChange={(e) => onChangeDraft(editingId, 'totalImpuestos', e.target.value)}
    />
    <TextField
      label="Valor Avalúo (sistema)"
      type="number"
      size="small"
      value={drafts[editingId]?.valorAvaluo ?? ''}
      onChange={(e) => onChangeDraft(editingId, 'valorAvaluo', e.target.value)}
    />
    <TextField
      label="Total Gastos Extra (sistema)"
      type="number"
      size="small"
      value={drafts[editingId]?.totalGastosExtra ?? ''}
      onChange={(e) => onChangeDraft(editingId, 'totalGastosExtra', e.target.value)}
    />
    <TextField
      label="Total Honorarios (sistema)"
      type="number"
      size="small"
      value={drafts[editingId]?.totalHonorarios ?? ''}
      onChange={(e) => onChangeDraft(editingId, 'totalHonorarios', e.target.value)}
    />
  </div>
)}



          {isAdmin && (
            <div style={{ gridColumn: '1 / -1' }}>
              <textarea
                rows={3}
                placeholder="Observaciones (solo admin)"
                value={drafts[editingId]?.observaciones ?? ''}
                onChange={e => onChangeDraft(editingId, 'observaciones', e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
              />
            </div>
          )}

          <div style={{ whiteSpace: 'nowrap' }}>
            <button onClick={() => onSaveEdit(editingId)}>Guardar</button>
            <button onClick={() => onCancel(editingId)} style={{ marginLeft: 8 }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabla principal */}
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <DataGrid
          rows={visibleRows}
          getRowId={(row) =>
            row?._id ?? row?.id ?? row?.numeroControl ?? `${row?.cliente}-${row?.fecha}`
          }
          columns={columns}
          loading={loading}
          getRowHeight={() => 'auto'} // la fila crece con el textarea
          density="standard"
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25, page: 0 } },
            sorting: { sortModel: [{ field: 'numeroControl', sort: 'desc' }] }
          }}
          disableRowSelectionOnClick
          onRowDoubleClick={(params) => {
            setEstatusRow(params?.row || null);
            setEstatusOpen(true);
          }}
          sx={{
            border: '1px solid #eee',
            '& .MuiDataGrid-columnHeaders': { backgroundColor: '#f5f5f5' },
            '& .MuiDataGrid-cell': { py: 0.5, alignItems: 'stretch' },
            '& .MuiDataGrid-row': { maxHeight: 'unset' },
            '& .MuiDataGrid-cellContent': {
              overflow: 'visible',
              whiteSpace: 'normal'
            }
          }}
          
        />

        <Menu anchorEl={tplAnchorEl} open={Boolean(tplAnchorEl)} onClose={closeTplMenu}>
          {tplOptions.length > 0
            ? tplOptions.map(p => (
                <MenuItem key={p.key} onClick={() => descargarPlantilla(p.key)}>
                  {p.label}
                </MenuItem>
              ))
            : <MenuItem disabled>
                No hay plantillas para “{tplRow ? tipoFromRow(tplRow) : '—'}”
              </MenuItem>}
        </Menu>
      </div>

      {/* Modal selector de clientes */}
      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Seleccionar cliente (estatus: Iniciar trámite)</DialogTitle>
        <DialogContent dividers>
          <TextField
            fullWidth size="small" placeholder="Buscar cliente…"
            value={pickerQ} onChange={(e) => onChangePickerQ(e.target.value)} sx={{ mb: 2 }}
          />
          <div style={{ width: '100%' }}>
            <DataGrid
              rows={pickerRows}
              getRowId={(r) =>
                r?._id ?? r?.id ?? r?.ID ?? r?.folio ?? `${r?.nombre}-${r?.hora_llegada}-${Math.random()}`
              }
              columns={pickerCols}
              loading={pickerLoading}
              autoHeight
              pageSizeOptions={[5, 10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
              disableRowSelectionOnClick
              onRowDoubleClick={(params) => selectClienteFromPicker(params.row)}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPickerOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Exportar */}
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Exportar escrituras</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextField label="Desde" type="date" size="small" InputLabelProps={{ shrink: true }} value={filtroFrom} onChange={(e) => setFiltroFrom(e.target.value)} />
              <TextField label="Hasta" type="date" size="small" InputLabelProps={{ shrink: true }} value={filtroTo} onChange={(e) => setFiltroTo(e.target.value)} />
            </div>
            <TextField label="Cliente (contiene)" placeholder="Ej. Juan Pérez" size="small" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} />
            <TextField select label="Abogado" size="small" value={filtroAbogado} onChange={(e) => setFiltroAbogado(e.target.value)} helperText="Selecciona un abogado para filtrar">
              <MenuItem value="">(Todos)</MenuItem>
              {abogadosLoading ? (
                <MenuItem disabled>Cargando…</MenuItem>
              ) : (
                abogadosOpts.map((nombre) => (
                  <MenuItem key={nombre} value={nombre}>{nombre}</MenuItem>
                ))
              )}
            </TextField>
          </div>
        </DialogContent>
        <DialogActions style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="contained" onClick={() => handleExport('excel')}>Exportar Excel</Button>
            <Button variant="outlined" onClick={() => handleExport('pdf')}>Exportar PDF</Button>
          </div>
          <Button onClick={() => setExportOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal de Entregar */}
      <Dialog open={deliverOpen} onClose={closeDeliver} fullWidth maxWidth="sm">
        <DialogTitle>Entregar escritura</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <TextField label="Cliente" size="small" value={deliverRow?.cliente || '—'} InputProps={{ readOnly: true }} />
            <TextField label="Número de control" size="small" value={deliverRow?.numeroControl ?? '—'} InputProps={{ readOnly: true }} />
            <TextField label="Teléfono" size="small" value={deliverPhone} onChange={(e) => setDeliverPhone(e.target.value)} helperText="Para contactar al cliente al momento de entrega" />
            <TextField label="Notas" size="small" multiline minRows={2} value={deliverNotes} onChange={(e) => setDeliverNotes(e.target.value)} />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeliver}>Cancelar</Button>
          <Button variant="contained" onClick={confirmDeliver} disabled={deliverLoading}>
            {deliverLoading ? 'Entregando…' : 'Entregar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: opciones cuando NO hay recibo */}
      <Dialog open={missingOpen} onClose={closeMissing} fullWidth maxWidth="sm">
        <DialogTitle>Esta escritura no tiene recibo</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><b># Control:</b> {missingRow?.numeroControl ?? '—'}</div>
            <div><b>Cliente:</b> {missingRow?.cliente ?? '—'}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Button variant="contained" onClick={() => { closeMissing(); goToGenerarRecibo(missingRow); }}>
                Generar recibo
              </Button>
              <Button variant="outlined" onClick={() => { setAttachQ(''); setAttachRows([]); setAttachSelectedId(null); setAttachOpen(true); searchReceipts(''); }}>
                Adjuntar recibo existente
              </Button>
              <Button variant="text" onClick={() => setJustifyOpen(true)}>
                Capturar justificante (sin recibo)
              </Button>
            </div>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeMissing}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={attachOpen} onClose={() => setAttachOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Adjuntar recibo existente</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><b># Control:</b> {missingRow?.numeroControl ?? '—'} · <b>Cliente:</b> {missingRow?.cliente ?? '—'}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <TextField fullWidth size="small" placeholder="Buscar por folio, cliente o fecha (YYYY-MM-DD)…"
                value={attachQ} onChange={(e) => setAttachQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchReceipts(attachQ)} />
              <Button variant="outlined" onClick={() => searchReceipts(attachQ)} disabled={attachLoading}>
                {attachLoading ? 'Buscando…' : 'Buscar'}
              </Button>
            </div>
            <div style={{ width: '100%' }}>
              <DataGrid
                rows={attachRows}
                getRowId={(r) => r.id || r._id}
                columns={[
                  { field: 'folio', headerName: 'Folio', width: 120 },
                  { field: 'cliente', headerName: 'Cliente', flex: 1, minWidth: 220 },
                  {
                    field: 'fecha', headerName: 'Fecha', width: 130,
                    valueGetter: (p) => (p?.row?.fecha ? new Date(p.row.fecha).toLocaleDateString('es-MX') : '—')
                  },
                  {
                    field: 'total', headerName: 'Total', width: 120,
                    valueGetter: (p) => (p?.row?.total != null) ? `$ ${Number(p.row.total).toFixed(2)}` : '—'
                  },
                  {
                    field: 'controles', headerName: '# Controles vinculados', width: 190,
                    valueGetter: (p) => Array.isArray(p?.row?.controls) ? p.row.controls.length : 0
                  }
                ]}
                autoHeight loading={attachLoading}
                pageSizeOptions={[5, 10, 25]}
                initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
                disableRowSelectionOnClick
                onRowClick={(params) => setAttachSelectedId(params.id)}
                getRowClassName={(params) => (params.id === attachSelectedId ? 'row-selected' : '')}
              />
            </div>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttachOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={linkReceipt} disabled={!attachSelectedId}>
            Vincular a este control
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={justifyOpen} onClose={() => setJustifyOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Justificante: no se ha generado recibo</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><b># Control:</b> {missingRow?.numeroControl ?? '—'}</div>
            <TextField
              label="Motivo / Justificación" size="small" multiline minRows={3}
              value={justifyText} onChange={(e) => setJustifyText(e.target.value)}
              placeholder="Ejemplo: Falta documentación, pago en validación, etc."
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJustifyOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                await axios.post(`${API}/escrituras/${missingRow._id}/justificante`, { motivo: justifyText });
                setJustifyOpen(false);
                setMsg({ type: 'ok', text: 'Justificante guardado y estatus actualizado a JUSTIFICADO.' });
                setJustifyText('');
                setMissingOpen(false);
                await fetchData();
              } catch (e) {
                setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo guardar el justificante' });
              }
            }}
            disabled={!justifyText?.trim()}
          >
            Guardar justificante
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={justifyViewOpen} onClose={() => setJustifyViewOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Justificante del control</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><b># Control:</b> {justifyViewRow?.numeroControl ?? '—'}</div>
            <div><b>Cliente:</b> {justifyViewRow?.cliente ?? '—'}</div>
            <TextField
              label="Motivo / Justificación" size="small" multiline minRows={3}
              value={justifyViewRow?.justificante_text || '—'} InputProps={{ readOnly: true }}
            />
            <div style={{ fontSize: 12, color: '#666' }}>
              <b>Capturado por:</b> {justifyViewRow?.justificante_by || '—'} ·{' '}
              <b>Fecha:</b>{' '}
              {justifyViewRow?.justificante_at
                ? new Date(justifyViewRow.justificante_at).toLocaleString('es-MX')
                : '—'}
            </div>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJustifyViewOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog
  open={estatusOpen}
  onClose={() => setEstatusOpen(false)}
  fullWidth
  maxWidth="lg"
>
  <DialogTitle>
    Estatus de escritura {estatusRow?.numeroControl ? `#${estatusRow.numeroControl}` : ''}
  </DialogTitle>

  <DialogContent dividers>
  {estatusRow?._id ? (
    <EscrituraEstatus
      escrituraId={estatusRow._id}
      row={estatusRow}
      onClose={() => setEstatusOpen(false)}
    />
  ) : (
    <div style={{ padding: 8 }}>No hay ID de escritura.</div>
  )}
</DialogContent>


  
</Dialog>

      {/* Modal: seleccionar presupuesto para llenar montos */}
      <Dialog open={presupOpen} onClose={closePresupuestoPicker} fullWidth maxWidth="md">
        <DialogTitle>Seleccionar presupuesto</DialogTitle>
        <DialogContent dividers>
          {presupLoading ? (
            <div style={{ padding: 16 }}>Cargando presupuestos…</div>
          ) : presupRows.length === 0 ? (
            <div style={{ padding: 16 }}>No se encontraron presupuestos para este cliente.</div>
          ) : (
            <div style={{ width: '100%' }}>
              <DataGrid
                rows={presupRows}
                getRowId={(r) => r.id}
                autoHeight
                loading={presupLoading}
                pageSizeOptions={[5, 10, 25]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 10, page: 0 } },
                  sorting: { sortModel: [{ field: 'fecha', sort: 'desc' }] },
                }}
                columns={[
  {
    field: 'fecha',
    headerName: 'Fecha',
    width: 130,
    
  },
  {
    field: 'clienteNombre',
    headerName: 'Cliente',
    width: 200,
    
  },
  {
    field: 'descripcion',
    headerName: 'Descripción',
    flex: 1,
    minWidth: 220,
   
  },
  {
    field: 'totalImpuestos',
    headerName: 'Impuestos',
    width: 120,
    
    renderCell: (p) => `$ ${fmtMoney(p.value)}`,
  },
  {
    field: 'valorAvaluo',
    headerName: 'Avalúo',
    width: 120,
   
    renderCell: (p) => `$ ${fmtMoney(p.value)}`,
  },
  {
    field: 'totalGastosExtra',
    headerName: 'Gastos extra',
    width: 130,
   
    renderCell: (p) => `$ ${fmtMoney(p.value)}`,
  },
  {
    field: 'totalHonorarios',
    headerName: 'Honorarios',
    width: 130,
    
    renderCell: (p) => `$ ${fmtMoney(p.value)}`,
  },
  {
    field: 'pick',
    headerName: 'Usar',
    width: 120,
    sortable: false,
    filterable: false,
    renderCell: (params) => (
      <Button
        variant="contained"
        size="small"
        onClick={() => applyPresupuestoToTarget(params.row)}
      >
        Usar
      </Button>
    ),
  },
]}


                disableRowSelectionOnClick
                onRowDoubleClick={(params) => applyPresupuestoToTarget(params.row)}
              />
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePresupuestoPicker}>Cerrar</Button>
        </DialogActions>
      </Dialog>


    </div>
  );
}
