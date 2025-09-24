// src/components/Protocolito.jsx
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { DataGrid } from '@mui/x-data-grid';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField
} from '@mui/material';
import { useAuth } from '../auth/AuthContext'; // ⬅️ para saber si es admin
import '../css/styles.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

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

// normaliza texto (sin acentos, lowercase)
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// candidato a Protocolito: acción contiene “iniciar”
const isEligible = (c) => norm(c?.accion).includes('iniciar');

// timestamp util para ordenar por “más reciente”
const timeOf = (r) => {
  const v = r?.hora_llegada ?? r?.horaLlegada ?? r?.createdAt ?? r?.fecha;
  const t = v ? new Date(v).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

// mapea datos de cliente a protocolo (para previsualizar)
function applyClienteToProtocolito(cliente, prev) {
  const fechaISO = cliente?.hora_llegada
    ? formatDateInput(cliente.hora_llegada)
    : formatDateInput(new Date());
  return {
    ...prev,
    cliente: cliente?.nombre || prev.cliente,
    tipoTramite: cliente?.servicio || cliente?.accion || prev.tipoTramite,
    abogado: cliente?.abogado || prev.abogado,
    fecha: prev.fecha || fechaISO,
  };
}

// helper para soportar ambas firmas de valueGetter (params) o (value,row)
const pickRowFromVG = (p, row) => (p && p.row) ? p.row : (row || p || {});

export default function Protocolito() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState(emptyRow);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  // ---------- Selector de clientes (modal) ----------
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerRows, setPickerRows] = useState([]);
  const [pickerTarget, setPickerTarget] = useState(null); // 'new' | id en edición
  const pickerTimer = useRef(null);

  const fetchPicker = async (query) => {
    const qstr = norm(query);
    setPickerLoading(true);
    try {
      let list = [];

      // 1) intentar /clientes/search
      try {
        const { data } = await axios.get(`${API}/clientes/search`, {
          params: { q: query, status: 'iniciar' }
        });
        if (Array.isArray(data) && data.length) list = data;
      } catch {
        // sigue al fallback
      }

      // 2) fallback a /clientes
      if (!Array.isArray(list) || list.length === 0) {
        const { data } = await axios.get(`${API}/clientes`);
        list = Array.isArray(data) ? data : [];
      }

      // 3) filtrar a elegibles (iniciar trámite)
      let elegibles = list.filter(isEligible);

      // 4) filtro de texto (nombre/abogado)
      if (qstr) {
        elegibles = elegibles.filter(
          (c) => norm(c?.nombre).includes(qstr) || norm(c?.abogado).includes(qstr)
        );
      }

      // 5) ordenar por más reciente (hora_llegada/createdAt/fecha) DESC
      elegibles = (Array.isArray(elegibles) ? elegibles : [])
        .filter(Boolean)
        .sort((a, b) => timeOf(b) - timeOf(a));

      setPickerRows(elegibles);
    } catch {
      setPickerRows([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const openPickerFor = (target) => {
    setPickerTarget(target); // 'new' o editingId
    setPickerOpen(true);
    setPickerQ('');
    fetchPicker('');
  };

  const onChangePickerQ = (v) => {
    setPickerQ(v);
    clearTimeout(pickerTimer.current);
    pickerTimer.current = setTimeout(() => fetchPicker(v), 250);
  };

  // seleccionar cliente del picker
  const selectClienteFromPicker = (cliente) => {
    if (!cliente) return;
    if (pickerTarget === 'new') {
      setSelectedCliente(cliente);
      setNewRow((prev) => applyClienteToProtocolito(cliente, prev));
    } else if (pickerTarget) {
      setDrafts((prev) => ({
        ...prev,
        [pickerTarget]: applyClienteToProtocolito(cliente, prev[pickerTarget] || {})
      }));
    }
    setPickerOpen(false);
  };
  // --------------------------------------------------

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/Protocolito`, {
        params: q ? { q } : {}
      });
      setRows(Array.isArray(data) ? data : []); // defensivo
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.mensaje || 'Error cargando datos' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [q]);

  // ====== Acciones ======
  const onEdit = (row) => {
    setEditingId(row._id);
    setDrafts(prev => ({
      ...prev,
      [row._id]: {
        numeroTramite: row.numeroTramite,
        tipoTramite: row.tipoTramite,
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
    }
    setEditingId(null);
    setDrafts(prev => {
      const cp = { ...prev };
      delete cp[id];
      return cp;
    });
  };

  const onChangeDraft = (id, field, value) => {
    if (id === 'new') {
      setNewRow(prev => ({ ...prev, [field]: value }));
    } else {
      setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    }
  };

  // Validación para EDITAR
  const validateRow = ({ numeroTramite, tipoTramite, cliente, fecha, abogado }) => {
    if (!numeroTramite || !tipoTramite || !cliente || !fecha || !abogado) {
      return 'Todos los campos son obligatorios';
    }
    if (isNaN(Number(numeroTramite))) return 'El número de trámite debe ser numérico';
    return null;
  };

  // Guardar NUEVO: solo con clienteId, backend completa y genera el número
  const onSaveNew = async () => {
    const cid = selectedCliente?._id || selectedCliente?.id;
    if (!cid) {
      return setMsg({ type: 'warn', text: 'Selecciona un cliente primero' });
    }
    try {
      const payload = { clienteId: cid };
      const { data } = await axios.post(`${API}/Protocolito`, payload);
      await fetchData();
      setNewRow(emptyRow);
      setSelectedCliente(null);
      setAdding(false);
      setMsg({ type: 'ok', text: `Trámite ${data?.numeroTramite ?? ''} creado` });
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
        fecha: draft.fecha, // YYYY-MM-DD
        abogado: draft.abogado.trim()
      };
      await axios.put(`${API}/Protocolito/${id}`, payload);
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
      await axios.delete(`${API}/Protocolito/${id}`);
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
        text: `Importado: recibidas=${data.recibidas}, procesadas=${data.procesadas}, insertadas=${data.insertadas}, actualizadas=${data.actualizadas}` +
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

  // Muestra solo la fecha (dd/mm/aaaa) desde lo que venga del backend
  const onlyDate = (raw) => {
    if (!raw) return '—';
    // 1) Si parsea como Date (ISO, Date, timestamp), úsalo
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('es-MX');

    // 2) Fallback: si trae 'YYYY-MM-DD', úsalo tal cual
    const m = String(raw).match(/\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];

    // 3) Último recurso: intenta cortar antes de la "T"
    const i = String(raw).indexOf('T');
    return i > 0 ? String(raw).slice(0, i) : String(raw);
  };

  // ====== Columnas de la tabla principal ======
  const baseColumns = [
    { field: 'numeroTramite', headerName: '# Trámite', width: 130, type: 'number' },
    { field: 'tipoTramite',   headerName: 'Tipo de trámite', flex: 1, minWidth: 160 },
    { field: 'cliente',       headerName: 'Cliente',         flex: 1.2, minWidth: 200 },
    {
      field: 'fecha',
      headerName: 'Fecha',
      width: 140,
      // Solo mostramos texto formateado
      renderCell: (params) => onlyDate(params?.row?.fecha),
      // Ordenar por la fecha cruda del row (no por el texto renderizado)
      sortComparator: (_v1, _v2, cellParams1, cellParams2) => {
        const ra = cellParams1?.row?.fecha;
        const rb = cellParams2?.row?.fecha;
        const ta = Date.parse(ra);
        const tb = Date.parse(rb);
        return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
      },
    },
    {
      field: 'abogado',
      headerName: 'Abogado',
      width: 180,
    },
  ];

  // Columna de acciones SOLO si es admin
  const actionsColumn = {
    field: 'acciones',
    headerName: 'Acciones',
    sortable: false,
    filterable: false,
    width: 200,
    renderCell: (params) => (
      <>
        <button className="btn btn-primary btn-editar" onClick={() => onEdit(params.row)}>Editar</button>
        <button className="btn btn-primary btn-eliminar" onClick={() => onDelete(params.row._id)} style={{ marginLeft: 8 }}>Eliminar</button>
      </>
    )
  };

  const columns = isAdmin ? [...baseColumns, actionsColumn] : baseColumns;

  // ====== Columnas del selector de clientes ======
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
      field: 'servicio',
      headerName: 'Servicio/Acción',
      width: 180,
      valueGetter: (p, row) => {
        const r = pickRowFromVG(p, row);
        return r?.servicio || r?.accion || '—';
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
        <a href={`${API}/protocolito/template`} target="_blank" rel="noreferrer">
          Descargar plantilla
        </a>

        <input
          type="text"
          placeholder="Buscar por número, cliente, tipo o abogado"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 260, maxWidth: 480 }}
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

      {/* Panel de agregar (preview) */}
      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1.2fr 180px 220px auto', gap: 8, marginBottom: 12 }}>
          <Button variant="outlined" onClick={() => openPickerFor('new')}>
            SELECCIONAR CLIENTE
          </Button>

          <input
            type="text"
            value={newRow.numeroTramite ? String(newRow.numeroTramite) : 'Autogenerado'}
            readOnly
            disabled
            placeholder="# Trámite"
          />

          <input
            type="text"
            value={newRow.tipoTramite}
            readOnly
            disabled
            placeholder="Tipo de trámite"
          />

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
      <div style={{ width: '100%' }}>
        <DataGrid
          rows={rows}
          getRowId={(row) =>
            row?._id ?? row?.id ?? row?.numeroTramite ?? `${row?.cliente}-${row?.fecha}`
          }
          columns={columns}
          loading={loading}
          autoHeight
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25, page: 0 } },
            sorting: { sortModel: [{ field: 'fecha', sort: 'desc' }] } // más reciente primero
          }}
          disableRowSelectionOnClick
          sx={{
            border: '1px solid #eee',
            '& .MuiDataGrid-columnHeaders': { backgroundColor: '#f5f5f5' }
          }}
        />
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
    </div>
  );
}
