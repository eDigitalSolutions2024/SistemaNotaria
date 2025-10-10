// frontend/src/components/ConsultarRecibos.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { DataGrid } from '@mui/x-data-grid';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export default function ConsultarRecibos({ onOpenRecibo }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState(null);

  // lista de abogados detectados para el modal
  const [abogadosSet, setAbogadosSet] = useState([]);

  // --- modal de exportación ---
  const [openExport, setOpenExport] = useState(false);
  const [exDesde, setExDesde] = useState('');
  const [exHasta, setExHasta] = useState('');
  const [exAbogadoQ, setExAbogadoQ] = useState('');
  const [exAbogadosSel, setExAbogadosSel] = useState([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (q) params.q = q;
      if (desde) params.desde = desde;
      if (hasta) params.hasta = hasta;

      const { data } = await axios.get(`${API}/recibos`, { params });
      const mapped = (Array.isArray(data) ? data : data?.items || []).map((r, i) => ({
        id: r._id || r.id || i,
        ...r
      }));
      setRows(mapped);

      // construir catálogo de abogados para el modal
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

  const onlyDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const columns = useMemo(() => ([
    {
      field: 'numeroRecibo',
      headerName: 'No. Recibo',
      width: 110,
      valueGetter: (_v, row) => {
        const id = row?._id || row?.id || '';
        return id ? String(id).slice(-4).toUpperCase() : '';
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
    {
      field: 'acciones',
      headerName: 'Acciones',
      width: 140,
      sortable: false,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const id = params.row._id || params.row.id;
        const openPdf = (e) => {
          e.stopPropagation();
          window.open(`${API}/recibos/${id}/pdf`, '_blank');
        };
        return (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={openPdf}
              title="Abrir PDF"
              style={{
                background: '#ef4444',
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
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(0.95)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = '')}
            >
              PDF
            </button>
          </div>
        );
      },
    }
  ]), [onOpenRecibo]);

  // --- botón Exportar abre modal ---
  const openExportModal = () => {
    // inicializa con filtros rápidos actuales
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
      // filtros del modal
      if (exDesde) params.desde = exDesde;
      if (exHasta) params.hasta = exHasta;
      if (exAbogadosSel.length) params.abogados = exAbogadosSel.join(',');
      if (exAbogadoQ.trim()) params.abogadoQ = exAbogadoQ.trim();
      // puedes incluir también el 'q' general si quieres que afecte la exportación
      if (q) params.q = q;

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

      {/* Filtros rápidos (siguen igual) */}
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
          {/* MISMO BOTÓN: abre modal de exportación con filtros */}
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
      <div style={{ height: 520, background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
        />
      </div>

      {/* MODAL DE EXPORTACIÓN (solo se abre desde el botón) */}
      {openExport && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center', zIndex: 9999 }}
          onClick={closeExportModal}
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
              {/* Rango de fechas */}
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

              {/* Búsqueda por texto (abogado) */}
              <div>
                <label style={{ fontSize: 12, opacity: .75 }}>Buscar abogado (texto)</label>
                <input
                  value={exAbogadoQ}
                  onChange={(e) => setExAbogadoQ(e.target.value)}
                  placeholder="Escribe parte del nombre del abogado…"
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                />
              </div>

              {/* Multi-select de abogados detectados */}
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

              {/* Botones */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button onClick={closeExportModal}
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
    </div>
  );
}
