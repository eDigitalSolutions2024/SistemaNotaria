import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

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

export default function Protocolito() {
  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);   // _id de la fila en edición
  const [drafts, setDrafts] = useState({});           // {id: { ...campos }}
  const [adding, setAdding] = useState(false);        // modo agregar
  const [newRow, setNewRow] = useState(emptyRow);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileInputRef = React.useRef(null);
  const [importing, setImporting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/Protocolito`, {
        params: q ? { q } : {}
      });
      setRows(data);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.mensaje || 'Error cargando datos' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [q]); // busca cuando cambia q

  // Acciones
  const onEdit = (row) => {
    setEditingId(row._id);
    setDrafts(prev => ({ ...prev, [row._id]: {
      numeroTramite: row.numeroTramite,
      tipoTramite: row.tipoTramite,
      cliente: row.cliente,
      fecha: formatDateInput(row.fecha),
      abogado: row.abogado
    }}));
  };

  const onCancel = (id) => {
    if (adding && id === 'new') {
      setNewRow(emptyRow);
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

  const validateRow = ({ numeroTramite, tipoTramite, cliente, fecha, abogado }) => {
    if (!numeroTramite || !tipoTramite || !cliente || !fecha || !abogado) {
      return 'Todos los campos son obligatorios';
    }
    if (isNaN(Number(numeroTramite))) return 'El número de trámite debe ser numérico';
    return null;
    };

  const onSaveNew = async () => {
    const err = validateRow(newRow);
    if (err) return setMsg({ type: 'warn', text: err });

    try {
      const payload = {
        numeroTramite: Number(newRow.numeroTramite),
        tipoTramite: newRow.tipoTramite.trim(),
        cliente: newRow.cliente.trim(),
        fecha: newRow.fecha,
        abogado: newRow.abogado.trim()
      };
      const { data } = await axios.post(`${API}/Protocolito`, payload);
      setRows(prev => [data, ...prev]);
      setNewRow(emptyRow);
      setAdding(false);
      setMsg({ type: 'ok', text: 'Registro creado' });
    } catch (err) {
      const t = err.response?.status === 409
        ? 'El número de trámite ya existe'
        : (err.response?.data?.mensaje || 'Error al crear');
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
      const { data } = await axios.put(`${API}/Protocolito/${id}`, payload);
      setRows(prev => prev.map(r => r._id === id ? data : r));
      onCancel(id);
      setMsg({ type: 'ok', text: 'Registro actualizado' });
    } catch (err) {
      const t = err.response?.status === 409
        ? 'El número de trámite ya existe'
        : (err.response?.data?.mensaje || 'Error al actualizar');
      setMsg({ type: 'error', text: t });
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    try {
      await axios.delete(`${API}/Protocolito/${id}`);
      setRows(prev => prev.filter(r => r._id !== id));
      setMsg({ type: 'ok', text: 'Registro eliminado' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.mensaje || 'Error al eliminar' });
    }
  };

  const startAdd = () => {
    setAdding(true);
    setNewRow(emptyRow);
  };

  const RowView = ({ row }) => {
    const isEditing = editingId === row._id;
    const d = drafts[row._id] || {};
    return (
      <tr>
        <td style={{ width: 140 }}>
          {isEditing ? (
            <input
              type="number"
              value={d.numeroTramite ?? ''}
              onChange={e => onChangeDraft(row._id, 'numeroTramite', e.target.value)}
            />
          ) : row.numeroTramite}
        </td>
        <td style={{ width: 200 }}>
          {isEditing ? (
            <input
              type="text"
              value={d.tipoTramite ?? ''}
              onChange={e => onChangeDraft(row._id, 'tipoTramite', e.target.value)}
              placeholder="Tipo de trámite"
            />
          ) : row.tipoTramite}
        </td>
        <td style={{ width: 240 }}>
          {isEditing ? (
            <input
              type="text"
              value={d.cliente ?? ''}
              onChange={e => onChangeDraft(row._id, 'cliente', e.target.value)}
              placeholder="Nombre del cliente"
            />
          ) : row.cliente}
        </td>
        <td style={{ width: 180 }}>
          {isEditing ? (
            <input
              type="date"
              value={d.fecha ?? ''}
              onChange={e => onChangeDraft(row._id, 'fecha', e.target.value)}
            />
          ) : formatDateInput(row.fecha)}
        </td>
        <td style={{ width: 220 }}>
          {isEditing ? (
            <input
              type="text"
              value={d.abogado ?? ''}
              onChange={e => onChangeDraft(row._id, 'abogado', e.target.value)}
              placeholder="Abogado responsable"
            />
          ) : row.abogado}
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {isEditing ? (
            <>
              <button onClick={() => onSaveEdit(row._id)}>Guardar</button>
              <button onClick={() => onCancel(row._id)}>Cancelar</button>
            </>
          ) : (
            <>
              <button onClick={() => onEdit(row)}>Editar</button>
              <button onClick={() => onDelete(row._id)}>Eliminar</button>
            </>
          )}
        </td>
      </tr>
    );
  };

const handleSelectFile = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setImporting(true);
  setMsg(null);
  try {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await axios.post(`${API}/protocolitos/import`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    // refresca la tabla
    await fetchData();
    // muestra resumen
    setMsg({
      type: 'ok',
      text: `Importado: recibidas=${data.recibidas}, procesadas=${data.procesadas}, insertadas=${data.insertadas}, actualizadas=${data.actualizadas}` +
            (data.errores?.length ? `, con ${data.errores.length} fila(s) con error` : '')
    });
  } catch (err) {
    const t = err.response?.data?.mensaje || 'Error al importar';
    setMsg({ type: 'error', text: t });
  } finally {
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
};

  return (
    <div style={{ padding: 16 }}>
      <h2>Protocolito</h2>

      {/* Barra de acciones */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={startAdd} disabled={adding || editingId}>+ Agregar trámite</button>

        {/* Importar Excel */}
        <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleSelectFile}
        />
        <button onClick={() => fileInputRef.current?.click()} disabled={importing}>
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
        <button onClick={fetchData}>Actualizar</button>
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

      {/* Tabla */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={th}># Trámite</th>
              <th style={th}>Tipo de trámite</th>
              <th style={th}>Cliente</th>
              <th style={th}>Fecha</th>
              <th style={th}>Abogado</th>
              <th style={th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr>
                <td>
                  <input
                    type="number"
                    value={newRow.numeroTramite}
                    onChange={e => onChangeDraft('new', 'numeroTramite', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newRow.tipoTramite}
                    onChange={e => onChangeDraft('new', 'tipoTramite', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newRow.cliente}
                    onChange={e => onChangeDraft('new', 'cliente', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={newRow.fecha}
                    onChange={e => onChangeDraft('new', 'fecha', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newRow.abogado}
                    onChange={e => onChangeDraft('new', 'abogado', e.target.value)}
                  />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button onClick={onSaveNew}>Guardar</button>
                  <button onClick={() => onCancel('new')}>Cancelar</button>
                </td>
              </tr>
            )}

            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 16 }}>Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 16 }}>Sin resultados</td></tr>
            ) : (
              rows.map(r => <RowView key={r._id} row={r} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid #ddd'
};
