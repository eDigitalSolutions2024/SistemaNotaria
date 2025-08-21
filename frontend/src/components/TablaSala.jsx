import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_URL from '../api';


const TablaSalas = () => {
  const [salas, setSalas] = useState([]);
  const [abogados, setAbogados] = useState([]);
  const [seleccionados, setSeleccionados] = useState({});

  useEffect(() => {
    fetchSalas();
    fetchAbogados();
  }, []);

  const fetchSalas = async () => {
    const res = await axios.get(`${API_URL}/salas`);
    setSalas(res.data);
  };

  const fetchAbogados = async () => {
    const res = await axios.get(`${API_URL}/abogados`);
    console.log('ABOGADOS DEL BACKEND:', res.data);
    // Solo mostrar abogados que están asignados a un cliente pero que NO tienen sala aún
    
    setAbogados(res.data);
  };

  const asignarSala = async (salaId) => {
    const abogadoId = seleccionados[salaId];
    if (!abogadoId) return alert("Selecciona un abogado");
    try {
      await axios.put(`${API_URL}/salas/asignar`, {
        salaId,
        abogadoId,
      });
      alert('✅ Sala asignada correctamente');
      fetchSalas();
      fetchAbogados();
    } catch (error) {
      console.error(error);
      alert('❌ Error al asignar sala');
    }
  };

  const liberarSala = async (salaId) => {
    try {
      await axios.put(`${API_URL}/salas/liberar/${salaId}`);
      alert('✅ Sala liberada');
      fetchSalas();
      fetchAbogados();
    } catch (error) {
      console.error(error);
      alert('❌ Error al liberar sala');
    }
  };

  const handleSelectChange = (salaId, value) => {
    setSeleccionados(prev => ({ ...prev, [salaId]: value }));
  };

  return (
    <div className="container mt-4">
      <h3 className="text-center">Salas disponibles</h3>
      <div className="table-responsive">
        <table className="table table-bordered table-sm align-middle text-center">
          <thead className="table-dark">
            <tr>
              <th>Nombre</th>
              <th>Disponibilidad</th>
              <th>Abogado asignado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {salas.map((sala) => (
              <tr key={sala._id}>
                <td>{sala.nombre}</td>
                <td>{sala.disponible ? '✅ Disponible' : '❌ Ocupada'}</td>
                <td>
                {!sala.abogado_asignado ? (
                  <select
                    className="form-select"
                    value={seleccionados[sala._id] || ''}
                    onChange={(e) => handleSelectChange(sala._id, e.target.value)}
                  >
                    <option value="">Selecciona abogado</option>
                    {abogados
                      .filter(a => a.disponible === false && (!a.ubicacion || a.ubicacion === '---' || a.ubicacion === 'Sin sala'))
                      .map((abogado) => (
                        <option key={abogado._id} value={abogado._id}>
                          {abogado.nombre}
                        </option>
                      ))}
                  </select>
                ) : (
                  abogados.find(a => a._id === sala.abogado_asignado)?.nombre || 'Cargando...'
                )}

              </td>
                <td>
                  {sala.abogado_asignado ? (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => liberarSala(sala._id)}
                    >
                      Liberar
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => asignarSala(sala._id)}
                      disabled={!seleccionados[sala._id]}
                    >
                      Asignar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TablaSalas;
