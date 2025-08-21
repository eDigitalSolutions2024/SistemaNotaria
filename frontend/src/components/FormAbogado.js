import React, { useState } from 'react';
import API_URL from '../api'; 
const FormAbogado = () => {
  const [nombre, setNombre] = useState('');
  const [turno, setTurno] = useState('');
  const [mensaje, setMensaje] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Crear abogado
const response = await fetch(`${API_URL}/abogados`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nombre, orden: turno })
});


      const data = await response.json();

      if (response.ok) {
        setMensaje(`✅ Abogado registrado con éxito: ${data.abogado.nombre}`);
        setNombre('');
        setTurno('');
      } else {
        setMensaje(`❌ Error: ${data.mensaje}`);
      }
    } catch (error) {
      setMensaje('⚠️ Error al conectar con el servidor');
    }
  };

  return (
    <div className="container mt-4 formulario-clientes">
      <h2>Formulario para registrar abogado</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Nombre del abogado:</label>
          <input
            type="text"
            className="form-control input-text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            placeholder="Ej. lic. Juan Pérez"
          />
        </div>

        <div className="form-group">
          <label>Orden de turno:</label>
          <input
            type="number"
            className="form-control input-text"
            value={turno}
            onChange={(e) => setTurno(e.target.value)}
            required
            placeholder="Ej. 1, 2, 3..."
          />
        </div>

        <button type="submit" className="btn btn-primary btn-registrar">
          Registrar
        </button>
      </form>

      {mensaje && <p className="mt-3" id="mensaje">{mensaje}</p>}
    </div>
  );
};

export default FormAbogado;
