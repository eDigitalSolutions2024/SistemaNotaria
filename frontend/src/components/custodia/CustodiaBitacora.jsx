// frontend/src/components/custodia/CustodiaBitacora.jsx
// Pantalla dedicada: estado actual de custodia de todos los trámites, y el
// historial completo (bitácora) de movimientos, con filtros.
import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../../auth/AuthContext";
import CustodiaControl from "./CustodiaControl";
import { ACCION_LABEL, estadoInfo, fmtFechaHora } from "./custodiaConstants";
import "./custodia.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:8010/api";

export default function CustodiaBitacora() {
  const { token } = useAuth();
  const authCfg = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [tab, setTab] = useState("actual"); // 'actual' | 'historial'

  return (
    <div className="custodia-bitacora">
      <h2>Custodia de documentos</h2>
      <div className="custodia-bitacora-tabs">
        <button className={tab === "actual" ? "active" : ""} onClick={() => setTab("actual")}>
          Estado actual
        </button>
        <button className={tab === "historial" ? "active" : ""} onClick={() => setTab("historial")}>
          Historial completo
        </button>
      </div>

      {tab === "actual" ? <EstadoActual authCfg={authCfg} /> : <Historial authCfg={authCfg} />}
    </div>
  );
}

function EstadoActual({ authCfg }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipoTramite, setTipoTramite] = useState("Protocolito");
  const [estado, setEstado] = useState("");
  const [q, setQ] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/custodia/estado-actual`, {
        ...authCfg,
        params: { tipoTramite: tipoTramite || undefined, estado: estado || undefined, q: q || undefined },
      });
      setItems(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoTramite, estado, q]);

  useEffect(() => {
    const t = setTimeout(cargar, 250); // debounce por el buscador
    return () => clearTimeout(t);
  }, [cargar]);

  return (
    <>
      <div className="custodia-bitacora-toolbar">
        <select value={tipoTramite} onChange={(e) => setTipoTramite(e.target.value)}>
          <option value="Protocolito">Protocolito</option>
          <option value="Escritura">Escritura</option>
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="CON_ABOGADO">Con abogado</option>
          <option value="ENVIADO_A_RECEPCION">Enviado a recepción</option>
          <option value="EN_RECEPCION">En recepción</option>
          <option value="ENTREGADO_PENDIENTE_CONFIRMACION">Pendiente de confirmar</option>
        </select>
        <input
          placeholder="Buscar por cliente, abogado o número…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 260 }}
        />
      </div>

      <div className="custodia-table-wrap">
        <table className="custodia-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>#</th>
              <th>Cliente</th>
              <th>Abogado asignado</th>
              <th>Estado</th>
              <th>Última actualización</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const info = estadoInfo(it.custodia?.estado);
              return (
                <tr key={`${it.tipoTramite}-${it.control}`}>
                  <td>{it.tipoTramite}</td>
                  <td>#{it.control}</td>
                  <td>{it.cliente || "—"}</td>
                  <td>{it.abogadoAsignado || "—"}</td>
                  <td>
                    <span style={{ color: info.color, fontWeight: 700 }}>{info.label}</span>
                    {it.custodia?.estado === "ENTREGADO_PENDIENTE_CONFIRMACION" && it.custodia?.abogadoNombre && (
                      <div style={{ fontSize: "0.8rem", color: "#6b7390" }}>{it.custodia.abogadoNombre}</div>
                    )}
                  </td>
                  <td style={{ fontSize: "0.85rem", color: "#6b7390" }}>
                    {it.custodia?.actualizadoPor ? `${it.custodia.actualizadoPor} · ` : ""}
                    {fmtFechaHora(it.custodia?.actualizadoEn)}
                  </td>
                  <td>
                    <CustodiaControl
                      tipoTramite={it.tipoTramite}
                      control={it.control}
                      custodia={it.custodia}
                      abogadoAsignado={it.abogadoAsignado}
                      compact
                      onChanged={(nueva) =>
                        setItems((prev) =>
                          prev.map((p) =>
                            p.tipoTramite === it.tipoTramite && p.control === it.control
                              ? { ...p, custodia: nueva }
                              : p
                          )
                        )
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && items.length === 0 && <div className="custodia-empty">Sin resultados.</div>}
        {loading && <div className="custodia-empty">Cargando…</div>}
      </div>
    </>
  );
}

function Historial({ authCfg }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tipoTramite, setTipoTramite] = useState("Protocolito");
  const [control, setControl] = useState("");
  const [accion, setAccion] = useState("");
  const limit = 50;

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/custodia/eventos`, {
        ...authCfg,
        params: {
          tipoTramite: tipoTramite || undefined,
          control: control || undefined,
          accion: accion || undefined,
          page,
          limit,
        },
      });
      setItems(data?.data?.items || []);
      setTotal(data?.data?.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoTramite, control, accion, page]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  useEffect(() => setPage(1), [tipoTramite, control, accion]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <div className="custodia-bitacora-toolbar">
        <select value={tipoTramite} onChange={(e) => setTipoTramite(e.target.value)}>
          <option value="Protocolito">Protocolito</option>
          <option value="Escritura">Escritura</option>
        </select>
        <input
          placeholder="# de trámite"
          value={control}
          onChange={(e) => setControl(e.target.value)}
          style={{ width: 140 }}
        />
        <select value={accion} onChange={(e) => setAccion(e.target.value)}>
          <option value="">Todas las acciones</option>
          {Object.entries(ACCION_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="custodia-table-wrap">
        <table className="custodia-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>#</th>
              <th>Acción</th>
              <th>De</th>
              <th>Para</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ev) => (
              <tr key={ev._id}>
                <td>{fmtFechaHora(ev.createdAt)}</td>
                <td>{ev.tipoTramite}</td>
                <td>#{ev.control}</td>
                <td>{ACCION_LABEL[ev.accion] || ev.accion}</td>
                <td>{ev.deUsuarioNombre || "—"}</td>
                <td>{ev.paraUsuarioNombre || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && <div className="custodia-empty">Sin movimientos.</div>}
        {loading && <div className="custodia-empty">Cargando…</div>}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </button>
        </div>
      )}
    </>
  );
}
