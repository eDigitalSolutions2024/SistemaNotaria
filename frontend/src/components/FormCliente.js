import React, { useState, useEffect } from 'react';
import '../css/estilos.css';
import API_URL from '../api';

export default function FormCliente({ onCreado }) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');              // ← se enviará como numero_telefono
  const [tipoServicio, setTipoServicio] = useState('');
  const [tieneCita, setTieneCita] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [abogadoPreferido, setAbogadoPreferido] = useState(''); // guardamos string del <select>, convertimos a Number al enviar
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

    // validación mínima del teléfono (requerido por el modelo)
    const tel = telefono.trim();
    if (!tel) {
      setMensaje('Por favor ingresa el número de teléfono.');
      return;
    }

    try {
      let abogadoAsignadoNum = null;

      if (tieneCita) {
        // viene del select como string -> convertir a Number si no es vacío
        abogadoAsignadoNum = abogadoPreferido !== '' ? Number(abogadoPreferido) : null;
      } else {
        // Toma el primero de la lista (ajusta tu criterio si necesitas “disponible”)
        try {
          const resAbogado = await fetch(`${API_URL}/abogados`);
          const dataAbogado = await resAbogado.json();
          const lista = Array.isArray(dataAbogado) ? dataAbogado : [];
          if (resAbogado.ok && lista.length > 0) {
            abogadoAsignadoNum = Number(lista[0]._id); // IDs numéricos
          } else {
            setMensaje('⚠️ No hay abogados disponibles. El cliente se registrará sin asignar.');
          }
        } catch {
          setMensaje('⚠️ Error al buscar abogado disponible');
        }
      }

      const payload = {
        nombre,
        numero_telefono: tel,                 // ← nombre EXACTO del modelo
        servicio: tipoServicio || '',         // tu modelo tiene `servicio`, además de `motivo/accion`
        tieneCita: Boolean(tieneCita),
        abogado_preferido: abogadoAsignadoNum, // ← Number (puede ser null)
        abogado_asignado: abogadoAsignadoNum,  // ← Number (puede ser null)
      };

      const response = await fetch(`${API_URL}/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setMensaje(
          data?.abogado
            ? `Cliente registrado con ID ${data.cliente?._id} y asignado al abogado ${data.abogado?.nombre || ''}`
            : `Cliente registrado con ID ${data.cliente?._id}`
        );

        onCreado && onCreado(data.cliente);

        // Reset
        setNombre('');
        setTelefono('');
        setTipoServicio('');
        setTieneCita(null);
        setAbogadoPreferido('');
      } else {
        setMensaje('Error: ' + (data?.mensaje || 'No se pudo registrar'));
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

        {/* Teléfono (requerido por el modelo) */}
        <div className="mb-3">
          <label>Número de teléfono:</label>
          <input
            type="tel"
            className="form-control"
            placeholder="Ej. 6560000000"
            value={telefono}
            onChange={(e) => {
              // permitimos dígitos y + para internacionales
              const v = e.target.value.replace(/[^\d+]/g, '').slice(0, 15);
              setTelefono(v);
            }}
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
      {(abogados || [])
        .filter(a => {
          const r = String(a.role || '').toLowerCase();
          return r === 'abogado' || r === 'asistente'  ;
        })
        .map((abogado) => (
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
