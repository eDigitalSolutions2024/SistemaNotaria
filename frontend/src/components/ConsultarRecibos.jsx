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

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (q) params.q = q;
      if (desde) params.desde = desde;
      if (hasta) params.hasta = hasta;

      // Espera un endpoint tipo GET /recibos (con filtros por query params)
      // Ajusta si tu backend usa otra ruta.
      const { data } = await axios.get(`${API}/recibos`, { params });

      // Normaliza _id -> id para DataGrid
      const mapped = (Array.isArray(data) ? data : data?.items || []).map((r, i) => ({
        id: r._id || r.id || i,
        ...r
      }));
      setRows(mapped);
    } catch (e) {
      console.error(e);
      setError('No se pudieron cargar los recibos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* carga inicial */ }, []);
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
    // sin valueFormatter; devolvemos la cadena ya formateada
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
  { field: 'abogado', headerName: 'Abogado', width: 160, valueGetter: (_v, row) => row?.abogado || '' },
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
      e.stopPropagation(); // no seleccionar fila
      window.open(`${API}/recibos/${id}/pdf`, '_blank');
    };

    return (
      <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={openPdf}
          title="Abrir PDF"
          style={{
            background: '#ef4444', 
            marginTop: 15,    // rojo
            color: '#fff',             // texto blanco
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

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Consultar Recibos</h2>

      {/* Filtros */}
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
    </div>
  );
}
