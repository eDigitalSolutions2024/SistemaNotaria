import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL;

axios.get(`${API}/clientes`)


const TablaSalas = () => {
  const [salas, setSalas] = useState([]);

  const fetchSalas = async () => {
    const res = await axios.get(`${API}/salas`)

    setSalas(res.data);
  };

  useEffect(() => {
    fetchSalas();
  }, []);

  return (
    <div className="container mt-4">
      <h3 className="text-center">Salas disponibles</h3>
      <table className="table table-bordered">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Disponibilidad</th>
            <th>Abogado asignado</th>
          </tr>
        </thead>
        <tbody>
          {salas.map((sala) => (
            <tr key={sala._id}>
              <td>{sala.nombre}</td>
              <td>{sala.disponible ? '✅ Disponible' : '❌ Ocupada'}</td>
              <td>{sala.abogado_asignado?.nombre || '---'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TablaSalas;
