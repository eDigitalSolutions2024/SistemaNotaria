import React, { useEffect, useState } from 'react';
import DataTable from 'react-data-table-component';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL;

axios.get(`${API}/clientes`)


const TablaClientes = () => {
  const [clientes, setClientes] = useState([]);
  const [accionesSeleccionadas, setAccionesSeleccionadas] = useState({});
  const [motivos, setMotivos] = useState({});

  const fetchClientes = async () => {
    try {
      const res = await axios.get(`${API}/clientes`)

      setClientes(res.data);
    } catch (error) {
      console.error('Error al obtener clientes:', error);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const liberarAbogado = async (clienteId) => {
     const accion = accionesSeleccionadas[clienteId];
     const motivo = motivos[clienteId];
    
     if (!motivo || !accion) {
      alert('Debes seleccionar una acción y escribir un motivo.');
      return;
    }

    try {
      // Liberar abogado
      await axios.put(`http://192.168.1.90:3001/liberar/${clienteId}`, {
        motivo,
        accion,
      });

      fetchClientes(); // Refresca los datos después de liberar
    } catch (error) {
      console.error('Error al liberar abogado:', error);
    }
  };

  const acciones = [
    'Iniciar trámite',
    'Registro cita',
    'No quiso trámite',
  ];

  const columns = [
    {
      name: 'ID',
      selector: (row) => row.id,
      sortable: true,
    },
    {
      name: 'Cliente',
      selector: (row) => row.nombre,
    },
    {
      name: 'Abogado asignado',
      selector: (row) => row.abogado || 'Ninguno',
    },
    {
      name: 'Hora de llegada',
      selector: (row) =>
        row.hora_llegada ? new Date(row.hora_llegada).toLocaleString() : '---',
    },
    {
      name: 'Estado',
      selector: (row) => row.estado || '---',
    },
    {
      name: 'Acción',
      cell: (row) => (
        <div>
          <select
            value={accionesSeleccionadas[row.id] || ''}
            onChange={(e) =>
              setAccionesSeleccionadas({
                ...accionesSeleccionadas,
                [row.id]: e.target.value,
              })
            }
            className="form-select form-select-sm mb-1"
          >
            <option value="">-- Selec --</option>
            {acciones.map((accion, index) => (
              <option key={index} value={accion}>
                {accion}
              </option>
            ))}
          </select>
          <textarea
            className="form-control form-control-sm"
            rows="1"
            placeholder="Motivo"
            value={motivos[row.id] || ''}
            onChange={(e) =>
              setMotivos({ ...motivos, [row.id]: e.target.value })
            }
          />
        </div>
      ),
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
    },
    {
      name: 'Servicio',
      selector: (row) => row.servicio || '---',
    },
    {
      name: 'Cita',
      selector: (row) => (row.tieneCita ? 'Con cita' : 'Sin cita'),
    },
    {
      name: 'Trámite',
      selector: (row) => row.accion || '---',
    },
    {
      name: 'Motivo',
      selector: (row) => row.motivo || '---',
    },

  ];

  const customStyles = {
  rows: {
    style: {
      minHeight: '50px',
    },
  },
};

const conditionalRowStyles = [
  {
    when: row => row.accion === 'Iniciar trámite',
    style: {
      backgroundColor: '#d4edda', // verde claro
    },
  },
  {
    when: row => row.accion === 'Registro cita',
    style: {
      backgroundColor: '#d1ecf1', // azul claro
    },
  },
  {
    when: row => row.accion === 'No quiso trámite',
    style: {
      backgroundColor: '#f8d7da', // rojo claro
    },
  },
  {
    when: row => row.accion === 'En proceso de trámite',
    style: {
      backgroundColor: '#fff3cd', // amarillo claro
    },
  },
];


  return (
    <div className="container mt-4">
      <h3 className="text-center">Clientes registrados</h3>
      <DataTable
        columns={columns}
        data={clientes}
        pagination
        responsive
        highlightOnHover
        dense
        customStyles={customStyles}
        conditionalRowStyles={conditionalRowStyles}
      />
    </div>
  );
};

export default TablaClientes;
