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
  const [errors, setErrors] = useState({ nombre: '', telefono: '', tipoServicio: '', abogado: '' });



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

  const stripAccents = (s='') =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const isAllSameLetter = (word) => {
  const w = stripAccents(word).toLowerCase().replace(/[^a-zñ]/g, '');
  if (w.length < 4) return false;
  return /^([a-zñ])\1+$/.test(w); // aaaa, bbbb...
};

const hasLowVariety = (full) => {
  const letters = stripAccents(full).toLowerCase().replace(/[^a-zñ]/g, '');
  if (letters.length < 8) return false;
  const freq = {};
  for (const ch of letters) freq[ch] = (freq[ch] || 0) + 1;
  const max = Math.max(...Object.values(freq));
  return (max / letters.length) >= 0.8; // 80% misma letra
};


  const validate = () => {
  const newErrors = { nombre: '', telefono: '', tipoServicio: '', abogado: '' };

  // ✅ NOMBRE (super blindado)
  const n = (nombre || '').trim().replace(/\s+/g, ' ');
  const nNorm = stripAccents(n).toLowerCase();

  if (!n) {
    newErrors.nombre = 'Por favor ingresa el nombre del cliente.';
  } else if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/.test(n)) {
    newErrors.nombre = 'El nombre solo puede contener letras, espacios, guion y apóstrofe.';
  } else if (n.length < 8) {
    newErrors.nombre = 'Captura el nombre completo (mínimo 8 caracteres).';
  } else {
    const parts = n.split(' ').filter(Boolean);
    if (parts.length < 2) {
      newErrors.nombre = 'Captura Nombre y Apellido.';
    } else {
      const banned = /\b(cliente|test|prueba|demo|asdf|qwerty|desconocido|sin nombre)\b/i;
      if (banned.test(nNorm)) {
        newErrors.nombre = 'No se permiten nombres genéricos como "Cliente", "Test", etc.';
      } else if (/^cliente(\s*\d+|\s*[a-zñ])?$/.test(nNorm.replace(/\s+/g, ''))) {
        newErrors.nombre = 'No se permiten nombres tipo "Cliente 1" o "Cliente X".';
      } else if (parts.some(p => isAllSameLetter(p))) {
        newErrors.nombre = 'El nombre parece inválido (letras repetidas). Captura el nombre real.';
      } else if (hasLowVariety(n)) {
        newErrors.nombre = 'El nombre parece inválido (relleno). Captura el nombre real.';
      } else {
        // evita "Juan X"
        const tokens = parts
          .map(p => stripAccents(p).toLowerCase().replace(/[^a-zñ]/g, ''))
          .filter(Boolean);

        if (tokens[1] && /^[a-zñ]$/.test(tokens[1])) {
          newErrors.nombre = 'Captura el apellido real (no se permite "X").';
        }
      }
    }
  }

  // ✅ Teléfono
  const telRaw = (telefono || '').trim();
  const digits = telRaw.replace(/\D/g, '');
  if (!digits) {
    newErrors.telefono = 'Por favor ingresa el número de teléfono.';
  } else if (digits.length < 10) {
    newErrors.telefono = 'El teléfono debe ser un numero valido.';
  }

  // ✅ Tipo de servicio
  if (!tipoServicio) {
    newErrors.tipoServicio = 'Selecciona el tipo de servicio.';
  }

  // ✅ Abogado obligatorio (con o sin cita)
if (!abogadoPreferido) {
  newErrors.abogado = 'Selecciona un abogado.';
}


  setErrors(newErrors);

  return !newErrors.nombre && !newErrors.telefono && !newErrors.tipoServicio && !newErrors.abogado;

};


  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje('');

    if (!validate()) return;

    try {
      const abogadoAsignadoNum = abogadoPreferido !== '' ? Number(abogadoPreferido) : null;


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
        setErrors({ nombre:'', telefono: '', tipoServicio: '', abogado: '' });

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
            className={`form-control ${errors.nombre ? 'is-invalid' : ''}`}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
          {errors.nombre && <div className="invalid-feedback">{errors.nombre}</div>}
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

              <input
                type="checkbox"
                checked={tipoServicio === 'Presupuesto'}
                onChange={() => setTipoServicio('Presupuesto')}
              />
              <label>Presupuesto</label>


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

          <div className="form-group mt-2">
  <label>
    {tieneCita ? 'Abogado con el que tiene cita' : 'Selecciona abogado'}{' '}
    <span style={{ color: '#d00' }}>*</span>
  </label>

  <select
    className={`form-control ${errors.abogado ? 'is-invalid' : ''}`}
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

  {errors.abogado && <div className="invalid-feedback">{errors.abogado}</div>}
</div>

        </div>

        <button type="submit" className="btn btn-primary">Registrar cliente</button>
      </form>

      {mensaje && <p className="mt-3">{mensaje}</p>}
    </div>
  );
}
