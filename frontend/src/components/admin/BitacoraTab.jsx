// frontend/src/components/admin/BitacoraTab.jsx
// Bitácora global de auditoría: quién hizo qué, cuándo, y desde qué IP.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../../auth/AuthContext";
import API_URL from "../../api";
import { fmtFechaHora } from "../custodia/custodiaConstants";

const ACCION_LABEL = {
  LOGIN_OK: "Inicio de sesión",
  LOGIN_FALLIDO: "Inicio de sesión fallido",
  CREAR_RECIBO: "Crear recibo",
  CANCELAR_RECIBO: "Cancelar recibo",
  CREAR_PRESUPUESTO: "Crear presupuesto",
  EDITAR_PRESUPUESTO: "Editar presupuesto",
  ELIMINAR_PRESUPUESTO: "Eliminar presupuesto",
  CREAR_ESCRITURA: "Tomar número de Escritura",
  EDITAR_ESCRITURA: "Editar Escritura",
  ELIMINAR_ESCRITURA: "Eliminar Escritura",
  CREAR_PROTOCOLITO: "Tomar número de Protocolito",
  EDITAR_PROTOCOLITO: "Editar Protocolito",
  ELIMINAR_PROTOCOLITO: "Eliminar Protocolito",
  CREAR_CLIENTE: "Registrar cliente",
  CREAR_DATOS_GENERALES: "Crear datos generales",
  EDITAR_DATOS_GENERALES: "Editar datos generales",
  ELIMINAR_DATOS_GENERALES: "Eliminar datos generales",
  CREAR_USUARIO: "Crear usuario",
  EDITAR_USUARIO: "Editar usuario",
  CAMBIAR_PASSWORD: "Cambiar contraseña",
  EDITAR_PERMISOS: "Editar permisos",
  ASIGNAR_SALA: "Asignar sala",
  LIBERAR_SALA: "Liberar sala",
};

export default function BitacoraTab() {
  const { token } = useAuth();
  const authCfg = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [acciones, setAcciones] = useState([]);

  const [usuario, setUsuario] = useState("");
  const [accion, setAccion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [q, setQ] = useState("");
  const limit = 50;

  useEffect(() => {
    axios
      .get(`${API_URL}/bitacora/acciones`, authCfg)
      .then(({ data }) => setAcciones(Array.isArray(data?.acciones) ? data.acciones : []))
      .catch(() => setAcciones([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/bitacora`, {
        ...authCfg,
        params: {
          usuario: usuario || undefined,
          accion: accion || undefined,
          desde: desde || undefined,
          hasta: hasta || undefined,
          q: q || undefined,
          page,
          limit,
        },
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(data?.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, accion, desde, hasta, q, page]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  useEffect(() => setPage(1), [usuario, accion, desde, hasta, q]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <div className="panel-admin-toolbar">
        <input
          placeholder="Usuario (nombre o ID)…"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          style={{ width: 200 }}
        />
        <select value={accion} onChange={(e) => setAccion(e.target.value)}>
          <option value="">Todas las acciones</option>
          {acciones.map((a) => (
            <option key={a} value={a}>
              {ACCION_LABEL[a] || a}
            </option>
          ))}
        </select>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <input
          placeholder="Buscar en el detalle…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 220 }}
        />
      </div>

      <div className="panel-admin-table-wrap">
        <table className="panel-admin-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>IP</th>
              <th>Acción</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ev) => (
              <tr key={ev._id}>
                <td>{fmtFechaHora(ev.createdAt)}</td>
                <td>{ev.usuarioNombre || "Desconocido"}</td>
                <td className="panel-admin-ip">{ev.ip || "—"}</td>
                <td>{ACCION_LABEL[ev.accion] || ev.accion}</td>
                <td>{ev.detalle || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && <div className="panel-admin-empty">Sin movimientos.</div>}
        {loading && <div className="panel-admin-empty">Cargando…</div>}
      </div>

      {totalPages > 1 && (
        <div className="panel-admin-pager">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <span>
            Página {page} de {totalPages} ({total} movimientos)
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </button>
        </div>
      )}
    </>
  );
}
