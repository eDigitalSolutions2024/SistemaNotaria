// components/admin/SistemaTab.jsx
// Mantenimiento: forzar a todos los navegadores conectados a recargar el
// sistema (útil justo después de un despliegue).
import React, { useState } from "react";
import axios from "axios";
import { Button } from "@mui/material";
import { useAuth } from "../../auth/AuthContext";

const API = process.env.REACT_APP_API_URL || "http://localhost:8010/api";

export default function SistemaTab() {
  const { token } = useAuth();
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const forzar = async () => {
    if (!window.confirm("¿Pedir a TODOS los usuarios conectados que actualicen el sistema? Verán una cuenta regresiva de 30 segundos y se recargará su pantalla.")) return;
    setEnviando(true); setMsg(""); setError("");
    try {
      const { data } = await axios.post(
        `${API}/sistema/forzar-actualizacion`,
        { segundos: 30 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMsg(`Aviso enviado a ${data.conectados} navegador(es) conectado(s).`);
    } catch (e) {
      setError(e?.response?.data?.msg || "No se pudo enviar el aviso.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ padding: "16px 4px", maxWidth: 640 }}>
      <h3 style={{ marginTop: 0 }}>Actualizar el sistema en todas las computadoras</h3>
      <p style={{ color: "#475569" }}>
        Después de publicar una versión nueva, cada computadora detecta sola el cambio y muestra
        una barra para actualizar. Si necesitas que todos actualicen ahora mismo, usa este botón:
        verán una cuenta regresiva de 30 segundos y su pantalla se recargará sola.
      </p>
      <Button variant="contained" color="warning" onClick={forzar} disabled={enviando}>
        {enviando ? "Enviando…" : "Forzar actualización a todos"}
      </Button>
      {msg && <p style={{ color: "#166534" }}>{msg}</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
    </div>
  );
}
