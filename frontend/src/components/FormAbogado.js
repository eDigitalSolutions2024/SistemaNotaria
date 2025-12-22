// src/components/FormAbogado.jsx
import React, { useEffect, useMemo, useState } from 'react';
import API_URL from '../api';
import { useAuth } from '../auth/AuthContext';

// Header con token (si existe)
const authHeader = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export default function FormAbogado() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  /* ---------- Crear abogado ---------- */
  const [nombre, setNombre] = useState('');
  const [turno, setTurno] = useState('');
  const [mensaje, setMensaje] = useState('');

  /* ---------- Listado/edición ---------- */
  const [listLoading, setListLoading] = useState(false);
  const [abogados, setAbogados] = useState([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);

  // Campos editables
  const [eNombre, setENombre] = useState('');
  const [eOrden, setEOrden] = useState('');
  const [eDisponible, setEDisponible] = useState(true);
  const [eUbicacion, setEUbicacion] = useState('sin sala');
  const [eRole, setERole] = useState('user');

  // 🔹 Nuevo: abogado jefe (solo para asistentes)
  const [eAbogadoJefe, setEAbogadoJefe] = useState('');

  // Password
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [savingData, setSavingData] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const fetchAbogados = async () => {
    setListLoading(true);
    try {
      const res = await fetch(`${API_URL}/abogados`, {
        headers: { 'Content-Type': 'application/json', ...authHeader() },
      });
      const data = await res.json();
      setAbogados(Array.isArray(data) ? data : data?.abogados || []);
    } catch {
      // ignore
    } finally {
      setListLoading(false);
    }
  };

  // Hook siempre declarado; solo actúa si es admin
  useEffect(() => {
    if (!isAdmin) return;
    fetchAbogados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return abogados;
    return abogados.filter(a =>
      String(a?.nombre || '').toLowerCase().includes(s) ||
      String(a?._id || '').includes(s)
    );
  }, [abogados, q]);

  // 🔹 Lista de abogados con rol "ABOGADO" para asignar como responsables
  const abogadosSoloAbogados = useMemo(
    () => abogados.filter(a => a.role === 'ABOGADO'),
    [abogados]
  );

  // 🔹 Asistentes que tienen como jefe al seleccionado (si es abogado)
  const asistentesDeSeleccionado = useMemo(() => {
    if (!selected?._id) return [];
    return abogados.filter(
      a =>
        a.role === 'ASISTENTE' &&
        a.abogadoJefe != null &&
        String(a.abogadoJefe) === String(selected._id)
    );
  }, [abogados, selected]);

  const pickForEdit = (a) => {
    setSelected(a);
    setENombre(a?.nombre || '');
    setEOrden(a?.orden ?? '');
    setEDisponible(Boolean(a?.disponible ?? true));
    setEUbicacion(a?.ubicacion || 'sin sala');
    setERole(a?.role || 'user');
    setEAbogadoJefe(a?.abogadoJefe ?? '');
    setPwd1('');
    setPwd2('');
    setMensaje('');
  };

  /* ---------- Crear abogado ---------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje('');
    try {
      const res = await fetch(`${API_URL}/abogados`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ nombre, orden: turno }),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje(`✅ Abogado registrado con éxito: ${data.abogado?.nombre || nombre}`);
        setNombre('');
        setTurno('');
        if (isAdmin) fetchAbogados();
      } else {
        setMensaje(`❌ Error: ${data?.mensaje || 'No se pudo registrar'}`);
      }
    } catch {
      setMensaje('⚠️ Error al conectar con el servidor');
    }
  };

  /* ---------- Guardar datos ---------- */
  const saveData = async () => {
    if (!selected?._id) return;
    setSavingData(true);
    setMensaje('');
    try {
      const payload = {
        nombre: eNombre,
        orden: Number(eOrden),
        disponible: Boolean(eDisponible),
        ubicacion: eUbicacion,
        role: eRole,
      };

      // 🔹 Si el usuario es ASISTENTE, enviamos su abogado responsable
      if (eRole === 'ASISTENTE') {
        payload.abogadoJefe = eAbogadoJefe ? Number(eAbogadoJefe) : null;
      } else {
        // Otros roles no deben tener abogado jefe
        payload.abogadoJefe = null;
      }

      const res = await fetch(`${API_URL}/abogados/${selected._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje('✅ Datos actualizados');
        await fetchAbogados();
        const updated = (Array.isArray(abogados) ? abogados : []).find(
          x => String(x._id) === String(selected._id)
        );
        if (updated) pickForEdit(updated);
      } else {
        setMensaje(`❌ Error al actualizar: ${data?.mensaje || 'Operación inválida'}`);
      }
    } catch {
      setMensaje('⚠️ Error al conectar con el servidor');
    } finally {
      setSavingData(false);
    }
  };

  /* ---------- Guardar contraseña ---------- */
  const savePassword = async () => {
    if (!selected?._id) return;
    if (!pwd1 || pwd1 !== pwd2) {
      setMensaje('❌ Las contraseñas no coinciden');
      return;
    }
    setSavingPwd(true);
    setMensaje('');
    try {
      const res = await fetch(`${API_URL}/abogados/${selected._id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ password: pwd1 }),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje('✅ Contraseña actualizada');
        setPwd1('');
        setPwd2('');
      } else {
        setMensaje(`❌ Error al actualizar contraseña: ${data?.mensaje || 'Operación inválida'}`);
      }
    } catch {
      setMensaje('⚠️ Error al conectar con el servidor');
    } finally {
      setSavingPwd(false);
    }
  };

  /* ---------- Render ---------- */
  return (
    <div className="container mt-4 formulario-clientes">
      {!isAdmin ? (
        <>
          <h2>Permiso requerido</h2>
          <p>Solo un administrador puede acceder a este módulo.</p>
        </>
      ) : (
        <>
          <h2>Formulario para registrar abogado</h2>

          {/* Alta */}
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

          <hr className="my-4" />

          {/* Edición / Password */}
          <h3>Editar abogado / Asignar contraseña</h3>

          <div className="form-group" style={{ maxWidth: 520 }}>
            <label>Buscar abogado (por nombre o ID):</label>
            <input
              type="text"
              className="form-control input-text"
              placeholder="Escribe para filtrar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ maxWidth: 520 }}>
            <label>Selecciona un abogado:</label>
            <select
              className="form-control input-text"
              disabled={listLoading || filtered.length === 0}
              value={selected?._id ?? ''}
              onChange={(e) => {
                const a = filtered.find(x => String(x._id) === e.target.value);
                if (a) pickForEdit(a);
                else setSelected(null);
              }}
            >
              <option value="">— Seleccionar —</option>
              {filtered.map(a => (
                <option key={a._id} value={a._id}>
                  {a._id} — {a.nombre}
                </option>
              ))}
            </select>
            {listLoading && <small>Cargando abogados…</small>}
          </div>

          {selected && (
            <div className="row" style={{ maxWidth: 920 }}>
              <div className="col-md-6">
                <h5 className="mt-3">Datos</h5>

                <div className="form-group">
                  <label>Nombre:</label>
                  <input
                    type="text"
                    className="form-control input-text"
                    value={eNombre}
                    onChange={(e) => setENombre(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Orden de turno:</label>
                  <input
                    type="number"
                    className="form-control input-text"
                    value={eOrden}
                    onChange={(e) => setEOrden(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Ubicación:</label>
                  <input
                    type="text"
                    className="form-control input-text"
                    value={eUbicacion}
                    onChange={(e) => setEUbicacion(e.target.value)}
                    placeholder="sin sala / Sala 1 / Sala 2 …"
                  />
                </div>

                <div className="form-group">
                  <label className="mr-2">Disponible:</label>
                  <input
                    type="checkbox"
                    checked={eDisponible}
                    onChange={(e) => setEDisponible(e.target.checked)}
                  />{' '}
                  <span className="ml-2">{eDisponible ? 'Sí' : 'No'}</span>
                </div>

                <div className="form-group">
                  <label>Rol:</label>
                  <select
                    className="form-control input-text"
                    value={eRole}
                    onChange={(e) => setERole(e.target.value)}
                  >
                    <option value="ADMIN">Administrador</option>
                    <option value="ABOGADO">Abogado</option>
                    <option value="ASISTENTE">Asistente Legal</option>
                    <option value="PROTOCOLITO">Protocolito</option>
                    <option value="RECEPCION">Recepción</option>
                  </select>
                </div>

                {/* Asignar abogado responsable cuando el usuario es ASISTENTE */}
                {eRole === 'ASISTENTE' && (
                  <div className="form-group">
                    <label>Abogado responsable:</label>
                    <select
                      className="form-control input-text"
                      value={eAbogadoJefe ?? ''}
                      onChange={(e) => setEAbogadoJefe(e.target.value)}
                    >
                      <option value="">— Sin asignar —</option>
                      {abogadosSoloAbogados.map(a => (
                        <option key={a._id} value={a._id}>
                          {a._id} — {a.nombre}
                        </option>
                      ))}
                    </select>
                    <small className="form-text text-muted">
                      Este abogado será el responsable en Protocolito y en los reportes de este asistente.
                    </small>
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  disabled={savingData}
                  onClick={saveData}
                >
                  {savingData ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>

              <div className="col-md-6">
                <h5 className="mt-3">Asignar/Actualizar contraseña</h5>

                <div className="form-group">
                  <label>Nueva contraseña:</label>
                  <input
                    type="password"
                    className="form-control input-text"
                    value={pwd1}
                    onChange={(e) => setPwd1(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Confirmar contraseña:</label>
                  <input
                    type="password"
                    className="form-control input-text"
                    value={pwd2}
                    onChange={(e) => setPwd2(e.target.value)}
                  />
                </div>

                <button
                  className="btn btn-secondary"
                  disabled={savingPwd}
                  onClick={savePassword}
                >
                  {savingPwd ? 'Actualizando…' : 'Actualizar contraseña'}
                </button>

                {/* Si el seleccionado es ABOGADO, mostrar sus asistentes */}
                {selected?.role === 'ABOGADO' && (
                  <div className="mt-4">
                    <h5>Asistentes asignados a este abogado</h5>
                    {asistentesDeSeleccionado.length === 0 ? (
                      <p className="text-muted">No hay asistentes asignados aún.</p>
                    ) : (
                      <ul>
                        {asistentesDeSeleccionado.map(a => (
                          <li key={a._id}>
                            {a._id} — {a.nombre}
                          </li>
                        ))}
                      </ul>
                    )}
                    <small className="form-text text-muted">
                      Para cambiar los asistentes, edita cada usuario con rol ASISTENTE y asigna su abogado responsable.
                    </small>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {mensaje && <p className="mt-3" id="mensaje">{mensaje}</p>}
    </div>
  );
}
