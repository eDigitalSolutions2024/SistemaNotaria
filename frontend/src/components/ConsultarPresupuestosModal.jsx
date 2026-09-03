import React, { useEffect, useMemo, useState } from "react";

export default function ConsultarPresupuestosModal({
  open,
  onClose,
  api,
  clienteIdNumber, // si tu backend filtra por idCliente numérico
  onPick,
  isAdmin = false, // "Cargar" (= editar) solo lo puede hacer un administrador
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);

  // Popup password
  const [askPwd, setAskPwd] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [pendingPick, setPendingPick] = useState(null);

  // Historial de versiones (solo aparece si el presupuesto ya fue editado)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPresupuesto, setHistoryPresupuesto] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);

  const limit = 15;
  const baseURL = useMemo(() => api.defaults.baseURL.replace(/\/$/, ""), [api.defaults.baseURL]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setErr("");

      // ✅ Ajusta params según tu backend
      const params = { page, limit };

      // filtro por cliente (numérico) si lo soportas
      if (clienteIdNumber) params.idCliente = clienteIdNumber;

      // búsqueda general
      if (debouncedQ.trim()) params.q = debouncedQ.trim();

      const res = await api.get("/presupuestos", { params });

      // soporta ambos formatos: {items: []} o []
      const data = res.data?.items || res.data || [];
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setErr("No se pudieron cargar los presupuestos");
    } finally {
      setLoading(false);
    }
  };

  // Búsqueda en tiempo real: espera a que el usuario deje de escribir
  // (400ms) antes de disparar la búsqueda, y regresa a la página 1.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  useEffect(() => {
    if (!open) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, debouncedQ]);

  // Enter en el campo de búsqueda: dispara al instante, sin esperar el debounce
  const searchNow = () => {
    setDebouncedQ(q);
    setPage(1);
  };

  if (!open) return null;

  const openPasswordPrompt = (p) => {
    setPendingPick(p);
    setPwd("");
    setPwdErr("");
    setAskPwd(true);
  };

  const confirmPasswordAndPick = () => {
    // ✅ contraseña fija
    const MASTER = "Not17cdj";

    if (pwd !== MASTER) {
      setPwdErr("Contraseña incorrecta");
      return;
    }

    setAskPwd(false);
    if (onPick && pendingPick) onPick(pendingPick);
    setPendingPick(null);
  };

  // "Ver PDF": si el presupuesto nunca se editó, abre el PDF directo (igual
  // que siempre). Si tiene historial, muestra un modal para elegir cuál ver
  // (actual, o cualquier versión anterior/posterior a una edición puntual).
  const verPdf = async (p) => {
    try {
      const res = await api.get(`/presupuestos/${p._id}/versiones`);
      const versiones = res.data?.data || [];
      if (!versiones.length) {
        window.open(`${baseURL}/presupuestos/${p._id}/pdf`, "_blank");
        return;
      }
      setHistoryPresupuesto(p);
      setHistoryItems(versiones);
      setHistoryOpen(true);
    } catch (e) {
      console.error(e);
      window.open(`${baseURL}/presupuestos/${p._id}/pdf`, "_blank");
    }
  };

  return (
    <div className="pres-modal-backdrop" onMouseDown={onClose}>
      <div className="pres-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pres-modal-header">
          <h3>Consultar presupuestos</h3>
          <button type="button" className="pres-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="pres-modal-toolbar">
          <input
            type="text"
            placeholder="Buscar por cliente, idCliente, trámite o ID..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchNow();
            }}
          />
          <button
            type="button"
            className="pres-btn"
            onClick={searchNow}
            disabled={loading}
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {err && <div className="pres-alert pres-alert-error">{err}</div>}

        <div className="pres-modal-body">
          <table className="pres-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Trámite</th>
                <th>Total</th>
                <th style={{ width: 240 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Cargando...</td>
                </tr>
              ) : items.length ? (
                items.map((p) => (
                  <tr key={p._id}>
                    <td>{new Date(p.createdAt || p.fecha).toLocaleDateString("es-MX")}</td>
                    <td>
                      {p.cliente?.idCliente ? `${p.cliente.idCliente} - ` : ""}
                      {p.cliente?.nombre || p.nombreCliente || "(sin nombre)"}
                    </td>
                    <td>{p.tipoTramite || "-"}</td>
                    <td>
                      {(Number(p.totalPresupuesto) || 0).toLocaleString("es-MX", {
                        style: "currency",
                        currency: "MXN",
                      })}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="pres-btn"
                        onClick={() => verPdf(p)}
                      >
                        Ver PDF
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          className="pres-btn-primary"
                          onClick={() => openPasswordPrompt(p)}
                          style={{ marginLeft: 8 }}
                          title="Editar este presupuesto (requiere contraseña)"
                        >
                          Cargar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No hay presupuestos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pres-modal-footer">
          <button
            type="button"
            className="pres-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            ◀
          </button>
          <span>Página {page}</span>
          <button
            type="button"
            className="pres-btn"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading}
          >
            ▶
          </button>
        </div>

        {/* ✅ Popup Password */}
        {askPwd && (
          <div
            className="pres-modal-backdrop"
            onMouseDown={() => setAskPwd(false)}
            style={{ zIndex: 10000 }}
          >
            <div
              className="pres-modal"
              onMouseDown={(e) => e.stopPropagation()}
              style={{ width: "min(520px, 95vw)" }}
            >
              <div className="pres-modal-header">
                <h3>Confirmación</h3>
                <button type="button" className="pres-btn" onClick={() => setAskPwd(false)}>
                  Cerrar
                </button>
              </div>

              <div style={{ padding: 12 }}>
                <p style={{ marginTop: 0 }}>
                  Para <b>Cargar</b> este presupuesto al formulario, ingresa la contraseña.
                </p>

                <div className="pres-field" style={{ maxWidth: 420 }}>
                  <label>Contraseña</label>
                  <input
                    type="password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    placeholder="********"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmPasswordAndPick();
                    }}
                  />
                </div>

                {pwdErr && (
                  <div className="pres-alert pres-alert-error" style={{ marginTop: 10 }}>
                    {pwdErr}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                  <button type="button" className="pres-btn" onClick={() => setAskPwd(false)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="pres-btn-primary"
                    onClick={confirmPasswordAndPick}
                    disabled={!pwd}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 📜 Historial de versiones — solo aparece si el presupuesto ya se editó */}
        {historyOpen && (
          <div
            className="pres-modal-backdrop"
            onMouseDown={() => setHistoryOpen(false)}
            style={{ zIndex: 10000 }}
          >
            <div
              className="pres-modal"
              onMouseDown={(e) => e.stopPropagation()}
              style={{ width: "min(680px, 95vw)" }}
            >
              <div className="pres-modal-header">
                <h3>Historial de cambios</h3>
                <button type="button" className="pres-btn" onClick={() => setHistoryOpen(false)}>
                  Cerrar
                </button>
              </div>

              <div style={{ padding: 12, maxHeight: "70vh", overflowY: "auto" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    marginBottom: 10,
                  }}
                >
                  <span><b>Versión actual</b></span>
                  <button
                    type="button"
                    className="pres-btn"
                    onClick={() =>
                      window.open(`${baseURL}/presupuestos/${historyPresupuesto._id}/pdf`, "_blank")
                    }
                  >
                    Ver PDF
                  </button>
                </div>

                {historyItems.map((v) => (
                  <div
                    key={v._id}
                    style={{
                      padding: "10px 12px",
                      border: "1px solid #eee",
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
                      {new Date(v.fecha || v.createdAt).toLocaleString("es-MX")}
                    </div>
                    <div style={{ marginBottom: 4 }}>
                      <b>Motivo:</b> {v.motivo || "-"}
                    </div>
                    <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
                      Solicitado por: <b>{v.solicitanteNombre || "-"}</b> · Modificado por:{" "}
                      <b>{v.modificadoPorNombre || "-"}</b>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="pres-btn"
                        onClick={() =>
                          window.open(
                            `${baseURL}/presupuestos/${historyPresupuesto._id}/versiones/${v._id}/pdf?tipo=anterior`,
                            "_blank"
                          )
                        }
                      >
                        Ver antes
                      </button>
                      {v.versionNueva ? (
                        <button
                          type="button"
                          className="pres-btn"
                          onClick={() =>
                            window.open(
                              `${baseURL}/presupuestos/${historyPresupuesto._id}/versiones/${v._id}/pdf?tipo=nueva`,
                              "_blank"
                            )
                          }
                        >
                          Ver después
                        </button>
                      ) : (
                        <span style={{ fontSize: 13, color: "#a00", alignSelf: "center" }}>
                          Eliminado
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
