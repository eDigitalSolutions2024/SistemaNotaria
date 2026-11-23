// frontend/src/components/admin/UsuariosCandados.jsx
// Lista de usuarios del sistema con sus candados/permisos especiales,
// gestionables sin tocar código (reemplaza las excepciones que antes
// vivían hardcodeadas por nombre o por _id en el código).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../../auth/AuthContext";
import API_URL from "../../api";

const CANDADOS = [
  { clave: "recibosMontoBajo", label: "Recibos menores a $100" },
  { clave: "escriturasVistaTotal", label: "Ver todas las Escrituras" },
  { clave: "cancelarFolios", label: "Cancelar folios (Escrituras)" },
];

function roleBadgeClass(role) {
  const r = String(role || "").toUpperCase();
  if (r === "ADMIN") return "panel-admin-role-badge admin";
  if (r === "RECEPCION") return "panel-admin-role-badge recepcion";
  return "panel-admin-role-badge";
}

export default function UsuariosCandados() {
  const { token } = useAuth();
  const authCfg = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [guardandoId, setGuardandoId] = useState(null);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/abogados`, authCfg);
      setUsuarios(Array.isArray(data) ? data : []);
    } catch {
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return usuarios;
    return usuarios.filter(
      (u) =>
        String(u.nombre || "").toLowerCase().includes(term) ||
        String(u._id || "").includes(term) ||
        String(u.role || "").toLowerCase().includes(term)
    );
  }, [usuarios, q]);

  const togglePermiso = async (usuario, clave, valorActual) => {
    setError("");
    setGuardandoId(usuario._id);
    const nuevoValor = !valorActual;
    try {
      const { data } = await axios.patch(
        `${API_URL}/abogados/${usuario._id}/permisos`,
        { [clave]: nuevoValor },
        authCfg
      );
      setUsuarios((prev) =>
        prev.map((u) => (u._id === usuario._id ? { ...u, permisosEspeciales: data.abogado.permisosEspeciales } : u))
      );
    } catch (err) {
      setError(err.response?.data?.mensaje || "No se pudo actualizar el permiso.");
    } finally {
      setGuardandoId(null);
    }
  };

  return (
    <>
      <div className="panel-admin-toolbar">
        <input
          placeholder="Buscar por nombre, ID o rol…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 280 }}
        />
      </div>

      {error && (
        <div style={{ color: "#b91c1c", marginBottom: 10, fontSize: "0.88rem" }}>{error}</div>
      )}

      <div className="panel-admin-table-wrap">
        <table className="panel-admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Disponible</th>
              <th>Candados / permisos especiales</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((u) => {
              const permisos = u.permisosEspeciales || {};
              return (
                <tr key={u._id}>
                  <td>{u._id}</td>
                  <td>{u.nombre}</td>
                  <td>
                    <span className={roleBadgeClass(u.role)}>{u.role}</span>
                  </td>
                  <td>{u.disponible ? "Sí" : "No"}</td>
                  <td>
                    {CANDADOS.map((c) => (
                      <label key={c.clave} className="panel-admin-switch">
                        <input
                          type="checkbox"
                          checked={!!permisos[c.clave]}
                          disabled={guardandoId === u._id}
                          onChange={() => togglePermiso(u, c.clave, !!permisos[c.clave])}
                        />
                        {c.label}
                      </label>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && filtrados.length === 0 && <div className="panel-admin-empty">Sin usuarios.</div>}
        {loading && <div className="panel-admin-empty">Cargando…</div>}
      </div>
    </>
  );
}
