// frontend/src/components/custodia/custodiaConstants.js
export const ESTADOS = {
  CON_ABOGADO: { label: "Con abogado", color: "#475569", bg: "#eef1f5" },
  ENVIADO_A_RECEPCION: { label: "Enviado a recepción", color: "#b45f06", bg: "#fff1e0" },
  EN_RECEPCION: { label: "En recepción", color: "#1d4ed8", bg: "#e6ecff" },
  ENTREGADO_PENDIENTE_CONFIRMACION: { label: "Pendiente de confirmar", color: "#b91c1c", bg: "#fde2e2" },
};

export const ACCION_LABEL = {
  ENVIADO_A_RECEPCION: "Enviado a recepción",
  RECIBIDO_EN_RECEPCION: "Recibido en recepción",
  ENTREGADO_A_ABOGADO: "Entregado a abogado",
  CONFIRMADO_POR_ABOGADO: "Confirmado por abogado",
};

export function estadoInfo(estado) {
  return ESTADOS[estado] || ESTADOS.CON_ABOGADO;
}

export function fmtFechaHora(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
