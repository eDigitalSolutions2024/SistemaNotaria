// frontend/src/components/ConsultarRecibos.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { DataGrid } from '@mui/x-data-grid';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

// Helper: sacar role del JWT guardado en localStorage como "token"
function getRoleFromToken() {
  try {
    let token = localStorage.getItem('token');
    if (!token) return null;

    // quita "Bearer "
    token = token.replace(/^Bearer\s+/i, '');

    const [, b64] = token.split('.');
    if (!b64) return null;

    const json = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));

    const raw =
      json.role ??
      json.rol ??
      json.roles?.[0] ??
      json.user?.role ??
      json.user?.rol ??
      null;

    return raw ? String(raw).toUpperCase() : null;
  } catch {
    return null;
  }
}


export default function ConsultarRecibos({ onOpenRecibo }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState(null);

  // lista de abogados detectados para el modal de exportación
  const [abogadosSet, setAbogadosSet] = useState([]);

  // --- modal de exportación ---
  const [openExport, setOpenExport] = useState(false);
  const [exDesde, setExDesde] = useState('');
  const [exHasta, setExHasta] = useState('');
  const [exAbogadoQ, setExAbogadoQ] = useState('');
  const [exAbogadosSel, setExAbogadosSel] = useState([]);

  // --- modal de cancelación ---
  const [openCancel, setOpenCancel] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null); // { id, numero, cliente, total }

  // --- modal para ver motivo ---
  const [openReason, setOpenReason] = useState(false);
  const [reasonTarget, setReasonTarget] = useState(null); // { numero, motivo, fecha, usuarioNombre }

  // role
  const [role, setRole] = useState(null);
  useEffect(() => { setRole(getRoleFromToken()); }, []);


  useEffect(() => {
  const local = getRoleFromToken();
  if (local) { setRole(local); return; }

  // Fallback: pide /auth/me (ajusta la ruta a tu API)
  axios.get(`${API}/auth/me`, { withCredentials: true })
    .then(({ data }) => setRole(String(data?.role || data?.user?.role || '').toUpperCase()))
    .catch(() => setRole(null));
}, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (q) params.q = q;
      if (desde) params.desde = desde;
      if (hasta) params.hasta = hasta;
      params.estatus = 'Todos'; // <- mostrar Activos y Cancelados

      const { data } = await axios.get(`${API}/recibos`, { params });
      const mapped = (Array.isArray(data) ? data : data?.items || []).map((r, i) => ({
        id: r._id || r.id || i,
        ...r
      }));
      setRows(mapped);

      const uniq = Array.from(
        new Set(
          mapped.map(r => (r?.abogado || '').trim()).filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, 'es'));
      setAbogadosSet(uniq);
    } catch (e) {
      console.error(e);
      setError('No se pudieron cargar los recibos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Reemplaza tu onlyDate por esta:
const onlyDate = (d) => {
  if (!d) return '';

  // 1) Si ya es fecha "plana" (sin hora), respétala.
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return d;
  }

  const dt = new Date(d);
  if (isNaN(dt)) return '';

  // 2) ¿Es exactamente medianoche en UTC? (caso típico guardado como 00:00:00Z)
  const isMidnightUTC =
    dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0;

  if (isMidnightUTC) {
    // Usa partes UTC para no “bajar” un día en la zona local
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // 3) Para datetimes reales, muestra en horario local del usuario
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};


  const openCancelModal = (row) => {
    setCancelTarget({
      id: row._id || row.id,
      numero: (row._id || row.id) ? String(row._id || row.id).slice(-4).toUpperCase() : '',
      cliente: row.recibiDe || '',
      total: row.total ?? row.totalPagado ?? 0
    });
    setCancelMotivo('');
    setOpenCancel(true);
  };
  const closeCancelModal = () => setOpenCancel(false);

  const submitCancel = async () => {
    if (!cancelTarget?.id) return;
    if (!cancelMotivo.trim()) {
      alert('Por favor escribe el motivo de la cancelación.');
      return;
    }
    try {
      setLoading(true);
      await axios.patch(`${API}/recibos/${cancelTarget.id}/cancel`, {
        motivo: cancelMotivo.trim()
      });
      setOpenCancel(false);
      await fetchData();
    } catch (e) {
      console.error(e);
      alert('No se pudo cancelar el recibo.');
    } finally {
      setLoading(false);
    }
  };

  // abrir modal para ver motivo
  const openReasonModal = (row) => {
    const num = (row._id || row.id) ? String(row._id || row.id).slice(-4).toUpperCase() : '';
    setReasonTarget({
      numero: num,
      motivo: row?.cancelacion?.motivo || '(Sin motivo registrado)',
      fecha: row?.cancelacion?.fecha ? new Date(row.cancelacion.fecha) : null,
      usuarioNombre: row?.cancelacion?.usuarioNombre || ''
    });
    setOpenReason(true);
  };
  const closeReasonModal = () => setOpenReason(false);

  const columns = useMemo(() => ([
    {
      field: 'numeroRecibo',
      headerName: 'No. Recibo',
      width: 110,
      valueGetter: (_v, row) => {
        const id = row?._id || row?.id || '';
        return id ? String(id).slice(-5).toUpperCase() : '';
      },
    },
    {
      field: 'fecha',
      headerName: 'Fecha',
      width: 130,
      valueGetter: (_v, row) => onlyDate(row?.fecha),
    },
    { field: 'recibiDe', headerName: 'Cliente', flex: 1, maxWidth: 180 },
    { field: 'concepto', headerName: 'Concepto', flex: 1.2, minWidth: 220 },
    {
      field: 'total',
      headerName: 'Total',
      width: 120,
      valueGetter: (_v, row) =>
        row?.total != null
          ? `$ ${Number(row.total).toFixed(2)}`
          : (row?.totalPagado != null ? `$ ${Number(row.totalPagado).toFixed(2)}` : ''),
    },
    { field: 'abogado', headerName: 'Abogado', width: 200, valueGetter: (_v, row) => row?.abogado || '' },

    // Estatus visual
    {
      field: 'estatus',
      headerName: 'Estatus',
      width: 120,
      valueGetter: (_v, row) => row?.estatus || '',
      renderCell: (params) => {
        const v = (params.value || '').toString();
        if (v === 'Cancelado') {
          return (
            <span style={{
              padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700,
              background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca'
            }}>
              Cancelado
            </span>
          );
        }
        return <span style={{ fontSize: 12, opacity: .8 }}>{v || 'Activo'}</span>;
      }
    },

    {
      field: 'acciones',
      headerName: 'Acciones',
      width: 240,
      sortable: false,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const id = params.row._id || params.row.id;
        const estatus = (params.row?.estatus || '').toString();
        const isAdmin = role === 'ADMIN';

        const openPdf = (e) => {
          e.stopPropagation();
          window.open(`${API}/recibos/${id}/pdf`, '_blank');
        };
        const onCancel = (e) => {
          e.stopPropagation();
          openCancelModal(params.row);
        };
        const onViewReason = (e) => {
          e.stopPropagation();
          openReasonModal(params.row);
        };

        const btnBase = {
          marginTop: 15,
          color: '#fff',
          border: 'none',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,.08)',
          transition: 'transform .06s ease, filter .15s ease',
          lineHeight: 1.2,
        };

        return (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button
              onClick={openPdf}
              title="Abrir PDF"
              style={{ ...btnBase, background: '#ef4444' }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(0.95)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = '')}
            >
              PDF
            </button>

            {/* Si está Cancelado → botón "Ver motivo" (para todos) */}
            {estatus === 'Cancelado' ? (
              <button
                onClick={onViewReason}
                title="Ver motivo de cancelación"
                style={{ ...btnBase, background: '#b91c1c' }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(0.95)')}
                onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = '')}
              >
                Ver motivo
              </button>
            ) : (
              // Si está Activo → botón Cancelar SOLO para ADMIN
              isAdmin && (
                <button
                  onClick={onCancel}
                  title="Cancelar recibo"
                  style={{ ...btnBase, background: '#111827' }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(0.95)')}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = '')}
                >
                  Cancelar
                </button>
              )
            )}
          </div>
        );
      },
    }
  ]), [role, onOpenRecibo]);

  // --- exportación ---
  const openExportModal = () => {
    setExDesde(desde || '');
    setExHasta(hasta || '');
    setExAbogadoQ('');
    setExAbogadosSel([]);
    setOpenExport(true);
  };
  const closeExportModal = () => setOpenExport(false);

  const toggleExAbogado = (name) => {
    setExAbogadosSel(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const exportarExcel = async () => {
    try {
      const params = {};
      if (exDesde) params.desde = exDesde;
      if (exHasta) params.hasta = exHasta;
      if (exAbogadosSel.length) params.abogados = exAbogadosSel.join(',');
      if (exAbogadoQ.trim()) params.abogadoQ = exAbogadoQ.trim();
      if (q) params.q = q;
      params.estatus = 'Todos'; // <- incluir Activos y Cancelados
      
      const res = await axios.get(`${API}/recibos/export`, {
        params,
        responseType: 'blob'
      });

      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const hoy = new Date();
      const y = hoy.getFullYear();
      const m = String(hoy.getMonth() + 1).padStart(2, '0');
      const d = String(hoy.getDate()).padStart(2, '0');
      a.href = url;
      a.download = `recibos_${y}-${m}-${d}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      closeExportModal();
    } catch (e) {
      console.error(e);
      alert('No se pudo exportar el Excel.');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Consultar Recibos</h2>

      {/* Filtros rápidos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr repeat(2, max-content) max-content',
        gap: 8,
        alignItems: 'end'
      }}>
        <div>
          <label style={{ fontSize: 12, display: 'block', opacity: .8 }}>Buscar</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cliente, concepto..."
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, display: 'block', opacity: .8 }}>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                 style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}/>
        </div>
        <div>
          <label style={{ fontSize: 12, display: 'block', opacity: .8 }}>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                 style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }}/>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchData}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}>
            Aplicar filtros
          </button>
          <button onClick={() => { setQ(''); setDesde(''); setHasta(''); fetchData(); }}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}>
            Limpiar
          </button>
          <button
            onClick={openExportModal}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #10b981',
              background: '#10b981',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600
            }}
            title="Exportar a Excel"
          >
            Exportar Excel
          </button>
        </div>
      </div>

      {error && <div style={{ color: '#b00020' }}>{error}</div>}

      {/* Tabla */}
      <div style={{ height: '100vh', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          // fila roja si está cancelado
          getRowClassName={(params) => (params.row?.estatus === 'Cancelado' ? 'row-cancelado' : '')}
        />
      </div>

      {/* --- Modal Exportación --- */}
      {openExport && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center', zIndex: 9999 }}
          onClick={() => setOpenExport(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(720px, 92vw)',
              maxHeight: '85vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 10px 30px rgba(0,0,0,.25)',
              padding: 18,
            }}
          >
            <h3 style={{ marginTop: 4, marginBottom: 12 }}>Exportar a Excel</h3>

            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, opacity: .75 }}>Desde</label>
                  <input type="date" value={exDesde} onChange={(e) => setExDesde(e.target.value)}
                         style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }}/>
                </div>
                <div>
                  <label style={{ fontSize: 12, opacity: .75 }}>Hasta</label>
                  <input type="date" value={exHasta} onChange={(e) => setExHasta(e.target.value)}
                         style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }}/>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, opacity: .75 }}>Buscar abogado (texto)</label>
                <input
                  value={exAbogadoQ}
                  onChange={(e) => setExAbogadoQ(e.target.value)}
                  placeholder="Escribe parte del nombre del abogado…"
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, opacity: .75, display: 'block', marginBottom: 6 }}>
                  Seleccionar abogados (opcional)
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))',
                  gap: 6,
                  border: '1px solid #eee',
                  borderRadius: 10,
                  padding: 8,
                  maxHeight: 240,
                  overflow: 'auto'
                }}>
                  {abogadosSet.length === 0 && (
                    <div style={{ opacity: .6, fontSize: 13 }}>No hay abogados detectados en los resultados actuales.</div>
                  )}
                  {abogadosSet.map(name => (
                    <label key={name} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 6px' }}>
                      <input
                        type="checkbox"
                        checked={exAbogadosSel.includes(name)}
                        onChange={() => toggleExAbogado(name)}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button onClick={() => setOpenExport(false)}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={exportarExcel}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #10b981', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  Exportar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Modal Cancelación --- */}
      {openCancel && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 10000 }}
          onClick={closeCancelModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(600px, 92vw)',
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 10px 30px rgba(0,0,0,.25)',
              padding: 18,
            }}
          >
            <h3 style={{ marginTop: 4, marginBottom: 12 }}>Cancelar recibo</h3>

            <div style={{ fontSize: 14, marginBottom: 10, opacity: .9 }}>
              {cancelTarget && (
                <>
                  <div><b>Recibo:</b> #{cancelTarget.numero}</div>
                  <div><b>Cliente:</b> {cancelTarget.cliente}</div>
                  <div><b>Total:</b> ${Number(cancelTarget.total || 0).toFixed(2)}</div>
                </>
              )}
            </div>

            <label style={{ fontSize: 12, opacity: .8, display: 'block', marginBottom: 6 }}>
              Motivo de cancelación
            </label>
            <textarea
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              placeholder="Escribe el motivo…"
              rows={5}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 10,
                border: '1px solid #ddd',
                resize: 'vertical'
              }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                onClick={closeCancelModal}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}
              >
                Cerrar
              </button>
              <button
                onClick={submitCancel}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #111827', background: '#111827', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >
                Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Modal Ver Motivo --- */}
      {openReason && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 10000 }}
          onClick={closeReasonModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 92vw)',
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 10px 30px rgba(0,0,0,.25)',
              padding: 18,
            }}
          >
            <h3 style={{ marginTop: 4, marginBottom: 12 }}>Motivo de cancelación</h3>
            {reasonTarget && (
              <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                <div><b>Recibo:</b> #{reasonTarget.numero}</div>
                {reasonTarget.usuarioNombre && <div><b>Cancelado por:</b> {reasonTarget.usuarioNombre}</div>}
                {reasonTarget.fecha && (
                  <div><b>Fecha:</b> {reasonTarget.fecha.toLocaleString('es-MX', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                  })}</div>
                )}
                <div>
                  <b>Motivo:</b>
                  <div style={{
                    marginTop: 6,
                    whiteSpace: 'pre-wrap',
                    border: '1px solid #eee',
                    borderRadius: 8,
                    padding: 10,
                    background: '#fafafa'
                  }}>
                    {reasonTarget.motivo}
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={closeReasonModal}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
