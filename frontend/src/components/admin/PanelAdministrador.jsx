// frontend/src/components/admin/PanelAdministrador.jsx
// Panel de administrador: usuarios + candados/permisos especiales, y la
// bitácora global de auditoría (quién hizo qué, cuándo, desde qué IP).
import React, { useState } from "react";
import UsuariosCandados from "./UsuariosCandados";
import BitacoraTab from "./BitacoraTab";
import SistemaTab from "./SistemaTab";
import "./panelAdmin.css";

export default function PanelAdministrador() {
  const [tab, setTab] = useState("usuarios"); // 'usuarios' | 'bitacora'

  return (
    <div className="panel-admin">
      <h2>Panel de administrador</h2>
      <div className="panel-admin-tabs">
        <button className={tab === "usuarios" ? "active" : ""} onClick={() => setTab("usuarios")}>
          Usuarios y candados
        </button>
        <button className={tab === "bitacora" ? "active" : ""} onClick={() => setTab("bitacora")}>
          Bitácora
        </button>
        <button className={tab === "sistema" ? "active" : ""} onClick={() => setTab("sistema")}>
          Sistema
        </button>
      </div>

      {tab === "usuarios" ? <UsuariosCandados /> : tab === "bitacora" ? <BitacoraTab /> : <SistemaTab />}
    </div>
  );
}
