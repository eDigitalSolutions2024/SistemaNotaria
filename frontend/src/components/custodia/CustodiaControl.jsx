// frontend/src/components/custodia/CustodiaControl.jsx
// Celda de acción para las tablas de Escrituras/Protocolito: muestra el
// estado actual de custodia del expediente y, según el rol del usuario y el
// estado, el botón de la siguiente acción del flujo.
import React, { useMemo, useState } from "react";
import axios from "axios";
import { Button, Chip, CircularProgress } from "@mui/material";
import { useAuth } from "../../auth/AuthContext";
import { estadoInfo } from "./custodiaConstants";

const API = process.env.REACT_APP_API_URL || "http://localhost:8010/api";

export default function CustodiaControl({ tipoTramite, control, custodia, abogadoAsignado, onChanged, compact }) {
  const { token, user } = useAuth();
  const authCfg = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const role = String(user?.role || "").toUpperCase();
  const userId = Number(user?.id ?? user?._id);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const estado = custodia?.estado || "CON_ABOGADO";
  const info = estadoInfo(estado);

  const esAbogadoLike = ["ABOGADO", "ASISTENTE", "ADMIN"].includes(role);
  const esRecepcionLike = ["RECEPCION", "ADMIN"].includes(role);
  const esDestinatario = custodia?.abogadoId != null && Number(custodia.abogadoId) === userId;

  async function ejecutar(accion, body) {
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.post(
        `${API}/custodia/${tipoTramite}/${control}/${accion}`,
        body || {},
        authCfg
      );
      if (data?.ok) {
        onChanged?.(data.data.custodia);
      } else {
        setError(data?.msg || "No se pudo actualizar");
      }
    } catch (e) {
      setError(e?.response?.data?.msg || "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  }

  // Botones que aplican al estado actual — pueden ser varios a la vez
  // (p.ej. ADMIN ve tanto "Enviar" como "Marcar recibido" en CON_ABOGADO).
  const botones = [];

  if (estado === "CON_ABOGADO" && esAbogadoLike) {
    botones.push(
      <Button key="enviar" size="small" variant="outlined" onClick={() => ejecutar("enviar")}>
        Enviar a recepción
      </Button>
    );
  }

  if (estado === "ENVIADO_A_RECEPCION" && esRecepcionLike) {
    botones.push(
      <Button key="recibir" size="small" variant="outlined" onClick={() => ejecutar("recibir")}>
        Marcar recibido
      </Button>
    );
  }

  if (estado === "EN_RECEPCION" && esRecepcionLike) {
    // No hay a quién elegir: siempre se regresa al abogado que el propio
    // trámite tiene asignado (el backend lo resuelve solo).
    botones.push(
      <Button key="entregar" size="small" variant="outlined" onClick={() => ejecutar("entregar")}>
        {abogadoAsignado ? `Entregar a ${abogadoAsignado}` : "Entregar al abogado"}
      </Button>
    );
  }

  if (estado === "ENTREGADO_PENDIENTE_CONFIRMACION" && (esDestinatario || role === "ADMIN")) {
    botones.push(
      <Button key="confirmar" size="small" variant="contained" color="warning" onClick={() => ejecutar("confirmar")}>
        Confirmo que lo recibí
      </Button>
    );
  }

  const accionBoton = busy ? <CircularProgress size={16} /> : botones;

  return (
    <div style={{ display: "flex", flexDirection: compact ? "row" : "column", alignItems: compact ? "center" : "flex-start", gap: 6 }}>
      <Chip
        label={
          estado === "ENTREGADO_PENDIENTE_CONFIRMACION" && custodia?.abogadoNombre
            ? `${info.label} · ${custodia.abogadoNombre}`
            : info.label
        }
        size="small"
        style={{ backgroundColor: info.bg, color: info.color, fontWeight: 700 }}
      />
      {accionBoton}
      {error && <small style={{ color: "#b91c1c" }}>{error}</small>}
    </div>
  );
}
