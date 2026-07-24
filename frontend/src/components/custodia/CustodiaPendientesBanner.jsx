// frontend/src/components/custodia/CustodiaPendientesBanner.jsx
// Aviso siempre visible mientras el usuario tenga trámites entregados por
// recepción esperando su confirmación. Vive en MainPage, arriba del
// contenido, para que nadie pueda decir luego "no lo vi".
import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../../auth/AuthContext";
import { fmtFechaHora } from "./custodiaConstants";
import "./custodia.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:8010/api";

export default function CustodiaPendientesBanner() {
  const { token, user } = useAuth();
  const authCfg = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const role = String(user?.role || "").toUpperCase();

  const [items, setItems] = useState([]);
  const [expandido, setExpandido] = useState(false);
  const [busyId, setBusyId] = useState("");

  const puedeConfirmar = ["ABOGADO", "ASISTENTE", "ADMIN"].includes(role);

  const cargar = useCallback(async () => {
    if (!token || !puedeConfirmar) return;
    try {
      const { data } = await axios.get(`${API}/custodia/pendientes`, authCfg);
      setItems(Array.isArray(data?.data) ? data.data : []);
    } catch {
      // silencioso: el banner simplemente no aparece si falla
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, puedeConfirmar]);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 5 * 60 * 1000); // refresco cada 5 min
    return () => clearInterval(id);
  }, [cargar]);

  const confirmar = async (item) => {
    const key = `${item.tipoTramite}-${item.control}`;
    setBusyId(key);
    try {
      await axios.post(`${API}/custodia/${item.tipoTramite}/${item.control}/confirmar`, {}, authCfg);
      setItems((prev) => prev.filter((i) => !(i.tipoTramite === item.tipoTramite && i.control === item.control)));
    } catch {
      // deja el item en la lista; el usuario puede reintentar
    } finally {
      setBusyId("");
    }
  };

  if (!puedeConfirmar || items.length === 0) return null;

  return (
    <div className="custodia-banner">
      <div className="custodia-banner-head" onClick={() => setExpandido((v) => !v)}>
        <span>
          ⚠️ Tienes <b>{items.length}</b> trámite{items.length === 1 ? "" : "s"} que recepción marcó como
          entregado{items.length === 1 ? "" : "s"} y esperan tu confirmación
        </span>
        <span className="custodia-banner-toggle">{expandido ? "Ocultar" : "Ver"}</span>
      </div>

      {expandido && (
        <ul className="custodia-banner-list">
          {items.map((it) => {
            const key = `${it.tipoTramite}-${it.control}`;
            return (
              <li key={key}>
                <span>
                  <b>{it.tipoTramite}</b> #{it.control} — {it.cliente || "sin cliente"}
                  <br />
                  <small>
                    Entregado por {it.custodia?.actualizadoPor || "recepción"} el{" "}
                    {fmtFechaHora(it.custodia?.actualizadoEn)}
                  </small>
                </span>
                <button disabled={busyId === key} onClick={() => confirmar(it)}>
                  {busyId === key ? "Confirmando…" : "Confirmo que lo recibí"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
