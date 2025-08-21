import React, { useEffect, useState } from 'react';
import DataTable from 'react-data-table-component';
import '../css/estilos.css';
import API_URL from '../api';

const AbogadosTable = () => {
  const [abogados, setAbogados] = useState([]);

  useEffect(() => {
  fetch(`${API_URL}/abogados`).then(res => res.json())
    .then(data => setAbogados(data))
    .catch(error => console.error('Error al cargar abogados:', error));
}, []);

  const columnas = [
    { name: 'ID', selector: row => row._id, sortable: true },
    { name: 'Nombre', selector: row => row.nombre, sortable: true },
    { name: 'Asignaciones', selector: row => row.asignaciones },
    { name: 'Disponible', selector: row => row.disponible ? 'Sí' : 'No' },
    { name: 'Orden', selector: row => row.orden },
    { name: 'Ubicacion', selector: row => row.ubicacion }
  ];

  return (
    <div className="tabla-abogados">
      <h2>Abogados registrados</h2>
      <DataTable
        columns={columnas}
        data={abogados}
        dense
        pagination={false}
        highlightOnHover
        striped
      />
    </div>
  );
};

export default AbogadosTable;
