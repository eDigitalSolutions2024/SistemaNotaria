// frontend/src/components/anuncios/anunciosConstants.js
// Debe reflejar Backend/models/Abogado.js (ROLES) — lista fija, no cambia
// con datos, así que se hardcodea aquí igual que en otras pantallas del
// sistema (p.ej. custodia.js) en vez de pedirla al backend.
export const ROLES = ['ADMIN', 'ABOGADO', 'ASISTENTE', 'PROTOCOLITO', 'RECEPCION'];

export const URGENCIA_LABEL = {
  NORMAL: 'Aviso',
  URGENTE: 'Urgente',
};

export function fmtFechaHora(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
