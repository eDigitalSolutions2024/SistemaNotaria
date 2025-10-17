import React, { useState, useEffect } from 'react';
import '../css/estilos.css';
import API_URL from '../api';

export default function FormCliente({ onCreado }) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');               // se enviará como numero_telefono
  const [tipoServicio, setTipoServicio] = useState('');       // obligatorio
  const [tieneCita, setTieneCita] = useState(false);          // ocultamos "Sin cita"; solo mostramos "Con cita"
  const [mensaje, setMensaje] = useState('');
  const [abogadoPreferido, setAbogadoPreferido] = useState('');
  const [abogados, setAbogados] = useState([]);

  // errores de validación por campo
  const [errors, setErrors] = useState({ telefono: '', tipoServicio: '' });

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

  const validate = () => {
    const newErrors = { telefono: '', tipoServicio: '' };

    // Teléfono: mínimo 10 dígitos (ignorando símbolos)
    const telRaw = (telefono || '').trim();
    const digits = telRaw.replace(/\D/g, '');
    if (!digits) {
      newErrors.telefono = 'Por favor ingresa el número de teléfono.';
    } else if (digits.length < 10) {
      newErrors.telefono = 'El teléfono debe ser un numero valido .';
    }

    // Tipo de servicio obligatorio
    if (!tipoServicio) {
      newErrors.tipoServicio = 'Selecciona el tipo de servicio.';
    }

    setErrors(newErrors);
    // es válido si no hay mensajes
    return !newErrors.telefono && !newErrors.tipoServicio;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje('');

    if (!validate()) return;

    try {
      let abogadoAsignadoNum = null;

      if (tieneCita) {
        abogadoAsignadoNum = abogadoPreferido !== '' ? Number(abogadoPreferido) : null;
      } else {
        // asignación automática simple (puedes mantenerla como estaba)
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
        numero_telefono: telefono.trim(),
        servicio: tipoServicio,                 // obligatorio
        tieneCita: Boolean(tieneCita),
        abogado_preferido: abogadoAsignadoNum,
        abogado_asignado: abogadoAsignadoNum,
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

        // reset
        setNombre('');
        setTelefono('');
        setTipoServicio('');
        setTieneCita(false);
        setAbogadoPreferido('');
        setErrors({ telefono: '', tipoServicio: '' });
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
      <form onSubmit={handleSubmit} noValidate>
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

        {/* Teléfono obligatorio con mínimo 10 dígitos */}
        <div className="mb-3">
          <label>Número de teléfono:</label>
          <input
            type="tel"
            className={`form-control ${errors.telefono ? 'is-invalid' : ''}`}
            placeholder="Ej. 6560000000"
            value={telefono}
            onChange={(e) => {
              // permitir solo dígitos y un '+' inicial; limitar a 20 caracteres
              let v = e.target.value.replace(/[^\d+]/g, '');
              if (v.includes('+')) {
                // permitir '+' solo al inicio
                v = '+' + v.replace(/\+/g, '').replace(/[^\d]/g, '');
              }
              v = v.slice(0, 20);
              setTelefono(v);
            }}
            required
          />
          {errors.telefono && <div className="invalid-feedback">{errors.telefono}</div>}
          
        </div>

        {/* Fila combinada */}
        <div className="form-group-inline">
          <div className="form-group">
            <label>Tipo de servicio <span style={{color:'#d00'}}>*</span></label>
            <div className="checkbox-group">
              {/* Usa radio-like checkboxes; obligatorio */}
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
            {errors.tipoServicio && (
              <div style={{ color: '#d00', fontSize: 12, marginTop: 4 }}>
                {errors.tipoServicio}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>¿Tiene cita?</label>
            <div className="checkbox-group">
              {/* Ocultamos la opción "Sin cita". Solo mostramos "Con cita" */}
              <input
                type="checkbox"
                checked={tieneCita === true}
                onChange={() => setTieneCita((prev) => !prev)}
              />
              <label>Con cita</label>
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
                    return r === 'abogado' || r === 'asistente';
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
