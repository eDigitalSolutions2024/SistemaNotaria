// src/components/Protocolito.jsx
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { DataGrid } from '@mui/x-data-grid';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Menu, MenuItem
} from '@mui/material';

import { useAuth } from '../auth/AuthContext';

import '../css/styles.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

// ----- utils -----
const emptyRow = {
  _id: null,
  volumen: '',   
  numeroTramite: '',
  tipoTramite: '',
  cliente: '',
  fecha: '',
  abogado: ''
};

function formatDateInput(d) {
  if (!d) return '';
  const date = new Date(d);
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

const timeOf = (r) => {
  const v = r?.hora_llegada ?? r?.horaLlegada ?? r?.createdAt ?? r?.fecha;
  const t = v ? new Date(v).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

// helpers para filtrado por tipo
const tipoFromRow = (r) =>
  (r?.tipoTramite || r?.motivo || r?.servicio || r?.accion || '').trim();
const incluye = (txt, needle) => norm(txt).includes(norm(needle));

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

// >>> PRIORIZA MOTIVO PARA TIPO DE TRÁMITE <<<
function applyClienteToProtocolito(cliente, prev) {
  /*const fechaISO = cliente?.hora_llegada
    ? formatDateInput(cliente.hora_llegada)
    : formatDateInput(new Date());*/
  return {
    ...prev,
    cliente: cliente?.nombre || prev.cliente,
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

// ----- componente -----
export default function Protocolito({ onOpenRecibo }) {

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canExport = ['ADMIN', 'PROTOCOLITO', 'RECEPCION', 'admin', 'protocolito', 'recepcion'].includes(user?.role);
  const canDeliver = ['ADMIN', 'RECEPCION', 'admin', 'recepcion'].includes(user?.role);
  const canSeeAll = ['ADMIN','RECEPCION','admin','recepcion'].includes(user?.role);
  const isAbogado = ['ABOGADO','ASISTENTE','abogado','asistente'].includes(user?.role);
  const canSeeReciboBtn =
  isAbogado || canDeliver; // abogado/asistente + recepcion/admin

const canModifyRecibos =
  canDeliver; // solo recepcion/admin



  const currentUserName =
    user?.nombre || user?.name || user?.fullName || user?.username || '';

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

  // --- Modal: lectura de justificante ---
  const [justifyViewOpen, setJustifyViewOpen] = useState(false);
  const [justifyViewRow, setJustifyViewRow] = useState(null);

  // Observaciones locales por fila
  const [obsDrafts, setObsDrafts] = useState({}); // { [rowId]: "texto" }
  const [obsSaving, setObsSaving] = useState({});   // { [rowId]: boolean }

  const getRowKey = (r) => r?._id ?? r?.id ?? r?.numeroTramite;

  /** Guarda solo 'observaciones' usando tu PUT actual (requiere campos obligatorios) */
  const saveObs = async (id, fallbackRow) => {
    const row = rows.find((r) => getRowKey(r) === id) || fallbackRow;
    if (!row) return;

    const payload = {
      numeroTramite: Number(row.numeroTramite),
      tipoTramite: (row.tipoTramite || row.motivo || row.servicio || row.accion || '').trim(),
      cliente: String(row.cliente || '').trim(),
      fecha: row.fecha,
      abogado: String(row.abogado || '').trim(),
      observaciones: String(obsDrafts[id] ?? '').trim(),
    };

    try {
      setObsSaving((p) => ({ ...p, [id]: true }));
      await axios.put(`${API}/protocolito/${id}`, payload);
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
      control: row?.numeroTramite ?? '',
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
    if (!attachSelectedId || !missingRow?.numeroTramite) return;
    try {
      await axios.post(`${API}/recibos/link`, {
        reciboId: attachSelectedId,
        control: Number(missingRow.numeroTramite)
      });
      setMsg({ type: 'ok', text: 'Recibo vinculado al trámite.' });
      setAttachOpen(false);
      setMissingOpen(false);
      setAttachSelectedId(null);
      fetchData();
    } catch (e) {
      setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo vincular.' });
    }
  };

  // --- Filas visibles por rol ---
  const visibleRows = React.useMemo(() => {
    if (canSeeAll) return rows;
    const me = norm(currentUserName);
    if (!me) return [];
    return rows.filter(r => norm(r?.abogado).includes(me));
  }, [rows, canSeeAll, currentUserName]);

  // Helpers usuarios
  const getUserName = (u) =>
    (u?.nombre || u?.name || u?.fullName || u?.username || '').trim();

  const getUserRoles = (u) => {
    const roles = [];
    if (Array.isArray(u?.roles)) roles.push(...u.roles);
    if (u?.role) roles.push(u.role);
    if (u?.rol) roles.push(u.rol);
    return roles.map((r) => String(r).toLocaleUpperCase('es-MX'));
  };

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
        const id = r?._id ?? r?.id ?? r?.numeroTramite;
        if (id == null) continue;
        if (!(id in next)) { next[id] = r?.observaciones ?? ''; changed = true; }
      }

      const visIds = new Set(
        vis.map((r) => r?._id ?? r?.id ?? r?.numeroTramite).filter((x) => x != null)
      );
      for (const k of Object.keys(next)) {
        if (!visIds.has(k)) { delete next[k]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [visibleRows]);

  // Data inicial
  const buildExportUrl = (format) => {
    const url = new URL(`${API}/protocolito/export`);
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
  const isPoder = incluye(tipo, 'poder');
  const isRatif = incluye(tipo, 'ratific'); // ratificación/ratificacion

  let opciones = [];
  if (isPoder) {
    opciones = plantillas.filter(p => p.type === 'poder');
  } else if (isRatif) {
    opciones = plantillas.filter(p => p.type === 'ratificacion');
  }
  setTplOptions(opciones);
};

const closeTplMenu = () => { setTplAnchorEl(null); setTplRow(null); setTplOptions([]); };

// Descarga por id único
const descargarPlantilla = (id) => {
  window.location.href = `${API}/plantillas/${id}/download`;
  closeTplMenu();
};


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

  const selectClienteFromPicker = (cliente) => {
    if (!cliente) return;
    if (pickerTarget === 'new') {
      setSelectedCliente(cliente);
      setNewRow((prev) => applyClienteToProtocolito(cliente, prev));
      const baseTipo =
        cliente?.motivo || cliente?.tipoTramite || cliente?.servicio || cliente?.accion || '';
      setNewSubtipo(getSubtipoFromTipo(baseTipo));
    } else if (pickerTarget) {
      setDrafts((prev) => ({
        ...prev,
        [pickerTarget]: applyClienteToProtocolito(cliente, prev[pickerTarget] || {})
      }));
    }
    setPickerOpen(false);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/protocolito`, {
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
        numeroTramite: row.numeroTramite,
        tipoTramite: row.tipoTramite || row.motivo || row.servicio || row.accion || '',
        cliente: row.cliente,
        fecha: formatDateInput(row.fecha),
        abogado: row.abogado,
        observaciones: row.observaciones || ''
      }
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onCancel = (id) => {
    if (adding && id === 'new') {
      setNewRow(emptyRow);
      setSelectedCliente(null);
      setAdding(false);
      setNewSubtipo('');
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

  const validateRow = ({ numeroTramite, tipoTramite, cliente, fecha, abogado }) => {
    if (!numeroTramite || !tipoTramite || !cliente || !fecha || !abogado) {
      return 'Todos los campos son obligatorios';
    }
    if (isNaN(Number(numeroTramite))) return 'El número de trámite debe ser numérico';
    return null;
  };

  const onSaveNew = async () => {
    const cid = selectedCliente?._id || selectedCliente?.id;
    if (!cid) return setMsg({ type: 'warn', text: 'Selecciona un cliente primero' });

    try {
      const finalTipo = String(newRow.tipoTramite || '').trim();
      const { data: resp } = await axios.post(`${API}/protocolito`, { clienteId: cid });

      let createdId = resp?.id || resp?._id || resp?.data?._id || null;
      let createdNumero = resp?.numeroTramite || resp?.data?.numeroTramite || null;

      if (!createdId && createdNumero != null) {
        try {
          const { data: list } = await axios.get(`${API}/protocolito`, {
            params: { q: String(createdNumero) }
          });
          const arr = Array.isArray(list) ? list : [];
          const found = arr.find((r) => Number(r?.numeroTramite) === Number(createdNumero));
          if (found?._id) {
            createdId = found._id;
            createdNumero = createdNumero ?? found.numeroTramite;
          }
        } catch {}
      }

      if (createdId && finalTipo) {
        const payloadPut = {
          numeroTramite: Number(createdNumero || 0),
          tipoTramite: finalTipo,
          cliente: String(newRow.cliente || ''),
          fecha: newRow.fecha,
          //abogado: String(newRow.abogado || ''),
        };
        await axios.put(`${API}/protocolito/${createdId}`, payloadPut);
      }

      await fetchData();
      setNewRow(emptyRow);
      setSelectedCliente(null);
      setAdding(false);
      setNewSubtipo('');
      setMsg({ type: 'ok', text: `Trámite ${createdNumero ?? ''} creado` });
    } catch (err2) {
      const t = err2.response?.data?.mensaje || 'Error al crear';
      setMsg({ type: 'error', text: t });
    }
  };

  const onSaveEdit = async (id) => {
    const draft = drafts[id];
    const err = validateRow(draft);
    if (err) return setMsg({ type: 'warn', text: err });

    try {
      const payload = {
        numeroTramite: Number(draft.numeroTramite),
        tipoTramite: draft.tipoTramite.trim(),
        cliente: draft.cliente.trim(),
        fecha: draft.fecha,
        abogado: draft.abogado.trim(),
        ...(isAdmin ? { observaciones: (draft.observaciones || '').trim() } : {})
      };
      await axios.put(`${API}/protocolito/${id}`, payload);
      await fetchData();
      onCancel(id);
      setMsg({ type: 'ok', text: 'Registro actualizado' });
    } catch (err2) {
      const t = err2.response?.status === 409
        ? 'El número de trámite ya existe'
        : (err2.response?.data?.mensaje || 'Error al actualizar');
      setMsg({ type: 'error', text: t });
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    try {
      await axios.delete(`${API}/protocolito/${id}`);
      await fetchData();
      setMsg({ type: 'ok', text: 'Registro eliminado' });
    } catch (err2) {
      setMsg({ type: 'error', text: err2.response?.data?.mensaje || 'Error al eliminar' });
    }
  };

  const startAdd = () => {
    setAdding(true);
    setNewRow(emptyRow);
    setSelectedCliente(null);
    setNewSubtipo('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API}/protocolito/import`, fd, {
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

  const onlyDate = (raw) => {
    if (!raw) return '—';
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('es-MX');
    const m = String(raw).match(/\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
    const i = String(raw).indexOf('T');
    return i > 0 ? String(raw).slice(0, i) : String(raw);
  };

  // ======= Entregar =======
  const openDeliver = async (row) => {
    try {
      setDeliverRow(row);
      setDeliverPhone('—');
      setDeliverNotes('');
      setDeliverOpen(true);

      const { data } = await axios.get(`${API}/protocolito/${row._id}/entrega-info`);
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
      await axios.post(`${API}/protocolito/${deliverRow._id}/entregar`, {
        telefono: deliverPhone && deliverPhone !== '—' ? String(deliverPhone) : undefined,
        notas: deliverNotes || undefined
      });
      setMsg({ type: 'ok', text: 'Trámite marcado como entregado' });
      closeDeliver();
      fetchData();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.mensaje || 'No se pudo marcar como entregado' });
      setDeliverLoading(false);
    }
  };
  // ======= FIN Entregar =======

  // Abrir PDF de recibo
  const openReciboPdf = async (row) => {
    try {
      const numero = row?.numeroTramite;
      if (!numero) {
        setMsg({ type: 'warn', text: 'Este registro no tiene # de trámite.' });
        return;
      }
      const { data } = await axios.get(
        `${API}/recibos/by-control/${encodeURIComponent(numero)}/latest`
      );
      const pdfUrl = `${API}/recibos/${data.id}/pdf`;
      window.open(pdfUrl, '_blank');
    } catch (e) {
      const msg =
        e?.response?.data?.msg ||
        (e?.response?.status === 404
          ? 'No existe un recibo guardado para este trámite.'
          : 'No se pudo abrir el PDF del recibo.');
      setMsg({ type: 'warn', text: msg });
    }
  };

  // Indicador Recibo
  const ReciboIndicator = ({ row }) => {
    const numero = row?.numeroTramite;
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

    if (estado === 'si') {
      return (
        <button
          className="btn btn-primary"
          style={{ padding: '6px 10px', fontSize: 13 }}
          onClick={(e) => { e.stopPropagation(); openReciboPdf(row); }}
        >
          Recibo
        </button>
      );
    }
    if (estado === 'justificado') {
  // ABOGADO: solo texto (no clic)
  if (isAbogado) {
    return (
      <span
        style={{
          padding: '6px 10px',
          fontSize: 13,
          background: '#e6f4ea',
          border: '1px solid #b7dfc5',
          borderRadius: 6,
          lineHeight: 1.2,
          display: 'inline-block'
        }}
        title="Justificado (solo lectura)"
      >
        Justificado
      </span>
    );
  }

  // RECEPCION/ADMIN: sí abre modal lectura
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setJustifyViewRow(row); setJustifyViewOpen(true); }}
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

    // --- cuando NO hay recibo ---
if (estado === 'no') {
  // ABOGADO/ASISTENTE: solo texto, sin opciones
  if (!canModifyRecibos) {
    return (
      <span
        style={{
          padding: '6px 10px',
          fontSize: 13,
          color: '#6b7280',
          borderRadius: 6,
          border: '1px solid #dcdcdc',
          background: '#f9fafb',
          display: 'inline-block'
        }}
        title="Sin recibo registrado"
      >
        Sin recibo
      </span>
    );
  }

  // RECEPCION/ADMIN: sí abre modal opciones
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openMissing(row); }}
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

  };

  // columnas tabla principal
  const baseColumns = [
    { field: 'numeroTramite', headerName: '# Trámite', width: 110, minWidth: 100, type: 'number' },
    {
      field: 'tipoTramite',
      headerName: 'Tipo de trámite',
      flex: 0.9, minWidth: 160,
      valueGetter: (p, row) => {
        const r = p?.row ?? row ?? {};
        return r.tipoTramite || r.motivo || r.servicio || r.accion || '—';
      }
    },
    { field: 'cliente', headerName: 'Cliente', flex: 1.4, minWidth: 240 },
    {
      field: 'fecha',
      headerName: 'Fecha',
      width: 120, minWidth: 110,
      renderCell: (params) => onlyDate(params?.row?.createdAt ?? params?.row?.fecha),
      sortComparator: (_v1, _v2, c1, c2) => {
        const ra = c1?.row?.createdAt ?? c1?.row?.fecha;
        const rb = c2?.row?.createdAt ?? c2?.row?.fecha;
        return (Date.parse(ra) || 0) - (Date.parse(rb) || 0);
      },

      sortComparator: (_v1, _v2, cellParams1, cellParams2) => {
        const ra = cellParams1?.row?.fecha;
        const rb = cellParams2?.row?.fecha;
        const ta = Date.parse(ra);
        const tb = Date.parse(rb);
        return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
      },
    },
    { field: 'abogado', headerName: 'Abogado', width: 140, minWidth: 130 },
     { field: 'volumen', headerName: 'Volumen', width: 110, minWidth: 90, type: 'number' }, // ✅ NUEVO
  ];

  const plantillasColumn = {
  field: 'plantillas',
  headerName: 'Plantillas',
  width: 150, minWidth: 140,
  sortable: false,
  filterable: false,
  renderCell: (params) => {
    const t = tipoFromRow(params.row);
    const label =
      incluye(t, 'poder') ? 'Descargar (Poder)' :
      incluye(t, 'ratific') ? 'Descargar (Ratificación)' :
      'Descargar';
    return (
      <button
        className="btn btn-editar"
        style={{ padding: '6px 10px', fontSize: 13 }}
        onClick={(e) => { e.stopPropagation(); openTplMenu(e, params.row); }}

      >
        {label}
      </button>
    );
  }
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
              title={entregado ? 'Ya entregado' : 'Marcar como entregado'}
            >
              {entregado ? 'Entregado' : 'Entregar'}
            </button>
          )}
        </div>
      );
    }
  };

  // Columna de Observaciones (solo admin)
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
        if (e.key === 'Enter' && e.shiftKey) return; // salto de línea
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

  // === Construcción de columnas ===
  const showActionsColumn = isAdmin || canSeeReciboBtn;
  const columns = [
    ...baseColumns,
    plantillasColumn,
    ...(showActionsColumn ? [actionsColumn] : []),
    ...(isAdmin ? [observacionesColumn] : []), // <- SOLO ADMIN
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
      <h2>Protocolito</h2>

      {/* Barra de acciones */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={startAdd} disabled={adding || editingId}>+ Agregar trámite</button>

        {/* Importar Excel */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleSelectFile}
        />
        <button className="btn btn-primary btn-excel" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          {importing ? 'Importando…' : 'Importar Excel'}
        </button>

        {/* Exportar */}
        {canExport && (
          <Button variant="text" onClick={() => setExportOpen(true)}>
            Exportar protocolito
          </Button>
        )}

        <input
          type="text"
          placeholder="Buscar por número, cliente, tipo o abogado"
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

          <input type="hidden" value={newRow.numeroTramite ? String(newRow.numeroTramite) : ''} readOnly />

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

          <div style={{ whiteSpace: 'nowrap' }}>
            <button onClick={onSaveNew} disabled={!selectedCliente}>Guardar</button>
            <button onClick={() => onCancel('new')} style={{ marginLeft: 8 }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Panel de edición */}
      {editingId && (
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1.2fr 180px 220px auto', gap: 8, marginBottom: 12, background: '#f9fafb', padding: 8, borderRadius: 8 }}>
          <input
            type="number"
            value={drafts[editingId]?.numeroTramite ?? ''}
            onChange={e => onChangeDraft(editingId, 'numeroTramite', e.target.value)}
            placeholder="# Trámite"
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
            row?._id ?? row?.id ?? row?.numeroTramite ?? `${row?.cliente}-${row?.fecha}`
          }
          columns={columns}
          loading={loading}
          getRowHeight={() => 'auto'} // la fila crece con el textarea
          density="standard"
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25, page: 0 } },
            sorting: { sortModel: [{ field: 'fecha', sort: 'desc' }] }
          }}
          disableRowSelectionOnClick
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
                <MenuItem key={p.key} onClick={() => descargarPlantilla(p.id)}>
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

      {/* Modal Exportar protocolito */}
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Exportar protocolito</DialogTitle>
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
        <DialogTitle>Entregar trámite</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <TextField label="Cliente" size="small" value={deliverRow?.cliente || '—'} InputProps={{ readOnly: true }} />
            <TextField label="Número de trámite" size="small" value={deliverRow?.numeroTramite ?? '—'} InputProps={{ readOnly: true }} />
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
        <DialogTitle>Este trámite no tiene recibo</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><b>Trámite:</b> {missingRow?.numeroTramite ?? '—'}</div>
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
            <div><b># Trámite:</b> {missingRow?.numeroTramite ?? '—'} · <b>Cliente:</b> {missingRow?.cliente ?? '—'}</div>
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
                    field: 'controles', headerName: '# Trámites vinculados', width: 190,
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
            Vincular a este trámite
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={justifyOpen} onClose={() => setJustifyOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Justificante: no se ha generado recibo</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><b># Trámite:</b> {missingRow?.numeroTramite ?? '—'}</div>
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
                await axios.post(`${API}/protocolito/${missingRow._id}/justificante`, { motivo: justifyText });
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
        <DialogTitle>Justificante del trámite</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><b># Trámite:</b> {justifyViewRow?.numeroTramite ?? '—'}</div>
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
    </div>
  );
}
