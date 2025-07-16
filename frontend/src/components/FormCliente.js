import React, { useState } from 'react';
import '../css/estilos.css';

const FormCliente = () => {
  const [nombre, setNombre] = useState('');
  const [tipoServicio, setTipoServicio] = useState('');
  const [tieneCita, setTieneCita] = useState(null);
  const [mensaje, setMensaje] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Crear cliente
        const response = await fetch('http://192.168.1.90:3001/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, tipoServicio, tieneCita })
        });

      const data = await response.json();

      if (response.ok) {
        setMensaje(data.abogado
          ? `Cliente registrado con ID ${data.cliente._id} y asignado al abogado ${data.abogado.nombre}`
          : `Cliente registrado en lista de espera con ID ${data.cliente._id}`);
        setNombre('');
        setTipoServicio('');
        setTieneCita(null);
      } else {
        setMensaje('Error: ' + data.mensaje);
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
        <label>
        Asesoría
      </label>
      
        <input
          type="checkbox"
          checked={tipoServicio === 'Trámite'}
          onChange={() => setTipoServicio('Trámite')}
        />
        <label>
        Trámite
      </label>
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
        <label>
        Con cita
      </label>
     
        <input
          type="checkbox"
          checked={tieneCita === false}
          onChange={() => setTieneCita(false)}
        />
         <label>
        Sin cita
      </label>
    </div>
  </div>
</div>


        <button type="submit" className="btn btn-primary">Registrar cliente</button>
      </form>
      {mensaje && <p className="mt-3">{mensaje}</p>}
    </div>
  );
};

export default FormCliente;
