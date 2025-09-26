import React, {
  useEffect, useState, useMemo, forwardRef, useImperativeHandle,
} from 'react';
import DataTable from 'react-data-table-component';
import axios from 'axios';
import API_URL from '../api';

const TablaClientes = forwardRef((props, ref) => {
  const [clientes, setClientes] = useState([]);
  const [accionesSeleccionadas, setAccionesSeleccionadas] = useState({});
  const [motivos, setMotivos] = useState({});

  const fetchClientes = async () => {
    try {
      const res = await axios.get(`${API_URL}/clientes`);
      setClientes(res.data);
    } catch (error) {
      console.error('Error al obtener clientes:', error);
    }
  };

  const ACTION = {
    INICIAR: 'Iniciar trámite',
    CITA: 'Registro cita',
    NO_TRAMITE: 'No quiso trámite',
  };

  function fieldMetaByAction(accion) {
    switch (accion) {
      case ACTION.INICIAR:
        return { as: 'input', type: 'text', placeholder: 'Tipo de trámite' };
      case ACTION.CITA:
        return { as: 'input', type: 'date', placeholder: 'Fecha' };
      default:
        return { as: 'textarea', type: 'text', placeholder: 'Motivo' };
    }
  }

  useImperativeHandle(ref, () => ({
    recargarClientes: fetchClientes,
  }));

  useEffect(() => {
    fetchClientes();
  }, []);

  const liberarAbogado = async (clienteId) => {
    const accion = accionesSeleccionadas[clienteId] || '';
    const valor = motivos[clienteId] || '';

    if (!accion) return alert('Selecciona una acción.');

    if (accion === ACTION.INICIAR && !valor) return alert('Indica el Tipo de trámite.');
    if (accion === ACTION.CITA && !valor) return alert('Indica la Fecha de la cita.');
    if (accion === ACTION.NO_TRAMITE && !valor) return alert('Escribe un Motivo.');

    try {
      await axios.put(`${API_URL}/abogados/liberar/${clienteId}`, {
        accion,
        motivo: valor,
      });
      fetchClientes();
    } catch (error) {
      console.error('Error al liberar abogado:', error);
    }
  };

  const sortedClientes = useMemo(() => {
    return [...clientes].sort((a, b) => {
      const tb = b.hora_llegada ? new Date(b.hora_llegada).getTime() : 0;
      const ta = a.hora_llegada ? new Date(a.hora_llegada).getTime() : 0;
      if (tb !== ta) return tb - ta;
      const idb = Number(b.id) || 0;
      const ida = Number(a.id) || 0;
      return idb - ida;
    });
  }, [clientes]);

  const columns = [
    {
      name: 'Id',
      selector: (row) => row.id,
      sortable: true,
      width: '72px',
      minWidth: '72px',
      maxWidth: '72px',
      compact: true,
    },
    {
      name: 'Cliente',
      selector: (row) => row.nombre,
      wrap: true,
      width: '220px',
      minWidth: '220px',
    },
    {
      name: 'Abogado asignado',
      selector: (row) => row.abogado || 'Ninguno',
      wrap: true,
      width: '260px',
      minWidth: '260px',
    },
    {
      name: 'Hora de llegada',
      selector: (row) => (row.hora_llegada ? new Date(row.hora_llegada).toLocaleString() : '---'),
      width: '180px',
      minWidth: '180px',
    },
    {
      name: 'Estado',
      selector: (row) => row.estado || '---',
      width: '120px',
      minWidth: '120px',
    },
    {
      name: 'Acción',
      cell: (row) => {
        const seleccion = accionesSeleccionadas[row.id] || '';
        const meta = fieldMetaByAction(seleccion);
        return (
          <div style={{ minWidth: 220 }}>
            <select
              value={seleccion}
              onChange={(e) => {
                const val = e.target.value;
                setAccionesSeleccionadas((prev) => ({ ...prev, [row.id]: val }));
                setMotivos((prev) => ({
                  ...prev,
                  [row.id]: val === ACTION.CITA ? new Date().toISOString().slice(0, 10) : '',
                }));
              }}
              className="form-select form-select-sm mb-1"
            >
              <option value="">-- Selec --</option>
              {['Iniciar trámite', 'Registro cita', 'No quiso trámite'].map((accion, i) => (
                <option key={i} value={accion}>
                  {accion}
                </option>
              ))}
            </select>

            {meta.as === 'textarea' ? (
              <textarea
                className="form-control form-control-sm"
                rows="1"
                placeholder={meta.placeholder}
                value={motivos[row.id] || ''}
                onChange={(e) => setMotivos((prev) => ({ ...prev, [row.id]: e.target.value }))}
              />
            ) : (
              <input
                className="form-control form-control-sm"
                type={meta.type}
                placeholder={meta.placeholder}
                value={motivos[row.id] || ''}
                onChange={(e) => setMotivos((prev) => ({ ...prev, [row.id]: e.target.value }))}
              />
            )}
          </div>
        );
      },
      width: '220px',
      minWidth: '220px',
    },
    {
      name: 'Liberar',
      cell: (row) =>
        row.abogado && row.estado === 'Asignado' ? (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => liberarAbogado(row.id, motivos[row.id], accionesSeleccionadas[row.id])}
          >
            Liberar
          </button>
        ) : (
          '---'
        ),
      width: '100px',
      minWidth: '100px',
    },
    {
      name: 'Servicio',
      selector: (row) => row.servicio || '---',
      wrap: true,
      width: '120px',
      minWidth: '120px',
    },
    {
      name: 'Cita',
      selector: (row) => (row.tieneCita ? 'Con cita' : 'Sin cita'),
      width: '110px',
      minWidth: '110px',
    },
    {
      name: 'Trámite',
      selector: (row) => row.accion || '---',
      wrap: true,
      width: '140px',
      minWidth: '140px',
    },
    {
      name: 'Motivo',
      selector: (row) => row.motivo || '---',
      wrap: true,
      width: '260px',
      minWidth: '260px',
      maxWidth: '360px',
    },
  ];

  const customStyles = {
    tableWrapper: {
      style: {
        overflowX: 'auto',        // ← scroll horizontal correcto
        overflowY: 'auto',
        maxHeight: '70vh',
        borderRadius: '8px',
      },
    },
    table: {
      style: {
        width: '100%',
        minWidth: 1550,          // suma aprox. de anchos ⇒ garantiza scroll X
        tableLayout: 'fixed',
        fontSize: '0.92rem',
      },
    },
    headRow: { style: { minHeight: '44px' } },
    headCells: {
      style: {
        padding: '6px 10px',
        whiteSpace: 'nowrap',
        fontWeight: 600,
        fontSize: '0.92rem',
        justifyContent: 'flex-start',   // ← header alineado a la izquierda
      },
    },
    rows: { style: { minHeight: '44px' } },
    cells: {
      style: {
        padding: '6px 10px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        justifyContent: 'flex-start',   // ← celdas alineadas a la izquierda
      },
    },
  };

  const conditionalRowStyles = [
    { when: (row) => row.accion === 'Iniciar trámite', style: { backgroundColor: '#d4edda' } },
    { when: (row) => row.accion === 'Registro cita', style: { backgroundColor: '#d1ecf1' } },
    { when: (row) => row.accion === 'No quiso trámite', style: { backgroundColor: '#f8d7da' } },
    { when: (row) => row.accion === 'En proceso de trámite', style: { backgroundColor: '#fff3cd' } },
  ];

  const exportarExcel = () => {
    if (!window.XLSX) {
      alert('No se encontró XLSX. Asegúrate de incluir el script CDN en public/index.html');
      return;
    }
    const filas = clientes.map((c) => {
      const fecha = c.hora_llegada ? new Date(c.hora_llegada) : null;
      return {
        Cliente: c.nombre || '',
        'Tipo de trámite': c.servicio || c.tipoTramite || c.accion || '',
        Fecha: fecha ? fecha.toLocaleString() : '',
        Sala: c.sala?.nombre || c.sala || '',
        Abogado: c.abogado || 'Ninguno',
        Motivo: c.motivo || '',
      };
    });

    const ws = window.XLSX.utils.json_to_sheet(filas, {
      header: ['ID', 'Cliente', 'Tipo de trámite', 'Fecha', 'Sala', 'Abogado', 'Motivo'],
    });

    ws['!cols'] = [
      { wch: 20 },
      { wch: 25 },
      { wch: 22 },
      { wch: 20 },
      { wch: 16 },
      { wch: 22 },
      { wch: 30 },
    ];

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Notaría');
    window.XLSX.writeFile(wb, 'reporte_notaria.xlsx');
  };

  return (
    <div className="container-fluid mt-4">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
        <h3 className="mb-0">Clientes registrados</h3>
        <button className="btn btn-success" onClick={exportarExcel}>
          Exportar a Excel
        </button>
      </div>

      <DataTable
        columns={columns}
        data={sortedClientes}
        pagination
        responsive
        fixedHeader
        fixedHeaderScrollHeight="70vh"
        highlightOnHover
        dense
        customStyles={customStyles}
        conditionalRowStyles={conditionalRowStyles}
      />
    </div>
  );
});

export default TablaClientes;
