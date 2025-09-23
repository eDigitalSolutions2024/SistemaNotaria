import React, { useEffect, useState, useMemo, forwardRef,
  useImperativeHandle } from 'react';
import DataTable from 'react-data-table-component';
import axios from 'axios';
import API_URL from '../api';

// (evita esta llamada suelta; ya se hace en fetchClientes)
// axios.get(`${API_URL}/clientes`);

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


  // 🔑 Aquí exponemos el método para el padre
  useImperativeHandle(ref, () => ({
    recargarClientes: fetchClientes
  }));
  useEffect(() => {
    fetchClientes();
  }, []);

  const liberarAbogado = async (clienteId) => {
  const accion = accionesSeleccionadas[clienteId] || '';
  const valor = motivos[clienteId] || '';

  if (!accion) {
    alert('Selecciona una acción.');
    return;
  }

  if (accion === ACTION.INICIAR && !valor) {
    alert('Indica el Tipo de trámite.');
    return;
  }
  if (accion === ACTION.CITA && !valor) {
    alert('Indica la Fecha de la cita.');
    return;
  }
  if (accion === ACTION.NO_TRAMITE && !valor) {
    alert('Escribe un Motivo.');
    return;
  }

  try {
    await axios.put(`${API_URL}/abogados/liberar/${clienteId}`, {
      accion,
      motivo: valor,   // enviamos el mismo campo "motivo" con el valor dinámico
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
    if (tb !== ta) return tb - ta; // primero el más reciente

    // desempate por ID (desc)
    const idb = Number(b.id) || 0;
    const ida = Number(a.id) || 0;
    return idb - ida;
  });
}, [clientes]);

  const acciones = ['Iniciar trámite', 'Registro cita', 'No quiso trámite'];

  const columns = [
    {
      name: 'ID',
      selector: (row) => row.id,
      sortable: true,
      style: { minWidth: '90px' },
    },
    {
      name: 'Cliente',
      selector: (row) => row.nombre,
      wrap: true,
      style: { minWidth: '200px' },
    },
    {
      name: 'Abogado asignado',
      selector: (row) => row.abogado || 'Ninguno',
      wrap: true,
      style: { minWidth: '180px' },
    },
    {
      name: 'Hora de llegada',
      selector: (row) =>
        row.hora_llegada ? new Date(row.hora_llegada).toLocaleString() : '---',
      style: { minWidth: '180px' },
    },
    {
      name: 'Estado',
      selector: (row) => row.estado || '---',
      style: { minWidth: '140px' },
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
            setAccionesSeleccionadas(prev => ({ ...prev, [row.id]: val }));
            // al cambiar de acción, limpiamos o prellenamos el campo dinámico
            setMotivos(prev => ({
              ...prev,
              [row.id]: val === ACTION.CITA
                ? new Date().toISOString().slice(0, 10) // hoy para fecha
                : '' // limpiar para las otras
            }));
          }}
          className="form-select form-select-sm mb-1"
        >
          <option value="">-- Selec --</option>
          {['Iniciar trámite','Registro cita','No quiso trámite'].map((accion, i) => (
            <option key={i} value={accion}>{accion}</option>
          ))}
        </select>

        {/* Campo dinámico */}
        {meta.as === 'textarea' ? (
          <textarea
            className="form-control form-control-sm"
            rows="1"
            placeholder={meta.placeholder}
            value={motivos[row.id] || ''}
            onChange={(e) => setMotivos(prev => ({ ...prev, [row.id]: e.target.value }))}
          />
        ) : (
          <input
            className="form-control form-control-sm"
            type={meta.type}
            placeholder={meta.placeholder}
            value={motivos[row.id] || ''}
            onChange={(e) => setMotivos(prev => ({ ...prev, [row.id]: e.target.value }))}
          />
        )}
      </div>
    );
  },
  style: { minWidth: '240px' },
},

    {
      name: 'Liberar',
      cell: (row) =>
        row.abogado && row.estado === 'Asignado' ? (
          <button
            className="btn btn-danger btn-sm"
            onClick={() =>
              liberarAbogado(row.id, motivos[row.id], accionesSeleccionadas[row.id])
            }
          >
            Liberar
          </button>
        ) : (
          '---'
        ),
      style: { minWidth: '120px' },
    },
    {
      name: 'Servicio',
      selector: (row) => row.servicio || '---',
      wrap: true,
      style: { minWidth: '150px' },
    },
    {
      name: 'Cita',
      selector: (row) => (row.tieneCita ? 'Con cita' : 'Sin cita'),
      style: { minWidth: '120px' },
    },
    {
      name: 'Trámite',
      selector: (row) => row.accion || '---',
      wrap: true,
      style: { minWidth: '160px' },
    },
    {
      name: 'Motivo',
      selector: (row) => row.motivo || '---',
      wrap: true,
      style: { minWidth: '240px', maxWidth: '360px' },
    },
  ];

  const customStyles = {
    rows: {
      style: { minHeight: '50px' },
    },
  };

  const conditionalRowStyles = [
    { when: (row) => row.accion === 'Iniciar trámite', style: { backgroundColor: '#d4edda' } },
    { when: (row) => row.accion === 'Registro cita', style: { backgroundColor: '#d1ecf1' } },
    { when: (row) => row.accion === 'No quiso trámite', style: { backgroundColor: '#f8d7da' } },
    { when: (row) => row.accion === 'En proceso de trámite', style: { backgroundColor: '#fff3cd' } },
  ];

  // ====== Exportar a Excel (usa Motivo en lugar de Estatus) ======
  const exportarExcel = () => {
    if (!window.XLSX) {
      alert('No se encontró XLSX. Asegúrate de incluir el script CDN en public/index.html');
      return;
    }

    const filas = clientes.map((c) => {
      const fecha = c.hora_llegada ? new Date(c.hora_llegada) : null;
      return {
        'Cliente': c.nombre || '',
        'Tipo de trámite': c.servicio || c.tipoTramite || c.accion || '',
        'Fecha': fecha ? fecha.toLocaleString() : '',
        'Sala': c.sala?.nombre || c.sala || '',
        'Abogado': c.abogado || 'Ninguno',
        'Motivo': c.motivo || '',
      };
    });

    const ws = window.XLSX.utils.json_to_sheet(filas, {
      header: ['Cliente', 'Tipo de trámite', 'Fecha', 'Sala', 'Abogado', 'Motivo'],
    });

    ws['!cols'] = [
      { wch: 28 }, // Cliente
      { wch: 22 }, // Tipo de trámite
      { wch: 20 }, // Fecha
      { wch: 16 }, // Sala
      { wch: 22 }, // Abogado
      { wch: 30 }, // Motivo
    ];

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Notaría');
    window.XLSX.writeFile(wb, 'reporte_notaria.xlsx');
  };
  // ===============================================================

  return (
    <div className="container-fluid mt-4">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
        <h3 className="mb-0">Clientes registrados</h3>
        <button className="btn btn-success" onClick={exportarExcel}>
          Exportar a Excel
        </button>
      </div>

      {/* Contenedor responsivo con scroll horizontal controlado */}
      <div className="table-scroll-x">
        <DataTable
          columns={columns}
          data={sortedClientes}
          pagination
          responsive
          fixedHeader
          fixedHeaderScrollHeight="60vh"
          highlightOnHover
          dense
          customStyles={customStyles}
          conditionalRowStyles={conditionalRowStyles}
        />
      </div>
    </div>
  );
});

export default TablaClientes;
