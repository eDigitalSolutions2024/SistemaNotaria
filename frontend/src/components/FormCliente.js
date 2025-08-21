import React, { useState, useEffect } from 'react';
import '../css/estilos.css';
import API_URL from '../api';

export default function FormCliente({ onCreado }) {
  const [nombre, setNombre] = useState('');
  const [tipoServicio, setTipoServicio] = useState('');
  const [tieneCita, setTieneCita] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [abogadoPreferido, setAbogadoPreferido] = useState('');
  const [abogados, setAbogados] = useState([]);

  useEffect(() => {
    const obtenerAbogados = async () => {
      try {
        const res = await fetch(`${API_URL}/abogados`);
        const data = await res.json();
        setAbogados(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error al cargar abogados:', error);
      }
    };
    obtenerAbogados();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje('');

    try {
      let abogadoAsignado = null;

      if (tieneCita) {
        // 👈 IDs de Mongo son string; no uses parseInt
        abogadoAsignado = abogadoPreferido || null;
      } else {
        try {
          const resAbogado = await fetch(`${API_URL}/abogados`);
          const dataAbogado = await resAbogado.json();
          const lista = Array.isArray(dataAbogado) ? dataAbogado : [];
          if (resAbogado.ok && lista.length > 0) {
            abogadoAsignado = lista[0]._id; // el primero disponible (ajusta tu criterio)
          } else {
            setMensaje('⚠️ No hay abogados disponibles. El cliente se registrará sin asignar.');
          }
        } catch {
          setMensaje('⚠️ Error al buscar abogado disponible');
        }
      }

      // Crear cliente (envío ambos por si tu backend espera uno u otro)
      const response = await fetch(`${API_URL}/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          tipoServicio,
          tieneCita,
          abogadoPreferido: abogadoAsignado,
          abogado: abogadoAsignado
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMensaje(
          data.abogado
            ? `Cliente registrado con ID ${data.cliente._id} y asignado al abogado ${data.abogado.nombre}`
            : `Cliente registrado en lista de espera con ID ${data.cliente._id}`
        );

        // 🔔 Notifica al padre para refrescar la tabla
        onCreado && onCreado(data.cliente);

        // Reset
        setNombre('');
        setTipoServicio('');
        setTieneCita(null);
        setAbogadoPreferido('');
      } else {
        setMensaje('Error: ' + (data.mensaje || 'No se pudo registrar'));
      }
    } catch (error) {
      setMensaje('⚠️ Error al conectar con el servidor');
    }
  };

  return (
    <div className="container mt-4">
      <h2>Formulario para registrar cliente</h2>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label>Nombre del cliente:</label>
          <input
            type="text"
            className="form-control"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </div>

        {/* Fila combinada */}
        <div className="form-group-inline">
          <div className="form-group">
            <label>Tipo de servicio:</label>
            <div className="checkbox-group">
              <input
                type="checkbox"
                checked={tipoServicio === 'Asesoría'}
                onChange={() => setTipoServicio('Asesoría')}
              />
              <label>Asesoría</label>

              <input
                type="checkbox"
                checked={tipoServicio === 'Trámite'}
                onChange={() => setTipoServicio('Trámite')}
              />
              <label>Trámite</label>
            </div>
          </div>

          <div className="form-group">
            <label>¿Tiene cita?</label>
            <div className="checkbox-group">
              <input
                type="checkbox"
                checked={tieneCita === true}
                onChange={() => setTieneCita(true)}
              />
              <label>Con cita</label>

              <input
                type="checkbox"
                checked={tieneCita === false}
                onChange={() => setTieneCita(false)}
              />
              <label>Sin cita</label>
            </div>
          </div>

          {tieneCita && (
            <div className="form-group mt-2">
              <label>Abogado con el que tiene cita:</label>
              <select
                className="form-control"
                value={abogadoPreferido}
                onChange={(e) => setAbogadoPreferido(e.target.value)}
              >
                <option value="">-- Selecciona un abogado --</option>
                {abogados.map((abogado) => (
                  <option key={abogado._id} value={abogado._id}>
                    {abogado.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-primary">Registrar cliente</button>
      </form>

      {mensaje && <p className="mt-3">{mensaje}</p>}
    </div>
  );
}
