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
  // después puedes agregar más: escritura: [...], contrato: [...]
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
  const fechaISO = cliente?.hora_llegada
    ? formatDateInput(cliente.hora_llegada)
    : formatDateInput(new Date());
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
    fecha: prev.fecha || fechaISO,
  };
}

const pickRowFromVG = (p, row) => (p && p.row) ? p.row : (row || p || {});

// ----- componente -----
export default function Protocolito() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canExport = ['ADMIN', 'PROTOCOLITO', 'RECEPCION', 'admin', 'protocolito', 'recepcion'].includes(user?.role);
  const canDeliver = ['ADMIN', 'RECEPCION', 'admin', 'recepcion'].includes(user?.role);
  const canSeeAll = ['ADMIN','RECEPCION','admin','recepcion'].includes(user?.role);
  // Tomamos el nombre del abogado de la sesión (campo "nombre")
  const currentUserName =
    user?.nombre || user?.name || user?.fullName || user?.username || '';

  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState(emptyRow);
  const [newSubtipo, setNewSubtipo] = useState(''); // subtipo para "Poder"
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


// --- opciones de abogados para el modal de exportar (desde el CATÁLOGO del sistema) ---
const [abogadosOpts, setAbogadosOpts] = useState([]);
const [abogadosLoading, setAbogadosLoading] = useState(false);

// Helper: nombre y rol
const getUserName = (u) =>
  (u?.nombre || u?.name || u?.fullName || u?.username || '').trim();

const getUserRoles = (u) => {
  const roles = [];
  if (Array.isArray(u?.roles)) roles.push(...u.roles);
  if (u?.role) roles.push(u.role);
  if (u?.rol) roles.push(u.rol);
  return roles.map((r) => String(r).toLocaleUpperCase('es-MX'));
};

// Carga desde endpoints comunes de usuarios; toma solo quienes tengan rol ABOGADO
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

    // Intenta endpoints típicos de catálogo de usuarios (ajusta el que tengas en tu backend)
    let raw =
      (await attempt(`${API}/abogados`)) ||
      (await attempt(`${API}/usuarios`, { rol: 'ABOGADO' })) ||
      (await attempt(`${API}/users`, { role: 'ABOGADO' })) ||
      (await attempt(`${API}/usuarios`)) ||
      (await attempt(`${API}/users`));

    let arr = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
    if (!Array.isArray(arr)) arr = [];

    // Filtra solo ABOGADOS si el endpoint devuelve todos los usuarios
    const soloAbogados = arr.filter((u) => {
      const roles = getUserRoles(u);
      // Ajusta si usas otro nombre para el rol
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

// Cargar listado cuando el modal se abre
useEffect(() => {
  if (exportOpen) loadAbogadosFromRegistry();
}, [exportOpen]);


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

  // Abre menú y filtra opciones por tipo de trámite (de momento solo "Poder")
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

  // descarga directa
  const descargarPlantilla = (key) => {
    window.location.href = `${API}/plantillas/${key}/download`;
    closeTplMenu();
  };

  const fetchPicker = async (query) => {
    setPickerLoading(true);
    try {
      let list = [];
      try {
        const { data } = await axios.get(`${API}/clientes/search`, {
          params: { q: query}
        });
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
        // preferimos lo que ya venga guardado en BD
        tipoTramite: row.tipoTramite || row.motivo || row.servicio || row.accion || '',
        cliente: row.cliente,
        fecha: formatDateInput(row.fecha),
        abogado: row.abogado
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

  // crear (autogenera número en backend)
  // crear (autogenera número en backend) + guardar tipo con subtipo (Poder Revocable/Irrevocable)
const onSaveNew = async () => {
  const cid = selectedCliente?._id || selectedCliente?.id;
  if (!cid) return setMsg({ type: 'warn', text: 'Selecciona un cliente primero' });

  try {
    // El tipo final ya incluye el subtipo porque lo actualizamos al cambiar el <select>
    const finalTipo = String(newRow.tipoTramite || '').trim();

    // 1) Crear (autogenera numeroTramite)
    const { data: resp } = await axios.post(`${API}/protocolito`, { clienteId: cid });

    // Intentamos obtener id y numeroTramite de la respuesta (según tu backend)
    let createdId =
      resp?.id || resp?._id || resp?.data?._id || null;
    let createdNumero =
      resp?.numeroTramite || resp?.data?.numeroTramite || null;

    // 2) Si no tenemos id pero sí el número, buscamos el registro para obtener el _id
    if (!createdId && createdNumero != null) {
      try {
        const { data: list } = await axios.get(`${API}/protocolito`, {
          params: { q: String(createdNumero) }
        });
        const arr = Array.isArray(list) ? list : [];
        const found = arr.find(
          (r) => Number(r?.numeroTramite) === Number(createdNumero)
        );
        if (found?._id) {
          createdId = found._id;
          // por si el backend no regresó el número en el POST
          createdNumero = createdNumero ?? found.numeroTramite;
        }
      } catch {
        /* no pasa nada, continuamos */
      }
    }

    // 3) Si tenemos id, actualizamos para guardar el tipo con subtipo
    //    (El PUT de edición exige: numeroTramite, tipoTramite, cliente, fecha, abogado)
    if (createdId && finalTipo) {
      // Aseguramos tener todos los campos requeridos por tu PUT
      const payloadPut = {
        numeroTramite: Number(createdNumero || 0),
        tipoTramite: finalTipo,
        cliente: String(newRow.cliente || ''),
        fecha: newRow.fecha,            // ya viene en formato yyyy-mm-dd
        abogado: String(newRow.abogado || ''),
      };
      await axios.put(`${API}/protocolito/${createdId}`, payloadPut);
    }

    // 4) Refrescamos y limpiamos UI
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
        abogado: draft.abogado.trim()
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

  // ======= NUEVO: flujo de Entregar =======
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
  // ======= FIN NUEVO =======

  // Abre/descarga el PDF del recibo más reciente cuyo "control" = numeroTramite
  const openReciboPdf = async (row) => {
    try {
      const numero = row?.numeroTramite;
      if (!numero) {
        setMsg({ type: 'warn', text: 'Este registro no tiene # de trámite.' });
        return;
      }

      // 1) Busca el último recibo guardado para este #Trámite (control)
      const { data } = await axios.get(
        `${API}/recibos/by-control/${encodeURIComponent(numero)}/latest`
      );

      // 2) Abre el PDF en una pestaña nueva
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

  // Muestra el botón "Recibo" si existe; si no, un label gris "No tiene recibo"
  const ReciboIndicator = ({ row }) => {
    const numero = row?.numeroTramite;
    const [estado, setEstado] = React.useState('loading'); // 'loading' | 'si' | 'no'

    React.useEffect(() => {
      let alive = true;
      if (!numero) { setEstado('no'); return; }

      (async () => {
        try {
          await axios.get(`${API}/recibos/by-control/${encodeURIComponent(numero)}/latest`);
          if (alive) setEstado('si');
        } catch {
          if (alive) setEstado('no');
        }
      })();

      return () => { alive = false; };
    }, [numero]);

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

    // label cuando no hay recibo
    return (
      <span
        style={{
          padding: '6px 10px',
          fontSize: 13,
          background: '#e9ecef',
          border: '1px solid #dcdcdc',
          borderRadius: 6,
          lineHeight: 1.2,
          cursor: 'default'
        }}
        title="No existe un recibo guardado para este trámite"
      >
        No tiene recibo
      </span>
    );
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
      renderCell: (params) => onlyDate(params?.row?.fecha),
      sortComparator: (_v1, _v2, cellParams1, cellParams2) => {
        const ra = cellParams1?.row?.fecha;
        const rb = cellParams2?.row?.fecha;
        const ta = Date.parse(ra);
        const tb = Date.parse(rb);
        return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
      },
    },
    { field: 'abogado', headerName: 'Abogado', width: 140, minWidth: 130 },
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
          {/* SOLO ADMIN */}
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
          {canDeliver && <ReciboIndicator row={r} />}

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

  const showActionsColumn = isAdmin || canDeliver;
  const columns = showActionsColumn
    ? [...baseColumns, plantillasColumn, actionsColumn]
    : [...baseColumns, plantillasColumn];

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

  // --- NUEVO: filas visibles según el rol ---
  // Admin/Recepción ven todo. Los abogados ven solo sus propios trámites (coincidencia por nombre).
  const visibleRows = React.useMemo(() => {
    if (canSeeAll) return rows;          // admin/recepción
    const me = norm(currentUserName);    // ej: "alexa lopez"
    if (!me) return [];
    return rows.filter(r => norm(r?.abogado).includes(me));
  }, [rows, canSeeAll, currentUserName]);

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

          {/* Oculto: número autogenerado */}
          <input
            type="hidden"
            value={newRow.numeroTramite ? String(newRow.numeroTramite) : ''}
            readOnly
          />

          <input
            type="text"
            value={newRow.tipoTramite}
            readOnly
            disabled
            placeholder="Tipo de trámite"
          />

          {/* Subtipo visible si es PODER */}
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

          <input
            type="text"
            value={newRow.cliente}
            readOnly
            disabled
            placeholder="Nombre del cliente"
          />

          <input
            type="text"
            value={newRow.fecha}
            readOnly
            disabled
            placeholder="Fecha"
          />

          <input
            type="text"
            value={newRow.abogado}
            readOnly
            disabled
            placeholder="Abogado responsable"
          />

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

          {/* Subtipo visible si es PODER */}
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
          <input
            type="date"
            value={drafts[editingId]?.fecha ?? ''}
            onChange={e => onChangeDraft(editingId, 'fecha', e.target.value)}
          />
          <input
            type="text"
            value={drafts[editingId]?.abogado ?? ''}
            onChange={e => onChangeDraft(editingId, 'abogado', e.target.value)}
            placeholder="Abogado responsable"
          />
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
          rowHeight={50}
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
            '& .MuiDataGrid-cell': { py: 0.5 },
            '& .MuiDataGrid-row': { maxHeight: 44 },
            '& .MuiDataGrid-cellContent': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
          }}
        />

        <Menu
          anchorEl={tplAnchorEl}
          open={Boolean(tplAnchorEl)}
          onClose={closeTplMenu}
        >
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
            fullWidth
            size="small"
            placeholder="Buscar cliente…"
            value={pickerQ}
            onChange={(e) => onChangePickerQ(e.target.value)}
            sx={{ mb: 2 }}
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
              <TextField
                label="Desde"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={filtroFrom}
                onChange={(e) => setFiltroFrom(e.target.value)}
              />
              <TextField
                label="Hasta"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={filtroTo}
                onChange={(e) => setFiltroTo(e.target.value)}
              />
            </div>

            <TextField
              label="Cliente (contiene)"
              placeholder="Ej. Juan Pérez"
              size="small"
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
            />



            <TextField
              select
              label="Abogado"
              size="small"
              value={filtroAbogado}
              onChange={(e) => setFiltroAbogado(e.target.value)}
              helperText="Selecciona un abogado para filtrar"
            >
              <MenuItem value="">(Todos)</MenuItem>
              {abogadosLoading ? (
                <MenuItem disabled>Cargando…</MenuItem>
              ) : (
                abogadosOpts.map((nombre) => (
                  <MenuItem key={nombre} value={nombre}>
                    {nombre}
                  </MenuItem>
                ))
              )}
            </TextField>





          </div>
        </DialogContent>
        <DialogActions style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="contained" onClick={() => handleExport('excel')}>
              Exportar Excel
            </Button>
            <Button variant="outlined" onClick={() => handleExport('pdf')}>
              Exportar PDF
            </Button>
          </div>
          <Button onClick={() => setExportOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* NUEVO: Modal de Entregar */}
      <Dialog open={deliverOpen} onClose={closeDeliver} fullWidth maxWidth="sm">
        <DialogTitle>Entregar trámite</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'grid', gap: 12 }}>
            <TextField
              label="Cliente"
              size="small"
              value={deliverRow?.cliente || '—'}
              InputProps={{ readOnly: true }}
            />
            <TextField
              label="Número de trámite"
              size="small"
              value={deliverRow?.numeroTramite ?? '—'}
              InputProps={{ readOnly: true }}
            />
            <TextField
              label="Teléfono"
              size="small"
              value={deliverPhone}
              onChange={(e) => setDeliverPhone(e.target.value)}
              helperText="Para contactar al cliente al momento de entrega"
            />
            <TextField
              label="Notas"
              size="small"
              multiline
              minRows={2}
              value={deliverNotes}
              onChange={(e) => setDeliverNotes(e.target.value)}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeliver}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={confirmDeliver}
            disabled={deliverLoading}
          >
            {deliverLoading ? 'Entregando…' : 'Entregar'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
