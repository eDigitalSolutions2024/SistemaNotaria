import React, { useEffect, useMemo, useState } from "react";

export default function ConsultarPresupuestosModal({
  open,
  onClose,
  api,
  clienteIdNumber, // si tu backend filtra por idCliente numérico
  onPick,
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);

  // Popup password
  const [askPwd, setAskPwd] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [pendingPick, setPendingPick] = useState(null);

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
      if (q.trim()) params.q = q.trim();

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

  useEffect(() => {
    if (!open) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page]);

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
          />
          <button
            type="button"
            className="pres-btn"
            onClick={() => {
              setPage(1);
              fetchData();
            }}
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
                        onClick={() => window.open(`${baseURL}/presupuestos/${p._id}/pdf`, "_blank")}
                      >
                        Ver PDF
                      </button>

                      <button
                        type="button"
                        className="pres-btn-primary"
                        onClick={() => openPasswordPrompt(p)}
                        style={{ marginLeft: 8 }}
                        title="Cargar al formulario (requiere contraseña)"
                      >
                        Cargar
                      </button>
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

      </div>
    </div>
  );
}
